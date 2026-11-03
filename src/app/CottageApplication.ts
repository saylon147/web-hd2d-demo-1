import { Color, DirectionalLight, HemisphereLight, PerspectiveCamera, Scene, Vector3, MathUtils } from 'three';
import type { WebGLRenderer } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { parseCottageManifest, parseCottagePreset } from '../config/cottageCandidate';
import type { CottageManifest, CottagePreset } from '../config/cottageCandidate';
import { createRenderer } from '../core/renderer';
import { disposeCottageCandidate, loadCottageCandidate } from '../world/cottageCandidate';
import { createShell } from './shell';
import type { AppShell } from './shell';

const views = ['front', 'back', 'left', 'right', 'top', 'oblique', 'bottom'] as const;
type View = typeof views[number];
const names: Record<View, string> = { front: '正面', back: '背面', left: '左侧', right: '右侧', top: '俯视', oblique: '斜上方', bottom: '底部' };

export class CottageApplication {
  private shell: AppShell;
  private events = new AbortController();
  private scene = new Scene();
  private renderer: WebGLRenderer | undefined;
  private camera: PerspectiveCamera | undefined;
  private controls: OrbitControls | undefined;
  private resizeObserver: ResizeObserver | undefined;
  private model: Awaited<ReturnType<typeof loadCottageCandidate>> | undefined;
  private preset: CottagePreset | undefined;
  private manifest: CottageManifest | undefined;
  private sun: DirectionalLight | undefined;
  private inspectionFill: DirectionalLight | undefined;
  private view: View = 'oblique';
  private fixedView = true;
  private frame = 0;
  private disposed = false;

  constructor(root: HTMLElement) {
    this.shell = createShell(root, false);
    const heading = this.shell.viewport.querySelector<HTMLElement>('.scene-heading')!;
    heading.querySelector('h1')!.textContent = 'Cottage Candidate 01';
    heading.querySelector('.eyebrow')!.textContent = 'M2.4 / P0 + P1';
    heading.querySelector('.placeholder-badge')!.textContent = 'Tripo 原始 HD · 待人工审核';
    root.querySelector('.milestone')!.textContent = 'M2.4 · 独立资产检查';
    this.shell.modeNote.textContent = '正在读取本地小屋；首次加载需解码 HD 模型…';
    this.shell.debugPanel.hidden = true; this.shell.debugToggle.hidden = true;
    this.shell.viewport.setAttribute('aria-label', '独立小屋模型检查');
    this.shell.canvas.setAttribute('aria-label', 'Cottage Candidate 01：拖动旋转，滚轮缩放，右键平移');
    this.shell.viewport.querySelector('.axis-legend')!.textContent = '源坐标 +Y 上 · 归一化单位 · 朝向待检查';
    this.shell.viewControls.innerHTML = views.map((view) => `<button type="button" data-cottage-view="${view}" aria-pressed="false">${names[view]}</button>`).join('') +
      '<label>背景 <select id="cottage-background"><option value="neutral">中性</option><option value="warm">暖色</option></select></label><button id="cottage-fill" type="button" aria-pressed="false">底部检查补光</button><label>展示旋转 <input id="cottage-yaw" type="range" min="-180" max="180" step="5" value="0" aria-label="展示旋转角度"></label><label>展示缩放 <select id="cottage-scale"><option value="0.75">0.75×</option><option value="1" selected>1×</option><option value="1.25">1.25×</option></select></label><a href="./">返回默认场景 ↗</a>';
    this.shell.viewControls.classList.add('tripo-controls');
    root.querySelector('.app-shell')!.classList.add('tripo-shell', 'cottage-shell');
    this.shell.viewport.before(this.shell.viewControls);
    const stage = document.createElement('div'); stage.className = 'cottage-stage';
    this.shell.viewport.before(stage); stage.append(heading, this.shell.viewport);
    const queryView = new URLSearchParams(location.search).get('view');
    this.view = views.find((v) => v === queryView) ?? 'oblique';
    for (const control of this.shell.viewControls.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>('input,button,select')) control.disabled = true;
    void this.initialize().catch((error: unknown) => this.fail(error));
  }
  private async json(url: string): Promise<unknown> {
    const response = await fetch(url, { signal: this.events.signal });
    if (!response.ok) throw new Error(`小屋检查配置不可用（HTTP ${response.status}）：${url}`);
    return response.json() as Promise<unknown>;
  }
  private async initialize(): Promise<void> {
    this.renderer = createRenderer(this.shell.canvas);
    this.preset = parseCottagePreset(await this.json('/assets/presets/cottage-candidate-01.json'));
    this.manifest = parseCottageManifest(await this.json(this.preset.manifestUrl));
    this.camera = new PerspectiveCamera(this.preset.fov, 1, 0.005, 100);
    this.controls = new OrbitControls(this.camera, this.shell.canvas);
    this.controls.enableDamping = false; this.controls.minDistance = 0.12; this.controls.maxDistance = 12;
    this.controls.addEventListener('change', this.requestRender);
    this.controls.addEventListener('start', this.freeView);
    const l = this.manifest.lighting;
    this.renderer.toneMappingExposure = l.exposure;
    this.scene.add(new HemisphereLight('#fffaf0', '#abb8b9', l.hemisphere));
    this.sun = new DirectionalLight('#fff7e9', l.sun); this.sun.position.set(...l.sunPosition);
    this.sun.castShadow = true; this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 0.5; this.sun.shadow.camera.far = 60;
    this.scene.add(this.sun, this.sun.target);
    this.inspectionFill = new DirectionalLight('#ffffff', 1.8); this.inspectionFill.position.set(4, -6, 3); this.inspectionFill.visible = false;
    this.scene.add(this.inspectionFill);
    const model = await loadCottageCandidate(this.manifest, this.events.signal);
    if (this.disposed) { disposeCottageCandidate(model.root); return; }
    this.model = model; this.scene.add(model.root);
    const radius = model.size.length() / 2;
    Object.assign(this.sun.shadow.camera, { left: -radius * 2, right: radius * 2, top: radius * 2, bottom: -radius * 2 });
    this.sun.target.position.set(0, model.size.y / 2, 0);
    this.sun.shadow.normalBias = model.size.y * 0.003;
    const signal = this.events.signal;
    for (const button of this.shell.viewControls.querySelectorAll<HTMLButtonElement>('[data-cottage-view]')) button.addEventListener('click', () => {
      this.view = views.find((v) => v === button.dataset.cottageView) ?? 'oblique'; this.setView();
    }, { signal });
    this.shell.resetButton.addEventListener('click', () => this.setView(), { signal });
    this.shell.viewControls.querySelector('#cottage-background')!.addEventListener('change', this.setBackground, { signal });
    this.shell.viewControls.querySelector('#cottage-fill')!.addEventListener('click', () => {
      if (!this.inspectionFill) return;
      this.inspectionFill.visible = !this.inspectionFill.visible;
      this.shell.viewControls.querySelector('#cottage-fill')!.setAttribute('aria-pressed', String(this.inspectionFill.visible));
      this.requestRender();
    }, { signal });
    this.shell.viewControls.querySelector<HTMLInputElement>('#cottage-yaw')!.addEventListener('input', () => {
      if (!this.model) return;
      this.model.root.rotation.y = MathUtils.degToRad(Number(this.shell.viewControls.querySelector<HTMLInputElement>('#cottage-yaw')!.value));
      this.freeView(); this.requestRender();
    }, { signal });
    this.shell.viewControls.querySelector('#cottage-scale')!.addEventListener('change', () => {
      this.model?.root.scale.setScalar(Number(this.shell.viewControls.querySelector<HTMLSelectElement>('#cottage-scale')!.value)); this.freeView(); this.requestRender();
    }, { signal });
    this.shell.canvas.addEventListener('webglcontextlost', (event) => { event.preventDefault(); this.fail(new Error('WebGL 上下文丢失。请重新加载查看页。')); }, { signal });
    this.resizeObserver = new ResizeObserver(this.resize); this.resizeObserver.observe(this.shell.viewport);
    this.shell.metrics.textContent = `${(this.manifest.fileBytes / 1048576).toFixed(2)} MiB · 原始 GLB\n${this.manifest.nodeCount} 节点 / ${model.audit.meshes} Mesh / ${model.audit.materials.length} 材质\n${model.audit.vertices.toLocaleString()} 顶点\n${model.audit.triangles.toLocaleString()} 三角面\n尺寸 XYZ（源单位）\n${model.size.toArray().map((x) => x.toFixed(6)).join(' × ')}\n中心 ${this.manifest.spatial.center.map((x) => x.toFixed(6)).join(', ')}\n3 张 4096 × 4096 贴图\nBase Color / RM / Normal\nsRGB 色彩 · 线性数据贴图`;
    this.shell.modeNote.textContent = '拖动绕看，滚轮缩放，右键平移。固定机位与重置恢复 1× 展示。';
    this.shell.viewport.parentElement!.querySelector('.placeholder-badge')!.textContent = '原始 HD · 未校准岛屿尺度 · 待审核';
    this.shell.viewport.querySelector('.axis-legend')!.textContent = `源 +Y 上 · 正面 yaw ${this.preset.frontYawDegrees}° · 原始单位`;
    for (const control of this.shell.viewControls.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>('input,button,select')) control.disabled = false;
    this.shell.canvas.dataset.scene = 'cottage-candidate-01';
    this.shell.canvas.dataset.audit = JSON.stringify(model.audit);
    this.shell.canvas.dataset.loaded = 'true';
    this.setBackground(); this.resize();
  }
  private setBackground = (): void => {
    if (!this.preset) return;
    const background = this.shell.viewControls.querySelector<HTMLSelectElement>('#cottage-background')!.value === 'warm' ? 'warm' : 'neutral';
    this.scene.background = new Color(this.preset.backgrounds[background]);
    this.shell.canvas.dataset.background = background; this.requestRender();
  };
  private freeView = (): void => {
    this.fixedView = false;
    for (const button of this.shell.viewControls.querySelectorAll('[data-cottage-view]')) button.setAttribute('aria-pressed', 'false');
  };
  private setView(): void {
    if (!this.camera || !this.controls || !this.model || !this.preset) return;
    this.model.root.rotation.set(0, 0, 0); this.model.root.scale.setScalar(1);
    this.shell.viewControls.querySelector<HTMLInputElement>('#cottage-yaw')!.value = '0';
    this.shell.viewControls.querySelector<HTMLSelectElement>('#cottage-scale')!.value = '1';
    this.controls.target.set(0, this.model.size.y / 2, 0);
    const yawOffset = { front: 0, back: 180, left: -90, right: 90, top: 0, oblique: 35, bottom: 0 }[this.view];
    const yaw = MathUtils.degToRad(this.preset.frontYawDegrees + yawOffset);
    const pitch = MathUtils.degToRad(this.view === 'top' ? 89.99 : this.view === 'bottom' ? -89.99 : this.view === 'oblique' ? 25 : 0);
    const direction = new Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    const right = new Vector3().crossVectors(this.camera.up, direction).normalize();
    const up = new Vector3().crossVectors(direction, right);
    const tanVertical = Math.tan(MathUtils.degToRad(this.camera.fov / 2)), tanHorizontal = tanVertical * this.camera.aspect;
    // Fit all eight source AABB corners against both FOVs, including perspective depth.
    let distance = 0;
    const half = this.model.size.clone().multiplyScalar(0.5);
    for (const x of [-half.x, half.x]) for (const y of [-half.y, half.y]) for (const z of [-half.z, half.z]) {
      const corner = new Vector3(x, y, z), depth = corner.dot(direction);
      distance = Math.max(distance, depth + Math.abs(corner.dot(right)) / tanHorizontal, depth + Math.abs(corner.dot(up)) / tanVertical);
    }
    this.camera.position.copy(this.controls.target).add(direction.multiplyScalar(distance * this.preset.viewPadding));
    this.controls.update(); this.fixedView = true;
    for (const button of this.shell.viewControls.querySelectorAll<HTMLButtonElement>('[data-cottage-view]')) button.setAttribute('aria-pressed', String(button.dataset.cottageView === this.view));
    const url = new URL(location.href); url.searchParams.set('view', this.view); history.replaceState(null, '', url);
    this.requestRender();
  }
  private resize = (): void => {
    if (!this.renderer || !this.camera || !this.model) return;
    const width = this.shell.viewport.clientWidth, height = this.shell.viewport.clientHeight;
    if (!width || !height) return;
    this.renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1)); this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height; this.camera.updateProjectionMatrix();
    if (this.fixedView) this.setView(); else this.requestRender();
  };
  private requestRender = (): void => {
    if (this.disposed || !this.model || this.frame) return;
    this.shell.canvas.dataset.rendered = 'false';
    this.frame = requestAnimationFrame(this.render);
  };
  private render = (): void => {
    this.frame = 0;
    if (this.disposed || !this.renderer || !this.camera || !this.controls || !this.model) return;
    try {
      this.renderer.render(this.scene, this.camera);
      this.shell.canvas.dataset.rendered = 'true';
      this.shell.canvas.dataset.view = this.fixedView ? this.view : 'free';
      this.shell.canvas.dataset.camera = JSON.stringify({ position: this.camera.position.toArray(), target: this.controls.target.toArray(), fov: this.camera.fov, aspect: this.camera.aspect, near: this.camera.near, far: this.camera.far });
      this.shell.canvas.dataset.displayTransform = JSON.stringify({ yaw: this.model.root.rotation.y, scale: this.model.root.scale.x });
      this.shell.canvas.dataset.inspectionFill = String(this.inspectionFill?.visible ?? false);
      this.shell.status.textContent = 'WebGL2 · HD 小屋已载入'; this.shell.status.classList.add('is-ready');
      this.shell.readout.textContent = `${this.fixedView ? names[this.view] : '自由观察'} · FOV ${this.camera.fov}° · 距离 ${this.camera.position.distanceTo(this.controls.target).toFixed(3)}`;
    } catch (error: unknown) { this.fail(error); }
  };
  private fail(error: unknown): void {
    if (this.disposed) return;
    this.shell.canvas.dataset.loaded = 'false'; this.shell.canvas.dataset.rendered = 'false';
    this.shell.error.hidden = false; this.shell.error.textContent = error instanceof Error ? error.message : String(error);
    this.shell.status.textContent = '小屋检查不可用'; this.shell.status.classList.add('is-error');
    this.shell.resetButton.disabled = true;
    for (const control of this.shell.viewControls.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>('input,button,select')) control.disabled = true;
    this.dispose();
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; cancelAnimationFrame(this.frame); this.events.abort(); this.resizeObserver?.disconnect();
    this.controls?.dispose(); if (this.model) disposeCottageCandidate(this.model.root);
    this.sun?.dispose(); this.inspectionFill?.dispose(); this.renderer?.dispose(); this.scene.clear();
  }
}
