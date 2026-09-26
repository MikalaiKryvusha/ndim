# KAIF bug: on the shipped 2.8 page a radio is NOT cleared by a second click or tap — the pointerdown clears it, the native click of the same press re-checks it (the P3 defect the contract itself names)

kaif-fp: .kaif/tools/contour/review.mjs#page-js-pointerdown :: radio-second-click-rechecks :: v2.8
**Delivered upstream:** https://github.com/MikalaiKryvusha/KAIF/issues/128
**Severity:** S2 (found by the owner on his first live page; P3 is a contract invariant; no answer lost)
**Autocapture** (from `.kaif/kaif.json` + update receipt): KAIF 2.8 (updated 2.7 → 2.8, route `bootstrap`,
2026-09-26) · project NDim Space · sphere programming · language ru · i18n translated · tracking origin ·
agent system claude-code (Claude Code / Opus 5.5, 1M context) · OS Windows 11 Pro 10.0.26200 · Node v24.15.0 ·
the owner's Edge `--app` window on the project profile
**Author:** the project's agent (sent from the owner's account; the agent answers for this text).
**Dedup attestation:** `grep -rli "second click\|повторн" bugs/KAIF/` → 0 files on this subject; origin issues by
BODY (run 2026-09-26 16:3x, AFTER delivery — see the correction below): `"second click in:body"` → #60 (the FAB),
#83 (a field report); `"radio in:body"` → #51 (options without radios), #106 (1.7× zoom), #66 (a page closed by a
neighbour); `"повторн in:body"` → none. None is this defect. The P3 wording lives in the `/owner-reviews` skill
(«Selection clearable by a second click … the second click "cleared and instantly re-selected"»).
*Correction 2026-09-26: the first delivered text of this line claimed the origin search had been read; it had not
been run yet. It was run right after delivery; the result above changes nothing about the ticket.*

## The owner's word

The first live page on the shipped contour (this project, 2026-09-26 16:22 +03:00), his comment on both questions
and on the whole document: «*Не снимаются радиокнопки повторным тапом - баг в КАИФ и у тебя*» ("the radio buttons
are not cleared by a second tap — a bug in KAIF and in your project").

## Got in the field

The page JS takes activation over on `pointerdown` with `preventDefault()` and toggles the input
(`if(e.target===inp){inp.checked=!was}`). `preventDefault()` on `pointerdown` does not cancel the `click` that the
same press produces; the native radio click then sets `checked = true` again. Observed with Playwright (Chromium,
mouse and touch) on the shipped file: clicks/taps on one radio → `[true, true, true, true, true, true, true, true]`
where P3 expects `[true, false, true, true, false, true, false, true]` (click the circle: set, clear; click the
label text: set, keep; tap: clear, set; Space: set).

## Local remediation (applied, observed)

A capture-phase `click` listener cancels the click that follows a taken-over `pointerdown` (a window of 800 ms, a
flag set in the `pointerdown` handler); a cancelled radio click restores the pre-click state — the one the
`pointerdown` set. A keyboard click (no `pointerdown` before it) keeps the native behaviour. Diff:
`.kaif/tools/contour/review.mjs`, +7 −1, marked «LOCAL REMEDIATION». Proof: the project's run driver
(`qa/reports/2026-09-26_shipped-review-page.driver.mjs`, case К11) — red on the shipped file (the sequence above),
green on the fix, whole run 16/16; `review.mjs --selftest` 111 green. Proposed upstream: the same listener, and a
selftest case that dispatches pointerdown+click on a checked radio and asserts it ends unchecked.
