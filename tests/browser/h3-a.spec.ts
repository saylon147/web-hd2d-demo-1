import { test, expect, type Page } from '@playwright/test';
import { mkdir,writeFile,readFile } from 'node:fs/promises';

// Headless GPU captures can vary by a few pixels across browser processes.
async function expectSameFrame(page:Page, actual:Buffer, expected:Buffer){
  const difference=await page.evaluate(async encoded=>{
    const images=await Promise.all(encoded.map(async data=>{
      const blob=await (await fetch('data:image/png;base64,'+data)).blob();
      return createImageBitmap(blob);
    }));
    const [a,b]=images;
    if(!a || !b || a.width!==b.width || a.height!==b.height) return 1;
    const ctx=new OffscreenCanvas(a.width,a.height).getContext('2d')!;
    const pixels=images.map(im=>{
      ctx.drawImage(im,0,0);
      return ctx.getImageData(0,0,im.width,im.height).data;
    });
    let changed=0;
    for(let i=0;i<pixels[0]!.length;i+=4){
      if([0,1,2].some(c=>Math.abs(pixels[0]![i+c]!-pixels[1]![i+c]!)>2))changed++;
    }
    return changed/(a.width*a.height);
  },[actual.toString('base64'),expected.toString('base64')]);
  expect(difference).toBeLessThan(0.0001);
}

test('H3-A atmosphere, camera locks, lamp and shadow isolation',async({page,browser})=>{
  test.setTimeout(150000);
  const dir='docs/hd2d-render-study/H3-A';
  await mkdir(dir,{recursive:true});
  await page.setViewportSize({width:1440,height:960});
  const errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('/?scene=courtyard&render=pixel&pixelWidth=480');
  const canvas=page.locator('#scene');
  await expect(canvas).toHaveAttribute('data-loaded','true');
  await page.locator('.lighting-panel summary').click();
  const sky=page.getByLabel('时段'),shot=page.getByLabel('固定镜头'),lamps=page.getByLabel('门窗局部光'),shadow=page.getByLabel('主光投影');
  const style='.scene-heading,.scene-footer{visibility:hidden}';
  const records=[];
  for(const view of ['entrance','house']){
    await shot.selectOption(view);
    let matrix='';
    for(const preset of ['day','dusk','night']){
      await sky.selectOption(preset);
      const times=await page.evaluate(async()=>{
        const frame=()=>new Promise<number>(r=>requestAnimationFrame(r));
        for(let i=0;i<30;i++)await frame();
        let last=await frame();const intervals=[];
        for(let i=0;i<90;i++){const t=await frame();intervals.push(t-last);last=t;}
        return intervals.sort((a,b)=>a-b);
      });
      const state=await canvas.evaluate(c=>({...c.dataset}));
      matrix ||= state.cameraMatrix!;
      expect(state.cameraMatrix).toBe(matrix);
      const file=view+'-'+preset+'.png';
      const image=await canvas.screenshot({path:dir+'/'+file,style});
      if(view==='entrance' && preset==='day')await expectSameFrame(page,image,await readFile('docs/hd2d-render-study/H2/480-off.png'));
      records.push({file,camera:matrix,url:new URL(page.url()).search,meanMs:times.reduce((a,b)=>a+b,0)/times.length,
        p95Ms:times[85],calls:state.drawCalls,triangles:state.triangles});
    }
  }
  const night=await canvas.screenshot({style});
  await lamps.uncheck();
  expect((await canvas.screenshot({path:dir+'/house-night-lamps-off.png',style})).equals(night)).toBe(false);
  await lamps.check();await shadow.uncheck();
  expect((await canvas.screenshot({path:dir+'/house-night-shadows-off.png',style})).equals(night)).toBe(false);
  await shadow.check();
  await page.reload();
  await expect(canvas).toHaveAttribute('data-distance','12');
  await expectSameFrame(page,await canvas.screenshot({style}),night);
  await page.getByLabel('渲染模式').selectOption('native');
  await page.locator('.dof-panel summary').click();
  await page.getByLabel('启用景深').check();
  await page.getByLabel('对焦距离（米）').fill('12');
  await canvas.screenshot({path:dir+'/house-night-native-dof.png',style});
  expect(await canvas.evaluate(c=>(c as HTMLCanvasElement).getContext('webgl2')!.getError())).toBe(0);
  expect(errors).toEqual([]);
  await writeFile(dir+'/captures.json',JSON.stringify({browser:browser.version(),viewport:page.viewportSize(),dpr:await page.evaluate(()=>devicePixelRatio),records},null,2)+'\n');
});
