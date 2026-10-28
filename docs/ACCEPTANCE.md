# Phase 1 acceptance checklist

## M1
- [ ] Fresh clone: npm install, npm run dev and npm run build succeed.
- [ ] Camera supports clamped orbit/zoom and resize.
- [ ] Input does not interfere with Art Lab controls.
- [ ] No fatal console errors in desktop browser.

## M2
- [ ] Diorama includes cottage, stairs, rocks, grass and flowers.
- [ ] Runtime scene loads exported GLB files rather than only hardcoded primitives.
- [ ] Material/lighting presets are explicit and documented.
- [ ] Blender export and asset validation scripts have usage instructions.
- [ ] Golden Scene screenshot captured at fixed camera and light.

## M3
- [ ] Pixel sprite has 4-direction idle/walk.
- [ ] Nearest-neighbor pixels remain crisp at supported zoom levels.
- [ ] Character movement is camera-relative and diagonal speed normalized.
- [ ] Grounding, obstacle collision and occlusion work.
- [ ] Contact shadow stays on the ground.

## M4
- [ ] Art Lab can adjust camera, lighting and material presets.
- [ ] Presets can export/import JSON with schema checks.
- [ ] Fixed-view screenshots can be captured and compared manually.
- [ ] Performance stats and mobile/desktop sanity results documented.
- [ ] Remaining visual mismatches and technical debt recorded.

## Required evidence for each milestone
A runnable build, implementation summary, screenshots, validation commands and known limitations. Do not claim visual fidelity from passing automated tests alone.
