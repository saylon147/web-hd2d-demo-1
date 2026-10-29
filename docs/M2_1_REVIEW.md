# M2.1 V0 review → V1 corrective iteration (Codex handoff)

**Review date:** 2026-10-29  
**Reviewed commit:** [788087e](https://github.com/saylon147/web-hd2d-demo-1/commit/788087e6d34c106609b2392e90676cf778c19d43)  
**Decision:** **M2.1 V0 NOT APPROVED visually. Remain in M2.1; do not begin M2.2.**

## Review basis and scope

Reviewed the user-provided `reference-comparison` screenshot, committed `docs/M2_1_HANDOFF.md`, `docs/m2.1/spatial-report.json`, `art-source/parameters/island_cottage_v1.json`, `src/world/blockout.ts`, and the Blender generator `scripts/generate_blockout.py` (especially terrain/rock/paths/house setup). This is a code-and-image review, **not** a local execution or a claim to have independently verified build/test results. Codex's handoff reports passing tests and export validation; those are engineering successes, not visual signoff.

The approved Golden Reference V1 is the user's **one-storey cottage + basement** island concept. Preserve that reference; do not generate or substitute a new style reference. Its local original may be gitignored; use the existing derived comparison screenshot for reproducible review.

## Findings (ordered by severity)

### P0 — Island massing is wrong even for a blockout
**Evidence:** screenshot exterior row; generator `prism()`, `raw_outlines`, `rock_meshes`, `Beach`. The island is assembled as near-vertical extruded polygon tiers at fixed Y = 4.8, 2.4, 0.45. This creates a stacked pedestal / layer-cake silhouette, unlike the Golden Reference's organic coastal rock mass with an integrated plateau, uneven edge and transitional slopes. Additional ico-spheres on the rim do not fix the underlying silhouette.

**Required change:** replace the main visible cliff silhouette with a parameterized irregular terrain/rock mesh: multi-ring shoreline-to-plateau profiles, varying edge elevations and radial offsets, seeded but spatially coherent perturbations, and local ramps/stone retaining walls where necessary. Preserve an actual basement cavity and traversable terrace/stair access. Avoid regular concentric terraces, uniformly vertical cliff faces, perfectly flat continuous perimeter shelves. Keep a coherent island footprint and sea clearance. No photoreal displacement or heavy polygon count required.

### P0 — Building silhouette and site composition diverge
**Evidence:** screenshot exterior row. The current white roof, raised building and extensive visible artificial platforms dominate the composition. Reference: compact, single-storey terracotta cottage integrated into a planted terrace with readable beach/steps/pier.

**Required change:** first match cottage-to-island **visual proportions and placement** in the fixed camera. Keep the roof as a simple readable Mediterranean pitched roof (avoid accidental multiple-storey impression), consistent wall height, eaves and doorway scale. Improve site transitions: front approach, terrace edge, garden, beach and pier should read as a connected landscape rather than attached slabs. Preserve a single above-ground storey.

### P1 — Spatial correctness metrics are necessary but not sufficient
**Evidence:** spatial report gives exactly 324 / 36 = 9.0000 land-area ratio; script rescales polygon outlines by `sqrt(target / sum(area(outline)))`. This measures plan area, not silhouette, visual occupancy, walkability or actual spatial harmony. The report also explicitly calls room areas 'zone envelopes', not net area.

**Required change:** retain the 9× target as a **range** (e.g. 8.5–9.5×) and report true nonoverlapping usable surface area, plus visual footprint/camera framing. Do not optimize to 9.0000 at the cost of shape. Show the cottage/land area in top-down plan and default exterior shot. Record major clearance/path widths and distinguish actual navigable surfaces from purely visual rocks.

### P1 — Interior floor plans lack clear room readability
**Evidence:** screenshot rows 2/3 show generic partitions and block furniture. Spatial report: 6×6m cottage, living/kitchen allocated 8.303m², bedroom 6.9m², bath 2.535m²; stair bay ~1.95×3.15m. A large proportion of the small footprint is consumed by the stair core, and the current cutaway reads like disconnected rectangular walls.

**Required change:** before adding furniture detail, produce clear **annotated top-down plans** with room names, door openings, stair arrows, walkable corridors and dimensions. Check room/door clearances, door swings (schematic), stair headroom, and whether 6×6m can credibly fit all rooms. If not, propose minimal parametric footprint changes and explain tradeoffs before implementing. U-shaped stairs are acceptable if justified; reference straight stairs are not mandatory. Ensure ground floor and basement are vertically aligned and the basement is visibly embedded in rock.

### P1 — Clay inspection presentation obscures structure
**Evidence:** user screenshot is overexposed/very low contrast. Generator uses pale materials (`deded8`, `b9bdb9`, `e6e4db`) and runtime `HemisphereLight(...,2.4)`, `DirectionalLight(...,3)`, basement fill `PointLight(...,8)` in `src/world/blockout.ts`.

**Required change:** use a restrained **diagnostic color blockout**, not finished textures: cream walls, muted terracotta roof, warm grey rock, sage land/vegetation, sand beach, desaturated blue water, distinct floor slabs, dark stair edges. Reduce light intensities/exposure as needed and verify shadows/contrast in actual Three.js screenshots. Interior cutaways must make wall boundaries, floor and stairs readable. Avoid saturated cartoon colors or prematurely polished beauty passes.

### P1 — Reference comparisons need equivalent views and measurable evidence
**Evidence:** the committed comparison sheet puts Web screenshots next to concept-art panels; perspective, crop and content differ significantly. Useful for intent, not pixel-perfect matching.

**Required change:** produce a new V1 sheet with: (a) same fixed-camera Web V0 vs V1 exterior; (b) V1 exterior vs Golden Reference crop, with explicitly acknowledged different perspective; (c) V1 annotated ground/basement top-down plans; (d) basement vertical section showing sea level, terrain, floor slabs and stair; (e) Web three view modes. Add a brief deviation log (resolved / unresolved / intentionally different). Do not assert visual parity merely because all files exist.

### P2 — Review evidence must be maintained without modifying Golden Reference
The original `docs/references/golden-reference-v1.png` is intentionally ignored in the current repo; do not replace it, add a fabricated reference, or require it for `npm run dev/build`. If a comparison script requires the local original, gracefully document that prerequisite. Keep old V0 screenshots for before/after evaluation.

## Concrete Codex tasks for this iteration

1. **Preserve V0:** keep existing `art-source/parameters/island_cottage_v1.json`, `*.blend`, GLB and screenshots available for comparison. New outputs should be versioned `v2` or `m2.1-v1`; avoid silently overwriting evidence.
2. **Refactor terrain generation** in `scripts/generate_blockout.py` (or split into small modules): organic cliff/shoreline profile, irregular terrace edge, meaningful coast transitions, seeded deterministic geometry, true basement excavation. Do not introduce massive triangle budgets.
3. **Correct cottage/site massing** against Golden Reference: roof/house/plateau/paths/steps/beach/pier relationship. Keep one above-ground storey + one basement.
4. **Revisit internal plan** with explicit dimensions, room labels, doors, staircase route and floor/rock section; only change house footprint if clearly justified and reflected in area ratio/parameters.
5. **Improve diagnostic palette and lighting** in Blender and Three.js; screenshots must be visually legible at normal viewing size.
6. **Regenerate/export/validate** Blender 5.2.1 source, GLB, manifest, metrics, screenshots. Preserve M1 camera and M2 view-mode functionality.
7. **Update handoff/report** with before/after images, deviations, engineering checks, exact commands, measured stats and known limitations.
8. **STOP for human review** before M2.2. No detailed roofing tiles, painted textures, dense foliage, ComfyUI or pixel character work.

## Acceptance criteria for M2.1 V1

- [ ] Exterior silhouette reads as **natural rocky island**, not tiered pedestal.
- [ ] Cottage clearly reads as a compact **single-storey** building in the same scene language as the reference.
- [ ] Site visually connects terrace → stairs → beach → pier; garden has usable space.
- [ ] Basement remains a real cavity within rock; no sea/terrain intersection, ground-to-basement stair is traversable.
- [ ] Floor plans show all requested rooms, openings, circulation and dimensions; no implausible unmarked overlaps.
- [ ] Report includes land/cottage area ratio and identifies the method of measurement.
- [ ] Diagnostic clay-color screenshots show readable depth, geometry and boundaries without overexposure.
- [ ] Three.js exterior / ground floor / basement modes work; M1 regression remains intact.
- [ ] V0 vs V1 Web exterior comparison and V1 reference/plan/section evidence committed.
- [ ] User explicitly approves before M2.2.

## Implementation guidance

Do not solve the visual mismatch by merely increasing polygon count, adding noise to the existing extruded prisms, changing the reference image, or dressing the current blockout with foliage. Prioritize **large shape → composition → interior plausibility → presentation**. If 6×6m proves inadequate, document 1–2 feasible alternatives and implement the least disruptive one with explicit rationale.

**Requested next Codex run:** implement this review as **M2.1 V1 corrective pass**, commit artifacts and screenshots, then pause for user approval.
