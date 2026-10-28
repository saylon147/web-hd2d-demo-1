# Asset Pipeline — Blender to Web

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
Create `scripts/export_blender.py` using Blender's Python API, run headlessly via Blender CLI. For each source file: validate names/UV/materials, apply documented export transforms, export GLB, and print a machine-readable report. Never assume Blender is installed in CI: skip gracefully with clear instructions.

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
