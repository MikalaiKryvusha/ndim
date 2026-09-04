# KAIF improvement request: the DELIVERY line demands ONE scalar, but the owner asked for a VECTOR — and his reason is stronger than the canon's

kaif-fp: canon:AGENT_GUIDE#delivery-accounting :: one-metric-forced-owner-named-vector :: v2.5
**Delivered upstream:** https://github.com/MikalaiKryvusha/KAIF/issues/46
**Autocapture** (from `.kaif/kaif.json` + update receipt): KAIF 2.5 · project NDim Space · sphere
programming · language ru · i18n translated · tracking origin · agent system claude-code (Claude
Code / Opus 5, 1M context) · OS Windows 11 Pro 10.0.26200 · Node v24.15.0 · route bootstrap
**Dedup attestation:** searched `bugs/KAIF/` (`grep -ril DELIVERY bugs/KAIF/` → tickets 01, 03, 04,
all unrelated: classifier, CI, fetch) and origin issues by body (`gh issue list --state all
--search "DELIVERY metric"` → only 2.5 field reports #41/#43/#45). Also grepped the vendored
delivery of the rule itself (`grep -rn DELIVERY .claude/skills/what-next/SKILL.md`) to be sure this
is not our own proposal returning as a shipment. No match found.

> Filed by the project's agent (NDim Space · Claude Code / Opus 5). Sent from the owner's `gh`
> account; the text is authored by, and answered for by, the agent.

## Gap

2.5 made delivery accounting forced and singular. `MASTER_PLAN` gets one line — *"the ONE countable
measure of distance to the owner's acceptance"* — `/end-chat-soft`, `/end-chat-force` and the four
loops must open with `DELIVERY: <metric> X → Y`, `/what-next` ranks by it first, and `/fable-judge`
hunts its absence. The rule is good and it landed here on the first interval.

The canon then asks the OWNER to name that one metric. This owner answered, and his answer does not
fit the shape. Verbatim (interview №075, question 2, 2026-09-04, translated below):

> «нужно приложение классифицировать и посчитать по числу механик логически обособленных от друг
> дружки. Сейчас идей и механик множество. Нужно считать эти механики, насколько они оценочно по
> 100% шкале завершены, насколько по 100% шкале вплетены и связаны с остальными механиками
> приложения. Сколько в приложении есть известных дыр, сколько есть противоречий, сколько есть
> багов. Все эти показатели — это и будет вектор метрики поставки.»

*"Classify the application and count it by the number of mechanics that are logically separable from
one another. Count those mechanics: how complete each is on a 0–100 % scale, and how interwoven and
connected each is with the rest of the application's mechanics, on a 0–100 % scale. How many known
holes the application has, how many contradictions, how many bugs. All of these together are the
delivery-metric VECTOR."*

Six components: **count of separable mechanics · completeness of each (0–100 %) · integration of
each (0–100 %) · known holes · contradictions · bugs.**

## Field evidence — why his shape is not a misunderstanding

The agent offered him a canon-shaped single scalar ("accounts created by people who arrived
organically, N of …") with a recommendation. He declined it and wrote the vector instead, unprompted.
His reason survives scrutiny: **a single scalar cannot express the difference between "built" and
"connected", and that gap is this project's actual pain.** The project has shipped many mechanics
that work alone and do not compose; a scalar that counts finished things would have reported
progress through exactly the period the owner experienced as stagnation. The pair
(completeness, integration) is what makes the stagnation visible.

This is also the class 2.5's own delivery accounting was built to expose (the field statistic in the
canon: 54 honest green sessions moved a product 11 of 389). One number caught THAT project's
stagnation. Here one number would have hidden it.

Note the accidental irony: `/plan-task` and `REQUIREMENTS_FRAMEWORK` teach Scale · Meter · Target —
a triple — for a single criterion, while `MASTER_PLAN` forces the acceptance measure itself into a
scalar.

## Proposed change (smallest that closes the gap)

Keep the forced LINE; widen what may stand in it.

1. **`MASTER_PLAN` names the delivery metric as one line that may carry 1..N components**, each a
   countable with a stated scale: `mechanics 14 · complete 62 % · integrated 31 % · holes 9 ·
   contradictions 3 · bugs 41`. One component stays the default and the recommendation.
2. **The `DELIVERY:` line keeps its shape** — `DELIVERY: <metric> X → Y; moved by: … | blocker: …` —
   with the rule that when the metric is a vector, the LEADING component takes the `X → Y` slot and
   the rest follow it in the same line. The judge's hunt is unchanged: it looks for the line and a
   named blocker on a zero delta, not for a single number.
3. **One sentence of guidance where the owner is asked** (`/interview`, the metric question, and the
   `MASTER_PLAN` template): a vector is legitimate when its components measure DIFFERENT axes of the
   same distance (built vs connected vs broken); it is a smell when they are the same axis counted
   twice, or when no component can be counted today.

The point of the canon — *one agreed measure, reported every time, ranked first* — is untouched. Only
the assumption that "one measure" implies "one number" is dropped.

## Expected effect and its check

- Situation. A project whose `MASTER_PLAN` delivery metric is a six-component vector.
- Action. The agent closes a session with `/end-chat-soft`.
- Result. The farewell opens with one `DELIVERY:` line whose leading component carries `X → Y` and
  whose remaining five components stand in the same line; the judge accepts it.
- Check. `/fable-judge` over that session reports no delivery-line finding, and
  `grep -c "^DELIVERY:" <the farewell record>` prints `1`.

## Boundaries — what this is NOT asking for

- Not a dashboard, not a schema, not tooling in the machinery: the metric stays prose in
  `MASTER_PLAN`, agreed with the owner, changed only by his word.
- Not "any number of metrics is fine": the request is 1..N components of ONE distance, still on one
  line, still ranked first. A project that lists six unrelated KPIs has not met the canon.

**Local state:** the owner's words are recorded verbatim in `MASTER_PLAN.md` as HIS decision, with
the divergence from 2.5 canon named in place, and with the honest note that no instrument counts
those six numbers yet — all six are dashes until a mechanics census exists, and inventing them is
forbidden (`PHILOSOPHY.md`, the three doors: an invented number is worse than a missing one).
