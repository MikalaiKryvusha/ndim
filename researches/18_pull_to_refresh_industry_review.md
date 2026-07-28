# Исследование 18 — Принудительное обновление (pull-to-refresh): как эту задачу решает индустрия

> **Зачем этот документ.** `AGENT_GUIDE` → чеклист, шаг **7б**: перед новым для проекта механизмом
> агент сначала читает, как эту задачу решает мир, и пишет обзор со ссылками на первоисточники, —
> и только потом проектирует.
>
> **Заказчик обзора:** ответ владельца в интервью №005, В4 (2026-07-28): *«Можем сделать
> pull-to-refresh на главных страницах приложения, начать например с Связи — прошаренные
> пользователи будут знать, что можно потянуть и выполнить принудительное обновление»*.
>
> **Почему это не «просто жест».** Тянуть вниз у верха страницы — **занятый жест**: им уже
> управляет сам браузер (обновление страницы в Chrome на Android и в Safari на iOS). Свой
> pull-to-refresh не добавляется к странице, он **отбирает жест у браузера**, и это решение с
> последствиями. Плюс жест невидим, работает только пальцем и попадает под критерий доступности
> WCAG 2.2. Ровно тот случай, для которого владелец завёл правило 7б.
>
> **Собран:** 2026-07-28 · **Как собран:** гуглёж и чтение первоисточников (MDN, Chrome for
> Developers, WebKit, W3C/WAI, Material Design, Apple HIG, Nielsen Norman Group), плюс снятие
> фактического состояния нашего кода. Ни один вывод не написан «по памяти модели».
>
> **Живой справочник — тегом `DONE` не помечается.**

---

## 0. Вопрос одной строкой

Человек хочет свежие данные прямо сейчас, не перезагружая приложение. Как индустрия даёт ему это
сказать — и чем платит тот, кто выбирает жест «потянуть вниз»?

---

## 1. Откуда жест взялся и что он означает

Pull-to-refresh придумал Лорен Бричтер в Tweetie (2010); Apple и Google позже подняли его до
элемента своих систем. Смысл везде один: **ручное обновление содержимого по требованию человека,
не дожидаясь очередного автоматического.**

**Apple, Human Interface Guidelines → Refresh Content Controls** — дословно про роль жеста и, что
важнее, про его границы:

> «A refresh control is manually initiated to immediately reload content… **without waiting for the
> next automatic content update to occur**».

> «Although people appreciate being able to trigger an immediate content refresh, **they also expect
> automatic refreshes to occur periodically**, and don't make users responsible for initiating every
> update».

> «If you do include a title, **don't use it to explain how to perform a refresh**; instead, provide
> information of value about the content being refreshed».

Читать это нужно так: у Apple жест — **добавка** к автоматическому обновлению, а не замена ему.
⚠️ Для нас это прямое расхождение с принятым решением (В4: внутри сеанса не освежаем вовсе) — см.
§6, «Честная цена».

**Material Design → Swipe to refresh** (Android) добавляет две вещи о поведении:

- жест уместен **у начала списков, сеток и коллекций карточек**, где новое приходит сверху и где у
  человека высок шанс реально увидеть новое после жеста;
- **у индикатора обязателен порог**: обновление запускается, только когда потянули дальше порога, —
  иначе жест срабатывает случайно при обычной прокрутке вверх;
- индикатор появляется **только** в ответ на жест или явное действие: фоновая синхронизация
  индикатора не рисует.

Известная и задокументированная претензия к жесту (Wikipedia, раздел критики): он **вызывает
нежелательные обновления, когда человек просто листает вверх**. Порог из Material — ответ именно на
эту претензию.

---

## 2. ⚠️ Главная ловушка веба: этот жест у браузера уже занят

В нативном приложении жест свободен. **В вебе — нет.** У верхней границы прокрутки его слушает сам
браузер: Chrome на Android перезагружает страницу, Safari на iOS делает то же самое. Своя реализация
обязана сначала **отобрать** жест, иначе человек получит оба поведения разом.

Отбирает его одно свойство CSS — `overscroll-behavior`. **MDN**, дословно:

> «By default, mobile browsers tend to provide a “bounce” effect or even a page refresh when the top
> or bottom of a page (or other scroll area) is reached».

> «The `contain` value **disables native browser navigation, including the vertical pull-to-refresh
> gesture** and horizontal swipe navigation».

**Chrome for Developers** (статья команды Chrome про это же свойство) даёт словарь значений и
практику:

| Значение | Дословно | Что это значит |
|---|---|---|
| `auto` | «Scrolls that originate on the element may propagate to ancestor elements» | как было |
| `contain` | «Prevents scroll chaining. Scrolls do not propagate to ancestors but **local effects within the node are shown**» | жест у браузера отобран, «резинка»/свечение остались |
| `none` | «Same as `contain` but it also prevents overscroll effects within the node itself (e.g. Android overscroll glow or iOS rubberbanding)» | отобран жест И убраны эффекты |

Практика оттуда же: свойство ставится на **элемент, задающий вьюпорт** — «In most cases, that's
`<html>` or `<body>`». Отсюда же рекомендация ставить его на оба (в Chrome срабатывает на `<body>`,
в Safari — на `<html>`).

Второй важный момент — **Safari умеет это не всегда и не везде**: `overscroll-behavior` появился
в WebKit только в **Safari 16.0** (сентябрь 2022). До этого отобрать жест у Safari штатным способом
было нечем. MDN до сих пор помечает свойство как **«Limited availability… not Baseline because it
does not work in some of the most widely-used browsers»** — то есть закладываться на него как на
данность нельзя, нужен честный запасной путь для браузера, который его не понимает.

> **Вывод раздела для нас:** «сделать pull-to-refresh» в вебе — это всегда две работы: свой жест
> **и** отключение чужого. Забыть вторую — значит получить у половины людей двойное поведение:
> приложение обновит данные, а браузер поверх этого перезагрузит страницу.

---

## 3. Доступность: жест — не единственный способ, а один из

**WCAG 2.2, критерий 2.5.7 «Dragging Movements» (уровень AA)** — нормативно:

> «All functionality that uses a dragging movement for operation can be achieved by a single pointer
> without dragging, unless dragging is essential or the functionality is determined by the user agent
> and not modified by the author».

Тонкость, которая решает всё: пока обновлением заведует **браузер**, критерий не применяется — это
«determined by the user agent». Понимание W3C прямо говорит, что критерий «does not apply to
scrolling and dragging gestures **enabled by the user agent**» и относит drag-to-refresh к тому, что
«provided by the browser, rather than implemented by the content».

**Но как только мы отбираем жест у браузера и делаем свой — обновление становится нашей
функциональностью, и критерий начинает применяться.** Значит у жеста обязан быть равноценный
одиночный путь без перетаскивания (кнопка).

К этому же выводу ведёт и простая арифметика продукта: жест **не существует на десктопе**. У нас
десктопная раскладка утверждена и живёт в бою (`ideas/17`, рельс + шапка) — на ней тянуть нечего.

---

## 4. Дискаверабилити: слово владельца о «прошаренных» — правда, и её надо назвать ценой

Владелец сформулировал честно: *«прошаренные пользователи будут знать, что можно потянуть»*. Это и
есть свойство невидимых жестов, и оно измерено.

**Nielsen Norman Group**, «Hamburger Menus and Hidden Navigation Hurt UX Metrics» (179 участников):

> «discoverability is cut almost in half by hiding a website's main navigation»

> «Task difficulty, as rated by users, saw a **21% increase** in the hidden navigation condition».

Речь там о меню, а не о жесте, — но механизм тот же и вывод переносится прямо: **спрятанное находят
примерно вдвое реже видимого**. Для нас это не аргумент «не делать»: это аргумент **не делать жест
ЕДИНСТВЕННЫМ способом обновиться**. Ровно то же требует и WCAG 2.5.7 (§3).

---

## 5. Наша реальность — снято с кода 2026-07-28, а не по памяти

| Факт | Значение | Откуда |
|---|---|---|
| Что прокручивается на экранах | **сам документ** (window), не внутренний контейнер: у `.screen`/`.body` нет `overflow-y: auto` | греп по `src/routes/*/+page.svelte`, `src/routes/+layout.svelte` |
| Единственный свой скролл-контейнер | окно «Как меня видят» в профиле (`.seeme`, `position: fixed` поверх экрана) — жест внутри него ведёт себя иначе, и это надо не забыть | `src/routes/profile/+page.svelte:1101-1103` |
| Есть ли уже `overscroll-behavior` | **нет ни одного вхождения** во всём `src/` (греп даёт 0) | греп по `src/` |
| Что стоит у корня | `scrollbar-gutter: stable` (bugs/59) | `src/routes/+layout.svelte:138` |
| Бесконечная прокрутка | есть на «Связях» и «Измерениях» — якорь догрузки внизу ленты | `verify-ideas18`, `measure-ideas18` (различают лоадер экрана и якорь ленты) |
| Десктоп | рельс слева от 1024px, шапка во всю ширину — жеста нет и быть не может | `ideas/17`, `SideRail.svelte` |
| Что вообще обновлять | цифры сервера синхронизации: топ связей (`KEYS.relations`, `relations:summary`) и статистика Пространства (`KEYS.space`); пульс живёт своей минутной жизнью | `src/lib/data/cache.ts` |
| Чем обновлять | механизм УЖЕ ЕСТЬ: `invalidate(префикс)` гасит ключи, следующий заход читает свежее | `src/lib/data/cache.ts` |
| Индикатор загрузки | общий компонент `Loading.svelte`, компактная карточка (bugs/70) | `src/lib/ui/Loading.svelte` |
| Правило анимаций | анимации обязательны везде, «работает» ≠ готово | `AGENT_GUIDE` → «Дизайн», планка лендинга |

**Главный практический вывод из таблицы:** обновлять данные нам уже есть чем — вся работа сводится
к **жесту, индикатору и отключению чужого жеста**. Никакого нового слоя данных не требуется.

---

## 6. Что из этого годится нам (рекомендация обзора, решение — за владельцем)

**Берём — жест с порогом, но НЕ как единственный путь.** Жест (телефон) + видимое действие
обновления (десктоп и доступность) — это и требование WCAG 2.5.7, и ответ на цифры NN/g, и то, как
устроены сами Material и Apple.

**Обязательно — отобрать жест у браузера**, и осознанно выбрать чем:
`overscroll-behavior-y: contain` (жест наш, «резинка» браузера осталась) против `none` (убрать
и её). Ставить на `<html>` и `<body>` разом. И обязательно проверить **на живом Android**, а не
только в эмуляции DevTools: жест браузера в эмуляции не воспроизводится.

**Обязательно — порог** (Material): обновление только если потянули дальше порога, иначе жест
сработает при обычном пролистывании вверх — это задокументированная главная претензия к нему (§1).

**Обязательно — запасной путь для Safari < 16** и любого браузера без `overscroll-behavior`:
если жест отобрать нечем — свой жест **не включаем вовсе** (иначе двойное обновление), а видимое
действие обновления работает везде.

**Не берём — библиотеку.** `pulltorefreshjs` и подобные решают ту же задачу, но у нас один-два
экрана, свои токены анимации (`MOTION`), своя карточка загрузки и своё правило готовности графики.
Оккам: берём модель, а не пакет (тот же вывод, что и в `researches/17` про TanStack Query).

### Честная цена — то, что владелец должен знать до выбора

- **Расхождение с Apple HIG.** У Apple жест — добавка к автоматическому обновлению («don't make
  users responsible for initiating every update»). У нас после решения В4 автоматического
  обновления внутри сеанса нет вовсе, и жест становится **единственным** способом обновиться, не
  перезаходя. Это осознанный выбор владельца (деньги за чтения важнее свежести минутной давности),
  но записать расхождение надо: следующая сессия не должна «чинить» это как дефект.
- **Мы отбираем у человека привычное поведение браузера.** Тот, кто тянул вниз, чтобы перезагрузить
  страницу целиком, получит другое — обновление данных. Это, вероятно, лучше, но это ИЗМЕНЕНИЕ
  привычки, а не добавка.
- **Жест конфликтует с бесконечной прокруткой** только внизу ленты — вверху конфликта нет.
- **Стоимость обновления в чтениях.** Один жест на «Связях» = до 1 + N чтений (N — размер топа, до
  ~94 в бою). Это осознанная плата за явное желание человека, но она реальна, и частить с ней
  нельзя: индустрия защищается порогом и блокировкой повторного жеста, пока идёт обновление.

---

## 7. Что остаётся решением владельца (закрывается макетами)

Обзор не решает и не должен решать:

1. **Как выглядит и ведёт себя индикатор** — 4 макета (правило четырёх макетов, `AGENT_GUIDE` →
   «Дизайн»).
2. **Где жест живёт**: только «Связи» (слово владельца — «начать например с Связи») или сразу все
   главные экраны.
3. **Каким будет видимый (не-жестовый) путь обновления** на десктопе и для доступности: кнопка
   в шапке · пункт в «Меню» · «Обновлено N минут назад» со ссылкой · ничего.
4. **Отбирать ли «резинку»** (`contain` против `none`).

---

## Источники (первоисточники, прочитанные 2026-07-28)

**Стандарты и доступность**
- W3C/WAI, Understanding WCAG 2.2 — SC 2.5.7 «Dragging Movements» —
  https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html

**Платформа (веб)**
- MDN, CSS `overscroll-behavior` — https://developer.mozilla.org/en-US/docs/Web/CSS/overscroll-behavior
- Chrome for Developers, «Take control of your scroll — customizing pull-to-refresh and overflow
  effects» — https://developer.chrome.com/blog/overscroll-behavior
- WebKit, «WebKit Features in Safari 16.0» (CSS Overscroll Behavior) —
  https://webkit.org/blog/13152/webkit-features-in-safari-16-0/

**Дизайн-системы**
- Apple, iOS Human Interface Guidelines → «Refresh Content Controls» — раздел живёт в архивной
  редакции HIG (в нынешней Apple свернула её до «Refresh content»); цитаты §1 взяты оттуда:
  https://codershigh.github.io/guidelines/ios/human-interface-guidelines/ui-controls/refresh-content-controls/index.html
  · действующая редакция — https://developer.apple.com/design/human-interface-guidelines/
- Material Design, «Swipe to refresh» (Android platform guidance) —
  https://m2.material.io/design/platform-guidance/android-swipe-to-refresh.html
- Material 3 / Jetpack Compose, `PullToRefreshBox` (порог и индикатор как API) —
  https://developer.android.com/develop/ui/compose/components/pull-to-refresh

**Исследования удобства**
- Nielsen Norman Group, «Hamburger Menus and Hidden Navigation Hurt UX Metrics» —
  https://www.nngroup.com/articles/hamburger-menus/
- Nielsen Norman Group, методика того же исследования —
  https://www.nngroup.com/articles/hidden-navigation-methodology/
- Wikipedia, «Pull-to-refresh» (происхождение жеста и раздел критики) —
  https://en.wikipedia.org/wiki/Pull-to-refresh

**Наши документы**
`interviews/interview_005_caching_forks.md` (заказчик, В4) · `researches/17` (кэш и контракт
свежести) · `ideas/18_DONE` (кэш сессии, `invalidate` как готовый механизм) · `ideas/17` (десктопная
оболочка — там жеста нет) · `AGENT_GUIDE` → «Дизайн» (правило четырёх макетов, готовность графики)
