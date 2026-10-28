import {
  ACESFilmicToneMapping,
  PCFShadowMap,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three';

export function createRenderer(canvas: HTMLCanvasElement): WebGLRenderer {
  const context = canvas.getContext('webgl2', { antialias: true, alpha: false });
  if (!context) throw new Error('无法创建 WebGL2。请启用浏览器硬件加速，或使用支持 WebGL2 的浏览器。');
  const renderer = new WebGLRenderer({ canvas, context, antialias: true });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  return renderer;
}
