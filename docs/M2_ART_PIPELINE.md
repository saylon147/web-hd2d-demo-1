# M2 art production and review pipeline

## Core principle
AI concept image → human-approved design → Blender parametric geometry → UV/material textures → GLB → Three.js screenshot → human visual review.

## Tool roles
- Cloud image generation: style exploration, concept sheets, orthographic design references, edits. Output is visual guidance, **not geometry**.
- Blender 5.2.1 + Python: deterministic meshes, UVs, transforms, object hierarchy, exports, offline clay/albedo/beauty renders.
- ComfyUI on RTX 3060 12GB: optional reproducible texture variations and inpainting. Begin with manageable SDXL/SD1.5 workflows and small output sizes; confirm actual VRAM use locally.
- Three.js: final authority on materials, shadows, color management and presentation.

## Iteration passes
V0 clay: proportions, silhouette, space and circulation.
V1 albedo: base palette and texture frequency under neutral light.
V2 beauty: light/shadow/foliage composition.
V3 web: compare GLB in browser to approved reference.

## Render evidence
Produce `clay.png`, `albedo.png`, `beauty.png`, `web.png` per candidate at documented camera settings. Save prompt, seed, model, license and ComfyUI workflow JSON when AI textures are used. Store large intermediates outside runtime assets.

M2.1 supplies only clay and Web evidence, named `blender-{exterior,ground-floor,basement,ground-plan,basement-plan,section}.png` and `web-{exterior,ground-floor,basement}.png` under `docs/screenshots/m2.1/`. Comparison sheets use the user's local Golden Reference. No albedo/beauty passes, AI textures or ComfyUI work have started; `placeholder-awaiting-human` remains the runtime approval state.

## Asset policy
Start with one approved cottage master and several approved stone/plant masters. Parameterized variation should preserve shape language and palette. Flag unreviewed assets as candidates; never auto-promote them based on scripted checks.

## Quality rubric
Silhouette, spatial plausibility, hand-painted material quality, palette harmony, foliage layering, detail density, lighting and Web parity. Report qualitative failures with specific edits. Do not invent percentage similarity or claim Blender renders prove Web fidelity.

## Technical validation
Check GLB paths and parseability, Y-up conversion, transforms, named visibility nodes, UV presence, texture color spaces, nonempty geometry and build success. Automated validation checks engineering correctness, not aesthetic approval.

## Performance
Measure actual draw calls, triangles, texture memory and FPS in browser. Set budgets after the first representative scene, not before.
