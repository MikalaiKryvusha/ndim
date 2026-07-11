# Исследование 10 — Трение онбординга: почему люди уходят до аккаунта и как это чинят

> **Зачем этот документ.** Владелец зафиксировал боль 1.x (`ideas/09`): по данным Amplitude
> пользователи с рекламы либо не двигались по онбордингу, либо бросали его, либо доходили до
> кнопок [Log In]/[Create Account] — и исчезали. Его подозрения: онбординг не формировал доверия
> (А), не доносил ценность «какую МОЮ боль решает» (Б), и, предположительно, не давал ничего
> «пощупать» без аккаунта. Задача из `ideas/09`: прогуглить проблему и придумать, как радикально
> исправить это в 2.0, нарезав планы/идеи/домашки.
>
> Собрано 2026-07-11. Источники — у утверждений; цифры из блогов вендоров и агентств помечены
> как **[вендорская цифра]** — это ориентиры индустрии, не пиры-ревью. Официальная документация
> (Firebase) помечена отдельно. **Живой справочник — не помечается DONE.**

---

## 1. Диагноз: подозрения владельца совпадают с литературой

Индустрия описывает ровно три разрыва, которые владелец увидел в Amplitude:

| Подозрение владельца | Как это называется в литературе |
|---|---|
| А) не формирует доверия → боятся создавать аккаунт | **trust gap**: ~18% бросают формы из-за страха за данные [вендорская цифра] ([Reform](https://www.reform.app/blog/7-trust-signals-to-boost-form-conversions)) |
| Б) не доносит ценность «что мне это даст» | **value gap / time-to-value**: активация напрямую зависит от того, как быстро человек ощутил пользу ([Userpilot](https://userpilot.com/blog/frictionless-customer-onboarding/)) |
| Нечего «пощупать» без аккаунта | **gradual engagement / lazy registration**: требование аккаунта до ценности — «самая дорогая ошибка онбординга» ([Appcues](https://www.appcues.com/blog/gradual-engagement-mobile-app-first-screen), [UI-Patterns](https://ui-patterns.com/patterns/LazyRegistration)) |

Вывод №1: боль 1.x не уникальна и не загадочна — это три известных разрыва разом,
и у каждого есть отработанные лекарства.

## 2. Что говорит индустрия

### 2.1 Трение формы и шагов

- Каждое лишнее поле формы снижает завершение (ориентир ~5–7% на поле) [вендорская цифра]
  ([Ping Identity](https://www.pingidentity.com/en/resources/blog/post/frictionless-signup.html)).
- Онбординг — «беседа, а не допрос»: начать с самого лёгкого шага, глубокие вопросы — потом,
  когда человек уже вложился ([PG Dating Pro](https://www.datingpro.com/blog/ux-labyrinth-designing-the-perfect-onboarding-flow-for-a-dating-service/)).
- Больше 3–4 одновременных выборов — усталость решений, завершение падает
  ([SaaS Factor](https://www.saasfactor.co/blogs/why-users-drop-off-during-onboarding-and-how-to-fix-it)).
- Бенчмарк дейтинга: вход (соц-логин / OTP / email) укладывают в **~90 секунд**; 3–5 шагов до
  первого «товара» (списка потенциальных совпадений) [вендорские цифры]
  ([PG Dating Pro](https://www.datingpro.com/blog/dating-platform-benchmarks/)).

### 2.2 Отложенная регистрация (главное лекарство от «нечего пощупать»)

Паттерн: дать испытать ядро ценности ДО запроса аккаунта; просить аккаунт в логичный момент
(сохранить результат, связаться с человеком), когда терять уже жалко. Видимое свидетельство
вложенного труда — сильнейший мотиватор зарегистрироваться
([UI-Patterns](https://ui-patterns.com/patterns/LazyRegistration),
[Auth0](https://auth0.com/blog/should-you-give-users-access-before-they-register/)).

Живые примеры ([Appcues](https://www.appcues.com/blog/gradual-engagement-mobile-app-first-screen)):
**Duolingo** — целый урок языка до предложения аккаунта; **GOAT** — просмотр и поиск без
регистрации, аккаунт только на покупке; **Zocdoc** — поиск врача и расписания до регистрации;
**TED** — всё смотрится, аккаунт только для синхронизации. Каветы там же: соцсети и финансы
могут требовать аккаунт сразу — но и они смягчают вход подачей ценности, а не голой формой.

### 2.3 Доверие на пороге

- Микрокопия-успокоение у полей и кнопки («никогда не продаём ваши данные», «зачем нам это
  поле») — дешёвый и измеримо работающий приём; прозрачность «зачем поле» обязательна
  ([Reform](https://www.reform.app/blog/7-trust-signals-to-boost-form-conversions),
  [Campaign Monitor](https://www.campaignmonitor.com/blog/featured/how-to-build-signup-forms-that-work-7-best-practices-to-get-more-subscribers/)).
- Социальное доказательство (живые счётчики, отзывы) даёт ощутимый прирост конверсии формы
  (ориентир до ~15%) [вендорская цифра]
  ([Trustmary](https://trustmary.com/social-proof/trust-signals/)).
- Соц-логин и passwordless убирают страх «ещё один пароль» и поля вообще
  ([Ping Identity](https://www.pingidentity.com/en/resources/blog/post/frictionless-signup.html)).

### 2.4 Механизм «гостя» в нашем стеке (официальная документация)

**Firebase Anonymous Authentication** — временный аккаунт без каких-либо данных о человеке:
работает с правилами безопасности как обычный пользователь. Когда гость решает остаться,
аккаунт **апгрейдится** привязкой реального метода входа через `linkWithCredential()` —
**UID сохраняется, все данные гостя остаются при нём**
([Firebase: anonymous auth](https://firebase.google.com/docs/auth/web/anonymous-auth)).

Практики и каверзы ([Firebase blog: best practices](https://firebase.blog/posts/2023/07/best-practices-for-anonymous-authentication/)):

- Брошенные анонимные аккаунты чистятся автоматически через 30 дней (Identity Platform).
- Правила обязаны отличать гостя: `sign_in_provider == 'anonymous'` — и закрывать от него
  чувствительные операции (у нас: дружба, круги, публикация в общее Пространство — кандидаты).
- Анонимный токен можно надёргать через REST — от абуза защищает App Check, не сама анонимность.
- Апгрейд — именно `linkWith*`, а не `signInWith*` (иначе второй аккаунт и потерянные данные).

## 3. Чем NDim Space 2.0 уникально готов к радикальному решению

1. **Ядро похожести — чистый TS-модуль, работающий в браузере** (`src/lib/similarity/`,
   29 тестов). Значит, «пощупать» НАСТОЯЩИЙ алгоритм можно прямо на лендинге, без бэкенда и
   без аккаунта вообще: человек двигает звёзды по 3–5 осям — и живьём видит похожесть с
   примерами людей. Ни одна кнопка [Create Account] до этого не нужна. Дёшево (KISS): ядро уже
   написано и оттестировано.
2. **Гостевой режим — «уважительная конверсия».** Анонимный вход → человек заполняет своё
   пространство по-настоящему → при создании аккаунта UID и труд сохраняются. Это тот же
   принцип, что «уважительная миграция» (`MASTER_PLAN.md`): вложенный труд не теряется никогда.
3. **Наше доверие — настоящее, его не надо выдумывать, надо показать:** открытый код AGPL-3.0;
   «не берём денег и не удерживаем» (`GOAL.md`) — буквальный антипод страхов пользователя
   дейтингов; приватность по умолчанию «скрыто» (модель 2.0, `researches/04`); живой счётчик
   людей из `space/public_metrics` (стыкуется с `ideas/06`).
4. **Контент ценности уже извлечён** — тексты онбординга 1.x лежат дословно в `researches/05`;
   их надо пересобрать из «описания системы» в историю «какая ТВОЯ боль решается» (разрыв Б).

## 4. Развилки уровня владельца (не решаются агентом)

Стратегия пробы, методы входа, минимум полей и аналитика воронки — интервью №004
(`interviews/interview_004_onboarding_strategy.md`). Сам экран — по правилу четырёх макетов
после закрытия интервью.

## 5. Нарезка (что заведено из этого исследования)

- `ideas/10_landing_live_demo.md` — живое демо похожести на лендинге (агент; ❓ ждёт одобрения).
- `ideas/11_guest_mode_respectful_upgrade.md` — гостевой режим с уважительным апгрейдом
  (агент; ❓ ждёт одобрения).
- `interviews/interview_004_onboarding_strategy.md` — 4 закрытых вопроса владельцу.
- План экрана входа/онбординга — заводится в `plans/` после интервью №004 (и 4 макетов).

---

## Главные источники

- Паттерн и примеры: [Appcues: gradual engagement](https://www.appcues.com/blog/gradual-engagement-mobile-app-first-screen) ·
  [UI-Patterns: Lazy Registration](https://ui-patterns.com/patterns/LazyRegistration) ·
  [Auth0: access before registration](https://auth0.com/blog/should-you-give-users-access-before-they-register/)
- Трение формы и шагов: [Ping Identity](https://www.pingidentity.com/en/resources/blog/post/frictionless-signup.html) ·
  [Userpilot: frictionless onboarding](https://userpilot.com/blog/frictionless-customer-onboarding/) ·
  [SaaS Factor](https://www.saasfactor.co/blogs/why-users-drop-off-during-onboarding-and-how-to-fix-it)
- Дейтинг-специфика: [PG Dating Pro: benchmarks](https://www.datingpro.com/blog/dating-platform-benchmarks/) ·
  [PG Dating Pro: onboarding UX](https://www.datingpro.com/blog/ux-labyrinth-designing-the-perfect-onboarding-flow-for-a-dating-service/)
- Доверие: [Reform: trust signals](https://www.reform.app/blog/7-trust-signals-to-boost-form-conversions) ·
  [Trustmary](https://trustmary.com/social-proof/trust-signals/) ·
  [Campaign Monitor](https://www.campaignmonitor.com/blog/featured/how-to-build-signup-forms-that-work-7-best-practices-to-get-more-subscribers/)
- Механизм гостя: [Firebase: anonymous auth (web)](https://firebase.google.com/docs/auth/web/anonymous-auth) ·
  [Firebase blog: anonymous auth best practices](https://firebase.blog/posts/2023/07/best-practices-for-anonymous-authentication/)
