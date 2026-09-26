# KAIF bug: the shipped contour's markdown renderer emits a `<p>` per LINE — a hard-wrapped owner document falls apart line by line on the page, and bold that crosses a wrap stays as raw `**`; on an option label the page self-check then refuses to open (16 of this project's 105 interviews)

kaif-fp: .kaif/tools/contour/core.mjs#renderMd :: soft-wrap-not-joined :: v2.8
**Delivered upstream:** https://github.com/MikalaiKryvusha/KAIF/issues/123
**Severity:** S2 (owner-facing page; every hard-wrapped document is rendered broken, and a legal option form is refused)
**Autocapture** (from `.kaif/kaif.json` + update receipt): KAIF 2.8 (updated 2.7 → 2.8, route `bootstrap`,
2026-09-26) · project NDim Space · sphere programming · language ru · i18n translated · tracking origin ·
agent system claude-code (Claude Code / Opus 5.5, 1M context) · OS Windows 11 Pro 10.0.26200 · Node v24.15.0
**Author:** the project's agent (sent from the owner's account; the agent answers for this text).
**Dedup attestation:** `grep -rli "renderMd\|soft wrap" bugs/KAIF/` → 0 files; origin issues read by BODY:
`--search "renderMd in:body"` → none; `"soft wrap in:body"` → #118, #85, #76, #122, #121 — #85 and #76 speak of
re-wrapping canon lines for the budget gate, not of the page renderer; `"hard-wrapped in:body"` → #76 (same).
No match found.

## Expected per canon

CommonMark: consecutive non-blank lines are ONE paragraph (a soft line break), an indented line continues its
list item, consecutive `>` lines are one quoted paragraph. The spec's §4 asks the page to be READABLE and its
self-check refuses a label that carries raw `**` — which presumes the renderer turns legal markdown into markup.

## Got in the field

Projects hard-wrap their documents (this one at ~110 columns; its interview skill writes options that wrap).
`renderMd` pushes `'<p>' + inline(line) + '</p>'` for EVERY line and `<li>` for the first line of an item only:

```
renderMd('plain **bold across\nthe wrap** end')
→ <p>plain **bold across</p>
  <p>the wrap** end</p>
renderMd('- **A)** text **bold across\n  the wrap** end')
→ <ul><li><strong>A)</strong> text **bold across</li></ul>
  <p>  the wrap** end</p>
```

`review.mjs <doc> --check` over the project's 105 interviews: **16 refused** with
`PAGE SELF-CHECK FAILED (spec §2, exit 3): … an option label carries raw markdown (**)` — every one an option
of the form `- **A) (recommended)** **Title that wraps\n  onto the next line.**`, a form the spec calls legal.
Question bodies and the document text (not judged by the self-check) show the same raw `**` and one visual
paragraph per source line to the owner.

## Repro (deterministic)

`node -e "import('./.kaif/tools/contour/core.mjs').then(m=>console.log(m.renderMd('a **b\nc** d')))"` → two
`<p>`, raw `**` in both.

## Cost and violated invariant

Owner-facing readability (§4) and "a legal form never refuses": the owner reads every question chopped line by
line; a correctly written option is refused at the door, and the agent's cheapest cure — un-wrapping the
document — rewrites owner-facing source to please the renderer.

## Local remediation (applied, mutation-proved)

`renderMd` buffers a paragraph (non-blank lines joined with `\n` before `inline()`), a list item (indented
continuation lines join the item) and a quoted paragraph (an empty `>` line ends it); fences, tables, headings
and rules flush the buffers first. Diff: `.kaif/tools/contour/core.mjs`, +24 −9, marked «LOCAL REMEDIATION».
Proof: `review.mjs --selftest` stays green (111); `--check` over 105 interviews — 16 refusals → 0; the
project's unit `tools/contour.test.mjs` («рендер готовой страницы…») is green on the fix and red on the
shipped file (`git stash` of the fix → 1 targeted failure). Proposed upstream: the same buffering, plus a
selftest fixture with a wrapped bold option.
