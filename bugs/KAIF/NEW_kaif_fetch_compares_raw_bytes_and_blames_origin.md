# KAIF bug: `02-kaif-fetch` compares raw bytes and blames origin for a line-ending difference

kaif-fp: tool:02-kaif-fetch.mjs#identity-check :: raw-byte-compare-no-normalization :: v2.4
**Autocapture** (from `.kaif/kaif.json`): KAIF 2.4 · project NDim Space · sphere programming ·
language ru · i18n translated · tracking origin · agent system claude-code (Claude Code / Opus 5,
auto permission mode) · OS Windows 11 · Node 24.15.0 · `core.autocrlf=true`
**Dedup attestation:** searched `bugs/KAIF/` (3 tickets: 01 report-bug delivery classifier,
02 team-deployment brownfield adoption, 03 team-deployment CI workflows — none of this class).
No match found.

## Gap

`tools/02-kaif-fetch.mjs` decides whether the local KAIF core differs from origin by comparing
**raw text**:

```js
const localText = readFileSync(LOCAL, 'utf8');   // LOCAL = 'KAIF.md'
remoteText = await res.text();
const identical = remoteText === localText;      // line 65
```

There is **no normalization anywhere in the file** (grepped for `normalize` / `trimEnd` /
`replace` → 0 lines). On a platform that rewrites line endings on checkout — Windows with
`core.autocrlf=true`, which this project runs — the local copy can carry `CRLF` while origin
serves `LF`. The two texts are then unequal for a reason that has nothing to do with content.

## Why this is worse than a false negative

The tool does not merely report "different". When versions match but bytes do not, it prints a
**named cause**, and the cause is wrong:

```
≠ версии совпадают (vX), но содержимое отличается — origin правился без бампа версии
```

So the reader is told that **origin was edited without a version bump** and goes looking for a
change in origin that does not exist. The refusal would be correct; the explanation would not.

This is exactly the class this project paid for on the same day in a neighbouring tool: *the text
of a refusal is observable behaviour too, and its correctness does not follow from the correctness
of the exit code.* Mutation testing catches the code and stays silent about the meaning.

It also matters **when** it would lie: at the moment the tool is asked to judge whether we should
update the framework at all. That is the one question it exists to answer.

## What is NOT claimed — no reproduction, and this is stated on purpose

⛔ **Neither the finder nor the reviewing QA has reproduced a firing.** `LOCAL = 'KAIF.md'` is
resolved against the current working directory, and that file does not exist in the tree at rest —
it appears during the update route. A copy downloaded over HTTP arrives with `LF` and the tool
stays quiet; a copy materialised by git on this machine arrives with `CRLF` and the tool lies.
**The condition is real; the firing is unobserved.** The marker is deliberately kept no wider than
the observation.

## How it was found

Not by reading this tool. It surfaced during a survey of *every* `sha256`/identity check in the
project, run to test a different hypothesis — whether a hash-as-proof defect found elsewhere
repeated. The hypothesis was refuted (the class is already cured in the project's own review gate,
which normalizes BOM, `CRLF` and trailing whitespace before hashing), and this raw comparison was
the single latent instance the survey turned up.

## Suggested fix — the pattern already exists inside KAIF-adjacent code

Normalize before comparing, exactly as the owner-review gate does:

```js
const norm = (s) => String(s).replace(/^﻿/, '').replace(/\r\n?/g, '\n');
const identical = norm(remoteText) === norm(localText);
```

And, if the texts still differ, the printed cause should distinguish "content differs" from
"line endings differ" rather than asserting an origin edit.

⚠️ Note for whoever applies this upstream: normalization that **adds** a trailing newline (as some
implementations do) changes any published hash of the same file. Where a hash has been published
as proof of identity, the normalization must be stated alongside the number, not swapped silently.

## Acceptance

A local core carrying `CRLF` and an origin core carrying `LF`, identical in content, are reported
as identical — and no message claims origin was edited without a version bump.
