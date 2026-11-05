import { PerspectiveCamera, Vector3, MathUtils } from 'three';
import type { WebGLRenderer } from 'three';
import { createShell } from './shell';
import type { AppShell } from './shell';
import { createRenderer } from '../core/renderer';
import { disposeObject } from '../core/dispose';
import { createBlockoutWorld } from '../world/blockout';
import type { BlockoutWorld } from '../world/blockout';
import { COASTAL_MANIFEST_URL, COASTAL_PRESET_URL, parseCoastalManifest, parseCoastalPreset } from '../config/coastal';
import { loadCoastalModules } from '../world/coastal';
import type { CoastalLoaded } from '../world/coastal';
import { parseCottageManifest } from '../config/cottageCandidate';
import type { CottageManifest } from '../config/cottageCandidate';
import { COTTAGE_COMPARISON_VIEWS, parseCottageComparisonPreset } from '../config/cottageComparison';
import type { CottageComparisonCamera, CottageComparisonPreset, CottageComparisonView, CottageVariant } from '../config/cottageComparison';
import { disposeCottageCandidate, loadCottageCandidate } from '../world/cottageCandidate';
import { CottageComparison } from '../world/cottageComparison';

const names: Record<CottageComparisonView, string> = { golden: 'Golden 全景', house: '小屋固定近景', front: '房屋正面', back: '房屋背面', left: '左侧', right: '右侧', 'contact-front': '入口与地形', 'contact-back': '背侧与基础', top: '占地俯视' };
export class CottageComparisonApplication {
  private shell: AppShell;
  private events = new AbortController();
  private renderer: WebGLRenderer | undefined;
  private world: BlockoutWorld | undefined;
  private modules: CoastalLoaded | undefined;
  private comparison: CottageComparison | undefined;
  private preset: CottageComparisonPreset | undefined;
  private manifest: CottageManifest | undefined;
  private golden: CottageComparisonCamera | undefined;
  private camera: PerspectiveCamera | undefined;
  private observer: ResizeObserver | undefined;
  private loadingCandidate: Promise<void> | undefined;
  private view: CottageComparisonView;
  private variant: CottageVariant = 'A';
  private selection = 0;
  private frame = 0;
  private disposed = false;
  constructor(root: HTMLElement) {
    this.shell = createShell(root, false);
    const query = new URLSearchParams(location.search);
    this.view = COTTAGE_COMPARISON_VIEWS.find((v) => v === query.get('view')) ?? 'golden';
    root.querySelector('.app-shell')!.classList.add('tripo-shell', 'coastal-shell', 'cottage-comparison-shell');
    root.querySelector('.milestone')!.textContent = 'M2.4 · P2 A/B 验证';
    this.shell.viewport.querySelector('h1')!.textContent = '小屋 A/B 对照';
    this.shell.viewport.querySelector('.eyebrow')!.textContent = 'COTTAGE CANDIDATE 01 / P2';
    this.shell.viewport.querySelector('.placeholder-badge')!.textContent = '原始 HD 候选 · 待人工审核';
    this.shell.viewport.setAttribute('aria-label', '同一岛屿、相机、光照下的小屋 A/B 对照');
    this.shell.canvas.setAttribute('aria-label', '固定相机的小屋 A/B 场景');
    this.shell.viewControls.innerHTML = '<label>小屋 <select id="cottage-variant"><option value="A">A · 原默认小屋</option><option value="B">B · Tripo Candidate 01</option></select></label>' + COTTAGE_COMPARISON_VIEWS.map((v) => `<button type="button" data-cottage-p2-view="${v}">${names[v]}</button>`).join('') + '<a href="?scene=cottage-candidate-01">独立模型查看 ↗</a><a href="./">返回默认场景 ↗</a>';
    this.shell.viewControls.classList.add('tripo-controls'); this.shell.viewport.before(this.shell.viewControls);
    this.shell.debugPanel.hidden = true; this.shell.debugToggle.hidden = true;
    this.shell.viewport.querySelector('.axis-legend')!.textContent = '+Y 上 · 门朝 +Z · 1 unit = 1 m';
    root.querySelector('.control-hints')!.textContent = '固定机位 · 切换 A/B 保持相机、环境与光照';
    for (const c of this.shell.viewControls.querySelectorAll<HTMLSelectElement | HTMLButtonElement>('select,button')) c.disabled = true;
    void this.initialize(query.get('cottage') === 'B' ? 'B' : 'A').catch((error: unknown) => this.fatal(error));
  }
  private async json(url: string): Promise<unknown> { const r = await fetch(url, { signal: this.events.signal }); if (!r.ok) throw new Error(`P2 配置不可用（HTTP ${r.status}）：${url}`); return r.json() as Promise<unknown>; }
  private async initialize(initial: CottageVariant): Promise<void> {
    this.renderer = createRenderer(this.shell.canvas);
    this.preset = parseCottageComparisonPreset(await this.json('/assets/presets/cottage-candidate-01-p2.json'));
    this.manifest = parseCottageManifest(await this.json(this.preset.manifestUrl));
    const coastalManifest = parseCoastalManifest(await this.json(COASTAL_MANIFEST_URL));
    const coastalPreset = parseCoastalPreset(await this.json(COASTAL_PRESET_URL), coastalManifest);
    const world = await createBlockoutWorld(this.events.signal);
    if (this.disposed) { world.dispose(); return; } this.world = world;
    this.renderer.toneMappingExposure = coastalPreset.lighting.exposure;
    for (const name of coastalPreset.hiddenBaselineDecorations) { const n = world.scene.getObjectByName(name); if (n) n.visible = false; }
    const modules = await loadCoastalModules(coastalManifest, coastalPreset.placements, this.preset.coastalLod, this.events.signal);
    if (this.disposed) { disposeObject(modules.root); return; } this.modules = modules; world.scene.add(modules.root);
    this.comparison = new CottageComparison(world.scene, this.manifest, this.preset);
    const state = coastalPreset.cameraViews.golden, yaw = MathUtils.degToRad(state.baseYaw + state.yawOffset), pitch = MathUtils.degToRad(state.pitch);
    const target = new Vector3(state.target.x, state.target.y, state.target.z);
    this.golden = { position: target.clone().add(new Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(state.distance)).toArray(), target: target.toArray(), fov: state.fov };
    this.shell.canvas.dataset.scene = 'cottage-ab'; this.shell.canvas.dataset.environment = JSON.stringify(this.comparison.environment());
    const signal = this.events.signal;
    for (const button of this.shell.viewControls.querySelectorAll<HTMLButtonElement>('[data-cottage-p2-view]')) button.addEventListener('click', () => { this.view = COTTAGE_COMPARISON_VIEWS.find((v) => v === button.dataset.cottageP2View) ?? 'golden'; this.setCamera(); }, { signal });
    this.shell.viewControls.querySelector('#cottage-variant')!.addEventListener('change', () => { void this.selectVariant(this.variantSelect().value === 'B' ? 'B' : 'A'); }, { signal });
    this.shell.resetButton.addEventListener('click', () => this.setCamera(), { signal });
    this.shell.canvas.addEventListener('webglcontextlost', (event) => { event.preventDefault(); this.fatal(new Error('WebGL 上下文丢失，请重新加载。')); }, { signal });
    this.observer = new ResizeObserver(this.resize); this.observer.observe(this.shell.viewport);
    for (const c of this.shell.viewControls.querySelectorAll<HTMLSelectElement | HTMLButtonElement>('select,button')) c.disabled = false;
    this.setCamera(); await this.selectVariant(initial);
  }
  private variantSelect(): HTMLSelectElement { return this.shell.viewControls.querySelector<HTMLSelectElement>('#cottage-variant')!; }
  private async selectVariant(variant: CottageVariant): Promise<void> {
    if (!this.comparison || !this.preset || !this.manifest || !this.world) return;
    const selection = ++this.selection;
    this.shell.error.hidden = true; this.variantSelect().value = variant;
    if (variant === 'B') {
      this.shell.status.textContent = '正在读取 Tripo 原始 HD 小屋…'; this.shell.canvas.dataset.loaded = 'false';
      try {
        this.loadingCandidate ??= loadCottageCandidate(this.manifest, this.events.signal).then((model) => {
          if (this.disposed) { disposeCottageCandidate(model.root); return; }
          try { this.comparison!.install(model); } catch (error: unknown) { disposeCottageCandidate(model.root); throw error; }
        }).catch((error: unknown) => { this.loadingCandidate = undefined; throw error; });
        await this.loadingCandidate;
      } catch (error: unknown) {
        if (this.disposed || selection !== this.selection) return;
        this.comparison.setVariant('A'); this.variant = 'A'; this.variantSelect().value = 'A';
        this.shell.error.textContent = `${error instanceof Error ? error.message : String(error)} 原默认小屋 A 已恢复。`;
        this.shell.error.hidden = false; this.publish(); return;
      }
    }
    if (this.disposed || selection !== this.selection) return;
    this.comparison.setVariant(variant); this.variant = variant; this.publish();
  }
  private publish(): void {
    if (!this.comparison || !this.manifest) return;
    this.shell.canvas.dataset.loaded = 'true'; this.shell.canvas.dataset.cottageVariant = this.variant;
    this.shell.canvas.dataset.alignment = JSON.stringify(this.comparison.summary());
    this.shell.modeNote.textContent = `${this.variant === 'A' ? '原默认程序化小屋' : 'Tripo Cottage Candidate 01'} · 同一岛屿 / 相机 / 光照`;
    const summary = this.comparison;
    this.shell.metrics.textContent = `原占地 6 × 6 m · 入口朝 +Z\nB 统一缩放 ${summary.scale.toFixed(6)}\nB 位置 ${summary.position.toArray().map((v) => v.toFixed(3)).join(', ')}\n原 GLB ${(this.manifest.fileBytes / 1048576).toFixed(2)} MiB\nP2 审图 · 不作性能验收`;
    const url = new URL(location.href); url.searchParams.set('cottage', this.variant); url.searchParams.set('view', this.view); history.replaceState(null, '', url);
    this.requestRender();
  }
  private setCamera(): void {
    if (!this.preset || !this.golden) return;
    const spec = this.view === 'golden' ? this.golden : this.preset.cameras[this.view];
    this.camera = new PerspectiveCamera(spec.fov, 1, 0.1, 100); this.camera.position.set(...spec.position); this.camera.lookAt(new Vector3(...spec.target)); this.camera.updateMatrixWorld(true);
    this.shell.canvas.dataset.view = this.view;
    for (const b of this.shell.viewControls.querySelectorAll<HTMLButtonElement>('[data-cottage-p2-view]')) b.setAttribute('aria-pressed', String(b.dataset.cottageP2View === this.view));
    const url = new URL(location.href); url.searchParams.set('view', this.view); history.replaceState(null, '', url); this.resize();
  }
  private resize = (): void => {
    if (!this.renderer || !this.camera) return;
    const width = this.shell.viewport.clientWidth, height = this.shell.viewport.clientHeight; if (!width || !height) return;
    this.renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1)); this.renderer.setSize(width, height, false); this.camera.aspect = width / height; this.camera.updateProjectionMatrix(); this.requestRender();
  };
  private requestRender = (): void => { if (this.disposed || !this.world || !this.camera || this.frame) return; this.shell.canvas.dataset.rendered = 'false'; this.frame = requestAnimationFrame(this.render); };
  private render = (): void => {
    this.frame = 0; if (this.disposed || !this.renderer || !this.camera || !this.world) return;
    try {
      this.renderer.render(this.world.scene, this.camera); this.shell.canvas.dataset.rendered = 'true';
      this.shell.canvas.dataset.camera = JSON.stringify({ position: this.camera.position.toArray(), matrix: this.camera.matrixWorld.toArray(), projection: this.camera.projectionMatrix.toArray(), fov: this.camera.fov, aspect: this.camera.aspect, view: this.view });
      this.shell.status.textContent = `${this.variant} · WebGL2 · P2 固定机位`; this.shell.status.classList.add('is-ready'); this.shell.readout.textContent = `${names[this.view]} · FOV ${this.camera.fov}° · A/B 相机固定`;
    } catch (error: unknown) { this.fatal(error); }
  };
  private fatal(error: unknown): void { if (this.disposed) return; this.shell.error.hidden = false; this.shell.error.textContent = error instanceof Error ? error.message : String(error); this.shell.canvas.dataset.loaded = 'false'; this.shell.resetButton.disabled = true; for (const c of this.shell.viewControls.querySelectorAll<HTMLSelectElement | HTMLButtonElement>('select,button')) c.disabled = true; this.dispose(); }
  dispose(): void { if (this.disposed) return; this.disposed = true; cancelAnimationFrame(this.frame); this.events.abort(); this.observer?.disconnect(); this.comparison?.dispose(); if (this.modules) disposeObject(this.modules.root); this.world?.dispose(); this.renderer?.dispose(); }
}
