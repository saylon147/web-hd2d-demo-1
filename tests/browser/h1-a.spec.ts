import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const directory = 'docs/hd2d-render-study/H1-A';
test('H1-A fixed views, presentation, frame pacing and controls', async ({page,browser})=>{
  test.setTimeout(180000);
  await mkdir(directory,{recursive:true});
  await page.setViewportSize({width:1440,height:960});
  const errors: string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error') errors.push(m.text());});
  await page.goto('/?scene=courtyard');
  const canvas=page.locator('#scene');
  const mode=page.getByLabel('渲染模式'), width=page.getByLabel('像素参考宽度');
  const resolution=page.getByLabel('实际渲染尺寸');
  await expect(canvas).toHaveAttribute('data-loaded','true');
  await expect(mode).toHaveValue('native');
  const samples=[];
  for(const view of ['entrance','side']){
    if(view==='side'){
      await page.mouse.move(600,440); await page.mouse.down();
      await page.mouse.move(760,440,{steps:8}); await page.mouse.up();
      await expect.poll(async()=>Math.abs(Number(await canvas.getAttribute('data-yaw')))).toBeGreaterThan(25);
    }
    let reference: number[]=[];
    for(const preset of ['native','640','480','320']){
      await mode.selectOption(preset==='native'?'native':'pixel');
      if(preset!=='native') await width.selectOption(preset);
      const timing=await page.evaluate(async()=>{
        const frame=()=>new Promise<number>(resolve=>requestAnimationFrame(resolve));
        for(let i=0;i<90;i++) await frame();
        let last=await frame();
        const intervals=[];
        for(let i=0;i<120;i++){const now=await frame(); intervals.push(now-last); last=now;}
        return intervals;
      });
      const state=await canvas.evaluate(el=>({...el.dataset}));
      const camera=state.cameraMatrix!.split(',').map(Number);
      if(reference.length===0) reference=camera;
      expect(Math.max(...camera.map((v,i)=>Math.abs(v-reference[i]!)))).toBeLessThan(0.00001);
      const file=view+'-'+preset+'.png';
      await canvas.screenshot({path:directory+'/'+file,style:'.scene-heading,.scene-footer{visibility:hidden}'});
      const glError=await canvas.evaluate(el=>(el as HTMLCanvasElement).getContext('webgl2')!.getError());
      expect(glError).toBe(0);
      const meanMs=timing.reduce((a,b)=>a+b,0)/timing.length;
      samples.push({view,preset,file,resolution:await resolution.textContent(),camera,drawCalls:state.drawCalls,triangles:state.triangles,
        meanMs,fps:1000/meanMs,p95Ms:[...timing].sort((a,b)=>a-b)[113],intervalsMs:timing});
    }
  }
  await writeFile(directory+'/samples.json',JSON.stringify({browser:browser.version(),viewport:page.viewportSize(),canvas:await canvas.boundingBox(),dpr:await page.evaluate(()=>devicePixelRatio),samples},null,2)+'\n');
  await page.reload();
  await expect(mode).toHaveValue('pixel'); await expect(width).toHaveValue('320');
  await page.setViewportSize({width:740,height:800});
  const box=await canvas.boundingBox();
  await expect(resolution).toHaveText('320×'+Math.round(320*box!.height/box!.width));
  await canvas.hover(); await page.mouse.wheel(0,350);
  await expect.poll(async()=>Number(await canvas.getAttribute('data-distance'))).toBeGreaterThan(27);
  await page.locator('#reset-view').click(); await expect(canvas).toHaveAttribute('data-distance','27');
  await mode.selectOption('native'); await expect(width).toBeDisabled();
  expect(errors).toEqual([]);
});

test('DPR 2 uses drawing-buffer dimensions and confines Pixel to the courtyard',async({browser})=>{
  const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
  try {
    await page.goto('/?scene=courtyard&render=pixel&pixelWidth=640');
    const canvas=page.locator('#scene');
    await expect(canvas).toHaveAttribute('data-loaded','true');
    const [w,h]=await canvas.evaluate(el=>{const c=el as HTMLCanvasElement;return [c.width,c.height] as const;});
    const resolution=page.getByLabel('实际渲染尺寸');
    const actual=Math.min(w,640);
    await expect(resolution).toHaveText(actual+'×'+Math.round(actual*h/w));
    await page.getByLabel('渲染模式').selectOption('native');
    await expect(resolution).toHaveText(w+'×'+h);
    await page.goto('/?scene=foundation&render=pixel');
    await expect(canvas).toHaveAttribute('data-loaded','true');
    await expect(page.getByLabel('渲染模式')).toHaveCount(0);
  } finally { await page.close(); }
});
