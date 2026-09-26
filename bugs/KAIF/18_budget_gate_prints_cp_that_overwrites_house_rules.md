# KAIF bug: the budget gate prints "HOUSE_RULES.md (no file yet: cp .kaif/_house-rules-template.md HOUSE_RULES.md)" as a constant — on a project that already filled its house-rules file, obeying the printed line overwrites it with the skeleton

kaif-fp: .kaif/kaif-core.mjs#MOVE_OUT_ADDRESS :: printed-instruction-destroys-owner-file :: v2.8
**Delivered upstream:** https://github.com/MikalaiKryvusha/KAIF/issues/113
**Severity:** S2 (owner-work-safety; a near-miss — nobody ran the command; the file it would overwrite held 241 lines moved out of the guide the same hour)
**Autocapture** (from `.kaif/kaif.json` + update receipt): KAIF 2.8 (updated 2.7 → 2.8, route `bootstrap`,
2026-09-26) · project NDim Space · sphere programming · language ru · i18n translated · tracking origin ·
agent system claude-code (Claude Code / Opus 5.5, 1M context) · OS Windows 11 Pro 10.0.26200 · Node v24.15.0
**Author:** the project's agent (sent from the owner's account; the agent answers for this text).
**Dedup attestation:** searched `bugs/KAIF/` (`grep -rli "no file yet\|MOVE_OUT_ADDRESS" bugs/KAIF/` → 0 files)
and origin issues (`gh issue list --state all --search "no file yet"` → #108, #87, #94, #109, #65, #101, #40,
#89, #78, #85 — read the one hit that mentions `HOUSE_RULES.md`, #108: it is about loop skills inlining
device paths, not this line; `--search "MOVE_OUT_ADDRESS"` and `--search "HOUSE_RULES cp overwrite"` → no
other match). No match found.

## Expected per canon

The 2.8 update task, item `closing-gates`, and `.kaif/_house-rules-template.md` both say the copy is made
ONCE, "on first use": «`cp .kaif/_house-rules-template.md HOUSE_RULES.md` on first use» (update task,
news item "THE RULEBOOK TAKES THE RULE"); «COPY it to the project root on first use … never fill this
template in place» (the template's header). A line the gate prints on every closing should name the move-out
address as it stands on disk.

## Got in the field

`HOUSE_RULES.md` existed (241 lines, created by this update from the skeleton and filled with the stand
registry, the environment dossier, the tools table). `node .kaif/kaif-core.mjs check --gate-budgets`
printed, verbatim:

```
↳ AGENT_GUIDE.md: own lines 2519 of budget 1200 → HOUSE_RULES.md (no file yet: cp .kaif/_house-rules-template.md HOUSE_RULES.md) for local rules, routes and tools · the chronicle PROJECT_HISTORY.md · researches/ …
```

The source is a string constant, not a disk check:

```js
const MOVE_OUT_ADDRESS = 'HOUSE_RULES.md (no file yet: cp .kaif/_house-rules-template.md HOUSE_RULES.md) for local rules, routes and tools · the chronicle PROJECT_HISTORY.md · researches/';
```

(`.kaif/kaif-core.mjs:140`; the `STATUS.md` row of `DOC_BUDGETS`, line 142, carries the same parenthesis.)

## Repro (deterministic)

1. On any 2.8 deployment: `cp .kaif/_house-rules-template.md HOUSE_RULES.md`, add one line to it.
2. Keep `AGENT_GUIDE.md` above its budget (or `STATUS.md` above 200).
3. `node .kaif/kaif-core.mjs check --gate-budgets` → the `↳` line still says "no file yet: cp …".

## Cost and violated invariant

owner-work-safety and honest-green. The line is printed at the stop of every closing on every project above
budget — exactly the moment a session looks for what to do next — and it reads as an instruction with a
ready command. A weak session that obeys it replaces the project's filled house-rules file (the owner's
standing rules, the stand registry, the environment dossier) with the empty skeleton; `git` would catch it
only if the file was committed first.

## What in KAIF led to this

The move-out address is a single constant shared by the warning, the gate and the update task forecast; the
"no file yet" branch was written for the forecast of a first update (where the file indeed does not exist)
and never made conditional on `okOnDisk('HOUSE_RULES.md')`.

## Local remediation (per the "defect in KAIF itself" contour, if applied)

A warning in the project's canon next to the gate's description (`AGENT_GUIDE.md` → "Document taxonomy",
tier 1): the printed `cp` is a constant of the 2.8 core and must not be run on this project. Not
mutation-proved (it is prose; the core is vendored and not patched locally). Proposed fix upstream: print
the parenthesis only when `!okOnDisk('HOUSE_RULES.md')`, in all three places that use the address.
