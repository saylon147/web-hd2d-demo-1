import { test, expect } from '@playwright/test';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { Box3, Mesh, PerspectiveCamera, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const output = 'docs/m2.3-cliff-section/review-gates/G04-A0';
const referencePaths = ['docs/references/golden-reference-v1.png', 'docs/references/20261102195825_187_18.jpg'];
const hash = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
type XYZ = [number, number, number];
interface Instance { id: string; asset: string; position: XYZ; scale: XYZ; yawDegrees: number; matrixWorld: number[]; actualBounds: { min: XYZ; max: XYZ }; probes: object[]; undersideSampleCount: number; exposedSampleCount: number }
const zones = [
  { id: '01', title: '海岸基座', color: '#cf6b24', point: [9.2, 0.8, 6.0] as XYZ, assets: ['front-wall', 'cove-turn'], label: ['A2 / front-wall + A3 / cove-turn', '保留岸脚位置；简化成宽厚连续大体块'], reference: '原图：沙滩/阶梯旁有稳定岸脚，独立岩块有主次。新图：宽基座接到水线。', current: 'A2/A3 占据下层，但团簇碎片与强贴图主导；局部海湾负空间仍须保留。' },
  { id: '02', title: '中层台地', color: '#8e55c9', point: [9.0, 2.45, 4.0] as XYZ, assets: ['front-shoulder'], label: ['A4 / front-shoulder（装饰，不是导航台地）', '替换板状肩部；有收进/错位，不做均匀砖阶'], reference: '原图：岩块间有错落平台和凹口。新图：中层向内收，不是叠砖。', current: 'A4 宽薄顶盖带长下缘；C2 收回部分悬挑，A1/P0 补片大部分被遮住。' },
  { id: '03', title: '右侧主崖', color: '#c93f51', point: [11.2, 2.9, 1.0] as XYZ, assets: ['east-cliff', 'east-shoulder'], label: ['A1 / east-cliff + A4 / east-shoulder', '保留高低主次；重塑几块大切面与连续体积'], reference: '原图：右岸有轮廓层次，房屋仍是视觉主体。新图：高主崖与几块大切面。', current: 'A1 竖向岩团 + A4 东肩顶盖挡在原崖前；无完整大岩体轮廓，仍有悬唇。' },
  { id: '04', title: '顶层过渡', color: '#16836e', point: [8.0, 3.65, 3.0] as XYZ, assets: [], label: ['原地形 land _2 → cliff _1；青线=T', '保留真实上缘；过渡由形体/土层接缝共同设计'], reference: '原图：草土依附岩缘，非绕岛一圈绿饰条。新图：顶缘连到草地/房屋平台。', current: '原地形上缘位置有效；裸褐崖/绿顶/黄绿 Tripo 材质与几何界限突然。' },
];

test('G04-A0 read-only fixed views, asset inventory and four-zone reference mapping', async ({ page, browser }) => {
  test.setTimeout(180_000);
  const present = await Promise.all(referencePaths.map((path) => access(path).then(() => true, () => false)));
  test.skip(present.some((v) => !v), 'G04 mapping requires both exact user-supplied local reference files; no substitution');
  await mkdir(output, { recursive: true });
  const referenceBytes = await Promise.all(referencePaths.map((path) => readFile(path)));
  expect(hash(referenceBytes[0]!)).toBe('6d538a42441a2c9b5b2e6736522687fa85aef08b8d87e1a71b0fa3ec2a1e61e3');
  const errors: string[] = [], failedRequests: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errors.push(m.text()); });
  page.on('requestfailed', (r) => failedRequests.push(r.url())); page.on('response', (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  await page.setViewportSize({ width: 1600, height: 1100 });
  const canvas = page.locator('#scene');
  const ready = async (): Promise<void> => { await expect(canvas).toHaveAttribute('data-loaded', 'true', { timeout: 30_000 }); await expect(canvas).toHaveAttribute('data-rendered', 'true', { timeout: 30_000 }); await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())))); };
  const routes = [
    { id: 'default', url: 'diagnostic=g01', title: '当前默认拼装 / G01 原摆放 / 五实例可见' },
    { id: 'c2', url: 'diagnostic=g02&candidate=C2', title: 'G02 C2 对照 / 五实例可见 / 非默认修复' },
    { id: 'a1', url: 'diagnostic=g03-a1&variant=cliff-blockout&markers=off', title: 'G03-A1 中性局部片 / 前肩 A4 隐藏' },
    { id: 'p0', url: 'diagnostic=g03-p0&variant=stylized&markers=off', title: 'G03-P0 六区配色 / 前肩 A4 隐藏' },
  ];
  const instances: Record<string, Instance[]> = {}, records: object[] = [], visibility: object[] = [];
  let backend: object = {};
  for (const route of routes) {
    await page.goto(`/?scene=coastal-assembly&${route.url}&overlay=off`);
    await page.addStyleTag({ content: '.viewport{flex:none!important;height:811px!important}.scene-heading,.scene-footer{visibility:hidden!important}' }); await ready();
    if (route.id === 'default' || route.id === 'c2') {
      const report = JSON.parse(await canvas.getAttribute('data-g01-report') ?? '{}') as { instances: Instance[] };
      expect(report.instances).toHaveLength(5);
      instances[route.id] = report.instances.map((r) => ({ id: r.id, asset: r.asset, position: r.position, scale: r.scale, yawDegrees: r.yawDegrees, matrixWorld: r.matrixWorld, actualBounds: r.actualBounds, probes: r.probes, undersideSampleCount: r.undersideSampleCount, exposedSampleCount: r.exposedSampleCount }));
    } else {
      visibility.push({ route: route.id, protection: JSON.parse(await canvas.getAttribute('data-g03-protection') ?? '{}') as unknown, neighbours: JSON.parse(await canvas.getAttribute('data-g03-neighbours') ?? '[]') as unknown });
    }
    for (const view of ['golden', 'side', 'below']) {
      await page.selectOption('#g01-view', view); await ready();
      const box = await canvas.boundingBox(); expect(box?.width).toBe(1600); expect(box?.height).toBe(811);
      await canvas.screenshot({ path: `${output}/${route.id}-${view}.png` });
      records.push({ route: route.id, view, camera: JSON.parse(await canvas.getAttribute('data-g01-camera') ?? '{}') as unknown });
    }
    if (route.id === 'default') backend = await canvas.evaluate((el) => { const gl = (el as HTMLCanvasElement).getContext('webgl2')!; const ext = gl.getExtension('WEBGL_debug_renderer_info'); return { api: 'WebGL2', renderer: ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unavailable' }; });
  }
  for (const r of instances.default!) if (r.id !== 'front-shoulder') {
    const c2 = instances.c2!.find((n) => n.id === r.id)!;
    expect(c2.matrixWorld).toEqual(r.matrixWorld); expect(c2.actualBounds).toEqual(r.actualBounds);
    expect(c2.position).toEqual(r.position); expect(c2.scale).toEqual(r.scale); expect(c2.yawDegrees).toBe(r.yawDegrees);
    // Neighbor contact/occlusion samples legitimately change when front-shoulder moves.
  }
  const model = await readFile('public/assets/models/island_cottage_blockout_v2.glb');
  const source = (await new GLTFLoader().parseAsync(model.buffer.slice(model.byteOffset, model.byteOffset + model.byteLength), '')).scene; source.updateMatrixWorld(true);
  const terrain: object[] = [];
  source.traverse((node) => {
    if (!(node instanceof Mesh) || !/^(Organic_Coastal_Mass_[1-4]|Coastal_Rock_Visual_0[0-4]|Sea_Plane)$/.test(node.name)) return;
    const box = new Box3().setFromObject(node);
    terrain.push({ name: node.name, parent: node.parent?.name, triangles: (node.geometry.index?.count ?? node.geometry.getAttribute('position').count) / 3, matrixWorld: node.matrixWorld.toArray(), bounds: { min: box.min.toArray(), max: box.max.toArray() }, materials: (Array.isArray(node.material) ? node.material : [node.material]).map((m) => ({ name: m.name, type: m.type })) });
  });
  const cameras = JSON.parse(await readFile('public/assets/presets/coastal-g01.json', 'utf8')) as { views: Record<string, { position: XYZ; target: XYZ; fov: number }> };
  const boundary = JSON.parse(await readFile('public/assets/presets/coastal-g03-a0-boundaries.json', 'utf8')) as { curves: { id: string; points: XYZ[] }[] };
  const sheet = await browser.newPage({ deviceScaleFactor: 1 });
  const img = async (path: string): Promise<string> => `data:image/png;base64,${(await readFile(path)).toString('base64')}`;
  const style = '<style>body{margin:0;padding:24px;background:#eef0e9;color:#233a35;font-family:"Microsoft YaHei","Segoe UI",sans-serif;box-sizing:border-box}h1{font-size:27px;margin:0 0 12px}h2{font-size:19px;margin:0;padding:10px;background:#d6ded0}p{font-size:17px;line-height:1.55;margin:8px 0}.row{display:grid;gap:16px}svg{display:block;width:100%}.card{background:#fffdf5;padding:14px;border-radius:8px}strong{font-size:19px}small{font-size:14px;color:#516259}</style>';
  const mapping: object[] = [];
  try {
    const refs = await sheet.evaluate(async (sources) => Promise.all(sources.map(async (src) => { const image = new Image(); image.src = src; await image.decode(); return { width: image.width, height: image.height }; })), referenceBytes.map((b, i) => `data:image/${i ? 'jpeg' : 'png'};base64,${b.toString('base64')}`));
    for (const view of ['golden', 'golden-close', 'side', 'below']) {
      const sourceView = view === 'golden-close' ? 'golden' : view;
      const fixed = cameras.views[sourceView]!, camera = new PerspectiveCamera(fixed.fov, 1600 / 811, 0.1, 100);
      camera.position.set(...fixed.position); camera.lookAt(new Vector3(...fixed.target)); camera.updateMatrixWorld(true);
      const project = (point: XYZ): [number, number] => { const p = new Vector3(...point).project(camera); return [(p.x + 1) * 800, (1 - p.y) * 405.5]; };
      const crop = view === 'golden-close' ? '750 430 540 350' : '0 0 1600 811';
      const annotations: string[] = [];
      for (const zone of zones) {
        const [x, y] = project(zone.point);
        const relevant = instances.default!.filter((r) => zone.assets.includes(r.id));
        for (const instance of relevant) {
          const corners: [number, number][] = [];
          for (const x0 of [instance.actualBounds.min[0], instance.actualBounds.max[0]]) for (const y0 of [instance.actualBounds.min[1], instance.actualBounds.max[1]]) for (const z0 of [instance.actualBounds.min[2], instance.actualBounds.max[2]]) corners.push(project([x0, y0, z0]));
          const minX = Math.min(...corners.map((p) => p[0])), minY = Math.min(...corners.map((p) => p[1])), width = Math.max(...corners.map((p) => p[0])) - minX, height = Math.max(...corners.map((p) => p[1])) - minY;
          annotations.push(`<rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="none" stroke="${zone.color}" stroke-width="2" stroke-dasharray="7 5" opacity="0.8"/>`);
          mapping.push({ view, zone: zone.id, instance: instance.id, projectedBounds: { x: minX, y: minY, width, height }, method: 'projected world AABB envelope, includes occluded parts; not visible silhouette' });
        }
        annotations.push(`<circle cx="${x}" cy="${y}" r="15" fill="${zone.color}" stroke="white" stroke-width="2"/><text x="${x}" y="${y + 5}" text-anchor="middle" fill="white" font-size="14" font-weight="bold">${zone.id}</text>`);
        mapping.push({ view, zone: zone.id, worldAnchor: zone.point, pixel: [x, y], method: 'manual design-intent anchor projected with fixed camera; may be occluded' });
      }
      const rim = boundary.curves.find((c) => c.id.startsWith('T /'))!;
      const projected = rim.points.map((p) => project(p));
      annotations.push(`<polyline points="${projected.map((p) => p.join(',')).join(' ')}" stroke="#16836e" stroke-width="4" fill="none"/>`);
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${crop}" style="font-family:Segoe UI"><image href="${await img(`${output}/default-${sourceView}.png`)}" width="1600" height="811"/>${annotations.join('')}</svg>`;
      await sheet.setViewportSize({ width: 1800, height: view === 'golden-close' ? 960 : 900 });
      await sheet.setContent(`${style}<h1>G04-A0 / ${view} / 当前默认拼装的四区映射（仅分析）</h1><p>虚线：实例 world AABB 的投影包络，包含遮挡部分；编号：人工功能区锚点，非实测分区边界。青线仅为已验收 G03-A0 崖顶 T。</p><div class="row" style="grid-template-columns:2fr 1fr"><article>${svg}</article><aside>${zones.map((z) => `<div class="card" style="margin-bottom:12px;border-left:6px solid ${z.color}"><strong>${z.id} ${z.title}</strong><p>${z.label[0]}<br>${z.label[1]}</p></div>`).join('')}<p>本轮没有移动、隐藏或替换任何正式模型。01–04 是相互重叠的造型职责，不对应四个独立网格。</p></aside></div>`);
      await sheet.screenshot({ path: `${output}/mapping-${view}.png` });
    }
    const exterior = `data:image/png;base64,${referenceBytes[0]!.toString('base64')}`, board = `data:image/jpeg;base64,${referenceBytes[1]!.toString('base64')}`;
    await sheet.setViewportSize({ width: 2200, height: 1260 });
    await sheet.setContent(`${style}<h1>G04-A0 / 三方对照与四区建议 / 原 Golden V1 优先，补充概念只说明形体意图</h1><p>参考图为用户提供的审图缩略摘录；不得作为运行时素材。场景截图固定 Golden、1600×811、DPR1、FOV35、曝光1。</p><div class="row" style="grid-template-columns:repeat(3,1fr)"><article><h2>① 原 Golden Reference V1 / 整体构图权威</h2><svg viewBox="0 0 968 684"><image href="${exterior}" width="${refs[0]!.width}" height="${refs[0]!.height}"/></svg><p>岩岸有大小层次和不规则轮廓；沙滩、台阶、码头和房屋可辨认。避免把新图的长竖崖或房屋比例机械复制过来。</p></article><article><h2>② 新岩体概念 / 01–04 功能分区</h2><svg viewBox="0 0 950 720"><image href="${board}" width="${refs[1]!.width}" height="${refs[1]!.height}"/></svg><p>基座 → 内收中层 → 高主崖 → 顶缘：作为设计关系；非世界坐标、精确尺寸或固定 RGB。植被/建筑细节不纳入本轮改动。</p></article><article><h2>③ 当前默认 / 碎岩前景与褐色崖幕后壁</h2><svg viewBox="750 430 540 350"><image href="${await img(`${output}/default-golden.png`)}" width="1600" height="811"/></svg><p>A1–A4 四类资产共五实例；细碎网格/纹理与宽面岛体并存。当前缺少统一的大/中形体，不能只靠调色或加细分修复。</p></article></div><div class="row" style="grid-template-columns:repeat(2,1fr);margin-top:14px">${zones.map((z) => `<div class="card" style="border-left:8px solid ${z.color}"><strong>${z.id} ${z.title}</strong><p>${z.reference}</p><p>当前：${z.current}</p><p>建议：${z.label[1]}。</p></div>`).join('')}</div><div class="card" style="margin-top:16px"><strong>造型问题与材质问题分开审查</strong><p>形体：体块主次、宽薄 A4 悬唇、基座连接、顶缘接缝；材质：黄绿细碎纹理与褐色大面的频率/明暗跳变。A1/P0 已证明接口精确或颜色改变不等于轮廓成立。两条路线：手工大体块/切面；原地形 + 有选择的 Tripo 派生细节。均需要人工美术决策。</p></div>`);
    await sheet.screenshot({ path: `${output}/reference-zone-comparison.png` });
    const candidateCamera = new PerspectiveCamera(35, 1600 / 811, 0.1, 100), candidateView = cameras.views.golden!;
    candidateCamera.position.set(...candidateView.position); candidateCamera.lookAt(new Vector3(...candidateView.target)); candidateCamera.updateMatrixWorld(true);
    const candidateCorners: [number, number][] = [];
    for (const x of [8.2, 11.2]) for (const y of [0, 2.35]) for (const z of [5.0, 7.2]) { const p = new Vector3(x, y, z).project(candidateCamera); candidateCorners.push([(p.x + 1) * 800, (1 - p.y) * 405.5]); }
    const candidateX = Math.min(...candidateCorners.map((p) => p[0])), candidateY = Math.min(...candidateCorners.map((p) => p[1])), candidateWidth = Math.max(...candidateCorners.map((p) => p[0])) - candidateX, candidateHeight = Math.max(...candidateCorners.map((p) => p[1])) - candidateY;
    await sheet.setViewportSize({ width: 1700, height: 960 });
    await sheet.setContent(`${style}<h1>G04-A1 候选提案 / 01 前景基座的一块主岩体 / 尚未生成</h1><p>橙框仅是基于现有 A2 的搜索窗口投影：X[8.2,11.2]、Y[0,2.35]、Z[5.0,7.2]m。不是已批准边界或新模型外沿。</p><div class="row" style="grid-template-columns:2fr 1fr"><article><svg viewBox="750 430 540 350"><image href="${await img(`${output}/default-golden.png`)}" width="1600" height="811"/><rect x="${candidateX}" y="${candidateY}" width="${candidateWidth}" height="${candidateHeight}" fill="#edaa4728" stroke="#cf6b24" stroke-width="3" stroke-dasharray="8 5"/></svg></article><aside class="card"><strong>只验证一块可见大体块</strong><p>先人工定轮廓/切面，再沿实际原地形、A2 表面和水线提取接口；范围外 A2 派生表面继续保留。</p><p>路线 A：手工大形与几个切面。<br>路线 B：原地形支撑 + 少量经重塑的 Tripo 派生外层。</p><p>目标宽约 2.5–3m、高不超过现有 A2 顶缘；不长高整岛，不改草顶/房屋/楼梯/码头，不用新增碎石掩盖接缝。</p><p>Golden 全景必须看得出大形改善；只在局部放大中成立或仍被遮住，均不能验收。</p><p>G03-A0 的 T/F/W/E 是另一处前肩小段，不能直接当作本候选完整边界。</p><p><b>本轮只画搜索窗口；未执行 G04-A1。</b></p></aside></div>`);
    await sheet.screenshot({ path: `${output}/candidate-plan.png` });
    mapping.push({ purpose: 'G04-A1 candidate proposal only; not extracted interfaces', searchWindowM: { x: [8.2, 11.2], y: [0, 2.35], z: [5.0, 7.2] }, projectedBounds: { x: candidateX, y: candidateY, width: candidateWidth, height: candidateHeight } });
    for (const view of ['golden', 'golden-close', 'side', 'below']) {
      const sourceView = view === 'golden-close' ? 'golden' : view, crop = view === 'golden-close' ? '750 430 540 350' : '0 0 1600 811';
      await sheet.setViewportSize({ width: 2400, height: view === 'golden-close' ? 625 : 455 });
      const cells = await Promise.all(routes.map(async (r) => `<article><h2>${r.title}</h2><svg viewBox="${crop}"><image href="${await img(`${output}/${r.id}-${sourceView}.png`)}" width="1600" height="811"/></svg></article>`));
      await sheet.setContent(`${style}<h1>G04-A0 / ${view} / 现存变体的相同机位对照</h1><p>默认与 C2：五岩石实例可见。A1/P0：仅 front-shoulder A4 隐藏，其余四实例相同。所有差异来自已存在变体。</p><div class="row" style="grid-template-columns:repeat(4,1fr)">${cells.join('')}</div>`);
      await sheet.screenshot({ path: `${output}/variants-${view}.png` });
    }
    await writeFile(`${output}/references.json`, JSON.stringify(referencePaths.map((path, i) => ({ path, sha256: hash(referenceBytes[i]!), bytes: referenceBytes[i]!.length, ...refs[i], authority: i ? 'supplementary concept, not geometric blueprint' : 'original Golden Reference V1', originalNotCommitted: true })), null, 2) + '\n');
  } finally { await sheet.close(); }
  const git = (args: string[]): Buffer => execFileSync('git', ['-c', `safe.directory=${resolve('.').replaceAll('\\', '/')}`, ...args], { windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  const sourceCommit = git(['rev-parse', 'HEAD']).toString().trim(), protection: { path: string; sha256: string }[] = [];
  const paths = git(['ls-files', 'src', 'scripts', 'art-source/parameters', 'public/assets/manifests', 'public/assets/presets', 'public/assets/models', 'docs/m2.3-cliff-section/review-gates/G03-A0', 'docs/m2.3-cliff-section/review-gates/G03-A1', 'docs/m2.3-cliff-section/review-gates/G03-P0']).toString().trim().split(/\r?\n/);
  for (const path of paths) { const normalize = (b: Buffer): Buffer => /\.(json|ts|mjs|py)$/.test(path) ? Buffer.from(b.toString().replaceAll('\r\n', '\n')) : b; const actual = hash(normalize(await readFile(path))); expect(actual, path).toBe(hash(normalize(git(['show', `${sourceCommit}:${path}`])))); protection.push({ path, sha256: actual }); }
  const manifest = JSON.parse(await readFile('public/assets/manifests/coastal-assembly.json', 'utf8')) as { assets: { id: string; input: string; sourceSha256: string; sourceTriangles: number; variants: { id: string; modelUrl: string; sha256: string; triangleCount: number; dimensions: number[] }[] }[] };
  for (const a of manifest.assets) for (const item of [{ path: a.input, sha256: a.sourceSha256 }, ...a.variants.map((v) => ({ path: 'public' + v.modelUrl, sha256: v.sha256 }))]) { expect(hash(await readFile(item.path)), item.path).toBe(item.sha256); protection.push(item); }
  for (const [i, path] of referencePaths.entries()) expect(hash(await readFile(path))).toBe(hash(referenceBytes[i]!));
  expect(errors).toEqual([]); expect(failedRequests).toEqual([]);
  await writeFile(`${output}/inventory.json`, JSON.stringify({ stage: 'G04-A0 analysis only; no G04-A1 modeling', sourceCommit, coordinates: 'meters, Three.js +Y up, +X east, +Z south; position bottom-center anchor; yaw about +Y', viewport: { width: 1600, height: 811, dpr: 1 }, goldenCloseCrop: [750, 430, 540, 350], browser: browser.version(), backend, terrain, assets: manifest.assets.map((a) => ({ id: a.id, input: a.input, sourceTriangles: a.sourceTriangles, variants: a.variants.map((v) => ({ id: v.id, triangles: v.triangleCount, dimensions: v.dimensions, modelUrl: v.modelUrl })) })), instances, visibility, records, mapping, protection, errors, failedRequests }, null, 2) + '\n');
});
