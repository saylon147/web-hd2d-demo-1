# G04 — Golden Reference V1 coastal rock art-direction handoff

Date: 2026-11-02
Branch: `codex/m2-2-coastal-assembly`
Status: **reference interpretation and planning only; no production modeling authorized**.

## Reference hierarchy

1. **Original `golden-reference-v1`** is the visual source of truth for overall scene composition, silhouette, scale, color relationships and HD-2D art direction.
2. **`coastal-rock-structure-reference-v1`** is a newly generated *supplementary concept board*, to be placed by the user alongside existing golden references. It illustrates cliff-zone layout, broad massing, large readable facets, layered color values and a possible modeling sequence. It is **not** a geometrically precise blueprint and must not supersede the original reference.
3. Current G03-A1/G03-P0 screenshots are engineering experiments and negative/partial controls, **not** final art targets.

**Asset handoff:** user will manually place the new image beside the existing golden references. Search the repository for the original Golden Reference V1 and the new supplementary image once available; report exact relative paths. If the image is not present, STOP and request it. Do not substitute a guessed filename or silently use the concept board alone.

## What to extract from the new image

Four visual zones, interpreted as design intent rather than exact measurements:
- **01 Shore foundation:** broad, stable base mass that visually connects to sea level; coherent footprint, not detached floating rocks.
- **02 Middle terrace:** stepped or recessed medium-scale rock masses with deliberate silhouette and hierarchy; no uniform stacked-brick pattern.
- **03 Right main cliff:** the tallest primary coastal mass, with a strong readable contour and several large facet planes, integrated with the island top.
- **04 Upper transition:** continuous transition from grass/soil top to rock face; avoid green strips, vertical cut seams and unsupported overhangs.

Material direction: warm limestone/sandstone broad planes, differentiated by **designed color/value blocks**, restrained geometry, a few intentional shadow planes, minimal high-frequency stone detail. Avoid photogrammetric rubble, excessive moss/pebbles and noisy per-triangle random colors. A concept-board palette is *illustrative*, not a fixed RGB specification.

The concept board also contains house, stair, dock, beach, water and vegetation illustrations. **Do not remodel or reposition these** to match the board. Preserve project-approved island footprint, house scale, one floor + basement, stairs, dock, camera and navigation/collision unless separately approved. No extra stories or larger island inferred from the concept art.

## Current evidence and why this is a new phase

- G03-A0 validated terrain-bound T/F/W/E0/E1 curves.
- G03-A1 generated a render-only connected local patch; numerical seams passed, but the result reads as a smooth curtain and the remaining Tripo assets still look detached.
- G03-P0 recolored the *same* patch into six vertex-color regions; the global view barely changed due to occlusion, and the color bands did not create the required large-rock silhouette.
- Therefore the bottleneck is **artist-directed massing and composition**, not merely boundary precision, more tessellation or palette tuning.
- Tripo assets A1–A4 remain available as optional detail/reference assets, not mandatory primary cliff geometry.
- Blender procedural modeling is **not assumed** to be able to reproduce the art direction. Do not commit to a procedural-only pipeline.

## Phase G04-A0: mapping and design proposal ONLY

1. Inventory existing relevant terrain and Tripo A1–A4 geometry, transforms, visibility, current experimental variants, original reference images and new board.
2. On fixed Golden, Golden-close, side and below screenshots, identify the four target zones and current asset coverage. Make one **annotated comparison/mapping sheet**: which existing shapes to retain, simplify, hide, replace or redesign; distinguish geometry from material problems.
3. Propose **2 alternative modeling workflows**, with clear limitations and expected manual artistic input:
   - artist-directed low-poly/hand-shaped base masses, possibly Blender-assisted, then controlled color/value facets;
   - hybrid existing terrain + selectively reused/simplified Tripo detail masses.
   Do not claim procedural modeling alone solves art direction.
4. Explicitly identify required silhouette decisions, attachment seams, top-to-rock transition, waterline, and scale relationships before any modeling.
5. Define a tiny, reversible **G04-A1** candidate test limited to one primary visible coastal mass; describe acceptance criteria based on silhouette and whole-scene visual impact, not just manifold/seam metrics. Do **not** execute A1 yet.
6. Deliver `docs/m2.3-cliff-section/review-gates/G04-A0/REPORT.md` and annotated images; commit/push independently and STOP for human approval. Do not touch production meshes, shaders, collision/nav, Tripo assets or existing scene defaults in A0.

## Visual acceptance priorities for future modeling

1. Overall island and coastal silhouette from Golden camera.
2. Large/medium rock-mass hierarchy and physical continuity into original terrain.
3. Clarity of warm/cool and light/shadow planes at gameplay viewing scale.
4. No detached Tripo rock pile, obvious smooth curtain, uniform stair-step brick stacks or visible seams.
5. Fine rock texture and vegetation are last; no microdetail until earlier gates pass.

## Hard constraints

- Original Golden Reference V1 remains authoritative if the supplementary concept differs.
- No destructive replacement or global redesign; preserve existing variants, tests and assets.
- No new Tripo generation, Blender procedural modeling spree, production material pass or full-scene overhaul.
- Commit/push A0 report and images, stop; wait for approval before any G04-A1 implementation.
- Do not interpret the concept board's labeled numbered areas as exact world-space coordinates. Map them to current geometry and ask for review.
