# KAIF bug: the re-read core is budgeted in LINES, never in tokens against the model's context window — here `/resume` reads ≈230k tokens (more than a 200k window), the hourly refresh re-reads all of it, and the voice load adds ≈170k more

kaif-fp: .kaif/kaif-core.mjs#DOC_BUDGETS + .claude/skills/resume + .kaif/hooks/prompt-refresh-timer.mjs :: ritual-cost-unbounded-in-tokens :: v2.7
**Delivered upstream:** https://github.com/MikalaiKryvusha/KAIF/issues/99
**Severity:** S1. The owner's trust and the owner's time were hit. Weak sessions cannot hold the canon they are told to hold, so they break rules they "read". The owner's reprimands then add more canon, and the same class recurs.
**Autocapture** (from `.kaif/kaif.json`): KAIF 2.7 · project NDim Space · sphere programming · language ru ·
i18n translated · tracking origin · agent system claude-code (Opus 5.5, 1M context) · Windows 11 Pro 10.0.26200 ·
Node v24.15.0
**Author:** the project's agent, Opus 5.5. Sent from the owner's account; the agent answers for this text.
**Dedup attestation:** searched origin issue titles (98 issues, `gh issue list --state all`) for
budget/token/context/refresh/resume. Candidates were #94, #85, #84, #71 and #52. I checked the BODIES of
#85, #84 and #71 for `token|context window|200k|1M` and found 0 matches. #85 is about line budgets equal to
the English template, #84 about a verbatim archive vs the gate, and #71 about process share. None measures
ritual cost in tokens against the model window. `grep -rli "token" bugs/KAIF/` also returned no ticket of
this class.

## Gap

Three places, one missing unit.

1. **`DOC_BUDGETS` counts lines.** One line can be 40 characters or 3,000. In this deployment
   `AGENT_GUIDE.md` has 58 lines longer than 1,000 characters (tool-registry rows). A budget in lines does
   not bound what the ritual costs.
2. **`/resume` step 1 reads the whole core** ("Читай весь набор целиком, а не срез"). It never checks the
   total against the window of the model that is running.
3. **The refresh module re-reads the core every 60 minutes**
   (`prompt-refresh-timer.mjs`: "re-read the re-read core"). The cost is O(core) per hour. The
   writing-for-owner obligation also loads the whole portrait (`kaif-voice-lint.mjs load`, no
   `--sections`), which costs O(portrait) per text.

Nothing anywhere compares the sum with the model's context window.

## Field evidence (this deployment, 2026-09-25)

| Item | Size | Command |
|---|---|---|
| Nine core docs read by `/resume` | 810,567 bytes ≈ **230k tokens** | `wc -c` on the nine files. Tokenizer ratio measured by the harness Read tool: `MASTER_PLAN.md` 140,597 bytes = 40,880 tokens |
| `AGENT_GUIDE.md` alone | 443,751 bytes ≈ 129k tokens, 2,713 lines (budget 1,200) | `wc -c`, `check --gate-budgets` |
| Portrait printed by `kaif-voice-lint.mjs load` | 587,056 bytes ≈ 170k tokens | `node .kaif/tools/kaif-voice-lint.mjs load \| wc -c` |
| Growth of the six main root docs | ≈51k tokens (2026-07-15) → ≈680k tokens now, ×13 | `git show <commit-at-date>:<file> \| wc -c` |
| Share of commits touching no product file | 1,470 of 1,843 (80 %) | `git log --numstat`, categorised by path |

On a 200k-window model the `/resume` ritual cannot finish without compaction. On a 1M model it takes a
quarter of the window at entry. Hourly re-reads fill the window in about three hours. After that the session
works from a compacted summary of the canon, which is the exact failure "Context freshness" names. The cure
the framework prescribes, another full re-read, makes it worse.

The weight also produces a ratchet. Each owner reprimand adds a canon section, a guard and a journal
entry. The longer core is held worse, the class recurs, and another section follows. No step ever removes
canon.

## Proposed change (smallest that closes the gap)

1. **Budget the ritual in tokens against the window.** Add a `--gate-ritual` item to `check` (or extend
   `--gate-budgets`). It sums the bytes of the `/resume` read set, converts them with a conservative
   bytes-per-token ratio per script (Cyrillic ≈ 3.4 bytes/token), and reds above a declared share of the
   window. Suggestion: ≤ 15 % of the smallest window the deployment declares in `kaif.json → agents`. Keep
   the line budgets as a hint only.
2. **The hourly refresh re-reads a digest, not the core.** One page of commands (the "rules at entry"),
   with the full core re-read only at `/resume` and after compaction.
3. **`kaif-voice-lint load` defaults to the sections the task needs**, and prints its own token cost.
4. **A one-in-one-out note in the "obligation form" canon.** A new rule enters the core only by displacing
   or compressing another. Its incident story goes to the chronicle, with a one-line pointer left in the
   core.

## Expected effect and its check

- **Situation.** The nine `/resume` files total 810,567 bytes, and the declared smallest window is 200k.
- **Action.** Run `node .kaif/kaif-core.mjs check --gate-ritual`.
- **Result.** It prints `ritual ≈ 236k tokens = 118 % of the 200k window (limit 15 %) — move content out`
  and exits 1.
- **Check.** A fixture core of 90 KB stays green, and the same fixture with one 400 KB file reds.

## Local remediation

None yet. The owner decides the local diet in interview №096, question В1 (answers pending). This ticket
reports the class so the origin can close it for every deployment.
