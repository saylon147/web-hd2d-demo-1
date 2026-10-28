# M2 implementation plan — Golden Reference V1

Status (2026-10-28): **M2.1 candidate implemented, awaiting human spatial approval**. Formal reference is available locally at `docs/references/golden-reference-v1.png`; its original binary remains outside Git. See [M2.1 handoff](M2_1_HANDOFF.md) for source, exports, measured dimensions, screenshots and validation. Do not treat the concept illustration as a dimensioned drawing.

## Art direction
Hand-painted stylized 3D island cottage, warm terracotta roof, cream plaster/stone walls, green shutters, lush layered foliage, pink flowers, bright turquoise sea. No characters in M2. A **single above-ground floor and a basement**, NOT two above-ground floors. Island usable land area about **9× the cottage footprint**.

See [reference brief](GOLDEN_REFERENCE_V1.md), [spatial spec](M2_SPATIAL_SPEC.md), [art pipeline](M2_ART_PIPELINE.md), and [acceptance](M2_ACCEPTANCE.md).

## M2.1 — spatial blockout (start here)
- Use Blender **5.2.1** Python scripts to generate parameterized island terrain, rocky foundation, beach, pier, stairs, terrace, garden, cottage shell, ground floor, basement, and connecting internal stair.
- Start with clay/basic-color materials. Prioritize geometry, scale, circulation, ground elevations and camera readability.
- Export GLB with named independently toggleable nodes for roof, ground-floor shell/interior, basement and landscape.
- Integrate into current M1 Three.js app without breaking camera controls. Add temporary view modes: exterior / ground-floor cutaway / basement cutaway.
- Render at least four evidence views: full island exterior, ground-floor cutaway, basement cutaway, Three.js runtime screenshot.
- **STOP for human approval.** Do not proceed to detailed texturing or ComfyUI.

## M2.2 — cottage golden asset
- Build one approved cottage asset with stylized roof tile geometry, walls, stone trim, windows, doors, porch details.
- Iterate V0 clay → V1 material/albedo → V2 beauty render → Three.js comparison.
- Check silhouette first, then texture, then lighting. Do not use postprocessing to hide poor geometry.
- STOP for approval of cottage quality before duplicating style.

## M2.3 — environment asset library
- Parametric stones, steps, fence, dock, bushes, flowers, trees and vines.
- Create high-quality approved master assets before seeded variations.
- Experiment with ComfyUI for **texture variations and masked corrections**, not as an automatic 3D geometry generator.
- Preserve model/seed/workflow/license provenance; keep AI generated material clearly tagged as candidate until approved.

## M2.4 — scene assembly and visual validation
- Assemble island and ocean; support roof and floor visibility toggles.
- Fixed-angle comparison screenshots in Blender and Three.js; use Web as final visual authority.
- Record visual deviations, performance statistics and platform tests.
- STOP before M3 pixel character work.

## Scope constraints
No gameplay, inventory, combat, backend, procedural infinite terrain, complex simulation or finished character assets. Do not create a second above-ground story.

## Codex handoff for next run
Read AGENTS.md, this file, GOLDEN_REFERENCE_V1.md, M2_SPATIAL_SPEC.md, M2_ACCEPTANCE.md and M2_1_HANDOFF.md. M2.1 is ready for review; adjust its blockout if requested. **Do not start M2.2 until the user confirms the spatial layout.** Treat all dimensions as adjustable parameters.
