import { test,expect } from '@playwright/test';
import { mkdir,writeFile } from 'node:fs/promises';

test('H3-B isolated sampling probes and localized bloom pairs',async({page,browser})=>{
  test.setTimeout(180000);
  const root='docs/hd2d-render-study/H3-B';
  for(const group of ['sampling','bloom'])await mkdir(root+'/'+group,{recursive:true});
  const errors:string[]=[];
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  page.on('pageerror',e=>errors.push(e.message));
  const canvas=page.locator('#scene');
  const records: {file:string;url:string;camera:string|undefined;resolution:string|null;viewport:{width:number;height:number}|null;draws:string|undefined;triangles:string|undefined;meanMs:number;p95Ms:number|undefined}[]=[];
  async function capture(group:string,name:string,query:string){
    const url='/?scene=courtyard&'+query;
    await page.goto(url);
    await expect(canvas).toHaveAttribute('data-loaded','true');
    const samples=await page.evaluate(async count=>{
      const tick=()=>new Promise<number>(r=>requestAnimationFrame(r));
      for(let i=0;i<20;i++)await tick();
      const times=[];let last=await tick();
      for(let i=0;i<count;i++){const t=await tick();times.push(t-last);last=t;}
      return times;
    },group==='bloom'?90:10);
    const state=await canvas.evaluate(el=>({...el.dataset}));
    const file=group+'/'+name+'.png';
    const png=await canvas.screenshot({path:root+'/'+file,style:'.scene-footer,.scene-heading{visibility:hidden}'});
    expect(await canvas.evaluate(el=>(el as HTMLCanvasElement).getContext('webgl2')!.getError())).toBe(0);
    records.push({file,url,camera:state.cameraMatrix,resolution:await page.getByLabel('实际渲染尺寸').textContent(),viewport:page.viewportSize(),draws:state.drawCalls,triangles:state.triangles,
      meanMs:samples.reduce((a,b)=>a+b,0)/samples.length,p95Ms:samples.sort((a,b)=>a-b)[Math.ceil(samples.length*.95)-1]});
    return png;
  }
  await page.setViewportSize({width:808,height:830});
  const base='sky=dusk&shot=detail&dof=0&bloom=0&render=';
  await capture('sampling','native',base+'native');
  for(const width of [480,640]){
    const query=base+'pixel&pixelWidth='+width;
    for(const probe of ['default','no-mips','aniso','msaa','no-specular','no-normal','double','double-msaa','solid','no-shadows','depth-precision']){
      const extra=probe==='double-msaa'?'&probe=double&msaa=4':probe==='msaa'?'&msaa=4':probe==='no-shadows'?'&shadows=0':'&probe='+probe;
      await capture('sampling',width+'-'+probe,query+extra);
    }
  }
  expect(new Set(records.map(r=>r.camera)).size).toBe(1);
  await page.setViewportSize({width:1440,height:960});
  for(const [mode,opts] of [['native','render=native'],['480','render=pixel&pixelWidth=480'],['480-before','render=pixel&pixelWidth=480&dof=1&focus=12&order=before'],['480-after','render=pixel&pixelWidth=480&dof=1&focus=12&order=after']]){
    const q='shot=house&sky=night&'+opts;
    const off=await capture('bloom',mode+'-off',q+'&bloom=0');
    const on=await capture('bloom',mode+'-on',q+'&bloom=1');
    expect(off.equals(on)).toBe(false);
  }
  await page.getByLabel('Bloom',{exact:true}).uncheck();
  expect(new URL(page.url()).searchParams.get('bloom')).toBe('0');
  await page.getByLabel('MSAA',{exact:true}).check();
  await page.reload();
  await expect(page.getByLabel('MSAA',{exact:true})).toBeChecked();
  expect(errors).toEqual([]);
  await writeFile(root+'/captures.json',JSON.stringify({browser:browser.version(),records},null,2)+'\n');
});
