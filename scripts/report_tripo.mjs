import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { chromium } from 'playwright';

const root=fileURLToPath(new URL('../',import.meta.url));
const manifest=JSON.parse(await readFile(resolve(root,'public/assets/manifests/tripo_rock_spike.json'),'utf8'));
const optimization=JSON.parse(await readFile(resolve(root,'artifacts/tripo-rock/optimization.json'),'utf8'));
const desktop=JSON.parse(await readFile(resolve(root,'artifacts/tripo-rock/browser-desktop.json'),'utf8'));
const mobile=JSON.parse(await readFile(resolve(root,'artifacts/tripo-rock/browser-mobile.json'),'utf8'));
const reproducibility=JSON.parse(await readFile(resolve(root,'artifacts/tripo-rock/reproducibility.json'),'utf8'));
const imageRoot=resolve(root,'docs/tripo-rock-spike/images');
await mkdir(imageRoot,{recursive:true});
const image=async(name)=>`data:image/png;base64,${(await readFile(resolve(imageRoot,name+'.png'))).toString('base64')}`;
const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_BROWSER_PATH || (existsSync(chrome)?chrome:undefined),headless:true});
try {
  const page=await browser.newPage({deviceScaleFactor:1});
  const style='<style>body{margin:0;padding:28px;background:#eef0e6;color:#34423c;font-family:Segoe UI,Microsoft YaHei,sans-serif}h1{font-size:26px;margin:0 0 8px}p{font-size:14px;color:#6b776c;margin:0 0 18px}.row{display:grid;gap:12px}article{background:#e0e6db;overflow:hidden;border-radius:6px}label{display:block;padding:10px;background:#d6ddd1;font-size:14px}img,svg{display:block;width:100%;height:360px;object-fit:contain}.site img{height:440px}</style>';
  const render=async(name,content,width=1600,height=540)=>{
    await page.setViewportSize({width,height});await page.setContent(style+content);
    await page.locator('img').evaluateAll((images)=>Promise.all(images.map((item)=>item.decode())));
    await page.screenshot({path:resolve(imageRoot,name+'.png'),fullPage:true});
  };
  const crop=async(name,index)=>`<svg viewBox="535 215 560 545"><defs><clipPath id="crop-${index}"><rect x="535" y="215" width="560" height="545"/></clipPath></defs><image href="${await image(name)}" width="1600" height="866" clip-path="url(#crop-${index})"/></svg>`;
  let cells='';
  for(const [index,id] of ['original-4k','50k-4k','20k-4k','10k-4k','5k-4k'].entries())cells+=`<article><label>${id}</label>${await crop('web-'+id+'-front',index)}</article>`;
  await render('geometry-comparison','<h1>Tripo → 自动降面 · 几何比较</h1><p>相同 4K 源贴图、相机、灯光、1600×866 canvas；每张截取同一岩石区域。原始 1,944,098 tris / 四档目标均达到。</p><div class="row" style="grid-template-columns:repeat(5,1fr)">'+cells+'</div>');
  cells='';
  for(const [index,id] of ['20k-4k','20k-2k','20k-1k'].entries())cells+=`<article><label>${id}</label>${await crop('web-'+id+'-front',index)}</article>`;
  await render('texture-comparison','<h1>同一 20k 几何 · 4K / 2K / 1K</h1><p>保持相机与光照；4K 三张原始贴图字节保留，2K/1K 由 Blender 缩图，未进行高低模法线烘焙。</p><div class="row" style="grid-template-columns:repeat(3,1fr)">'+cells+'</div>');
  await render('site-comparison',`<h1>海岸集成 A/B · M2.1 保持原状</h1><p>同一场景/机位，右侧只添加一个 3.2 m 宽的 20k/2K 模块，未替换地形、小屋或地下室。</p><div class="row site" style="grid-template-columns:1fr 1fr"><article><label>岩石关闭</label><img src="${await image('web-site-baseline')}"/></article><article><label>岩石开启</label><img src="${await image('web-site-with-rock')}"/></article></div>`,1600,610);
  await render('back-comparison',`<h1>单图生成样本 · 背面检查</h1><p>Blender 相同 4K 材质与固定透视相机；Web 下排保留海岸背景，贴图分别为 4K / 2K。背面来源问题留给后续三视图生成。</p><div class="row" style="grid-template-columns:1fr 1fr"><article><label>Blender 原始几何 / 4K</label><img src="${await image('blender-original-back')}"/></article><article><label>Blender 20k 几何 / 4K</label><img src="${await image('blender-20k-back')}"/></article><article><label>Web 原始 / 4K</label><img src="${await image('web-original-4k-back')}"/></article><article><label>Web 20k / 2K</label><img src="${await image('web-20k-2k-back')}"/></article></div>`,1600,1000);
} finally {await browser.close();}

const mib=(bytes)=>(bytes/1048576).toFixed(2);
const rows=manifest.variants.map((v)=>`| ${v.id} | ${v.triangleCount.toLocaleString()} | ${mib(v.fileBytes)} | ${(v.gpuTextureRgbaMipEstimateBytes/1048576).toFixed(0)} |`).join('\n');
const perfRows=(data)=>data.records.map((r)=>`| ${r.variant}${r.rockVisible?'':' (site, off)'} | ${r.fetchMs.toFixed(1)} | ${r.parseMs.toFixed(1)} | ${r.fps.toFixed(2)} | ${r.frameP95Ms.toFixed(2)} | ${r.cpuSubmissionP95Ms.toFixed(2)} | ${r.drawCalls} | ${r.triangles.toLocaleString()} |`).join('\n');
const baselineFiles=['art-source/blender/island_cottage_blockout_v2.blend','art-source/parameters/island_cottage_v2.json','public/assets/models/island_cottage_blockout_v2.glb','public/assets/manifests/blockout_v2.json','public/assets/models/island_cottage_blockout_v1.glb'];
const preservation=[];
for(const file of baselineFiles) {
  const original=execFileSync('git',['-c',`safe.directory=${root.replaceAll('\\','/')}`,'show',`codex/m2-1-v1-corrections:${file}`],{cwd:root,windowsHide:true,maxBuffer:32*1024*1024});
  const current=await readFile(resolve(root,file));
  const normalized=(bytes)=>file.endsWith('.json')?bytes.toString().replaceAll('\r\n','\n'):bytes;
  const hash=(bytes)=>createHash('sha256').update(normalized(bytes)).digest('hex');
  if(hash(original)!==hash(current))throw new Error(`Baseline asset changed: ${file}`);
  preservation.push({file,sha256:hash(current),unchanged:true});
}
await writeFile(resolve(root,'artifacts/tripo-rock/baseline-preservation.json'),JSON.stringify({branch:'codex/m2-1-v1-corrections',files:preservation},null,2)+'\n');
const topology=optimization.sourceTopology;
const results=`# Tripo 岩石数据来源工作流实验 — 结果

日期：2026-10-29。分支：\`codex/tripo-rock-pipeline-spike\`。本次重点是验证新来源的可重复工作流，不是批准最终美术。M2.1 V1 资产保持原状，没有合并或替换地形，也没有进一步 Tripo 生成/订阅费用。

## 判断

**建议继续使用 Tripo 作为局部海岸岩石的候选来源；Blender 自动优化链已走通。** 原始单图模型闭合、可渲染，自动生成的四档几何均达到 5k/10k/20k/50k 目标，保持单壳、UV、三张 PBR 贴图和底部中心锚点。普通场景尺度可优先试 **10k/1K**（约 1.85 MiB、贴图估算 16 MiB）；近距离检查保留 **20k/2K**（约 5.09 MiB、贴图估算 64 MiB）。默认实验参照仍为 20k/2K，所有版本都未自动批准。

单图输入使背面趋向较规整的岩石堆叠，不把它归因于优化链；原始/优化背面均保留截图。用户已说明 Tripo 支持指定三视图，本次生成时未使用，背面质量留待后续输入优化。本次不再生成模型。该流程也不证明可以直接用一个 Tripo 模型替代整个岛屿和真实地下室。

![几何相同贴图比较](images/geometry-comparison.png)
![贴图比较](images/texture-comparison.png)
![海岸集成](images/site-comparison.png)

## 实际检查

- 输入：\`art-source/tripo/inbox/rocky pyramid 3d model.glb\`，69,074,820 bytes，1,944,098 三角形；SHA-256 \`${manifest.sourceSha256}\`。原始文件未改动，运行时原始参照是字节相同的本地副本。
- Blender ${optimization.blenderVersion}；本次优化执行 ${optimization.seconds.toFixed(2)} s（独立优化过程，含导入/拓扑/缩图/导出，不包括浏览器测试）。完整一键运行耗时另见 \`artifacts/tripo-rock/pipeline-run.json\`。
- 原始导入合并同位置顶点后 ${topology.vertices.toLocaleString()} 个顶点，${topology.faces.toLocaleString()} 面；边界边 ${topology.boundaryEdges}、非流形边 ${topology.nonmanifoldEdges}、松散点 ${topology.looseVertices}、零面积面 ${topology.zeroAreaFaces}；${topology.connectedShellCount} 个壳体。所有 LOD 也为闭合单壳。没有可靠统计内部重叠/隐藏面，不声称已剔除它们。
- 源扩展声明 \`KHR_materials_volume\` / \`FB_ngon_encoding\` 没有实际材质 payload 或 required 项；本样本导出改用标准 PBR。以后输入如有真正扩展数据，脚本会要求显式转换。
- 几何使用 Blender 渐进 COLLAPSE/QEM：原始→50k→20k→10k→5k。不是手工重拓扑，没有高→低法线烘焙；保留 UV 与原切线空间 normal 图，Web 验证 map/normalMap/roughnessMap/metalnessMap 均存在且颜色空间正确。
- 4K 三张源图 blob 保留不变；2K/1K 经 Blender Image 缩图，base color sRGB，ORM/normal Non-Color。ORM 的 G 粗糙度/B 金属通道和 normal 方向保持。没有升采样、KTX2/BasisU、Draco 或强制解码依赖。
- 坐标使用 glTF Y-up ↔ Blender Z-up 标准转换；导入应用对象矩阵，底部中心锚点、X 宽 3.20 m 后导出。Three.js 独立几何解析验证尺寸/原点，原始参照在加载时按相同规则缩放；放置 ${JSON.stringify(manifest.placement)}，旋转 Y=${manifest.rotationYDegrees}°。
- 13 个版本独立 GLB 解析/材质元数据/UV/法线/有限顶点/尺寸/拓扑/哈希检查通过；脚本完整流程重复两次，统计与贴图 hash 比较见 \`artifacts/tripo-rock/reproducibility.json\`。
- 单个对象规范化到模块尺度，不改小屋/地下室/岛屿文件。基线资产哈希检查见 \`artifacts/tripo-rock/baseline-preservation.json\`。

## 自动验收与交付文件

一键运行各阶段成功：独立验证 13 个资产、lint、strict typecheck、28 个单元测试、生产 build、14 个浏览器测试，以及 Blender/Web 截图和报告。完整命令耗时见 \`pipeline-run.json\`。生产 build 有 Three.js 共用 chunk 超过 500 kB 的体积提示；构建仍成功，后续正式发布时再评估拆包。

重复优化的三角形数、文件大小、primitive 元数据和贴图 hash 一致；${reproducibility.comparisons.filter((item)=>item.byteIdentical).length}/${reproducibility.comparisons.length} 个完整 GLB 的字节 hash 一致。验收保证统计可重复，**不保证所有导出文件字节完全一致**；每次生成以当次 manifest 的 SHA-256 为准。

交付文件：\`scripts/{inspect_glb.py,optimize_tripo_asset.py,render_tripo.py,run_tripo.mjs,tripo_pipeline.mjs,validate_tripo.mjs,report_tripo.mjs}\`；\`art-source/tripo/rock_pipeline.json\`；\`public/assets/manifests/tripo_rock_spike.json\`；\`src/{app/TripoApplication.ts,config/tripo.ts,world/tripo.ts,main.ts,style.css}\`；\`tests/{unit/tripo.test.ts,browser/tripo.spec.ts,browser/m2.spec.ts}\`；\`.gitignore\`、\`package.json\`、\`README.md\`、本说明及 \`artifacts/tripo-rock/*.json\` 和 \`docs/tripo-rock-spike/images/*.png\`。三个 \`.gitkeep\` 保留本地资产目录。

## 几何、文件与贴图估算

| 版本 | 实际三角形 | GLB MiB | 贴图估算 MiB |
| --- | ---: | ---: | ---: |
${rows}

贴图估算假设三张 RGBA8 + 完整 mip 链，4K=256 MiB、2K=64 MiB、1K=16 MiB；不含几何、帧缓冲、岛屿纹理。它是估算，不是浏览器提供的真实 VRAM 占用。缩图仍需加载/解码 JPEG/PNG，本次没有压缩纹理格式。

## 实测运行

Chrome ${desktop.browser}，GPU：${desktop.records[0].gpu}。固定机位 front yaw 35°、pitch 42°、distance 8 m、垂直 FOV 35°；侧面 yaw 125°、背面 215°，全景用既有机位。所有候选在同一光照/曝光、视口下截图。基线相机/资产仍能单独访问。

60 帧预热，随后 120 个 RAF 间隔；CPU render 时间只测提交命令，不含 GPU 完成时间。fetch/parse 为本机 localhost 当前请求的响应体/GLTFLoader 时间，不称为真实互联网冷加载。桌面画布 1600×866、DPR=1。三角形/调用数含阴影；近景裁剪会减少岛屿绘制，与全景基线不是同一 draw-call 口径。

| 桌面版本 | fetch ms | parse ms | FPS | 帧 p95 ms | CPU 提交 p95 ms | calls | 渲染 tris |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${perfRows(desktop)}

移动大小视口：390×844 页面，390×722 canvas，DPR=1；仍是同一桌面 Chrome/GPU，**没有物理手机性能认证**。

| 移动视口版本 | fetch ms | parse ms | FPS | 帧 p95 ms | CPU 提交 p95 ms | calls | 渲染 tris |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${perfRows(mobile)}

原始和低模均约 60 FPS，受刷新率限制；没有证据宣称帧率提升或代表手机。可以确定几何/文件/贴图估算下降，以及桌面和移动大小视口加载均无 console error/warning。原始只有一次参照对象，不代表可大量堆叠 194 万面的场景。

## 画面检查与限制

20k 保留裂隙和外轮廓，10k/1K 在模块尺度仍有可读层次；5k 近景有局部折面/深缝变浅，适合作为更远景候选。1K 与 2K 在当前机位差别有限，需更近镜头再决定是否值得提高纹理。没有观察到缺图、明显 UV 裂口或法线反向；不等于法线烘焙验证。单壳闭合也不能排除内部自交。

![背面原始/优化检查](images/back-comparison.png)

Tripo 的带纹理岩石与当前诊断白模材质差异明显，风格统一留在正式艺术阶段；本次没有装饰岛屿、生成新岩石或批准最终质量。背面按用户说明保留为单图样本问题，后续三视图输入可复用流程。该脚本目前针对一 mesh / 一 material / 三张嵌入贴图的本样本；多材质/特殊扩展需要明确扩展处理。

## 人工 QA 与停止点

- [x] 当前样本原图/GLB 保留，基础工作流完整自动化。
- [x] 几何目标、UV/PBR/轴/原点检查及桌面/移动大小 Web 加载通过。
- [x] baseline 返回和开关、正侧背及同机位比较已提供。
- [ ] 人工判断 10k/1K 与 20k/2K 的细节取舍。
- [ ] 后续三视图输入再审背面，另行验证其输入契约。
- [ ] 正式美术风格与模块批量预算批准。

停止在数据来源可行性实验；M2.1 基线未合并，M2.2 和批量生成未开始。测试与一键命令见 [TRIPO_ASSET_PIPELINE.md](../TRIPO_ASSET_PIPELINE.md)。原始/生成 GLB、Blender master、纹理缓存不入 Git；脚本、参数、报告和对比截图可提交。
`;
await writeFile(resolve(root,'docs/tripo-rock-spike/RESULTS.md'),results);
await writeFile(resolve(root,'docs/tripo-rock-spike/PR_SUMMARY.md'),'Tripo 单图岩石原始 GLB 约 66 MB / 194 万面，不适合直接作为大量海岸模块使用。本实验添加独立 `?scene=tripo-rock` 路由和自动 Blender 导入、渐进降面、缩图、GLB 重新装配、验证、截图及实测流水线，生成 5k/10k/20k/50k × 4K/2K/1K 与原始参照。原始和生成二进制仅本地保存，M2.1 V1 基线资产保持不变。\n\n建议继续用 Tripo 作为模块候选来源，常规距离可试 10k/1K，近景保留 20k/2K；背面质量待未来三视图输入，未进行高低模法线烘焙，也未批准最终美术。完整检查包含 13 个独立资产验证、28 个单元测试、14 个浏览器测试、重复导出统计、同机位图及真实帧/加载测量；FPS 受 60Hz 限制，移动大小视口使用桌面 GPU。此摘要供审阅，不自动创建 PR 或合并。\n');
process.stdout.write('Tripo comparison images, measurements and recommendation report written.\n');
