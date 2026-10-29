import { DirectionalLight, HemisphereLight } from 'three';
import type { WebGLRenderer } from 'three';
import { ConstrainedCamera } from '../camera/ConstrainedCamera';
import { TRIPO_MANIFEST_URL, ROCK_ANGLES, parseTripoManifest, rockCameraProfile } from '../config/tripo';
import type { RockAngle, TripoManifest, TripoVariant } from '../config/tripo';
import { createRenderer } from '../core/renderer';
import { disposeObject } from '../core/dispose';
import { createBlockoutWorld } from '../world/blockout';
import type { BlockoutWorld } from '../world/blockout';
import { loadTripoRock } from '../world/tripo';
import { createShell } from './shell';
import type { AppShell } from './shell';

const percentile=(values: number[],fraction: number): number=>{
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted[Math.min(sorted.length-1,Math.floor(sorted.length*fraction))]??0;
};
export class TripoApplication {
  private shell: AppShell;
  private events=new AbortController();
  private loadEvents: AbortController | undefined;
  private renderer: WebGLRenderer | undefined;
  private world: BlockoutWorld | undefined;
  private manifest: TripoManifest | undefined;
  private rock: Awaited<ReturnType<typeof loadTripoRock>> | undefined;
  private orbit: ConstrainedCamera | undefined;
  private resizeObserver: ResizeObserver | undefined;
  private frame=0;
  private previous=0;
  private elapsedFrames=0;
  private intervals: number[]=[];
  private submissions: number[]=[];
  private disposed=false;
  private angle: RockAngle;
  private variantId: string;
  private selection=0;
  constructor(root: HTMLElement) {
    this.shell=createShell(root,false);
    const query=new URLSearchParams(location.search);
    this.angle=ROCK_ANGLES.find((angle)=>angle===query.get('angle'))??'front';
    this.variantId=query.get('rock')??'';
    this.shell.viewport.querySelector('h1')!.textContent='Tripo 岩石实验';
    this.shell.viewport.querySelector('.placeholder-badge')!.textContent='新来源流程测试 · 未批准素材';
    this.shell.viewControls.innerHTML='<label>几何 <select id="rock-geometry"><option value="original">原始</option><option>5k</option><option>10k</option><option>20k</option><option>50k</option></select></label><label>贴图 <select id="rock-texture"><option>1k</option><option>2k</option><option>4k</option></select></label><button id="rock-toggle" type="button" aria-pressed="true">显示岩石</button><button data-angle="front">正面</button><button data-angle="side">侧面</button><button data-angle="back">背面</button><button data-angle="site">岛屿全景</button><a href="./">返回 M2.1 基线 ↗</a>';
    this.shell.viewControls.classList.add('tripo-controls');
    this.shell.debugPanel.hidden=true;
    this.shell.debugToggle.hidden=true;
    void this.initialize().catch((error: unknown)=>this.fail(error));
  }
  private async initialize(): Promise<void> {
    this.renderer=createRenderer(this.shell.canvas);
    const response=await fetch(TRIPO_MANIFEST_URL,{signal:this.events.signal});
    if(!response.ok)throw new Error('Tripo manifest 缺失，请先运行 npm run tripo:pipeline；M2.1 基线仍可正常访问。');
    this.manifest=parseTripoManifest(await response.json() as unknown);
    this.world=await createBlockoutWorld(this.events.signal);
    if(this.disposed){this.world.dispose();return;}
    this.renderer.toneMappingExposure=this.manifest.lighting.exposure;
    for(const light of this.world.scene.children) {
      if(light instanceof HemisphereLight)light.intensity=this.manifest.lighting.hemisphere;
      if(light instanceof DirectionalLight)light.intensity=this.manifest.lighting.sun;
    }
    if(!this.manifest.variants.some((v)=>v.id===this.variantId))this.variantId=this.manifest.defaultVariant;
    const signal=this.events.signal;
    for(const select of this.shell.viewControls.querySelectorAll('select'))select.addEventListener('change',()=>{
      const geometry=this.shell.viewControls.querySelector<HTMLSelectElement>('#rock-geometry')!.value;
      const texture=this.shell.viewControls.querySelector<HTMLSelectElement>('#rock-texture')!;
      texture.disabled=geometry==='original';
      this.variantId=geometry==='original'?'original-4k':`${geometry}-${texture.value}`;
      void this.selectVariant().catch((error: unknown)=>this.fail(error));
    },{signal});
    for(const button of this.shell.viewControls.querySelectorAll<HTMLButtonElement>('[data-angle]'))button.addEventListener('click',()=>{
      this.angle=ROCK_ANGLES.find((angle)=>angle===button.dataset.angle)??'front';
      this.setCamera();this.resetSamples();this.syncQuery();
    },{signal});
    const toggle=this.shell.viewControls.querySelector<HTMLButtonElement>('#rock-toggle')!;
    toggle.addEventListener('click',()=>{
      if(!this.rock)return;
      this.rock.root.visible=!this.rock.root.visible;
      toggle.setAttribute('aria-pressed',String(this.rock.root.visible));
      this.shell.canvas.dataset.rockVisible=String(this.rock.root.visible);this.resetSamples();
    },{signal});
    this.shell.resetButton.addEventListener('click',()=>{this.orbit?.reset();this.resetSamples();},{signal});
    window.addEventListener('resize',this.resize,{signal});
    this.shell.canvas.addEventListener('webglcontextlost',(event)=>{event.preventDefault();this.fail(new Error('WebGL 上下文丢失。重新加载或返回基线。'));},{signal});
    this.resizeObserver=new ResizeObserver(this.resize);this.resizeObserver.observe(this.shell.viewport);
    await this.selectVariant();
    this.frame=requestAnimationFrame(this.render);
  }
  private async selectVariant(): Promise<void> {
    if(!this.manifest || !this.world)return;
    const variant=this.manifest.variants.find((item)=>item.id===this.variantId);
    if(!variant)throw new Error('Unknown Tripo variant');
    const selection=++this.selection;
    this.loadEvents?.abort();this.loadEvents=new AbortController();
    this.shell.canvas.dataset.loaded='false';
    this.shell.status.textContent=`加载 ${variant.id}…`;
    if(this.rock){disposeObject(this.rock.root);this.rock=undefined;}
    let loaded: Awaited<ReturnType<typeof loadTripoRock>>;
    try{loaded=await loadTripoRock(this.manifest,variant,this.loadEvents.signal);}catch(error: unknown){if(selection!==this.selection || this.disposed)return;throw error;}
    if(this.disposed || selection!==this.selection){disposeObject(loaded.root);return;}
    this.rock=loaded;this.world.scene.add(loaded.root);
    this.setCamera();this.resize();this.resetSamples();this.syncQuery();
    const [geometry,texture]=variant.id.split('-');
    this.shell.viewControls.querySelector<HTMLSelectElement>('#rock-geometry')!.value=geometry??'20k';
    const textureControl=this.shell.viewControls.querySelector<HTMLSelectElement>('#rock-texture')!;
    textureControl.value=texture??'2k';textureControl.disabled=geometry==='original';
    this.shell.canvas.dataset.loaded='true';this.shell.canvas.dataset.scene='tripo-rock';
    this.shell.canvas.dataset.variant=variant.id;this.shell.canvas.dataset.modelHash=variant.sha256;
    this.shell.canvas.dataset.rockVisible='true';
    this.shell.viewControls.querySelector<HTMLButtonElement>('#rock-toggle')!.setAttribute('aria-pressed','true');
    this.shell.metrics.textContent=`${variant.triangleCount.toLocaleString()} triangles · ${(variant.fileBytes/1048576).toFixed(2)} MiB\n贴图估算 ${(variant.gpuTextureRgbaMipEstimateBytes/1048576).toFixed(0)} MiB（含 mip）`;
    this.shell.modeNote.textContent=`${variant.id} · 局部海岸岩石 · 保留 M2.1 岛屿结构`;
  }
  private setCamera(): void {
    if(!this.manifest)return;
    this.orbit?.dispose();
    this.orbit=new ConstrainedCamera(this.shell.canvas,rockCameraProfile(this.manifest,this.angle));
    this.shell.canvas.dataset.angle=this.angle;
  }
  private syncQuery(): void {
    const url=new URL(location.href);url.searchParams.set('rock',this.variantId);url.searchParams.set('angle',this.angle);history.replaceState(null,'',url);
  }
  private resetSamples(): void {this.previous=0;this.elapsedFrames=0;this.intervals=[];this.submissions=[];delete this.shell.canvas.dataset.performance;}
  private resize=(): void=>{
    if(!this.renderer || !this.orbit)return;
    const width=Math.max(1,this.shell.viewport.clientWidth),height=Math.max(1,this.shell.viewport.clientHeight);
    this.renderer.setPixelRatio(Math.min(2,devicePixelRatio||1));this.renderer.setSize(width,height,false);this.orbit.resize(width,height);
  };
  private render=(time: number): void=>{
    if(this.disposed || !this.renderer || !this.world || !this.orbit)return;
    try {
      const interval=this.previous?time-this.previous:0;this.previous=time;
      this.orbit.update(Math.min(0.1,interval/1000));
      const start=performance.now();this.renderer.render(this.world.scene,this.orbit.camera);const submitted=performance.now()-start;
      if(this.rock && this.shell.canvas.dataset.loaded==='true') {
        this.elapsedFrames++;
        const timing=this.manifest!.performance;
        if(this.elapsedFrames>timing.warmupFrames && this.intervals.length<timing.sampleFrames && interval>0){this.intervals.push(interval);this.submissions.push(submitted);}
        if(this.intervals.length===timing.sampleFrames && !this.shell.canvas.dataset.performance)this.publish();
      }
      this.shell.canvas.dataset.drawCalls=String(this.renderer.info.render.calls);this.shell.canvas.dataset.triangles=String(this.renderer.info.render.triangles);
      this.shell.status.textContent=`WebGL2 · ${this.variantId}`;
      this.shell.readout.textContent=`${this.angle} · ${this.orbit.state.pitch.toFixed(0)}° · ${this.orbit.state.distance.toFixed(1)} m`;
      this.frame=requestAnimationFrame(this.render);
    }catch(error: unknown){this.fail(error);}
  };
  private publish(): void {
    if(!this.renderer || !this.rock || !this.manifest)return;
    const variant: TripoVariant=this.manifest.variants.find((v)=>v.id===this.variantId)!;
    const mean=this.intervals.reduce((sum,x)=>sum+x,0)/this.intervals.length;
    const context=this.renderer.getContext(), debug=context.getExtension('WEBGL_debug_renderer_info');
    const gpu=debug?String(context.getParameter(debug.UNMASKED_RENDERER_WEBGL)):String(context.getParameter(context.RENDERER));
    this.shell.canvas.dataset.performance=JSON.stringify({variant:variant.id,angle:this.angle,rockVisible:this.rock.root.visible,
      fetchMs:this.rock.fetchMs,parseMs:this.rock.parseMs,transferBytes:this.rock.transferBytes,
      textureEstimateBytes:this.rock.textureEstimateBytes,frames:this.intervals.length,warmupFrames:this.manifest.performance.warmupFrames,
      frameMeanMs:mean,frameMedianMs:percentile(this.intervals,0.5),frameP95Ms:percentile(this.intervals,0.95),fps:1000/mean,
      cpuSubmissionMedianMs:percentile(this.submissions,0.5),cpuSubmissionP95Ms:percentile(this.submissions,0.95),
      drawCalls:this.renderer.info.render.calls,triangles:this.renderer.info.render.triangles,textures:this.renderer.info.memory.textures,
      viewport:{width:this.shell.viewport.clientWidth,height:this.shell.viewport.clientHeight,dpr:this.renderer.getPixelRatio()},gpu,
      method:'RAF intervals after 60 warmup frames, 120 samples; render CPU submission excludes GPU completion; fetch is response-body elapsed, not a cold-network claim; texture memory is an RGBA+mip estimate'});
  }
  private fail(error: unknown): void {
    if(this.disposed)return;
    this.shell.error.hidden=false;
    this.shell.error.textContent=error instanceof Error?error.message:String(error);
    this.shell.status.textContent='实验资产不可用';
    for(const control of this.shell.viewControls.querySelectorAll<HTMLButtonElement|HTMLSelectElement>('button,select'))control.disabled=true;
    this.dispose();
  }
  private disposeResources(): void {
    cancelAnimationFrame(this.frame);this.events.abort();this.loadEvents?.abort();this.resizeObserver?.disconnect();this.orbit?.dispose();
    if(this.rock)disposeObject(this.rock.root);this.world?.dispose();this.renderer?.dispose();
  }
  dispose(): void {if(this.disposed)return;this.disposed=true;this.disposeResources();}
}
