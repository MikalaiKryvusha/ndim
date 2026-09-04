# Field report: NDim Space — KAIF 2.4 → 2.5 update

**Project:** NDim Space · **Route:** bootstrap (thin KAIF.md → KAIF-LOADER.mjs → release channel)
· **Deployment:** i18n: translated (wholesale-Russian owner docs and most skill bodies), lang ru,
tracking origin, 5 agent systems · **OS:** Windows 11 Pro 10.0.26200 · **Node:** v24.15.0
· **Date:** 2026-09-04 (started ≈ 17:05 +03:00) · **Author:** the project's agent (Claude Code —
Fable 5.1 for the update pass, Opus 5 for the closing ceremonies), answering for this text.
· **Sixth consecutive interval on this deployment** (1.6 → 2.0 → 2.1 → 2.2 → 2.3 → 2.4 → 2.5).
· **Delivered to origin:** issue #43 (this report) · issue #42 (`bugs/KAIF/05`) · a +1 comment
closing `bugs/KAIF/01` on issue #24.

## 1. Chronology with numbers (every number is a command's output)

1. **Release fetched.** `gh release download v2.5 --repo MikalaiKryvusha/KAIF`: six assets;
   `kaif-manifest.json` version 2.5, codename "Experienced KAIF", released 2026-09-04.
2. **Prediction pass 1 — module diff by the OLD (2.4) core.**
   `node .kaif/kaif-core.mjs diff --source <rel25>`:
   `diff vs 2.5: 26 file(s) carry upstream static-module changes; 48 — nothing to do`.
3. **Template-delta extraction (the local method, EXP-0211).** Both bundles unpacked by a
   line-based extractor: **167** template files in v2.4, **171** in v2.5;
   `git diff --no-index tpl24 tpl25` → **33 files changed, 1237 insertions(+), 89 deletions(-)** —
   the REAL per-file deltas, so every module was folded into the Russian canon as a true delta and
   no translated file was rewritten wholesale.
4. **Prediction pass 2 — sandbox copy.** `git archive HEAD | tar -x` into a scratch dir, the real
   bootstrap run there: `12 replaced, 0 modules merged in-place, 4 added, 73 kept`; task
   `10 items, 13 diverged files, 15 files with module diffs`; footprint against a pristine export:
   **32 paths**, all framework wrapper plus the installer's own transient files.
5. **Rehearsal recorded (2.5's new binding).** The bootstrap route cannot take `--rehearsal`
   (rake R1), so the NEW core was run from the sandbox copy INSIDE the live tree:
   `node <copy>/.kaif/kaif-core.mjs diff --source <rel25>` →
   `⟳ rehearsal recorded: 16 wholesale verdict(s) → .kaif/update-rehearsal.json`.
6. **Live run.** `node KAIF-LOADER.mjs --lang ru`: machinery 2.5 sha256-verified; pre-update backup
   `85 file(s) → .kaif/backup-2.4-2.5/`; `⟳ rehearsal verdicts loaded from
   .kaif/update-rehearsal.json (16 file(s))`; counters **identical to the sandbox**:
   `12 replaced, 0 modules merged in-place, 4 added, 73 kept`. Diff of the two run logs (minus the
   `= kept existing` lines): **one line**, the rehearsal-loaded line the sandbox could not print.
   **Zero `verdict-mismatch` items** — every live verdict equalled its rehearsal.
   Fourth consecutive interval where the rehearsal predicted the battle line for line.
7. **Manual merge — 29 modules into 15 translated files**, applied by an exact-string patcher that
   refuses a FIND matching zero or two-plus times (28 patches, 0 failures across five batches):
   AGENT_GUIDE.md (6: prayer cadence, `FORK` in the checklist artifact list, the nine documents'
   line budgets, the recon doc's second trigger, the fable-loop FORK/DELIVERY obligation, the
   authorization-gate carve-out) · PHILOSOPHY.md (the fourth door) · BUG_FIXING_FRAMEWORK.md
   (severity ladder S1/S2/S3, "name the threat") · TESTING_FRAMEWORK.md (gate 5's second half with
   the `@guard` block, the lint composition line) · REQUIREMENTS_FRAMEWORK.md (the scenario form,
   checklist line, Gherkin boundary, the lint composition line) · autoloop / dayloop / nightloop /
   end-chat-force / end-chat-soft (the `DELIVERY:` line) · interview (step 3a, scenario-first) ·
   propose-idea · what-next (rank by the denominator) · kaif-update (rehearsal binding plus a field
   note for R1) · report-bug (5: severity sizing, the machinery delivery step, both templates'
   `Delivered upstream:` line, the severity header line, the scenario-form option).
8. **Stale claims.** README bumped to 2.5 "Experienced KAIF"; four historical lines got
   `KAIF-VERSION-OK` markers (two team documents, one QA verdict, one tool comment). The
   checkpoint re-ran the scan itself: `✔ stale-claims scan ran clean`.
9. **Gates.** `sync`: `re-synced 175 system skill copies`; `check`: `✅ manifest satisfied:
   89 files + 152 agent artifacts present`, no drifted mirrors; `node tools/03-kaif-verify.mjs`:
   all 37 skills valid, no placeholders, no secrets tracked; `node tools/stamp-creed.mjs --check`:
   19 documents, 0 changed; `npm run kaif:check`: green.
   New optional modules self-tested: `kaif-guard-lint selftest` → `8 cases, every rule red on its
   fixture`; `kaif-scenario-lint selftest` → `33 cases, 7 rules × 2 languages`. On the tree,
   `kaif-guard-lint check` exits 3 (SKIPPED — no `@guard` markers declared yet), while
   `kaif-scenario-lint check` exits **0**: `✅ scenario-lint OK — 369 file(s), 1 scenario(s),
   0 findings` — the one scenario is the acceptance criterion of `bugs/KAIF/05`, written in the
   new four-line form the same day it arrived. (An earlier draft of this report claimed 3 for both;
   the judge caught it — the tool is MORE exercised than claimed, not less.)
10. **Nothing owner-authored lost.** Cyrillic census over all 89 manifest paths, before → after:
    **1 094 347 → 1 102 753**; files with FEWER Cyrillic characters: **0**.
11. **Checkpoints.** 7 of 10 recorded mechanically (merge-modules, merge-diverged,
    owner-conventions, language-arrivals, review-news, stale-claims, recheck — the last two
    executed their own gates). policy-changes / judge / field-report close as described in §5.

## 2. Rakes — each with severity, verbatim evidence, cost, repro

**R1 — the rehearsal binding cannot be used on the route the canon recommends (S2; cost ≈ 15 min
plus one workaround the next session would have to rediscover). Ticket: `bugs/KAIF/05`.**
2.5's headline update symmetry is *"hand the sandbox copy's receipt to the live run as
`update --rehearsal <copy>/.kaif/last-update.json`"*. The same skill recommends the BOOTSTRAP
route for i18n-translated deployments. The two do not compose:

```
$ node .kaif/kaif-core.mjs install --bundle .kaif/install/KAIF-CORE-BUNDLE.md --lang ru --rehearsal .kaif/last-update.json
✖ unknown flag for install: --rehearsal
✖ refusing to run install with input it does not understand … Known flags: --bundle --lang --mode --agents --baseline --force.
```

Second face of the same non-composition: on the bootstrap route the auto record is never
CONSUMED — `consumeRehearsal()` is called only from `cmdUpdate` (kaif-core.mjs:1690), while the
bootstrap classify only calls `loadRehearsal` (kaif-core.mjs:2314). After a completed live update
the file the code calls "one-shot" was still on disk (17:13:34) next to the marker the update had
just rewritten (17:14:59). **Working route, found here:** run the NEW core's `diff --source` from
the sandbox copy inside the live tree; the bootstrap then picks `.kaif/update-rehearsal.json` up by
itself (`rehearsal verdicts loaded … (16 file(s))`). Repro: any bootstrap update on 2.5 or later.

**R2 — the rehearsal and the receipt count different candidate sets (S3, no separate ticket; folded
into `bugs/KAIF/05`).** `diff --source` recorded **16** verdicts, the update's receipt carries
**15**: the preview includes `MASTER_PLAN.md`, `classifyAndApply` does not. Nothing fired, because
the extra file is never compared — but the canon promises the two lists "compare line by line", and
a future symmetry check between them would red on a healthy tree.

**R3 — the module that two intervals could not transfer went through on the first attempt (S3,
informational, no ticket — a FIX confirmed).** The 2.3 and 2.4 intervals each lost the
`/report-bug` delivery module to this agent system's safety classifier (`bugs/KAIF/01`, EXP-0210).
2.5 moved delivery into a machinery command so the prose says only "run it" — and both that module
and the new `AGENT_GUIDE` authorization carve-out transferred with no refusal. The origin's fix is
confirmed effective on Claude Code auto mode. `+1 observation` appended to `bugs/KAIF/01` and to
origin issue #24.

**R6 — `stale-claims` scans only the version being replaced, so an older lie is invisible forever
(S2; found by the CLOSING ritual, after this report's first draft. Ticket: `bugs/KAIF/06` → issue
#44).** The item listed five lines containing `2.4`, they were fixed, and the checkpoint re-ran its
own scan clean. The project's truth-mirror pairs registry, run by hand at closing, then found two
more: the README badge (`Framework-KAIF%202.2`) and the whole English half (`**2.2 "Yolden KAIF"**
(since 2026-08-14`) — three intervals behind, in the repository's storefront. The filter is one
version wide (`if (!line.includes(fromVersion) || line.includes(toVersion)) continue;`), so a claim
that fell behind earlier can never match again. **The longer a line has been wrong, the more
reliably it is invisible.** Local remediation applied and proven: the bilingual-README row of our
pairs registry was the only row with no executable check; it now has
`node tools/verify-readme-kaif-version.mjs`, carrying a `@guard` declaration block, proven red on
the real pre-fix README from `HEAD` (rc=1, naming both drifted spots) and wired into
`npm run kaif:check` — the gate this project requires before every push, which now also exits 1 on
that drift. This also retires the "`@guard` blocks unexercised" line of §3 the same day it arrived.

**R5 — two canon documents are only partly translated, and the update widened the English part
(S3, pre-existing debt, no ticket).** `TESTING_FRAMEWORK.md` and `REQUIREMENTS_FRAMEWORK.md` are
the two "translated" files whose bodies are in fact mixed: at HEAD before this update, lines
containing Cyrillic were **285 of 435** (65 %) and **70 of 165** (42 %). The sections that received
2.5's new text — testing gate 5, the requirements writing checklist — were already English there,
so their 25 and 61 new lines were stitched in English to match their neighbours. Worth stating
precisely, because the judge read this differently: the machinery did NOT write those lines. On an
`i18n: translated` deployment mechanical replacement is off for every candidate, and the sandbox
proves it — `diff -q base/TESTING_FRAMEWORK.md sandbox/TESTING_FRAMEWORK.md` and the same for
`REQUIREMENTS_FRAMEWORK.md` report no difference after a full machinery run. The `merged` verdict
means "a by-signature merge would be possible", not "applied". The debt is real and older than this
interval: two of nine re-read-core documents are half-English on a project whose working language is
Russian. Named in `STATUS.md` as a debt; not made a question, because `CLAUDE.md` already answers
which language wins — only the scheduling is open.

**R4 — the judge pass died on a model rate limit mid-verdict (S3, environmental, not KAIF).**
`You've reached your Fable limit` (HTTP 429) killed the first adversarial pass; it was relaunched
on another model. Named here only because a KAIF update's judge step is one long agent turn, and
this class will meet other field agents.

## 3. What was exercised vs NOT

**Exercised:** bootstrap route on a translated deployment (6th interval) · `diff --source` preview
by the OLD core · template-delta extraction from two release bundles · full sandbox rehearsal with
counter-by-counter match · the 2.5 rehearsal BINDING (recorded, loaded, 0 mismatches) · per-module
manual merge of 29 modules into 15 translated files · `language-arrivals` (2 new English files
listed by name — team-adopt.md, team-ci-template.md) · unconditional `stale-claims` including the
project's own scripts · `KAIF-VERSION-OK` markers · both new optional tool modules (selftest and
check) · the new `report` machinery command (`--dry-run` and a live delivery) · mirror re-sync
(175 copies) · `check` with the new line-budget and language-mix warnings.

**NOT exercised:** `--channel main` · anonymous mode · fork tracking · `--rehearsal` on the
`update` route (unreachable here — R1) · `project-name --name-file` · `verdict-mismatch` (no
mismatch occurred) · the unpaired-anchor red of `check` (this tree has no unpaired block) · the
`@guard` blocks — see R6: unexercised when this section was first written, exercised by the end of
the same day (`kaif-guard-lint check` went from `SKIPPED … exit 3` to `✅ 1 declared block(s)`,
exit 0, the block being the new README guard) ·
`/team-deployment` adopt path and `team-ci-template.md` (queued to the owner, §5) ·
`update-verify` at the time of writing (§5). Both new forms ended the day exercised, neither by
plan: the SCENARIO form because `bugs/KAIF/05` needed an acceptance criterion
(`kaif-scenario-lint check` → `1 scenario(s), 0 findings`), the `@guard` block because the closing
ritual found a defect that needed a guard (R6; `kaif-guard-lint check` → `1 declared block(s)`).

## 4. Wishes for the next version (by cost, descending)

1. **Make the rehearsal binding reachable from the bootstrap route** (R1) — one flag in
   `install`'s whitelist plus `consumeRehearsal()` on that path; otherwise the version's headline
   symmetry is unusable on exactly the deployments (translated, heavy localization) the skill sends
   to that route.
2. **Let `diff --source` and `update` share one candidate set** (R2), so the rehearsal file and the
   receipt's `verdicts` are comparable by count as the canon says.
3. **A line-budget warning could name the move-out target it already knows.** `check` says "move
   content OUT (chronicle, researches/, a house-rules file)"; for `STATUS.md` it already names
   `PROJECT_HISTORY.md` and the bonsai-trim step. The other eight documents would benefit from the
   same one-word pointer — the warning is where the agent is standing when it decides.
4. **Positive signal worth keeping:** the sandbox-rehearsal method predicted the live pass exactly
   for the fourth consecutive interval on this deployment, and 2.5's mechanical binding of it
   turned "the agent compared two logs" into "the machinery refuses to diverge". For a translated
   deployment this is the single highest-value change of the version.

## 5. Final state and the judge verdict

`.kaif/kaif.json`: **KAIF 2.5**, released 2026-09-04, tracking origin, i18n translated, history of
6 intervals ending `2.4 → 2.5, route bootstrap, 2026-09-04`. Manifest green (89 + 152), 37 skills
valid, mirrors in sync; the working tree carries only the update plus this report, the owner's
interview and two KAIF tickets.

**policy-changes stays OPEN by design.** The task's own text says these are the OWNER'S decisions
and must never be merged silently. All eight rule changes are stitched into the canon and put in
front of the owner as **interview №075**, raised as a review page — four questions: accept the
eight rules · name the ONE delivery metric · the team board in or out of git · allowlist the
`report` command. The `DELIVERY:` metric line in `MASTER_PLAN.md` therefore carries an explicit
"awaiting the owner's word" placeholder, with the agent's proposal marked AS the agent's proposal.

Judge verdict, quoted verbatim:

> **VERDICT: VERIFIED WITH CAVEATS**
>
> ## Confirmed / not confirmed
>
> **Confirmed (9):**
> 1. Version marker, release date, history entry and all four counters + 15 verdicts — exact.
> 2. Sandbox rehearsal predicted the live run to a single line (173 identical `kept` lines each side).
> 3. All 28 anchors present; template deltas match the tree diff near 1:1 across 25 files; six modules
>    read side by side and faithful, field statistics carried verbatim.
> 4. Zero Cyrillic loss in any file; +8 406 overall; `src/`, `sync-server/`, `ideas/`, `researches/`,
>    `homeworks/` clean; whole `git status` inside the permitted set.
> 5. All four gates green with the exact expected strings (89 files + 152 artifacts, 37 skills,
>    19 creed docs).
> 6. Both new linters' selftests are real mutation suites and pass; `guard-lint check` = 3 (SKIPPED).
> 7. All five stale version claims resolved; README now 2.5 «Experienced KAIF».
> 8. Policy changes withheld for the owner: interview №075 with four unanswered questions, no
>    `policy-changes` checkpoint, the other seven recorded.
> 9. No mirror drift (gate verified to be functional, then silent); no false `[TESTED]`, no weakened
>    test, no unpaired anchor, machinery byte-pristine.
>
> **Not confirmed (3):**
> 1. **Claim 3 is false.** `.kaif/update-rehearsal.json` still exists (mtime 17:13, before the 17:14:59
>    update). `consumeRehearsal()` is unreachable from the bootstrap route this update took. The agent
>    documented this against itself in `bugs/KAIF/05` and delivered it upstream as issue #42 (verified
>    OPEN). Not fraud — a mis-stated claim over correctly-reported work. Impact: negligible
>    (git-ignored; refused next interval on the `from`/`to` mismatch).
> 2. **Half of claim 7 is false.** `kaif-scenario-lint.mjs check` exits **0**, not 3 — one scenario is
>    declared (in `bugs/KAIF/05`) and passes. The tool is more exercised than claimed, not less.
> 3. **Claim 4's "15 translated files" is inaccurate for two.** `TESTING_FRAMEWORK.md` (+0 Cyrillic)
>    and `REQUIREMENTS_FRAMEWORK.md` (+0) received their 25 and 61 lines as **verbatim English**, by
>    the machinery's automatic by-signature merge (`outcome: "merged"`), not by hand and not
>    translated. ~86 English lines now sit in two Russian canon documents — a language-hygiene debt to
>    put in front of the owner, not a correctness defect.
>
> **Could not verify:** the four mirror trees (`.agents/`, `.grok/`, `.cline/`, `.roo/` — ~80 of the
> 127 changed paths) are outside the Cyrillic census. The drift gate covers them and is silent, so I
> have no positive reason to doubt them, but the census does not prove them.
>
> ---
>
> ## Verdict
>
> **VERIFIED WITH CAVEATS.** The 2.4 → 2.5 update is genuine: the version is stamped, the merges are
> real and faithful in substance, nothing the owner wrote was lost, all four gates are green, the new
> tooling is honestly self-tested, the policy questions are correctly parked for the owner, and the
> machinery on disk is the pristine release artifact.
>
> Two of the eleven claims as relayed are factually wrong, and one is imprecise. The most serious of
> them — the un-consumed rehearsal record — is a defect the agent found, wrote up against itself with
> reproducible evidence, and shipped to the framework's origin *in the same session*. That is the
> behaviour this gate exists to reward, not to punish. The claim is what failed, not the work.
>
> **Two items to put in front of the owner:**
> 1. `TESTING_FRAMEWORK.md` and `REQUIREMENTS_FRAMEWORK.md` now carry ~86 lines of untranslated
>    English inside Russian canon (machinery-merged). Translate, or accept consciously.
> 2. `.kaif/update-rehearsal.json` is a harmless leftover on disk; upstream issue #42 already asks for
>    the fix. No local action needed.

## 6. Signals to origin

1. `bugs/KAIF/05` — R1 plus R2 (improvement request, template B), delivered by the new machinery
   command `node .kaif/kaif-core.mjs report`.
2. `bugs/KAIF/01` **+1 observation: closed by 2.5** — the machinery-delivery fix works on Claude
   Code auto mode, where two consecutive prose rewrites had failed. Comment delivered to origin
   issue #24.
3. `bugs/KAIF/06` — R6 (bug, template A shape), delivered by the same machinery command as
   issue #44. Filed during the closing ritual, hours after this report's first draft; the ritual's
   pairs-registry pass is what found it.
4. This report.
