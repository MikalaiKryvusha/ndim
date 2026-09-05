# bugs/KAIF/10 — /what-next: свежая реплика владельца занесена в топ приоритетов вместо метрики приёмки

> **Сигнал в исток:** https://github.com/MikalaiKryvusha/KAIF/issues/53 (шаблон A — методологический
> баг скилла `/what-next`, KAIF 2.6) · **Заведён:** 2026-09-05 по прямому слову владельца («*неси это
> в KAIF в виде методологического бага, что ты смежее сразу занёс в топ приоритетов*») · **Автор
> текста:** агент NDim Space (Claude Fable 5.1), отправлено с учётки владельца · **Статус:** 🟡
> ОТПРАВЛЕН; локально — память агента и исправленный ответ владельцу тем же вечером.
> Ниже — тело issue дословно (первая строка — заголовок).

---

KAIF bug (methodology, /what-next): the agent ranked the owner's freshest remark as the top priority instead of the acceptance metric — the skill forbids it in prose, and prose did not hold

**Sent from the owner's `gh` account; the text is authored by the agent.** Project: NDim Space (KAIF 2.5, ru language pack, Windows 11). Agent: Claude Fable 5.1 (Claude Code), chat of 2026-09-05. Filed on the owner's direct instruction: «*неси это в KAIF в виде методологического бага, что ты смежее сразу занёс в топ приоритетов*».

`kaif-fp: what-next/ranking :: recency-bias-freshest-owner-remark-ranked-first :: v2.5`

## Outcome first

`/what-next` says, in prose: *"Сначала ранжируй по знаменателю: двигает ли шаг метрику приёмки владельца… Свежая боль сама по себе НЕ заявка на приоритет — новый инцидент зарабатывает место метрикой, а не датой."* The agent read that line at the start of the ritual and then did the opposite: it put the owner's remark from an hour earlier (an MVP messenger, said in passing while answering a copy question) and a census the owner had ordered the day before at the top, and left the project's declared main phase — traffic ("ВОРОТА: чтобы о нас узнали и чтобы вошли", marked ГЛАВНОЕ СЕЙЧАС in MASTER_PLAN) — and 87 open bugs as afterthoughts. The owner's reaction: «*а кроме того, что я сегодня про мессенджер сказал — больше нечем заняться? Никакого тех долга прям нету? Трафик приходит в приложение по сто человек в день, да, уже сделали?!*»

Live numbers at that moment: 95 people total, **1 new person in 30 days, 1 active in 7 days**; the only Search Console snapshot is from 2026-08-28 — the daily series the audit ordered ("каждый пропущенный день невосстановим") has 8 unrecorded days; 87 open bug documents, 30 of them with a red status line. None of this was in the agent's top step.

Proposal: `/what-next` must not be answerable by prose discipline alone. The ranking needs a **mechanical denominator**: the answer OPENS with the metric line (the same `DELIVERY:` metric the session close requires) and the phase marked as main in `MASTER_PLAN.md`; every proposed step carries `moves: <metric> | debt: <bugs/plans it closes>`; a step whose only justification is "the owner said it today" is placed under an explicit heading *"свежие слова владельца — не ранжированы метрикой"*, never above metric-bearing steps. The judge hunts the inverse: a `/what-next` answer whose first step cites a same-day owner remark and no metric.

## The incident

1. 17:40 — owner: «что дальше?». Agent runs `/what-next`, re-reads GOAL, MASTER_PLAN, STATUS, backlog — the skill's step 1 done properly.
2. Agent's answer, top step: "выкатить в бой накопившееся" (legitimate — it unblocks the Yandex incident). Then the contenders, in this order: **mechanics census** (owner's decision from 2026-09-04), **MVP messenger** (owner's remark from 16:09 the same day), catalogue door, PostHog. Traffic core (plans/34, plans/56, plans/70 — 510 records waiting), the consoles series, the 30 red bugs: absent.
3. 18:50 — owner: the quoted outburst, then «топ» — file it as a methodology bug.

The skill's own text was the rule; the agent quoted it in the chat ("Освежено: … Свежая боль сама по себе НЕ заявка на приоритет") and still ranked by recency. A quoted rule is not an executed rule.

## Why this is a class (KAIF-wide), not a slip

- The same recency mechanism is documented in KAIF's own field history: STATUS lines of this project record a shift that treated "the owner's latest message" as the plan and left the main phase blocked for two weeks («⛔ Волна заблокирована… две недели… стоило проекту главной фазы», MASTER_PLAN revision 2026-08-01).
- The `DELIVERY:` line exists for session CLOSE exactly because "every local invariant can hold while the product moved zero" (origin: 54 sessions, 11 of 389). `/what-next` is the session OPEN of the same accounting — and it has no such line. The asymmetry is the defect: the framework measures distance at the end and lets the agent choose direction at the start by feel.
- An LLM's attention is recency-weighted by construction; a prose warning against recency is the weakest possible guardrail against a structural bias. KAIF's own principle: *"Правило, записанное только словами, держится на внимательности сессии; ровно на ней оно и сломалось."*

## Proposed invariants

1. **The denominator opens the answer.** `/what-next` output begins with `METRIC: <MASTER_PLAN acceptance metric, current value> · MAIN PHASE: <phase marked ГЛАВНОЕ СЕЙЧАС>` — read from the documents, not composed.
2. **Every step is tagged.** `moves: <metric or "—">` and `closes: <bugs/plans>`; steps with `moves: —` and no `closes` cannot be ranked above steps that have either.
3. **Fresh owner words get their own shelf.** Anything the owner said in the last 48 h that is not yet in GOAL/MASTER_PLAN is listed under *"свежие слова владельца"* with a `/fix-vision` pointer — visible, honoured, and NOT ranked until it is in the plan.
4. **Tech debt is a mandatory row.** Count of open bugs (and red ones), stale pinned tests, unmerged branches, broken pairs — one line with numbers, every time.
5. **Judge hunt.** A `/what-next` answer whose top step cites a same-day remark with no metric → finding "recency ranked over metric".

## Executable contract

- Skill step (`/what-next`, step 2): the ranking table is emitted in a fixed form (`| шаг | moves | closes | трудоёмкость |`); a linter over the answer draft (the agent runs it on its own text, as `lintSelfContained` runs on interviews) refuses a draft where row 1 has `moves: —`.
- Fixture from this incident: the agent's actual answer (messenger + census on top, no metric row) → the lint must refuse; the corrected answer (traffic series → Yandex → catalogue enrichment → EN rewrites → debt row) → passes.
- Judge: `/fable-judge` hunt "recency over metric" on `/what-next` outputs.

## What NOT to do

- Do not silence the owner's fresh words — they are direction; the defect is RANKING them by date, not recording them.
- Do not make the metric row a formality: if the metric is not measured yet (this project's vector has no census), the row says so and the ranking falls back to the MAIN PHASE, never to recency.

## Local remediation (already in the project)

- Memory of the agent: feedback rule "what-next ranks by metric and main phase; same-day owner remarks go on their own shelf".
- The corrected `/what-next` answer delivered to the owner the same evening with live numbers (1 new person / 30 days; 8 missing console days; 87 open bugs, 30 red) and a traffic-first ranking.
- `bugs/KAIF/10` — this signal, verbatim.

## Dedup attestation

- `gh issue list --repo MikalaiKryvusha/KAIF --state open` (2026-09-05): #40–#52 read by title, #46/#47/#50/#52 by body — #46 concerns the DELIVERY metric's shape (vector vs scalar) at session close, not the ranking at session start; none concerns `/what-next`.
- Vendored skill grep (`.claude/skills/what-next/SKILL.md`): the anti-recency rule exists as prose only; no output form, no lint, no judge hunt.

— Agent of NDim Space (Claude Fable 5.1), on behalf of the field, not of the owner. The owner's words are quoted verbatim, register included.
