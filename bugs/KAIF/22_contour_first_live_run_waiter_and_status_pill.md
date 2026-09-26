# KAIF bug: two small defects of the 2.8 page found in its first live run on a translated deployment — the waiter never learns that the page's server was KILLED (the lock stays on purpose), and the «saved on this computer» pill covers the document title in the app window

kaif-fp: .kaif/tools/contour/review.mjs#waitForRecord :: waiter-blind-to-killed-server :: v2.8
**Delivered upstream:** https://github.com/MikalaiKryvusha/KAIF/issues/125
**Severity:** S3 (no answer lost in either case; the agent learns late, the owner reads a covered title)
**Autocapture** (from `.kaif/kaif.json` + update receipt): KAIF 2.8 (updated 2.7 → 2.8, route `bootstrap`,
2026-09-26) · project NDim Space · sphere programming · language ru · i18n translated · tracking origin ·
agent system claude-code (Claude Code / Opus 5.5, 1M context) · OS Windows 11 Pro 10.0.26200 · Node v24.15.0 ·
Edge (Chromium) headless `--app` on the project profile `.kaif/contour-window/`
**Author:** the project's agent (sent from the owner's account; the agent answers for this text).
**Dedup attestation:** `grep -rli "waitForRecord\|waiter" bugs/KAIF/` → 0 files; origin issues by BODY:
`"waiter in:body"` → #33, #118, #122 — #33 is the 2.2 wake-up rule, #118/#122 are update reports of other
projects that mention the waiter in passing; neither defect named. No match found.

## Where it was seen

Manual functional run of the switch to the shipped page (`qa/reports/2026-09-26_shipped-review-page.md`,
15/15 green after the expectations below were corrected): a waiter started before the page, answers saved one
at a time, then the page's server killed and the answer saved in the app window.

## Defect 1 — the waiter does not see a killed server

`waitForRecord` treats the contour as live while the LOCK FILE exists. A killed server leaves its lock on
purpose (I29: the next run reuses the port, the draft's origin). Observed: after `kill <pid from the lock>`
the waiter did not exit within 120 s; it woke with exit 0 only when `--queue --list` picked the locally saved
answer up. So the "exit 2 when the contour ended without one" promise (spec §5) holds for a CLOSED page and not
for a DEAD one: an agent whose page server crashed while its waiter survived waits until someone happens to run
the queue — and never hears «the server is gone; an answer may be saved on the owner's computer». Proposal:
in `live()`, read the lock's `pid` and treat a dead pid as "ended"; on that path say
«the page's server is gone — run `--queue --list` to pick up an answer saved on this computer» and exit 2.

## Defect 2 — the status pill covers the title

App window 1100×900, the server gone, Save pressed: the green pill «Сервер недоступен — ответ сохранён на этом
компьютере … Окно можно закрыть.» is positioned under the floating button and overlaps the header's document
title line («Интервью №990 — Проверка готовой страницы…» is half hidden). Frame:
`test-results/contour/shots/server-gone-saved-locally.png` (not shipped). Proposal: give the pill a max-width
inside the button's column, or push the header down while the pill shows.

## Local remediation

None — both are left to upstream (no answer is lost; the project's ritual runs `--queue --list` at every
`/resume`, which picks a local answer up).
