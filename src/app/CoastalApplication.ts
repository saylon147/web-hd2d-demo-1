import { Box3 } from 'three';
import type { WebGLRenderer } from 'three';
import { ConstrainedCamera } from '../camera/ConstrainedCamera';
import { COASTAL_ASSETS, COASTAL_LODS, COASTAL_MANIFEST_URL, COASTAL_MODES, COASTAL_PRESET_URL, COASTAL_VIEWS, coastalCameraProfile, parseCoastalManifest, parseCoastalPreset } from '../config/coastal';
import type { CoastalId, CoastalLod, CoastalManifest, CoastalMode, CoastalPreset, CoastalView } from '../config/coastal';
import { createRenderer } from '../core/renderer';
import { disposeObject } from '../core/dispose';
import { FrameMetrics } from '../core/frameMetrics';
import { createBlockoutWorld } from '../world/blockout';
import type { BlockoutWorld } from '../world/blockout';
import { loadCoastalModules } from '../world/coastal';
import type { CoastalLoaded } from '../world/coastal';
import { createShell } from './shell';
import type { AppShell } from './shell';
import { CoastalDiagnostics, diagnosticCamera, G01_PRESET_URL, G01_VIEWS, parseDiagnosticPreset } from '../world/coastalDiagnostics';
import type { DiagnosticPreset, G01View } from '../world/coastalDiagnostics';
import type { PerspectiveCamera } from 'three';

const labels: Record<CoastalView, string> = { golden: '全景', front: '近景', side: '侧面', back: '背面', corner: '转角', top: '顶部' };
export class CoastalApplication {
  private shell: AppShell;
  private events = new AbortController();
  private loading: AbortController | undefined;
  private renderer: WebGLRenderer | undefined;
  private world: BlockoutWorld | undefined;
  private manifest: CoastalManifest | undefined;
  private preset: CoastalPreset | undefined;
  private modules: CoastalLoaded | undefined;
  private camera: ConstrainedCamera | undefined;
  private observer: ResizeObserver | undefined;
  private samples = new FrameMetrics();
  private frame = 0;
  private previousFrame = 0;
  private disposed = false;
  private selection = 0;
  private mode: CoastalMode;
  private lod: CoastalLod;
  private asset: CoastalId;
  private view: CoastalView;
  private g01: boolean;
  private diagnosticPreset: DiagnosticPreset | undefined;
  private diagnostics: CoastalDiagnostics | undefined;
  private fixedCamera: PerspectiveCamera | undefined;
  private diagnosticView: G01View = 'golden';
  private overlay = 'off';
  private evidenceCamera = '';
  constructor(root: HTMLElement) {
    this.shell = createShell(root, false);
    const query = new URLSearchParams(location.search);
    this.g01 = query.get('diagnostic') === 'g01';
    this.diagnosticView = G01_VIEWS.find((v) => v === query.get('diagnosticView')) ?? 'golden';
    this.overlay = ['off', 'ids', 'terrain'].find((v) => v === query.get('overlay')) ?? 'off';
    this.mode = COASTAL_MODES.find((item) => item === query.get('mode')) ?? 'assembly';
    this.lod = COASTAL_LODS.find((item) => item === query.get('lod')) ?? '10k-1k';
    this.asset = COASTAL_ASSETS.find((item) => item === query.get('asset')) ?? 'A1';
    this.view = COASTAL_VIEWS.find((item) => item === query.get('view')) ?? 'golden';
    this.shell.viewport.parentElement!.classList.add('tripo-shell', 'coastal-shell');
    this.shell.viewport.querySelector('h1')!.textContent = '海岸模块拼装';
    this.shell.viewport.querySelector('.eyebrow')!.textContent = 'COASTAL ASSEMBLY / M2.2';
    this.shell.viewport.querySelector('.placeholder-badge')!.textContent = '局部实验 · 等待人工审查';
    this.shell.viewport.setAttribute('aria-label', 'M2.2 海岸岩石模块拼装实验');
    this.shell.viewControls.innerHTML = `<label>海岸 <select id="coastal-mode"><option value="baseline">M2.1 海岸</option><option value="assembly">Tripo 拼装</option><option value="module">单模块</option></select></label><label>模块 <select id="coastal-asset">${COASTAL_ASSETS.map((id) => `<option>${id}</option>`).join('')}</select></label><label>精度 <select id="coastal-lod"><option value="10k-1k">10k / 1K</option><option value="20k-2k">20k / 2K</option></select></label>${COASTAL_VIEWS.map((view) => `<button type="button" data-coastal-view="${view}">${labels[view]}</button>`).join('')}<a href="./">返回 M2.1 基线 ↗</a>`;
    this.shell.viewControls.classList.add('tripo-controls');
    if (this.g01) this.shell.viewControls.insertAdjacentHTML('beforeend', `<label>G01 固定视角 <select id="g01-view">${G01_VIEWS.map((v) => `<option>${v}</option>`).join('')}</select></label><label>诊断层 <select id="g01-overlay"><option value="off">关闭</option><option value="ids">ID / 轴 / 锚点 / AABB / 轮廓</option><option value="terrain">加地形线框与支撑探针</option></select></label>`);
    this.shell.viewport.before(this.shell.viewControls);
    this.shell.debugPanel.hidden = true; this.shell.debugToggle.hidden = true;
    void this.initialize().catch((error: unknown) => this.fail(error));
  }
  private async initialize(): Promise<void> {
    this.renderer = createRenderer(this.shell.canvas);
    const response = await fetch(COASTAL_MANIFEST_URL, { signal: this.events.signal });
    if (!response.ok) throw new Error('海岸资产清单缺失。请运行 npm run coastal:pipeline。');
    this.manifest = parseCoastalManifest(await response.json() as unknown);
    const preset = await fetch(COASTAL_PRESET_URL, { signal: this.events.signal });
    if (!preset.ok) throw new Error('海岸摆放配置缺失。');
    this.preset = parseCoastalPreset(await preset.json() as unknown, this.manifest);
    if (this.g01) {
      const response = await fetch(G01_PRESET_URL, { signal: this.events.signal });
      if (!response.ok) throw new Error('G01 诊断相机配置缺失');
      this.diagnosticPreset = parseDiagnosticPreset(await response.json() as unknown);
      this.select('#g01-view').value = this.diagnosticView; this.select('#g01-overlay').value = this.overlay;
    }
    this.world = await createBlockoutWorld(this.events.signal);
    if (this.disposed) { this.world.dispose(); return; }
    this.renderer.toneMappingExposure = this.preset.lighting.exposure;
    const signal = this.events.signal;
    for (const select of this.shell.viewControls.querySelectorAll<HTMLSelectElement>('select:not([id^="g01-"])')) select.addEventListener('change', () => {
      this.mode = COASTAL_MODES.find((item) => item === this.select('#coastal-mode').value) ?? 'assembly';
      this.lod = COASTAL_LODS.find((item) => item === this.select('#coastal-lod').value) ?? '10k-1k';
      this.asset = COASTAL_ASSETS.find((item) => item === this.select('#coastal-asset').value) ?? 'A1';
      void this.loadSelection().catch((error: unknown) => this.fail(error));
    }, { signal });
    if (this.g01) {
      this.select('#g01-view').addEventListener('change', () => {
        this.diagnosticView = G01_VIEWS.find((v) => v === this.select('#g01-view').value) ?? 'golden';
        this.setCamera(); this.syncQuery();
      }, { signal });
      this.select('#g01-overlay').addEventListener('change', () => {
        this.overlay = this.select('#g01-overlay').value;
        this.diagnostics?.setVisible(this.overlay !== 'off', this.overlay === 'terrain');
        this.shell.canvas.dataset.g01Overlay = this.overlay; this.shell.canvas.dataset.rendered = 'false'; this.syncQuery();
      }, { signal });
    }
    for (const button of this.shell.viewControls.querySelectorAll<HTMLButtonElement>('[data-coastal-view]')) button.addEventListener('click', () => {
      this.view = COASTAL_VIEWS.find((item) => item === button.dataset.coastalView) ?? 'golden';
      this.setCamera(); this.resetSamples(); this.syncQuery();
    }, { signal });
    this.shell.resetButton.addEventListener('click', () => { this.camera?.reset(); this.resetSamples(); }, { signal });
    this.shell.canvas.addEventListener('webglcontextlost', (event) => { event.preventDefault(); this.fail(new Error('WebGL 上下文丢失，请重新加载或返回基线。')); }, { signal });
    this.observer = new ResizeObserver(this.resize); this.observer.observe(this.shell.viewport);
    window.addEventListener('resize', this.resize, { signal });
    this.setCamera();
    this.frame = requestAnimationFrame(this.render);
    await this.loadSelection();
  }
  private select(selector: string): HTMLSelectElement { return this.shell.viewControls.querySelector<HTMLSelectElement>(selector)!; }
  private async loadSelection(): Promise<void> {
    if (!this.manifest || !this.preset || !this.world) return;
    const selection = ++this.selection;
    this.loading?.abort(); this.loading = new AbortController();
    this.shell.canvas.dataset.loaded = 'false';
    this.shell.canvas.dataset.rendered = 'false';
    this.evidenceCamera = '';
    this.diagnostics?.dispose(); this.diagnostics = undefined; delete this.shell.canvas.dataset.g01Report;
    if (this.modules) { disposeObject(this.modules.root); this.modules = undefined; }
    this.select('#coastal-mode').value = this.mode; this.select('#coastal-asset').value = this.asset; this.select('#coastal-lod').value = this.lod;
    this.select('#coastal-asset').disabled = this.mode !== 'module'; this.select('#coastal-lod').disabled = this.mode === 'baseline';
    const baseline = this.world.scene.getObjectByName('IslandRoot')!;
    baseline.visible = this.mode !== 'module';
    for (const name of this.preset.hiddenBaselineDecorations) {
      const node = this.world.scene.getObjectByName(name);
      if (node) node.visible = this.mode !== 'assembly';
    }
    if (this.mode !== 'baseline') {
      const placements = this.mode === 'assembly' ? this.preset.placements : [{ id: 'module-preview', asset: this.asset, position: [0, 0, 0] as [number, number, number], scale: [1, 1, 1] as [number, number, number], tint: [1, 1, 1] as [number, number, number], yaw: 0, embeddingM: 0.1 }];
      let loaded: CoastalLoaded;
      try { loaded = await loadCoastalModules(this.manifest, placements, this.lod, this.loading.signal); }
      catch (error: unknown) { if (this.disposed || selection !== this.selection) return; throw error; }
      if (this.disposed || selection !== this.selection) { disposeObject(loaded.root); return; }
      this.modules = loaded; this.world.scene.add(loaded.root);
      if (this.g01 && this.mode === 'assembly') {
        this.diagnostics = new CoastalDiagnostics(this.world.scene, loaded.root, this.preset.placements, this.shell.viewport);
        this.diagnostics.setVisible(this.overlay !== 'off', this.overlay === 'terrain');
        this.shell.canvas.dataset.g01Report = JSON.stringify(this.diagnostics.report);
      }
    }
    this.setCamera(); this.resetSamples(); this.syncQuery();
    const canvas = this.shell.canvas;
    canvas.dataset.scene = 'coastal-assembly'; canvas.dataset.loaded = 'true'; canvas.dataset.mode = this.mode; canvas.dataset.lod = this.lod; canvas.dataset.asset = this.asset;
    canvas.dataset.instanceCount = String(this.modules?.root.children.length ?? 0);
    canvas.dataset.assetIds = JSON.stringify(this.modules?.assetIds ?? []);
    canvas.dataset.worldBounds = JSON.stringify(this.modules?.root.children.map((item) => { const bounds = new Box3().setFromObject(item); return { id: item.name, min: bounds.min.toArray(), max: bounds.max.toArray() }; }) ?? []);
    const dimensions = this.manifest.assets.find((asset) => asset.id === this.asset)!.variants.find((item) => item.id === this.lod)!.dimensions;
    this.shell.metrics.textContent = this.mode === 'module' ? `${this.asset} · ${dimensions.map((n) => n.toFixed(2)).join(' × ')} m\n${this.lod}` : `${this.modules?.root.children.length ?? 0} 个模块 · ${this.modules?.triangles.toLocaleString() ?? 0} triangles\nGLB ${((this.modules?.transferBytes ?? 0) / 1048576).toFixed(2)} MiB · 贴图估算 ${((this.modules?.textureEstimateBytes ?? 0) / 1048576).toFixed(0)} MiB`;
    this.shell.modeNote.textContent = this.mode === 'baseline' ? 'M2.1 原始海岸 · 结构保留' : this.mode === 'module' ? `${this.asset} · 独立模块检查` : `${this.lod} · 前侧 / 右侧局部海岸`;
  }
  private setCamera(): void {
    if (!this.preset || !this.manifest) return;
    let state = this.preset.cameraViews[this.view];
    this.fixedCamera = this.diagnosticPreset ? diagnosticCamera(this.diagnosticPreset, this.diagnosticView) : undefined;
    if (this.mode === 'module') {
      const size = this.manifest.assets.find((asset) => asset.id === this.asset)!.variants.find((item) => item.id === this.lod)!.dimensions;
      state = { ...state, target: { x: 0, y: size[1] * 0.48, z: 0 }, distance: Math.max(8, size[0] * 2.7) };
    }
    this.camera?.dispose(); this.camera = new ConstrainedCamera(this.shell.canvas, coastalCameraProfile(state));
    this.resize(); this.shell.canvas.dataset.view = this.view; this.shell.canvas.dataset.camera = JSON.stringify(state);
    this.shell.canvas.dataset.rendered = 'false';
    if (this.fixedCamera) {
      this.shell.canvas.dataset.g01Camera = JSON.stringify(this.diagnosticPreset!.views[this.diagnosticView]);
      this.shell.canvas.dataset.g01View = this.diagnosticView; this.shell.canvas.dataset.g01Overlay = this.overlay;
    }
    for (const button of this.shell.viewControls.querySelectorAll<HTMLButtonElement>('[data-coastal-view]')) button.setAttribute('aria-pressed', String(button.dataset.coastalView === this.view));
  }
  private syncQuery(): void {
    const url = new URL(location.href);
    for (const [key, value] of Object.entries({ mode: this.mode, lod: this.lod, asset: this.asset, view: this.view })) url.searchParams.set(key, value);
    if (this.g01) for (const [key, value] of Object.entries({ diagnosticView: this.diagnosticView, overlay: this.overlay })) url.searchParams.set(key, value);
    history.replaceState(null, '', url);
  }
  private resetSamples(): void { this.samples.reset(); delete this.shell.canvas.dataset.performance; }
  private resize = (): void => {
    if (!this.renderer || !this.camera) return;
    const width = Math.max(1, this.shell.viewport.clientWidth), height = Math.max(1, this.shell.viewport.clientHeight);
    this.renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1)); this.renderer.setSize(width, height, false); this.camera.resize(width, height);
    if (this.fixedCamera) { this.fixedCamera.aspect = width / height; this.fixedCamera.updateProjectionMatrix(); }
    this.resetSamples();
  };
  private render = (time: number): void => {
    if (this.disposed || !this.renderer || !this.world || !this.camera) return;
    try {
      this.camera.update(this.previousFrame ? Math.min(0.1, (time - this.previousFrame) / 1000) : 0);
      this.previousFrame = time;
      const activeCamera = this.fixedCamera ?? this.camera.camera;
      if (this.diagnostics && this.fixedCamera) {
        const key = `${this.diagnosticView}:${this.shell.viewport.clientWidth}:${this.shell.viewport.clientHeight}`;
        if (key !== this.evidenceCamera) {
          this.evidenceCamera = key;
          this.shell.canvas.dataset.g01VisibleFaces = JSON.stringify(this.diagnostics.cameraEvidence(activeCamera, this.shell.viewport.clientWidth, this.shell.viewport.clientHeight));
        }
      }
      this.diagnostics?.update(activeCamera, this.shell.viewport.clientWidth, this.shell.viewport.clientHeight);
      const start = performance.now(); this.renderer.render(this.world.scene, activeCamera); const submitted = performance.now() - start;
      if (this.shell.canvas.dataset.loaded === 'true') this.shell.canvas.dataset.rendered = 'true';
      if (this.shell.canvas.dataset.loaded === 'true' && this.samples.sample(time, submitted) && !this.shell.canvas.dataset.performance) {
        const context = this.renderer.getContext(), debug = context.getExtension('WEBGL_debug_renderer_info');
        this.shell.canvas.dataset.performance = JSON.stringify({ ...this.samples.report(), mode: this.mode, lod: this.lod, asset: this.asset, view: this.view,
          instances: this.modules?.root.children.length ?? 0, uniqueAssets: this.modules?.assetIds.length ?? 0,
          moduleTriangles: this.modules?.triangles ?? 0, transferBytes: this.modules?.transferBytes ?? 0, fetchMs: this.modules?.fetchMs ?? 0, parseMs: this.modules?.parseMs ?? 0,
          textureEstimateBytes: this.modules?.textureEstimateBytes ?? 0, drawCalls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles, textures: this.renderer.info.memory.textures,
          viewport: { width: this.shell.viewport.clientWidth, height: this.shell.viewport.clientHeight, dpr: this.renderer.getPixelRatio() },
          gpu: debug ? String(context.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : 'unavailable',
          method: '60 warmup frames / 120 RAF samples; CPU submission excludes GPU completion; sequential localhost fetch/parse; unique loaded GLB bytes; RGBA8+mip estimate, not measured VRAM' });
      }
      this.shell.status.textContent = `WebGL2 · ${this.mode === 'baseline' ? 'M2.1' : this.lod}`;
      this.shell.readout.textContent = this.fixedCamera ? `G01 ${this.diagnosticView} · ${this.overlay} · 固定相机` : `${labels[this.view]} · ${this.camera.state.pitch.toFixed(1)}° · ${this.camera.state.distance.toFixed(1)} m`;
      this.frame = requestAnimationFrame(this.render);
    } catch (error: unknown) { this.fail(error); }
  };
  private fail(error: unknown): void {
    if (this.disposed) return;
    this.shell.error.hidden = false; this.shell.error.textContent = error instanceof Error ? error.message : String(error);
    this.shell.status.textContent = '海岸实验不可用';
    for (const control of this.shell.viewControls.querySelectorAll<HTMLButtonElement | HTMLSelectElement>('button,select')) control.disabled = true;
    this.dispose();
  }
  dispose(): void {
    if (this.disposed) return; this.disposed = true;
    cancelAnimationFrame(this.frame); this.events.abort(); this.loading?.abort(); this.observer?.disconnect(); this.camera?.dispose();
    this.diagnostics?.dispose();
    if (this.modules) disposeObject(this.modules.root);
    this.world?.dispose(); this.renderer?.dispose();
  }
}
