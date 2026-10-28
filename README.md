# Web HD-2D Demo 1

A browser-based visual prototype combining **hand-painted stylized 3D environments** with **pixel-art 2D characters**.

## M1: foundation and constrained camera

当前实现为 M1 基础场景与受限相机实验。立方体、球体、圆柱与台阶均为程序化占位几何；小屋参考图仅用于后续美术方向，最终风格仍可调整。

### Run locally

需要 Node.js **22.12+**（建议 Node 24 LTS）、npm，以及支持 WebGL2 的浏览器。

```sh
npm install
npm run dev
```

打开 <http://127.0.0.1:5173/>。如需其他设备访问，运行 `npm run dev -- --host 0.0.0.0`，通过电脑的局域网地址访问；默认仅监听本机。

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run preview
```

生产预览地址为 <http://127.0.0.1:4173/>，必须先运行 build。

### Controls

- 鼠标左键拖动 / 单指拖动：水平偏转与俯角。
- 滚轮 / 双指捏合：沿观察方向缩放，带平滑阻尼。
- **重置视角**：立即恢复默认观察目标及相机参数。
- **调试参数**：展开或隐藏 lil-gui；可调整相机与观察目标，切换网格及坐标轴。竖屏窄视口初次加载时默认收起。
- 默认：俯角 42°、水平偏转 0°、距离 16 m、垂直 FOV 35°。
- 限制：俯角 30–55°、水平偏转 ±45°、距离 8–25 m。没有平移或自由环绕；WASD 人物移动在 M3 实现。

世界为 +Y 向上、+X 向右、−Z 向前，1 unit = 1 m。相机角度与坐标转换见 [Camera Spec](docs/CAMERA_SPEC.md)。

### Browser acceptance and screenshots

浏览器测试针对生产构建，并生成 `docs/screenshots/m1-*.png`。

```sh
npm run build
npx playwright install chromium
npm run test:browser
```

也可使用本机已有 Chrome / Edge，在 PowerShell 中指定其路径以跳过测试浏览器下载：

```powershell
$env:PLAYWRIGHT_BROWSER_PATH = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
npm run test:browser
```

测试输出与失败追踪保存到被 Git 忽略的 `test-results/`；测试浏览器仅用于验证，不参与运行时构建。

M1 交接与验证结果见 [M1 Handoff](docs/M1_HANDOFF.md)，截图：[桌面默认](docs/screenshots/m1-desktop.png)、[最近距离极限](docs/screenshots/m1-camera-near-limit.png)、[竖屏默认](docs/screenshots/m1-portrait.png)。

## Phase 1 scope
- Three.js / TypeScript / Vite, WebGL2
- Perspective camera: fixed elevated angle, limited orbit and zoom
- Small handcrafted diorama (cottage, steps, rocks, grass, flowers)
- Four-direction pixel character with idle/walk, depth occlusion and ground shadow
- Art Lab for lighting, camera, material presets and screenshot comparisons
- Blender → glTF/GLB asset pipeline

**Not in scope:** combat, quests, inventory, multiplayer, backend, AI inference at runtime.

Read [PLAN](PLAN.md), [Art Bible](docs/ART_BIBLE.md), [Asset Pipeline](docs/ASSET_PIPELINE.md), [Character Rendering](docs/CHARACTER_RENDERING.md), [Camera Spec](docs/CAMERA_SPEC.md), [Acceptance](docs/ACCEPTANCE.md), and [Codex instructions](AGENTS.md).

Start with M1 and use placeholders until the rendering and camera architecture is validated. Reference images are inspiration, not assets to copy.
