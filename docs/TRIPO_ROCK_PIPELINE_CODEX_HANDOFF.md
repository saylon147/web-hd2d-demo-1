# Tripo GLB → Blender → Three.js | Codex handoff (M2.1 art pipeline spike)

Status: **experimental, do not replace or merge the M2.1 V1 baseline yet**.

## Goal
Validate whether a Tripo image-to-3D rock asset can be optimized automatically and placed in the HD-2D island scene with acceptable visual quality, file size and runtime performance. The project owner does **not** operate Blender manually. Codex owns scripts, CLI commands, repeatability, screenshots, tests and documentation.

## Input asset (user-provided; NOT in Git)
- Filename: `rocky pyramid 3d model.glb`
- Origin: Tripo, generated from a single isolated Mediterranean coastal rock reference image.
- GLB v2; 69,074,820 bytes (~65.9 MiB).
- 1 mesh / 1 primitive / 1 material / 3 embedded texture images (base color JPEG, roughness-metallic JPEG, normal PNG).
- 1,000,691 vertex positions; **1,944,098 triangles** (index count 5,832,294).
- Extensions reported: `KHR_materials_volume`, `FB_ngon_encoding`; validate compatibility and fallback handling before processing.
- The owner will place the downloaded GLB directly in the local repository at **`art-source/tripo/inbox/rocky pyramid 3d model.glb`**. Codex should read this exact path; no chat attachment is necessary. Create the directory if absent and commit a `.gitkeep` to preserve it in Git. Add `art-source/tripo/inbox/*.glb` and generated binary exports to `.gitignore` (preserve `.gitkeep`); do not push the ~66 MB original into normal Git history. Fail with an explicit error and expected path if the file is absent. Optionally accept a configurable input path while using this location as default.

## Constraints
1. Preserve the original GLB unmodified; all transforms run on copies.
2. Preserve the existing `codex/m2-1-v1-corrections` M2.1 baseline. Work on a separate branch (e.g. `codex/tripo-rock-pipeline-spike`) created from the current corrective branch. Integrate behind a toggle or isolated demo route; do not silently overwrite existing island terrain.
3. No manual Blender UI work. Use Blender 5.2.1 (or document detected compatible version) in background/headless mode with Python scripts; provide Windows PowerShell invocation and dependencies.
4. Make outputs reproducible with one command and structured JSON reports. Fail clearly on missing input or unavailable Blender.
5. Maintain correct UVs, texture bindings, normals, coordinate axes, origin, scale and color space. Verify import/export with independent glTF inspection and render screenshots.
6. No additional Tripo generation or subscription expense required for this spike.

## Implementation stages

### A. Inspect
- Add `scripts/inspect_glb.py` (or equivalent) to report nodes, primitives, triangles, bounds, dimensions, UVs, normals, texture sizes/formats, materials, extensions, embedded image sizes and file size to `artifacts/tripo-rock/inspection.json`.
- Inspect whether model is closed, has nonmanifold regions, disconnected shells, excessive hidden faces, and whether the rear side is plausible.
- Document whether extensions are ignored or require explicit conversion.

### B. Optimize geometry
- Write `scripts/optimize_tripo_asset.py` executable by `blender --background --python ... -- <input> <output-dir>` with parameterized targets.
- Produce **5k, 10k, 20k and 50k triangle target** variants, plus the unoptimized reference. Treat targets as approximate, report actual counts and deviations.
- Prefer a decimate/planar-aware strategy appropriate to stylized rocky geometry; check UV and normal fidelity. If basic decimation destroys silhouette or cracks, document and try a better workflow. Do not claim normal-map baking without actually implementing and validating high→low baking.
- Ensure the output GLBs remain renderable and retain required PBR textures. Do not apply destructive operations to the source.

### C. Optimize textures
- Produce comparable 4K original / 2K / 1K texture variants (where actual source dimensions permit; never upscale).
- Preserve correct baseColor sRGB vs normal/ORM linear treatment, normal orientation, metallic/roughness channels, alpha settings and UV mapping.
- Consider KTX2/BasisU or mesh compression only as **optional, separately measured** variants; document browser loader support, runtime decoder dependencies and compatibility. Avoid introducing a mandatory codec without integration tests.
- Report exported GLB bytes, GPU texture estimates and measured visual impact.

### D. Three.js A/B test
- Add a non-destructive test scene or URL toggle that places the rock near the existing island coast, with baseline scene accessible unchanged.
- Match world scale, pivot/orientation and lighting; allow camera views of front, side and back. Do not use the rock as the entire terrain or as a replacement for house/basement geometry.
- Provide controls or a simple query parameter to switch among 5k/10k/20k/50k variants and texture resolutions.
- Capture matched screenshots with identical camera, viewport, light and exposure for side-by-side comparison. Include mobile-sized viewport.
- Record load time, frame timings/FPS under repeatable conditions, draw calls, triangles, GPU memory estimate and transfer bytes. Do not fabricate measurements.

### E. Acceptance and decision
Deliver:
- `docs/TRIPO_ASSET_PIPELINE.md`: user-facing one-command workflow, paths, limitations, reproducibility.
- `docs/tripo-rock-spike/RESULTS.md`: actual counts, sizes, screenshots, perf measurements, qualitative silhouette/texture/backsides assessment and recommended variant.
- Scripts, any small metadata, and automated tests in the branch.
- A short PR summary explicitly stating whether Tripo is recommended for modular coastal rock assets and whether Blender optimization is automated reliably.

Initial targets (hypotheses, **not** guaranteed):
- 10k–20k triangles and 1K–2K textures may suffice for a small modular rock in the intended camera view; compare visually against 50k and original before choosing.
- Asset should blend with Golden Reference V1 and avoid the artificial tiered pedestal look.
- No major silhouette breakage, UV seams, missing normal map, incorrect shading, or conspicuous back-side artifacts at gameplay camera distances.
- Scene loads without console errors on desktop and mobile viewport; baseline remains unaffected.

## Required tests
- GLB parsing/import-export sanity, triangle count, UV/material/texture presence, bounds and origin.
- Deterministic pipeline execution (repeatable output stats, tolerances where Blender output differs).
- Three.js asset loader and baseline toggle tests; browser screenshots.
- A concise manual QA checklist for visual judgment.

## Owner action
Copy the downloaded Tripo GLB into the checked-out repository at **`art-source/tripo/inbox/rocky pyramid 3d model.glb`**. Then tell Codex to run the pipeline. Do not upload the binary to Codex chat or GitHub. No Blender UI operations are required from the owner.

## Important
This is a **pipeline feasibility spike**, not authorization to mass-generate rocks, remodel the island, buy more credits or merge the current M2.1 corrective branch. Report results before expanding to other asset categories.
