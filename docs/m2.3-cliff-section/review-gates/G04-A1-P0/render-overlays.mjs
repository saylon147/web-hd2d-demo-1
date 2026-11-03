// Offline review drawing only. Shared screen-space design; no Three.js scene changes.
/* global document, Image, requestAnimationFrame, innerWidth, innerHeight */
import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';

const output = new URL('./', import.meta.url);
const baseline = new URL('../G04-A0/', output);
const bytes = await readFile(new URL('default-golden.png', baseline));
const sha = (data) => createHash('sha256').update(data).digest('hex');
const inventory = JSON.parse(await readFile(new URL('inventory.json', baseline), 'utf8'));
const source = `data:image/png;base64,${bytes.toString('base64')}`;
const crop = inventory.goldenCloseCrop;

// All points below use the ORIGINAL 1600 x 811 Golden image, never world coordinates.
// Four unequal visual masses: broad core, inset crown, right return, low foreground foot.
const outline = 'M958 625 L973 612 L980 600 L1006 599 L1022 606 L1041 604 L1066 613 L1077 631 L1093 646 L1092 663 L1082 676 L1094 685 L1095 705 L1085 728 L1062 735 L1047 728 L1024 721 L1009 707 L991 702 L976 689 L961 690 L953 675 L955 654 L961 640 Z';
const masses = [
  { id: '1', title: '宽厚主支撑体', point: [1001, 670], faces: [
    ['M958 625 L965 650 L981 642 L1012 645 L1028 638 L1057 633 L1049 657 L1046 680 L1036 691 L1033 715 L1009 707 L991 702 L976 689 L961 690 L953 675 L955 654 L961 640 Z', '#c8955c'],
    ['M958 625 L965 650 L981 642 L976 665 L976 689 L961 690 L953 675 L955 654 L961 640 Z', '#666477'],
    ['M1028 638 L1057 633 L1049 657 L1046 680 L1036 691 L1033 715 L1024 711 L1026 673 Z', '#977661'],
  ] },
  { id: '2', title: '内收顶折面', point: [1017, 620], faces: [
    ['M958 625 L973 612 L980 600 L1006 599 L1022 606 L1041 604 L1066 613 L1057 633 L1028 638 L1012 645 L981 642 L965 650 Z', '#e5c690'],
  ] },
  { id: '3', title: '错位右肩 / 非对称凹口', point: [1070, 655], faces: [
    ['M1057 633 L1066 613 L1077 631 L1093 646 L1076 653 L1049 657 Z', '#ddbb87'],
    ['M1049 657 L1076 653 L1093 646 L1092 663 L1082 676 L1075 692 L1046 680 Z', '#797383'],
  ] },
  { id: '4', title: '较小低位前脚', point: [1064, 710], faces: [
    ['M1046 680 L1075 692 L1082 676 L1094 685 L1081 700 L1057 708 L1036 691 Z', '#d8b77f'],
    ['M1036 691 L1057 708 L1081 700 L1094 685 L1095 705 L1085 728 L1062 735 L1047 728 L1024 721 L1033 715 Z', '#b38961'],
    ['M1081 700 L1094 685 L1095 705 L1085 728 L1062 735 L1068 721 Z', '#72697a'],
  ] },
];
const geometry = `<g id="shared-design">
  <path d="M961 690 L976 689 L991 702 L1009 707 L1024 721 L1047 728 L1062 735 L1085 728 L1080 741 L1063 747 L1040 740 L1020 735 L1004 720 L985 716 L969 704 Z" fill="#86c9cf" fill-opacity=".25" stroke="#87d8de" stroke-width="1.5" stroke-dasharray="4 4"/>
  ${masses.map((mass) => `<g data-mass="${mass.id}">${mass.faces.map(([d, fill]) => `<path d="${d}" fill="${fill}" fill-opacity=".87" stroke="#4e453d" stroke-width=".8" stroke-opacity=".6"/>`).join('')}</g>`).join('')}
  <path d="${outline}" fill="none" stroke="#302f39" stroke-width="4"/>
  <path d="${outline}" fill="none" stroke="#f9d295" stroke-width="1.6"/>
  <path d="M980 600 L1006 599 L1022 606 L1041 604" fill="none" stroke="#9bebd3" stroke-width="2.4" stroke-dasharray="5 3"/>
  <path d="M1046 680 L1075 692 L1082 676" fill="none" stroke="#363645" stroke-width="2.3"/>
  <path d="M972 697 L991 706 L1009 711 L1024 725 L1047 732 L1062 739 L1082 734" fill="none" stroke="#a8e9ed" stroke-width="2.2" stroke-dasharray="5 3"/>
  ${masses.map((mass) => `<g><circle cx="${mass.point[0]}" cy="${mass.point[1]}" r="8.5" fill="#33343b" stroke="#fff7e8" stroke-width="1.2"/><text x="${mass.point[0]}" y="${mass.point[1] + 4}" text-anchor="middle" fill="#fff7e8" font-size="12" font-weight="700">${mass.id}</text></g>`).join('')}
</g>`;

const callouts = (close) => close ? `
  <g font-size="9" fill="#fff5dd" stroke-linejoin="round">
    <path d="M1001 601 L982 569 L881 569" fill="none" stroke="#9bebd3" stroke-width="1.2"/>
    <text x="881" y="562">顶部内收；内侧接触待取样</text>
    <path d="M1082 676 L1141 661" fill="none" stroke="#ffd293" stroke-width="1.2"/>
    <text x="1143" y="660">右轮廓凹口</text>
    <path d="M959 672 L928 683 L799 683" fill="none" stroke="#a8e9ed" stroke-width="1.2"/>
    <text x="797" y="676">保留沙滩 / 楼梯负空间</text>
    <path d="M1060 739 L1091 760 L1171 760" fill="none" stroke="#a8e9ed" stroke-width="1.2"/>
    <text x="1104" y="752">水线 / 水下延续意图</text>
  </g>` : `
  <g font-size="18" fill="#fff6e5">
    <path d="M1001 601 L1190 588 L1230 588" fill="none" stroke="#9bebd3" stroke-width="1.5"/>
    <text x="1240" y="594">顶面内收 / 接触待采样</text>
    <path d="M1082 676 L1230 659" fill="none" stroke="#ffd293" stroke-width="1.5"/>
    <text x="1240" y="664">非对称右侧凹口</text>
    <path d="M1062 739 L1230 746" fill="none" stroke="#a8e9ed" stroke-width="1.5"/>
    <text x="1240" y="752">水线与水下延续意图</text>
    <path d="M959 672 L912 732 L790 732" fill="none" stroke="#a8e9ed" stroke-width="1.5"/>
    <text x="774" y="757">沙滩 / 楼梯空隙保留</text>
  </g>`;

const diagram = (viewBox, close, annotate = true) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img" aria-label="A2 前景基座屏幕空间草案"><image href="${source}" width="1600" height="811"/>${geometry}${annotate ? callouts(close) : ''}</svg>`;
const cards = `
  <div class="intro"><span class="tag">方案 S1 · 低位宽基座</span><h2>先读出连续大岩体</h2><p>4 个不等大的视觉体块。主块宽厚，右肩错位，较小前脚靠近水线；顶部向后收。</p></div>
  <ol>${masses.map((mass) => `<li><b>${mass.title}</b></li>`).join('')}</ol>
  <div class="card"><h3>轮廓先成立，再审材质</h3><p><i class="swatch" style="background:#e5c690"></i>亮顶 / 向内收的折面<br><i class="swatch" style="background:#c8955c"></i>暖主面 / 最大的支撑体<br><i class="swatch" style="background:#797383"></i>背光面 / 转折与凹口</p><p class="small">颜色只帮助读面；不是纹理、RGB 合同或已验证光照。</p></div>
  <div class="card"><h3>连接仍待验证</h3><p><span style="color:#208876">青绿虚线</span>：内侧接入原岛体的意图，上部被 A4 遮挡。<br><span style="color:#217786">浅青虚线</span>：水线与水下体积意图。</p><p class="small">都不是实测边界。A3 海湾、右主崖、顶缘接缝留待联合审图。</p></div>
  <div class="card"><h3>本轮范围</h3><p>只覆盖 A2/front-wall 前侧小窗口。房屋、沙滩、台阶、码头和其余岩块是保留的场景背景。</p><p class="small">旧 Tripo 纹理仍透出以便定位；本图不是替换后的渲染结果。</p></div>`;
const css = `<style>*{box-sizing:border-box}body{margin:0;padding:24px;background:#f0eee6;color:#293b3d;font-family:"Microsoft YaHei","Segoe UI",sans-serif}h1{font-size:29px;margin:0 0 10px;font-weight:700}h2{font-size:25px;margin:12px 0}h3{font-size:20px;margin:0 0 8px}p{font-size:18px;line-height:1.65;margin:8px 0}.subtitle{margin-bottom:18px;color:#586969}.grid{display:grid;grid-template-columns:var(--scene) 1fr;gap:22px}.scene{width:var(--scene)}svg{display:block;width:100%;font-family:"Microsoft YaHei",sans-serif}.card{padding:15px 18px;margin-top:14px;background:#faf9f3;border-left:4px solid #bac5bd}.intro{padding:12px 18px;background:#fff9e9}.tag{font-size:17px;color:#a16335}.small{font-size:16px;color:#607173}.swatch{display:inline-block;width:18px;height:18px;vertical-align:middle;margin-right:8px}ol{padding-left:40px;font-size:19px;line-height:1.9;margin:14px 0}footer{font-size:17px;line-height:1.6;margin-top:14px;color:#586969}.strip{display:flex;align-items:center;gap:16px;margin-top:14px;background:#faf9f3;padding:12px 18px}.strip svg{width:270px;flex-shrink:0}.strip p{max-width:500px;margin:0}</style>`;

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_BROWSER_PATH ?? (existsSync(chrome) ? chrome : undefined) });
const page = await browser.newPage({ deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
const figures = [];
try {
  for (const close of [false, true]) {
    const imageName = `a2-silhouette-golden${close ? '-close' : ''}.png`;
    const sceneWidth = close ? 1152 : 1600;
    await page.setViewportSize({ width: close ? 1780 : 2170, height: close ? 1180 : 1110 });
    await page.setContent(`${css}<body style="--scene:${sceneWidth}px"><h1>G04-A1-P0 / A2 前景基座 / ${close ? 'Golden-close' : 'Golden 全景'}</h1><p class="subtitle">屏幕空间造型草案 · 设计示意，未建模 · 两图共用同一轮廓和切面 · 2026-11-03</p><div class="grid"><main class="scene">${diagram(close ? crop.join(' ') : '0 0 1600 811', close)}${close ? `<div class="strip">${diagram(crop.join(' '), true, false).replace(geometry, '')}<p><b>当前默认局部 / 未覆盖</b><br>只比较同一窗口。候选大形改善须经人眼审图，再用实际 3D 小样核实。</p></div>` : ''}<footer>${close ? '固定 crop [750, 430, 540, 350] 放大；沿用 Golden 相机，未重新取景。' : '底图为 G04-A0 当前默认 Golden，完整 1600 × 811，未裁剪。'}<br>轮廓线限定局部设计；青色线为连接意图，不是世界坐标或测量几何。</footer></main><aside>${cards}</aside></div></body>`);
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(Array.from(document.querySelectorAll('svg image')).map((node) => new Promise((done, reject) => {
        const img = new Image(); img.onload = done; img.onerror = reject; img.src = node.getAttribute('href');
      })));
      await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    });
    const dimensions = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight, innerWidth, innerHeight }));
    if (dimensions.width > dimensions.innerWidth || dimensions.height > dimensions.innerHeight) throw new Error(`Review sheet overflow: ${JSON.stringify(dimensions)}`);
    await page.screenshot({ path: fileURLToPath(new URL(imageName, output)) });
    figures.push({ path: imageName, viewBox: close ? crop : [0, 0, 1600, 811], sharedGeometrySha256: sha(geometry), dimensions, sha256: sha(await readFile(new URL(imageName, output))) });
  }
  if (errors.length) throw new Error(errors.join('\n'));
  if (sha(await readFile(new URL('default-golden.png', baseline))) !== sha(bytes)) throw new Error('Baseline changed');
  await writeFile(new URL('drawing-evidence.json', output), JSON.stringify({ stage: 'G04-A1-P0: 2D screen-space design only, no model or measured interfaces', source: '../G04-A0/default-golden.png', sourceSha256: sha(bytes), originalCanvas: inventory.viewport, camera: inventory.records.find((record) => record.route === 'default' && record.view === 'golden').camera, goldenCloseCrop: crop, scheme: 'S1: broad core, inset crown, asymmetric return, small low foot', browser: browser.version(), sharedGeometrySha256: sha(geometry), figures, errors }, null, 2) + '\n');
  process.stdout.write('Generated two review PNGs from one shared design; source unchanged, images loaded, no sheet overflow or browser errors.\n');
} finally {
  await browser.close();
}
