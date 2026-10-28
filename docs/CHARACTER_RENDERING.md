# Character rendering specification

## Goals
A 2D pixel-art character moves in a true 3D world without looking blurry, floating, or incorrectly layered.

## First implementation
- One world-space character root for position and collisions; one child plane/Sprite for visual display.
- 4-direction idle and walk, authored in 48×64 or 64×96 pixels (choose based on visual tests).
- PNG spritesheet + animation metadata JSON: direction, frame rect, duration, foot anchor.
- Texture mag/min filters NearestFilter; disable mipmaps initially and test shimmering at all zoom levels.
- Alpha-tested or transparent sprite with depthTest enabled; choose depthWrite policy by explicit occlusion tests.
- Sprite plane faces camera around vertical axis; keep vertical upright.
- Separate semi-transparent ellipse/blob contact shadow anchored to ground, not camera-facing.
- Update world movement and sprite animation independently.

## Direction mapping
Convert movement vector to camera-relative horizontal axes before selecting front/back/left/right. Resolve diagonal ties consistently. Idle preserves last facing direction.

## Grounding/collision
Use downward raycast or ground-height function for walkable surface; simple colliders for walls and rocks; avoid stairs causing abrupt visual snapping. World position is at foot anchor. Document slope and step limits.

## Visual stability
Test default, nearest and farthest zoom; watch for flicker, pixel crawl and alpha halos. Keep character crisp even when world postprocessing is enabled. Do not globally nearest-filter the 3D scene.

## Test cases
- Walk all four directions; rotate camera to yaw limits.
- Walk behind/in front of cottage and stone wall.
- Walk up/down stairs without sinking or hovering.
- Resize window and test high-DPI displays.
- Confirm normalized diagonal speed and no camera-relative direction inversion.
