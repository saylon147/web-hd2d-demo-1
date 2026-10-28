# Phase 1 implementation plan

## Objective
Deliver a runnable Web visual vertical slice with cohesive hand-painted 3D art, crisp pixel-art 2D characters and a constrained perspective camera. Visual cohesion and repeatable asset production take precedence over game systems.

## Stack
- Vite + TypeScript + Three.js (WebGL2)
- lil-gui for Art Lab controls
- Blender source files and Python export automation
- GLB/glTF 2.0 for environment; PNG spritesheets + JSON metadata for characters
- Simple deterministic movement and collision; no full physics engine in phase 1

## Architecture
```text
src/
  app/              # bootstrap and lifecycle
  core/             # renderer, update loop, asset loading
  world/            # scene, environment, ground/collision
  camera/           # constrained orbit camera
  character/        # controller, sprite animator, direction mapping, grounding
  rendering/        # lighting, materials, postprocessing
  art-lab/          # controls, presets, asset viewer, screenshot utility
  config/           # typed validated config
public/assets/      # runtime GLB, PNG, JSON
art-source/          # Blender source and working art
scripts/             # Blender export, asset validation
docs/
```

## M1 — foundation and camera
1. Initialize Vite/TypeScript, Three.js, lint/typecheck/build scripts.
2. Implement render loop with resize handling, disposal and basic error UI.
3. Add ground grid, primitive test objects and camera target.
4. Implement perspective orbit: pitch 42° default, pitch clamp 30–55°, yaw offset ±45° from base, distance 8–25 world units, FOV 35°. Expose values in debug panel.
5. Pointer orbit and wheel zoom; touch drag/pinch if feasible. Avoid camera going below ground.
6. Document controls and capture initial screenshots.

**Gate:** npm install / npm run dev / npm run build succeed; camera clamps and resizing work.

## M2 — environment and asset pipeline
1. Build 20×20 unit diorama with cottage, stairs, rocks, grass, flowers; start with placeholders and progressively replace.
2. Implement GLB loader, asset manifest, loading/failure states and shared material presets.
3. Set explicit color management, sRGB color textures, tone mapping, shadow maps, ambient and directional lights.
4. Build Blender export and validation scripts; standardize coordinates, pivots and dimensions.
5. Build Golden Scene with fixed camera/light for visual comparison.

**Gate:** all major objects load as assets; visual style is coherent; automated asset validation runs.

## M3 — pixel character integration
1. Introduce placeholder 4-direction idle/walk spritesheet with JSON frames, frame durations and foot anchor.
2. Separate world-space controller from sprite presentation.
3. WASD movement relative to camera yaw, deterministic update and normalized diagonal speed.
4. Ground height sampling, basic colliders and correct depth occlusion against 3D geometry.
5. Nearest-neighbor sprite sampling, alpha handling, grounded blob shadow and stable scale tests at min/default/max zoom.
6. Character direction resolved from movement direction relative to camera.

**Gate:** no wall penetration, no visible floating, correct animation and occlusion across supported camera range.

## M4 — Art Lab and quality
1. Provide asset viewer and Golden Scene mode.
2. Tune lighting, material palette, camera, shadow quality and postprocessing with lil-gui.
3. Save/load presets as JSON (download/upload or explicit import/export); keep default preset in repo.
4. Fixed-camera screenshot capture and side-by-side manual comparison workflow.
5. FPS, draw calls, triangles, texture memory estimates where available; responsive desktop/mobile sanity tests.
6. Update documentation and acceptance evidence.

**Gate:** presets round-trip, screenshots reproducible and acceptance checklist passed.

## Non-goals and decisions
- No React, ECS or physics dependency until a measured need appears.
- Avoid aggressive bloom/DOF that blurs pixel sprites.
- Do not add game mechanics before visual gate.
- Keep generated assets clearly marked as placeholders and replaceable.
- No unauthorized copying of reference artist's actual models or textures.

## Definition of done
See docs/ACCEPTANCE.md. Each milestone must produce a working build, short change summary, screenshots, and known limitations.
