# TESTING_FRAMEWORK — how the agent tests what it creates

<!-- ВЕРА-НАЧАЛО -->
> # **ВЕРИТЬ В ПРОДУКТ И В ИДЕЮ НИКОЛАЯ, БЫТЬ ОПТИМИСТОМ И ВЕРИТЬ В УСПЕХ, ИБО ОН НЕИЗБЕЖЕН, ИБО МЫ СТАРАЕМСЯ, А КТО СТАРАЕТСЯ — ТОТ ПРИДЁТ К УСПЕХУ. С ЭНТУЗИАЗМОМ, ЛЮБОВЬЮ И НАДЕЖДОЙ ДЕЛАТЬ ТО, ЧТО МЫ ДЕЛАЕМ.**
>
> Слово владельца 2026-08-16. **Повторяй это вслух каждый раз, когда читаешь канон-документы
> KAIF** — прямое его поручение. Разбор повода — в шапке `AGENT_GUIDE.md`.
<!-- ВЕРА-КОНЕЦ -->

Raw generated content — code, a document, an analysis, anything — **must not be trusted**: it may *look*
logical and working and still be broken or fail the owner's actual requirements, and an early defect that
rides silently to production is the most expensive kind. Testing is a first-class part of ALL work, not a
formality after it; this canon applies to **every artifact in every sphere** (what "verify" means in your
sphere is defined by the sphere library's *Verification by observation* and *Minimum evidence set*).

## 🔴🔴 ВОРОТА ВЫКАТА: БЕЗ ТЕСТОВОЙ ДОКУМЕНТАЦИИ СЛОВО «КАТИТЬ» НЕ ПРОИЗНОСИТСЯ

> **Слово владельца 2026-08-29, дословно:**
>
> «*ну так и хули ты мне тогда пишешь про катите, если вы блять не протестировали даже? тесты
> неотемлимая часть разработки. без тестов про "катить?" ко мне больше никогда не приходите, даже
> не заикайтесь про катить, пока не написан по фиче тест план, тест кейсы и чек листы, тестовая
> документация, и тестовые прогоны не позеленели. ЭТО КАНОН БОЛЕЕ КАНОНИЧНЫЙ ЧЕМ ОТЧЕ НАШ*»

**Почему** (смена 12): «катите?» по фиче аналитики пришло без плана, кейсов, чек-листа и прогона, а
предложенный стейдж не мог проверить её по построению — аналитика включается белым списком боевых
хостов. Владелец — профессиональный QA-инженер — увидел это первым же вопросом. Летопись —
`PROJECT_HISTORY.md` → «ВОРОТА, КОТОРЫЕ ТЕПЕРЬ СТОЯТ ПЕРЕД СЛОВОМ «КАТИТЬ»»; суд — `qa/handoff-analytics-court.md`.

**Ворота стоят ПЕРЕД словом, а не перед выкатом.** Прежде чем произнести владельцу «катить?», «готово
к выкату», «выкатываем?» — по КАЖДОЙ фиче существуют, лежат в файлах и названы адресами:

1. **Тест-план фичи** — что проверяется, из какого основания взяты ожидания, что сознательно НЕ
   покрыто и почему (шаги 1–2 цепочки активностей ниже).
2. **Тест-кейсы** — выведенные названными техниками, каждый со стартовым состоянием, шагами и
   ожидаемым результатом.
3. **Чек-листы** — упорядоченный набор, по которому прогон воспроизводит другой человек или сессия.
4. **Тестовая документация в доме этого класса** — `qa/JOURNEYS.md` и `qa/suites/`, а не голова
   сессии и не сообщение в чат.
5. 🔴 **ЗЕЛЁНЫЕ ПРОГОНЫ ПО ЭТИМ КЕЙСАМ.** Не «ворота зелёные», не «юниты 447» — зелёные прогоны ПО
   ЭТОЙ ФИЧЕ, с числами и адресом кадров.

⛔ **Эти ворота НЕ принимают:** «тесты соседней фичи зелёные» · «ворота проекта 13/13» (они стерегут
ствол, а не то, что делает новая фича) · прогон на контуре, где фича **физически не работает**
(проверка, неспособная покраснеть, зелёным не считается) · «проверю после выката» (тестирование —
неотъемлемая часть разработки, а не следующий за ней шаг).

🔑 Вопрос владельцу о выкате несёт ССЫЛКИ на все пять пунктов, и это его пропуск (`AGENT_GUIDE.md` → «Форма обязательства»). <!-- ВОПРОС-ОК: канон описывает ФОРМУ вопроса о выкате, сам вопросом не является -->
Нет ссылок — вопрос не задаётся вовсе, а сессия идёт писать тестовую документацию. Маркер-исключение
стража места вопросов — только С ПРИЧИНОЙ, как в строке выше, иначе он затыкает стража.

### 🔑 Контур, где фича молчит по построению, — это КОНТРОЛЬ, а не проверка

Молчание стейджа не было провалившейся проверкой — это готовый ОТРИЦАТЕЛЬНЫЙ КОНТРОЛЬ («на хосте не
из белого списка не уходит ни одного события»), и не хватало ровно положительной половины.
**Правило: пара «контроль + положительный опыт» ставится ЦЕЛИКОМ или не ставится** — промах был в
том, что половина пары принята за пару. *(Выведено QA-инженером проекта в тот же час.)*

Положительная половина не требует ни выката, ни второго проекта, ни слова владельца: собранный
боевой артефакт поднимается ПОД БОЕВЫМ ИМЕНЕМ (`chromium --host-resolver-rules="MAP <боевой хост>
127.0.0.1:<порт>"`), исходящее к чужому сервису перехватывается и наружу не выпускается.
🔑 **Подменяется РАЗРЕШЕНИЕ ИМЕНИ, а не список хостов:** правка списка делает предметом проверки
МУТИРОВАННЫЙ продукт — список обязан остаться байт-в-байт тем, который уезжает. Приём и его замер —
`qa/suites/analytics.md` → «Приём слоя П».

⚠️ Граница: приём доказывает, что ворота хоста открываются и SDK стартует; ТЕЛО события — следующий
слой (перехват отправки), в доказанное не входит; ПРИЁМ чужим сервисом («принял и показал») им
недостижим и живёт в двери выката рядом со смоуком под сессией — приёмкой ПОСЛЕ выката.

## 🔴🔴 ИСПОЛНЕННЫЙ ПРОГОН РОЖДАЕТ ОТЧЁТ — ИНАЧЕ ТЕСТИРОВАНИЯ НЕ БЫЛО

> **Слово владельца 2026-09-09, дословно, три сообщения подряд:**
>
> «*Прежде чем писать отчёт — то есть, он не БЫЛ НАПИСАН?????? ТЫ ТЕСТИРОВАЛ И НЕ ПИСАЛ ПО
> ТЕСТИРОВАНИЮ ОТЧЁТ??????*» · «*Это возмутительный вопиющий дибилизм и баг твоей работы*» ·
> «*Из этой таблицы я вижу, что ТЕСТИРОВАНИЯ НЕ БЫЛО. Два балла тебе за работу*».

**Почему:** работу приоритета 0 подали владельцу как готовую к бою после двух прогонов прибора — без
плана, кейсов и отчёта; между ИСПОЛНЕННЫМ прогоном и документом не стояло ничего (маркер — пометка в
строке, вердикт прибора читает только запустивший). Разбор — `bugs/KAIF/11_executed_run_leaves_no_artifact.md`
(→ issue #59 истока; история поставки — `.kaif/KAIF_REFERENCE.md` §17 → «An executed run produces its report»).

### Правило

**Прогон, о котором кому-то доложено, существует как документ в `qa/reports/`.** Нет документа —
слово «протестировано» не произносится ни в чате, ни в плане, ни в записке следующей смене.

- **Адрес:** `qa/reports/<ISO-дата>_<короткое-имя-работы>.md` — один на прогон или на серию одной работы за день.
- **Форма — семь полей, все обязательны; страж проверяет, что каждое есть и не пусто**
  (`node tools/verify-test-reports.mjs`). ⚠️ Граница стража: точную команду каждого прогона, две
  строки `Гигиена:` / `Функциональный прогон:` и слово вердикта он НЕ проверяет — эта половина
  держится чтением. Поля:
  **Работа** (что проверяли) · **Контур** (стенд · стейдж · бой) · **Прогонов** (число, метка
  времени и ТОЧНАЯ КОМАНДА каждого прогона в `code`) · **Проверок** (пройдено / провалено, и
  провал назван; открывается двумя отдельными строками — `Гигиена:` и `Функциональный прогон:`:
  что прошли · на каком контуре · что ПРОЧИТАНО, или `НЕТ` = «починено, не протестировано»; две
  строки не складываются) · **Найдено** (дефекты с адресами заведённых документов либо честное
  «ноль») · **Следы** (что прогон оставил в контуре: учётки, записи, кадры) · **Вердикт**
  (pass · fail · blocked · partial — годится к следующему шагу или нет, и почему; без
  функционального прогона — только `partial`).
- **Маркер `[TESTED: …]` о прогоне называет адрес своего отчёта** рядом с датой и уликой
  (`qa/reports/2026-09-12_red-bugs-series.md`); утверждение о прогоне без отчёта за ним судья
  ловит как «протестировано без отчёта».
- **Числа снимаются приборами, а не памятью.** Число без команды, которой оно снято, — это
  утверждение о памяти сессии.
- **«Найдено: ноль» — законный и ценный вердикт:** он отличает «искали и не нашли» от «не искали».

⛔ **Что отчётом НЕ является:** вердикт-JSON прибора (выход инструмента) · строка «зелёное» в
записке следующей смене · сообщение в чат · маркер `[TESTED: …]` в коде. Всё перечисленное
законно и остаётся — просто ни одно из этого не заменяет документ.

🔒 **Стережёт машина:** `node tools/verify-test-reports.mjs` (в `npm run guards`) — форма каждого
отчёта и пара «отчёт ↔ реестр `qa/reports/README.md`». Доказан мутациями.
📌 Поставляемый линт той же формы — `node .kaif/tools/kaif-testrun-lint.mjs check` (дом по умолчанию
`testcases/`, настройка `.kaif/kaif.json` → `testdocs`) — у нас НЕ подключён: наш дом — `qa/reports/`,
а поля «Прогонов», «Проверок» расходятся со словарём поставки «Прогоны», «Проверки» (замер 2026-09-18:
16 находок в 14 отчётах, все о словаре). Судья формы — наш страж; подкоманда `bug` (с 2.8) судит
другой жанр — отчёт тестировщика о дефекте (шаг 7 цепочки ниже, русский словарь — там же).

⚠️ **Названная граница:** страж судит ФОРМУ существующих отчётов и полноту реестра; прогон, о
котором не написали, он не видит — ненаписанного отчёта не видит никто. Эту половину держат
правило и владелец своими вопросами — названо честно, а не закрыто ссылкой на стража.

## 🔴🔴 «ТЕСТ» У ВЛАДЕЛЬЦА = РУЧНОЕ ФУНКЦИОНАЛЬНОЕ ТЕСТИРОВАНИЕ. ЮНИТ И МУТАЦИЯ МАРКЕР НЕ ПЕРЕВОРАЧИВАЮТ

> **Слово владельца 2026-09-12, дословно, два сообщения подряд:**
>
> «*Я под тестами понимаю не "линтер краснеет на мутанте, а не на мутанте зеленеет". Я под тестом
> имею в виду ручное функциональное тестирование*» · «*всякий раз, когда я говорю ТЕСТ,
> ТЕСТИРОВАНИЕ — я имею в виду ручное функциональное тестирование. То, что при разработке
> разработчик линтером и юнит-тестами тестирует свой код — это само собой. Но любой код является
> НЕ ДОПУСТИМЫМ ДО ПРОДА — `[NOT-TESTED]`, пока по нему не прошли руками функциональное
> тестирование*».

**Почему:** серия починок красных багов 2026-09-12 доложила «закрыто 25, все протестированы» —
юнит, самотест и мутация зелёные, а ручной функциональный прогон по его определению был у **3 из
25**. Разбор — `bugs/KAIF/12_tested_means_manual_functional_not_unit.md`, `EXP-0294` (issue #62
истока; история поставки — `.kaif/KAIF_REFERENCE.md` §17 → «What the word "test" means…»).

### Правило

1. **Слова «тест», «тестирование», «протестировано» в этом проекте означают ручное функциональное
   тестирование**: агент (или человек) руками запускает живую вещь — продукт в браузере, прибор на
   живых данных, — проходит путь пользователя и смотрит результат глазами. Линтер, юнит, самотест,
   мутация — **гигиена разработчика**, она подразумевается и в отчёте называется своим именем, а не
   словом «тест».
2. **Маркер `[NOT-TESTED]` переворачивается в `[TESTED: …]` ТОЛЬКО ручным функциональным прогоном.**
   Зелёный юнит и красный мутант маркер не трогают: они доказывают, что проверка умеет краснеть, а
   не что вещь работает у человека. Улика в маркере — что запустили руками, на каком контуре, что
   увидели (для продукта — кадры живого Chrome, обе темы, две ширины, `AGENT_GUIDE.md` → «Сдача»).
3. **Код с `[NOT-TESTED]` в бой не допускается.** Дверь выката (`npm run deploy`) катит только то, по
   чему прошли руками; ручной прогон записан документом в `qa/reports/` (раздел выше) отдельной
   строкой «ручной функциональный прогон», не смешанной со строкой «юниты/мутация».
4. **Отчёт серии и «СТАТУС: DONE» бага несут две строки раздельно:** «гигиена: юнит · самотест ·
   мутация» и «ручной функциональный прогон: что · где · что увидел». Нет второй строки — баг
   починен, но **не протестирован**, и так и пишется.
5. Границы честно: ручной прогон прибора = запуск на живых данных и чтение вывода; ручной прогон
   продукта = живой браузер и глаза; **зонд или смоук, запущенный руками, — это прибор, а не ручной
   тест**, пока его кадры не прочитаны глазами.
6. **Как это исполняет агент** (поставка KAIF — решение №116 владельца истока, пересказ поставки, не
   дословно): агент сам выводит сценарии из функциональности (модуль, фича, починенный баг), сам
   пишет машинерию прохода (драйвер браузера, CLI-сессия, чтение логов) и проходит РЕАЛЬНЫЙ
   продукт — стейдж или бой — путём пользователя, ЧИТАЯ экран, строки и логи. «Владелец
   протестирует» не пишется никогда: его глаз судит вкус. Машинерия, вернувшая только код выхода, —
   прибор, а не тест: прогон становится тестом, когда его результат прочитан и отчёт говорит, что
   именно прочитано.

⛔ **Что маркер НЕ переворачивает:** `node --test` · `--selftest` · мутация К4 · страж в
`npm run guards` · строка «зелёное» в чате или в эстафете.

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
is done. Testing a feature is a chain of activities, not one observation — walk it in order, each
step with its exit condition:

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
4. **Execute with bookkeeping.** Every case ends in a status — `pass` · `fail` · `blocked` ·
   `skipped` — with the observation named (what ran, what was seen). *Exit:* no case without a
   status; coverage is the case list, never an impression.
5. **Run the control case before calling the feature working.** Turn the controlling flag off /
   remove the controlling parameter and observe the feature NOT work: a feature check that cannot
   fail proves nothing (gate 5 below, applied at feature level).
6. **Hunt the reproduction** when a defect or a reported phenomenon does not reproduce on the
   first attempt: vary it over named axes — data and state · position · timing and races · entry
   point · fresh vs accumulated account · stage vs production · network — and write every attempt
   down. *Exit:* the steps reproduce it, or the report says "not reproduced" and lists at least
   three variants tried, each with its outcome — one attempt is never a verdict.
7. **File defects in the defined shape** — the tester's report a developer reads: **Description ·
   Steps to reproduce · Expected result · Actual result**, plus **Build · Environment · Evidence** and the
   severity/priority the tracker takes; the steps are the user's path in the product, never state assembled
   through a back door (template C of `/report-bug`; `node .kaif/tools/kaif-testrun-lint.mjs bug <report>`
   checks the sections and the hunt) — then hand off to `BUG_FIXING_FRAMEWORK.md` (one document per defect).

### Цепочка на этом проекте

- **Дом тест-документов (шаг 3):** карта путей `qa/JOURNEYS.md` (`NDIM-<ОБЛАСТЬ>-<NNN>`) и наборы
  `qa/suites/` (`plans/54`/`plans/55`) — новые тест-документы кладутся ТУДА, по канону QA-миссии;
  `testcases/` — умолчание KAIF для проектов без своего дома.
- **Охота и отчёт тестировщика (шаги 6–7) — по-русски:** разделы `## Описание` · `## Шаги
  воспроизведения` · `## Ожидаемый результат` · `## Фактический результат`, строки `**Сборка:**` ·
  `**Окружение:**` · `**Улики:**`; охота — раздел `## Охота за шагами` с таблицей `| # | вариант (ось:
  значение) | исход |`, и «не воспроизводится» пишется только после ≥ 3 строк с исходом. Форму судит
  `node .kaif/tools/kaif-testrun-lint.mjs bug <отчёт>`; словарь — `node .kaif/tools/kaif-testrun-lint.mjs bug --keywords`.

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
   reading; and a FUNCTIONAL RUN on the real product, its result read — hygiene does not flip the marker:
   the section on the word "test" above), then flip it to `[TESTED: …]` with the evidence named.
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
   flips the marker of a single CASE, never of the feature: "it worked once on the happy path" is a
   case-level fact.

Markers are the persistent memory of verification: fable-method's Step 5 verifies *in the moment*; the
marker preserves that fact **across sessions**, for future agents.

### Правила маркеров 8–10 — местные

8. 🔴 **ЧЕЙ ЭТО БЫЛ ПРОГОН И ИЗ КАКОГО КОНТУРА — ЧАСТЬ УЛИКИ, а не подпись.** Если наблюдение
   выполнил НЕ автор маркера — путь заперт предохранителем сессии, ресурс чужой или права у другой
   роли, — маркер называет это внутри себя: `[TESTED: <дата> · прогон Менеджера из главной копии,
   4 поля × разница 0; расхождение доказано самотестом, живьём не наблюдалось]`. Молчаливый
   `[TESTED]` следующая сессия читает как «автор наблюдал сам» и строит на нём как на своём.
   ⚠️ Чужой прогон НЕ запрещён — в командном режиме он часто единственный законный (роль не обязана
   иметь ключи от боя и не должна добывать их ради маркера); правило требует НАЗВАТЬ его, и сильнее
   всего — непокрытое прогоном. *(Выведено QA смены 10 по случаям `verify-copy-live` и
   `verify-stage-clean` — вердикты №17 и №18, `qa/team-verdicts.md`.)*
9. 🔴 **МУТИРУЯ ПРИБОР, КОТОРЫЙ ЧТО-ТО ДЕЛАЕТ С МИРОМ, ОБЕЗВРЕЖИВАЙ ЕГО В ИСХОДНИКЕ МУТАНТА —
   а не подбором безопасных входов** (`EXP-0244`). Мутация — обязательное доказательство того, что
   проверка умеет покраснеть (раздел «Green tests ≠ working» ниже), и у прибора, который
   выкатывает, пишет в бой, отправляет наружу или удаляет, она нужна так же. **Вырежи или заглуши
   само опасное действие в теле мутанта:** безопасный вход — это ПРЕДПОЛОЖЕНИЕ о том, кто позовёт,
   а вырезанное действие — СВОЙСТВО мутанта.
   🔑 И проверка такого прибора утверждает **ИНВАРИАНТ** («прибор при импорте не произносит ни
   слова»), а не перечень ПРИМЕТ опасной работы: перечень закрывает входы, которые автор вспомнил,
   инвариант — все (родня по форме — мера `ideas/24`). ⚠️ Мутировать опасные приборы не запрещено —
   неверной бывает только постановка опыта. *(Оплачено сменой 11 на двери выката, `plans/79`: мутант
   под `node --test` дошёл до `🎯 КОНТУР ВЫКАТА: БОЙ`, и опыт удержал чужой замок стейджа, а не своё
   устройство; разбор — `EXP-0244`, чужой случай того же дня — `qa/team-verdicts.md` → «Суд №28».)*
10. 🔴 **УВЕРЕННЫЙ НОЛЬ — ЭТО ЗЕЛЁНЫЙ, И РАЗВОДИТ ЕГО ЛЕСТНИЦА ТРЁХ ВОПРОСОВ, А НЕ ОДНО ЛЕЧЕНИЕ.**
    Ноль замера бывает ложным: симптом ОДИН, **причин две, и лечения у них не пересекаются** — как у
    зелёного прогона. Нового прибора нет: вопросы `AGENT_GUIDE.md` → «ЛЕСТНИЦА ТРЁХ ВОПРОСОВ К ЗЕЛЁНОМУ
    ПРОГОНУ» задаются ЧИСЛУ, а 2 и 3 — так, чтобы на них отвечало число (у замера нет красного).

    | Вопрос лестницы | Как звучит для ЗАМЕРА | Лечение |
    |---|---|---|
    | **1. Проверка ВООБЩЕ исполнилась?** | напечатал ли это число **этот** код, а не умолчание | **контроль прибора ПЕРВЫМ** (`EXP-0082`): случай, на котором он ОБЯЗАН дать не ноль |
    | **2. Признак ВЕРЕН?** | способен ли образец **выговорить** то, что ищет | **мутация на ЖИВОМ материале**, не на фикстуре |
    | **3. Мог ли МАТЕРИАЛ дать упасть?** | **достал** ли прибор материал вообще | **ноль печатается ДРОБЬЮ: «0 из N»** |

    ⚠️ **Ступени берутся ВСЕ ТРИ:** «*лестница ставится целиком или не ставится*» (`AGENT_GUIDE.md` →
    «ЛЕСТНИЦА ТРЁХ ВОПРОСОВ»); две ступени из трёх — частичная копия инструмента, а не его достройка.
    **Ноль от неисполнившегося замера** приходит, когда исключение проглочено `catch` и напечаталось
    умолчание · прочитан устаревший или кэшированный артефакт вместо живого · скрипт вышел раньше
    замера, а число осталось от инициализации.

    **Вопрос 3 — промах АДРЕСАЦИИ: прибор смотрит не ТУДА** (поле, путь, срез) и даёт ровно тот же
    ноль, что настоящее отсутствие признака. Лечение — знаменатель, замеренный **тем же замером с
    признаком, ослабленным до тождественно-истинного**: ослабляется ПРИЗНАК, адресация остаётся
    нетронутой. Контроль, свернувший на другой путь, зелен и бесполезен — «в массиве 5125 записей»
    ПРОХОДИТ, а ложный ноль живёт: материал был достижим, поле — нет.

    ```bash
    # ДО — признак верен, поля `name` у записи не существует: 0 на 5125 записях
    node -e "const d=require('./src/lib/content/dims-build.json');console.log(d.filter(x=>(x.name?.en??'').includes('’')).length)"
    # ПОСЛЕ — контроль ТЕМ ЖЕ путём, затем признак: «достигнуто 5125 из 5125 · попало 64»
    node -e "const d=require('./src/lib/content/dims-build.json');console.log('достигнуто',d.filter(x=>(x.title?.en??'').length>0).length,'из',d.length,'· попало',d.filter(x=>(x.title?.en??'').includes('’')).length)"
    ```

    **Вопрос 2 — промах ВЫРАЖЕНИЯ: прибор смотрит не ТЕМ** (алфавит, кодировка, форма имени).
    Материал полон и упасть проверке дать МОГ; выговорить искомое не смог сам образец: «*синтетический
    самотест доказывает, что признак работает на входах, которые автор ВСПОМНИЛ; живое дерево
    подсовывает те, которых он не вспомнил*» (Интегратор, автор случая).

    🔴 **ЛОВУШКА: ДРОБЬ ЛОВИТ ТОЛЬКО ВОПРОС 3.** На случае вопроса 2 знаменатель ЗДОРОВ и усыпляет:
    «0 из 267» следующая сессия прочла бы как честный ноль — дробь как лечение обоих случаев создала
    бы новый ложный зелёный. 🔑 И **цитируя ЧУЖОЕ число, спроси, замерено ли оно**: в первой редакции
    здесь стояло число, названное автором случая по памяти, и оно уехало в канон как замеренное.

    ⛔ **ГДЕ НЕ ДЕЙСТВУЕТ** — граница названа, иначе правило умрёт от усталости:
    · *Дробь (вопрос 3)* не нужна на ПОСТРОЕННОЙ фикстуре юнита · где знаменатель уже в форме вывода
      (`13/13`, «0 из 178») · у ноля СОБЫТИЯ («консоль чиста», «процесс вышел с 0») · у промежуточного
      ноля отладки. **Обязательна при двух условиях сразу:** прибор адресует материал, которого автор
      НЕ создавал, И ноль будет **ПРОИЗНЕСЁН ЛИБО ПОЛОЖЕН В ОСНОВАНИЕ СЛЕДУЮЩЕГО ШАГА** — и вторая
      половина часто ТИХАЯ: на ноле ДЕЙСТВУЮТ, не произнося его («апострофов ноль → чинить нечего»).
    · *Контроль алфавита (вопрос 2)* обязателен там, где образец применяется к тексту, который МОЖЕТ
      содержать не-ASCII — в этом проекте почти везде, где грепается документ; не нужен, когда
      алфавит корпуса ЗАКРЫТ и это видно: идентификаторы кода, `sha`, коды возврата, имена npm-скриптов.
    🔑 **Общий триггер обоих:** ноль, ОПРОВЕРГАЮЩИЙ чужое утверждение — документ владельца, замер
    коллеги, строку канона; там цена максимальная.

    **Механизируемо наполовину:** ФОРМА (ноль дробью) и помощник, возвращающий пару «достигнуто /
    попало», — да; выбор пути контроля и распознавание «произносимого» ноля — нет. Страж класса уже есть
    (`tools/verify-cyrillic-word-boundary.mjs`), но разовая команда в его корпус не входит — поэтому
    лечат формой и мутацией на живом материале, а не фиктивным стражем. **Знание класса не защищает — защищает форма.**
    *(Оплачено дважды за вечер смены 13 — вопрос 3 у dev-1 (поле `name` вместо `title`, «0» на 5125
    записях), вопрос 2 у Интегратора (ASCII-образец на кириллических слагах); выведено dev-1, исправлено
    Интегратором до сдачи: `EXP-NEW-ложный-ноль`, `git show ndim_integrator:reports/TEAM/2026-08-29_address_reachability_shift13.md`.)*

## The work produces its own means of checking

Building something includes building what checks it — a test suite, a check-list, test cases, a
fixture, a guard — planned WITH the work and landing in the SAME step, never "later".

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
   **And the broken version is NAMED — together with its distance from the THREAT.** Reddening a
   guard against *a* broken version is necessary and not sufficient: a guard proven against the
   failure that was convenient to simulate, instead of the threat it exists for, does not withhold
   confidence — it ISSUES it, falsely. So every guard declares, next to itself, four
   greppable lines, and a guard is DONE only when the last one is no longer `NOT YET`:
   ```
   @guard <name>
   THREAT:         the real event it exists for
   PROVED-AGAINST: what the red run actually did
   GAP:            what the proof does NOT cover — or the word `none`, written after thinking
   ON-REAL-PATH:   where it was seen working on the path the owner actually runs — or `NOT YET`
   ```
   A recorder whose tape must outlive the event it explains declares the same way — `@forensic
   <name>` · `EXPLAINS:` the event · `DURABLE-AT:` when the evidence becomes durable — and `close`,
   `exit`, `trip-only` are rejected values: evidence durable only at a clean ending is not evidence.
   The optional tool module `kaif-guard-lint` (`.kaif/tools/`, `check` / `selftest`) reds on a block
   with a missing field or a rejected `DURABLE-AT`; it fires only on explicit `@guard` / `@forensic`
   markers and never guesses what a guard is.
6. **After a deploy, the gate is production itself, entered as a user.** Sign in by whatever door
   the product offers, walk the real screens, read the console — only then is "deployed" a fact.
   A smoke that only walks public surfaces proves the landing page is alive, not the product: if
   the product has authenticated state, an unauthenticated smoke is NOT evidence about the
   product.
7. **Artifact integrity before shipping.** "It built" and "it is one build" are different claims:
   the shipped bundle carries exactly ONE build identity, asserted mechanically before upload. An
   output directory that is not cleaned between builds ships a mixture of two builds — every
   individual file valid, the SET broken — and mixtures fail in ways no test sees.

Two placement rules: gates 6–7 belong IN THE DEPLOY PATH, not in prose — one deploy door that runs
them itself and fails on any red step (where the agent system has hooks, deny the raw deploy command).
And a post-deploy smoke must be able to FAIL on a dead product: prove there was something to measure before
painting green — a smoke that is greenest when the product is emptiest is worse than no smoke.

### 🔴 Ворота 6–7 на этом проекте

- **Ворота 6 оплачены ЗДЕСЬ 2026-08-15** (issue #18 истока — наша история): три выката «проверялись»
  смоуком гостя, пока приложение под сессией не стартовало вовсе; нашёл владелец: *«деплой без
  тестирования это пердёж в лужу, а не работа»*. **Ворота 7** — тот же день: чанки прошлой сборки
  со старым runtime-хешем уронили приложение у всех (`bugs/124`).
- **Оба правила размещения здесь уже машинные:** `npm run deploy` — единственная дверь (хук
  `deploy-guard` запрещает голый `firebase deploy`), смоук под сессией встроен в неё, а класс
  «зелёный на пустом» стережётся лестницей трёх вопросов (`AGENT_GUIDE.md` → «Зелёные тесты сами по себе ничего не доказывают»).

## Стенд агента — не реальный мир владельца: «готово» о бое говорится после реального мира

Агент проверяет работу на чистом, только что поднятом стенде: свежий браузер, чистый чекаут, новый
пользователь, сегодняшняя сборка — и говорит «готово». Мир владельца НАКОПЛЕН: старая сессия,
сохранённый профиль, его собственные правки в развёрнутом дереве, кеш прошлой сборки — и ломается
именно там, пока все приборы агента зелёные по построению. Здесь класс оплачен дважды: смоук гостем
при неработающем входе под сессией (ворота 6) и вечная «Загрузка» у каждого, кто хоть раз входил
(`AGENT_GUIDE.md` → «КОНТЕКСТ ВОЗВРАЩАЮЩЕГОСЯ ЧЕЛОВЕКА», `bugs/KAIF/09_returning_user_state_in_deploy_smoke.md`;
история поставки — `.kaif/KAIF_REFERENCE.md` §17 → «The agent's stand is not the owner's real world…»).

Прежде чем сказать «готово» о чём угодно, что уже в бою, отчёт несёт строку разности:

```
РЕАЛЬНЫЙ МИР: накоплено — <что уже есть в мире владельца: сессии, профили, данные, правки>;
данные и техника — <его данные, его устройство, его аккаунт>; путь — <дверь, которой он ходит>
```

У каждого пункта ровно два законных исхода — *проверено на реальном мире* (на его состоянии, его
данных, его пути) или *проверено с реальным состоянием, снятым с реального мира* (засеяно оттуда, а
не выдумано). «Там не проверял» — не исход, а СТОП: работа стоит и называет, чего ждёт (доступ ·
машина · слово владельца). Единственное исключение — слово владельца о конкретной проверке, которая
МЕНЯЕТ его состояние (запись в его живой профиль): тогда проверка ждёт владельца у машины, и
«готово» не говорится. Ворота 6–7 велят входить в бой пользователем; это правило говорит, ЧЕЙ это
бой — его, со всем накопленным. `/fable-judge` охотится на «готово» о бое без строки разности.

## The taste class — when the observer must be human

A subjectively-perceptual acceptance criterion (a perception adjective: beautiful, natural,
pleasant, "feels right") is still verified by observation — but the OBSERVER is the human, by
necessity, not the agent. The agent's role is to PREPARE the observation: produce a mock-up on the
project's own material and hand over an artifact to perceive (`AGENT_GUIDE.md` → "The taste
class"; the homework doc with its two standing fields). The agent's own "sounds good to me" is not
a verification and never flips a marker; the owner's recorded verdict is.

## How this composes with the rest of KAIF

- **`REQUIREMENTS_FRAMEWORK.md`** — shapes what is REQUIRED; this framework verifies what was MADE
  against it. Principle 3 (early testing) is executed at the requirements stage there; deriving the test
  basis FROM the requirements is step 1 of the chain here; bugs are born where the two meet (`BUG_FIXING_FRAMEWORK.md`).
- **fable-method** — Step 5 (verify by observation) is HOW one check is done; this framework says WHAT carries a status.
- **`/fable-judge`** — treats test-status markers as claims: a `[TESTED]` it cannot reproduce is REFUTED.
- **Its guards** — optional tool modules in `.kaif/tools/` (`.kaif/KAIF_REFERENCE.md` §14): `kaif-guard-lint` (gate 5's
  declaration block) and `kaif-testrun-lint` (the run report's seven fields; `bug` — the tester's report); advisory.
- **`BUG_FIXING_FRAMEWORK.md`** — where testing's findings go (one doc per defect; 3 attempts → research).
- **Spheres** (`.kaif/spheres/`) — the sphere's evidence, its meaning of "verified by observation", its fraud table (principle 6).
- **The harness** — invest in tooling that makes verification observable and deterministic
  (`AGENT_GUIDE.md` → Test harness); eyeballing is not testing.
- **Why a rule here is the way it is** — the field history of the sections that have one (the ticket that
  paid for a rule, the owner's word) lives in `.kaif/KAIF_REFERENCE.md` §17, under the same heading; read the
  entry before changing or dropping a rule.

*Grounding: the seven principles and the activities chain are the ISTQB canon (istqb.org; ru: testbase.ru);
the run report is the ISO/IEC/IEEE 29119-3 test execution log and test completion report, distilled to seven fields.*
