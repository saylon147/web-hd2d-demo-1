# Asset Pipeline — Blender to Web

M2.1 V1 default source/export/manifest names use `v2`; review screenshots/reports use `m2.1-v1`. `v1` assets remain V0. Current heights, palette/light presets and surface-union metrics are in [spatial contract](M2_SPATIAL_SPEC.md) and [V1 handoff](M2_1_V1_HANDOFF.md). `assets:blockout`, `assets:validate` and `assets:reproduce` target V1. V0 tools are archived and selected explicitly. The historical source contract below describes V0.


## Source vs runtime
```text
art-source/blender/          # editable .blend files
art-source/textures/         # editable texture sources
public/assets/models/       # exported .glb
public/assets/characters/   # .png and animation .json
public/assets/presets/      # camera, material, lighting .json
scripts/                    # export and validation tools
```

## Conventions
- Runtime Three.js coordinate system: +Y up, +X right, -Z forward; Blender source is Z-up. Apply consistent export transform and verify with an axis test asset.
- 1 runtime unit = 1 meter; asset transforms should be applied before export where appropriate.
- Static object pivots: ground center or documented placement anchor; avoid arbitrary offsets.
- Names: `cottage_01.glb`, `rock_01.glb`, `flower_01.glb`; stable IDs in asset manifest.
- Color/albedo textures use sRGB; normal/roughness/metallic textures are linear.
- Prefer glTF-compatible PBR nodes; bake unsupported procedural materials into textures.
- Include simplified collision geometry separately or define collider primitives in manifest.
- Avoid hidden cameras/lights from Blender exports unless intentionally required.

## Export automation
M2.1 uses `scripts/generate_blockout.py` to create the scene and export GLB through Blender's Python API. Run via `npm run assets:blockout` (wrapper `scripts/run_blender.mjs`, pinned to Blender 5.2.1). Missing Blender fails with an explicit installation/path message; normal Web build/test does not invoke Blender. `npm run assets:validate` parses the real GLB with GLTFLoader and writes `docs/m2.1/asset-validation.json`.

## Asset manifest
A typed JSON manifest maps stable IDs to GLB paths, categories, scale, placement anchor, collider type and approval state. A validation script checks path existence, parseability, size budgets and naming conventions. Budgets should be measured and tuned after M2, not invented as universal limits.

## Review workflow
1. Model or generate a draft asset in Blender.
2. Export GLB with repeatable script.
3. Validate and load in isolated Art Lab viewer.
4. Compare with Golden Scene under fixed lighting.
5. Approve or revise; mark placeholder vs approved.
6. Commit source and runtime assets where license permits.

## Pixel sprite pipeline
Sprite PNG uses transparent background and NearestFilter; JSON contains frame rectangles, duration, animation name, direction and foot anchor. Verify consistent frame dimensions and pivot. Keep sprite sources separate from packed runtime sheets.

## Copyright and provenance
Record author, license, source and modifications for external assets. Reference screenshots are style guidance, not a license to extract/reuse the original meshes or textures.

## M1 coordinate checkpoint

M1 几何直接使用运行时 Y-up 坐标。标准 Blender → glTF 基变换 `(x,y,z) → (x,z,-y)` 的三个基向量已通过数学测试。M2.1 已通过真实 Blender 导出资产验证。

M2.1 生成器将运行时输入点 `(x,y,z)` 存为 Blender `(x,-z,y)`，并保持 exporter 标准 `export_yup=True`；GLTFLoader 后不重复旋转。`axis_test_01.glb` 中三个命名标记从原生 Blender +X/+Y/+Z 导出，经真实解析确认 +X→+X、+Y→−Z、+Z→+Y，长度单位为米。轴测试和场景由同一脚本生成；轴节点是临时导出物，不残留在小屋 `.blend` 中。小屋 GLB 根锚点为岛屿海平面原点，小屋中心由参数/report 记录，当前为 X/Z=(2,−1)。

M1 未导入、复制或打包用户参考图；也未创建 GLB、角色图集或 Art Lab JSON 预设。

## M2.1 source and approval contract

- `art-source/parameters/island_cottage_v1.json`: dimensions, terrain outlines, seed, output paths and fixed camera presets.
- `art-source/blender/island_cottage_blockout_v1.blend`: editable source, default exterior visibility; renders use EEVEE/AgX.
- `public/assets/models/island_cottage_blockout_v1.glb`: runtime meshes/PBR clay materials, UV channels, no texture images or Blender cameras/lights.
- `public/assets/manifests/blockout_v1.json`: stable ID, SHA-256, meter/Y-up contract, metrics, camera presets, required nodes, hidden-node lists and `placeholder-awaiting-human` approval state. TypeScript validates it before loading.
- `public/assets/models/axis_test_01.glb`: actual coordinate/scale checkpoint.
- `docs/m2.1/`: spatial, asset, runtime and GLB reproducibility reports.

Two runs with the same parameters/seed produced byte-identical GLB. `.blend` binary equality is not claimed. Backups `*.blend1` and Python caches are ignored. Group aliases/shared staircase and cutaway variants are documented in [M2 spatial contract](M2_SPATIAL_SPEC.md).

Parameter provenance hashing normalizes CRLF to LF in both generator and validator so Git newline settings do not invalidate the report.

UV presence is only a future-material checkpoint; current planar placeholder UVs are not a finished unwrap. Colliders, reusable master assets and material texture provenance are deferred. The original Golden Reference remains local; derived comparison evidence is committed as requested. The Web renderer is the final review authority.
