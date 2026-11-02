# G03-P0 — 小规模风格化海岸可行性实验（等待人工审图）

2026-11-02；分支 `codex/m2-2-coastal-assembly`；起点 `59345a0`。仅执行 P0，未进入 G03-B。结论：**六块协调配色的轻量实现可行，但完整场景仍由细碎 Tripo 岩石主导；本次不能确认程序化建模是最终美术路线。**

沿用 front-shoulder 的 A0 真实 T/F/W/E0/E1 和 A1 中段剖面/大尺度起伏，不新增几何。独立 `g03-p0` 入口有 A=原 A1 中性、B=风格化实验、C=G02 C2 Tripo 三种状态。A/B 同时隐藏 A4，C 恢复 A4；其余四个实例保持相同矩阵与可见性。选择 C 时退出仅网格诊断，避免空视图。

实现用六个手工放置的色区中心，在已批准边界的角度/高度坐标内分配顶点色，色区接壤处窄幅混合。sRGB 色值先解码到 Linear-sRGB，使用 Three.js 内置 `MeshLambertMaterial` 接受原灯光/阴影与 ACES 输出。A/B 对比包含材质光照响应变化，不能将其全部归因于颜色。无噪声、随机逐面撒色、纹理、PBR 管线、植被、新 Tripo 或 Blender 执行。

坐标保持世界 +Y 上、+X 东、+Z 南；u 是从 E0 到 E1 的 X/Z 边界射线夹角归一化，v=`(y-seaY)/(topY-seaY)`。射线交点从批准 T/W 求得，未新增 Blender Z-up 旋转。预设的中心坐标为 `[u,v]`，`transitionWidth=0.07` 是该归一化坐标中的邻近距离差阈值。

| 实测项 | 结果 |
| --- | --- |
| 网格与原 A1 比较 | 369 顶点 / 640 面；position、normal、index 数组相同，位移 0 |
| 色区连通/尺度 | 六区各 1 个面邻接连通分量；54–185 面/区，面积 1.18–2.28m² |
| 色数据成本 | 4,428 bytes RGB；另有独立几何副本和一个材质，无新增依赖/纹理 |
| 批准接口误差 | Float32 最大 4.53×10⁻⁷m，继承 A1 |
| 额外开放边/非流形/退化/翻面 | 均为 0；保留原预期 T/E/W 接口，不是独立封闭实体 |
| 原入口与恢复 | A1 / C2 / 切回基线像素检查均通过：每次至多 4 像素、通道差至多 1/255 |

色区面积与连通量按面中心的主色标签计算；实际像素有顶点插值与灯光，**不是六块严格平涂的像素分区**。数值接口检查不能替代视觉验收或全场景 Boolean/穿插验证。

证据：[Golden](comparison-golden.png)、[Golden-close](comparison-golden-close.png)、[side](comparison-side.png)、[below](comparison-below.png)、[无遮挡 Golden](comparison-isolated-golden.png)、[无遮挡 side](comparison-isolated-side.png)。前三列统一标注 A/B/C 及 A4 可见性。完整截图使用 G01 固定机位、FOV35、1600×811、DPR1、10k/1K、曝光1、相同灯光。Golden-close 为相同 Golden crop `[750,430,540,350]`。无遮挡截图仅绘制原 A1 表面，原机位/灯光不变，A/B 分别使用相同局部放大 crop：Golden `[930,460,180,180]`，side `[670,340,220,260]`；它们不能替代场景融合检查。原始截图和相机记录保存在本目录/[summary.json](summary.json)。

**视觉判断。** 无遮挡时浅崖顶、暖色主体、冷色脚部可读，大块色彩比中性版有层次；没有逐三角形彩色碎片。但相邻暖色区在插值/曝光后主要读成约三条大色带，边界较柔，冷色脚部偏重。轮廓与中性版完全相同，仍有柔和连续面感，未获得参考图中由艺术指导决定的独立大岩体/明确切面。Golden-close 只露出上段，side/below 大部分被保留的 Tripo 遮挡，配色改变对全景的影响很小。两端没有看到新增缝洞，几何接口未移动；与原深褐崖体及细碎黄绿 Tripo 的材质/细节尺度跳变依然明显，原岩石悬挑也仍在。

**后续建议选 (2)：人工指导的 Blender/Tripo 混合小样。** 先由人工确定大轮廓、切面和色稿，再判断怎样利用现有网格或 Tripo，而非继续靠自动色区或更多细节解决构图。当前配色方法可作便宜的预览辅助；单独推进 (1) 不能解决遮挡/形体问题。(3) 保留 Tripo 可作为回退与比较，但也未解决目标风格。这里只提出建议，未实施任何后续路线，也没有确认 Blender 程序化建模能够单独达成目标。

研究仅两项，均已成功读取：

- [Three.js MeshLambertMaterial 官方文档](https://threejs.org/docs/pages/MeshLambertMaterial.html)：采用内置漫反射响应与 `vertexColors`，避免新 shader/重型材质系统。它不提供手绘艺术质量保证。
- [Three.js webgl_geometry_colors 官方示例](https://threejs.org/examples/webgl_geometry_colors.html)：参考 RGB `color` attribute + `vertexColors` 的接口模式；其 Phong 材质/示例造型未采用。固定 r186 的 GitHub raw 地址首次读取超时，改读同一官方示例成功，未扩大研究范围。

项目 Three.js 0.186.1 / TypeScript strict 兼容并通过实测；库与示例为 MIT（Three.js authors，需保留许可）。未复制示例资产，也未分发 Golden Reference 原图。使用已有 threejs-scene、threejs-debugging、threejs-testing Skills；没有新增工具链或依赖。

验证：`npm run lint`、`npm run build`（含 typecheck）、22 项相关 unit、1 项生产预览 browser 均通过；console/network 无错误。浏览器 Chrome156、WebGL2、RTX3070Ti；未测移动真机或性能，build 保留已有大 chunk 提示。原地形 buffers/材质/索引、查询/碰撞/导航代码、原预设、A0/A1 证据及源 GLB/全部 LOD 哈希未变；旧入口与普通拼装场景检查通过。

改动为 `coastalStylized.ts`、独立 `coastal-g03-p0.json`、应用入口/切换、unit/browser fixture、package.json、README 和本目录证据。实现成本是一轮约 20 分钟的小样，无完整建模或材质重构。

```powershell
$env:PLAYWRIGHT_BROWSER_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
npm run build
npm run evidence:coastal:g03-p0
npm run dev # /?scene=coastal-assembly&diagnostic=g03-p0&variant=stylized&markers=off
```

独立 commit/push 后停止，等待人工审图，不自动进入 G03-B。
