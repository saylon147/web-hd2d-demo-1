# M2 acceptance gates

## M2.1 — blockout
- [x] Blender 5.2.1 Python script reproducibly generates island and house.
- [x] Island land area approximately nine times cottage footprint; parameter documented.
- [x] Single above-ground storey and one plausible basement embedded in rock.
- [x] Ground floor and basement rooms fit and connect via viable internal stairs (candidate layout; routes/headroom checked).
- [x] Beach, pier, stairs, garden and main paths spatially coherent (blockout supplied for visual approval).
- [x] GLB exports with independently addressable roof/ground floor/basement groups.
- [x] Three.js loads scene and preserves M1 camera controls.
- [x] Exterior, ground-floor cutaway, basement cutaway and browser screenshots supplied.
- [ ] Human approval recorded before M2.2.

Evidence and limitations: [M2.1 handoff](M2_1_HANDOFF.md). Engineering checks passed on 2026-10-28: lint, strict typecheck/build, 24 unit tests, 11 browser tests (including 7 M1 regressions), 54 asset/spatial checks. Repeated generation produced an identical GLB hash. These checks do not approve the layout or aesthetics. Review island/house ratio, courtyard space, basement height and the rear-left U stair before continuing.

## M2.2 — cottage
- [ ] Approved clay silhouette.
- [ ] Material/albedo references reviewed.
- [ ] Blender beauty and Web runtime images compared.
- [ ] Cottage designated as approved master asset.

## M2.3 — environment
- [ ] Approved master assets for rocks, stairs, vegetation and pier.
- [ ] Variations are seeded, reusable and stylistically consistent.
- [ ] Any AI-generated textures have provenance and licensing notes.

## M2.4 — final assembly
- [ ] Island exterior and two interior inspection modes work.
- [ ] Visual differences and known limitations documented.
- [ ] Typecheck/build pass; browser performance measured.
- [ ] User approves final M2 before M3 begins.
