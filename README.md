<p align="center">
  <img src="static/favicon.svg" alt="NDim Space" width="96">
</p>

<a id="russian"></a>

# NDim Space

<p align="center">
  <a href="#russian"><img src="https://img.shields.io/badge/Русский-C0392B?style=for-the-badge" alt="Русский"></a>
  &nbsp;
  <a href="#english"><img src="https://img.shields.io/badge/English-2C7BE5?style=for-the-badge" alt="English"></a>
</p>

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE)
[![Status](https://img.shields.io/badge/Status-2.0%20в%20разработке-orange.svg)](STATUS.md)
[![Framework](https://img.shields.io/badge/Framework-KAIF-7F52FF.svg)](https://github.com/MikalaiKryvusha/KAIF)
[![Stack](https://img.shields.io/badge/Stack-SvelteKit%20%2B%20TypeScript-FF3E00.svg)](#сборка-и-стенд)
[![Live 1.x](https://img.shields.io/badge/Live%201.x-ndim--space.web.app-00C853.svg)](https://ndim-space.web.app)
[![Landing 2.0](https://img.shields.io/badge/Landing%202.0-ndimspace.app-1467D6.svg)](https://ndimspace.app)

**Честный поиск похожих людей в многомерном пространстве самооценок.**
Платформа знакомств, которая ищет вам человека, а не удерживает вас ради подписки.

> 🇷🇺 Русский (основной) ниже. · 🇬🇧 [English below](#english)
> 🧮 Вся идея — в ста строках математики: [`researches/03`](researches/03_similarity_core_1x_source.md).

---

## Русский

### Что это

Индустрия знакомств устроена так, чтобы вы **искали**, а не находили. Подписка, бесконечная лента,
иллюзия огромного выбора — всё это зарабатывает на человеческой потребности в отношениях, но не
удовлетворяет её.

**NDim Space** устроен иначе. Он ищет людей, похожих на вас, — математически.

### Как это работает

Сообщество придумывает **измерения** — оси человеческих качеств: «люблю тишину», «рано встаю»,
«читаю на ночь». Вы отмечаете, где вы стоите на тех осях, которые вам близки, — от 0 до 10.
Так вы становитесь **точкой в собственном подпространстве измерений**.

Похожесть двух людей считается только по **общим осям**:

```
близость     = 1 − (расстояние между точками / диаметр общего пространства) ^ 0.7
общность     = 2 · |общие оси| / (|ваши оси| + |его оси|)        ← коэффициент Дайса
ПОХОЖЕСТЬ    = близость × общность
```

Два следствия этой формулы:

- **Совпасть по одной случайной оси недостаточно.** Общность накажет за узкое пересечение.
- **Близость и широта пересечения обязательны обе.** Ноль в любом множителе обнуляет результат.
  Это осознанный отказ от компромиссных «средних».

Платформа периодически находит для вас до 250 самых похожих людей. Похожесть — величина приватная:
её видите только вы.

### Принципы

- **Никакой монетизации внимания.** Ни подписки, ни платного «буста», ни механик удержания.
- **Успех — это когда вы нашли человека и ушли.** Не «провели в приложении 40 минут».
- **Оси придумывают люди, а не платформа.** Никто, кроме людей, не знает, чем люди отличаются.
- **Ваш внутренний мир под защитой.** Оценки по осям не видит никто, кроме вас: другие видят лишь
  итоговую похожесть, а не то, из чего она сложилась. Умолчание видимости — «скрыть».
- **Открытый код под AGPL-3.0.** Взять эту идею и сделать из неё закрытый платный сервис — нельзя.

### Что внутри

| Компонент | Где | Проверено |
|-----------|-----|-----------|
| Ядро похожести | [`src/lib/similarity/`](src/lib/similarity/similarity.ts) — чистый TS-модуль, настоящие имена метрик | 29 тестов; числовой паритет с 1.x; мутации ловятся |
| Декодер наследия `a…t` | [`legacy.ts`](src/lib/similarity/legacy.ts) — читает обфусцированные связи 1.x для миграции | обратимость `encode(decode(x)) === x` |
| Видимость профиля | [`src/lib/model/visibility.ts`](src/lib/model/visibility.ts) — раскладка свойств по кругам владельца | 30 тестов; четыре сценария утечки — мутациями |
| Схема документов | [`src/lib/model/schema.ts`](src/lib/model/schema.ts) — типы Firestore, логика дружбы, границы значений | 29 тестов |
| Правила безопасности | [`firestore.rules`](firestore.rules) — единственный сторож между клиентом и чужими данными | **81** тест на эмуляторе, проверяют **отказы**; мутации ловятся |
| Лендинг | [`src/routes/`](src/routes/+page.svelte) — SvelteKit, статический пререндер, светлая/тёмная темы, RU/EN, canonical на `ndimspace.app` | e2e в настоящем браузере |
| Экран «Профиль» | [`src/routes/profile/`](src/routes/profile/+page.svelte) — вкладки Личное · Измерения · Видимость; оценки звёздами 0–10, аудитории по кругам, предпросмотр «глазами гостя» | живой стенд + e2e; смена аудитории физически перекладывает бакеты |
| Экран «Связи» | [`src/routes/relations/`](src/routes/relations/+page.svelte) — топ похожих: три метрики сразу, «яркость связи», математика общего пространства | живой стенд + e2e |
| Вычислитель связей | [`calculator/`](calculator/index.mjs) — Docker-служба, очередь «грязных» точек, топ-250 в `relations/`; только исходящие соединения | прогон на эмуляторе и из контейнера |
| Онбординг без трения | [`plans/03`](plans/03_onboarding_2x.md) — демо похожести на лендинге → гость (анонимный вход, невидим другим) → аккаунт без пароля | сквозные сценарии на живом стенде; мутации ловятся |
| Аккаунт без пароля | [`src/lib/data/account.ts`](src/lib/data/account.ts) — Google и ссылка на почту через `linkWithCredential`: **UID тот же, труд гостя остаётся** | стенд: гость → письмо → аккаунт; данные на месте |
| Воронка без слежки | [`src/lib/data/funnel.ts`](src/lib/data/funnel.ts) — четыре счётчика в сутки и больше ничего: ни UID, ни почты, ни устройства | правила разрешают ровно +1 к одному счётчику |
| Десктопная оболочка | [`src/lib/ui/SideRail.svelte`](src/lib/ui/SideRail.svelte) — рельс навигации слева от 1024px; на телефоне всё как было | e2e на двух ширинах, 2 мутации |
| План миграции 1.x → 2.0 | [`plans/02_migration.md`](plans/02_migration.md) — уважительная: труд людей не теряется | — |

### Дорожная карта

| Фаза | Что | Статус |
|------|-----|--------|
| Фундамент | наследие 1.x в архив, KAIF, аудит и отзыв секретов, чистая история | ✅ |
| Решения владельца | стек, хостинг, бэкенд, лицензия — интервью №001–002 | ✅ |
| Ядро 2.0 | математика + модель данных + правила + тесты + план миграции | ✅ |
| Фронтенд 2.0 | SvelteKit: лендинг, «Профиль», «Связи»; **онбординг целиком** (демо → гость → аккаунт без пароля → воронка) работает на дев-стенде. Дальше — экраны «Пространство» и «Меню» (макеты утверждены) | 🔧 |
| Бэкенд | вычислитель связей работает в Docker; боевое включение — вместе с миграцией данных | 🔧 |
| Публикация | **https://ndimspace.app живёт**: домен куплен до 2031, привязан, сертификат раскатан, canonical на месте; дальше — sitemap и поисковики | 🔧 |

Живой статус — [`STATUS.md`](STATUS.md) · дорожная карта — [`MASTER_PLAN.md`](MASTER_PLAN.md) ·
видение автора — [`GOAL.md`](GOAL.md).

### Сборка и стенд

Node ≥ 24 (исполняет TypeScript нативно), npm. Для тестов правил — Java (эмулятор Firestore).

```bash
npm install
npm run dev        # разработка: http://localhost:5173
npm run stand      # живой стенд: эмуляторы + тестовые данные + вычислитель → /profile, /relations
npm test           # 88 юнит-тестов ядра и модели данных
npm run test:rules # 81 тест правил Firestore на эмуляторе (проверяют ОТКАЗЫ)
npm run test:calc  # 9 тестов сервера синхронизации на эмуляторе
npm run e2e        # 37 браузерных e2e-проверок (Playwright, продакшен-сборка)
npm run build      # статическая сборка в build/ — весь сайт пререндерится
```

Каждый набор тестов проверен **мутациями**: на намеренно сломанном коде он падает. Тест, который
не умеет краснеть, — не тест, а украшение.

### Наследие 1.x

Версия 1.x — работающая, но кустарная реализация идеи, написанная автором вручную, без опыта
программирования, — свою задачу выполнила: доказала, что математика работает и люди действительно
находят друг друга. Она целиком сохранена в приватном архиве, а её ключевое знание выжато сюда:
[модель данных](researches/02_firestore_data_model_1x.md) ·
[математическое ядро](researches/03_similarity_core_1x_source.md).

### Ведётся по KAIF

Разработка идёт тандемом «человек-визионер + ИИ-агент» по фреймворку
**[KAIF](https://github.com/MikalaiKryvusha/KAIF)**: память, дисциплина и знания агента вынесены в
файлы репозитория (`STATUS.md`, `bugs/`, `researches/`, `interviews/`…), поэтому любая свежая сессия
продолжает работу без потери контекста. Канон проекта — [`AGENT_GUIDE.md`](AGENT_GUIDE.md).

### Автор

Николай Кривуша (Mikalai Kryvusha, *KOT KRINIK*).

> Не нужно стараться заработать и разбогатеть. Нужно делать добро людям — и это добро вернётся,
> возможно в разных формах. Поэтому в первую очередь я просто делаю добро безвозмездно: лучшую в мире
> платформу для знакомств, чтобы люди знакомились и любили друг друга.

---

<a id="english"></a>

## English

### What this is

The dating industry is built so that you keep **searching**, not finding. Subscriptions, endless
feeds, the illusion of infinite choice — it monetises the human need for connection without
satisfying it.

**NDim Space** works differently. It finds people similar to you — mathematically.

### How it works

The community invents **dimensions** — axes of human qualities: "I love silence", "I wake up early",
"I read at night". You mark where you stand on the axes that matter to you, from 0 to 10. You become
a **point in your own subspace of dimensions**.

Similarity between two people is computed **only over their shared axes**:

```
proximity   = 1 − (distance between points / diameter of the shared space) ^ 0.7
commonality = 2 · |shared axes| / (|your axes| + |their axes|)      ← Dice coefficient
SIMILARITY  = proximity × commonality
```

Two consequences:

- **Matching on one random axis is not enough.** Commonality punishes a narrow overlap.
- **Both closeness and breadth of overlap are required.** A zero in either factor zeroes the result.
  This is a deliberate refusal of compromise "averages".

The platform periodically finds up to 250 people most similar to you. Similarity is private: only
you see it.

### Principles

- **No attention monetisation.** No subscriptions, no paid boosts, no retention mechanics.
- **Success is when you find someone and leave.** Not "spent 40 minutes in the app".
- **Axes are invented by people, not by the platform.** Nobody but people knows how people differ.
- **Your inner world is protected.** Nobody but you sees your per-axis ratings: others see only the
  resulting similarity, not what it is made of. The visibility default is "hidden".
- **Open source under AGPL-3.0.** Taking this idea and turning it into a closed paid service is not
  allowed.

### What is inside

| Component | Where | Verified |
|-----------|-------|----------|
| Similarity core | [`src/lib/similarity/`](src/lib/similarity/similarity.ts) — pure TS module, real metric names | 29 tests; numeric parity with 1.x; mutations get caught |
| Legacy `a…t` decoder | [`legacy.ts`](src/lib/similarity/legacy.ts) — reads obfuscated 1.x relations for migration | round-trip `encode(decode(x)) === x` |
| Profile visibility | [`src/lib/model/visibility.ts`](src/lib/model/visibility.ts) — properties laid out by the owner's circles | 30 tests; four leak scenarios checked by mutations |
| Document schema | [`src/lib/model/schema.ts`](src/lib/model/schema.ts) — Firestore types, friendship logic, value bounds | 29 tests |
| Security rules | [`firestore.rules`](firestore.rules) — the only guard between a client and other people's data | **81** emulator tests asserting **denials**; mutations get caught |
| Landing page | [`src/routes/`](src/routes/+page.svelte) — SvelteKit, static prerender, light/dark themes, RU/EN, canonical on `ndimspace.app` | e2e in a real browser |
| Profile screen | [`src/routes/profile/`](src/routes/profile/+page.svelte) — Personal · Dimensions · Visibility tabs; 0–10 star ratings, per-property audiences, "through a guest's eyes" preview | live stand + e2e; audience change physically redistributes buckets |
| Relations screen | [`src/routes/relations/`](src/routes/relations/+page.svelte) — top similar people: all three metrics at once, "connection brightness", the shared-space maths | live stand + e2e |
| Relation calculator | [`calculator/`](calculator/index.mjs) — Docker service, dirty-points queue, top-250 into `relations/`; outgoing connections only | verified on the emulator and from the container |
| Frictionless onboarding | [`plans/03`](plans/03_onboarding_2x.md) — similarity demo on the landing → guest (anonymous, invisible to others) → passwordless account | end-to-end scenarios on the live stand; mutations get caught |
| Passwordless account | [`src/lib/data/account.ts`](src/lib/data/account.ts) — Google and email link via `linkWithCredential`: **same UID, the guest's work stays** | stand: guest → email → account; data intact |
| Analytics without tracking | [`src/lib/data/funnel.ts`](src/lib/data/funnel.ts) — four daily counters and nothing else: no UID, no email, no device id | rules allow exactly +1 to one counter |
| Desktop shell | [`src/lib/ui/SideRail.svelte`](src/lib/ui/SideRail.svelte) — navigation rail from 1024px; on phones nothing changes | e2e at two widths, 2 mutations |
| 1.x → 2.0 migration plan | [`plans/02_migration.md`](plans/02_migration.md) — respectful: people's work is never lost | — |

### Roadmap

| Phase | What | Status |
|-------|------|--------|
| Foundation | 1.x legacy archived, KAIF deployed, secrets audited and revoked, clean history | ✅ |
| Owner decisions | stack, hosting, backend, license — interviews #001–002 | ✅ |
| Core 2.0 | maths + data model + rules + tests + migration plan | ✅ |
| Frontend 2.0 | SvelteKit: landing, Profile, Relations; **the whole onboarding** (demo → guest → passwordless account → funnel) runs on the dev stand. Next: the Space and Menu screens (mockups approved) | 🔧 |
| Backend | the relation calculator runs in Docker; production switch-on comes with the data migration | 🔧 |
| Publication | **https://ndimspace.app is live**: domain bought until 2031, bound, certificate deployed, canonical in place; sitemap and search engines next | 🔧 |

Live status — [`STATUS.md`](STATUS.md) · roadmap — [`MASTER_PLAN.md`](MASTER_PLAN.md) ·
the author's vision — [`GOAL.md`](GOAL.md).

### Build and test harness

Node ≥ 24 (runs TypeScript natively), npm. Rules tests additionally need Java (Firestore emulator).

```bash
npm install
npm run dev        # development: http://localhost:5173
npm run stand      # live stand: emulators + seed data + calculator → /profile, /relations
npm test           # 88 unit tests: core and data model
npm run test:rules # 81 Firestore rules tests on the emulator (asserting DENIALS)
npm run test:calc  # 9 sync-server tests on the emulator
npm run e2e        # 37 browser e2e checks (Playwright, production build)
npm run build      # static build into build/ — the whole site is prerendered
```

Every test suite is verified by **mutations**: it fails on deliberately broken code. A test that
cannot turn red is not a test but a decoration.

### The 1.x legacy

Version 1.x — a working but homemade implementation, written by the author by hand with no
programming experience — did its job: it proved the maths works and people actually find each other.
It is fully preserved in a private archive; its key knowledge is distilled here:
[data model](researches/02_firestore_data_model_1x.md) ·
[similarity core](researches/03_similarity_core_1x_source.md).

### Managed by KAIF

Development runs as a human-visionary + AI-agent tandem on the
**[KAIF](https://github.com/MikalaiKryvusha/KAIF)** framework: the agent's memory, discipline and
knowledge are externalized into repository files (`STATUS.md`, `bugs/`, `researches/`,
`interviews/`…), so any fresh session resumes with full context. The project canon is
[`AGENT_GUIDE.md`](AGENT_GUIDE.md).

### Author

Mikalai Kryvusha (*KOT KRINIK*).

> Don't try to get rich. Do good for people — and the good comes back, perhaps in different forms.
> So first of all I simply do good, for free: the world's best platform for people to meet, so that
> they meet and love each other.

---

<div align="center">

**License:** [GNU AGPL-3.0](LICENSE) · © 2026 Mikalai Kryvusha

</div>
