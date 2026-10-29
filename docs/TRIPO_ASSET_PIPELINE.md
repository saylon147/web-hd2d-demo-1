# Tripo 本地 GLB → 自动 Blender 优化 → Three.js

这是新的数据来源工作流实验。Tripo 提供单体造型/贴图，Blender 脚本负责拓扑检查、降面、缩图、坐标/尺度和导出，Three.js 负责最终显示与实测。原 M2.1 V1 资产和默认页面保留，实验在独立分支与路由中运行；不会自动合并、批量生成或购买 Tripo 服务。

## 一键运行

唯一人工输入是把下载的 GLB 放到：

```text
art-source/tripo/inbox/rocky pyramid 3d model.glb
```

在项目目录运行：

```powershell
npm install
npm run tripo:pipeline
```

该命令完成两次 Blender 优化及重复统计/纹理 hash 比较、独立 GLB 检查、Blender 截图、lint、strict typecheck、单元测试、生产构建、M1/M2/Tripo 浏览器测试、A/B 图与结果报告。统计可重复不代表所有 GLB 字节 hash 相同，每次以新 manifest 为准。任何阶段失败返回非零状态；输入缺失会给出完整预期路径。所有 Blender 操作都是 background Python，无需操作 Blender 界面。

依赖：Node 22.12+（24 推荐）、项目 npm 包、**Blender 5.2.1 LTS**、可用 Chrome 或 Playwright Chromium。脚本默认发现 Windows Blender 5.2 和 Google Chrome。若安装在不同路径：

```powershell
$env:BLENDER_PATH = 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe'
$env:PLAYWRIGHT_BROWSER_PATH = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
npm run tripo:pipeline
```

没有本地 Chrome 时可用 `npx playwright install chromium`。Blender 使用自身 Python；一键命令不要求额外安装系统 Python。独立 `scripts/inspect_glb.py` 可选用系统 Python 执行。

## 文件分离与 Git

| 内容 | 本地路径 | Git |
| --- | --- | --- |
| 原始 GLB | `art-source/tripo/inbox/rocky pyramid 3d model.glb` | ignored，始终不修改 |
| 生成的 Blender master | `art-source/tripo/optimized/coastal_rock_spike.blend` | ignored，包含高模与 LOD、原始材质 |
| Web 原始参照 / 12 个 LOD 贴图候选 | `public/assets/models/tripo-rock/*.glb` | ignored，均可重建 |
| 纹理/纯几何中间文件 | `artifacts/tripo-rock/{texture-cache,geometry-cache}/` | ignored |
| 输入、目标、位置、相机/灯光参数 | `art-source/tripo/rock_pipeline.json` | 提交 |
| Web manifest | `public/assets/manifests/tripo_rock_spike.json` | 小型元数据，提交 |
| 检查、拓扑、优化、验证、重复、运行数据 | `artifacts/tripo-rock/*.json` | 提交 |
| 对比图与结果 | `docs/tripo-rock-spike/` | 提交 |

`.gitkeep` 保留 inbox/optimized/runtime 目录。原始约 66 MB GLB 和所有重新生成的二进制不会被 `git add .` 纳入 Git。缺少本地二进制的 Git checkout 仍可 build、跑单元与 M1/M2 测试；Tripo 浏览器组明确跳过，实验路由显示重新生成说明。查看提交中的对比图不依赖原始文件。

## 优化契约

本样本是一 mesh / 一 material / 三张嵌入图的 GLB 2。当前支持的实验档位：5k、10k、20k、50k 三角形，以及每档 4K/2K/1K 贴图。参数来自 `rock_pipeline.json`；原始参照是输入 GLB 的字节相同副本。

1. 标准库检查 GLB 结构、扩展、图像尺寸、三角形、包围范围及 hash；Blender 导入后检查闭合性、非流形、壳体、零面积面等。
2. 应用 import 的世界矩阵，将源 glTF Y-up 正确变为 Blender Z-up；底部中心锚点、X 宽 3.20 m。导出仍用标准 glTF Y-up。原始 Web 参照在加载时使用同样的归一化。
3. Blender 渐进 COLLAPSE/QEM：高模→50k→20k→10k→5k，插值 UV 并导出法线。目标近似，实际数量与偏差写入 report，超出 15% 偏差验证失败。本次四档恰好达到目标。
4. 纯几何由 Blender GLB exporter 导出，再用标准 GLB chunk 装配源 PBR 字段与嵌入贴图。4K 原图 blob 保留；2K/1K 用 Blender Image 缩图，不升采样。base color 为 sRGB，ORM/normal 为 Non-Color；ORM G/B 通道分别为 roughness/metalness。浏览器检查所有实际绑定与颜色空间。
5. 本输入只声明了 `KHR_materials_volume` / `FB_ngon_encoding`，没有实际材质扩展数据或 required 项；输出使用标准 PBR。新输入若有真实扩展或多个材质，需扩展/转换契约，不能假装兼容。
6. 没有高→低法线烘焙、手工重拓扑、KTX2/BasisU 或强制 mesh codec。保存原 normal 图不等于烘焙；极端降面仍可能改变深缝、法线和 UV。

大规模隐藏面/内部自交未可靠分类；闭合单壳也不是无自交证明。本次背面来自单图生成，问题保留截图；后续三视图生成的模型可放进同一 inbox 再验证，当前代码不自动调用 Tripo。

## Web 实验

```powershell
npm run dev
```

- 基线：<http://127.0.0.1:5173/>
- 默认实验：<http://127.0.0.1:5173/?scene=tripo-rock>
- 10k/1K：<http://127.0.0.1:5173/?scene=tripo-rock&rock=10k-1k&angle=front>
- 原始背面：<http://127.0.0.1:5173/?scene=tripo-rock&rock=original-4k&angle=back>
- 岛屿全景：<http://127.0.0.1:5173/?scene=tripo-rock&rock=20k-2k&angle=site>

下拉框切换几何/贴图；按钮切换正/侧/背/全景，显示开关用于同场景 A/B；“返回 M2.1 基线”离开实验。每次替换释放旧几何、材质和贴图，取消过期加载。岩石是局部 3.20 m 模块，不替代地形或建筑。

实验初始化固定光照/曝光和相机；60 帧预热、120 帧 RAF 间隔测平均/中位/p95/FPS，另外记录 CPU render 提交时间、当前响应体/解析时间、调用数、含阴影三角形、文件字节、RGBA+mip 贴图估算。CPU 提交时间不含 GPU 完成；localhost 加载不代表真实网络冷传输；帧率可能受屏幕刷新率限制；移动大小视口不等于物理手机。

## 单独阶段与结果

```powershell
npm run tripo:optimize
npm run tripo:validate
npm run build
npm run test:browser
npm run tripo:report
```

直接 Blender 优化命令支持显式输入/输出位置，但若改变位置应同步配置 manifest/验证流程：

```powershell
& $env:BLENDER_PATH --background --factory-startup --python-exit-code 1 `
  --python scripts/optimize_tripo_asset.py -- `
  'art-source/tripo/inbox/rocky pyramid 3d model.glb' 'public/assets/models/tripo-rock'
```

[实际结果与 QA](tripo-rock-spike/RESULTS.md)、[几何比较](tripo-rock-spike/images/geometry-comparison.png)、[贴图比较](tripo-rock-spike/images/texture-comparison.png)、[海岸 A/B](tripo-rock-spike/images/site-comparison.png)、[背面比较](tripo-rock-spike/images/back-comparison.png)。PR summary 仅为审阅文字，不自动创建 PR 或合并。

当前是数据来源可行性检查。下一步应由人工选择普通/近景档位，并用未来三视图样本复验背面和输入契约；本次不扩展到房屋、整岛、植被或批量生成。
