# M2.4 — Cottage Tripo Spike / Direction Pivot

Date: 2026-11-03
Branch: `codex/m2-4-cottage-tripo-spike`
Source branch: `codex/m2-2-coastal-assembly`
Status: approved for H01 only; later phases require human review.

## Decision and rationale

Pause G04 coastal-rock work. Preserve all G02/G03/G04 reports, geometry, experiments, and assets as historical references; do not delete or silently revert them. G04-A1 verified geometry generation/integration but failed visual acceptance: new front-foot mass is obscured, too faceted, poorly connected to existing Tripo stones, and does not materially improve Golden silhouette. This is a workflow pivot, not a claim that coastal modeling is impossible.

The next spike tests a different division of labor: Tripo generates a self-contained visual asset (the cottage), while Codex handles placement, scale, orientation, rendering, optional simple collider, reproducible screenshots, and comparison. Codex must not spend multiple iterations sculpting aesthetic corrections procedurally.

## Authoritative references

1. `docs/GOLDEN_REFERENCE_V1.md` and associated Golden V1 image(s): primary visual target.
2. Existing cottage spatial specification / M2 blockout and in-scene camera presets: authoritative for footprint, orientation, scale, doors, access, and scene continuity.
3. Existing coastal review gates: history only, NOT instructions to continue rock work.

The target is one-story Mediterranean cottage, pale stucco/stone walls, terracotta pitched roof, restrained windows/doors and chimney, appealing stylized hand-painted miniature aesthetic. Keep original house footprint and access. Do not introduce a second story or redesign island layout.

## H01 — Reference & asset contract (START HERE, STOP AFTER COMMIT)

Codex:
- Checkout this new branch, confirm `git status`, and identify latest commit.
- Inspect Golden V1, existing cottage geometry, house placement, access/stairs, current render pipeline and GLB import workflow.
- Create a compact cottage asset specification: dimensions / approximate footprint / roof orientation / door-facing side / pivot at ground / Y-up / recommended GLB units, texture dependencies and import requirements.
- Prepare an image-generation brief for a coherent **multi-view cottage reference**: front, left/right, rear, and 3/4 isometric view, consistent doors/windows/chimney/roof, neutral background, no terrain or decorative rocks. If an approved image is supplied by the user, use it rather than inventing one.
- Explicitly list which visual features are fixed by Golden V1 and which are negotiable; note that image-to-3D may produce inaccurate rear views.
- Define H02 acceptance checklist and exact user handoff: reference images supplied, Tripo model exported as GLB with textures, source files/paths.
- Commit a standalone H01 report under `docs/m2.4-cottage/review-gates/H01/`, push, **STOP for user approval**. Do not generate 3D assets, alter the runtime scene, or continue to H02 autonomously.

## H02 — Tripo generation (only after user approves H01)

User generates one candidate in Tripo from approved reference images; preserve original output and texture files. Codex can assist with prompts and validation, but must not spend credits or start Tripo jobs without user authorization. Check silhouette, roof proportions, all four sides, backside completeness, UV/materials, bottom surface, mesh quality, and size before integration. If first candidate is visibly unsuitable, report why and request a targeted regeneration; no endless tweaking.

## H03 — Isolated scene integration (only after H02 approval)

- Import GLB into a **switchable cottage visual variant**, preserving existing house and rollback path.
- Align footprint, roof orientation, doors, scale and pivot. Use a simple proxy collider; avoid Tripo high-poly collision meshes.
- Do not change island geometry, coastal rocks, beach, stairs, dock, camera presets, nav/collision behavior or golden reference.
- Produce baseline vs candidate screenshots under identical camera/light/exposure/DPR at Golden, Golden-close, side and rear views, plus model-only front/rear/isometric.
- Document triangle count, materials/textures, file sizes, visual defects and performance risks.
- Commit/push and STOP for visual review.

## H04 — Decision gate (not authorized yet)

Compare cottage to Golden V1 and existing blockout: recognizable Mediterranean character, clean silhouette, correct roof and door orientation, credible rear view, sensible terrain contact, coherent texture style, no regressions. If passed, use the validated pipeline for other standalone props. If failed, record failure and consider a hybrid workflow (simple Blender architectural mass + generated textures/details) rather than returning automatically to procedural rock sculpting.

## Non-goals and guardrails

- No further G04 coastal-rock iterations during this spike.
- No new island terrain, landscaping, stairs, dock, or house basement redesign.
- No direct edits to Golden V1.
- No expensive generation or broad refactor before explicit human approval.
- Each gate independent, with screenshots/report/commit; aim for a short, reviewable Codex task.
- If any assumptions are uncertain, report them and stop rather than silently changing project geometry.

## Immediate Codex command

```bash
git fetch origin
git switch codex/m2-4-cottage-tripo-spike || git switch --track origin/codex/m2-4-cottage-tripo-spike
git pull --ff-only
```

Read this file, execute **H01 only**, push report and stop.
