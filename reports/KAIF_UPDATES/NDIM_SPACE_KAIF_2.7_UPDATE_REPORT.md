# Field report: NDim Space — KAIF 2.5 → 2.7 update

**Project:** NDim Space · **Route:** bootstrap (thin KAIF.md → KAIF-LOADER.mjs → release channel), two
versions in one hop (2.6 and 2.7) · **Deployment:** i18n: translated (Russian owner docs and most skill
bodies), lang ru, tracking origin, 5 agent systems · **OS:** Windows 11 Pro 10.0.26200 · **Node:** v24.15.0
· **Date:** 2026-09-18 (started ≈ 17:56 +03:00, the day 2.7 was released) · **Author:** the project's agent
(Claude Code — Opus 5), answering for this text; sent from the owner's account.
· **Seventh consecutive interval on this deployment** (1.6 → 2.0 → 2.1 → 2.2 → 2.3 → 2.4 → 2.5 → 2.7).
· **Delivered to origin:** issue #76 (this report) · issue #75 (`bugs/KAIF/16`, R9).

## 1. Chronology with numbers (every number is a command's output)

1. **Releases fetched.** `gh release download v2.5|v2.6|v2.7`: six assets each; `kaif-manifest.json`
   2.7 "Audited KAIF", released 2026-09-18, core sha256 `db14b918…`.
2. **Template base (local method, EXP-0103/0211).** Bundles unpacked by a line-based extractor:
   **171** templates in v2.5, **177** in v2.6, **182** in v2.7; `git diff --no-index tpl2.5 tpl2.7` →
   **58 files changed, 6390 insertions(+), 264 deletions(-)** (11 added, 47 modified, 0 deleted).
3. **Prediction pass 1 — the OLD (2.5) core.** `node .kaif/kaif-core.mjs diff --source <rel2.7>`:
   `diff vs 2.7: 35 file(s) carry upstream static-module changes; 41 — nothing to do`, 17 wholesale
   verdicts recorded (that record was discarded before the live run — it was the old core's).
4. **Prediction pass 2 — sandbox.** `git archive HEAD | tar -x`, the real bootstrap
   (`node KAIF-LOADER.mjs --lang ru --source <rel2.7>`): `27 replaced, 0 modules merged in-place,
   11 added, 62 kept`; task `10 items, 16 diverged files, 16 files with module diffs`; footprint
   against a pristine export: **46 paths**, all framework wrapper plus installer transients.
5. **Live run, bound to the sandbox.** `node KAIF-LOADER.mjs --lang ru --rehearsal <sandbox>/.kaif/last-update.json`
   (release channel): machinery sha256-verified; backup `89 file(s) → .kaif/backup-2.5-2.7/`;
   `⟳ rehearsal verdicts loaded … (15 file(s))`; counters **identical to the sandbox**. `diff` of the two
   run logs: **two lines** — the installer source (the sandbox read the downloaded `rel2.7` folder, the
   live run read `releases/latest/download`; same sha256) and the rehearsal-loaded line. The 2.7 recipe
   hands ONE downloaded folder to both runs (`--source <dir>`); the live run did not, hence the first
   line. Zero `verdict-mismatch`. The two tasks differ by one stale-claims line from a git-ignored file
   the sandbox could not contain. **Fifth consecutive interval where the rehearsal predicted every
   counter and every file verdict of the battle — and the first where the binding was used on the
   bootstrap route itself** (our 2.5 wish, issue #42, closed by 2.6).
6. **Manual merge — 48 modules into 16 translated files**, in Russian: AGENT_GUIDE (11: creed comment,
   checklist step, router row, taxonomy, refresh hooks, fable loop — `AUTH:` carve-out in the gate's own
   line, DELIVERY retired, obligations 3–6 —, languages, git, backlog, interviews module, the new
   "leading word" section) · PHILOSOPHY (1) · BUG_FIXING (1) · TESTING (1, whole-file delta) · 12 skills
   (autoloop, dayloop, nightloop, end-chat-force, end-chat-soft, pause, experience, kaif-update, interview,
   report-bug, resume, what-next). Twelve skills were merged by two sub-agents under one written brief;
   the lead agent reviewed their reports and fixed two cross-references they could not know.
7. **Owner conventions.** `EXPERIENCE.md`: `class:` field in the entry format, the lint deadline and the
   starter class list (slugs kept English). `MASTER_PLAN.md`: the owner's vector-metric word kept as a
   vision record, the `DELIVERY:` form marked history.
8. **Hooks.** Fourth hook `prompt-resume-word.mjs` wired in `.claude/settings.json` (one-line command form,
   as in 2.2); the resume rule line added to `CLAUDE.md`, `AGENTS.md`, `.clinerules/kaif.md`,
   `.roo/rules/kaif.md`. PowerShell 5.1 smoke: `resume\n…` → order · `резюм\n…` → order · `plan the day` →
   silence · `дочитай resume.log` → silence.
9. **KAIF tickets.** 2.7's `check` named **13** tickets with no readable delivery state. 11 were delivered
   long ago — their `**Delivered upstream:**` line was missing or translated; issue numbers verified by
   `gh issue view` and stamped (#24, #26, #29, #50, #52, #53, #59, #62, #63, #64, #65). One (`04`) was a
   defect of a PROJECT tool (`tools/02-kaif-fetch.mjs`, absent from the 2.5 and 2.7 bundle templates) and
   was moved to the project's `bugs/`. After: **0** signal warnings.
10. **Stale claims.** README badge and both halves → 2.7 «Audited KAIF» (`node tools/verify-readme-kaif-version.mjs`
    → `все 3 места называют 2.7`); 18 lines marked `KAIF-VERSION-OK` with a reason (17 in tracked
    files, 1 in the git-ignored team board); the checkpoint
    re-scan: `✔ stale-claims scan ran clean`.
11. **Gates.** `sync`: `re-synced 179 system skill copies`; `check`: `✅ manifest satisfied: 100 files +
    152 agent artifacts present`; `node tools/03-kaif-verify.mjs` OK; `node tools/stamp-creed.mjs --check`
    19 documents, 0 changed; `npm run kaif:check` exit 0; `npm run questions` exit 0; `npm run guards`
    `✅ ВОРОТА ЧИСТЫ: стражей 22, все зелёные` exit 0.
12. **New optional modules** — all self-tests green: voice-lint 48 cases, experience-lint 69, attribution-lint
    26, ranking-lint 19, testrun-lint 49, contour generator 75 checks. On the tree: experience-lint
    `SKIPPED` exit 3 (no entry carries `class:` yet); voice-lint `check` `SKIPPED` exit 3 (§8 of the
    portrait is prose); attribution-lint `137 NEW finding(s) in 678 file(s)` — not adopted (see §2 R5);
    ranking-lint exit 0 on a `/what-next` draft in the merged form.
13. **Nothing owner-authored lost.** Cyrillic census over the 179 changed files, pristine HEAD → tree:
    **1 100 316 → 1 241 656**. Files with fewer Cyrillic: autoloop / dayloop / nightloop × 5 copies (−111…−119
    each — exactly the removed `DELIVERY:` lines, `git diff` read) and the machine receipt
    `.kaif/last-update.json`.

## 2. Rakes — each with severity, verbatim evidence, cost, repro

**R1 — the shipped run-report linter cannot read a project that wrote the same seven fields first (S3;
cost ≈ 10 min).** `node .kaif/tools/kaif-testrun-lint.mjs check qa` →
`✖ testrun-lint: 16 finding(s) in 14 report(s) under qa/reports/`; every finding is vocabulary:
`missing field(s): Работа, Контур, Прогоны, Проверки…` — the project's canon (which issue #59 came from)
names the fields «Прогонов», «Проверок» and writes them as bold labels. The linter is not adopted here;
the project's own guard (`tools/verify-test-reports.mjs`) stays the judge. Wish: a per-project keyword row
in `.kaif/kaif.json` (the engine already keys by role).

**R2 — the voice linter is `SKIPPED` on a portrait that is a byte-mirror of a private core (S3,
informational).** `⚠ voice-lint SKIPPED — §8 of AUTHOR_STYLOMETRY.md carries no pattern table`. The
portrait's §8 is prose and itself says its heuristics are not fit for a gate; the file here is a mirror,
so the table can only be added in the source core. The canon line now says SKIPPED aloud and puts the
weight on the clean-instance §7B pass.

**R3 — stale-claims flags two shapes that are not claims (S3; cost ≈ 10 min).** (a) `KAIF и NDim Space
2.0` — the product's own version sits within 16 characters of the word KAIF (3 lines). (b) An arrival
attribution `(KAIF 2.6, issue #52 …)` whose parenthesis is WRAPPED across two prose lines is not stripped,
because the strip runs per line (`scan.replace(/(?<!\])\([^)]*\)/g, '')`) — 4 lines written during this
very merge were flagged. Both marked `KAIF-VERSION-OK`. Wish: join a prose paragraph before the paren
strip.

**R4 — the delivery-state parser does not read a blockquote header (S3).** Eight Russian tickets carried
their delivery as `> **Сигнал в исток:** <issue URL>` inside the header blockquote; the 2.7 parser
(`^\*\*Delivered upstream:\*\*`) needs the English field at a line start outside `>`. Correctly named by
`check` — the fix was a separate line. Wish: accept `> **Delivered upstream:**` too, since project headers
are often blockquotes.

**R5 — a new counter with no baseline on a large tree (S3, deliberate non-adoption).** attribution-lint
reports 137 findings on 678 files. The project runs a one-month owner rule "people first; guards only on
an incident or the owner's word", so the baseline was not written; the number is recorded here.

**R6 — a standing falsehood in this project's own environment dossier, found by the 2.7 hook smoke
(S2 for us, positive for KAIF).** The dossier said PowerShell 5.1 "does not deliver a string to a native
exe's stdin". Measured: `'{"a":1}' | node -e "…readFileSync(0)…"` → `bytes=12 head=ef bb bf 7b`, and
`JSON.parse` throws on the BOM. 2.7's BOM strip in the hooks made the README PowerShell smoke pass; the
dossier line was corrected by the new sixth obligation the same hour.

**R7 — `sync` now mirrors project-local skills (informational).** `re-synced 179` (2.5: 175): the local
`/video-studio` skill appeared in `.agents/`, `.grok/`, `.cline/`, `.roo/` as four new untracked paths;
`npm run guards` refused a green until they were staged. Not announced in the task; harmless.

**R8 — the retired DELIVERY line vs a project rule built on it (S3, handled locally).** The project's
one-month owner rule (interview №092, В5) printed its metric inside `DELIVERY:`. 2.7 retires the line; the
metric was kept as the first line of the farewell report, signed `[AI]` as the agent's operationalization,
and put to the owner in interview №093 together with the policy batch.

**R9 — a CURRENT-state line that carries a date is invisible to stale-claims (S2; the deployment record
said the wrong version for four intervals).** `KAIF_FRAMEWORK.md` (the shipped "KAIF deployed here"
record) held `| **Версия KAIF** | \`2.1\` «Strong KAIF» (релиз от 2026-07-31) |` from 2.2 through 2.5 — the
file's own header says "keep the version line current". The scanner skips it by design:
`if (/\b\d{4}-\d{2}/.test(line)) continue;  // a dated record = journal/chronicle/decision row`. A
current-state row that names its release date is not a journal row. Found by reading, fixed by hand.
Wish: treat the version row of `KAIF_FRAMEWORK.md` (and the marker-mirror rows the machinery knows) as a
pair with `.kaif/kaif.json` → `version`, checked like the README badge — not by the prose scanner.

**R10 — the budget door stops the next soft close on a project whose owner froze document work for a
month (S2; found by the judge, not by the agent).** The merged `/end-chat-soft` runs `node .kaif/kaif-core.mjs
check --gate-budgets` as a stop; on this tree it is red on four core documents (own lines / budget):
AGENT_GUIDE 2706 / 1200 (this update added ≈300), STATUS 415 / 200, MASTER_PLAN 704 / 300, TESTING
555 / 300. The cure the rule names — move content out — is document work, which the project owner's
one-month rule allows only on an incident or his word. The agent had listed the budget change to the
owner among "mechanisms you will not see" — a claim wider than its observation: he sees it at the first
close. Put to the owner as interview №094 the same evening; his answer (19:41, his own option): «*как
KAIF регламентирует, так и делай*» — "do as KAIF regulates". The door stays a stop; moving the overflow
is planned as the project's `plans/101` before the next soft close. Wish: an update task should flag, per interval, which
NEW doors are already red on the tree it just updated — that is where the owner needs to decide.

**Tickets.** By the severity ladder (`BUG_FIXING_FRAMEWORK` → S1/S2/S3) the one S2 defect OF THE FRAMEWORK
gets its own ticket, delivered in the same move as filed: R9 → `bugs/KAIF/16` → issue #75 (R6 is S2 for this project's
own dossier, not a framework defect). R1, R3, R4, R7 are S3 —
wishes in §4 of this report, no separate tickets. R10 is a sequencing effect of two correct rules on
one tree, reported here.

## 3. What was exercised vs NOT

**Exercised:** two-version hop on the bootstrap route · `install --rehearsal` binding from a sandbox
receipt (15 verdicts, 0 mismatch) · template base from three release bundles · 48-module manual merge ·
the renamed-heading path (`code-revision` Step 0 replaced, no duplicate) · `check` axes: own-lines budgets,
resume coverage, undelivered signals (13 → 0) · the fourth hook in PowerShell · all six new module
self-tests · experience-lint and voice-lint `check` (both honest SKIPPED) · ranking-lint on a real draft ·
stale-claims with pre-2.5 versions (named `asserts 2.2`, `asserts 1.4`) · `KAIF-VERSION-OK` markers.

**NOT exercised:** the shipped contour generator on a live owner page (the project keeps its own page
until the owner's word, interview №093 В2) — so `--check`, `--mark-implemented`, `--close`, the window
profile and the recovered answer are unexercised here · `check --gate-budgets` as a door · `--shrink` of
the experience lint · the team constitution comparison (no `TEAM_CONSTITUTION.md` in the root) ·
`update` route · anonymous mode · fork tracking.

## 4. Wishes for the next version (by cost, descending)

1. **A per-project keyword row for kaif-testrun-lint** (R1) — the same pattern the scenario form already
   uses; a project that originated a rule should not fail the shipped copy of it on vocabulary.
2. **Stale-claims: strip parentheses per paragraph, not per line** (R3b), and skip a version preceded by a
   product name that is not KAIF (R3a).
3. **Read `**Delivered upstream:**` inside a header blockquote** (R4).
4. **Announce in the task when `sync` starts mirroring local skills** (R7).
5. **Positive signal worth keeping:** the rehearsal binding on the bootstrap route worked on the first try
   and matched the battle exactly; the undelivered-signal axis found 13 real gaps in one run; the
   standing-falsehood obligation paid for itself within the update that shipped it.

## 5. Final state and the judge verdict

`.kaif/kaif.json`: **KAIF 2.7**, released 2026-09-18, tracking origin, i18n translated. Manifest green
(100 + 152), mirrors in sync, all project guards green. The sixteen rule changes were stitched into the
canon first and then put before the owner as interview №093; **he answered on the page at 2026-09-18
19:24 +03:00: В1 = А (accept all sixteen, as he accepted the eight rules of 2.5), В2 = Б (switch to the
shipped contour now, this week — against the agent's recommendation to wait for the end of the
project's one-month "people first" rule).** `policy-changes` was recorded on that word. The switch is
planned as the project's `plans/100`; the reconnaissance already run: the shipped `--check` recognises
the project's Cyrillic question headings `### В<n>.` (4 of 4 and 2 of 2 on two live documents).

The judge's findings were fixed before the commit: the two-line log difference (§1 item 5, and the same
wording in `KAIF_FRAMEWORK.md` and `STATUS.md`); a false measurement the merge itself wrote (a paragraph
said a word was absent from the tree while containing it); lines made stale by the owner's answer; a
testing-canon line wider than its guard (the boundary is now said aloud); a guard reason string. The
judge's budget-door finding became a question to the owner (see R10 below).

Judge verdict, quoted verbatim (independent sub-agent with a clean context, `/fable-judge`, 2026-09-18
≈19:19–19:37):

> VERDICT: VERIFIED WITH CAVEATS
>
> # /fable-judge — KAIF 2.5 → 2.7 update of NDim Space (working tree, uncommitted), 2026-09-18
>
> Judge: independent read-and-run pass. Nothing in the project was edited. My own outputs live in
> `scratchpad/judge/`. One run used a throwaway index copy (`GIT_INDEX_FILE` pointing into the scratchpad,
> `update-index --info-only`, so no objects were written). The real index was never touched.
>
> **The tree kept changing while I judged, and this is stated up front.** After CLAIMS.md was written
> (19:18), these arrived: `KAIF_FRAMEWORK.md` (19:20), `STATUS.md` (19:21), the field report
> `reports/KAIF_UPDATES/NDIM_SPACE_KAIF_2.7_UPDATE_REPORT.md` (19:20, now staged), the **owner's answers to
> interview №093** (19:24:59, В1 = А, В2 = Б, by «Николай Кривуша», through the page, with decision JSONs
> under `interviews/decisions/`), the checkpoint `KAIF-UPDATE: policy-changes done`, and
> `plans/100_switch_to_shipped_review_page.md` (untracked). I judged the claims as of the moment they were
> written, and I re-measured the current tree wherever the difference matters.
>
> ## Claims table
>
> | # | Claim | What I observed (command → result) | Status |
> |---|---|---|---|
> | 1 | kaif.json = 2.7 / 2026-09-18, history gains 2.5→2.7 bootstrap | `git diff HEAD -- .kaif/kaif.json` shows exactly those three changes, plus the history entry dated `2026-09-18T17:59:57+03:00` | CONFIRMED |
> | 2 | core sha256 = manifest pin | `sha256sum .kaif/kaif-core.mjs` → `db14b918…ad989e`, which equals `rel2.7/kaif-manifest.json`. I also downloaded the manifest myself with `gh release download v2.7 -p kaif-manifest.json`; it is byte-identical to the local copy (sha `446633e1…`) | CONFIRMED |
> | 3 | Sandbox predicted the live run; logs differ by ONE line; 0 verdict-mismatch | Both logs print `27 replaced, 0 modules merged in-place, 11 added, 62 kept` ✔. The only occurrence of `verdict-mismatch` in the live task is inside embedded skill prose (line 1918), not a task item ✔. The two tasks differ by one stale-claims line from the git-ignored team board ✔. **But `diff sandbox-run.log live-run.log` shows TWO differences, not one:** `1c1`, the installer source (local `rel2.7` dir vs `https://github.com/.../releases/latest/download`), and `10a11`, the rehearsal line | SUBSTANCE CONFIRMED · WORDING NOT CONFIRMED |
> | 4 | 48 modules folded into 16 files, faithful, local edits kept, no duplicates | I checked about 35 of the 48 modules against `mods/*.diff.md`. The fully checked ones are all 1-module files (BUG_FIXING, PHILOSOPHY, autoloop, dayloop, experience, kaif-update, pause), nightloop 2/2, what-next 3/3, end-chat-soft 4/4, end-chat-force 6/6, resume 4/4, report-bug 2/2 and TESTING. I also checked interview 3a/3b/3c/3d/1/3/5 and AGENT_GUIDE header, checklist, router, taxonomy, refresh, fable loop (obligations 3–6 and the AUTH carve-out in its own line), languages, git, backlog, the interviews module, and the new leading-word section. Everything is faithful in meaning. Local NDim edits are kept, and several were improved: the stale «ниже» was corrected to «выше» for the KAIF-defect contour, and «шаг 4» became «шаг 3 «Заведи И доставь»». "Already present" holds for pause (it already used «эстафета») and for the creed note (the Russian creed already says «стараемся»). Cross-references resolve: «СМУЩЕНИЕ АГЕНТА», «Первое слово владельца — приказ», «шестое обязательство», «Авторство решения», TESTING rule 10 «232». No duplicated headings were introduced; the only duplicate, TESTING `### Правило` ×2, was already there in HEAD | CONFIRMED (sampled) |
> | 5 | DELIVERY gone as an order everywhere; month metric in both closings and what-next; `[AI]` signed | `grep -rn DELIVERY` across skills (all five mirrors), the canon, STATUS and MASTER_PLAN finds only retirement notes and history, and MASTER_PLAN marks its two DELIVERY paragraphs as «история». AGENT_GUIDE:112 carries `[AI] Исполнение: …`. The ranking lint over the RU drafts gives: anchored form exit 0; pure-RU header `no-table` exit 1 (so the note in the what-next skill is true); mutated row-1 `recency-first` exit 1 | CONFIRMED |
> | 6 | Nothing owner-authored lost; only loops ×5 and last-update.json lose Cyrillic; src/ etc. untouched | I ran an independent census against `git show HEAD:` blobs, not the pristine dir: 182 files (the tree has grown since the claim), 1 106 261 → 1 255 778. The files that lose Cyrillic are exactly the 15 loop copies (−111/−119, which are the removed DELIVERY lines, confirmed by reading the diff) and `.kaif/last-update.json`. `git status -- src sync-server ideas researches homeworks` is empty. In interviews/ there is only 093, plus the owner's decision JSONs that arrived after the claim | CONFIRMED (exact 1 100 316 → 1 241 656 not re-measurable: tree changed) |
> | 7 | Gates | `kaif-core check` exit 0, `manifest satisfied: 100 files + 152 agent artifacts`, no KAIF-signal line ✔. `03-kaif-verify` OK ✔. `stamp-creed --check` gives «вписано 0 · обновлено 0 · всего документов 19» ✔. `verify-resume-covers-core` green ✔. `npm run kaif:check` exit 0 ✔. `npm run questions` exit 0 ✔. `npm run guards`: the claim's green was measured at 18:17, before 093 and the report existed. Re-measured now, with 093 and the report staged: «стражи чисты (22/22)», exit 1 only because of the three post-answer untracked files (decision JSONs, plans/100) | CONFIRMED (re-stage + re-run before commit) |
> | 8 | PowerShell dossier falsehood corrected (BOM) | `'{"a":1}' \| node -e …readFileSync(0)…` in PowerShell 5.1 gives `bytes=12 head=ef bb bf 7b` and `JSON.parse` throws. AGENT_GUIDE:323 is corrected in place with a 🔄 note. No other copy of the old claim exists (`git grep` over plans/53, EXPERIENCE and bugs finds nothing). All four hooks strip `^﻿` | CONFIRMED |
> | 9 | 11 tickets stamped with matching issues; 04 moved | `gh issue view` titles match: #24 (2.3 field report, body R1 = classifier) · #26 brownfield · #29 CI · #50 · #52 · #53 · #59 · #62 · #63 · #64 · #65 ✔. On 04: `git log --diff-filter=A` puts `tools/02-kaif-fetch.mjs` in the project's own deploy commit `9c57d3c`; no release bundle (2.5/2.6/2.7) mentions it; #25 itself calls a sibling defect «local tool, not KAIF» ✔. The move is recorded in the file with its reasoning, and plans/49 and reports/TEAM point to the new address | CONFIRMED |
> | 10 | 4th hook wired; smoke; rule lines in 4 entry files | `.claude/settings.json` has the one-line form beside the other three ✔. My PowerShell smoke gives: `resume\n…`, `резюм\n…`, `/resume`, `Резюмируй. …` and `  RESUME please` → order (891 chars); `plan the day` and `дочитай resume.log` → silence; exit 0 in every case ✔. CLAUDE.md, AGENTS.md, `.clinerules/kaif.md` and `.roo/rules/kaif.md` carry the line ✔ | CONFIRMED |
> | 11 | EXP-0314 moved out of the format example; class convention; lint SKIPPED/selftest | In HEAD, EXP-0314 sat inside the fenced format example (read at `git show HEAD:EXPERIENCE.md`). It now opens «## Записи», verbatim. The class list is identical to the tpl2.7 list. `kaif-experience-lint check` → SKIPPED exit 3 (328 entries). `selftest` → 69 cases OK | CONFIRMED |
> | 12 | README 2.7; markers; re-scan clean | `verify-readme-kaif-version` → «все 3 места называют 2.7». Every marker diff is marker-only; no tool behaviour changed. The re-scan is known only from its checkpoint record | CONFIRMED (re-scan not re-executed by me) |
> | 13 | Owner decisions put as №093 with archaeology; policy-changes not recorded | Both attestations re-run: `→ 2 hits` and `→ 9 hits` in 8 files, matching the `read:` lists. The prior answers were found and named (№075 В1; plans/27). Scenario form present. At claim time the checkpoint was not recorded. **It has since been superseded legitimately:** the owner answered at 19:24 and `policy-changes done` now stands | CONFIRMED (superseded by the owner's answer) |
> | 14 | No duplicated sections from the 2.7 renames | Headings of end-chat-soft (one «Шаг 1»), end-chat-force (one «Шаг 1»), code-revision (one Step 0) and interview (one «Шаг 3а») have no duplicates | CONFIRMED |
>
> ## Not confirmed / findings
>
> 1. **Claim 3 wording (and its copies).** The logs differ by 2 lines, not 1. The extra difference is the
>    installer source: the live run read GitHub while the sandbox read the local `rel2.7` folder. The bytes
>    are the same, since the sha256 matches the upstream manifest. The 2.7 `/kaif-update` recipe the agent
>    merged today says to hand ONE downloaded dir to both runs as `--source <dir>`, "and their logs differ by
>    the rehearsal line alone"; the live run did not do that. The same too-wide statement stands in three
>    places. **Correct it before it goes upstream:** the field report §1 item 5 ("`diff` of the two run
>    logs: **one line**", "predicted the battle line for line"), `KAIF_FRAMEWORK.md` («бой совпал с
>    песочницей строка в строку») and STATUS («бой = песочница»).
> 2. **A standing falsehood born in this merge.** `AGENT_GUIDE.md:660–661` says «слова «батон» в дереве нет
>    (замер 2026-09-18, `git grep -i батон` — пусто)». The same paragraph contains «батон» (lines 648 and
>    660), so the named command now returns hits. Fix: «вне этого абзаца слова нет».
> 3. **Stale lines left by the owner's 19:24 answer** (the next step, not fraud, but they must not be
>    committed as they stand):
>    - STATUS «Ждёт владельца … До ответа на В1 чекпоинт `policy-changes` открыт».
>    - interview №093 header «**Статус:** 🟡 ждёт владельца» (the /interview stale-status rule).
>    - field report §5 «`policy-changes` stays OPEN by design».
> 4. **Canon claim wider than its guard (TESTING_FRAMEWORK).** The merged run-report card now requires the
>    exact command per run, two lines `Гигиена:`/`Функциональный прогон:` and a verdict word
>    pass/fail/blocked/partial. The text still says «каждое линтуется (`node tools/verify-test-reports.mjs`)».
>    That guard checks only that the 7 labels exist and are not empty (read in `missingFields`/`emptyFields`).
>    0 of 13 existing reports carry the two lines, and the shipped `kaif-testrun-lint` is deliberately not
>    connected. So the new half of the rule is prose-only here, which is the "lesson without a mechanism"
>    class. Either extend the guard or say the boundary aloud in that line.
> 5. **An impact not put to the owner (budget door).** The merged `/end-chat-soft` Step 1 makes
>    `node .kaif/kaif-core.mjs check --gate-budgets` a hard stop («ритуал закрытия ЗДЕСЬ ОСТАНАВЛИВАЕТСЯ»).
>    On this tree it is red on 4 documents today (exit 1): AGENT_GUIDE 2706/1200 (this update added about
>    300 lines), STATUS 415/200, MASTER_PLAN 704/300, TESTING 555/300. The next soft close will therefore
>    stop there. Moving that much canon collides with the month rule, point 2 («документы … только по
>    инциденту или по его прямому слову»). Interview №093 listed the budget change among «механизмы,
>    которые Вы не увидите». The owner will in fact see it, because the next soft close stops at that door.
>    The fork needs his word, or a signed `[AI]` plan, before the next `/end-chat-soft`.
> 6. Minor: interview №093 row 1 says the hook is «проверена: четыре случая из четырёх». What was
>    observed is the script fed through a PowerShell pipe; the hook firing inside a live Claude Code
>    session was not observed. The first chat opened with «resume» is the functional check. Also a minor
>    nit: `tools/verify-sync-server-name.mjs:46` 'архивный слепок канона до KAIF 2.2' got a
>    `KAIF-VERSION-OK: история` marker, but the line describes the CURRENT `.kaif/backup-*`, which is now
>    `backup-2.5-2.7`.
>
> No weakened checks were found. No test files were touched, and there is no scope creep outside the
> framework, marker lines and pointer updates. No false `[TESTED]` markers were added in project files
> (the only `[TESTED]` in the diff is vendored upstream text). No agent decision is worn as the owner's word
> in added lines: `kaif-attribution-lint check` over 18 changed files gives 12 findings, 11 of them
> pre-existing lines; the one new line, TESTING:197, cites the origin's decision №116 exactly as the
> template does, and the lint misses it only because it does not read «№». No DELIVERY order remains
> anywhere, and no owner text was lost.
>
> ## Could not verify
>
> - Every one of the 48 modules line by line. About 35 were sampled, AGENT_GUIDE most heavily. The rest,
>   such as some interview Step 5 bullets, were read only for presence.
> - The sandbox run itself. I compared logs and tasks and did not re-run it. I also did not re-run the
>   stale-claims checkpoint re-scan; only its record was read.
> - The exact census figure at claim time, because the tree changed afterwards. The current-tree census
>   supports the claim's conclusion.
> - The hook inside a real Claude Code UserPromptSubmit event.
>
> ## Items for the owner / the agent (smallest fixes)
>
> 1. Reword the "one line / строка в строку" claim in the field report, `KAIF_FRAMEWORK.md` and STATUS:
>    two lines differ, the installer source and the rehearsal line.
> 2. Fix AGENT_GUIDE:660–661 (the «батон» measurement).
> 3. Carry the owner's В1 = А / В2 = Б into STATUS, the №093 header status and field report §5. Then stage
>    the decision JSONs and `plans/100` and re-run `npm run guards` before committing.
> 4. Decide the budget door before the next `/end-chat-soft`: either a move plan or an owner/`[AI]`-signed
>    exception for the month. It is red on 4 core docs now.
> 5. TESTING_FRAMEWORK run-report card: extend `tools/verify-test-reports.mjs` to the two lines and the
>    verdict word, or say in the canon line that this part is not linted.
> 6. The field-report task asks for a separate `bugs/KAIF` ticket for each explicit framework defect. None
>    exist yet for R1, R3, R4 and R9. Under 2.7, filing = delivering (`node .kaif/kaif-core.mjs report …`).

## 6. Signals to origin

1. `bugs/KAIF/16` — R9, delivered as issue #75 by `node .kaif/kaif-core.mjs report` in the same move as filed.
2. This report.
