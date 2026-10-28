# M2 spatial and camera contract — blockout v1

Status: M2.1 candidate, awaiting user approval. Dimensions describe the generated blockout, not an approved architectural drawing. Source parameters: `art-source/parameters/island_cottage_v1.json`; measured report: `docs/m2.1/spatial-report.json`.

## Coordinates and area

1 Three.js unit = 1 meter; runtime +Y up, +X right, −Z forward. For this cottage, the entrance/approach side is +Z; its rear is −Z. Room/stair rectangles in the report are local X/Z, offset by the cottage center `(2, -1)`.

| Quantity | Candidate value |
| --- | --- |
| Cottage outer-wall footprint | 6×6 m = 36 m² |
| Usable land plan area | 324 m² = 9.0000× cottage footprint |
| Land outline bounding box | approximately 20.01×23.34 m |
| L-shaped courtyard | 30.145 m² |
| Sea / plateau / lower terrace / beach Y | 0 / 4.80 / 2.40 / 0.45 m |
| Pier deck Y / width / length | 0.65 / 1.80 / 5.00 m |
| Primary outdoor path / coastal stair width | 1.20 / 1.60 m |

Usable area is the sum of nonoverlapping plateau, lower terrace and beach polygons, including the house and circulation. Sea, pier and decorative perimeter rocks are excluded. The generator scales these polygon outlines to `house.width × house.depth × island.landAreaRatio`; 18×18 m is the equivalent square area, not the bounding box of the irregular island. This area definition needs user confirmation.

## Building levels and circulation

| Quantity | Candidate value |
| --- | --- |
| Above-ground storeys / basements | 1 / 1 |
| Ground floor / ceiling Y | 5.00 / 7.70 m |
| Ground-floor clear height | 2.70 m |
| Ground slab thickness | 0.40 m |
| Basement floor / ceiling Y | 2.20 / 4.60 m |
| Basement clear height | 2.40 m |
| Basement slab thickness / bottom Y | 0.20 / 2.00 m |
| Roof rise / eaves | 1.60 / 0.30 m |
| Exterior wall thickness | 0.30 m |

Basement cavity is Boolean-carved into the island; its floor remains above sea. The ground slab has a real opening over both stair flights. There is no second above-ground floor.

Ground floor has living/kitchen, bedroom and bath; basement has storage, workshop and rest/reading zones. `groundRooms` / `basementRooms` report allocated zone envelopes before partition thickness; they are not net room areas. Routes are checked against actual walls/door openings and furniture at 0.25, 1.10 and 2.05 m above each floor. Door openings have 2.10 m clear height. This is spatial verification; character movement/collision remains M3.

The shared internal stair occupies the **rear-left corner**, unlike the concept's right-side straight stair. Its local bounds are X=−2.70…−0.75, Z=−2.70…0.45 m, giving a 1.95×3.15 m bay. The U stair has 16 risers of 0.175 m, 0.275 m treads, 0.90 m flights and a 0.95 m landing. Adjacent corridor clearance is 0.94 m. The whole bay is open through the slab; minimum level clearance is 2.40 m. User approval of this relocation is pending.

Outdoor circulation follows courtyard → upper 13-step flight → 0.90 m landing → lower 11-step flight → beach → pier. Terrain is recessed beneath the coastal stair instead of burying the steps in solid rock.

## Runtime scene node contract

```text
IslandRoot
  Terrain
    TerrainExterior       # physical terrain with basement cavity
    TerrainSection        # inspection variant with front/right rock removed
  Shoreline
  Water
  Pier
  Garden
  Terrace
  Paths
  CottageRoot
    Roof
    ExteriorWalls
      Exterior_{Front,Right,Back,Left}
    GroundFloor
      GroundFloor_Structure
      GroundFloor_InteriorWalls
        GF_Interior_Full
        GF_Interior_Cutaway
      GroundFloor_Furniture
      StairsDown           # one physical staircase, shared by both levels
    Basement
      Basement_Structure
        Basement_BackLeftWalls
        Basement_FrontRightWalls
      Basement_InteriorWalls
        BS_Interior_Full
        BS_Interior_Cutaway
      Basement_Furniture
      StairsUp             # lower entrance anchor, not duplicate stair meshes
```

Blender uses parented Empty objects for groups, not collection instances. Globally unique `GroundFloor_*` / `Basement_*` names replace the draft's repeated `Structure`, `InteriorWalls` and `Furniture` names. `requiredNodes` and `modeHidden` in `public/assets/manifests/blockout_v1.json` are the runtime contract. The shared stair remains visible when blocking ground-floor children are hidden in basement mode.

## View modes and camera presets

- Exterior: full roof/shell and terrain; basement is physically obscured by rock.
- Ground floor: roof, front/right shell and full-height interior wall variant hidden; low walls reveal the plan; basement group hidden.
- Basement: upper floor/shell/furniture and surrounding upper scenery hidden; terrain-section and low interior walls reveal the room while retaining rear/left rock context.

All presets use base yaw 35°, yaw offset 0° and vertical FOV 35°. Pitch is down from horizontal; distance is three-dimensional distance to the target.

| Mode | Target X/Y/Z (m) | Pitch | Distance |
| --- | --- | --- | --- |
| Exterior | 0 / 3.4 / 3 | 42° | 40 m |
| Ground floor | 2 / 5.8 / −1 | 55° | 15 m |
| Basement | 2 / 3 / −0.8 | 50° | 16 m |

M2 profile retains M1 pointer/touch/damping and pitch 30–55° / yaw ±45°, with distance 8–45 m and GUI target X/Z ±12 m, Y 0–12 m to inspect the island. M1 calibration at `/?scene=foundation` retains distance 8–25 m, target X/Z ±3 m, Y 0–3 m and its original defaults. Switching modes applies the corresponding preset; reset returns to the current mode's preset. Arbitrary GUI target changes do not provide camera/world collision protection.

## Deliverables

Blender 5.2.1 `.blend`, Python generator, source JSON, GLB, real Blender→GLB axis asset, fixed Blender/Web screenshots, comparison/plan/height sheets and validation reports are linked in [M2.1 handoff](M2_1_HANDOFF.md). The candidate must be reviewed before M2.2.
