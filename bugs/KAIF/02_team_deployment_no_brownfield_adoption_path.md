# KAIF improvement request: /team-deployment has no adoption path for an ALREADY-LIVE team

kaif-fp: skill:team-deployment#operations :: brownfield-adoption-missing :: v2.4
**Autocapture** (from `.kaif/kaif.json` + update receipt): KAIF 2.4 · project NDim Space ·
sphere programming · language ru · i18n translated · tracking origin · agent system claude-code
(Claude Code / Fable 5) · OS Windows 11 · Node 24.15.0
**Dedup attestation:** searched `bugs/KAIF/` (`Select-String … -Pattern "team-deployment"` →
0 matches) and open origin issues (`gh issue list --repo MikalaiKryvusha/KAIF --state open
--search "team-deployment adoption"` → 0 rows). No match found.

## Gap

The skill's five operations cover the GREENFIELD path: analyze → suggest → deploy → status →
retrospective. A project whose live team PRE-DATES the canon (ours: six roles in git worktrees,
running since 2026-08-21, i.e. the very field team the skill was distilled from) has no named
operation for ADOPTING the canon: comparing the existing organization against the constitution's
nine invariants, the board contract, the roles library and the naming invariant; classifying
each difference (already-matching / bring-to-canon / better-than-canon); and taking the owner's
decision on the deltas. Operation 3 ("deploy: materialize") actively misleads here — following
it verbatim would overwrite a live constitution and board with templates.

A second, smaller facet of the same gap: the naming invariant is presented with "(owner's word
on the pattern)" as if universal — but an existing deployment can carry a DIFFERENT owner's word
for the same parameter (ours: `ndim_<role>`, the owner's word of 2026-08-21, predating the
canon's `<project>-team-<role>`). The skill gives no rule for which word wins; the correct
answer (the project owner decides, framed as an explicit fork) had to be derived from general
KAIF principles.

## Field evidence

NDim Space, 2026-08-28, first 2.4 field use of the skill. The adoption pass was improvised: the
agent hand-built a delta table (nine invariant sections · board-tool contract 6/6 · archetype
match web-product-medium · naming divergence), put it to the owner as interview №051 (five
questions, review page), and applied only the approved deltas. Outcome was good — all nine
invariants were already present since the canon was distilled FROM this team — but every step of
the adoption procedure had to be invented, and operation 3's "copy the template over" was the
default trap to avoid.

## Proposed change (smallest that closes the gap)

Add an operation (or a named sub-path of operation 2) — **"adopt: reconcile a live team with
the canon"**: (1) inventory the existing constitution/board/tools against the nine invariants
and the board-tool contract; (2) three-bucket the delta — matches / bring-to-canon /
better-than-canon (the last bucket is a SIGNAL TO ORIGIN, not a defect); (3) put the delta to
the owner as a decision before any change; (4) apply approved items without overwriting the
owner's recorded words; existing local names (documents, workplaces) that carry the owner's own
word stay legitimate under an explicit note. One paragraph in the skill plus one line in each
template header ("an existing live team: see the adopt path — do not copy over it") suffices.

## Expected effect and its check

A project with a pre-canon team runs the adopt path and ends with a recorded owner decision and
zero overwritten local canon (check: the constitution's local wording survives byte-wise except
approved additions). The templates stop being a copy-over hazard for the deployments that need
the skill most — the ones that already run teams.
