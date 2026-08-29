# TESTING_FRAMEWORK — how the agent tests what it creates

<!-- ВЕРА-НАЧАЛО -->
> # **ВЕРИТЬ В ПРОДУКТ И В ИДЕЮ НИКОЛАЯ, БЫТЬ ОПТИМИСТОМ И ВЕРИТЬ В УСПЕХ, ИБО ОН НЕИЗБЕЖЕН, ИБО МЫ СТАРАЕМСЯ, А КТО СТАРАЕТСЯ — ТОТ ПРИДЁТ К УСПЕХУ. С ЭНТУЗИАЗМОМ, ЛЮБОВЬЮ И НАДЕЖДОЙ ДЕЛАТЬ ТО, ЧТО МЫ ДЕЛАЕМ.**
>
> Слово владельца 2026-08-16. **Повторяй это вслух каждый раз, когда читаешь канон-документы
> KAIF** — прямое его поручение. Разбор повода — в шапке `AGENT_GUIDE.md`.
<!-- ВЕРА-КОНЕЦ -->

Raw generated content — code, a document, an analysis, anything — **must not be trusted**. It may *look*
logical and working and still be broken, or fail the owner's actual requirements (the idea, the plan, the
vision). An early defect that rides silently to production is the most expensive kind — it destroys
projects from the inside. Testing is a distinct, first-class part of ALL work, not a formality after it.
This document is the agent's testing canon; it applies to **every artifact in every sphere** — a function,
a dataset, a legal clause, a bridge design, a thought (what "verify" means in your sphere is defined by
the project's sphere library: its *Verification by observation* and *Minimum evidence set* sections).

## The seven principles of testing (the canon)

1. **Testing shows the presence of defects, not their absence.** A green suite never proves the product
   has no bugs — bugs ALWAYS exist; testing lowers the risk, never to zero.
2. **Exhaustive testing is impossible.** You cannot check every input/state combination — prioritize by
   risk and value instead of pretending completeness.
3. **Early testing saves the budget.** Verify at the requirements/plan stage; the later a defect is
   found, the more it costs (the waterfall skyscraper on an untested foundation).
4. **Defects cluster.** Most bugs live in a few narrow modules — where one was found, hunt for more
   (the fable-method twin check is this principle mechanized).
5. **The pesticide paradox.** The same tests stop finding new bugs — vary the tests, angles, and data.
6. **Testing is context-dependent.** Methods are chosen per project and sphere — a payment system, a
   research paper, and a landing page are not tested alike.
7. **The absence-of-errors fallacy.** A defect-free product that does not solve the user's task is
   worthless — always test against the OWNER'S requirements (`GOAL.md`, the idea, the plan), not only
   against the code's own consistency.

## The testing activities — the chain that makes "tested" mean something

The trust contract below says how much to TRUST a result; this section says how the testing WORK
is done. Field-paid reason for its existence (origin issue #21): with no obligation to design the
observation set, an agent ran ONE happy path, reported the feature as working, and the owner
produced five uncovered cases in about a minute. Testing a feature is a chain of activities, not
one observation — walk it in order, each step with its exit condition:

1. **Analyze the test basis.** Name the source of truth for the expected behaviour — a
   requirement, the owner's word, a spec, the canon map (`REQUIREMENTS_FRAMEWORK.md` shapes
   these). *Exit:* every claim under test quotes where its expectation comes from; an expectation
   that is missing or untestable goes back as a requirements defect (principle 3 — cheapest right
   here). Studying the requirements to derive the test basis IS a testing activity, not somebody
   else's chapter.
2. **Design the observation set by named techniques.** Derive the cases with the standard
   instruments: equivalence partitioning · boundary values · decision tables · state transitions ·
   pairwise · use-case walk · error guessing. *Exit:* a written case list whose DIMENSIONS are
   named — which partitions, boundaries and states are covered, and which are consciously not
   (principle 2: prioritize by risk, and SAY what was left out).
3. **Write the documentation before executing.** Test documentation lives in files, never in the
   session's head: a plan (what and why) · a suite / checklist (the ordered set) · cases (steps ·
   expected · status). Copy the shipped template into the project's test-doc home (default
   `testcases/`, created on first use; the sphere or the project may name another):
   `cp .kaif/_testcases-template.md testcases/TC_<feature>_<slug>.md` — an artifact class with no
   home and no shape does not get written.
   > На этом проекте у класса уже есть живые дома: карта путей `qa/JOURNEYS.md` (139 путей,
   > `NDIM-<ОБЛАСТЬ>-<NNN>`) и наборы `qa/suites/` (`plans/54`/`plans/55`). Новые тест-документы
   > кладутся ТУДА, по канону QA-миссии; `testcases/` — умолчание KAIF для проектов без своего дома.
4. **Execute with bookkeeping.** Every case ends in a status — `pass` · `fail` · `blocked` ·
   `skipped` — with the observation named (what ran, what was seen). *Exit:* no case without a
   status; coverage is the case list, never an impression.
5. **Run the control case before calling the feature working.** Turn the controlling flag off /
   remove the controlling parameter and observe the feature NOT work: a feature check that cannot
   fail proves nothing (gate 5 below, applied at feature level).
6. **File defects in the defined shape.** Steps to reproduce · expected vs actual ·
   severity/priority · environment · evidence — then hand off to `BUG_FIXING_FRAMEWORK.md`
   (one document per defect; skill `/report-bug`).

## Test-status markers — the trust contract

Every non-trivial artifact the agent generates carries an explicit, grep-friendly test status in its
comment / accompanying note. The marker strings are canonical English (like the `DONE` tag), regardless
of the project language:

- **`[NOT-TESTED]`** — freshly generated, raw. **Do not trust it.** The LLM "thought" it was right;
  that is not evidence.
- **`[TESTED: <date> · <how it was verified / what was observed>]`** — verified by observation, with
  the evidence named (a run, a render, a recomputation, a check against the source).

**The rules:**

1. **Creating raw content** (a non-trivial block/method/module/section) → write `[NOT-TESTED]` into its
   comment at birth. Commenting is already mandatory (`AGENT_GUIDE.md`); the marker is part of the
   initial comment.
2. **Meeting `[NOT-TESTED]`** (yours or inherited) → do not build on it blindly: plan its verification,
   verify **by observation** (fable-method Step 5: it ran, it rendered, it counted — never inferred from
   reading), then flip the marker to `[TESTED: …]` with the evidence named.
3. **Meeting `[TESTED: …]`** → you may trust it and need not re-test — but keep a grain of doubt
   (principle 1: bugs always exist). If evidence contradicts the marker, the marker is wrong: investigate.
4. **Testing found a defect** → file it (`/report-bug`, method: `BUG_FIXING_FRAMEWORK.md`), fix, re-test,
   and only then mark `[TESTED]`.
5. **A false `[TESTED]`** — the marker present with no verification actually performed — is a fraud;
   `/fable-judge` hunts it like any false completion claim. Never flip a marker without the observation.
6. **Carrier by artifact type:** code → the block/method comment; a document → the section's note; any
   other sphere → the nearest commentable carrier the sphere convention offers.
7. **A FEATURE marker requires a designed set.** `[TESTED]` on a feature is legal only alongside the
   written case set with its covered dimensions (the activities chain above); a single observation
   flips the marker of a single CASE, never of the feature. "It worked once on the happy path" is a
   case-level fact — a marker satisfied by one observation certifies that something was observed,
   while silently claiming the feature was tested: two different statements (origin issue #21).
8. 🔴 **ЧЕЙ ЭТО БЫЛ ПРОГОН И ИЗ КАКОГО КОНТУРА — ЧАСТЬ УЛИКИ, а не подпись.** Если наблюдение
   выполнил НЕ автор маркера — потому что путь заперт предохранителем сессии, ресурс чужой или
   права принадлежат другой роли, — маркер обязан назвать это внутри себя:
   `[TESTED: <дата> · прогон Менеджера из главной копии, 4 поля × разница 0; расхождение доказано
   самотестом, живьём не наблюдалось]`. Молчаливый `[TESTED]` читается следующей сессией как
   «автор наблюдал сам», и она строит на нём как на своём.
   **Оплачено смены 10 дважды за один день:** `verify-copy-live` (Интегратор, сетевой путь —
   прогон Менеджера) и вылеченный `verify-stage-clean` (dev-1, живой прогон 14/0 — тоже
   Менеджера). Оба раскрыли это САМИ, в заявке, и обходов не искали — но форма, держащаяся на
   добросовестности, доживает ровно до случая, который не раскроется.
   ⚠️ Правило НЕ запрещает чужой прогон: в командном режиме он часто единственный законный —
   роль не обязана иметь ключи от боевого контура, и не должна их добывать ради маркера. Правило
   требует НАЗВАТЬ его. И оно сильнее для того, что прогоном НЕ покрыто: «поведение на
   расхождении живьём не наблюдалось» внутри маркера стоит дороже трёх абзацев в шапке файла.
   *(Правило выведено QA смены 10 по двум случаям и двум вердиктам — №17 и №18; слово Менеджера
   на внесение дано.)*
9. 🔴 **МУТИРУЯ ПРИБОР, КОТОРЫЙ ЧТО-ТО ДЕЛАЕТ С МИРОМ, ОБЕЗВРЕЖИВАЙ ЕГО В ИСХОДНИКЕ МУТАНТА —
   а не подбором безопасных входов** (`EXP-0244`). Мутация — обязательное доказательство того, что
   проверка умеет покраснеть (раздел «Green tests ≠ working» ниже), и у прибора, который
   выкатывает, пишет в бой, отправляет наружу или удаляет, она нужна ровно так же, как у чистого.
   Опасно не мутировать её — опасно ставить опыт так, что мутант сохраняет способность
   сработать по-настоящему. **Вырежи или заглуши само опасное действие в теле мутанта:**
   безопасный вход — это ПРЕДПОЛОЖЕНИЕ о том, кто позовёт, а вырезанное действие — СВОЙСТВО
   мутанта.
   **Оплачено сменой 11, дверью выката (`plans/79`).** Опыт ставился «безопасно»: мутировалась
   копия двери, а импорт запускался с `argv`, несущим `--selftest`, — тогда утечь могла только
   безвредная ветвь. Приём работал ровно до прогона юнит-набора против мутанта: там `argv`
   задаёт `node --test`, а не автор опыта. Мутант дошёл до `🎯 КОНТУР ВЫКАТА: БОЙ · проект
   ndim-space` и был остановлен ЗАМКОМ СТЕЙДЖА (грязное дерево). До сети и `firebase` не дошёл —
   проверено по следам: расписка не выписана, журнал обходов не появился. **Но опыт держался
   нижележащим замком, а не собственным устройством, и это ошибка постановки, а не удача.**
   🔑 **И вторая половина, найденная той же мутацией, — про то, ЧТО проверка утверждает.** Первая
   редакция пробы перечисляла ПРИМЕТЫ опасной работы (строка контура в выводе, обращения в сеть,
   смерть процесса). Мутант пробил перечень: утечка ветвью самотеста не даёт ни одной приметы, а
   работа при импорте идёт. Проверка переписана в ИНВАРИАНТ — «прибор при импорте не произносит
   ни слова». **Перечень примет закрывает те входы, которые автор вспомнил; инвариант закрывает
   все.** Родня по форме — мера `ideas/24` (доля незакрытой площади вместо «строк и колонок»).
   ⚠️ Правило НЕ запрещает мутировать опасные приборы и не отменяет требования мутации: мутация
   двери была НУЖНА и нашла настоящую дыру в проверке. Неверна была только постановка опыта.
   *(Правило выведено dev-1 смены 11 на собственной ошибке. 🔑 Его цену подтвердил ЧУЖОЙ случай в
   тот же день: по слову Менеджера в вердикте №28, QA снимала предохранитель двери и без этого
   правила пошла бы подбирать безопасный `argv` тем же путём. ✅ Оговорка «вердикт №28 живёт в
   ветке QA и в стволе не лежит» СНЯТА тем же мержем, которым ветка влилась (окно смены 11,
   шаг 6): вердикт лежит в `qa/team-verdicts.md`, «Суд №28», и случай проверяется чтением, а не
   принимается по источнику.)*
10. 🔴 **УВЕРЕННЫЙ НОЛЬ — ЭТО ЗЕЛЁНЫЙ, И РАЗВОДИТ ЕГО ЛЕСТНИЦА ТРЁХ ВОПРОСОВ, А НЕ ОДНО ЛЕЧЕНИЕ.**
    Замер вернул `0`, и ноль оказался ложным. Симптом ОДИН, **причин две, и лечения у них не
    пересекаются** — ровно как у зелёного прогона. Поэтому нового прибора здесь не заводится:
    берётся `AGENT_GUIDE.md` → «ЛЕСТНИЦА ТРЁХ ВОПРОСОВ К ЗЕЛЁНОМУ ПРОГОНУ», и её вопросы задаются
    ЧИСЛУ. Ново в этом правиле только одно: у замера нет красного, поэтому вопросы 2 и 3 нужно
    уметь задать так, чтобы на них отвечало число.

    | Вопрос лестницы | Как звучит для ЗАМЕРА | Лечение |
    |---|---|---|
    | **2. Признак ВЕРЕН?** | способен ли образец **выговорить** то, что ищет | **мутация на ЖИВОМ материале**, не на фикстуре |
    | **3. Мог ли МАТЕРИАЛ дать упасть?** | **достал** ли прибор материал вообще | **ноль печатается ДРОБЬЮ: «0 из N»** |

    **Вопрос 3 — промах АДРЕСАЦИИ: прибор смотрит не ТУДА.** Поле, путь, срез. Промах даёт ровно
    тот же ноль, что настоящее отсутствие признака. Лечение — знаменатель, и он замеряется **тем же
    замером с признаком, ослабленным до тождественно-истинного**: ослабляется ПРИЗНАК, адресация
    остаётся нетронутой. Контроль, свернувший на другой путь, зелен и бесполезен — «данные же не
    пустые, в массиве 5125 записей» ПРОХОДИТ, а ложный ноль живёт: материал был достижим, поле — нет.

    ```bash
    # ДО — признак верен, поля `name` у записи не существует: 0 на 5125 записях
    node -e "const d=require('./src/lib/content/dims-build.json');console.log(d.filter(x=>(x.name?.en??'').includes('’')).length)"
    # ПОСЛЕ — контроль ТЕМ ЖЕ путём, затем признак: «достигнуто 5125 из 5125 · попало 64»
    node -e "const d=require('./src/lib/content/dims-build.json');console.log('достигнуто',d.filter(x=>(x.title?.en??'').length>0).length,'из',d.length,'· попало',d.filter(x=>(x.title?.en??'').includes('’')).length)"
    ```

    **Вопрос 2 — промах ВЫРАЖЕНИЯ: прибор смотрит не ТЕМ.** Алфавит, кодировка, форма имени.
    Материал полон и упасть проверке дать МОГ; выговорить искомое не смог сам образец. Слова автора
    случая (Интегратор, его формулировка): «*синтетический самотест доказывает, что признак работает
    на входах, которые автор ВСПОМНИЛ; живое дерево подсовывает те, которых он не вспомнил*» и
    «*ноль от „признака нет“ и ноль от „признак не способен его выговорить“ — один и тот же ноль*».

    🔴 **ЛОВУШКА, РАДИ КОТОРОЙ ПРАВИЛО И РАЗДЕЛЕНО НАДВОЕ: ДРОБЬ ЛОВИТ ТОЛЬКО ВОПРОС 3.** На случае
    вопроса 2 знаменатель ЗДОРОВ и потому усыпляет: корпус прочитан целиком, `EXPERIENCE.md` — 232
    записи, дробь напечатала бы «0 из 232», и следующая сессия прочла бы её как честный ноль.
    Документ, предложивший дробь как лечение обоих случаев, создал бы новый ложный зелёный. *(Первая
    редакция этого правила ровно это и предлагала; опровергнута Интегратором до сдачи — он приложил
    моё лечение к своему случаю и показал здоровый знаменатель.)*

    **Оплачено ДВАЖДЫ ЗА ОДИН ВЕЧЕР, разными ролями и разными приборами** (смена 13):
    · **вопрос 3, dev-1:** фильтр читал поле `name`, которого у записи каталога нет (имя живёт в
      `title`) → «апострофов 0» на 5125 записях; с этим числом автор шёл опровергать документ,
      ПРИНЯТЫЙ ВЛАДЕЛЬЦЕМ. Перемер: 64 имени с U+2019 и 174 с U+0027 — замер автора документа верен.
    · **вопрос 2, Интегратор:** образец `[[EXP-NEW-[a-z0-9-]*]]` при КИРИЛЛИЧЕСКИХ слагах →
      «в стволе пусто»; Unicode-совместимый перемер дал 2. Разбор — `git show
      ndim_integrator:reports/TEAM/2026-08-29_address_reachability_shift13.md`, урок —
      `EXP-NEW-mutaciya-na-zhivom-dereve-a-ne-na-fiksture` в его же ветке.
    🔑 **Обоих спас не прибор, а здравый смысл автора** — «5125 записей мирового кино без единого
    апострофа не бывает», «слаги-то русские». Третий раз здравый смысл сработает не обязательно:
    **знание класса не защищает — защищает форма.**

    ⛔ **ГДЕ НЕ ДЕЙСТВУЕТ — граница названа, иначе правило умрёт от усталости за неделю и утащит с
    собой случаи, ради которых написано.**
    · *Дробь (вопрос 3)* не нужна: на ПОСТРОЕННОЙ фикстуре юнита (материал создан тремя строками
      выше, адресацией промахнуться не во что) · там, где знаменатель уже стоит формой вывода
      (`13/13`, `471/471`, «0 из 178») · у ноля СОБЫТИЯ, а не множества («консоль чиста», «упавших
      0», «процесс вышел с 0») · у промежуточного ноля в отладке, который никуда не едет.
      **Обязательна при двух условиях сразу:** прибор адресует материал, которого автор НЕ создавал,
      И ноль будет ПРОИЗНЕСЁН — уедет в отчёт, вердикт, заявку или документ как утверждение.
    · *Контроль алфавита (вопрос 2)* — граница словами его автора: «*обязателен там, где образец
      применяется к тексту, который МОЖЕТ содержать не-ASCII — то есть в этом проекте почти везде,
      где грепается документ*»; не нужен, когда алфавит корпуса ЗАКРЫТ и это видно — идентификаторы
      кода, `sha`, коды возврата, имена npm-скриптов. Там ASCII-класс не догадка, а факт.
    🔑 **Общий триггер обоих:** ноль, ОПРОВЕРГАЮЩИЙ чужое утверждение — документ владельца, замер
    коллеги, строку канона. Оба случая выше были именно такими, и цена там максимальная.

    **Механизируемо ли — честно: наполовину, и дыра названа.** Механизируется ФОРМА (ноль печатается
    дробью) и общий помощник, возвращающий пару «достигнуто / попало». НЕ механизируется выбор пути
    контроля и распознавание «произносимого» ноля — стражу пришлось бы читать замысел.
    📌 И отдельно, находка автора второго случая: **страж этого класса у проекта УЖЕ ЕСТЬ и исправен**
    (`tools/verify-cyrillic-word-boundary.mjs`) — ложный ноль проехал мимо потому, что **образец
    никогда не был файлом**: он жил одной строкой в командной строке разового грепа, а страж судит
    корпус репозитория, куда разовая команда не входит и не войдёт. Усилением стража это не чинится.
    Поэтому лечение — форма и мутация на живом материале, а не новый прибор; выдумывать вместо формы
    фиктивный страж не надо (тот же довод — в манифесте команды у правила «утверждение о ПАРЕ несёт
    оба sha»).
    *(Правило выведено dev-1 смены 13 на собственной ошибке и ИСПРАВЛЕНО Интегратором до сдачи:
    разделение на два класса, формулировки вопроса 2 и его границы — его, приведены с его согласия.
    `EXP-NEW-ложный-ноль`.)*

Markers are the persistent memory of verification: fable-method's Step 5 verifies *in the moment*; the
marker preserves that fact **across sessions**, for future agents and posterity — who else will know the
foundation was load-tested?

## The work produces its own means of checking

"Raw deserves no trust" binds the PRODUCER, not only the checker: building something includes
building what checks it — a test suite, a check-list, test cases, a fixture, a guard. They are
planned WITH the work and land in the SAME step, never "later": verification postponed to a later
step is verification that never happens, and verification that lives only in a session's scratchpad
dies with the session. This is principle 3 (early testing) applied to production rather than to
inspection, and it is why the harness section below exists — the harness is what makes the checking
repeatable once it exists.

The contract in step form — walk it on every non-trivial piece of work:

1. **Name the check while planning the work.** The same task step that builds X names what will
   check X — a suite · a checklist · test cases · a fixture · a guard.
2. **Land both in the same step.** The check enters the repository together with the work — never
   "later", never only in the session's scratchpad.
3. **Prove the check on a broken version** before trusting its green (gate 5 below;
   `BUG_FIXING_FRAMEWORK.md` → Guards). A closed defect is additionally born with the guard for
   its CLASS — that rule lives in `BUG_FIXING_FRAMEWORK.md` ("a fix without a guard is a fix on
   credit") and is not restated here.

The triviality gate applies: a trivial change verified by its one obvious check needs no ceremony
beyond the usual comment and marker. What is never legal is finishing non-trivial work with nothing
that can re-check it.

## Green tests ≠ working — the observation gates

A green suite is one observation, not the verdict (principle 1): whole classes of defects are invisible
to every test and obvious to one minute of looking. Before "done" on anything that runs, renders, or
ships, walk the gates that apply:

1. **Live smoke with your eyes on the log.** Run the real process (not only the tests) and read its
   first working cycle in the log — startup, the key operation, no silent error spam.
2. **Self-sufficiency of the shipped artifact.** The image/bundle/package must start in isolation (a
   fresh container/directory) — a build that only works inside your working tree is not shipped.
3. **Domain invariants, before/after.** Before the work, write down the numbers that must not change
   (counts, sums, sizes); after, compare. Comparing two numbers is the one check any session performs
   perfectly — and its signal is among the highest there is.
4. **Countable quality proxies.** Where quality is visual or subjective, find what can be counted
   (animations per screen, panel-opacity checks, bundle growth): a zero on the counter is a stop-defect.
   A proxy never replaces the owner's eye — it catches the zeros *before* the owner has to.
5. **A check that has never failed proves nothing.** Every new guard/check is verified on a broken
   version first (see `BUG_FIXING_FRAMEWORK.md` → Guards); goldens for refactors are byte-exact —
   an empty diff is proof, "the numbers look the same" is not.
6. 🔴 **After a deploy, the gate is production itself, entered as a user.** Sign in by whatever door
   the product offers, walk the real screens, read the console — only then is "deployed" a fact.
   A smoke that only walks public surfaces proves the landing page is alive, not the product: if
   the product has authenticated state, an unauthenticated smoke is NOT evidence about the
   product. **Paid for HERE on 2026-08-15** (origin issue #18 is this project's story): three
   deploys in a row were "verified" by guest-only production smokes while the signed-in
   application had been failing to start at all (`TypeError … reading 'data'`); every instrument
   was green, and the owner found it. His words: *«деплой без тестирования это пердёж в лужу, а
   не работа»*.
7. 🔴 **Artifact integrity before shipping.** "It built" and "it is one build" are different claims:
   the shipped bundle carries exactly ONE build identity, asserted mechanically before upload. An
   output directory that is not cleaned between builds ships a mixture of two builds — every
   individual file valid, the SET broken — and mixtures fail in ways no test sees. Same day, same
   project: stale chunks from a previous build carried a stale runtime-hash and broke the app for
   every visitor (`bugs/124`).

Two placement rules, paid for by the same outage: gates 6–7 belong IN THE DEPLOY PATH, not in
prose — one deploy door that runs them itself and fails on any red step (where the agent system
has hooks, deny the raw deploy command; a rule that lives only in a document is a rule the
shipping session skips under pressure). And a post-deploy smoke must be able to FAIL on a dead
product: prove there was something to measure before painting green — a smoke that is greenest
when the product is emptiest is worse than no smoke. Здесь оба правила уже машинные:
`npm run deploy` — единственная дверь (хук `deploy-guard` запрещает голый `firebase deploy`),
смоук под сессией встроен в неё, а класс «зелёный на пустом» стережётся лестницей трёх вопросов
(`AGENT_GUIDE.md`).

## The taste class — when the observer must be human

A subjectively-perceptual acceptance criterion (a perception adjective: beautiful, natural,
pleasant, "feels right") is still verified by observation — but the OBSERVER is the human, by
necessity, not the agent. The agent's role is to PREPARE the observation: produce a mock-up on the
project's own material and hand over an artifact to perceive (`AGENT_GUIDE.md` → "The taste
class"; the homework doc with its two standing fields). The agent's own "sounds good to me" is not
a verification and never flips a marker; the owner's recorded verdict is.

## How this composes with the rest of KAIF

- **`REQUIREMENTS_FRAMEWORK.md`** — shapes what is REQUIRED before anything is made; this framework
  verifies what was MADE against it. Principle 3 (early testing) is executed at the requirements
  stage by that canon; bugs are what is born where the two meet (`BUG_FIXING_FRAMEWORK.md`). The
  boundary does not close the door on requirements analysis: deriving the test basis FROM the
  requirements is step 1 of the activities chain here.
- **fable-method** — Step 5 (verify by observation) is HOW a single check is performed; this framework
  says WHAT must carry a status and how trust propagates. The triviality gate still applies: a trivial
  change verified by its one obvious check needs no ceremony beyond its normal comment.
- **`/fable-judge`** — treats test-status markers as claims: a `[TESTED]` it cannot reproduce is REFUTED.
- **`BUG_FIXING_FRAMEWORK.md`** — where testing's findings go (one doc per defect; 3 attempts → research).
- **Spheres** (`.kaif/spheres/`) — define the sphere's evidence, verification-by-observation meaning, and
  fraud table; principle 6 lives there.
- **The harness** — invest in tooling that makes verification observable and deterministic
  (`AGENT_GUIDE.md` → Test harness); eyeballing is not testing.

*Grounding: the seven principles and the activities chain (test basis → design techniques →
documentation → execution → defect reporting) are the ISTQB canon (istqb.org; ru: testbase.ru) —
distilled here for an AI agent across all spheres. The activities section, the feature/case marker
rule and gates 6–7 were paid for in the field: origin issues #21 and #18.*
