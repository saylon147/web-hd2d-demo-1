# G03-A1 — 海岸基础崖壁（待人工审图）

2026-11-02；`codex/m2-2-coastal-assembly`；基线 `21261e5`。授权来自本次聊天：**A0 边界/方法通过、批准 A1，大尺度起伏，禁止高频细节与 G03-B**。GitHub API 可读取，但提交评论/Issues/本分支 PR 为空、没有反馈提交；按用户确认的聊天要求实施。

**实现。** 将 A0 已批准的 33 点 T/F/W/E0/E1 冻结为独立预设，运行时与原 GLB 重新提取结果核对。从 `Organic_Coastal_Mass_1` 的 604 源三角形中裁取 31 面：E0/E1 切平面与 W 水面约束局部，按真实边界外包络排除地下室；其余 690 个裁分面用原材质渲染副本保留。中段保留原三角曲面和两条真实剖面（偏离直连 T→F 的最大距离 0.469m），两层细分后加一处≤0.24m 的低频外凸，距崖顶/两端/脚线 0.5m 内渐退。**没有规则直墙、端盖、底盖、岩层细节或新 Tripo。**

| 几何/保护检查 | 实测 |
| --- | --- |
| 新网格 | 369 顶点 / 640 三角形；单一无贴图中性材质 |
| 选段 | T 长 2.509625m，F 长 2.947935m；Y=[0,3.548746]m |
| 大尺度新增位移 | 最大 0.238545m；T/F/W/E 理论位移 0 |
| 实际 Float32 边界贴合 | 最大 4.53×10⁻⁷m，含全部批准曲线 |
| 开口/法线 | 96 条预期 T/E/W 接口边；额外开放边、非流形边、退化/翻面、水下新面均 0 |
| 原面分区面积误差 | 3.79×10⁻¹⁰m²；关闭实验通过基线像素容差（4 像素差 1/255） |

**六张关键证据。** [Golden](comparison-golden.png)、[Golden-close](comparison-golden-close.png)、[side](comparison-side.png)、[below](comparison-below.png)、[原边界叠图](boundary-golden.png)、[无遮挡几何诊断](geometry-diagnostic.png)。Before=C2，After=中性局部网格并隐藏 `front-shoulder` A4；其他四实例矩阵/可见性不变。四对比均 G01 固定相机/灯光、FOV35、1600×811、DPR1、10k/1K、曝光1，等待 loaded/rendered；近景只同 crop=[750,430,540,350]。诊断另外只绘制新表面，仍同相机/灯光，crop=[600,280,600,420]，不用于替代完整场景验收。

**观察/限制。** 新上缘贴合绿色台地，两端没有新增切面或显眼裂口；side/below 未见新的露底洞口。其余岩块遮挡下半段，原 `east-shoulder` 悬挑仍在，灰/黄材质界限也仍在，**不宣称视觉通过或最终艺术质量**。新网格是接回原岛体的局部外表面，预期接口开放，不是独立封闭实体；面积/边界检查不是完整实体 Boolean 或全场景穿插证明。已检查边界接触、法线和固定视图；后续只能人工审图决定是否继续。世界 +Y 上/+X 东/+Z 南，使用原 GLB matrixWorld，无额外 Blender 轴旋转。

**验证/保护。** lint、typecheck/build、19 项相关 unit、1 项 browser 全通过；console/network 无错误。原地形 buffers/索引/材质、原查询/碰撞/导航、源 GLB×4/LOD×8、原预设和 A0 证据哈希不变；G01/G02/G021/G022/A0 与普通入口保留。Chrome156 / WebGL2 / RTX3070Ti；未作真机/性能测试，保留原大 chunk 提示。[参数、剖面、保护摘要](summary.json) 约 13KB。

```powershell
$env:PLAYWRIGHT_BROWSER_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
npm run build
npm run evidence:coastal:g03-a1
npm run dev # /?scene=coastal-assembly&diagnostic=g03-a1&variant=cliff-blockout&markers=off
```

改动：`cliffBlockout.ts`、`CoastalApplication.ts`、边界诊断标签、新 A0 冻结坐标/A1 预设、unit/browser、package.json/README、handoff 授权记录、本目录证据。**独立 commit/push 后停止，等待审图；不自动进入 G03-B。**
