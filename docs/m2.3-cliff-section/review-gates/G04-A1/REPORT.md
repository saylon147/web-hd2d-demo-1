# G04-A1 — A2 单块 3D 小样

2026-11-03；分支 `codex/m2-2-coastal-assembly`；基线 `18565f0`。按 `../../G04_A1_A2_3D_PROTOTYPE_CODEX_HANDOFF.md` 制作一次可回退小样，依据 P0 的 S1 低位宽基座方向，使用项目 Three.js scene/debugging/testing Skills。**实验及交付已完成，艺术验收暂不建议通过：全景视觉收益不足。停止等待人工审图，不进入下一阶段。**

## 截图与判断

| 证据 | 实际观察 | 判断 |
| --- | --- | --- |
| [Golden 全景 A/B](comparison-golden.png) | 能看到一小块连续中性大面，但整片前岸依旧由原 Tripo 碎岩主导；房屋与沙滩—楼梯—码头关系保留 | **视觉收益不足**。变化可见，不等于宽厚自然基座目标成立 |
| [Golden-close A/B](comparison-golden-close.png) | 主面和较低前脚可见，原 A4/周边 A2 遮住顶面与部分右肩；前脚偏尖，斜三角面仍显机械 | 四个角色未在完整场景中充分读出；不作为造型通过 |
| [Side A/B](comparison-side.png) | 候选只露出局部前缘；后方体积仍被原 A2 和其他实例遮挡 | 未见本轮新增大洞，但不足以验证完整接缝；需结合无遮蔽图 |
| [Below A/B](comparison-below.png) | 新主面进入水线，底部被原海平面遮住；局部与旧碎岩的交叠边缘较硬 | 不将海面遮住底部当作支撑已验收 |
| [无遮蔽中性斜侧图](isolated-oblique.png) | 能看到前后厚度、起伏顶面和具有实际深度的右侧凹口；没有四块独立积木 | 体积试验可判断，角面、尖前脚与局部直边仍需人工造型调整 |
| [建模前测量标注](measurement-golden-close.png) | 真实 A2 平面截线与射线命中标注在原截图上，包含被遮挡的投影 | 定位证据，不是 P0 像素挤出或批准的裁切接缝 |

两边相机、原场景光照、曝光 1、10k/1K、1600×811 原画布及 DPR1 一致。全景不裁剪；Golden-close 统一 crop `[750,430,540,350]`，只作放大，没有换机位。无遮蔽图单独采用固定斜侧相机，克隆原灯光、沿用同一个 renderer/曝光，材质为中性灰；不作为与全景匹配的 A/B。

## 先测量的结果

实际 GLTF 与实例 `matrixWorld` 全部应用，坐标为米制 Three.js +Y 上、+X 东、+Z 南。测量发生在生成候选之前，详见 [measurement.json](measurement.json)：

- 在 X=8.2～11.2、Y=0/0.3/0.8/1.3/1.8/2.1 沿 −Z 射线取 A2、原地形及邻居遮挡；另外对窗口做 16 个竖向顶面采样。
- 从 A2 实际三角面提取 Y=0 水线、X=8.2/11.2 两端截线和 Z=5 后缘截线，再将线段裁到局部窗口。标注是这些真实截线的投影，非可见轮廓；没有将其声称为批准的替换拓扑接口。
- 海平面实际 Y=0。A2 在窗口的前侧水线 Z≈6.27～6.94；原地形对应射线的岸脚 Z≈0.77～3.84。两者前后差约 **2.99～5.70m**，候选窗口内 16 个原地形竖向采样均未命中实体顶面。
- 原 A2 顶面在 `(9,5.7)` 约 Y=1.746、`(10,5.7)` 约 Y=1.313；更前侧明显下降。前肩 A4 在较高位置遮住 A2，不能把 P0 的顶部接触虚线解释为真实地形接缝。

因此本轮采用**保留原 A2、添加局部实体作深度遮挡**。没有切掉原 A2 或向后扩到原岛体；这意味着原 A2—岛体支撑/连接问题未解决。闭合新体穿过水线，只证明自身有水下体积，不证明其附着原地形或获得物理支撑。

## 实现与恢复

一个闭合 `BufferGeometry`，来自三组手工指定、对应索引相同的三维周向截面。截面在 X/Y/Z 都有变化，顶面有起伏、右肩有凹口、前脚降低且向水线收束；顶/底盖按 XZ 非凸轮廓三角化，周面连接截面。没有读取或挤出 P0 SVG，没有堆叠多个岩石、细分噪声、纹理、植被或水体处理。现阶段为**程序辅助的手控占位造型**，不宣称最终艺术品质。

上传后的实际 Float32/index 网格：**42 顶点、80 三角形**；边界/非流形边/退化面均 0，索引共享边方向相反，正向封闭体积约 **9.168m³**。包络 X≈[8.20,11.15]、Y≈[−0.45,2.10]、Z≈[5.02,7.12]；三截面的前后跨度约 1.96/2.10/1.94m，顶部高度差 1.44m。底盖各顶点 Y≤−0.26，实际 Y=0 交线由 28 段组成。数值检查辅助排除薄片/开口，不代替艺术验收。

```powershell
npm run dev
# 打开 http://127.0.0.1:5173/?scene=coastal-assembly&diagnostic=g04-a1&variant=candidate
```

- `G04-A1 A2` 下拉切换 `baseline` / `candidate`；`baseline` 只关闭新实验层，原 A2 始终在场。
- `模型检查` 切换无遮蔽斜侧视图；也可使用同一 URL 加 `&isolated=true`。
- 普通入口、不带 `diagnostic=g04-a1` 的 URL 及旧 G01/G02/G03 入口不会启用小样。默认预设不变。
- 原 A2 恢复路径为 `variant=baseline` 或退出实验入口；正式 Tripo GLB、源文件、mesh buffers、材料和实例变换均没有被改写。A1/A3/A4、原岛体、建筑和导航/碰撞均未修改。

## 受影响文件及复现

- `src/world/coastalRockPrototype.ts`：只读表面测量、单实体构建、闭合审计、独立诊断场景和资源释放。
- `src/app/CoastalApplication.ts`：G04-A1 专用入口、A/B/无遮蔽切换、固定相机及生命周期接入。
- `public/assets/presets/coastal-g04-a1.json`：唯一候选的手控截面、局部包络、中性材质与无遮蔽相机。
- `tests/unit/coastal-rock-prototype.test.ts`、`tests/browser/coastal-g04-a1.spec.ts`：闭合方向/范围保护、实际截图、恢复和旧入口/LOD 重载回归。
- 本报告目录：6 张 A/B 原图、4 张对照、1 张无遮蔽图、1 张测量标注、测量/审计 JSON 和报告。原参考图及旧审图证据未覆盖。

```powershell
npm run build
npm run lint
npm test
$env:PLAYWRIGHT_BROWSER_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
npx playwright test tests/browser/coastal-g04-a1.spec.ts --output=test-results/g04-a1
```

strict typecheck/build、lint、11 个单元测试文件中的 **52 项测试**、G04-A1 浏览器 fixture **1 项**通过。fixture 包含 4 机位交付、实际测量、A/B、baseline 像素恢复、默认 G01 一致、旧 G03-A1 入口保留以及 20k→10k 的 LOD 重载。完整结果与 118 个旧文件/资产保护哈希见 [summary.json](summary.json)。恢复对比最大通道差 0；默认 G01 与实验 baseline 在本机也是相同像素；全景 A/B 有 7,187 个像素的通道差超过 1，仅表示渲染发生变化。

Chrome 156 / WebGL2 / Windows ANGLE D3D11 / NVIDIA RTX 3070 Ti。console/request 无错误。构建保留原有 >500kB chunk 提示。没有执行 Blender、导出/覆盖 GLB、Tripo、纹理迭代、全量旧浏览器测试、真机或性能基准。

## 未解决与停机点

前景主面、顶面内收和前脚具备真实体积，但完整场景中顶面/右肩被旧岩体遮挡，剩余 A2 的碎纹理在交叠边界突变，前脚和三角切面偏机械。该版本适合作为可运行的**局部体积与遮挡诊断小样**，尚不能证明 S1 自然宽基座方向已成立，更没有解决全岛岩石风格或原 A2—地形衔接。

下一步仅建议人工先审：是否继续同窗口调整大面及前脚，是否允许局部裁分旧 A2 来显露已设计体积。未经新授权不改 A4、不扩窗、不做材质/全岸联合改造。本轮独立 commit/push 后停止等待审图。原已暂存的 `docs/research/2026-11-02-diorama-style.md` 保留暂存状态，不纳入本次提交。
