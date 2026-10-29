# HD-2D Web visual study

Tripo 岩石数据来源实验使用独立 `?scene=tripo-rock` 路由，基线保留。把原始 GLB 放入 `art-source/tripo/inbox/rocky pyramid 3d model.glb`，运行 `npm run tripo:pipeline` 即可自动优化、导出、验证与截图；原始/生成二进制 ignored。[工作流说明](docs/TRIPO_ASSET_PIPELINE.md) / [实测结果](docs/tripo-rock-spike/RESULTS.md)。

**M2.1 V1 corrective candidate is ready for human review. M2.2 has not started.** V0 was visually rejected and remains available for comparison. All current geometry, furniture, vegetation and materials are placeholders.

## Run

Node.js 22.12+ (24 recommended), npm and a WebGL2 browser:

```sh
npm install
npm run dev
```

Open <http://127.0.0.1:5173/> for V1; <http://127.0.0.1:5173/?version=v0> for V0; <http://127.0.0.1:5173/?scene=foundation> for M1. Add `&view=ground-floor` or `&view=basement` to a version URL for a cutaway. Committed GLBs require neither Blender nor the Golden Reference. For LAN access use `npm run dev -- --host 0.0.0.0`.

Drag / one-finger drag rotates within pitch 30–55° and yaw ±45°. Wheel / two-finger pinch zooms. Buttons switch exterior, ground-floor and basement views; reset returns to the current mode preset. Debug exposes target/camera/grid/axes. M2 distance 8–45 m; M1 8–25 m. Units are meters, +Y up; house entrance faces +Z.

V1 retains a 6×6 m single-storey cottage and basement, lowers ground/plateau Y to 4.00 / 3.80 m, basement floor Y=1.20 m, clear heights 2.70 / 2.40 m, and bottom clearance 1.00 m above sea. Connected usable land projection plus occupied house pad is 333.21 m² / 36 m² = 9.26×. Area method and compact-room limitations: [spatial contract](docs/M2_SPATIAL_SPEC.md).

## Generate and verify

Blender **5.2.1 LTS**, using its embedded Python, is required only for regeneration. The wrapper discovers `C:/Program Files/Blender Foundation/Blender 5.2/blender.exe`, otherwise use `BLENDER_PATH` or Blender on PATH.

```powershell
$env:BLENDER_PATH = 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe'
npm run assets:blockout
npm run assets:reproduce
npm run assets:validate
```

Default parameters: `art-source/parameters/island_cottage_v2.json`; outputs: editable `.blend`, GLB, axis GLB, manifest, spatial report and six Blender views. `npm run assets:blockout -- --skip-renders` skips only images. `-- --params path/to/file.json` selects explicit parameters. The 6×6 interior plan is pinned for this candidate; footprint changes must revise net-room plans as well. Source/exports/presets are separated under `art-source/`, `public/assets/models/`, `public/assets/manifests/`.

V0 generator/validator/comparison code is archived in `scripts/archive/`; V0 sources and outputs remain unchanged. `npm run assets:blockout:v0` explicitly regenerates historical outputs; it is never invoked by V1 commands. `npm run assets:validate:v0` verifies the original GLB. Normal dev/build/test does not regenerate either version.

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run test:browser
npm run evidence:compare
```

Browser evidence uses installed Chrome/Edge or Playwright Chromium:

```powershell
$env:PLAYWRIGHT_BROWSER_PATH = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
npm run test:browser
npm run evidence:compare
```

Alternatively run `npx playwright install chromium`. Tests manage production preview at <http://127.0.0.1:4173/>. V1 screenshots/reports go to `docs/screenshots/m2.1-v1/` and `docs/m2.1-v1/`; the newly rendered V0 exterior goes into the V1 comparison folder. Original V0 and M1 evidence is preserved. `evidence:compare` rejects stale Web model hashes and checks V0 preservation against its original commit.

The Golden Reference original is intentionally ignored at `docs/references/golden-reference-v1.png`. If present, its recorded hash is checked; if absent, comparison uses the same concept crop from the committed V0 sheet and records that source. Run/build/tests do not depend on it. No new or substituted reference is generated.

## Review evidence

[Complete V1 handoff](docs/M2_1_V1_HANDOFF.md), [same-camera V0/V1](docs/screenshots/m2.1-v1/v0-v1-exterior.png), [full review sheet](docs/screenshots/m2.1-v1/review-sheet.png), [annotated plans](docs/screenshots/m2.1-v1/annotated-plans.png), [physical section](docs/screenshots/m2.1-v1/annotated-section.png), [acceptance](docs/M2_ACCEPTANCE.md). V0 history: [handoff](docs/M2_1_HANDOFF.md), [review](docs/M2_1_REVIEW.md). Read [PLAN](PLAN.md), [M2 implementation](docs/M2_IMPLEMENTATION.md), [art pipeline](docs/M2_ART_PIPELINE.md), [asset pipeline](docs/ASSET_PIPELINE.md) and [AGENTS](AGENTS.md).

**Stop for human confirmation.** No detailed roofing tiles, painted textures, dense foliage, ComfyUI, characters or M2.2 work has started.
