# G02.1-A — front-shoulder / A4 局部几何实验

2026-10-30；基线 `79e29ef` / G02 **C2**。结论：**局部接触轮廓改变，但 Golden 的归属感改善有限，灰黄两层结构仍明显；不宣称视觉通过。停止等待人工审图，未执行 G02.1-B / G03。**

**诊断与范围。** C2 A4 顶部约 Y=2.77m，原台地约 Y=3.8m；Golden 的肩部上缘仍被灰色高崖围住，side/below 则暴露两种轮廓与细节密度的差异。仅选择 `Organic_Coastal_Mass_1` 在 X=[5.7,9.0]、Y=[0.65,3.35]、Z=[1.4,4.9] 范围内的陡面，保留朝上面（nY≥0.65）、Y≥3.35 崖顶、共用边和下界沙滩。[Golden](boundary-golden.png) / [side](boundary-side.png) / [below](boundary-below.png) 边界图的橙线为候选源面、绿线为保留上界；它们是投影辅助，橙面还需区域权重裁限。

**实施。** 参数见 [coastal-g021.json](../../../../public/assets/presets/coastal-g021.json)：26 个候选源面、确定性起伏≤0.12m，沿 XZ=[0.82,0.57] 向 A4 实际内侧表面贴近，未命中处最多0.18m；局部下调≤0.32m，仅作用于崖壁副本。实际最大位移1.331m，变动包围范围约 [6.097,0.808,1.883] → [9.279,3.284,4.921]m，包含变形前后坐标。为避免边界裂缝，单个陡崖 draw mesh 两层细分（604→9664三角形），非编辑面保持原平面与属性插值。原 draw mesh 在 geometry 模式隐藏，由独立 Scene 子组替代；关闭或销毁恢复原渲染。原命名地形查询对象、所有原 buffers、材质引用保留；没有独立平板/楔块或新石堆。

**固定前后证据。** 左=C2 baseline，右=geometry；G01/G02 同相机/FOV/灯光，10k/1K、1600×811 canvas、DPR1，等待 loaded + rendered。Golden 近景仅同 crop [750,430,540,350]，未换机位。六张完整原图及三张边界图同目录。

| 机位 | 前后对比 | 人工判读要点 |
| --- | --- | --- |
| Golden | [完整图](comparison-golden.png) / [同裁剪近景](comparison-golden-close.png) | 肩部后缘有局部贴合，但灰色壁带仍在；黄色岩石仍显独立。 |
| side | [完整图](comparison-side.png) | 未见新增明显裂口或薄墙；主体轮廓基本保留，后方崖壁分层仍明显。 |
| below | [完整图](comparison-below.png) | 未见新增显眼悬空间隙；原石堆底缘/悬挑并未彻底消除。 |

**限制。** 直接外推曾产生规整灰凸面，因此最终以 A4 接触射线约束；现方案对顶缘高程错配的作用很小。保留台地与岩石原形时，局部陡面变形无法自行改写两者的上缘拓扑。颜色及细节密度差也仍在；材质统一不能单独证明高度衔接已解决。当前固定图未见新增 z-fighting/崖顶断裂，但不是全视角或移动设备验收。

**保护与验证。** C2 position=[7.95,1.85,3.35]、yaw=-8°、scale=[1.05,0.9,0.95]原样；四邻实例矩阵与 G02 一致。默认 placement、G01/G02 相机/候选预设、原地形代码/参数/GLB、4份源GLB和8份LOD哈希一致（内嵌纹理未改），房屋/行走面/碰撞/沙滩等原资产保留。切回 baseline 同浏览器像素恢复；普通入口忽略 variant。lint、typecheck/build、15项相关 unit、1项 G021 browser、2项原入口加载/失败恢复 smoke 全通过，console/network 无错误。Chrome156 / WebGL2 / RTX3070Ti；未作性能或真机结论。构建保留原 Three.js 大 chunk 提示。[摘要](summary.json) 约9KB，不输出完整三角面日志。

**复现与改动。** 新增融合模块、参数、unit/browser fixture、本目录证据；修改 CoastalApplication、package.json、README。运行 `npm run build`，设置 `PLAYWRIGHT_BROWSER_PATH` 后 `npm run evidence:coastal:g021`；预览入口 `/?scene=coastal-assembly&diagnostic=g021&variant=baseline`，切换 `variant=geometry`；`diagnosticView=golden|side|below`。本轮约15分钟，独立提交后停止，不合并、不推广。
