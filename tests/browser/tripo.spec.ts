import { test, expect } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { TripoManifest } from '../../src/config/tripo';

const manifest=JSON.parse(readFileSync('public/assets/manifests/tripo_rock_spike.json','utf8')) as TripoManifest;
const available=manifest.variants.every((v)=>existsSync(resolve('public'+v.modelUrl)));
test.describe('Tripo local asset integration',()=>{
  test.skip(!available,'Generated Tripo binaries are intentionally local; run npm run tripo:pipeline first.');
  test('desktop matched variants retain PBR textures, measured performance and front/side/back evidence',async({page,browser})=>{
    test.setTimeout(180_000);
    const errors: string[]=[];
    page.on('pageerror',(error)=>errors.push(error.message));
    page.on('console',(message)=>{if(['error','warning'].includes(message.type()))errors.push(message.text());});
    await page.setViewportSize({width:1600,height:1000});
    await mkdir('docs/tripo-rock-spike/images',{recursive:true});
    const records: Record<string,unknown>[]=[];
    for(const variant of manifest.variants) {
      await page.goto(`/?scene=tripo-rock&rock=${variant.id}&angle=front`);
      await expect(page.locator('#scene')).toHaveAttribute('data-loaded','true',{timeout:30_000});
      await expect(page.locator('#scene')).toHaveAttribute('data-model-hash',variant.sha256);
      await expect(page.locator('#scene')).toHaveAttribute('data-performance',/.+/,{timeout:30_000});
      const record=await page.locator('#scene').evaluate((canvas)=>JSON.parse(canvas.dataset.performance??'{}') as Record<string,unknown>);
      expect(record.transferBytes).toBe(variant.fileBytes);expect(record.frames).toBe(120);
      records.push(record);
      await page.locator('#scene').screenshot({path:`docs/tripo-rock-spike/images/web-${variant.id}-front.png`,style:'.scene-heading,.view-controls,.scene-footer { visibility:hidden!important; }'});
      if(['original-4k','50k-2k','20k-2k','10k-1k','5k-1k'].includes(variant.id)) {
        for(const [angle,label] of [['side','侧面'],['back','背面']] as const) {
          await page.getByRole('button',{name:label,exact:true}).click();
          await expect(page.locator('#scene')).toHaveAttribute('data-angle',angle);
          await page.locator('#scene').screenshot({path:`docs/tripo-rock-spike/images/web-${variant.id}-${angle}.png`,style:'.scene-heading,.view-controls,.scene-footer { visibility:hidden!important; }'});
        }
      }
    }
    await page.goto('/?scene=tripo-rock&rock=20k-2k&angle=site');
    await expect(page.locator('#scene')).toHaveAttribute('data-loaded','true');
    await page.locator('#scene').screenshot({path:'docs/tripo-rock-spike/images/web-site-with-rock.png',style:'.scene-heading,.view-controls,.scene-footer { visibility:hidden!important; }'});
    await page.getByRole('button',{name:'显示岩石',exact:true}).click();
    await expect(page.locator('#scene')).toHaveAttribute('data-rock-visible','false');
    await expect(page.locator('#scene')).toHaveAttribute('data-performance',/.+/);
    records.push(await page.locator('#scene').evaluate((canvas)=>JSON.parse(canvas.dataset.performance??'{}') as Record<string,unknown>));
    await page.locator('#scene').screenshot({path:'docs/tripo-rock-spike/images/web-site-baseline.png',style:'.scene-heading,.view-controls,.scene-footer { visibility:hidden!important; }'});
    expect(errors).toEqual([]);
    await writeFile('artifacts/tripo-rock/browser-desktop.json',JSON.stringify({browser:browser.version(),errors,records},null,2)+'\n');
  });
  test('mobile viewport loads compact candidates and keeps toggle/variant switching usable',async({page,browser})=>{
    test.setTimeout(120_000);
    const errors: string[]=[];page.on('pageerror',(e)=>errors.push(e.message));
    page.on('console',(m)=>{if(['error','warning'].includes(m.type()))errors.push(m.text());});
    await page.setViewportSize({width:390,height:844});
    const records: Record<string,unknown>[]=[];
    for(const id of ['original-4k','50k-2k','20k-2k','10k-1k','5k-1k']) {
      await page.goto(`/?scene=tripo-rock&rock=${id}&angle=front`);
      await expect(page.locator('#scene')).toHaveAttribute('data-loaded','true',{timeout:30_000});
      await expect(page.locator('#scene')).toHaveAttribute('data-performance',/.+/,{timeout:30_000});
      records.push(await page.locator('#scene').evaluate((canvas)=>JSON.parse(canvas.dataset.performance??'{}') as Record<string,unknown>));
      await page.locator('#scene').screenshot({path:`docs/tripo-rock-spike/images/mobile-${id}.png`,style:'.scene-heading,.view-controls,.scene-footer { visibility:hidden!important; }'});
      expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
    }
    await page.selectOption('#rock-geometry','20k');await page.selectOption('#rock-texture','2k');
    await expect(page.locator('#scene')).toHaveAttribute('data-variant','20k-2k');
    await page.getByRole('button',{name:'背面',exact:true}).click();await expect(page.locator('#scene')).toHaveAttribute('data-angle','back');
    await page.screenshot({path:'docs/tripo-rock-spike/images/mobile-ui.png',fullPage:true});
    expect(errors).toEqual([]);
    await writeFile('artifacts/tripo-rock/browser-mobile.json',JSON.stringify({browser:browser.version(),device:'desktop Chrome with 390×844 viewport; not a physical phone',errors,records},null,2)+'\n');
  });
  test('missing local candidate shows regeneration instructions and baseline remains accessible',async({page})=>{
    await page.route('**/assets/models/tripo-rock/rock-20k-2k.glb',(route)=>route.fulfill({status:404,body:'Missing local GLB'}));
    await page.goto('/?scene=tripo-rock&rock=20k-2k');
    await expect(page.locator('#error-panel')).toContainText('tripo:pipeline');
    await page.getByRole('link',{name:'返回 M2.1 基线 ↗'}).click();
    await expect(page.locator('#scene')).toHaveAttribute('data-version','island_cottage_blockout_v2');
    await expect(page.locator('#scene')).toHaveAttribute('data-loaded','true');
  });
});
