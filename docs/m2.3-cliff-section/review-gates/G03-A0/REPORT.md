# G03-A0 — front-shoulder 海岸边界提取

2026-11-02；`codex/m2-2-coastal-assembly`，基线 `be9f169`、工作树干净。**仅 A0，等待审图；未生成崖壁、处理材质或修改 Tripo。** 已使用三个指定 Three.js Skills，定位/阅读并核对 Golden Reference V1 原图哈希。

**来源/范围。** `terrain_blockout.py` 生成六圈海岸，`generate_blockout.py` 做开挖/楼梯 Boolean；直接读取当前 GLB 的 `Organic_Coastal_Mass_1` 岩壁（604 三角形）、`_2` 顶面（296 三角形）。选取 G022 原始四点所在区段，**崖顶长 2.509625m**；全部边界范围 X=[6.326199,9.561397]、Y=[0,3.548746]、Z=[2.096468,4.827819]m。画面保留 **G02 C2** 五实例，不启用 G022 增高副本/补片。

| 世界 XYZ（m，保留 6 位；完整精度见 summary.json） | E0 / T0 端 | E1 / T3 端 | 折线点数 / 弧长 |
| --- | --- | --- | --- |
| 崖顶 T，绿 | [8.158056,3.546098,2.096468] | [6.338460,3.492692,3.753850] | 4 / 2.509625m |
| 海岸脚 F，青 | [9.504610,0.120000,2.739612] | [7.469805,0.120000,4.745150] | 5 / 2.947935m |
| 海平面交线 W，黄 | [9.561397,0,2.766735] | [7.564153,0,4.827819] | 8 / 2.944389m |
| 两端接口 E，粉/橙 | T0→F0→W0 | T3→F末→W末 | 各 8 点 / 3.914254、4.163033m |

**提取/可行性。** 世界坐标按 10⁻⁵m 焊接，T 为顶面/岩壁共有边；F 为相邻面向上岸/水下延伸的原水平折边。原水体盒上表面 Y=0 与岩壁求交得到 W；通过原地形中心 XZ=[0,-1.8] 和 T 端点的垂直切平面得到 E。共 33 点，五线连通无分叉，端剖面持续降至海面；接口误差≤1.78×10⁻¹⁵m，点到原三角面误差≤1.87×10⁻¹⁵m（浮点误差，非美术精度）。**足够约束连续基础网格**；A1 获批后可裁取原面或补充同法中间剖面，当前未建模。

**隔离/风险。** 独立 DOM/SVG 标记可关闭/销毁，原查询对象、buffers、材质、可见性和行走/导航数据不变；后续渲染副本可隔离。世界 +Y 上、+X 东、+Z 南，应用完整 matrixWorld；轴 GLB 验证 Blender +Z→Three.js +Y、+Y→−Z，未额外旋转。F 是原岛体脚线，**不是 A4 底缘**。Tripo 遮挡部分边界：实线可见、虚线遮挡投影、圆点为提取点；原底部外扩/折角仍在。未验证任何新网格或视觉效果。

**截图。** [Golden](boundary-golden.png)、[Golden-close](boundary-golden-close.png)、[side](boundary-side.png)、[below](boundary-below.png)：G01 原相机/灯光/FOV35、1600×811、DPR1、10k/1K、曝光1，等待 loaded/rendered。近景只裁剪同一 Golden 的 [750,430,540,350]。

**验证。** lint、typecheck/build、16 项相关 unit、1 项 browser 通过。关闭标记对 C2 基线仅 4 像素差 1/255，再次关闭精确恢复；五实例矩阵、旧入口、resize/隐藏恢复正常，console/network 无错误。原地形/预设/源 GLB×4/LOD×8 哈希不变；[坐标/保护摘要](summary.json) 约 15KB。Chrome156 / WebGL2 / RTX3070Ti；未测移动真机/性能，保留既有大 chunk 提示。

```powershell
$env:PLAYWRIGHT_BROWSER_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
npm run build
npm run evidence:coastal:g03-a0
npm run dev # /?scene=coastal-assembly&diagnostic=g03-a0&markers=on
```

改动：`cliffBoundary.ts`、`CoastalApplication.ts`、独立预设、unit/browser、package.json/README、本目录证据。入口 `diagnosticView=golden|side|below`；`markers=off` 关闭。**独立 commit/push 后停止；下一步仅人工审图，G03-A1 未授权。**
