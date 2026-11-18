# HD-2D Render Study — H1 Low-Resolution Pixel Pipeline (Codex Handoff)

**Date:** 2026-11-18  
**Branch:** `codex/hd2d-render-study-h1` (branched from `main` at `dd7140c0`)  
**Status:** H1-A authorized. H1-B / H2 / H3 require separate visual approval.  
**Experiment entry:** `/?scene=courtyard`  
**Reference implementation:** `fd105147` interactive flat courtyard, `dd7140c` supplementary visual reference.

## 0. Intent and hypothesis

This is a **rendering experiment**, not another environment-modeling iteration. Keep the mixed-asset courtyard exactly as-is: simplified Tripo cottage preview (85,844 triangles per README), instanced procedural paving, flowers, tree crowns, pergola, beds, camera framing and lighting. Investigate whether a deliberately low-resolution 3D render, presented with a coherent pixel grid, creates a useful HD-2D visual language without losing cottage/foliage readability.

**Important terminology:** A low-resolution 3D pass is only one ingredient of an HD-2D aesthetic; it does **not** by itself reproduce Octopath Traveler's full style. Do not claim HD-2D completeness, invent a 2D character, or conceal limitations.

**User art direction:** Procedural meshes are acceptable as production placeholders. They may later be replaced individually with detailed Tripo assets. Do not "fix" this experiment by modifying procedural geometry or generated GLBs.

## 1. Verified baseline (read before implementing)

- `src/app/Application.ts`: one `WebGLRenderer`; `renderFrame` calls `renderer.render(world.scene, orbit.camera)`; `resize` controls pixel ratio and viewport size; scene chosen by `?scene=courtyard`.
- `src/core/renderer.ts`: explicit WebGL2, ACES Filmic tone mapping, sRGB output, shadows; keep baseline settings stable.
- `src/world/courtyard.ts`: fixed random seed, instanced meshes, local `courtyard_cottage_preview.glb` and daylight. Do not edit this module for H1 unless indispensable, and explain why.
- `src/app/shell.ts`: controls and shell. Extend minimally, prefer a scoped experimental UI for courtyard.
- `public/assets/models/courtyard_cottage_preview.glb` is already committed; original high-poly `art-source/tripo/inbox/tripo_cottage.glb` is intentionally local and **not required** to run H1.
- `tests/browser/courtyard.spec.ts` exists; preserve all old tests and default M2.1/M1 behavior.

## 2. H1-A — Minimum renderer experiment (execute NOW)

### A. Technical behavior

1. Add opt-in rendering modes **Native** (existing unmodified presentation) and **Pixel** (3D scene -> low-resolution `WebGLRenderTarget` -> full-viewport nearest-neighbor upsample). Use existing `three` API, e.g., `WebGLRenderTarget`, `NearestFilter`, fullscreen quad pass or equivalent. A small encapsulated renderer/post-processing module is preferred over scattering special cases across the app.
2. **No asset or world changes.** Pixel mode is applied to the final scene image; it must retain scene colors/shadows and original camera framing. Ensure proper output color-space and tone mapping: compare against Native to avoid double gamma conversion, unintended exposure/color shifts, or broken alpha.
3. Preserve full CSS canvas dimensions and pointer/camera interaction. Render target resolution derives from **actual drawing buffer / viewport dimensions**, NOT stretching a fixed-aspect image. Use an adjustable *reference width* of **320 / 480 / 640 px**; compute matching internal height from current canvas aspect ratio. Clamp min/max dimensions and report actual width×height. Avoid fractional pixel-grid crawl if practical; document limitations with responsive sizes.
4. Preserve a reproducible A/B toggle. **Native is default in all scenes** for backward compatibility. The pixel mode can be limited to `scene=courtyard`. Explicit query params are recommended, e.g. `?scene=courtyard&render=pixel&pixelWidth=480`, so browser tests/screenshot capture can reproduce modes without manual clicks.
5. Keep `renderer.setPixelRatio`, ResizeObserver, WebGL context loss, device-pixel-ratio changes, and `dispose()` consistent. On resize, update render targets/uniforms; on scene switch or disposal, dispose targets and fullscreen geometry/material. Avoid render-target allocation per frame.
6. Ensure scene shadow settings, lighting, mouse orbit, zoom, reset camera, and status/diagnostic readouts remain operational. `renderer.info.render` may report only the final fullscreen pass: if so document that triangle/draw-call readouts need a separate source for comparable metrics.

### B. Controls (minimal, working, not decoration)

- Display **Native / Pixel** switch, target-width selector **320 / 480 / 640**, and actual render-target resolution.
- Controls must apply at runtime and persist in URL or be reproducibly derived from query (no storage requirement). Indicate which mode is active.
- Do **not** add dithering, palette quantization, edge detection, outline shaders, depth of field, bloom, chromatic aberration, film grain, or new lighting in H1-A. These introduce too many uncontrolled variables.
- The Native camera/rendering look must be pixel-for-pixel unchanged except unavoidable UI additions.

### C. Evidence and acceptance gate

- Capture reproducible **same-camera** comparisons: Native, Pixel 640, Pixel 480, Pixel 320, at least **entrance/isometric** and **side** fixed views; do not move camera or alter light/materials/exposure between samples.
- Include 1:1 screenshots and a labeled contact sheet; record viewport CSS size, browser DPR, actual render target sizes, camera state, rendering mode, and screenshot filenames. Avoid calling a screenshot fixed-camera if matching camera state was not verified.
- Inspect all three pixel densities on roof-tile separation, green door/frame, shutters, flower edges, pergola silhouette, canopy shape and readability at the final display size. Mark problems such as shimmering/aliasing/camera-motion jitter; still images cannot prove temporal stability, so add at least one orbit/zoom smoke test.
- Report frame-time/FPS sampling in a defensible way (warm-up, same viewport/camera, brief repeatable sampling; distinguish estimates from GPU timings). Record draw calls and triangles where meaningfully measurable. Pixel mode may not improve performance automatically.
- Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, and relevant Playwright tests. Add browser assertions for URL-reproducible mode selection, resize aspect, toggles, unchanged Native behavior, no WebGL errors, and scene interaction.
- Create `docs/hd2d-render-study/H1-A/REPORT.md` plus evidence images and optional machine-readable results.
- **Commit and push, then STOP.** Submit commit SHA, links to before/after screenshots, commands/results, known limitations, and a recommendation for Native/320/480/640. **Do not proceed to H1-B or later effects automatically.**

H1-A is a **success** only if Native is intact, comparisons are controlled, Pixel visually produces a stable coherent pixel grid, and all regressions pass; aesthetic preference is decided by human screenshot review, not tests alone.

## 3. Subsequent gated experiments (PLANNED ONLY; not authorized)

### H1-B — Pixel quality refinements

Only if H1-A is promising: experiment with camera-motion grid stability, selective edge handling, optional palette quantization/dithering as independent toggles. Distinguish true pixel-art-like coherence from mere blurred/downsampled textures. Do not add all effects at once.

### H2 — Depth of field / miniature-camera feel

Add depth-aware DOF as an independent optional pass. Evaluate ordering (pre/post pixel upscale) and edge leakage, compare with/without effect under identical camera/lighting. Keep foreground/background blur limited so roof tiles, cottage facade and plants stay readable.

### H3 — Local lighting & restrained bloom

Add optional evening/night or golden-hour light presets and a small, controllable bloom pass only after H2 is evaluated. Avoid assuming bloom or overexposure is necessary for HD-2D. Compare same scene and camera. Do not alter source models.

### Optional H4 — Actual 2D/3D mixture

If H1–H3 prove useful, a later separate study may introduce one original pixel-art billboard/sprite subject in the real 3D scene with correct depth occlusion and camera presentation. No gameplay required. This is **not** part of H1-A.

## 4. Boundaries / rollback

- Work solely on `codex/hd2d-render-study-h1`. Do not merge or overwrite `main`, old M2 coastal branches, or the earlier cottage scale experiments.
- No island rebuild, no Golden Reference replacement, no Tripo source re-export, no added Tripo generations, no resculpting or planting.
- Retain access to original `/?scene=courtyard`, default `/` blockout, and `/?scene=foundation`.
- Keep the renderer design modular so reverting/removing H1 is straightforward, and independent passes can be introduced later.
- If integration becomes unexpectedly broad, stop with a small proof-of-concept and explain the architectural blocker rather than refactor the whole app.

## 5. Codex start instruction

```bash
git fetch origin
git switch --track origin/codex/hd2d-render-study-h1
# If already present locally, use: git switch codex/hd2d-render-study-h1
git pull --ff-only
```

Read this handoff and execute **H1-A only**. Push code + screenshots + measurements + report, then stop for visual review.
