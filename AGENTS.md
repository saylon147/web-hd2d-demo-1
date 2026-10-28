# Codex working instructions

Read PLAN.md and the relevant docs before implementing. Work sequentially M1 → M2 → M3 → M4. Start with M1 only unless explicitly asked otherwise.

## Rules
1. Maintain a runnable Web build at each milestone. Use TypeScript strict mode and avoid `any` except with justification.
2. Prefer Three.js built-ins and small modules. Do not add React, ECS, full physics engines, or custom shader systems without an explicit demonstrated need.
3. Keep character simulation independent from sprite animation and rendering.
4. Keep asset source, exports and presets separated; no magic hardcoded paths.
5. Document world coordinates and camera angle semantics; verify Blender Z-up → Three.js Y-up.
6. Keep 3D world smoothly rendered and 2D pixel sprites crisp. Never pixelate the entire screen as a shortcut.
7. Treat reference screenshots as style inspiration, not redistributable source assets.
8. Mark temporary procedural assets as placeholders; do not claim final art quality.
9. Before each milestone handoff run available typecheck/build/tests and record outcomes.
10. Include screenshots, changed files, known issues and next milestone proposal in the handoff.
11. Do not silently expand scope into gameplay, backend, accounts or monetization.
12. Preserve documented presets and asset naming conventions; update docs when contracts change.

## First task
Implement M1 from PLAN.md, including basic geometry, constrained perspective camera, controls, resize, debug UI, and documented run commands. Do not attempt all milestones in one pass.
