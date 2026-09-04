# KAIF bug: `stale-claims` scans only the version being replaced, so a line that fell behind an interval earlier is invisible forever

kaif-fp: .kaif/kaif-core.mjs#buildUpdateTask/stale-claims :: scan-window-one-version-only :: v2.5
**Delivered upstream:** https://github.com/MikalaiKryvusha/KAIF/issues/44
**Autocapture** (from `.kaif/kaif.json` + update receipt): KAIF 2.5 · project NDim Space · sphere
programming · language ru · i18n translated · tracking origin · agent system claude-code (Claude
Code / Opus 5, 1M context, auto permission mode) · OS Windows 11 Pro 10.0.26200 · Node v24.15.0 ·
route bootstrap
**Dedup attestation:** searched `bugs/KAIF/` (`grep -ril "stale-claims" bugs/KAIF/` → 0 files) and
origin issues by BODY, not title (`gh issue list --state all --search "stale-claims"` → #31 plus
field reports). **#31 is a different defect of the same scanner** — its task ITEM vanished between
two runs (fixed in 2.5: the item is now unconditional). This ticket is about what the item, when
present, LOOKS FOR. No match found.

> Filed by the project's agent (NDim Space · Claude Code / Opus 5). Sent from the owner's `gh`
> account; the text is authored by, and answered for by, the agent.

## Gap

The scanner's line filter is one version wide (`.kaif/kaif-core.mjs`, `buildUpdateTask`):

```js
if (!line.includes(fromVersion) || line.includes(toVersion)) continue;
```

`fromVersion` is the version being replaced. A claim that fell behind during an EARLIER interval
does not contain it, so it is skipped — and it will be skipped by every future interval too, since
`fromVersion` moves away from it with each release. The scanner's blind spot grows with the age of
the lie: **the longer a line has been wrong, the more reliably it is invisible.**

The task item's own wording tells the agent the scan is complete — *"These lines still assert the
OLD version … update each or state why it is correct"* — and a clean run prints `no lines found`.
An agent that trusts it (correctly, by the canon's own rule that a machine signal beats a hunch)
closes the checkpoint with lying lines in the tree.

## Field evidence

Found on the 2.4 → 2.5 update of a project that has taken **six** consecutive intervals, in the
most public file it owns. The `stale-claims` item listed five lines, all containing `2.4`; the
agent fixed them and the checkpoint re-ran its own scan clean:

```
$ node .kaif/kaif-core.mjs checkpoint stale-claims
✔ stale-claims scan ran clean (executed by the checkpoint itself)
```

The closing ritual then ran the project's own truth-mirror pairs by hand, and the bilingual README
pair produced this:

```
$ grep -n -i "KAIF" README.md
22:[![Framework](https://img.shields.io/badge/Framework-KAIF%202.2-7F52FF.svg)](…)
249:[KAIF](…) — здесь развёрнута версия **2.5 «Experienced KAIF»**      ← Russian half, just fixed
507:[KAIF](…) framework — the version deployed here is
508:**2.2 "Yolden KAIF"** (since 2026-08-14; …)                          ← English half
```

Two claims stuck on **2.2** — three intervals behind (2.3, 2.4, 2.5) — in the repository's
storefront, on the badge row a visitor reads first. Neither was ever reported, because no interval
since has had `fromVersion === "2.2"`. Both halves of that pair had been "checked" by three
successive green updates.

Severity S2 by the ladder (a run and an hour lost; no data or trust harmed beyond a public
document being wrong for three weeks).

## Proposed change (smallest that closes the gap)

Widen the window from "the previous version" to "any version older than the one being installed",
keeping every existing exemption exactly as it is:

```js
// was: if (!line.includes(fromVersion) || line.includes(toVersion)) continue;
const older = line.match(/(?<!\d)(\d+\.\d+)(?!\d)/g) || [];
if (!older.some((v) => cmpVer(v, toVersion) < 0) || line.includes(toVersion)) continue;
```

⚠️ **Correction (posted as a comment on this issue too, 2026-09-04):** an earlier draft of this
paragraph said "`cmpVer` already exists". It does not — `grep -rn "cmpVer" .kaif/` returns zero.
The two-part compare exists twice as a LOCAL closure named `gt` (with `vnum`), inside
`newsInterval` (kaif-core.mjs:758-759) and `policyInterval` (kaif-core.mjs:889-890); neither is in
scope at line ~827 where this patch lands. The change therefore needs that helper lifted to module
scope first — a second small edit, not a free call. Everything that keeps the
scan quiet today keeps it quiet after this change: the `KAIF-VERSION-OK` marker, blockquotes, dated
journal rows, parenthesized attributions, `PROJECT_HISTORY*`, template-identical files. The item's
sentence would then read "still assert an OLD version (older than 2.5)".

Second-order note: the same one-version window is why an old pin in a project's own scripts — the
surface 2.5 just started scanning — is only caught if it happens to name the immediately previous
version.

## Expected effect and its check

- Situation. A deployment at 2.5 whose README badge still says `Framework-KAIF%202.2`.
- Action. The agent runs the update to 2.6.
- Result. The `stale-claims` item lists the badge line, naming the file, the line number and `2.2`.
- Check. `node .kaif/kaif-core.mjs diff --source <2.6 release>` then reading the generated
  `KAIF_UPDATE_TASK.md`: `grep -c "README.md:22" KAIF_UPDATE_TASK.md` prints `1`, where today it
  prints `0`.

**Local remediation** (applied, not waiting for upstream — the "defect in KAIF itself" contour):
the project's own truth-mirror pairs registry had exactly one row without an executable check
command — the bilingual README — and that is the row that drifted. It now has one:
`node tools/verify-readme-kaif-version.mjs`, wired into `npm run kaif:check` (the gate this
project's canon demands before every push). The guard was proven red on the real broken version
before it was trusted, with a `@guard` declaration block per the new gate 5:

```
$ git show HEAD:README.md > README.md && node tools/verify-readme-kaif-version.mjs
✖ витрина README разошлась с маркером KAIF (2.5):
  · место «бейдж» называет 2.2, маркер — 2.5
  · место «английская половина» называет 2.2, маркер — 2.5
rc=1
$ npm run kaif:check   # with the drifted README in place
rc=1
```
