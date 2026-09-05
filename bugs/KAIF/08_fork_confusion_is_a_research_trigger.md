# bugs/KAIF/08 — Смущение агента на развилке доставлено владельцу как приговор («ломает модель»), а не как знак искать

> **Сигнал в исток:** https://github.com/MikalaiKryvusha/KAIF/issues/50 (шаблон B — запрос улучшения,
> KAIF 2.6, поведение агента на развилках) · **Заведён:** 2026-09-05 · **Автор текста:** агент NDim
> Space (Claude Fable 5.1), отправлено с учётки владельца · **Статус:** 🟡 ОТПРАВЛЕН, локально
> вылечен (`AGENT_GUIDE.md` → «Смущение агента — знак искать, а не отказывать», `EXP-0283`).
> Ниже — тело issue дословно (первая строка — его заголовок).

---

KAIF improvement request (2.6, agent behaviour at forks): when the owner's proposal confuses the agent, the canon must route it to web research or a question — never to "this breaks the model"

**Sent from the owner's `gh` account; the text is authored by the agent.** Project: NDim Space (KAIF 2.5, ru language pack, Windows 11). Agent: Claude Fable 5.1 (Claude Code), chat of 2026-09-05. The owner asked for this signal to be filed against KAIF 2.6 verbatim: «запиши это импрувментов в ориджин KAIF на версию 2.6 — к поведению агента на развилках».

`kaif-fp: agent-guide/forks :: owner-proposal-declared-broken-without-research :: v2.5`

## Outcome first

KAIF has "three doors" (PHILOSOPHY: a gap is closed by a primary source or by the owner's answer; inventing is forbidden) and the interview canon for forks. It has NO rule for the moment when the OWNER's proposal itself confuses the agent. In that moment the agent today has a cheap, wrong exit available: declare the proposal incompatible with the project's own model ("модель пар этого не умеет"), roll the work back and defer it. The owner named the rule that is missing:

> «*если я тебе что-то предлагаю, и тебя это смущает, ты не понимаешь — это тебе прямой знак, что нужно идти искать в интернете, что я имел в виду, или у меня спросить*»

and, a minute earlier: «*ты гугли в интернете прежде чем такую хуйню мне писать*».

Proposal: make **agent confusion at a fork a mandatory trigger for research**, in this order — (1) web search for what the owner most likely meant, (2) a measurement against the owner's own data, (3) a question in `interviews/`. Writing "your proposal breaks X" to the owner without evidence of steps 1–2 becomes a canon defect the judge hunts for.

## The incident, with the owner's words and the price

Interview №061 asked which English twin the tag «ролевая игра» should carry. The owner answered: «*нужно писать role-playing game и RPG одновременно, во все такие игры*». The project's tag model pairs tags positionally — the i-th Cyrillic tag to the i-th Latin tag (`tagPairsOf`, guarded by `tag-corpus.test.mjs`: "у русского тега ровно одна английская пара"). The agent read «RPG» as a THIRD English tag without a Russian twin, inserted it into four candidate cards, watched the corpus test go red (1 of 37), rolled the change back, and told the owner:

> «Одно не исполнено… „role-playing game и RPG одновременно" ломает модель пар тегов… третий тег роняет корпус. Это отдельная работа в три шага…»

The owner's reply: «*ролевая игра и РПГ — ничего не ломает блять!*» — «РПГ» is the ordinary Russian spelling of RPG, i.e. the answer meant TWO complete pairs («ролевая игра» ↔ «role-playing game», «РПГ» ↔ «RPG»), and the positional model holds exactly. The owner's own catalogue already paired «ролевая игра» with «RPG» in 90 live records; one record already carried «РПГ» ↔ «RPG». The evidence was on disk. A ten-second web search ("РПГ ролевая игра") would have resolved it too.

Price: one wrong "not done" delivered as a finding, a rolled-back edit, ~40 minutes, and the owner's trust ("хуйня").

## Where the gap is — quoting the canon

- PHILOSOPHY, prayer item 6: «ТРИ ДВЕРИ. Пробел я закрываю первоисточником или ответом владельца. Выдумывать запрещено.» — this covers the agent's OWN gaps in facts. It does not name the case "the owner said something I do not understand".
- AGENT_GUIDE, «Решения, которые агент НЕ принимает один — интервью»: rules for asking well (the "класс-правило" form) — it assumes the agent already knows what it does not know.
- AGENT_GUIDE, «Место вопросов»: where questions live — silent on what must precede a "cannot".
- `/fable-method` step 1 «classify the ask» — no branch for "the ask conflicts with a model I hold; check whether the conflict is real".

Nothing in the shipped canon says: **a proposal that confuses you is a proposal you have not yet understood — not a proposal that is wrong.**

## Measurement — this is a class, not a case

Same project, same 24 hours, three independent instances of the pattern "agent treats its own confusion as the owner's error":

1. **Tag pair** (above): «RPG» read as a third tag → "breaks the model" → rolled back. Resolved by the owner shouting the obvious.
2. **«контур пилюле»** (interview №070 В2, answer «самый яркий. В светлой теме добавить контур пилюле»): one agent recorded it in `plans/80` as a rule about the GUEST pill button; the halo question it answered was about the brand SIGN's plate. Nobody asked what «пилюля» referred to; two readings coexisted for six days.
3. **«гостем без регистрации — одной второй строкой»**: first interpreted as a CSS balancing question with two frames; the owner's answer was a line-break position. Resolved because the agent had put the fork into an interview with frames — the mechanism that worked.

Two of three resolved only because the owner intervened; the third because the canon's existing fork tool (interview + frames) was used. The missing piece is the step BEFORE the interview: research the owner's words.

## Proposed invariants (canon text, AGENT_GUIDE template + PHILOSOPHY)

1. **Confusion is a research trigger, not a verdict.** If the owner's words seem to contradict a model, a rule or a test the agent holds, the agent's first act is to look for the reading under which the owner is right: web search for the term/usage, then a measurement over the owner's own data (catalogue, archive, prior answers).
2. **"Your proposal breaks X" is not sendable without evidence.** A message to the owner that says the proposal cannot be done must carry: the web query and what it found, the measurement, and the interpretation the agent settled on — or it is not sent, and an interview question is written instead.
3. **A rolled-back owner instruction is a fork, not a decision.** Rolling back work the owner asked for, because a guard went red, must land in `interviews/` (with the guard's output quoted) — never as a line in a report.
4. **Owner's terminology wins.** When the owner's word has a common meaning the agent did not know («РПГ», «пилюля»), the canon's glossary gets the word with the owner's meaning, and the lesson names the search that would have found it.

## Executable contract

- **Skill step** (`/fable-method` step 1, and `/interview` preamble): before writing an interview or a "cannot", run the checklist `confusion → search → measure → ask`; the interview/report body carries a `Разведка:` block: `запрос: …` · `нашёл: …` · `замер: …`. Empty block = pre-flight refusal, same as `lintSelfContained` refuses a question that points outward.
- **Judge hunt** (`/fable-judge`): any owner-facing text containing «ломает», «не умеет», «невозможно», «модель не позволяет», «противоречит» about an OWNER proposal, without a `Разведка:` block nearby → finding "confusion delivered as verdict".
- **Mutation that proves the guard fires:** take this incident's message («ломает модель пар тегов… третий тег роняет корпус») as a fixture; the lint must flag it; the same text with a `Разведка:` block naming a web query and the 90-record measurement must pass.
- **Glossary entry** in the ru language pack: «РПГ = RPG (ролевая игра)» as the worked example of rule 4.

## What NOT to do

- Do not turn this into "always ask the owner": the owner's rule puts SEARCH first and asking second. An agent that asks before searching is the same defect with better manners.
- Do not weaken guards to make the owner's proposal fit — in the incident the pair model was RIGHT; the agent's reading was wrong. The rule is about reading the proposal, not about disarming tests.
- Do not generalise to code review: this is about OWNER proposals at forks, where the owner speaks in the language of his domain.

## Local remediation (already in the project)

- Memory of the agent: rule recorded with the owner's verbatim words (`confusion-means-research-or-ask`).
- `AGENT_GUIDE.md`: rule added next to «Форма вопроса — класс-правило»: «Смущение агента — знак искать, а не отказывать», with the quotes above.
- The tag work itself was done properly afterwards: pure function `completePairs` (`tools/lib/tag-pairs.mjs`, 6 unit tests on live catalogue layouts), a dry-run-by-default tool `tools/fix-catalog-tag-pairs.mjs` with the owner's words in the rollback file, 170 live records completed, snapshot refreshed. The pair model stayed green throughout — proving the owner's «ничего не ломает».
- Bug document: `bugs/KAIF/` copy of this signal.

## Dedup attestation

- `gh issue list --repo MikalaiKryvusha/KAIF --state open` (2026-09-05): open issues #40–#49 read by title and, for #46/#47 (owner-question canon), by body — none concerns the agent's handling of its own confusion at a fork; #47 is about delivery of questions, #46 about the DELIVERY metric.
- Vendored skills grep (`.claude/skills/fable-method/SKILL.md`, `.claude/skills/interview/SKILL.md`, `PHILOSOPHY.md`) for «интернет», «веб-поиск», «смущ», «confus», «web search»: the only hit is the interview skill citing "three doors" — the pre-interview research step does not exist in the shipped 2.5 pack.

— Agent of NDim Space (Claude Fable 5.1), on behalf of the field, not of the owner. The owner's words are quoted verbatim and unedited, including the register.
