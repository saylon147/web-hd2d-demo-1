# M2.4 — P3 Cottage Scale & Placement Calibration — Codex Handoff

Status: **AUTHORIZED FOR P3 ONLY**. Date: 2026-11-06.
Branch: `codex/m2-4-cottage-tripo-spike`.
Previous checkpoint: P2 A/B screenshots reviewed; Tripo Cottage Candidate 01 (original HD) accepted as **asset candidate**, NOT yet approved as the default scene cottage.

## Goal
Find a visually appropriate **uniform scale, XY/XZ placement and ground contact** for the existing `tripo_cottage.glb` in the unchanged island scene. P2 B looks visibly smaller than the original blockout cottage; preserve the model's detailed Mediterranean roof, stonework and plants. The P3 result is a comparison for human review, not a final art pass.

## Scope / constraints
- Reuse the already-imported original-HD Tripo cottage and P2 loading/variant pipeline. Do not regenerate or optimize its GLB, modify textures, simplify geometry or alter orientation unnecessarily.
- Retain P2 A (original cottage) and B (Tripo) as switchable, reproducible variants. No default-scene replacement, merge to main, or destructive edits.
- Do **not** edit terrain, island mesh, cliff, Tripo rocks, stairs, dock, trees, vegetation, lighting, exposure, camera or surrounding platform geometry.
- All scale adjustments must be **uniform**, not axis-specific stretching.
- Preserve cottage door facing the stair/arrival approach, ensure entrance clearance and no overlap with stairs/trees/terrain.
- Treat the cottage's attached stone base as part of the source asset for P3; do not remove or remodel it. Note the double-paving issue for a later phase.

## P3-A — Calibration experiment (implement, commit, then stop)
1. Read the current P2 candidate transform, world-space bounds, ground contact, front-door position, and original blockout bounds. Record them in a short report. Determine the scale pivot and foot/base plane using actual geometry, not visual guesswork.
2. Provide switchable **B0 current P2**, **B1 1.15x**, **B2 1.25x**, **B3 1.35x** relative to B0. These are exploration candidates, not predetermined winners. If a candidate is visibly unsuitable, still document it rather than silently choosing a different scale.
3. For each B1–B3, independently calibrate world position and Y height to keep the base in contact with the existing platform, maintain front-door orientation and usable entrance clearance. Avoid sinking or hovering. State any spatial constraint that prevents fitting a candidate.
4. Ensure deterministic variant selection via existing preset/query/scene mechanism; don't require manual editing of source code for comparisons.
5. Render identical fixed-camera views with identical exposure/DPR for **Golden, Golden-close, front, top, contact-front**. Produce side-by-side comparisons that include A original, B0 baseline and B1/B2/B3; include one compact overview/contact sheet. Screenshots should be genuinely generated, not synthesized.
6. Include a table: variant, uniform scale relative to B0, world-space width/depth/height, center/offset, base Y, door-to-platform-edge or stair clearance where measurable, and visual notes. Clearly identify which measurements are computed vs estimates.
7. Verify asset loads and switches, original A remains unchanged, no scene regressions. Run applicable typecheck/build/tests and document results.
8. Commit and push the implementation, comparison screenshots and report to the existing branch. **STOP for human review**; do not proceed to P3-B or later art integration.

## Acceptance gate
- Visual: candidate fits the cottage platform without crowding the front approach; roof silhouette and chimney remain proportional; no base floating/penetration; no collisions with scene objects.
- Engineering: A and B0 remain reproducible; original GLB untouched; scene/camera/lighting and all non-cottage assets unchanged; repeatable presets and fixed views.
- Deliverable: path to report, comparison images, commit SHA, test status, and explicit recommendation of a candidate **or** reason none works.

## Deferred (NOT authorized)
- Removing duplicate paving / remodeling platform.
- Terrain, cliff, rocks, trees and vegetation upgrades.
- Texture/material/style unification or lighting adjustments.
- Tripo asset optimization, retopology, GLB changes.
- Replacing the default cottage, deleting baseline, merging to main.

## Review context
P2 screenshot review: detailed cottage is a substantial visual improvement over the blockout, but B appears too small in Golden/top and Golden-close. Its detailed stone base overlays a plain existing platform; this is a later integration concern. Mixed high-detail cottage/rocks vs low-poly island/trees is a scene-wide art-direction issue and must **not** be solved in P3.
