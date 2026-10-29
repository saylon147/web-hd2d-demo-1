# M2.2 本地海岸模块工作流

独立实验分支 `codex/m2-2-coastal-assembly`。原始 M2.1 页面、生成逻辑和建筑参数保持，实验不自动合并。

## 输入与一键运行

在 `art-source/tripo/inbox/` 放入以下四个只读来源文件：

- `coastal_cliff_A1_multiview.glb`
- `coastal_cliff_A2_multiview.glb`
- `coastal_corner_A3_multiview.glb`
- `coastal_platform_A4_multiview.glb`

在项目根目录执行：

```powershell
npm install
npm run coastal:pipeline
```

依赖 Node 22.12+、Blender 5.2.1 LTS、Chrome 或 Playwright Chromium。无需系统 Python 或手动 Blender。非默认安装位置可配置：

```powershell
$env:BLENDER_PATH = 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe'
$env:PLAYWRIGHT_BROWSER_PATH = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
npm run coastal:pipeline
```

完整命令顺序：四资产审计/优化/Blender五面截图 → 再次优化比较统计与贴图SHA → 独立GLB/基线/尺度/保护范围验证 → lint → strict typecheck → unit → production build → M1/M2/Tripo/coastal浏览器回归及截图/实测 → Golden Reference对照和报告。任何步骤失败返回非零；运行报告先标记未通过，成功后才更新状态。GLB缺失时先处理/预览已有输入、列出完整预期路径，然后停止完整验收。

逐项重跑与独立检查：

```powershell
npm run coastal:optimize -- --asset A1
npm run coastal:validate
npm run build
# 使用本机 Chrome 时设置 PLAYWRIGHT_BROWSER_PATH 如上。
npm run test:browser
npm run coastal:report
```

单项重跑会保留其他输入/导出，但旧浏览器性能与截图不能视为新资产已验证；正式交付应再跑完整命令。仅重渲染现有 Blender master 可用 `node scripts/coastal_batch.mjs --asset A1 --render-only`。

## 配置和数据分离

| 内容 | 路径 | Git |
| --- | --- | --- |
| 用户原始 | `art-source/tripo/inbox/*.glb` | ignored |
| Blender master | `art-source/tripo/coastal-optimized/A*/coastal.blend` | ignored |
| 原始副本 / 优化GLB | `public/assets/models/coastal-assembly/A*/*.glb` | ignored |
| 缩图与纯几何缓存 | `artifacts/coastal-assembly/A*/{texture-cache,geometry-cache}/` | ignored |
| 每资产目标宽度/允许缩放/用途/清理策略 | `art-source/tripo/coastal_pipeline.json` | 提交 |
| 局部摆放/镜头/颜色乘数 | `public/assets/presets/coastal-assembly.json` | 提交 |
| 运行manifest | `public/assets/manifests/coastal-assembly.json` | 提交 |
| 交付manifest | `docs/m2.2-coastal-assembly/asset-manifest.json` | 提交 |
| 审计/拓扑/重复/校验/性能/检查 | `artifacts/coastal-assembly/**/*.json` | 提交 |
| 截图/报告 | `docs/m2.2-coastal-assembly/` | 提交 |

目录由脚本创建，`.gitkeep` 保留入口与出口；所有原始和生成的大体积模型均不进入Git。新的Git checkout无本地GLB仍可build和跑基础测试；coastal加载测试明确skip，缺输入/缺文件错误测试仍运行。旧 `tripo-rock` spike 使用独立配置与目录。生产build会复制本机public二进制到ignored dist，请勿把未经预算的完整dist视为可直接发布的成品。

每资产至少公布10k/1K、20k/2K。单mesh/primitive/material、三张嵌入PBR图的绑定逐项检查；多mesh/材质、活跃扩展、特殊贴图布局明确报错，不静默损坏。A1可选微小碎片清理仅在副本进行，并记录删除总量与结果；不是填洞、重新拓扑或法线烘焙。

坐标：输入glTF Y-up → Blender Z-up → 标准glTF Y-up；世界1unit=1m，锚点为包围盒底部中心。先均匀按配置X宽归一化，再应用JSON实例缩放；范围0.8–1.2、非等比比例≤1.3，禁止负缩放/镜像。原地形保持可行走职责；Tripo只作视觉装饰。

## 页面与验收

```powershell
npm run dev
```

- [原始 M2.1](http://127.0.0.1:5173/)
- [默认局部拼装](http://127.0.0.1:5173/?scene=coastal-assembly&mode=assembly&lod=10k-1k&view=golden)
- [同机位原始海岸](http://127.0.0.1:5173/?scene=coastal-assembly&mode=baseline&view=golden)
- [20k/2K 近景](http://127.0.0.1:5173/?scene=coastal-assembly&mode=assembly&lod=20k-2k&view=front)
- [A3 独立背面](http://127.0.0.1:5173/?scene=coastal-assembly&mode=module&asset=A3&view=back)

工具栏在画布外正常换行，提供海岸A/B/单模块、A1–A4、两档LOD、全景/近景/侧/背/转角/顶部。顶部89.9°是独立诊断镜头，不修改M1镜头范围。原界面始终可通过返回链接访问。

Web A/B精确匹配实际M2.1 exterior相机及灯光/曝光。Golden对照使用原概念主视角裁剪；概念没有可验证的相机数据，不宣称投影/灯光与Web一致。原图存在则验证既有SHA，不存在则使用已提交参考对照中的原裁剪；不替换参考，也不让build依赖它。

指标采用60帧预热、120个RAF间隔；GPU纹理为RGBA8+mip估算，CPU提交不含GPU完成，localhost累计加载不代表互联网冷传输。移动宽度是桌面GPU模拟视口。完整帧/加载/实例数量/绘制调用/三角形见JSON；[结果与限制](RESULTS.md)单独标记工程通过和视觉未批准，等待人工审图再继续。
