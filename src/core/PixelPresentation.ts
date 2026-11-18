import { LampBloom } from './LampBloom';
import { DepthOfField } from './DepthOfField';
import { DepthTexture, UnsignedIntType, SRGBColorSpace, ShaderMaterial, NearestFilter, Vector2, WebGLRenderTarget } from 'three';
import type { PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

// Three r186 uses this flag for offscreen display targets (WebGLPrograms and
// getUnlitUniformColorSpace). It preserves native ACES → sRGB → fog ordering.
class DisplayTarget extends WebGLRenderTarget { readonly isXRRenderTarget = true; }

export class PixelPresentation {
  private readonly target = new DisplayTarget(1, 1, {
    colorSpace: SRGBColorSpace, internalFormat: 'RGBA8', minFilter: NearestFilter, magFilter: NearestFilter,
    generateMipmaps: false,
  });
  // RGBA8 already contains display-encoded values. Copy the nearest texel verbatim.
  private readonly material = new ShaderMaterial({
    uniforms: { image: { value: this.target.texture } },
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader: 'uniform sampler2D image; varying vec2 vUv; void main(){gl_FragColor=texture2D(image,vUv);}',
    depthTest: false, depthWrite: false, toneMapped: false,
  });
  private readonly quad = new FullScreenQuad(this.material);
  private readonly bloom=new LampBloom();
  private readonly bloomToggle:HTMLInputElement;
  private readonly msaa:HTMLInputElement;
  private readonly filtered=new DisplayTarget(1,1,{
    colorSpace:SRGBColorSpace,internalFormat:'RGBA8',minFilter:NearestFilter,magFilter:NearestFilter,depthBuffer:false,
  });
  private readonly dof: DepthOfField;
  private readonly depthSource = new DisplayTarget(1,1,{
    colorSpace: SRGBColorSpace, internalFormat:'RGBA8', minFilter:NearestFilter, magFilter:NearestFilter,
    depthTexture:new DepthTexture(1,1,UnsignedIntType), generateMipmaps:false,
  });
  private readonly buffer = new Vector2();
  private readonly mode: HTMLSelectElement;
  private readonly width: HTMLSelectElement;
  private readonly resolution: HTMLOutputElement;
  private readonly controls = document.createElement('div');

  constructor(private readonly renderer: WebGLRenderer, parent: HTMLElement, signal: AbortSignal) {
    this.controls.className = 'pixel-controls';
    this.controls.innerHTML = '<select aria-label="渲染模式"><option value="native">Native</option><option value="pixel">Pixel</option></select> <select aria-label="像素参考宽度"><option>320</option><option>480</option><option>640</option></select> <output aria-label="实际渲染尺寸"></output>';
    parent.append(this.controls);
    this.mode = this.controls.querySelectorAll('select')[0]!;
    this.width = this.controls.querySelectorAll('select')[1]!;
    this.resolution = this.controls.querySelector('output')!;
    const url = new URL(location.href);
    this.mode.value = url.searchParams.get('render') === 'pixel' ? 'pixel' : 'native';
    this.controls.insertAdjacentHTML('beforeend','<label><input name="msaa" type="checkbox"> MSAA</label><label><input name="bloom" type="checkbox"> Bloom</label>');
    this.msaa=this.controls.querySelector('[name=msaa]')!;
    this.bloomToggle=this.controls.querySelector('[name=bloom]')!;
    this.msaa.checked=url.searchParams.get('msaa')==='4';
    this.bloomToggle.checked=url.searchParams.get('bloom')==='1';
    const width = url.searchParams.get('pixelWidth') ?? '';
    this.width.value = ['320','480','640'].includes(width) ? width : '480';
    this.controls.addEventListener('change', () => {
      const next = new URL(location.href);
      next.searchParams.set('render', this.mode.value);
      next.searchParams.set('pixelWidth', this.width.value);
      next.searchParams.set('msaa',this.msaa.checked?'4':'0');
      next.searchParams.set('bloom',this.bloomToggle.checked?'1':'0');
      history.replaceState(history.state, '', next);
      this.resize();
    }, { signal });
    this.dof = new DepthOfField(parent,signal,()=>this.resize());
    renderer.info.autoReset = false;
  }

  resize(): void {
    this.renderer.getDrawingBufferSize(this.buffer);
    const pixel = this.mode.value === 'pixel';
    this.width.disabled = !pixel;
    let { x:w, y:h } = this.buffer;
    if (pixel) {
      const scale = Math.min(1, Number(this.width.value)/Math.max(1,w), this.renderer.capabilities.maxTextureSize/Math.max(1,h));
      w = Math.max(1,Math.round(w*scale));
      h = Math.max(1,Math.round(h*scale));
      this.target.setSize(w,h);
    }
    this.dof.configure(pixel);
    this.msaa.disabled=!pixel || (this.dof.enabled && this.dof.before);
    const lowSamples=this.msaa.checked ? Math.min(4,this.renderer.capabilities.maxSamples) : 0;
    if(this.target.samples!==lowSamples){this.target.dispose();this.target.samples=lowSamples;}
    if (this.dof.enabled || this.bloomToggle.checked) {
      const full = !pixel || (this.dof.enabled && this.dof.before);
      const samples = full ? Math.min(4,this.renderer.capabilities.maxSamples) : lowSamples;
      if (this.depthSource.samples !== samples) {
        this.depthSource.dispose();
        this.depthSource.samples = samples;
      }
      this.depthSource.setSize(full ? this.buffer.x : w, full ? this.buffer.y : h);
    }
    if(this.bloomToggle.checked && this.dof.enabled) {
      const low=pixel && this.dof.before;
      this.filtered.setSize(low?w:this.buffer.x,low?h:this.buffer.y);
    }
    this.resolution.value = w+'×'+h;
  }

  render(scene: Scene, camera: PerspectiveCamera): void {
    const renderer = this.renderer;
    renderer.info.reset();
    if(this.bloomToggle.checked){
      renderer.setRenderTarget(this.depthSource);
      renderer.render(scene,camera);
      if(this.dof.enabled)this.dof.render(renderer,camera,this.depthSource,this.filtered);
      this.bloom.render(renderer,scene,camera,this.dof.enabled?this.filtered:this.depthSource,this.depthSource);
      return;
    }
    if (this.dof.enabled) {
      const beforePixel = this.mode.value==='pixel' && this.dof.before;
      renderer.setRenderTarget(this.depthSource);
      renderer.render(scene,camera);
      this.dof.render(renderer,camera,this.depthSource,beforePixel ? this.target : null);
      if (beforePixel) {
        renderer.setRenderTarget(null);
        this.quad.render(renderer);
      }
      return;
    }
    if (this.mode.value === 'native') {
      renderer.render(scene,camera);
      return;
    }
    renderer.setRenderTarget(this.target);
    renderer.render(scene,camera);
    renderer.setRenderTarget(null);
    this.quad.render(renderer);
  }

  dispose(): void {
    this.renderer.info.autoReset = true;
    this.controls.remove();
    this.bloom.dispose();this.filtered.dispose();
    this.dof.dispose();
    this.depthSource.dispose();
    this.quad.dispose();
    this.material.dispose();
    this.target.dispose();
  }
}
