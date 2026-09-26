# Field report: NDim Space — KAIF 2.7 → 2.8 update

**Delivered upstream:** https://github.com/MikalaiKryvusha/KAIF/issues/121

**Project:** NDim Space · **Route:** bootstrap (thin KAIF.md → KAIF-LOADER.mjs), sandbox rehearsal bound by
`--rehearsal`, ONE downloaded release folder handed to both runs as `--source` · **Deployment:** i18n: translated
(Russian owner docs and most skill bodies), lang ru, tracking origin, 5 agent systems · **OS:** Windows 11 Pro
10.0.26200 · **Node:** v24.15.0 · **Date:** 2026-09-26 (started 13:33 +03:00, the release day of 2.8) ·
**Author:** the project's agent (Claude Code — Opus 5.5, 1M context), answering for this text; sent from the
owner's account. · **Eighth consecutive interval on this deployment** (1.6 → 2.0 → 2.1 → 2.2 → 2.3 → 2.4 → 2.5 →
2.7 → 2.8). · **Signals filed with this update:** issue #113 (`bugs/KAIF/18`, R1) · issue #114 (`bugs/KAIF/19`, R2).

## 1. Chronology with numbers (every number is a command's output)

1. **Release fetched.** `gh release download v2.8` and `v2.7` into two folders, six assets each;
   `kaif-manifest.json` 2.8 "Noble KAIF", released 2026-09-26, core sha256 `d424900c…`.
2. **Sandbox.** `git -c core.autocrlf=false archive HEAD | tar -x`, `git init`, `core.longpaths true`, the real
   bootstrap `node KAIF-LOADER.mjs --lang ru --source <rel2.8>`: exit 0, `26 replaced, 0 modules merged in-place,
   3 added, 74 kept`; task `12 items, 17 diverged files, 17 files with module diffs`; footprint 33 paths, all
   framework wrapper. Cyrillic census of the sandbox diff: losses only in the machine receipt and in
   `.kaif/_testcases-template.md` (the template's own two-line change).
3. **Live run, bound to the sandbox.** `node KAIF-LOADER.mjs --lang ru --source <rel2.8> --rehearsal
   <sandbox>/.kaif/last-update.json`: `⟳ rehearsal verdicts loaded … (16 file(s))`; counters identical.
   `diff sandbox-run.log live-run.log` → **exactly one line** (the rehearsal line). The two tasks differ by one
   file count in the attribution forecast (736 vs 737 files — the live tree has one git-ignored file more).
   **Sixth consecutive interval where the rehearsal predicted the battle, and the first with a one-line log
   difference** — the 2.7 judge's recipe fix (one folder for both runs) works.
4. **Manual merge — 49 modules into 17 translated files**, in Russian: AGENT_GUIDE (23, by the lead agent) ·
   BUG_FIXING (1) · TESTING (1, whole-file delta) · 14 skills (autoloop, dayloop, nightloop, end-chat-force,
   end-chat-soft, refresh-context, resume, what-next, fix-vision, interview, kaif-remove, kaif-update, release,
   report-bug). Skills and TESTING were merged by three sub-agents under one written brief; the lead agent
   reconciled two cross-references they could not know (the Russian name of the house-rules section; the
   stand registry that had moved).
5. **The canon got lighter.** `wc -l AGENT_GUIDE.md`: 2722 → 2522. TESTING_FRAMEWORK own lines (the core's
   `ownLines`): 584 → **299 of budget 300** — seven English template modules were put back byte-identical to
   2.8 and the project's local rules moved into neighbouring `###` subsections, so future updates merge them
   mechanically. `check`: "entry cost: /resume reads 9 re-read core document(s) + HOUSE_RULES.md ~ 223k tokens —
   22 % of a 1M-token model window".
6. **House-rules move.** `HOUSE_RULES.md` created from the skeleton, in Russian (the owner reads it); moved
   VERBATIM by an anchor-based script (never line numbers): the environment-dossier callout and table (16
   lines), the stand command registry (90 lines), the stand states/doors/emulators block (34 lines), the tools
   table (14 lines); pointer lines left in the guide. The 2.0 architecture diagram, present in neither map, was
   moved into `PROJECT_ARCHITECTURE_INTERNAL_MAP.md` first. Cyrillic: guide −50 630 characters, house rules
   +52 257. One project test read a tools-table row from the guide (`tools/grammar-passport.test.mjs`) and was
   pointed at the new file: 2/0.
7. **Voice portrait: core 1.2 → 2.2 (replaced).** The local preamble (14 lines) kept; the release file appended
   byte for byte; `checkpoint owner-voice-core` → "equals the release snapshot byte for byte (sha f922c8043d52)";
   the project's creed tool stamped its block after that. `kaif-voice-lint check` now runs "21 stop rule(s)"
   instead of `SKIPPED` — the project's canon line saying SKIPPED became false and was corrected in the same
   move. The project's truth↔mirror pair command for the portrait was rewritten to cut by the preamble marker
   and mutation-proved (a changed line → exit 1, original → exit 0).
8. **Hooks.** Fifth hook `pretool-owner-word.mjs` wired in `.claude/settings.json` (one-line command form, as
   for the other four). Smoke through `cmd /c "node … < file"`: unanswered mid-turn owner message → exit 2
   quoting the Cyrillic text; answered → 0; a subagent's call → 0.
9. **Owner decisions.** `policy-changes` listed six rules. The field-report rule was NOT put to the owner:
   his standing word of 2026-09-18 (origin issue #78) already covers it. The other five went to him as one
   question (interview №105); he answered on the page under three minutes after it was raised (lock `startedAt`
   13:58:51, answer 14:01:36 +03:00): A, with the comment quoted in R2.
10. **Stale claims.** 17 lines flagged; README (badge and both halves) and the deployment record moved to 2.8;
    8 code-comment lines and 4 document lines marked `KAIF-VERSION-OK` with a reason (code markers appended at the
    END of the flagged line, before a closing `*/`; a first attempt put them on a comment line above, which split
    an owner's verbatim quote and three sentences — the judge caught it; `node --check` green). `node .kaif/kaif-core.mjs stale-claims` → 0.
11. **Withdrawn phrases** (`DELIVERY:`): every hit is a record of the withdrawal, history, a delivered ticket
    (#46, #53) or an answered interview — nothing removed or withdrawn.
12. **Closing gates.** `kaif-attribution-lint`: baseline written, "138 finding(s) recorded as debt", then "new 0";
    `kaif-experience-lint`: OK, the 277 unclassed old entries fold into one line as 2.8 promised. Budget ratchet:
    see R6. Project gates: `npm run guards` 22/22 · `npm run kaif:check` · `npm run questions` clean ·
    `npm run test:tools` 902/0 · `node tools/stamp-creed.mjs --check` 20 documents.
13. **Sync.** `re-synced 179 system skill copies` (twice, after late skill edits).

## 2. Rakes — each with severity, verbatim evidence, cost, repro

**R1 — the budget gate prints a `cp` that would overwrite a filled `HOUSE_RULES.md` (S2, near-miss; ticket #113).**
With `HOUSE_RULES.md` on disk (241 lines), `check --gate-budgets` printed `→ HOUSE_RULES.md (no file yet: cp
.kaif/_house-rules-template.md HOUSE_RULES.md) for local rules, routes and tools`. Source: the string constant
`MOVE_OUT_ADDRESS` (`.kaif/kaif-core.mjs:140`, and the `STATUS.md` row at :142). The line is printed at the stop
of every closing — the moment a session looks for what to do. Local remediation: a warning in the project canon.

**R2 — `policy-changes` asks the owner about rules the KAIF owner already shipped (S3; improvement #114).** The
item: "these are the OWNER'S decisions, never merge them silently; put each in front of the owner". Third update
in a row the answer was "accept all". The owner's comment on the page, verbatim (2026-09-26 14:01 +03:00):
«*принимаем, и заведи импрувмент в КАИФ - чтобы агенты больше такого не спрашивали у владельца. Что каиф с
обновлением поставляет - то и принимают без вопросов*» ("we accept — and file an improvement so that agents stop
asking the owner this; whatever KAIF ships with an update is accepted without questions"). The same task holds a
contradiction: `policy-changes` puts the field-report rule to the owner, while the `field-report` item says "no
owner's approval is awaited". The project now keeps it as its standing rule (`HOUSE_RULES.md` R1).

**R3 — the shipped queue reads the project's CLOSED statuses as open (S3; sibling of #109).**
`node .kaif/tools/contour/review.mjs --queue --list` on this tree: `⛔ interviews/interview_085_… — ждёт 13 дн. ·
НИ РАЗУ НЕ ПОКАЗАН` and the same for №095, both with status «➡️ перенесено 2026-09-25 в интервью №096»; `! протух в
очереди (29 дн. > 14): interviews/interview_055_…` whose status is «⛔ СНЯТО 2026-08-28 решением №058». The I42 gate
line follows: `🔴 ГЕЙТ (I42): ни разу не показанных — 2`. Here it does not stop a ritual only because `/resume`
step 1b still runs the project's own queue; after the planned switch to the shipped contour it would. The
foreign `queue.json` was handled well: `ℹ очередь у проекта своя … никогда не пишется`.

**R4 — the "replace, never merge" portrait check cannot coexist with a stamping tool it itself names (S3).**
`checkpoint owner-voice-core` compares the tail from the snapshot's first line to the end by sha256, and the item
says "a project tool that stamps its own blocks INTO the portrait runs after this checkpoint". After the stamp,
`portraitSync` (the "already carries this release's snapshot" test) no longer matches, so a re-run of the same
release would issue the replacement item again. Wish: strip declared stamp blocks before hashing, or let a stamp
live in the local part.

**R5 — the portrait fetch command assumes a POSIX `curl` (S3).** The item prints `curl -fsSL <url> -o
AUTHOR_STYLOMETRY.md.release`; in Windows PowerShell 5.1 `curl` is an alias of `Invoke-WebRequest` and `-fsSL`
fails. It worked from Git Bash. Wish: a `node -e` fetch, as the loader already does.

**R6 — the first ratchet gate must be the LAST step of an update, and nothing says so (S3; the agent's own
near-miss).** The agent ran `check --gate-budgets` mid-update ("debt recorded … 2519"), then added three warning
lines to the guide (R1's local remediation). The next closing would have read growth 2519 → 2522 and stopped.
The uncommitted `.kaif/budget-baseline.json` was removed; the judge then found `STATUS.md` at 212 lines (200 at
HEAD — the update's own additions), which the first gate would have recorded as fresh debt; STATUS was trimmed to
199 (closed passages moved verbatim to the chronicle), and the first gate ran as the last canon step:
`{"version": "2.8", "docs": {"AGENT_GUIDE.md": 2522}}`. Wish: the `closing-gates` item should say "run the first
gate of the version after the last canon edit of the update, and bring every core document the update touched
back under its budget first".

**R7 — the attribution baseline stores verbatim lines, which a project content guard may flag (S3,
informational).** `.kaif/attribution-lint.baseline.json` quotes a history line with an old npm script name; the
project's forbidden-term guard went red on it. Fixed by a named exception in that guard.

## 3. What was exercised vs NOT

**Exercised:** bootstrap route with `--rehearsal` and one shared `--source` folder · 49-module manual merge on a
translated deployment · the whole-file TESTING delta re-rendered from the template · the house-rules move ·
`owner-voice-core` replacement and its checkpoint · `kaif-voice-lint check` against the new §8 table · the fifth
hook (script-level smoke) · `stale-claims` command · withdrawn-phrases search · the attribution-lint baseline
(the experience lint needs none here: 0 findings) · the budget ratchet's first gate · `review.mjs --search` and `--call --dry-run` (both work on this
tree: 480 hits; `CALL · main (dry run, no sound): …, это мейн.`) · `report` delivery (twice).

**NOT exercised:** the fifth hook inside a live Claude Code `PreToolUse` event (first real mid-turn message is its
functional check) · the ratchet's second gate (the next closing) · the shipped contour's page, `--wait` and the
partial save (the project still runs its own page; switch planned) · `diff --source --render` oracle · the
explain-page template · `archives` declaration · the `update` route · anonymous mode.

## 4. Wishes for the next version (by cost, descending)

1. **`policy-changes` as an INFORM item** (R2, #114) — fold in, name in the report, never ask.
2. **Condition the `no file yet: cp …` parenthesis on the file's absence** (R1, #113).
3. **Closed-status vocabulary for the shipped queue** (R3, with #109): «перенесено», «снято», and any status the
   project's own guard already reads as closed.
4. **Say "first ratchet gate last"** in the `closing-gates` item (R6).
5. **Portrait hash that tolerates declared stamps** (R4) and a shell-neutral fetch (R5).
6. **Positive signals worth keeping:** the one-folder rehearsal gave a one-line log difference; the `closing-gates`
   forecast named the attribution STOP before any closing met it; `--search` found the owner's three prior answers
   in one command; `ownLines` made the TESTING re-render measurable (584 → 299).

## 5. Final state and the judge verdict

`.kaif/kaif.json`: **KAIF 2.8**, released 2026-09-26, tracking origin, i18n translated. Manifest green (103 files
+ 152 agent artifacts), mirrors in sync, all project guards green. Owner decision recorded: interview №105,
Q1 = A (2026-09-26 14:01 +03:00).

Judge pass 1 (independent sub-agent with a clean context, `/fable-judge`), quoted verbatim:

> VERDICT: REFUTED
>
> **Scope of the refutation.** It is narrow. The bulk of the KAIF 2.7 → 2.8 update reproduces: the versions, the core hash, the sandbox/live parity, the verbatim move into `HOUSE_RULES.md`, the TESTING trim, the portrait replacement, the pair command, the hook, the gates and the tickets. The verdict is still REFUTED under the judge's own definitions, for two reasons:
>
> - One claimed verification fails reproduction today. Claim 11 says `stale-claims` → 0; the tree gives 1 line.
> - The merge wrote standing falsehoods into the tree. The main one is a new line in `BUG_FIXING_FRAMEWORK.md` that contradicts the owner's recorded answer, and the merge itself cites that answer elsewhere. Smaller ones sit in STATUS, EXPERIENCE and the report draft: two baselines are claimed as written and do not exist.
>
> Every fix below is a line-level edit. None of them calls for re-merging a module.
>
> Judged 2026-09-26 ~14:20 +03:00 by a clean-context judge. HEAD = 72ca2998, origin/main = 72ca2998, so nothing was committed or pushed.
>
> Commands that can write files (`--gate-budgets`, `guards`, `test:tools`, `kaif:check`, contour `--queue`) were run in a byte-copy of the tree: `git ls-files --cached --others --exclude-standard` + `.git`, no `.env`, `git status` identical to the live tree. The live `git status` was re-checked at the end and had not changed.
>
> ## Claims table
>
> | # | Claim | Observed (command → result) | Status |
> |---|---|---|---|
> | 1 | `.kaif/kaif.json` = 2.8, released 2026-09-26, history gains 2.7→2.8 | `cat .kaif/kaif.json` → `"version": "2.8"`, `"released": "2026-09-26"`, last history row `2.7→2.8 bootstrap 2026-09-26T13:36:35+03:00`; HEAD's history ends at 2.5→2.7 | VERIFIED |
> | 2 | `kaif-core.mjs` sha256 = manifest pin d424900c… | `sha256sum .kaif/kaif-core.mjs` → `d424900c5f5f…10cd`. The `rel2.8/kaif-manifest.json` pin is the same. The manifest itself was re-downloaded from origin (`gh release download --repo MikalaiKryvusha/KAIF`) and its sha matches the scratch copy (`529b1afe…`) | VERIFIED |
> | 3 | Sandbox predicted live: diff = 1 line; both `26 replaced, 0 merged, 3 added, 74 kept` | `diff sandbox-run.log live-run.log` → only `> ⟳ rehearsal verdicts loaded …`. Both logs carry the counter line. `.kaif/last-update.json` counters = 26/0/3/74 | VERIFIED (log authenticity rests on the receipt matching) |
> | 4 | 49 module diffs folded faithfully in meaning; local rules kept; no duplicate headings | Checked by hand: all 23 AGENT_GUIDE modules (task lines 90–1370 against `git diff HEAD -- AGENT_GUIDE.md`, 41 hunks), BUG_FIXING, TESTING (whole-file delta), and the interview, end-chat-soft, kaif-update, resume, fix-vision, refresh-context, report-bug and what-next skills. A token-coverage script (backticked commands and issue numbers of every `+` line, per file) was also run. Only translated placeholders are missing (`<file…>`→`<файл…>` and similar). Mirrors in `.agents/.cline/.grok` are byte-equal to `.claude`; `.roo` differs by the `name:` line only. Duplicate headings: none new (only the pre-existing `### Правило` in TESTING). A new local line in the BUG_FIXING merge is false (finding 1) | VERIFIED in meaning, one false local line |
> | 5 | HOUSE_RULES got four blocks VERBATIM (16/90/34/14 lines); pointers stay; one paragraph dropped | Script over `git show HEAD:AGENT_GUIDE.md` lines 308–323, 1773–1862, 1864–1897 and 2260–2273: each block is found contiguous and byte-identical in `HOUSE_RULES.md` at lines 198, 60, 151 and 233, with 0 missing lines. Pointer lines are present; «Всегда предпочитай…» was replaced by the template's principle | VERIFIED |
> | 6 | AGENT_GUIDE 2722 → 2522; TESTING own lines 584 → 299; only history removed | `wc -l` gives HEAD 2722 → 2522. TESTING: inserting 2 probe lines into a local section of the copy makes the core print `own lines 301 of budget ~300`, so the current count is exactly 299. Rules, commands and guarded lines were read in the diff: every numbered rule, the ⛔ lists, the ladder boundaries, rule 10's trap and conditions, and gates 6–7 all remain. Removed measurements moved to `qa/suites/analytics.md` «Приём слоя П», `PROJECT_HISTORY.md` and `.kaif/KAIF_REFERENCE.md` §17, and all of those targets exist. Guards 22/22, test:tools 902/0 | VERIFIED (one new pointer is wrong, finding 8) |
> | 7 | Portrait: preamble kept, rest = v2.8 snapshot byte for byte except the creed; `check` now judges with 21 rules | Fetched `raw.githubusercontent.com/…/v2.8/AUTHOR_STYLOMETRY.md`: sha f922c804… = scratch `.release`. Tail after `<!-- /ndim-preamble -->`, minus the creed block, is IDENTICAL (`diff` empty). Preamble 12 → 14 lines (a note was added). `kaif-voice-lint check … --genre document` → `21 stop rule(s)`; with HEAD's portrait → `SKIPPED (exit 3)` | VERIFIED |
> | 8 | Pair command cuts by the preamble marker; mutation-proved | Command as written in AGENT_GUIDE → exit 0. Scratch mutant (a line after the preamble altered) → exit 1. A preamble edit or a creed edit → exit 0 | VERIFIED |
> | 9 | Architecture diagram moved to the internal map BEFORE removal; «Где старый проект» already in the external map | Diagram present verbatim in `PROJECT_ARCHITECTURE_INTERNAL_MAP.md` (+15 lines); `PROJECT_STRUCTURE_EXTERNAL_MAP.md:188 ## Где старый проект` | End state VERIFIED; order UNVERIFIABLE (uncommitted tree) |
> | 10 | Fifth hook wired; smoke 2 / 0 / 0 | `.claude/settings.json` has the one-line `node "$CLAUDE_PROJECT_DIR/.kaif/hooks/pretool-owner-word.mjs"` entry. Own synthetic transcripts: unanswered human `queued_command` → exit 2 with the quote; text answer → 0; prior refusal → 0; non-human origin → 0; `agent_id` → 0; `KAIF_OWNER_WORD_GATE=off` → 0 | VERIFIED (script level only) |
> | 11 | `stale-claims` → 0; README 3 places; markers above lines, syntax intact | `node .kaif/kaif-core.mjs stale-claims` → **1 line**: `STATUS.md:26 … слепок ядра 2.2 … (asserts 2.2)`. README check → `все 3 места называют 2.8`. `node --check` on both tools is OK, but one marker splits an owner's verbatim quote (finding 5) | **REFUTED** (the 0-line part) |
> | 12 | withdrawn-phrases: every hit is history, a delivered ticket or an answered interview | `git grep -F -e "DELIVERY:" -e SYSTEMS_REGISTRY -e "delivery metric"`: hits are withdrawal records, history, `bugs/KAIF/07` (→ #46), `bugs/KAIF/10` (→ #53), interview №075 (answered), and old reports | VERIFIED |
> | 13 | Attribution baseline 138 debt, new 0; experience-lint OK | `kaif-attribution-lint check` → `new 0 · debt 138`. Of the 138 baseline entries, only 1 is absent from HEAD (a HOUSE_RULES line moved verbatim from the guide), so no merge-born finding was laundered into the baseline. `kaif-experience-lint check` → OK, 0 findings | VERIFIED |
> | 14 | Gates green | guards: **22/22 green, exit 1** because the untracked field report is `вне индекса`. kaif:check exit 0. questions `✅ ЧИСТО`. stamp-creed 20 docs. resume-covers-core ✅. grammar-passport 2/0 (and a mutant with a hand number in the moved HOUSE_RULES row → 1 fail, so the retargeted test still guards). test:tools 902/0 | VERIFIED WITH CAVEAT (guards exit 1 until the report is `git add`ed) |
> | 15 | KAIF tickets #113, #114 filed and delivered | `Delivered upstream:` lines carry the URLs; `gh issue view 113/114` → both exist, OPEN, created 2026-09-26 11:00/11:02Z. The #113 defect reproduces: the core prints `HOUSE_RULES.md (no file yet: cp …)` while the file exists | VERIFIED |
> | 16 | №105 answered 14:01 В1 = А; carried into R1 (strict rule + one provenance line, no invented exception), kaif-update skill, STATUS, interview status, checkpoint | `decision.json`: `choice А`, text «принимаем, и заведи импрувмент в КАИФ … Что каиф с обновлением поставляет - то и принимают без вопросов», at 11:01:36Z. All five destinations are present; checkpoint `policy-changes done`; #114 filed. R1 clause 2 is not in his words (finding 6) | VERIFIED WITH CAVEAT |
> | 17 | Nothing owner-authored lost; src/, sync-server/, ideas/, researches/, homeworks/ untouched | `git status` on those paths → clean. Every removed AGENT_GUIDE line checked (459 non-blank): 147 are in HOUSE_RULES, 9 in the internal map, 5 in the guide; the rest are rewraps, template history, or local history with its verbatim still at the source (e.g. «вот это не мой язык» → interview_016 + decisions/29; the RPG case → EXP, `bugs/KAIF/08`, KAIF_REFERENCE §17; GOAL paragraph → GOAL.md:16). EXPERIENCE.md was changed too: +EXP-0337, not in the claim list | VERIFIED (EXP-0337 is false, finding 4) |
>
> ## Not confirmed / findings
>
> 1. **Standing falsehood written by the merge. The owner's decision is shown as not yet taken.**
>    - `BUG_FIXING_FRAMEWORK.md:130` (new, local) says: «поставляемый генератор `.kaif/tools/contour/` ждёт слова владельца».
>    - The owner already decided. Interview №093, В2 = Б «*Перейти сейчас, на этой неделе*», was answered 2026-09-18 19:24. `plans/100` records it and is «🔲 не начат». The merge's own `AGENT_GUIDE.md:2178` says «переход на поставляемый владелец выбрал … (№093, В2 = Б)».
>    - The same stale phrase stands in lines the merge touched and left: `.claude/skills/interview/SKILL.md:202, :246, :274` and `.claude/skills/resume/SKILL.md:100`, repeated in the four mirrors and in `.roo/commands`.
>    - Cost: the new «Долг перед владельцем — первым» rule is meant to surface an 8-day-old unapplied owner decision. This line frames that decision as "waiting for the owner", which hides it from the new rule.
>    - Smallest fix: in all these places write «переход выбран владельцем (интервью №093, В2 = Б, 2026-09-18) и ждёт исполнения `plans/100`; до него …». List `plans/100` as owner debt.
>
> 2. **Claim 11 fails reproduction.**
>    - `node .kaif/kaif-core.mjs stale-claims` flags `STATUS.md:26` («слепок ядра 2.2» is the voice core, not KAIF).
>    - Smallest fix: put `<!-- KAIF-VERSION-OK: ядро голоса 2.2, не версия KAIF -->` on that line, or write «ядро голоса 2.2».
>
> 3. **Standing falsehood: STATUS says the experience-lint baseline was written.**
>    - `STATUS.md:26–27` says «базы линтов атрибуции и опыта записаны». There is no `.kaif/experience-lint.baseline.json` anywhere, and it is not ignored. Only `attribution-lint.baseline.json` exists.
>    - The report draft (`reports/KAIF_UPDATES/NDIM_SPACE_KAIF_2.8_UPDATE_REPORT.md:121`, "attribution and experience lint baselines") says the same.
>    - Smallest fix: drop «и опыта», or actually run `kaif-experience-lint check --write-baseline` and stage the file.
>
> 4. **Standing falsehood: the budget-ratchet baseline is claimed as recorded but does not exist.**
>    - The claim appears in `EXPERIENCE.md:108` (EXP-0337 «Результат: ✅ … записал первую дверь версии последним шагом обновления») and in report R6 (`:109` "the first gate re-run as the final step"). `ls .kaif/budget-baseline.json` → no such file.
>    - The first gate will also record `STATUS.md` at 212 own lines. At HEAD it was exactly 200; the update added 12. So the update's own growth would enter the ratchet as "inherited debt".
>    - Smallest fix, in two steps:
>      - Before committing, trim STATUS back to ≤ 200 by moving the 11:22 relay block verbatim to `PROJECT_HISTORY.md`.
>      - Then, as the real last step, run `node .kaif/kaif-core.mjs check --gate-budgets` and stage `.kaif/budget-baseline.json`. Or reword EXP-0337 and R6 to the future tense until that is done.
>
> 5. **Owner's verbatim quote split by a machine marker.**
>    - `tools/lib/review-core.mjs:61` puts `// KAIF-VERSION-OK: …` between «…старую ОСТАВИЛИ!!!!» and «баг нахуцй! …» inside the owner's quoted words.
>    - `review-core.mjs:103`, `tools/review.mjs:816` and `:1259` split sentences in the same way.
>    - Syntax is intact (`node --check` OK). The claim "markers above lines" is true, but it damages owner text.
>    - Smallest fix: append the marker to the end of the flagged line itself (stale-claims accepts "on the line").
>
> 6. **Agent clause sitting under the owner's provenance line.**
>    - Clause 2 of `HOUSE_RULES.md` R1 (lines 33–34) reads «В отчёте об обновлении и в прощании назови принятые правила … — владелец узнаёт о них оттуда».
>    - It is not in his answer, which is quoted on line 37, yet line 37 carries `[OWNER] … интервью №105`. The `/kaif-update` note repeats it as part of R1.
>    - Smallest fix: sign clause 2 `[AI]` (the agent's derivation from the task's "never merge silently"), or drop it.
>
> 7. **Pre-existing falsehood re-authored into a new HOUSE_RULES row.**
>    - `HOUSE_RULES.md:51` says `.private/` was «удалил с рабочего диска; предупреждение `kaif:check` о её отсутствии ожидаемо».
>    - `.private/` exists on disk (one entry, `storage-1x-backup`, dir mtime 2026-08-15). `kaif:check` warns only `нет .private/ndim-1.x-history.bundle`.
>    - Smallest fix: rewrite the row to the measured state: the folder exists locally, is outside git, and the bundle is absent.
>
> 8. **Cross-references to sections that are not where the text says.**
>    - `TESTING_FRAMEWORK.md:438` (new "Ворота 6–7 на этом проекте") points the three-question ladder to `AGENT_GUIDE.md` → «ВЫКАТ В БОЙ». That section (1579–1698) never mentions it; the ladder is `#### 🔴 ЛЕСТНИЦА ТРЁХ ВОПРОСОВ К ЗЕЛЁНОМУ ПРОГОНУ` at `AGENT_GUIDE.md:1751` under «Испытательный стенд».
>    - `AGENT_GUIDE.md:670` (the new mid-turn rule) points `PARKED:` to `STATUS.md` → «где продолжить». This project's STATUS has no such section; it is organized by ЭСТАФЕТА blocks.
>    - Smallest fix: name the ladder heading in TESTING. For `PARKED:`, write «в самом верху `STATUS.md`, над первой ЭСТАФЕТОЙ» (or add the section).
>
> 9. **Stale number in an owner-facing document.**
>    - `interviews/interview_105_kaif28_rules.md:24` says «руководство стало на 203 строки короче». The final tree is 2722 → 2522, which is 200. Three warning lines were added after that text was written (EXP-0337).
>    - Smallest fix: append a dated correction note: «поправка: 200 строк после трёх строк предупреждения `bugs/KAIF/18`».
>
> ## Could not verify
>
> - **Order in claim 9** ("moved BEFORE removed"). The uncommitted tree shows only the end state.
> - **Log authenticity in claim 3.** The logs are consistent with the machine receipt, but no independent re-run was made.
> - **The fifth hook inside a live Claude Code `PreToolUse` event.** Only the script-level smoke was run; the field report says so too.
> - **The owner's chat order «*выполни обновление KAIF до 2.8*»** (STATUS, interview №105). The chat is not available to this judge.
> - **Owner-in-chat hunts.** "Hands asked in the chat only", "owner's word mid-turn ignored" and "parked and dropped" are not observable without the session transcript.
> - **The shipped `.kaif/tools/*` byte identity** was taken from `kaif-core check` (`manifest satisfied: 103 files + 152 agent artifacts`). No per-file re-hash against the bundle was done.
>
> ## Items for the agent
>
> - Fix findings 1–9 (all line-level). Then re-run `node .kaif/kaif-core.mjs stale-claims`, which should give 0, and `node .kaif/tools/kaif-attribution-lint.mjs check`.
> - Order the closing:
>   1. Stage the field report so `npm run guards` exits 0 and not just 22/22.
>   2. Trim STATUS to ≤ 200.
>   3. As the very last canon edit, run `check --gate-budgets` and stage `.kaif/budget-baseline.json`.
>   4. `node .kaif/kaif-core.mjs report …` for the field report. `check` currently names it `undelivered KAIF field report`.
>   5. Then `update-verify`.
> - The final report and farewell should carry two lines:
>   - `REAL WORLD:` — the update ran on the live deployed tree with the owner's edits. Gates are verified there. The live hook event is not verified.
>   - The experience-recall line (EXP ids consulted, or "no relevant lessons"). The claims list carries none; this is a caveat under the judge's KAIF patch.
> - Treat `plans/100` (the owner's «перейти сейчас, на этой неделе», 8 days old, not started) as owner debt per the new BUG_FIXING rule.
> - Keep the `closing-gates` checkpoint honest: it is not in the task file's checkpoint list yet.

**Fixed before the commit (all nine):**

1. The stale «ждёт слова владельца» (the shipped contour waits for the owner's word) replaced in five places — BUG_FIXING_FRAMEWORK (new line) and the interview and resume skills (pre-existing since 2.7) — by the owner's choice of 2026-09-18 (interview №093, Q2 = B) and `plans/100`; STATUS names it as owner debt.
2. STATUS line reworded so the voice core's version no longer reads as a KAIF version; `stale-claims` → 0.
3. The experience-lint "baseline written" claim removed (the lint needs none: 0 findings).
4. STATUS trimmed 212 → 199 (closed passages moved to the chronicle); the first ratchet gate run as the last canon step: `{"AGENT_GUIDE.md": 2522}`.
5. Code markers moved to the END of the flagged lines (before `*/`), the owner's quote and three sentences re-joined; `node --check` green.
6. HOUSE_RULES R1 clause 2 signed `[AI]`.
7. The `.private/` row rewritten to the measured state (the folder exists, holds `storage-1x-backup/`; the `kaif:check` warning is about the missing bundle); the same false «удалён» corrected in AGENT_GUIDE.
8. The TESTING ladder pointer names its real heading; `PARKED:` goes to "the very top of STATUS.md".
9. Interview №105 carries a dated correction «203» → 200.

Judge pass 2 (a fresh clean-context sub-agent), quoted verbatim:

> VERDICT: REFUTED
>
> **Scope.** Narrow. Eight of the nine findings are fixed as claimed, and every gate is green. One part of finding 4 fails reproduction: the STATUS trim did not move one line verbatim. The chronicle copy rewrites what dev-1's 11:35 closing observed, and the original observation now exists nowhere in the tree. The field report repeats that false "verbatim" claim in R6. Item 10 of the report also still describes the old marker placement. Both fixes are line-level.
>
> Judged 2026-09-26 ~14:45 +03:00 by a clean-context judge. HEAD = origin/main = 72ca2998, so nothing was committed or pushed. The live tree was not changed.
>
> How the gates were run. Gates that can write (`npm run guards`, `kaif-core check`, `--gate-budgets`, `questions`, `stamp-creed --check`, the lints) ran in a byte-copy of the tree:
> - `git ls-files --cached --others --exclude-standard` plus `.git`, with no `.env`.
> - `node_modules` linked through a junction.
> - `git status --porcelain` of the copy was identical to the live tree.
>
> At the end, every changed file was compared byte-for-byte between the live tree and the copy: identical. `kaif:check` is read-only (`tools/03-kaif-verify.mjs` has no writes), so it ran live.
>
> ## The nine findings
>
> | # | Finding | Observed (command → result) | Status |
> |---|---|---|---|
> | 1 | «ждёт слова владельца» gone from the contour lines. №093 В2 = Б and `plans/100` named instead. `plans/100` is owner debt in STATUS | `git grep --untracked -F "ждёт слова владельца"` (worktrees excluded) → no hit in BUG_FIXING, the interview/resume skills or any mirror. The remaining hits are unrelated history, bugs and plans. A regex hunt for other phrasings (генератор/contour … ждёт слова/решения) → 0. `BUG_FIXING_FRAMEWORK.md:130-131`, `.claude/skills/interview/SKILL.md:202, 246, 276` and `.claude/skills/resume/SKILL.md:100` now read «выбран владельцем (интервью №093, В2 = Б) и ждёт исполнения `plans/100`». `.agents`/`.grok`/`.cline` are byte-equal to `.claude`. `.roo/commands/{interview,resume}.md` differ only by the `name:` line. `STATUS.md:25` reads «**Долг перед владельцем:** переход на готовую страницу вопросов (№093 В2 = Б, 18.09) — `plans/100` не начат» | VERIFIED |
> | 2 | `stale-claims` → 0 | `node .kaif/kaif-core.mjs stale-claims` → header only, `0 line(s) assert an older version`, exit 0 | VERIFIED |
> | 3 | No file claims an experience-lint baseline | `ls .kaif/*baseline*` → attribution and budget only. STATUS:25 says «база линта атрибуции». Report §3 says "(the experience lint needs none here: 0 findings)". The remaining `experience-lint.baseline` hits are skill instructions and tool code, not claims | VERIFIED |
> | 4a | `.kaif/budget-baseline.json` exists, is staged, and records only AGENT_GUIDE at its own-line count | `git status` → `A  .kaif/budget-baseline.json`. Content: `"docs": {"AGENT_GUIDE.md": 2522}`. `kaif-core check` → "AGENT_GUIDE.md: own lines 2522 … translated wholesale". The file's mtime is 14:32:42, later than every core document (AGENT_GUIDE 14:30:03, STATUS 14:31:33, TESTING 14:30:02). In the copy, `check --gate-budgets` → exit 1 "stood still at 2522 since the last closing", which is the ratchet working as designed, and the baseline was not rewritten | VERIFIED |
> | 4b | `wc -l STATUS.md` ≤ 200 | `wc -l` → 199 (HEAD 200). `check` has no STATUS warning | VERIFIED |
> | 4c | Passages removed from STATUS are in PROJECT_HISTORY verbatim | Every `-` line of `git diff HEAD -U0 -- STATUS.md` was checked with `grep -F` against `PROJECT_HISTORY.md`. The line `` `test:sync` не прогнаны; **пара портрета РАЗОШЛАСЬ** (слепок KAIF 2026-09-25 15:32, у нас ядро 1.2) — после 2.8. `` is **MISSING**. The chronicle holds «пара портрета сошлась 2026-09-26 — обновление KAIF 2.8 заменило слепок (ядро 2.2).» instead. That text sits under a heading that says «перенесено из STATUS дословно» and under «Из пункта «4. dev-1» (протокол закрытия dev-1)». `git grep -F "слепок KAIF 2026-09-25 15:32"` → 0 hits: dev-1's observation has left the tree. PROJECT_HISTORY is in stale-claims' `SKIP_FILES` (`kaif-core.mjs:1206`), so no gate forced the rewrite. The other removed lines are either found, the rewritten pointer paragraph, or the expired «KAIF крупно не править до 2.8» trap, which already lives at `PROJECT_HISTORY.md:170` | **REFUTED** (new finding N1) |
> | 4d | EXP-0337 and R6 match what happened | EXP-0337 «незакоммиченную базу снял и записал первую дверь версии последним шагом» is true now: the baseline was written after the last core edit. R6's numbers match (212 → 199; `{"AGENT_GUIDE.md": 2522}`). R6's parenthesis «closed passages moved verbatim to the chronicle» is false (N1) | VERIFIED except that parenthesis |
> | 5 | Markers at the END of the flagged lines, no inserted lines, `*/` kept after the marker, `node --check` passes | `git diff HEAD --stat` on both tools → 8 insertions and 8 deletions, so the line count is unchanged. Each hunk appends ` KAIF-VERSION-OK: версия прихода — история.` to the flagged line. The owner's quote on `review-core.mjs:60-61` is intact and closed («…отвечал!».) before the marker. Line 121 ends `… история. */`. `node --check` → OK on both files | VERIFIED (cosmetic: the markers on review-core:61 and review.mjs:1284/1511/1723 sit where the sentence wraps, which is the accepted form) |
> | 6 | HOUSE_RULES R1 clause 2 signed `[AI]` | `HOUSE_RULES.md:33` reads «2. `[AI]` (исполнение агента, не слово владельца) В отчёте об обновлении и в прощании назови …». The `[OWNER]` line quotes only «Что каиф с обновлением поставляет - то и принимают без вопросов», and `decision.json` matches | VERIFIED WITH CAVEAT: `.claude/skills/kaif-update/SKILL.md:15-17` (and its mirrors) still say «а отчёт и прощание называют их по строке (… R1; интервью №105, В1 = А)» without `[AI]`. The pointer leads to the signed clause. `kaif-attribution-lint` → new 0 |
> | 7 | `.private/` row matches the measured state; AGENT_GUIDE does not say "deleted" | `ls -la .private/` → only `storage-1x-backup/`. `npm run kaif:check` (live) → exit 0, warnings: unknown skill `video-studio` and «нет .private/ndim-1.x-history.bundle — история 1.x только в приватном ndim-old». `HOUSE_RULES.md:51` states exactly that. `AGENT_GUIDE.md:1811` reads «содержимое локального `.private/` владелец перенёс на внешний носитель 2026-07-11», and no «удал…» remains | VERIFIED |
> | 8 | Ladder pointer resolves; `PARKED:` names no missing STATUS section; TESTING own lines ≤ 300 | `TESTING_FRAMEWORK.md:438` → «`AGENT_GUIDE.md` → «Зелёные тесты сами по себе ничего не доказывают»». That section exists at `AGENT_GUIDE.md:1743` and holds `#### 🔴 ЛЕСТНИЦА ТРЁХ ВОПРОСОВ` at :1751. `AGENT_GUIDE.md:670` → «в самом начале `STATUS.md`, над эстафетами». Probe in the copy: +1 line → no warning, +2 lines → "own lines 301 of budget ~300", so the count is 299. Unmodified `check` → no TESTING warning | VERIFIED |
> | 9 | interview_105 carries a dated correction 203 → 200 | `interviews/interview_105_kaif28_rules.md:26` → «🔄 Поправка агента 2026-09-26 14:31 +03:00: итог — руководство короче на 200 строк (2 722 → 2 522) …». `wc -l AGENT_GUIDE.md` → 2522. `git show HEAD:AGENT_GUIDE.md \| wc -l` → 2722 | VERIFIED |
>
> ## Gates re-run
>
> | Gate | Result |
> |---|---|
> | `npm run guards` (copy) | `✅ ВОРОТА ЧИСТЫ: стражей 22, все зелёные`, exit 0. There are no untracked files (`git status` has no `??`) |
> | `npm run kaif:check` (live) | 30 passed, 2 warnings (above), `README согласен с маркером KAIF: все 3 места называют 2.8`, exit 0 |
> | `npm run questions` | `✅ ЧИСТО (долг: вопросов вне interviews/ 25 · неразнесённых ответов 22)`, exit 0 |
> | `node tools/stamp-creed.mjs --check` | `вписано 0 · обновлено 0 · всего документов 20`, exit 0 |
> | `node .kaif/tools/kaif-attribution-lint.mjs check` | `OK — 741 file(s) scanned, new 0 · debt 138`, exit 0 |
> | `node .kaif/tools/kaif-experience-lint.mjs check` | OK, 0 findings, 2 warnings (the unclassed fold and EXP-0322) |
> | `node .kaif/kaif-core.mjs check` (copy) | exit 0. Warnings: language mix, AGENT_GUIDE over budget, **undelivered KAIF field report** |
> | Portrait pair command (`AGENT_GUIDE.md:2007`) | exit 0 |
>
> ## New findings
>
> **N1 — The chronicle rewrote dev-1's closing record under a "verbatim" heading. This is a standing falsehood, and the original observation was deleted rather than moved.**
> - Where:
>   - `PROJECT_HISTORY.md`, top section «🗓 Стрижка 2026-09-26 14:31 +03:00 — перенесено из STATUS дословно», item «Из пункта «4. dev-1» (протокол закрытия dev-1)».
>   - Repeated in report R6: "closed passages moved verbatim to the chronicle".
> - What changed: HEAD `STATUS.md:56` read «**пара портрета РАЗОШЛАСЬ** (слепок KAIF 2026-09-25 15:32, у нас ядро 1.2) — после 2.8». The chronicle now says «пара портрета сошлась 2026-09-26 — обновление KAIF 2.8 заменило слепок (ядро 2.2)», which attributes to dev-1's protocol something it never observed.
> - The chronicle is append-only. No gate required this edit, because stale-claims skips PROJECT_HISTORY.
> - Smallest fix:
>   1. Restore the original line byte for byte in that history item.
>   2. Append a dated note in the chronicle's own correction form (compare `PROJECT_HISTORY.md:94`), e.g. `*поправка 2026-09-26 14:31: пара сошлась — обновление KAIF 2.8 заменило слепок (ядро 2.2), pair-команда → exit 0*`.
>   3. Then R6 is true as written.
>
> **N2 — Report item 10 still describes the rejected marker placement.**
> - Where: `reports/KAIF_UPDATES/NDIM_SPACE_KAIF_2.8_UPDATE_REPORT.md:60-61` says "(code markers inserted as a comment line ABOVE the flagged line; `node --check` green)".
> - The tree now has all 8 code markers appended at the end of the flagged line (finding 5).
> - Smallest fix: "code markers appended at the end of the flagged line (a first placement as a comment line above split an owner quote; the judge caught it)". Make this edit before the report is delivered.
>
> ## Caveats (not refutations)
>
> - **The field report is still `**Delivered upstream:** NOT YET`.** `kaif-core check` names it `undelivered KAIF field report`. Deliver it (`node .kaif/kaif-core.mjs report …`) after N1/N2, as part of the closing.
> - **The budget ratchet is armed.** `check --gate-budgets` is red now and stays red until AGENT_GUIDE loses at least one line. STATUS's trap line says this correctly. Any closing gate run after this commit will stop unless a line moves out.
> - **kaif-update skill note** (finding 6 caveat): cite the report clause as `[AI]`, or point only at R1.
> - Carried over from the first judge and still not verifiable here:
>   - the live `PreToolUse` event of the fifth hook;
>   - the owner's chat order;
>   - the in-chat hunts (mid-turn word, hands asked, parked and dropped).

**Fixed after pass 2:**

N1. The portrait-pair line of dev-1's closing record restored in the chronicle byte for byte, with a dated correction note under it; both moved passages verified verbatim against `git show HEAD:STATUS.md`.
N2. Report item 10 now describes the markers as they are on disk.
Caveat 6. The `/kaif-update` note signs its own clause `[AI]`.

Judge pass 3 (a fresh clean-context sub-agent, on pass 2's findings only), quoted verbatim:

> VERDICT: VERIFIED WITH CAVEATS
>
> **Scope.** This pass re-checked only judge2's findings N1 and N2, caveat 6, and the gates.
> - N1 is fixed and N2 is accurate.
> - Caveat 6 is fixed in the canon copy (`.claude`), but the four mirror copies still carry the old unsigned sentence.
> - Every gate is green.
> - The staging area still holds the pre-fix chronicle.
>
> Judged 2026-09-26 ~14:50 +03:00 by a clean-context judge. HEAD = origin/main = 72ca2998. The live tree was not changed: `git status --porcelain` is identical before and after.
>
> **How the gates were run.** They ran in a byte-copy of the tree at `judge3\copy`:
> - The copy holds `git ls-files --cached --others --exclude-standard` plus `.git`. `.env` was not copied; the tracked `.env.example` was.
> - `node_modules` was linked through a junction, which was removed afterwards.
> - `git status` of the copy was identical to live both before and after the gates. Every changed or untracked file was compared byte-for-byte with live: identical.
>
> | # | Claim | Observed (command → result) | Status |
> |---|---|---|---|
> | N1a | The passages removed from STATUS are in PROJECT_HISTORY verbatim | `git diff HEAD -U0 -- STATUS.md` removes 4 things: (1) HEAD:27-29, «✅ Долг форс-закрытия 11:22 оплачен dev-1 …»; (2) HEAD:55-56, «- Реестр пар при закрытии … **пара портрета РАЗОШЛАСЬ** (слепок KAIF 2026-09-25 15:32, у нас ядро 1.2) — после 2.8.»; (3) the trap lines 78-80, which are a legitimate rewrite; (4) the pointer line 84, rewritten. A node script normalised CRLF and ran `indexOf` on each contiguous block. Block 1 is found as a whole at PROJECT_HISTORY:7 and block 2 at :13, both under the heading «🗓 Стрижка 2026-09-26 14:31 … перенесено из STATUS дословно» (:3). `git diff HEAD -- PROJECT_HISTORY.md` → 16 insertions, **0 deletions**, so the chronicle is append-only | VERIFIED |
> | N1b | A dated correction note follows the portrait-pair line | PROJECT_HISTORY:16-17: «*🔄 Поправка 2026-09-26 14:43 +03:00 (обновление KAIF 2.8): пара портрета сошлась … команда пары … даёт код 0; строка выше — протокол dev-1 на 11:35, оставлен дословно.*». Its claim was re-run: the pair command at `AGENT_GUIDE.md:2007` → empty diff, exit 0 | VERIFIED |
> | N1c | The STATUS pointer names the trim | STATUS «Перенесено…» line: «Стрижка 2026-09-26 14:31 +03:00 (обновление KAIF 2.8): «✅ Долг форс-закрытия 11:22 оплачен dev-1» · пункт «Реестр пар при закрытии» из «4. dev-1».» | VERIFIED |
> | N1d | Report R6 «closed passages moved verbatim to the chronicle» | Now true (N1a). The budgeted core has not changed since the baseline: the mtimes of AGENT_GUIDE (14:30:03), TESTING (14:30:02) and STATUS (14:31:33) are all earlier than `budget-baseline.json` (14:32:42). The baseline reads `{"AGENT_GUIDE.md": 2522}` and `wc -l AGENT_GUIDE.md` → 2522 | VERIFIED |
> | N2 | Report item 10 describes the code markers as they are on disk | Item 10 (report:59-62) says "code markers appended at the END of the flagged line, before a closing `*/`; a first attempt put them on a comment line above … the judge caught it". `git diff HEAD` on `tools/review.mjs` and `tools/lib/review-core.mjs` → 8 insertions and 8 deletions. All 8 markers are appended to the end of the line. On review-core:121 the marker is placed before `*/`. `node --check` passes on both files. The counts in item 10 also hold: 8 code lines (3 + 5) and 4 new document lines (AGENT_GUIDE 1, plans/100, plans/101, qa/suites). The AGENT_GUIDE «2.0» marker already existed at HEAD:2662 | VERIFIED |
> | C6 | kaif-update skill note: the agent's clause is signed `[AI]` and no longer attributed to interview №105 | `.claude/skills/kaif-update/SKILL.md:15-17`: «…принимаются без вопроса (`HOUSE_RULES.md` → … R1; интервью №105, В1 = А, 2026-09-26); `[AI]` отчёт и прощание называют их по строке.» The citation now covers only the acceptance. That matches the owner's answer in `interview_105` («Что каиф с обновлением поставляет - то и принимают без вопросов»; `decision.json` is the same). The reporting clause sits after the citation and carries `[AI]`. `HOUSE_RULES.md` R1 clause 2 is `[AI]`-signed | VERIFIED in the canon; **caveat: the mirrors lag** (see below) |
>
> ## Gates
>
> | Gate | Result |
> |---|---|
> | `npm run guards` (copy) | `✅ ВОРОТА ЧИСТЫ: стражей 22, все зелёные`, exit 0 |
> | `npm run kaif:check` (copy) | exit 0. 2 warnings: unknown skill `video-studio`, and no `.private/ndim-1.x-history.bundle`. `README согласен с маркером KAIF: все 3 места называют 2.8` |
> | `npm run questions` (copy) | `✅ ЧИСТО (долг: вопросов вне interviews/ 25 · неразнесённых ответов 22)`, exit 0 |
> | `node .kaif/kaif-core.mjs stale-claims` (copy) | `0 line(s) assert an older version`, exit 0 |
> | `node .kaif/tools/kaif-attribution-lint.mjs check` (copy) | `OK — 741 file(s) scanned, new 0 · debt 138`, exit 0 |
> | `wc -l STATUS.md` | 199 (≤ 200) |
> | extra: `node .kaif/kaif-core.mjs check` (copy) | exit 0. Warnings: **4 mirrors drifted from canon** (`.agents` / `.grok` / `.cline` kaif-update, plus 1 more); language mix; AGENT_GUIDE over budget; undelivered KAIF field report |
>
> ## Caveats and new findings
>
> 1. **Mirror drift of the C6 fix.** The fix was made in `.claude/skills/kaif-update/SKILL.md` at 14:44:01, after the last sync at 14:32:14. So `.agents/`, `.grok/` and `.cline/skills/kaif-update/SKILL.md` and `.roo/commands/kaif-update.md` still read «…без вопроса, а отчёт и прощание называют их по строке (… R1; интервью №105, В1 = А …)». That is judge2's caveat 6, still standing in the copies that Codex, Grok, Cline and Roo read. `kaif-core check` names the drift. **Smallest fix:** `node .kaif/kaif-core.mjs sync`, or run `update-verify`, which re-syncs automatically. Then confirm with `cmp`.
> 2. **The staged chronicle is still the pre-fix version.** `PROJECT_HISTORY.md` is `MM`. Its index copy still has «пара портрета сошлась 2026-09-26 — обновление KAIF 2.8 заменило слепок (ядро 2.2).», while `STATUS.md` is fully staged with the lines removed. A commit of the index alone would reintroduce N1. **Smallest fix:** stage the working-tree `PROJECT_HISTORY.md`, and the rest of the unstaged update, before committing.
> 3. **Carried over.** The field report is still `**Delivered upstream:** NOT YET`, so deliver it as part of the closing. The budget ratchet is armed: the next closing must move at least one line out of AGENT_GUIDE.

**Fixed after pass 3:** the four mirror copies re-synced (`node .kaif/kaif-core.mjs sync`; `cmp` equal for .agents/.grok/.cline, the Roo copy carries the signed line); the whole update staged before the commit, the chronicle included.
