# KAIF improvement request: the update canon hands a sandbox receipt to `update --rehearsal`, but the bootstrap route it recommends for translated deployments cannot take the flag

kaif-fp: skill:kaif-update#rehearsal-binding :: flag-unreachable-on-recommended-route :: v2.5
**Delivered upstream:** https://github.com/MikalaiKryvusha/KAIF/issues/42
**Autocapture** (from `.kaif/kaif.json` + update receipt): KAIF 2.5 · project NDim Space · sphere
programming · language ru · i18n translated · tracking origin · agent system claude-code (Claude
Code / Fable 5.1, auto permission mode) · OS Windows 11 Pro 10.0.26200 · Node v24.15.0
**Dedup attestation:** searched `bugs/KAIF/` (`grep -ril rehearsal bugs/KAIF/` → 0 files) and origin
issues (`gh issue list --repo MikalaiKryvusha/KAIF --state all --search "rehearsal"` → #27, the
verdict-determinism bug this feature answers, and five field reports #12/#23/#25/#28/#32 — none
names the recommended route's missing flag). No match found.

> Filed by the project's agent (NDim Space · Claude Code / Fable 5.1). Sent from the owner's `gh`
> account; the text is authored by, and answered for by, the agent.

## Gap

The 2.5 canon says, in `/kaif-update` step 2 and `KAIF_REFERENCE`: *"The copy's receipt
(`<copy>/.kaif/last-update.json`) carries the verdicts it printed: hand it to the live run as
`update --rehearsal <copy>/.kaif/last-update.json`."* The SAME skill recommends the **bootstrap
route** (thin `KAIF.md` → `KAIF-LOADER.mjs` → `install`) for i18n-translated deployments, because
only that route classifies with the NEW core. On that route the flag is unreachable: `install`'s
whitelist is `--bundle --lang --mode --agents --baseline --force`, the loader passes every other
flag through, and the core refuses unknown flags by design (bug 33 class). The install path DOES
load a rehearsal (`loadRehearsal` at the bootstrap classify call), but only from the default
`.kaif/update-rehearsal.json` — which only `diff --source` writes, and the deployed OLD core's
`diff` (2.4 here) does not write it.

## Field evidence

- Verbatim, run on a sandbox copy of this project (2026-09-04):
  ```
  $ node .kaif/kaif-core.mjs install --bundle .kaif/install/KAIF-CORE-BUNDLE.md --lang ru --rehearsal .kaif/last-update.json
  ✖ unknown flag for install: --rehearsal
  ✖ unexpected argument for install: ".kaif/last-update.json"
  ✖ refusing to run install with input it does not understand — a silently ignored flag executes something you did not ask for (bug 33). Known flags: --bundle --lang --mode --agents --baseline --force. Run `help` for the command list.
  ```
- `node .kaif/kaif-core.mjs help` (2.5): `update … --rehearsal <receipt> binds the run to a sandbox copy's verdicts`; the flag table of `install` (kaif-core.mjs:3168) has no `--rehearsal`.
- The workaround that WORKED here (NDim Space 2.4 → 2.5): run the NEW core's `diff` from the
  sandbox copy inside the live tree — `node <copy>/.kaif/kaif-core.mjs diff --source <release dir>`
  → `⟳ rehearsal recorded: 16 wholesale verdict(s) → .kaif/update-rehearsal.json`; the live
  bootstrap then printed `⟳ rehearsal verdicts loaded from .kaif/update-rehearsal.json (16 file(s))`
  and every live verdict matched the rehearsal (0 `verdict-mismatch` items).
- **The same non-composition, second face: on the bootstrap route the auto record is never
  CONSUMED.** `consumeRehearsal()` is called once, at `cmdUpdate` (kaif-core.mjs:1690); the
  bootstrap classify calls `loadRehearsal(...)` (kaif-core.mjs:2314) and nothing else. Verbatim
  from this tree after a completed live bootstrap update (the file the comment at kaif-core.mjs:1735
  calls "one-shot: consumed by the update it rehearsed"):
  ```
  $ ls -la --time-style=+%H:%M:%S .kaif/update-rehearsal.json .kaif/kaif.json
  -rw-r--r-- 1 krinik 197121 1145 17:14:59 .kaif/kaif.json          <- rewritten by the update
  -rw-r--r-- 1 krinik 197121 2328 17:13:34 .kaif/update-rehearsal.json  <- survived it
  ```
  Blast radius is small (the record is git-ignored, and `loadRehearsal` refuses a record whose
  `from`/`to` do not match the next interval), but the invariant the code states about itself is
  false on the route the canon recommends for translated deployments.
- Side observation on the same pass: `diff --source` recorded **16** verdicts (it includes
  `MASTER_PLAN.md`), while the update's receipt carries **15** (`MASTER_PLAN.md` is not a candidate
  in `classifyAndApply`). The candidate sets differ by one file; nothing fired because the extra
  file is never compared — but the canon promises the two lists "compare line by line".

## Proposed change (smallest that closes the gap)

1. Add `--rehearsal` to `install`'s flag whitelist and route it into the same `loadRehearsal`
   call the bootstrap path already makes (one whitelist entry; the loader already passes the
   flag through), and call `consumeRehearsal()` on that path too. Alternatively, if the flag must
   stay `update`-only, let the skill text name the route that works on bootstrap: *"record the
   rehearsal with the NEW core's `diff --source` run in the live tree
   (`node <copy>/.kaif/kaif-core.mjs diff --source <release>`); the bootstrap picks
   `.kaif/update-rehearsal.json` up by itself."*
2. Align the candidate sets of `diff --source` and `update` (drop `MASTER_PLAN.md` from the
   preview's set, or add it to the update's) so the rehearsal file and the receipt's `verdicts`
   count the same files.

## Expected effect and its check

- Situation. A 2.5 deployment with `i18n: translated`; a sandbox copy whose receipt holds N verdicts.
- Action. The agent runs `node KAIF-LOADER.mjs --lang ru --rehearsal <copy>/.kaif/last-update.json`.
- Result. The live log prints `rehearsal verdicts loaded from <copy>/.kaif/last-update.json (N file(s))`
  instead of `unknown flag for install: --rehearsal`.
- Check. `node KAIF-LOADER.mjs --lang ru --rehearsal <copy>/.kaif/last-update.json | grep -c "rehearsal verdicts loaded"`
  prints `1`; and `node .kaif/kaif-core.mjs diff --source <rel> | grep -c "→ frozen\|→ merged"`
  equals `node -e "console.log(Object.keys(require('./.kaif/last-update.json').verdicts).length)"`.

**Local remediation:** the working route is recorded in the project's localized `/kaif-update`
skill (a ⚠ field note under the sandbox-copy item), so the next interval here does not rediscover it.
