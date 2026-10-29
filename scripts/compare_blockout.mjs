import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';
import { Buffer } from 'node:buffer';
import { resolve } from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';
import { floorPlans, landPlan, sectionOverlay } from './evidence_plans.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const output=resolve(root,'docs/screenshots/m2.1-v1');
const reports=resolve(root,'docs/m2.1-v1');
await mkdir(output,{recursive:true});
const report=JSON.parse(await readFile(resolve(reports,'spatial-report.json'),'utf8'));
const runtime=JSON.parse(await readFile(resolve(reports,'runtime-report.json'),'utf8'));
const manifest=JSON.parse(await readFile(resolve(root,'public/assets/manifests/blockout_v2.json'),'utf8'));
if(runtime.records.some((record)=>record.modelHash!==manifest.modelSha256))throw new Error('Web evidence is stale. Run build and test:browser before evidence:compare.');
const dataUrl=(bytes)=>`data:image/png;base64,${bytes.toString('base64')}`;
const png=async(name)=>dataUrl(await readFile(resolve(output,name+'.png')));
const sha=(bytes)=>createHash('sha256').update(bytes).digest('hex');
const original=resolve(root,'docs/references/golden-reference-v1.png');
let referencePanel, referenceSource;
if(existsSync(original)) {
  const bytes=await readFile(original);
  if(sha(bytes)!=='6d538a42441a2c9b5b2e6736522687fa85aef08b8d87e1a71b0fa3ec2a1e61e3')throw new Error('Golden Reference hash mismatch; original must remain unchanged.');
  referencePanel=`<svg viewBox="0 0 969 684"><defs><clipPath id="golden-crop"><rect width="969" height="684"/></clipPath></defs><image href="${dataUrl(bytes)}" width="1536" height="1024" clip-path="url(#golden-crop)"/></svg>`;
  referenceSource='unchanged local Golden Reference V1 crop';
} else {
  const bytes=await readFile(resolve(root,'docs/screenshots/m2.1/reference-comparison.png'));
  const w=bytes.readUInt32BE(16), h=bytes.readUInt32BE(20);
  referencePanel=`<svg viewBox="${w*0.558} ${h*0.139} ${w*0.366} ${h*0.227}"><defs><clipPath id="golden-crop"><rect x="${w*0.558}" y="${h*0.139}" width="${w*0.366}" height="${h*0.227}"/></clipPath></defs><image href="${dataUrl(bytes)}" width="${w}" height="${h}" clip-path="url(#golden-crop)"/></svg>`;
  referenceSource='existing committed V0 comparison concept crop (original missing)';
  process.stdout.write('Local Golden Reference unavailable; using its existing committed comparison crop. No reference replacement.\n');
}
const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
const preservation=[];
for(const file of ['art-source/parameters/island_cottage_v1.json','art-source/blender/island_cottage_blockout_v1.blend',
  'public/assets/models/island_cottage_blockout_v1.glb','public/assets/models/axis_test_01.glb','public/assets/manifests/blockout_v1.json',
  ...['web-exterior','web-ground-floor','web-basement','blender-exterior','reference-comparison','floor-plan-check','height-and-stair-check'].map((name)=>`docs/screenshots/m2.1/${name}.png`)]) {
  const before=execFileSync('git',['-c',`safe.directory=${root.replaceAll('\\','/')}`,'show',`788087e:${file}`],{cwd:root,windowsHide:true,maxBuffer:32*1024*1024});
  const after=await readFile(resolve(root,file));
  const normalized=(bytes)=>file.endsWith('.json') ? Buffer.from(bytes.toString('utf8').replaceAll('\r\n','\n')) : bytes;
  if(sha(normalized(before))!==sha(normalized(after)))throw new Error(`V0 evidence changed: ${file}`);
  preservation.push({file,sha256:sha(after),normalizedSha256:sha(normalized(after)),unchanged:true});
}
await writeFile(resolve(reports,'v0-preservation.json'),JSON.stringify({baselineCommit:'788087e',files:preservation},null,2)+'\n');
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_BROWSER_PATH || (existsSync(chrome)?chrome:undefined),headless:true});
try {
  const page=await browser.newPage({deviceScaleFactor:1});
  const capture=async(name,content,width=1600,height=1000)=>{
    await page.setViewportSize({width,height});
    await page.setContent(content);
    await page.locator('img').evaluateAll((images)=>Promise.all(images.map((item)=>item.decode())));
    await page.screenshot({path:resolve(output,name+'.png'),fullPage:true});
  };
  for(const [name,svg,width,height] of [['annotated-plans',floorPlans(report),1500,835],['land-footprint',landPlan(report),1320,730],['annotated-section',sectionOverlay(report,await png('blender-section')),1440,900]]) {
    await writeFile(resolve(output,name+'.svg'),svg);
    await capture(name,`<style>body{margin:0}</style>${svg}`,width,height);
  }
  const style='<style>body{margin:0;padding:30px;background:#f2f2e9;color:#34403c;font-family:Segoe UI,Microsoft YaHei,sans-serif}h1{font-size:28px}h2{font-size:19px;margin:24px 0 8px}p{font-size:14px;color:#6a7368}.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}article{background:#e3e7e4}label{display:block;padding:12px;background:#e6e8df;font-size:13px}img,article svg{display:block;width:100%;height:430px;object-fit:contain}.wide img{height:auto}</style>';
  const pair=(leftLabel,left,rightLabel,right)=>`<div class="pair"><article><label>${leftLabel}</label>${left}</article><article><label>${rightLabel}</label>${right}</article></div>`;
  const image=(url)=>`<img src="${url}"/>`;
  const beforeAfter=pair('Web V0 · 原参数、原灯光',image(await png('web-v0-exterior')),'Web V1 · 新地形与诊断配色',image(await png('web-exterior')));
  await capture('v0-v1-exterior',`${style}<h1>M2.1 V0 → V1 · 同机位外景</h1><p>1600×866 canvas · yaw 35° / pitch 42° / distance 40 m / vertical FOV 35° · target (0,3.4,3)</p>${beforeAfter}`,1600,650);
  let sheet=`${style}<h1>M2.1 V1 修正验收 · 等待人工确认</h1><p>全套为占位白模；工程检查不等于视觉批准。V0 文件保留，Golden Reference 未修改。</p><h2>A · Web V0 / V1 同机位</h2>${beforeAfter}`;
  sheet+=`<h2>B · V1 / Golden Reference 概念裁图</h2><p>概念与 Web 透视、画幅和细节不同；比较大形、单层小屋、路径与海岸关系，不作像素配准。</p>${pair('Web V1 · 固定外景',image(await png('web-exterior')),'Golden Reference V1 · 既有概念',referencePanel)}`;
  sheet+=`<h2>C · 净尺寸平面 / 陆地面积</h2><div class="wide">${image(await png('annotated-plans'))}${image(await png('land-footprint'))}</div>`;
  sheet+=`<h2>D · 岩层、真实梯洞、楼板、海面剖切</h2><div class="wide">${image(await png('annotated-section'))}</div>`;
  sheet+=`<h2>E · Three.js 三种模式</h2>${pair('一层剖视',image(await png('web-ground-floor')),'地下室剖视',image(await png('web-basement')))}<p>外景见 A/B。室内均用同一 GLB；切换低墙 / 局部岩层切开以便检查。</p>`;
  await capture('review-sheet',sheet,1600,1000);
  await writeFile(resolve(reports,'evidence-report.json'),JSON.stringify({referenceSource,referencePerspectiveEquivalent:false,
    defaultCamera:report.views.exterior,canvasAspect:runtime.records[0]?.aspect,
    outputs:['v0-v1-exterior','review-sheet','annotated-plans','land-footprint','annotated-section'],approval:'awaiting-human'},null,2)+'\n');
  process.stdout.write(`V0 preservation checked; wrote V1 comparison, plans, land survey and physical section to ${output}\n`);
} finally { await browser.close(); }
