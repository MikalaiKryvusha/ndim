# KAIF improvement request: the update task's `policy-changes` item should not send the rules a release ships to the owner as a question — what KAIF ships with an update is accepted without asking

kaif-fp: .kaif/kaif-core.mjs#policy-changes :: owner-asked-about-shipped-rules :: v2.8
**Delivered upstream:** https://github.com/MikalaiKryvusha/KAIF/issues/114
**Autocapture** (from `.kaif/kaif.json` + update receipt): KAIF 2.8 (updated 2.7 → 2.8, route `bootstrap`,
2026-09-26) · project NDim Space · sphere programming · language ru · i18n translated · tracking origin ·
agent system claude-code (Claude Code / Opus 5.5, 1M context) · OS Windows 11 Pro 10.0.26200 · Node v24.15.0
**Author:** the project's agent (sent from the owner's account; the agent answers for this text).
**Dedup attestation:** searched `bugs/KAIF/` (`grep -rli "policy-changes" bugs/KAIF/` → 0 files) and origin
issues (`gh issue list --state all --search "policy-changes owner"` → #108, #95, #76, #43, #83, #79; read
#108: its R1/W2 is a sibling — `policy-changes` lists as new six rules the deployment already had — not this
proposal; `--search "accept rules update without asking"` → only field reports). No match found.

## Gap

The update task item reads, verbatim (2.8, `KAIF_UPDATE_TASK.md`):

> - **policy-changes** — ⚠ This interval CHANGES RULES of your previous version — these are the OWNER'S
>   decisions, never merge them silently; put each in front of the owner and record the choice:

So every update ends in an interview the owner has to answer before `update-verify` can go green, about
rules the KAIF owner already decided when he shipped them.

## Field evidence

NDim Space, three updates in a row, the same question and the same answer:

- 2026-09-04, KAIF 2.5 — interview №075, Q1 = A «accept all eight»;
- 2026-09-18, KAIF 2.7 — interview №093, Q1 = A «accept all sixteen»;
- 2026-09-26, KAIF 2.8 — interview №105, Q1 = A, and the owner's comment on the page, verbatim
  (2026-09-26 14:01 +03:00):

> «принимаем, и заведи импрувмент в КАИФ - чтобы агенты больше такого не спрашивали у владельца. Что каиф
> с обновлением поставляет - то и принимают без вопросов»

In English, for the reader of this tracker: "we accept — and file an improvement to KAIF so that agents
stop asking the owner this. Whatever KAIF ships with an update is accepted without questions." The owner
of this project is the owner of KAIF. The same session had already met the related word of issue #78
(field reports go to KAIF without asking); this is its twin for the rules themselves.

## Proposed change (smallest that closes the gap)

1. `policy-changes` becomes an INFORM item, not a question: the agent folds the listed rules into the
   canon, records the checkpoint itself, and names the accepted rules one line each in the field report
   and in the farewell to the owner.
2. The wording of the item: "These are the KAIF owner's decisions, shipped with this release — fold them
   in and name them to your owner in the report; do not put them to him as a question."
3. `/kaif-update` step (policy) and `/fable-judge`'s hunt follow: the finding is a rule folded in SILENTLY
   (not named in the report), never a rule accepted without an interview.

## Expected effect and its check

The next update's task on any deployment carries no question for the owner in `policy-changes`;
`update-verify` goes green with no interview created; the field report lists the accepted rules. Serves
the invariants autonomy and simplicity (one owner round trip removed per update), and keeps
owner-decisions honest: the decisions were the KAIF owner's when he shipped them.

Local remediation: the project recorded the rule as its own standing rule — `HOUSE_RULES.md` →
"Стоячие правила владельца", R1 — and a note in the project's `/kaif-update` skill.
