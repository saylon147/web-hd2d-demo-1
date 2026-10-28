# Camera and input specification

## Projection
PerspectiveCamera with initial FOV 35°, pitch 42° down from horizontal, target at scene center or tracked character, yaw offset 0°, orbit distance 16 units.

## Clamps
- Pitch: 30°–55° down from horizontal
- Yaw: ±45° from configured base direction
- Orbit distance: 8–25 units
- Avoid camera clipping into ground and major geometry; adjust near/far planes to scene bounds.

## Controls
- Pointer drag: orbit yaw/pitch within clamps
- Wheel: smooth zoom
- WASD: move character relative to camera horizontal orientation
- Touch: one-finger orbit, two-finger pinch zoom (when supported)
- UI interactions must not propagate to camera drag

## Engineering requirements
Use a single canonical camera state (target, yaw, pitch, distance, FOV). Support resize, damping with frame-rate-independent interpolation, and explicit reset. Art Lab may edit these values and export/import preset JSON. Lock deterministic default framing for Golden Scene screenshots.

## Validation
Test camera at every extreme, on 16:9 and portrait viewports, and while character moves behind buildings. Limited orbit does not eliminate the need for character-relative direction switching.
