# Web HD-2D Demo 1

A browser visual prototype combining stylized 3D environments with future pixel-art 2D characters. Current default is **M2.1 island/cottage spatial blockout**, awaiting user approval. All current geometry/materials are placeholders. Detailed art and characters have not started.

## Run locally

Requires Node.js 22.12+ (Node 24 recommended), npm and a WebGL2 browser. Blender is required only to regenerate source assets; committed GLBs run without it.

```sh
npm install
npm run dev
```

Open <http://127.0.0.1:5173/> for M2.1, or <http://127.0.0.1:5173/?scene=foundation> for the original M1 camera calibration. To access from another device use `npm run dev -- --host 0.0.0.0` and the computer's LAN address.

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run preview
```

Production preview is <http://127.0.0.1:4173/> and requires build first.

## Controls and spatial inspection

- Left mouse drag / one-finger drag: limited yaw and pitch.
- Wheel / two-finger pinch: smooth zoom.
- **外景 / 一层剖视 / 地下室剖视**: switch geometry visibility and fixed camera preset.
- **重置视角**: restore the current mode's target and camera parameters.
- **调试参数**: camera GUI, grid and axes; initially collapsed on narrow portrait screens.
- Pitch 30–55°, yaw offset ±45°, vertical FOV 35°. M2 distance 8–45 m; M1 retains 8–25 m and its original 16 m default. There is no free orbit or character movement yet.

The house has one above-ground floor and an embedded basement. Usable land 324 m² / house 36 m² = 9×; courtyard 30.145 m²; floor clear heights 2.70 / 2.40 m. The rear-left U stair is a proposed change from the concept and needs user review.

World scale is 1 unit = 1 m, +Y up, +X right, −Z forward. The cottage entrance faces +Z. See [spatial contract](docs/M2_SPATIAL_SPEC.md) and [camera semantics](docs/CAMERA_SPEC.md).

## Generate and validate M2.1 assets

Blender **5.2.1 LTS** and Python via Blender's embedded interpreter are required. On Windows the wrapper discovers `C:/Program Files/Blender Foundation/Blender 5.2/blender.exe`; otherwise set `BLENDER_PATH` or provide `blender` on PATH.

```powershell
$env:BLENDER_PATH = 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe'
npm run assets:blockout
npm run assets:validate
```

Source parameters live in `art-source/parameters/island_cottage_v1.json`; generation writes the `.blend`, GLB, axis-test GLB, typed-manifest data, spatial report and six Blender screenshots. To regenerate only geometry use `npm run assets:blockout -- --skip-renders`. Alternative parameters can be passed with `-- --params path/to/parameters.json`; generated runtime paths must still follow the manifest naming contract.

Editable source: [Blender scene](art-source/blender/island_cottage_blockout_v1.blend), [Python generator](scripts/generate_blockout.py), [parameters](art-source/parameters/island_cottage_v1.json). Runtime exports and presets are under `public/assets/models/` and `public/assets/manifests/`.

## Browser evidence and comparison

```sh
npm run build
npx playwright install chromium
npm run test:browser
npm run evidence:compare
```

Existing Chrome/Edge can be used instead of downloading Chromium:

```powershell
$env:PLAYWRIGHT_BROWSER_PATH = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
npm run test:browser
npm run evidence:compare
```

Browser tests start/stop the production preview, check M1 regressions and M2 modes, and write M2 Web screenshots plus runtime statistics. Historical M1 screenshots remain unchanged; new M1 regression screenshots and traces go to ignored `test-results/`.

`evidence:compare` needs the user-supplied original at `docs/references/golden-reference-v1.png`, deliberately excluded from Git. A fresh checkout can run/build/test without it. Committed [comparison](docs/screenshots/m2.1/reference-comparison.png), [plan](docs/screenshots/m2.1/floor-plan-check.png) and [height/stair](docs/screenshots/m2.1/height-and-stair-check.png) sheets are available for review. Reference provenance/hash: [Golden Reference V1](docs/GOLDEN_REFERENCE_V1.md).

## Milestone status and scope

M1 completed: [handoff](docs/M1_HANDOFF.md). M2.1 candidate completed: [handoff and measured checks](docs/M2_1_HANDOFF.md), [acceptance gates](docs/M2_ACCEPTANCE.md). Await user confirmation of proportions, courtyard, basement height and stair placement before M2.2 cottage art.

Phase 1 targets Three.js/TypeScript/Vite, constrained perspective, a small diorama, crisp pixel characters and a Blender→GLB pipeline. Current work excludes gameplay, backend, accounts, detailed textures/vegetation and ComfyUI.

Read [PLAN](PLAN.md), [M2 implementation](docs/M2_IMPLEMENTATION.md), [art pipeline](docs/M2_ART_PIPELINE.md), [asset pipeline](docs/ASSET_PIPELINE.md), [character rendering](docs/CHARACTER_RENDERING.md) and [Codex instructions](AGENTS.md).
