import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

test('H2 courtyard focus controls, reproducible order and A/B frames',async({page,browser})=>{
  test.setTimeout(150000);
  const dir='docs/hd2d-render-study/H2';
  await mkdir(dir,{recursive:true});
  await page.setViewportSize({width:1440,height:960});
  const errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('/?scene=courtyard&actor=0&render=pixel&pixelWidth=480&dof=1&focus=27&plane=50&tilt=15&blur=12&order=before');
  const canvas=page.locator('#scene'),mode=page.getByLabel('渲染模式'),width=page.getByLabel('像素参考宽度');
  const panel=page.locator('.dof-panel'), toggle=page.getByLabel('启用景深'),order=page.getByLabel('处理顺序');
  await expect(canvas).toHaveAttribute('data-loaded','true');
  await panel.locator('summary').click();
  await expect(toggle).toBeChecked();
  const shot=()=>canvas.screenshot({style:'.scene-heading,.scene-footer{visibility:hidden}'});
  const hashes=new Set<string>(),records=[];
  let matrix='';
  for(const preset of ['native','480','640']){
    await mode.selectOption(preset==='native'?'native':'pixel');
    if(preset!=='native')await width.selectOption(preset);
    for(const variant of (preset==='native'?['off','before']:['off','before','after'])){
      await toggle.setChecked(variant!=='off');
      if(preset!=='native' && variant!=='off')await order.selectOption(variant);
      const frames=await page.evaluate(async()=>{
        const frame=()=>new Promise<number>(resolve=>requestAnimationFrame(resolve));
        for(let i=0;i<30;i++)await frame();
        let last=await frame();const times=[];
        for(let i=0;i<60;i++){const now=await frame();times.push(now-last);last=now;}
        return times;
      });
      const data=await canvas.evaluate(c=>({...c.dataset}));
      matrix ||= data.cameraMatrix!;
      expect(data.cameraMatrix).toBe(matrix);
      const png=await shot(), file=preset+'-'+variant+'.png';
      hashes.add(createHash('sha256').update(png).digest('hex'));
      await writeFile(dir+'/'+file,png);
      const glError=await canvas.evaluate(c=>(c as HTMLCanvasElement).getContext('webgl2')!.getError());
      expect(glError).toBe(0);
      records.push({file,url:new URL(page.url()).search,camera:matrix,resolution:await page.getByLabel('实际渲染尺寸').textContent(),
        drawCalls:data.drawCalls,triangles:data.triangles,meanMs:frames.reduce((a,b)=>a+b,0)/frames.length});
    }
  }
  expect(hashes.size).toBe(8);
  const last=await shot();
  for(const [label,value] of [['对焦距离（米）','18'],['焦平面锚点（画面高度 %）','25'],['焦平面倾角（°）','30'],['最大模糊（CSS px）','18']] as const){
    await page.getByRole('slider',{name:label}).fill(value);
  }
  const adjusted=await shot();expect(adjusted.equals(last)).toBe(false);
  await page.reload();await expect(canvas).toHaveAttribute('data-loaded','true');
  expect((await shot()).equals(adjusted)).toBe(true);
  await page.setViewportSize({width:800,height:900});
  await canvas.hover();await page.mouse.wheel(0,180);
  await expect.poll(async()=>Number(await canvas.getAttribute('data-distance'))).toBeGreaterThan(27);
  expect(errors).toEqual([]);
  await writeFile(dir+'/captures.json',JSON.stringify({browser:browser.version(),viewport:[1440,960],dpr:1,records},null,2)+'\n');
});
