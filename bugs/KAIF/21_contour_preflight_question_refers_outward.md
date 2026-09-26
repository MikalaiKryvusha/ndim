# KAIF improvement request: the contour's pre-flight should refuse a question that sends the owner OUTSIDE it for its own content («see above», «in the section …», «§3») — a field owner's standing word; today only a project wrapper can hold it

kaif-fp: .kaif/tools/contour/core.mjs#preflight :: question-not-self-contained :: v2.8
**Delivered upstream:** https://github.com/MikalaiKryvusha/KAIF/issues/124
**Severity:** S3 (owner time; a class the owner corrected twice in a row)
**Autocapture** (from `.kaif/kaif.json` + update receipt): KAIF 2.8 (updated 2.7 → 2.8, route `bootstrap`,
2026-09-26) · project NDim Space · sphere programming · language ru · i18n translated · tracking origin ·
agent system claude-code (Claude Code / Opus 5.5, 1M context) · OS Windows 11 Pro 10.0.26200 · Node v24.15.0
**Author:** the project's agent (sent from the owner's account; the agent answers for this text).
**Dedup attestation:** `grep -rli "self-contained\|ССЫЛКА-ОК" bugs/KAIF/` → 0 files; origin issues by BODY:
`"self-contained in:body"` → #104 (a PICTURE for explanations — another subject); `"see above in:body"` → #91,
#74, #63, #71, #121 — read: none proposes a pre-flight axis for outward references. The canon states the rule
(`AGENT_GUIDE` «ВОПРОС САМОДОСТАТОЧЕН — the subject of the decision lives INSIDE it … a link INSTEAD of the
content is a defect, and it is guarded mechanically») but the shipped door does not guard it. No match found.

## The owner's word (the project's standing rule since 2026-08-15)

«*Пиши прямо в вопросе то, что предлагаешь взять. Я не собираюсь скролить этот длинный документ и искать
„вон ту формулу“*» — "Write right in the question what you propose to take. I am not going to scroll this long
document looking for 'that formula over there'". His second correction of the same class after «don't make me
dig through md files» (the page itself was the cure of the first).

## Proposal — an executable contract

A third pre-flight axis beside options and archaeology: for every LIVE question, a line between its heading
and its answer field that matches a language-pack pattern of BACKWARD/SIDEWAYS references refuses with exit 3
and names `doc:line · Q<n> · the line`; a forward reference («options below») stays legal; a declared exception
on the line `<!-- ref-ok: <reason> -->` (a marker with an empty reason is itself a violation). Russian pattern in
use here for 6 weeks: `(?<!\p{L})(?:выше(?!\p{L})|вон\s+т[оеа]\p{L}*|в\s+разделе|в\s+шапке|см\.\s|§\s?\d)` (`iu`).
Selftest: a fixture «formula — see above» → exit 3; the same with the marker → 0; an answered question → 0.

## Local remediation (applied)

`npm run review` goes through a project wrapper (`tools/contour.mjs`) that runs the project's own
`lintSelfContained` before any show, `--check` and `--enqueue`, and over every pending document before a
`--queue` page; exit 3 with the owner's words. Unit `tools/contour.test.mjs` — a live `--check` of a
«см. выше» question → 3 before the generator starts; mutant «the check detached» → that test red. Gap: a
direct `node .kaif/tools/contour/review.mjs <doc>` bypasses the wrapper — the reason this belongs in the door.
