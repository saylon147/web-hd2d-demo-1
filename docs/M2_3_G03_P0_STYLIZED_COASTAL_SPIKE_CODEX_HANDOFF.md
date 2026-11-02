# G03-P0 — Coastal art-direction feasibility spike (Codex handoff)

Date: 2026-11-02. Branch: `codex/m2-2-coastal-assembly`. Status: **authorized experiment only**, not approval of G03-B production.

## Why
G03-A1 achieved numerically continuous render-only cliff patch, but screenshots show poor visual cohesion with remaining detailed Tripo rocks. Golden Reference V1 uses large readable silhouettes and broad color/value blocks, not dense geometric surface noise. The user doubts Blender procedural modeling alone can deliver the required artistic shape. **Do not assume procedural modeling is the final solution.** Test this hypothesis cheaply, alongside the existing Tripo baseline.

## Scope and constraints
1. Keep G03-A1, G03-A0 boundaries T/F/W/E0/E1, source terrain/GLB, existing presets, collision/nav, house, stairs, dock and all current rocks intact. Implement a reversible, separately named experimental variant; no destructive changes.
2. Target ONLY the existing front-shoulder 2–4m cliff section. Do not generate a new island, overhaul topology, or remodel the house.
3. Build one **stylized prototype** using the existing G03-A1 mesh or minimally adjusted broad shapes, with ~4–6 coordinated rock color/value regions (vertex color, face color or simple shader). Prioritize coherent silhouettes and broad color areas. No high-frequency noise, micro-rock tessellation, moss scatter, photogrammetric texture or expensive PBR. Avoid obvious random per-triangle confetti.
4. Compare with (A) existing G03-A1 neutral patch and (C) G02 C2 Tripo baseline. Optional simple hybrid overlay only if it takes little extra effort; not mandatory. Show comparisons with consistent visibility: clearly label whether A4 and other rocks are visible, and add one unobstructed geometry/material view so occlusion does not conceal the result.
5. Research at most 1–2 relevant existing tools/skills/examples (e.g. Blender Geometry Nodes stylized terrain, palette-based mesh color, Three.js vertex colors) and document exact links, applicable techniques, license/compatibility caveats, and why they were/weren't used. Do not install or adopt a major dependency just to complete the spike.
6. No assertion that algorithmic modeling alone achieves the target. Manual art direction and/or Tripo assets may remain necessary.

## Evidence and acceptance
- Fixed Golden and Golden-close side-by-side screenshots under same camera, crop, light, exposure, DPR and resolution; optional side/below if needed to expose seams.
- Clearly labeled neutral baseline, stylized test and Tripo baseline. Prefer same scene visibility for fair comparisons; include isolated view separately.
- Report on visual readability, silhouette continuity, color-region scale, material transition, occlusion, and any geometric gaps. Distinguish **visual judgement** from numerical seam tests.
- Report implementation cost and whether next step should be: (1) refine color-block approach, (2) artist-directed Blender/Tripo hybrid, or (3) retain Tripo and rethink island geometry. Do not automatically choose (1).
- Run lint/build and relevant tests. Commit and push evidence/report to `docs/m2.3-cliff-section/review-gates/G03-P0/` and stop for human review.
- Timebox approximately 20–30 minutes. If scope is too large, produce a small comparison and candid limitations, not a full pipeline.

**Hard stop:** no G03-B production, no broad material replacement, no additional Tripo generation, no mass asset conversion, no autonomous progression.
