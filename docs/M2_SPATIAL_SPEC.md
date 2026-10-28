# M2 spatial and camera contract — draft v0.1

## Parameter defaults (adjustable, not architectural facts)
- World scale: 1 Three.js unit = 1 meter; runtime +Y up.
- Cottage footprint: **6m × 6m**, approximate.
- Effective island land footprint: **18m × 18m** (9× cottage area); irregular shape rather than square.
- Sea plane: Y = 0.
- Main ground plateau: roughly Y = 4–6m above sea level, terrain stepped/sloped toward coast.
- Ground-floor clear height: 2.6–2.8m.
- Basement clear height: 2.3–2.5m.
- Keep sufficient rock mass under cottage for basement ceiling, floor and structure; do not let basement intersect sea.
- Island water bounds may extend beyond 18×18m.

## Building logic
Ground floor needs living/dining, kitchen, bedroom and bathroom. Basement needs storage, workshop and optional reading/rest zone. A stair opening must have adequate headroom and fit both levels. Define doors and navigation routes; do not rely on a visually pleasing but physically impossible cutaway.

## Runtime scene node contract
```text
IslandRoot
  Terrain
  Shoreline
  Water
  Pier
  Garden
  CottageRoot
    Roof                 # visibility toggle
    ExteriorWalls        # optional cutaway group
    GroundFloor
      Structure
      InteriorWalls
      Furniture
      StairsDown
    Basement
      Structure
      InteriorWalls
      Furniture
      StairsUp
```
Blender object collections and GLB node names should map to this contract or document deviations.

## View modes
- Exterior: roof and exterior walls visible; underground obscured.
- Ground floor: roof hidden; interior legible, basement concealed.
- Basement: roof and blocking ground-floor geometry hidden or cut away; basement visible with appropriate lighting.

Use M1 camera constraints as baseline; add mode-specific camera target and distance only as needed. Preserve M1 controls.

## Blockout deliverables
Blender 5.2.1 .blend and reproducible Python generator; exported GLB; source parameters; fixed camera screenshots for exterior/ground floor/basement; browser runtime screenshot. All are required before fine art.
