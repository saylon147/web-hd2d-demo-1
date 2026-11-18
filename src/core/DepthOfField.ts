import { ShaderMaterial, Vector2 } from 'three';
import type { PerspectiveCamera, WebGLRenderTarget, WebGLRenderer } from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const sliders = [
  { key:'focus', label:'对焦距离（米）', min:1, max:60, step:0.1, initial:27 },
  { key:'plane', label:'焦平面锚点（画面高度 %）', min:0, max:100, step:1, initial:50 },
  { key:'tilt', label:'焦平面倾角（°）', min:-45, max:45, step:1, initial:15 },
  { key:'blur', label:'最大模糊（CSS px）', min:0, max:20, step:0.5, initial:12 },
] as const;

export class DepthOfField {
  readonly panel = document.createElement('details');
  private readonly toggle: HTMLInputElement;
  private readonly order: HTMLSelectElement;
  private readonly inputs: HTMLInputElement[];
  private readonly material = new ShaderMaterial({
    uniforms:{
      colorMap:{value:null}, depthMap:{value:null}, clip:{value:new Vector2()},
      radiusUV:{value:new Vector2()}, focus:{value:27}, plane:{value:0.5}, slope:{value:0},
    },
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader:`
      varying vec2 vUv;
      uniform sampler2D colorMap, depthMap;
      uniform vec2 clip, radiusUV;
      uniform float focus, plane, slope;
      float distanceAt(vec2 uv){
        float d=texture2D(depthMap,uv).r;
        return clip.x*clip.y/(clip.y-d*(clip.y-clip.x));
      }
      void main(){
        float z=distanceAt(vUv);
        // Plane through the selected image-height ray at the chosen axial distance.
        float error=z*(1.0-slope*(vUv.y-plane))-focus;
        float coc=smoothstep(0.6,7.5,abs(error));
        vec4 sum=texture2D(colorMap,vUv);
        float weight=1.0;
        if(coc>0.002){
          for(int i=0;i<32;i++){
            float index=float(i)+0.5;
            float a=index*2.39996323;
            vec2 uv=vUv+vec2(cos(a),sin(a))*sqrt(index/32.0)*radiusUV*coc;
            float dz=abs(distanceAt(uv)-z);
            float w=1.0-smoothstep(0.65,3.6,dz);
            sum+=texture2D(colorMap,uv)*w;
            weight+=w;
          }
        }
        gl_FragColor=sum/weight;
      }`,
    toneMapped:false,depthTest:false,depthWrite:false,
  });
  private readonly quad=new FullScreenQuad(this.material);
  constructor(parent:HTMLElement, signal:AbortSignal, changed:()=>void){
    const params=new URL(location.href).searchParams;
    this.panel.className='dof-panel';
    this.panel.innerHTML='<summary>景深</summary><section><label><input type="checkbox"> 启用景深</label><label>处理顺序 <select aria-label="处理顺序"><option value="before">先景深，再像素化</option><option value="after">先像素化，再景深</option></select></label></section>';
    const body=this.panel.querySelector('section')!;
    this.toggle=body.querySelector('input')!;
    this.toggle.checked=params.get('dof')==='1';
    this.order=body.querySelector('select')!;
    this.order.value=params.get('order')==='after'?'after':'before';
    this.inputs=sliders.map(s=>{
      const label=document.createElement('label');
      label.textContent=s.label;
      const input=document.createElement('input');
      input.type='range';input.min=String(s.min);input.max=String(s.max);input.step=String(s.step);
      input.setAttribute('aria-label',s.label);
      const raw=params.get(s.key);
      input.value=raw?.trim() && Number.isFinite(Number(raw)) ? raw : String(s.initial);
      const value=document.createElement('output');value.value=input.value;
      input.addEventListener('input',()=>{value.value=input.value;},{signal});
      label.append(input,value);body.append(label);
      return input;
    });
    this.panel.addEventListener('input',()=>{
      const url=new URL(location.href);
      url.searchParams.set('dof',this.enabled?'1':'0');
      url.searchParams.set('order',this.order.value);
      sliders.forEach((s,i)=>url.searchParams.set(s.key,this.inputs[i]!.value));
      history.replaceState(history.state,'',url);
      changed();
    },{signal});
    parent.append(this.panel);
  }
  get enabled(){return this.toggle.checked;}
  get before(){return this.order.value==='before';}
  configure(pixel:boolean){
    this.order.disabled=!pixel;
    this.panel.querySelector('summary')!.textContent=this.enabled?'景深 · 开':'景深 · 关';
  }
  render(renderer:WebGLRenderer,camera:PerspectiveCamera,source:WebGLRenderTarget, destination:WebGLRenderTarget|null){
    const u=this.material.uniforms;
    u.colorMap!.value=source.texture;u.depthMap!.value=source.depthTexture;
    u.clip!.value.set(camera.near,camera.far);
    const [distance,anchor,angle,strength]=this.inputs.map(input=>input.valueAsNumber);
    u.focus!.value=distance;u.plane!.value=1-anchor!/100;
    u.slope!.value=2*Math.tan(camera.fov*Math.PI/360)*Math.tan(angle!*Math.PI/180);
    u.radiusUV!.value.set(strength!/renderer.domElement.clientWidth,strength!/renderer.domElement.clientHeight);
    renderer.setRenderTarget(destination);this.quad.render(renderer);
  }
  dispose(){this.panel.remove();this.material.dispose();this.quad.dispose();}
}
