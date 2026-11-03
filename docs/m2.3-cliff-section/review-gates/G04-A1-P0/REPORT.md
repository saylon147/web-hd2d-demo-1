# G04-A1-P0 — A2 前景基座二维造型草案

2026-11-03；基线 `59eca19`，分支 `codex/m2-2-coastal-assembly`。从会话「新一轮尝试和修改」最后一条实际任务续做；原轮次停在参考读取，尚无 P0 交付。**本轮只有屏幕空间设计示意，没有 3D 建模或实测接口。完成后停止等待人工审图。**

## 主方案 S1：低位宽基座

[Golden 未裁剪全景](a2-silhouette-golden.png) · [同方案 Golden-close](a2-silhouette-golden-close.png)

仅覆盖 A2/front-wall 正面候选的一小块可见区域。用四个不等大的视觉体块组织：①宽厚主支撑体、②向后内收的顶折面、③错位右肩及其凹口、④较小的低位前脚。左沿略收，右沿有一处较深凹口；顶折线有浅转折，避免对称切块和等距砖阶。暖主面占主要面积，亮顶和冷侧面辅助判断转折；这些色值只服务读面，不是材质/贴图或固定 RGB 方案。

原 Golden Reference V1 仍优先：借用其大小岩块层次、不规则低岸、房屋主导以及沙滩—台阶—码头的通路关系。补充概念只提供大面和主次关系，没有照搬其高耸柱状崖或新台阶。本次预期改善是：在全景下让这块前景区域先读成宽厚主岩体，近景下读出少量大面，而非同尺度碎石团。**这是待人工判断的设计目标，不是已实现的 3D 效果。**

## 保留与舍弃

- 保留 A2 的低位落点、前脚方向和与右岸的邻接关系；保留 A3 海湾孤石及沙滩空隙。房屋、楼梯、码头、原岛体和 A1/A3/A4 是原截图背景。
- 在局部设计覆盖范围内，舍弃原 A2 小碎岩的锯齿边缘、等粒度团簇和纹理驱动的细小起伏；用主块和两处不对称转折替代。窗口外的旧 A2 不代表本轮已设计完成。
- 图片采用半透明面以保留底图定位信息。外侧仍看得到旧岩石、面内仍透出旧纹理，均不是新方案的最终表面，也不代表已隐藏或替换模型。

## 尚未解决与后续待决

青绿虚线标顶部内收和内侧连接的意图；实际与原岛体接触的位置被 A4/现有岩体遮挡，**本图没有证明贴合原地形**。浅青虚线及浅青下延体只标水线/水下延续方向，不是 Y=0 的实测交线，也不证明支撑连续。A2 内侧、两端、A3 海湾转角、右主崖和草土顶缘都需后续联合设计；本轮不补缝、不整块隐藏 A2。

人工审图需先判断：①这块主面是否足够宽厚、是否仍偏平板；②顶面应收进多少，右侧凹口和前脚的大小是否自然；③在旧 A4/A1 遮挡下，全景改善是否足以值得制作小样。通过后另行授权 G04-A1：先取真实地形/A2/水面接口，再选手工低面数大形或精选 Tripo 派生路线，做单块可开关试验。保持同一 Golden 轮廓目标，再用 close/side/below 验证接缝和支撑。**本次没有进入该阶段。**

## 机位与复现

两图使用同一张 G04-A0 `default-golden.png` 和同一套 SVG 轮廓/切面；全景完整显示 1600×811 原画布，近景只将固定 crop `[750,430,540,350]` 放大，没有重设相机。Golden position `[17.0500144,30.1652243,27.3499441]`，target `[0,3.4,3]`，FOV 35°，底图 DPR1/曝光1。草案点均为原底图像素，不可反推为精确世界坐标或批准的切割边界。

共享图形和底图哈希、输出尺寸见 [drawing-evidence.json](drawing-evidence.json)；原底图 SHA256 `7ac378ce9c19675e91f2d8978b275a3943d96b660d7c757b67fcbdffa9e79a85`。参考原图沿用 G04-A0 [references.json](../G04-A0/references.json)，仍只留本地；没有将参考原图作为新增交付或运行时资产。

从仓库根目录运行（沿用已安装的 Node 与 Playwright）：

```powershell
$env:PLAYWRIGHT_BROWSER_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
node docs/m2.3-cliff-section/review-gates/G04-A1-P0/render-overlays.mjs
npm run build
npm run lint
npm test
npx playwright test tests/browser/coastal.spec.ts --grep 'switching modes while the first model loads' --output=test-results/g04-a1-p0-runtime
```

## 验证及交付

strict typecheck/build 通过；lint 通过；10 个单元测试文件、50 项测试通过；现有海岸场景加载中切换模式的浏览器回归 1 项通过。两张离线标注图生成成功、底图未改变、共享轮廓哈希一致、无图片加载错误或页面溢出，且已实际查看全景和近景。构建保留既有 >500kB chunk 提示。

没有重跑完整 G04-A0 盘点/多变体截图、Blender、Tripo、GLB 生成、真机或性能测试；此次没有 3D 改动，旧 GPU 证据仍以 G04-A0 为准，不声称完成几何验收。

本轮新增文件仅为本目录两张 PNG、`REPORT.md`、离线复现脚本 `render-overlays.mjs` 和 `drawing-evidence.json`。生产代码、资产、相机/光照、默认预设及旧证据没有改动。原先已暂存的 `docs/research/2026-11-02-diorama-style.md` 保留暂存状态，不包含在本轮独立提交中。
