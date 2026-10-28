import { readFile, mkdir } from 'node:fs/promises';
import { URL, fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import process from 'node:process';
import { chromium } from 'playwright';

// Static PNG evidence from actual screenshots + the user's unchanged local reference.
// No image generation, reference substitution, or external network is involved.
const root=fileURLToPath(new URL('../',import.meta.url));
const output=resolve(root,'docs/screenshots/m2.1');
await mkdir(output,{recursive:true});
const report=JSON.parse(await readFile(resolve(root,'docs/m2.1/spatial-report.json'),'utf8'));
const referenceBytes=await readFile(resolve(root,'docs/references/golden-reference-v1.png'));
const dataUrl=(bytes)=>`data:image/png;base64,${bytes.toString('base64')}`;
const reference=dataUrl(referenceBytes);
const refWidth=referenceBytes.readUInt32BE(16),refHeight=referenceBytes.readUInt32BE(20);
const image=async(file)=>dataUrl(await readFile(resolve(output,file)));
const defaultChrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser=await chromium.launch({ ...(process.env.PLAYWRIGHT_BROWSER_PATH ? {executablePath:process.env.PLAYWRIGHT_BROWSER_PATH}
  : existsSync(defaultChrome) ? {executablePath:defaultChrome} : {}), headless:true });
try {
  const page=await browser.newPage({viewport:{width:1800,height:2000},deviceScaleFactor:1});
  const crop=(x,y,w,h)=>`<svg viewBox="${x} ${y} ${w} ${h}" xmlns="http://www.w3.org/2000/svg"><defs><clipPath id="crop-${x}-${y}"><rect x="${x}" y="${y}" width="${w}" height="${h}"/></clipPath></defs><image href="${reference}" width="${refWidth}" height="${refHeight}" clip-path="url(#crop-${x}-${y})"/></svg>`;
  const rows=[
    ['exterior','01 外景 · 岛屿与小屋','可用陆地 324㎡ / 小屋 36㎡ = 9.00× · L 形庭院 30.15㎡',[0,0,969,684]],
    ['ground-floor','02 一层剖视 · 房间与洞口','净高 2.70 m · 后左角双跑 U 形梯 · 楼板真实开洞',[970,0,566,381]],
    ['basement','03 地下室剖视 · 岩层与楼梯','净高 2.40 m · 16 级 × 0.175 m · 地板 Y=2.20 m',[970,383,566,301]],
  ];
  let html='<header><small>M2.1 / SPATIAL REVIEW</small><h1>空间白模 × Golden Reference V1</h1><p>只比较比例、空间和结构；材质与植被细节留待后续。</p></header>';
  for(const [mode,title,note,bounds] of rows) {
    html+=`<section><h2>${title}</h2><p>${note}</p><div class="pair"><article><label>THREE.JS · 固定机位白模</label><img src="${await image('web-'+mode+'.png')}"/></article><article><label>GOLDEN REFERENCE V1 · 对应原图区域</label>${crop(...bounds)}</article></div></section>`;
  }
  const style='body{margin:0;padding:38px;background:#f3f4ee;color:#35473a;font-family:"Segoe UI","Microsoft YaHei",sans-serif}header{margin-bottom:25px}small{letter-spacing:3px;color:#738471}h1{font-size:32px;margin:10px 0}p{font-size:15px;color:#758370;margin:9px 0 18px}h2{font-size:22px;margin:0 0 7px}section{margin-bottom:28px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:18px}article{background:#e3e7e4;border:1px solid #d1d8ce;border-radius:10px;overflow:hidden}label{display:block;padding:14px 18px;background:#fafbf4;font-size:12px;letter-spacing:1px}img,article svg{display:block;width:100%;height:465px;object-fit:contain}';
  await page.setContent(`<style>${style}</style>${html}`);
  await page.locator('img').evaluateAll((images)=>Promise.all(images.map((image)=>image.decode())));
  await page.screenshot({path:resolve(output,'reference-comparison.png'),fullPage:true});

  const h=report.house,s=report.stair;
  const plan=(rooms,level,title,offset)=>{
    const scale=68, ox=offset+80, oy=110;
    const X=(x)=>ox+(x+h.width/2)*scale, Z=(z)=>oy+(z+h.depth/2)*scale;
    let svg=`<text x="${offset+80}" y="38" class="title">${title}</text><text x="${offset+80}" y="68" class="sub">地板 Y=${level.toFixed(2)} m · 小屋占地 ${h.width}×${h.depth} m</text><rect x="${ox}" y="${oy}" width="${h.width*scale}" height="${h.depth*scale}" fill="#fdfdf7" stroke="#67766a" stroke-width="5"/>`;
    for(const room of rooms){ const [x1,z1,x2,z2]=room.rect;svg+=`<rect x="${X(x1)}" y="${Z(z1)}" width="${(x2-x1)*scale}" height="${(z2-z1)*scale}" fill="#e1e7db" stroke="#9ba994" stroke-width="1"/><text x="${X((x1+x2)/2)}" y="${Z((z1+z2)/2)}" text-anchor="middle" class="room">${room.name}</text>`; }
    const [left,back,right,front]=s.footprint;
    svg+=`<rect x="${X(left)}" y="${Z(back)}" width="${(right-left)*scale}" height="${(front-back)*scale}" fill="#e5d4ac" stroke="#a78c55" stroke-width="2"/>`;
    for(let n=1;n<8;n++)for(const lane of [0,1]) {
      const xx=left+lane*(s.flightWidth+0.15);
      const zz=front-n*s.tread;
      svg+=`<path d="M ${X(xx)} ${Z(zz)} H ${X(xx+s.flightWidth)}" stroke="#b8a273"/>`;
    }
    svg+=`<text x="${X((left+right)/2)}" y="${Z(back+0.55)}" text-anchor="middle" class="room">U 形连接梯</text><text x="${X((left+right)/2)}" y="${Z(front-0.3)}" text-anchor="middle" class="sub">${(right-left).toFixed(2)}×${(front-back).toFixed(2)} m</text>`;
    for(const points of Object.values(report.circulation.routes)) {
      if(points[0][0] !== (title==='一层平面'?'ground':'basement'))continue;
      svg+=`<polyline points="${points.map(([,point])=>`${X(point[0])},${Z(point[1])}`).join(' ')}" fill="none" stroke="#6a957b" stroke-width="3" stroke-dasharray="5 4"/>`;
    }
    svg+=`<text x="${offset+80}" y="565" class="sub">↑ 后侧 −Z / 前侧 +Z ↓ · 分区包络不等同于净房间面积</text>`;
    return svg;
  };
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1300" height="620"><style>.title{font:600 24px "Microsoft YaHei",sans-serif;fill:#3a4f3d}.sub{font:13px "Microsoft YaHei",sans-serif;fill:#77816d}.room{font:12px "Segoe UI",sans-serif;fill:#55654f}</style><rect width="1300" height="620" fill="#f4f5ed"/>${plan(h.groundRooms,h.floorY,'一层平面',0)}${plan(h.basementRooms,h.basementFloorY,'地下室平面',650)}</svg>`;
  await page.setViewportSize({width:1300,height:620});
  await page.setContent(`<style>body{margin:0}</style>${svg}`);
  await page.screenshot({path:resolve(output,'floor-plan-check.png')});

  const sectionImage=await image('blender-section.png');
  const Y=(y)=>515-y*43;
  let sectionSvg='<svg viewBox="0 0 400 600" xmlns="http://www.w3.org/2000/svg">';
  sectionSvg+='<text x="35" y="40" font-size="21" fill="#3a4f3d">实际 GLB 高度检查</text>';
  for(const [y,label] of [[0,'海面 Y=0'],[h.basementFloorY,`地下室地板 ${h.basementFloorY.toFixed(2)} m`],[h.basementCeilingY,`地下室顶 ${h.basementCeilingY.toFixed(2)} m`],[h.floorY,`一层地板 ${h.floorY.toFixed(2)} m`],[h.groundCeilingY,`一层顶 ${h.groundCeilingY.toFixed(2)} m`]]) {
    sectionSvg+=`<path d="M 35 ${Y(y)} H 190" stroke="#a6b29e" stroke-width="2"/><text x="205" y="${Y(y)+4}" font-size="11" fill="#677862">${label}</text>`;
  }
  sectionSvg+=`<rect x="35" y="${Y(h.groundCeilingY)}" width="155" height="${h.clearHeight*43}" fill="#dfe7d9"/><rect x="35" y="${Y(h.basementCeilingY)}" width="155" height="${h.basementClearHeight*43}" fill="#ddd4ba"/>`;
  sectionSvg+=`<text x="65" y="${Y((h.floorY+h.groundCeilingY)/2)}" font-size="16" fill="#4c634b">一层 2.70 m</text><text x="60" y="${Y((h.basementFloorY+h.basementCeilingY)/2)}" font-size="16" fill="#796842">地下室 2.40 m</text><text x="35" y="555" font-size="13" fill="#718067">层间高差 2.80 m · 16 个踏步</text><text x="35" y="579" font-size="13" fill="#718067">踏高 0.175 m / 踏面 0.275 m</text></svg>`;
  await page.setViewportSize({width:1400,height:680});
  await page.setContent(`<style>body{margin:0;background:#f4f5ed;font-family:"Microsoft YaHei",sans-serif}.section{display:grid;grid-template-columns:1000px 400px;align-items:center;height:680px}img{width:1000px;height:650px;object-fit:contain}</style><div class="section"><img src="${sectionImage}"/>${sectionSvg}</div>`);
  await page.locator('img').evaluateAll((images)=>Promise.all(images.map((image)=>image.decode())));
  await page.screenshot({path:resolve(output,'height-and-stair-check.png')});
  process.stdout.write(`Wrote reference-comparison.png, floor-plan-check.png, height-and-stair-check.png to ${output}\n`);
} finally { await browser.close(); }
