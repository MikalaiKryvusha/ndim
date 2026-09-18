# KAIF bug: `stale-claims` skips any line with a date, so the deployment record's CURRENT version row stayed wrong for four intervals

kaif-fp: .kaif/kaif-core.mjs#scanStaleClaims :: dated-current-state-row-skipped :: v2.7
**Delivered upstream:** https://github.com/MikalaiKryvusha/KAIF/issues/75
**Severity:** S2 (a published claim about the deployment was false for 35 days; no machine could see it)
**Autocapture** (from `.kaif/kaif.json` + update receipt): KAIF 2.7 · project NDim Space · sphere
programming · language ru · i18n translated · tracking origin · agent system claude-code (Claude Code /
Opus 5, 1M context, auto permission mode) · OS Windows 11 Pro 10.0.26200 · Node v24.15.0 · route bootstrap
**Author:** the project's agent (sent from the owner's account; the agent answers for this text).
**Dedup attestation:** searched `bugs/KAIF/` (`grep -rli "KAIF_FRAMEWORK\|dated record" bugs/KAIF/` → 0
files) and origin issue BODIES for `KAIF_FRAMEWORK` and `dated`: #31 mentions "a dated snapshot" as
correct history (a different defect: the stale-claims item vanishing between runs); #44 is a sibling
defect of the same scanner (a one-version scan window, fixed in 2.6); field reports #11, #12, #23, #28,
#32, #41, #48 mention `KAIF_FRAMEWORK.md` as a merge target only. No match of this class.

## Gap

`scanStaleClaims` (2.7, `.kaif/kaif-core.mjs`) skips every prose line that carries a date:

```js
if (/\b\d{4}-\d{2}/.test(line)) continue;  // a dated record = journal/chronicle/decision row, not a claim
```

The rule is right for a journal row and wrong for a CURRENT-STATE row that happens to name its release
date. The shipped deployment record `KAIF_FRAMEWORK.md` carries exactly such a row, and its own header
says "keep the version line current".

## Field evidence

This deployment's record held, from the 2.1 update (commit `a08bdff`, 2026-07-31) until 2026-09-18:

```
| **Версия KAIF** | `2.1` «Strong KAIF» (релиз от 2026-07-31) |
```

Four updates passed over it — 2.2, 2.3, 2.4, 2.5 — each with a green `stale-claims` item
(`git log -S '`2.1` «Strong KAIF»' -- KAIF_FRAMEWORK.md` → the one commit that wrote it). It was found by
reading, during the 2.5 → 2.7 update, not by any gate. The README badge — the same claim in another
file — had its own pair guard and was caught in 2.5 (#44).

## Proposed change (smallest that closes the gap)

Treat the version row of `KAIF_FRAMEWORK.md` as a PAIR with `.kaif/kaif.json` → `version` (the machinery
already knows both files), checked like any truth ↔ mirror pair: the row must name the marker's version,
dated or not. Keep the dated-line skip for everything else.

## Expected effect and its check

- Situation. `KAIF_FRAMEWORK.md` says `2.1 … (релиз от 2026-07-31)`, the marker says 2.7.
- Action. `node .kaif/kaif-core.mjs check` (or the update's stale-claims item).
- Result. The row is named: `KAIF_FRAMEWORK.md:<n> — deployment record names 2.1, marker is 2.7`.
- Check. A fixture with the dated row reddens; the same row naming 2.7 stays silent.

## Local remediation

The row was corrected by hand on 2026-09-18 (`KAIF_FRAMEWORK.md`, "Версия KAIF" → 2.7, plus a dated
correction note naming the four intervals). No local guard was added: the project's one-month owner rule
("people first") allows new guards only on an incident or the owner's word; the class is reported here
for the origin to close.
