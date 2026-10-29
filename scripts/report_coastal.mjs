import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../', import.meta.url));
const json = async (path) => JSON.parse(await readFile(resolve(root, path), 'utf8'));
const config = await json('art-source/tripo/coastal_pipeline.json'), manifest = await json(config.manifest), preset = await json(config.placements);
const validation = await json(`${config.reports}/validation.json`), repeat = await json(`${config.reports}/reproducibility.json`), checks = await json(`${config.reports}/checks.json`);
const desktop = await json(`${config.reports}/browser-desktop.json`), mobile = await json(`${config.reports}/browser-mobile.json`);
const audits = await Promise.all(manifest.assets.map((asset) => json(`${config.reports}/${asset.id}/optimization.json`)));
assert.ok(validation.passed && checks.passed && repeat.passed);
assert.equal(preset.placements.length, validation.contacts.length);
const desktopViewport = desktop.records[0].viewport;
const output = resolve(root, config.evidence);
await mkdir(output, { recursive: true });
const image = async (name) => `data:image/png;base64,${(await readFile(resolve(output, name + '.png'))).toString('base64')}`;
const original = resolve(root, 'docs/references/golden-reference-v1.png');
let reference, referenceSource;
if (existsSync(original)) {
  const bytes = await readFile(original);
  const sha = createHash('sha256').update(bytes).digest('hex');
  assert.equal(sha, '6d538a42441a2c9b5b2e6736522687fa85aef08b8d87e1a71b0fa3ec2a1e61e3', 'Golden Reference was changed');
  reference = `<svg viewBox="0 0 969 684"><image href="data:image/png;base64,${bytes.toString('base64')}" width="1536" height="1024"/></svg>`;
  referenceSource = 'unchanged local Golden Reference V1 main-panel crop; SHA-256 ' + sha;
} else {
  const bytes = await readFile(resolve(root, 'docs/screenshots/m2.1/reference-comparison.png'));
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  reference = `<svg viewBox="${width * 0.558} ${height * 0.139} ${width * 0.366} ${height * 0.227}"><image href="data:image/png;base64,${bytes.toString('base64')}" width="${width}" height="${height}"/></svg>`;
  referenceSource = 'existing committed reference-comparison crop; original not available';
}
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_BROWSER_PATH || (existsSync(chrome) ? chrome : undefined), headless: true });
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  const style = '<style>body{margin:0;padding:24px;background:#eff1e8;color:#344238;font-family:Segoe UI,Microsoft YaHei,sans-serif}h1{font-size:25px;margin:0 0 10px}p{font-size:13px;color:#687761;margin:0 0 16px}.row{display:grid;gap:12px}article{background:#e0e6db;border-radius:6px;overflow:hidden}label{display:block;padding:10px;background:#d5dece;font-size:13px}img,svg{display:block;width:100%;height:400px;object-fit:contain}.audit img{height:235px}</style>';
  const capture = async (name, content, width = 1800, height = 570) => {
    await page.setViewportSize({ width, height }); await page.setContent(style + content);
    await page.locator('img').evaluateAll((images) => Promise.all(images.map((item) => item.decode())));
    await page.screenshot({ path: resolve(output, name + '.png'), fullPage: true });
  };
  const sceneCrop = async (name) => `<svg viewBox="${desktopViewport.width * 0.2} ${desktopViewport.height * 0.1} ${desktopViewport.width * 0.65} ${desktopViewport.height * 0.9}"><image href="${await image(name)}" width="${desktopViewport.width}" height="${desktopViewport.height}"/></svg>`;
  await capture('golden-comparison', `<h1>M2.2 海岸拼装 · Golden Reference V1 对照</h1><p>Web A/B 相同固定相机 / 灯光 / 曝光 / 视口，取同一裁剪区域。右侧为原概念主视角裁剪；概念没有可验证的 3D 相机和灯光参数，不宣称像素或投影一致。</p><div class="row" style="grid-template-columns:repeat(3,1fr)"><article><label>M2.1 原始海岸</label>${await sceneCrop('baseline-golden-10k-1k')}</article><article><label>M2.2 局部拼装 · 10k/1K</label>${await sceneCrop('assembly-golden-10k-1k')}</article><article><label>Golden Reference V1 · 主视角</label>${reference}</article></div>`);
  await capture('lod-comparison', `<h1>相同拼装 / 相机 / 光照 · 两档优化预算</h1><p>四份唯一资产，五个实例；A4 重用共享几何/贴图。未进行高低模法线烘焙。</p><div class="row" style="grid-template-columns:1fr 1fr"><article><label>10k/1K</label><img src="${await image('assembly-front-10k-1k')}"/></article><article><label>20k/2K</label><img src="${await image('assembly-front-20k-2k')}"/></article></div>`);
  let cells = '';
  for (const asset of manifest.assets) for (const view of ['front', 'left', 'right', 'back', 'top']) cells += `<article><label>${asset.id} 原始 · ${view}</label><img src="${await image(`${asset.id}-original-${view}`)}"/></article>`;
  await capture('source-audit', `<h1>A1–A4 原始模型审计 · 正 / 左 / 右 / 背 / 顶</h1><p>Blender 脚本自动渲染；源文件只读。A1 原始含微小开放碎片，优化副本显式清理；其余样本闭合单壳。</p><div class="row audit" style="grid-template-columns:repeat(5,1fr)">${cells}</div>`, 1800, 1350);
  const spatial = await json('docs/m2.1-v1/spatial-report.json'), outline = spatial.land.outlines?.[0] ?? spatial.terrain?.outlines?.[0];
  const colors = { A1: '#bf9369', A2: '#b7a27b', A3: '#cbad87', A4: '#9fac86' };
  const house = validation.worldScale.house, pier = validation.worldScale.pier, island = validation.worldScale.island;
  const plan = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-16 -14 32 34" style="background:#6d9397"><style>text{font:0.55px Segoe UI,Microsoft YaHei;fill:#27372e}rect,path{stroke:#34453c;stroke-width:0.05}</style><path d="M${outline.map((point) => point.join(',')).join(' L')} Z" fill="#a2b08c"/><rect x="${house.center[0] - house.width / 2}" y="${house.center[1] - house.depth / 2}" width="${house.width}" height="${house.depth}" fill="#caad8d"/><text x="${house.center[0] - 1.6}" y="${house.center[1]}">6×6m house</text><rect x="${island.mainStairX - island.mainStairWidth / 2}" y="${island.mainStairStartZ}" width="${island.mainStairWidth}" height="${pier.startZ - island.mainStairStartZ}" fill="#d4c09d"/><rect x="${island.mainStairX - pier.width / 2}" y="${pier.startZ}" width="${pier.width}" height="${pier.length}" fill="#997b58"/>${validation.contacts.map((contact) => `<rect x="${contact.min[0]}" y="${contact.min[2]}" width="${contact.max[0] - contact.min[0]}" height="${contact.max[2] - contact.min[2]}" fill="${colors[contact.asset]}" fill-opacity=".45"/><text x="${contact.min[0]}" y="${contact.min[2] + 0.6}">${contact.asset} ${contact.instance}</text>`).join('')}<text x="-14" y="-12">World X right / +Z down; boxes = conservative bounds</text><text x="-14" y="18">Stairs / pier / house protected; Tripo is visual decoration.</text></svg>`;
  await writeFile(resolve(output, 'placement-plan.svg'), plan);
  await capture('placement-plan', `<h1>真实世界尺度 · 局部摆放依据</h1><p>原台地边缘与房屋/楼梯/码头，叠加实际变换后模块包围盒；此图为 X/Z 平面，不等于渲染遮挡或可行走范围。</p>${plan}`, 1000, 1050);
} finally { await browser.close(); }

const mib = (bytes) => (bytes / 1048576).toFixed(2);
const assetRows = manifest.assets.map((asset, index) => `| ${asset.id} | ${asset.sourceTriangles.toLocaleString()} | ${mib(asset.sourceBytes)} | ${audits[index].sourceTopology.connectedShellCount} | ${audits[index].sourceTopology.boundaryEdges} | ${asset.variants.find((variant) => variant.id === '10k-1k').dimensions.map((n) => n.toFixed(2)).join(' × ')} |`).join('\n');
const lodRows = manifest.assets.flatMap((asset) => asset.variants.map((variant) => `| ${asset.id} | ${variant.id} | ${variant.triangleCount.toLocaleString()} | ${mib(variant.fileBytes)} | ${variant.images.map((image) => image.dimensions.join('×')).join(' / ')} | ${mib(variant.gpuTextureRgbaMipEstimateBytes)} |`)).join('\n');
const perfRows = (records) => records.map((record) => `| ${record.viewport.width}×${record.viewport.height} | ${record.mode} / ${record.lod} | ${record.instances} / ${record.uniqueAssets} | ${record.drawCalls} | ${record.triangles.toLocaleString()} | ${mib(record.transferBytes)} | ${mib(record.textureEstimateBytes)} | ${record.fetchMs.toFixed(1)} / ${record.parseMs.toFixed(1)} | ${record.fps.toFixed(2)} | ${record.frameP95Ms.toFixed(2)} |`).join('\n');
const budget = (lod) => manifest.assets.reduce((sum, asset) => sum + asset.variants.find((variant) => variant.id === lod).fileBytes, 0);
const results = `# M2.2 海岸模块拼装实验 — 验收报告

日期：2026-10-29。分支：\`codex/m2-2-coastal-assembly\`，从用户指定的当前 Tripo 实验分支建立；基线资产按 \`${config.baselineRef}\` 校验。状态：**工程流程与回归通过；视觉闸门未批准，停止等待人工审图。** 未合并，未购买/生成新 Tripo 模型，未进入下一轮大范围重建。

## 结论

A1–A4 都已检测、优化、规范化并在局部海岸拼装。默认 **10k/1K** 为五实例约 50k 三角形、四份唯一 GLB 合计 ${mib(budget('10k-1k'))} MiB、贴图估算 64 MiB；近景备选 **20k/2K** 为约 100k 三角形、${mib(budget('20k-2k'))} MiB、贴图估算 256 MiB。A4 的两个实例共享几何与贴图，仅材质颜色乘数不同。当前局部岩块比原低面数占位更有裂隙和不规则边缘，但**白模与带纹理岩石的材质断层、台地上沿接缝及堆叠/块状感仍明显，不声称已经达到 Golden Reference 的自然完整海岸**。

![Golden 主视角对照](images/golden-comparison.png)

Web A/B 使用现有 exterior 原参数：target [0,3.4,3]，yaw 35°，pitch 42°，distance 40m，FOV 35°，原 Hemisphere=1.05、Sun=2、曝光=1，完全相同视口；上图 Web 两列使用同一 x=${desktopViewport.width * 0.2}, y=${desktopViewport.height * 0.1}, w=${desktopViewport.width * 0.65}, h=${desktopViewport.height * 0.9} 裁剪，完整截图另存，便于与概念的岛屿占画比例对照。Golden Reference 取 ${referenceSource}；概念画没有可验证的相机/灯光数据，故右列是主视角风格对照，不能称为相同投影或灯光复现。未改动或生成新参考。

## 原始资产审计

| ID | 原始 tris | 原始 MiB | 壳体 | 开放边 | 规范化尺寸 X/Y/Z m（10k） |
| --- | ---: | ---: | ---: | ---: | --- |
${assetRows}

四份输入实际均为一 mesh / 一 primitive / 一 material / 三张 4096² 嵌入图：baseColor JPEG、ORM JPEG、normal PNG，有 UV 与法线。标准 glTF Y-up；Blender 导入 Z-up，再标准导出 Y-up。原始 SHA、节点/材质/纹理/范围在 \`artifacts/coastal-assembly/A*/inspection.json\` 和 [asset-manifest.json](asset-manifest.json)。原始 GLB 保持字节哈希不变。

A1 有 10 个壳体：主壳 996,176 顶点，加 9 个 3–4 顶点微小碎片，共 28 顶点，24 条开放/非流形边。仅在复制的中间高模清除配置阈值 ≤32 顶点的碎片，限制删除总数 <0.1%；原始参照高模保留。清理后和两档 LOD 为闭合单壳，实际清理统计见 A1 optimization.cleanup。A2–A4 原始为闭合单壳。闭合性不证明无内部自交或隐藏面；未执行可靠的内部面剔除。

扩展只有未使用的 \`KHR_materials_volume\` / \`FB_ngon_encoding\` 声明，没有 required 或实际材质扩展 payload；本次转换成标准 PBR。未来多 mesh、多材质、多 primitive、实际扩展或不同贴图绑定会明确报错，需要显式转换；不假设所有 Tripo 输入都兼容。

![原始各面](images/source-audit.png)

A1 是块状岩石团而非薄壁：源高度/宽度约 0.565，规范化宽 5.8m 后高约 3.28m。A2/A3/A4 高度分别约 2.08/2.28/1.03m。按实测尺寸与现有台地 3.8m 配置，不采用此前估算。多视图样本的侧背有可用体积，但仍保留规则层状裂纹及重复石块纹理。

## 批处理 / LOD

| ID | LOD | 实际 tris | GLB MiB | 三图尺寸 | RGBA+mip 估算 MiB |
| --- | --- | ---: | ---: | --- | ---: |
${lodRows}

Blender ${audits[0].blenderVersion} 背景脚本：自动导入、原始拓扑审计、底部中心锚点和均匀 X 宽归一化、可选微碎片清理、渐进 COLLAPSE/QEM 20k→10k、缩图、导出几何和重新装配原始 PBR 材质字段。工作目录保留 master、原始贴图/纯几何缓存、原始 GLB 字节副本和中间 10k/2K、20k/1K 候选；Web manifest 仅公布两档规定候选。

baseColor sRGB；normal/ORM linear，ORM G=roughness、B=metalness；UV 和切线空间 normal 图保留，**没有 high→low 法线烘焙**。没有 KTX2、Draco 或 mandatory decoder；JPEG/PNG 解码由浏览器/GLTFLoader 完成，mipmap 由 Three.js 生成。估算按三张 RGBA8 + 完整 mip 链，不代表真实 VRAM。

重复优化两次，8 个候选检查通过；统计容差为 triangles 0.5%、GLB bytes 0.1%、尺寸 0.02m，三图尺寸与贴图 SHA 必须完全一致。${repeat.comparisons.filter((item) => item.byteIdentical).length}/8 的完整文件 SHA 相同；不保证字节相同，始终以当次 manifest 为准。详见 \`reproducibility.json\`。

![两档近景](images/lod-comparison.png)

## 局部拼装与原结构保护

摆放来自 \`public/assets/presets/coastal-assembly.json\`；五个实例覆盖前/东侧弧段，台地边缘保守估算 ${validation.footprintEstimate.coveredArcM.toFixed(2)} / ${validation.footprintEstimate.perimeterM.toFixed(2)}m，即 **${validation.footprintEstimate.percent.toFixed(1)}%**。这是原边缘线段中点落入世界 AABB 的占地估计，不是屏幕可见占比、全海岸真实表面积或可行走面积。

房屋 6×6m、house center [2,-1]、地上 floorY=4、地下室 floorY=1.2；台地 3.8、海滩 0.45；楼梯 x=-2.3、startZ=4.3、宽1.6，码头 startZ=11.8、长5、宽1.8、deckY=0.65。参数、原 GLB/Blender 和 manifest 哈希均与基线一致，所有实例世界包围盒避开房屋/地下室/外楼梯/码头保护体。

原 Terrain、可行走面、房屋地基、地下室 cavity、台地、楼梯和码头不变，未增加 Tripo 碰撞/寻路/地形职责。实验拼装模式仅隐藏被覆盖的两个 \`Coastal_Rock_Visual_02/03\` 装饰占位；baseline 模式恢复，独立 M2.1 页面完全保留。两个 A4 上沿嵌入原地形和相邻岩块，中心向下射线有支撑；该检查不保证每个悬挑位置都无视觉裂缝。

A1 Y scale=1.2、A2 [1.15,1.2,0.95]、A3 [1.1,1.15,0.95]；其余缩放见 JSON，全部在 0.8–1.2，最大非等比比值 ≤1.3。没有镜像、负缩放；Three.js 标准法线矩阵处理缩放。轻微蓝通道颜色乘数缓和偏黄，但未重画贴图或替换粗糙度图。近景须继续人工检查拉伸和砌墙感。

![摆放依据](images/placement-plan.png)

## 实测性能

Chrome ${desktop.browser}，GPU：${desktop.records[0].gpu}。60 帧预热 + 120 RAF 间隔；CPU render 提交 p95 另见 JSON，不含 GPU 完成。模型数列为实例 / 唯一资产；draw calls / render triangles 含阴影、基线及视锥裁剪；GLB bytes 和贴图估算只计额外 Tripo 模块。fetch/parse 为 localhost 顺序加载累计，不代表互联网冷下载。

| canvas | 配置 | 实例/资产 | calls | render tris | GLB MiB | texture MiB | fetch/parse ms | FPS | frame p95 ms |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${perfRows(desktop.records)}

模拟移动和窄面板均在同一桌面 Chrome/GPU，**不是真机手机测试**。移动默认 10k/1K，额外纹理估算64MiB；20k/2K 升至256MiB，不能据桌面表现承诺物理手机内存安全。

| canvas | 配置 | 实例/资产 | calls | render tris | GLB MiB | texture MiB | fetch/parse ms | FPS | frame p95 ms |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${perfRows(mobile.records)}

若各配置贴近60 FPS，只能说明这台桌面和本轮采样没有掉帧，受刷新率限制，不证明帧率提高或支持大量复制。完整加载、帧时长、CPU提交和移动窗口数据在 \`browser-{desktop,mobile,modules}.json\`。

## 自动验收 / 已知问题 / 停止点

- [x] 输入只读，四资产原始五面截图、审计和8候选验证；规范化、PBR绑定、UV/法线、轴/原点与世界尺寸通过。
- [x] 一键命令完整运行、逐项重跑、重复统计校验，lint、strict typecheck、build、**${checks.unitTestsPassed} 单元 / ${checks.browserTestsPassed} 浏览器测试**通过。浏览器覆盖 A/B、模块检查、两档LOD、缺 GLB/不完整manifest提示和移动布局；旧 M1/M2/Tripo 回归通过。${checks.followUp ? `最终海岸代码另跑 ${checks.followUp.coastalTestsPassed} 项（含新增初始加载切换回归），与未变的14项基础/Tripo回归合计覆盖当前20项；checks.json保留两次验证的范围。` : ''}
- [x] M2.1 原资产参数/二进制不变，实验开关和返回可用；原始/生成大 GLB 与 Blender/纹理缓存被忽略。
- [ ] **视觉闸门未批准**：局部带纹理区域与白模界限、上沿缺乏薄过渡带、岩石堆的规则块/裂纹感仍存在；背/顶近景不能代表无接缝。与 Golden 的岩块尺度、明亮石灰岩色和整体海岸风格有明显差异。
- [ ] 真机与长时间GPU内存验证未做；20k/2K 的额外256MiB估算明显增大，正式采用前需要预算审查。

本次在可审查的局部实验交付处停止，**不宣称视觉完成、不扩大到全岛、不合并、不购买或生成替代资产**。后续候选需求：薄的崖顶/土层过渡、斜坡连接、较大且少裂纹的浅色海蚀块、少量不同尺度的岸脚石；先由人工审图决定是否增加。

## 操作与交付

\`npm run coastal:pipeline\`；单项重跑 \`npm run coastal:optimize -- --asset A1\`。详见 [工作流](PIPELINE.md)。[近景](images/assembly-front-10k-1k.png)、[转角](images/assembly-corner-10k-1k.png)、[背面](images/assembly-back-10k-1k.png)、[顶部](images/assembly-top-10k-1k.png)、[手机宽度UI](images/mobile-ui.png)。源/导出二进制仅本地保存，可从参数重建；Git提交代码、配置、asset-manifest、审计/验证/复现/性能JSON和截图。

主要改动：\`scripts/{coastal_batch.mjs,coastal_pipeline.mjs,validate_coastal.mjs,report_coastal.mjs,render_coastal.py,glb_geometry.mjs,optimize_tripo_asset.py}\`；\`src/{app/CoastalApplication.ts,config/coastal.ts,world/coastal.ts,core/frameMetrics.ts,main.ts,style.css}\`；\`art-source/tripo/coastal_pipeline.json\`、\`public/assets/{manifests/coastal-assembly.json,presets/coastal-assembly.json}\`；两组coastal测试；\`package.json\`、\`.gitignore\` 与本报告。生产 build 保留 Three.js 共用 chunk >500kB 的体积提示；未掩盖该提示。
`;
await writeFile(resolve(root, 'docs/m2.2-coastal-assembly/RESULTS.md'), results);
await writeFile(resolve(root, 'docs/m2.2-coastal-assembly/asset-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
await writeFile(resolve(root, 'docs/m2.2-coastal-assembly/acceptance.json'), JSON.stringify({ engineeringPassed: true, visualApproved: false, status: 'stopped-awaiting-human-review', sourceReference: referenceSource, checks, knownIssues: ['textured/clay material boundary', 'plateau lip transitions', 'blocky/repeated fracture pattern', 'no physical mobile test', '20k/2K extra estimated 256MiB texture budget'] }, null, 2) + '\n');
process.stdout.write('Coastal Golden comparison, source audit, placement plan and acceptance report written; visual approval remains pending.\n');
