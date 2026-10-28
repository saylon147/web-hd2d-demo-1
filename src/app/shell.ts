export interface AppShell {
  viewport: HTMLElement;
  canvas: HTMLCanvasElement;
  debugPanel: HTMLElement;
  debugToggle: HTMLButtonElement;
  resetButton: HTMLButtonElement;
  status: HTMLElement;
  readout: HTMLElement;
  error: HTMLElement;
  viewControls: HTMLElement;
  metrics: HTMLElement;
  modeNote: HTMLElement;
}

function requireElement<T extends Element>(root: HTMLElement, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing application element: ${selector}`);
  return element;
}

export function createShell(root: HTMLElement, foundation = true): AppShell {
  root.innerHTML = `
    <div class="app-shell ${foundation ? '' : 'blockout-shell'}">
      <header class="topbar">
        <a class="brand" href="./" aria-label="HD-2D 视角实验首页">
          <svg class="brand-mark" viewBox="0 0 40 40" aria-hidden="true"><rect width="40" height="40" rx="12"/><path d="m20 8 12 7v13l-12 7-12-7V15Z M8 15l12 7 12-7M20 22v13"/></svg>
          <span><strong>HD–2D</strong><span class="brand-sub">VISUAL STUDY</span></span>
        </a>
        <span class="milestone"><span class="milestone-number">${foundation ? 'M1' : 'M2.1'}</span> ${foundation ? '基础与相机' : '空间白模'}</span>
        <div class="toolbar">
          <button id="reset-view" class="button" type="button"><span aria-hidden="true">↺</span> 重置视角</button>
          <button id="toggle-debug" class="button button-primary" type="button" aria-controls="debug-panel" aria-expanded="true">调试参数 <span aria-hidden="true">⌘</span></button>
        </div>
      </header>
      <main class="viewport" aria-label="基础几何与受限透视相机实验">
        <canvas id="scene" aria-label="可拖动旋转、滚轮缩放的三维测试场景"></canvas>
        <nav id="view-controls" class="view-controls" aria-label="查看模式" ${foundation ? 'hidden' : ''}>
          <button type="button" data-view="exterior" aria-pressed="true" disabled>外景</button>
          <button type="button" data-view="ground-floor" aria-pressed="false" disabled>一层剖视</button>
          <button type="button" data-view="basement" aria-pressed="false" disabled>地下室剖视</button>
        </nav>
        <div class="scene-heading">
          <div class="eyebrow"><span class="small-dot"></span> ${foundation ? 'FOUNDATION / 01' : 'SPATIAL BLOCKOUT / 02.1'}</div>
          <h1>${foundation ? '空间与视角' : '岛屿与小屋'}</h1>
          <p id="mode-note">${foundation ? '用基础体块，验证 HD-2D 的观察空间。' : '正在加载 Blender 空间白模…'}</p>
          <span class="placeholder-badge">${foundation ? '程序化占位几何 · 非最终美术' : '一层 + 地下室 · 空间待确认'}</span>
          <output id="spatial-metrics" class="spatial-metrics" ${foundation ? 'hidden' : ''}></output>
        </div>
        <aside id="debug-panel" class="debug-panel" aria-label="相机调试参数">
          <div class="panel-caption">CAMERA LAB <span>受限透视</span></div>
          <div id="gui"></div>
          <p class="panel-note">${foundation ? '金色圆点为观察目标，地面圆环标记其投影。<br/>1 格 = 1 米' : '切换模式使用固定检查机位。<br/>重置恢复当前模式 · 1 unit = 1 米'}</p>
        </aside>
        <div class="scene-footer">
          <div class="axis-legend"><span class="axis-x">X</span> 右 <span class="axis-y">Y</span> 上 <span class="axis-z">−Z</span> 前</div>
          <output id="camera-readout" class="camera-readout" aria-label="当前相机参数"></output>
        </div>
        <section id="error-panel" class="error-panel" role="alert" hidden></section>
      </main>
      <footer class="bottom-bar">
        <div class="control-hints"><span><b aria-hidden="true">↔</b> 拖动旋转</span><span><b aria-hidden="true">↕</b> 滚轮 / 双指缩放</span></div>
        ${foundation ? '<span class="scope-note">有限视角 · 3D 场景基础</span>' : '<a class="calibration-link" href="?scene=foundation">M1 镜头校准 ↗</a>'}
        <span id="render-status" class="render-status" role="status">正在初始化…</span>
      </footer>
    </div>`;

  return {
    viewport: requireElement(root, '.viewport'),
    canvas: requireElement(root, '#scene'),
    debugPanel: requireElement(root, '#debug-panel'),
    debugToggle: requireElement(root, '#toggle-debug'),
    resetButton: requireElement(root, '#reset-view'),
    status: requireElement(root, '#render-status'),
    readout: requireElement(root, '#camera-readout'),
    error: requireElement(root, '#error-panel'),
    viewControls: requireElement(root, '#view-controls'),
    metrics: requireElement(root, '#spatial-metrics'),
    modeNote: requireElement(root, '#mode-note'),
  };
}
