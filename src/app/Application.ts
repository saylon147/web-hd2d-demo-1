import type GUI from 'lil-gui';
import type { WebGLRenderer } from 'three';
import { createDebugPanel } from '../art-lab/debugPanel';
import { ConstrainedCamera } from '../camera/ConstrainedCamera';
import { createRenderer } from '../core/renderer';
import { createFoundationWorld } from '../world/foundation';
import type { FoundationWorld } from '../world/foundation';
import { createShell } from './shell';
import type { AppShell } from './shell';
import { createBlockoutWorld } from '../world/blockout';
import type { BlockoutWorld } from '../world/blockout';
import { blockoutCameraProfile, VIEW_MODES } from '../config/blockout';
import type { ViewMode } from '../config/blockout';
import { FOUNDATION_CAMERA_PROFILE } from '../config/camera';

export class Application {
  private readonly shell: AppShell;
  private readonly foundation = new URLSearchParams(window.location.search).get('scene') === 'foundation';
  private blockout: BlockoutWorld | undefined;
  private readonly events = new AbortController();
  private renderer: WebGLRenderer | undefined;
  private orbit: ConstrainedCamera | undefined;
  private world: FoundationWorld | undefined;
  private gui: GUI | undefined;
  private resizeObserver: ResizeObserver | undefined;
  private frameId = 0;
  private previousTime = 0;
  private previousReadoutTime = -Infinity;
  private failed = false;
  private disposed = false;
  private pixelRatio = 0;

  constructor(root: HTMLElement) {
    this.shell = createShell(root, this.foundation);
    void this.initialize().catch((error: unknown) => {
      if (this.disposed || this.failed) return;
      this.showError(error);
      this.disposeResources();
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.disposeResources();
  }

  private async initialize(): Promise<void> {
    this.renderer = createRenderer(this.shell.canvas);
    const options = { signal: this.events.signal };
    this.shell.canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      this.showError(new Error('WebGL 上下文已丢失。请重新加载页面以恢复场景。'));
      this.disposeResources();
    }, options);
    const loadedWorld = this.foundation ? createFoundationWorld() : await createBlockoutWorld(this.events.signal);
    if (this.disposed || this.failed) { loadedWorld.dispose(); return; }
    this.world = loadedWorld;
    if (!this.foundation) this.blockout = loadedWorld as BlockoutWorld;
    this.orbit = new ConstrainedCamera(this.shell.canvas, this.blockout ? blockoutCameraProfile(this.blockout.manifest) : FOUNDATION_CAMERA_PROFILE);
    const guiContainer = this.shell.debugPanel.querySelector<HTMLElement>('#gui');
    if (!guiContainer) throw new Error('无法创建相机调试面板。');
    this.gui = createDebugPanel(guiContainer, this.orbit, this.world);

    this.shell.resetButton.addEventListener('click', () => this.orbit?.reset(), options);
    for (const button of this.shell.viewControls.querySelectorAll<HTMLButtonElement>('button')) {
      button.disabled = false;
      button.addEventListener('click', () => {
        const mode = VIEW_MODES.find((mode) => mode === button.dataset.view);
        if (mode) this.selectView(mode);
      }, options);
    }
    if (this.blockout) {
      const metrics = this.blockout.manifest.metrics;
      this.shell.metrics.textContent = `陆地 ${metrics.landAreaM2.toFixed(0)}㎡ / 小屋 ${metrics.houseAreaM2.toFixed(0)}㎡\n面积比 ${metrics.landRatio.toFixed(2)}× · 庭院 ${metrics.courtyardAreaM2.toFixed(1)}㎡`;
      const queryMode = new URLSearchParams(window.location.search).get('view');
      this.selectView(VIEW_MODES.find((mode) => mode === queryMode) ?? 'exterior');
    }
    this.shell.canvas.dataset.scene = this.foundation ? 'foundation' : 'blockout';
    this.shell.canvas.dataset.loaded = 'true';
    const setDebugVisible = (visible: boolean): void => {
      this.shell.debugPanel.hidden = !visible;
      this.shell.debugToggle.setAttribute('aria-expanded', String(visible));
    };
    setDebugVisible(!window.matchMedia('(max-width: 700px)').matches);
    this.shell.debugToggle.addEventListener('click', () => setDebugVisible(this.shell.debugPanel.hidden), options);
    window.addEventListener('resize', this.resize, options);
    document.addEventListener('visibilitychange', () => { this.previousTime = 0; }, options);
    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(this.shell.viewport);
    this.resize();
    this.frameId = requestAnimationFrame(this.renderFrame);
  }

  private selectView(mode: ViewMode): void {
    if (!this.blockout || !this.orbit) return;
    this.blockout.setView(mode);
    this.orbit.setPreset(this.blockout.manifest.views[mode]);
    this.shell.canvas.dataset.view = mode;
    this.shell.canvas.dataset.roofVisible = String(this.blockout.scene.getObjectByName('Roof')?.visible ?? false);
    this.shell.canvas.dataset.basementVisible = String(this.blockout.scene.getObjectByName('Basement')?.visible ?? false);
    this.shell.canvas.dataset.stairVisible = String(this.blockout.scene.getObjectByName('StairsDown')?.visible ?? false);
    for (const button of this.shell.viewControls.querySelectorAll<HTMLButtonElement>('button')) {
      button.setAttribute('aria-pressed', String(button.dataset.view === mode));
    }
    const metrics = this.blockout.manifest.metrics;
    this.shell.modeNote.textContent = mode === 'exterior' ? '庭院 → 石阶 → 沙滩 → 码头' : mode === 'ground-floor'
      ? `一层净高 ${metrics.groundHeight.toFixed(2)} m · U 形楼梯连接地下室`
      : `地下室净高 ${metrics.basementHeight.toFixed(2)} m · 岩层局部剖开`;
  }

  private readonly resize = (): void => {
    if (!this.renderer || !this.orbit || this.failed || this.disposed) return;
    const width = Math.max(1, this.shell.viewport.clientWidth);
    const height = Math.max(1, this.shell.viewport.clientHeight);
    this.pixelRatio = Math.min(2, window.devicePixelRatio || 1);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(width, height, false);
    this.orbit.resize(width, height);
  };

  private readonly renderFrame = (time: number): void => {
    if (!this.renderer || !this.orbit || !this.world || this.failed || this.disposed) return;
    try {
      if (this.pixelRatio !== Math.min(2, window.devicePixelRatio || 1)) this.resize();
      const delta = this.previousTime ? Math.min(0.1, (time - this.previousTime) / 1000) : 0;
      this.previousTime = time;
      this.orbit.update(delta);
      this.world.updateTarget(this.orbit.state.target);
      this.renderer.render(this.world.scene, this.orbit.camera);
      this.shell.status.textContent = `WebGL2 · DPR ${this.pixelRatio.toFixed(1)}`;
      this.shell.status.classList.add('is-ready');
      if (time - this.previousReadoutTime >= 100) {
        const state = this.orbit.state;
        this.shell.readout.textContent = `俯角 ${state.pitch.toFixed(1)}°  /  偏转 ${state.yawOffset.toFixed(1)}°  /  距离 ${state.distance.toFixed(2)} m`;
        // Read-only diagnostics used by browser acceptance tests; no mutable global test API.
        this.shell.canvas.dataset.pitch = String(state.pitch);
        this.shell.canvas.dataset.yaw = String(state.yawOffset);
        this.shell.canvas.dataset.distance = String(state.distance);
        this.shell.canvas.dataset.cameraY = String(this.orbit.camera.position.y);
        this.shell.canvas.dataset.aspect = String(this.orbit.camera.aspect);
        this.shell.canvas.dataset.drawCalls = String(this.renderer.info.render.calls);
        this.shell.canvas.dataset.triangles = String(this.renderer.info.render.triangles);
        this.previousReadoutTime = time;
      }
      this.frameId = requestAnimationFrame(this.renderFrame);
    } catch (error: unknown) {
      this.showError(error);
      this.disposeResources();
    }
  };

  private showError(error: unknown): void {
    this.failed = true;
    this.shell.error.hidden = false;
    const title = document.createElement('h2');
    title.textContent = '场景暂时无法运行';
    const message = document.createElement('p');
    message.textContent = error instanceof Error ? error.message : '发生未知渲染错误。';
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'button button-primary';
    retry.textContent = '重新加载';
    retry.addEventListener('click', () => window.location.reload());
    this.shell.error.replaceChildren(title, message, retry);
    this.shell.debugPanel.hidden = true;
    this.shell.debugToggle.setAttribute('aria-expanded', 'false');
    this.shell.resetButton.disabled = true;
    this.shell.debugToggle.disabled = true;
    for (const button of this.shell.viewControls.querySelectorAll<HTMLButtonElement>('button')) button.disabled = true;
    this.shell.status.textContent = '渲染不可用';
    this.shell.status.classList.remove('is-ready');
    this.shell.status.classList.add('is-error');
    console.error('[HD-2D]', error);
  }

  private disposeResources(): void {
    cancelAnimationFrame(this.frameId);
    this.events.abort();
    this.resizeObserver?.disconnect();
    this.gui?.destroy();
    this.orbit?.dispose();
    this.world?.dispose();
    this.renderer?.dispose();
    this.resizeObserver = undefined;
    this.gui = undefined;
    this.orbit = undefined;
    this.world = undefined;
    this.blockout = undefined;
    this.renderer = undefined;
  }
}
