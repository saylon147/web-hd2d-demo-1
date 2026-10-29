# M2 spatial contract — M2.1 V1 corrective candidate

Status: **awaiting human review; V0 was visually rejected; M2.2 has not started**. Current source is `art-source/parameters/island_cottage_v2.json`, runtime manifest `public/assets/manifests/blockout_v2.json`, measurements `docs/m2.1-v1/spatial-report.json`. Historical V0 remains in the `v1` assets and `docs/m2.1/`; its handoff is historical evidence, not current approval.

## Coordinates and massing

1 Three.js unit = 1 meter; +Y up, +X right, −Z forward. The cottage entrance faces +Z; rear is −Z. Local floor-plan X/Z rectangles are offset by cottage center (2, −1). Helpers store runtime `(x,y,z)` as Blender `(x,−z,y)`; standard glTF `export_yup=True` returns the original runtime coordinates. No second rotation is applied after GLTFLoader. `axis_test_02.glb` independently checks native Blender +X→runtime +X, +Y→−Z, +Z→+Y.

| Quantity | V0 | V1 |
| --- | --- | --- |
| Cottage external footprint | 6×6 m / 36 m² | retained |
| Plateau / local mid-landing / beach Y | 4.80 / 2.40 / 0.45 m | 3.80 / 2.20 / 0.45 m |
| Ground floor / wall top Y | 5.00 / 7.70 m | 4.00 / 6.70 m |
| Basement floor / ceiling Y | 2.20 / 4.60 m | 1.20 / 3.60 m |
| Basement bottom / sea Y | 2.00 / 0 m | 1.00 / 0 m |
| Clear heights ground / basement | 2.70 / 2.40 m | retained |
| Ground / basement slab thickness | 0.40 / 0.20 m | retained |
| Roof rise / eaves | 1.60 / 0.30 m | 1.15 / 0.25 m |
| Above-ground / basement storeys | 1 / 1 | retained |
| Courtyard | 30.145 m² | 19.50 m² |

The V1 terrain is one continuous triangulated coastal mass with six irregular profile rings, coherent seeded angular perturbations, varying edge height and slanted/buttressed rock faces. The low sand shelf is local to the southern cove. There is no continuous flat perimeter shelf or extruded stack. The high central core contains a real Boolean basement cavity. Coastal stairs have individual terrain recesses, 0.025 m below tread tops to avoid coplanar flicker. The basement inspection variant opens front/right rock to below sea while retaining back/left embedding context.

## Area definition and camera framing

V1 is **333.21 m² / 36 m² = 9.2558×**, within 8.5–9.5×. There is no outline rescaling to the target. Count = **297.21 m² connected exterior navigable projection + 36 m² occupied cottage pad**. Water, pier, detached decorative rocks, planted beds/trunks and disconnected pockets are excluded. The house pad is occupied, not claimed to be freely walkable.

A 0.10 m grid raycasts the actual generated mesh union from above; each sample uses the highest surface once. Accept Y≥0.24 m and slope≤30°, then flood from the porch using four neighbors and height differences≤0.24 m. The separately reported true sloping surface area differs from this projected land ratio. The 0.20 m coarse survey gives a convergence check; this is finite-resolution geometry verification, not a character collider/navigation implementation. Planted exclusion is 8.08 m²; isolated gentle surfaces are also reported. [Land footprint](screenshots/m2.1-v1/land-footprint.png) colors the connected sample union. `camera-framing.json` projects actual vertices to the fixed exterior view: cottage width 19.48% of canvas vs V0 20.12%; island width 59.78% vs 52.79%. These are bounding rectangles, not pixel occupancy or reference similarity.

## Floor plans and circulation

[Annotated plans](screenshots/m2.1-v1/annotated-plans.png) derive walls/openings/furniture bounds from the same generator data as the GLB. Bedroom: clear 2.15×2.85 m = 6.128 m²; bath: 1.40×1.90 m = 2.660 m². The living/kitchen and common circulation share 11.605 m² net floor, sampled after subtracting partitions, closed rooms and stair void; furniture still occupies part of it. Its small display rectangle is a label zone, not the full net-area boundary. Basement storage/workshop/reading rectangles are nonoverlapping zones; the workshop and reading areas remain open, not independent enclosed net rooms.

V1 moves the bedroom door to its corridor-side wall and widens/repositions the bath. Doors: main 1.00 m; bedroom/bath 0.90 m; clear head 2.10 m. The bath door swing is schematic and outward into common space. Bed side/foot clearances are 0.80 / 0.75 m. Bath entry to toilet is 0.74 m. Corridor is 0.94 m. Routes check 0.60 m width at 0.25, 1.10 and 2.05 m above floors against actual Boolean walls and furniture. This does not certify accessibility or architectural code compliance.

The rear-left U stair is retained: local X=−2.70…−0.75, Z=−2.70…0.45 m; bay 1.95×3.15 m. 16 risers×0.175 m, tread 0.275 m, flight 0.90 m, landing 0.95 m; level difference 2.80 m. Both flights fit the real slab void. Minimum room/bay headroom is 2.40 m. One physical `StairsDown` is shared by both modes; `StairsUp` is only an anchor. The physical vertical-section evidence slices the upper flight at X=0.80 m, with the lower flight parallel outside that plane.

Outdoor approach: courtyard → 13-step upper flight → 0.90 m landing → 11-step lower flight → beach → pier. Coastal risers: 0.1231 / 0.1591 m, treads 0.25 m, width 1.60 m. Garden paths are 1.20 m; pier width/length 1.80 / 5.00 m and top Y=0.65 m. The lower overall elevations reduce the pedestal impression while keeping the basement clear of the sea.

## Runtime node and view contract

The V0 named hierarchy remains: `IslandRoot`, `Terrain/{TerrainExterior,TerrainSection}`, `Shoreline`, `Water`, `Pier`, `Garden`, `Terrace`, `Paths`, `CottageRoot/{Roof,ExteriorWalls,GroundFloor,Basement}`. `GroundFloor` contains structure, full/cutaway interior walls, furniture and shared `StairsDown`; basement contains structure with back/left and front/right visibility groups, full/cutaway interior walls, furniture and `StairsUp`. Manifest `requiredNodes` / `modeHidden` are authoritative; groups are Blender Empties, not collection instances.

| Mode | Target X/Y/Z | Pitch | Distance |
| --- | --- | --- | --- |
| Exterior | 0 / 3.4 / 3 | 42° | 40 m |
| Ground floor | 2 / 4.8 / −1 | 55° | 15 m |
| Basement | 2 / 2 / −0.8 | 50° | 16 m |

All use base yaw 35°, yaw offset 0°, vertical FOV 35°. Pitch is down from horizontal; distance is 3D distance to target. Exterior shows full shell and physical terrain. Ground-floor mode hides roof/front/right shell and uses low interior walls. Basement uses the open rock variant and hides upper structure, front/right basement walls and upper scenery. Reset restores the current mode preset.

M2 distance limits remain 8–45 m, pitch 30–55°, yaw ±45°, target X/Z ±12 m and Y 0–12 m. `/?scene=foundation` preserves M1 distance 8–25 m and original presets. `/?version=v0` selects original assets, original mode presets and original exposure/light values. Arbitrary target edits have no camera/world collision constraint. V1 diagnostic light/exposure values are stored in the parameter JSON and manifest, never promoted to approved art.
