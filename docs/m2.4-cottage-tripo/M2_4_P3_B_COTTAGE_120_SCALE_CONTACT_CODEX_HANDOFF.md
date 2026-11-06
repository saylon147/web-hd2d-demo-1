# M2.4 P3-B — Cottage 1.20× scale and platform contact handoff

Date: 2026-11-06
Branch: `codex/m2-4-cottage-tripo-spike`
Predecessor: `docs/m2.4-cottage-tripo/review-gates/P3-A/REPORT.md`

## Decision and scope
P3-A experimental evidence accepted, but NO candidate is approved to replace the default cottage. Visual direction: **1.20× relative to B0/P2**, between B1 (1.15×) and B2 (1.25×). B2 appears slightly oversized in Golden-close/top; B1 is conservative. 1.20× is a hypothesis, not a predetermined pass. Keep A/B0/B1/B2/B3 and all P3-A evidence intact.

Do **not** start performance optimization, mesh decimation, material/texture edits, foliage decoration, terrain/cliff work, or change the main scene's default cottage.

## Gate P3-B0: 1.20× visual + measured candidate
1. Add candidate `B1_20` (or `B20` with explicit label `1.20×`) using **uniform scaling** of the original Tripo cottage; preserve source GLB, UVs, textures, proportions, and P2 fixed camera/light/exposure/DPR.
2. Use the actual source base-plane and door-anchor measurements from P3-A. Report world width/depth/height, position, front approach clearance, stair clearance, platform overlap, underside support gaps, and penetration with retained guard/inner-stair geometry. Do not assume an AABB means physical contact.
3. Produce same-frame comparisons at least B1 / new 1.20× / B2: Golden, Golden-close, top, front, contact-front; retain A/B0 as accessible controls. No camera reframing or image normalization.
4. Commit/push B0 evidence and **STOP for human review**. No geometry changes in this gate.

## Gate P3-B1: platform/base integration proposal (ONLY after explicit B0 approval)
The P3-A report found original upper floor 6×6 m (Y=4), enlarged Tripo base wider than that, retained inner stair guard penetrations (B1=792 vertices, B2=472), and localized 0.16–0.20 m support gaps near lower courtyard. These are real blockers, not image-only artifacts.

First propose 2 minimally invasive, switchable alternatives with screenshots and quantified geometry:
- Option A: candidate-only hide/replace specific redundant old **visual** floor/guard/paving pieces, while maintaining equivalent walkability, stairs and safety; integrate the Tripo stone base with a localized supporting surface/transition.
- Option B: localized reversible foundation/plinth transition or adjusted placement with no ungrounded floating base, preserving stair access and visible front route.
No destructive edit of original GLB, terrain, stair/dock geometry, collision/navigation, or old presets. Never silently hide guardrails or fill stair openings. Keep the basement and stair function intact. If no clean solution is possible without broader structural redesign, document conflict and stop instead of masking it.

For each option, show Golden, Golden-close, top, front, contact-front, side and underside/section if necessary; include objective contact/penetration measurements and a concise tradeoff table. Commit/push and STOP; no automatic adoption.

## Acceptance criteria
- House is visually proportional to the island, with room for future courtyard and planting.
- Stone base reads as supported, not floating or buried; no obvious duplicate slabs.
- No actual penetration into retained stair guard / basement entrance; usable stair approach preserved.
- Original environment, Tripo coastal rocks, original default scene, P1/P2/P3-A evidence and source assets unchanged.
- Build, lint, tests, browser evidence pass; include report with reproduction URL and exact commit.
- Every gate is independently reversible and ends at a human review. Target small 15–30 minute units; if over budget, checkpoint and report.

**Immediate Codex instruction: execute P3-B0 ONLY, push evidence, and stop.**
