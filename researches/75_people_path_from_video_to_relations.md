# Разведка 75 — Путь человека из ролика до Связей и возврата: холодный старт, активация, петли, посадочная, метрики

<!-- ВЕРА-НАЧАЛО -->
> # **ВЕРИТЬ В ПРОДУКТ И В ИДЕЮ НИКОЛАЯ, БЫТЬ ОПТИМИСТОМ И ВЕРИТЬ В УСПЕХ, ИБО ОН НЕИЗБЕЖЕН, ИБО МЫ СТАРАЕМСЯ, А КТО СТАРАЕТСЯ — ТОТ ПРИДЁТ К УСПЕХУ. С ЭНТУЗИАЗМОМ, ЛЮБОВЬЮ И НАДЕЖДОЙ ДЕЛАТЬ ТО, ЧТО МЫ ДЕЛАЕМ.**
>
> Слово владельца 2026-08-16.
<!-- ВЕРА-КОНЕЦ -->

> **Создан:** 2026-09-25 (агент Opus 5.5, ступень 1 лестницы `/plan-epic`) · **Родитель:** аудит
> `reports/KAIF_AUDIT/2026-09-25_why_agents_stall_and_what_to_change.md` · `MASTER_PLAN.md` → фаза 7, ставка 1 ·
> **Статус:** ✅ ступень 1 закрыта 2026-09-25 ≈01:3x · **Исходящее:** метаэпик `plans/104` · развилки — интервью №096.
> **Как собрано:** веб-разведка индустрии — субагент (веб-поиск, цитаты сверены по открытой странице, сила
> источника у каждого утверждения); локальная разведка и требования — агент по живым данным этой сессии.

## 0. Вывод первым

1. **Канал есть, путь рвётся после него.** Ролик 19–20.09 привёл ≈140 человек за два дня (бой): гостем вошли 7 (≈5 %
   — медиана посадочных страниц индустрии 6,6 %), оценки поставили 5, аккаунт завёл 1, через неделю живых снова
   один. Потеря — после входа гостем: в Связях, в возврате, в аккаунте.
2. **Первая сеть — крошечная и плотная** (Chen, «атомная сеть»). У NDim два готовых атома: **пара** («Тест на
   совместимость» для двоих работает при сети любого размера) и **волна одного ролика** (сотни людей за двое суток).
3. **Плотность Связей меряется общими оценками, а не числом людей.** Общий стартовый набор объектов у всех
   новичков (пять объектов демо) даёт пересечения с каждым прежним человеком. Самые оцениваемые объекты каталога —
   фильмы («Гарри Поттер и философский камень» 14 голосов, «Матрица» 11, «Интерстеллар» 10).
4. **Качества сегодняшнего демо в каталоге отсутствуют** («Люблю тишину», «Путешествия», «Спорт», «Книги», «Чувство
   юмора» — 0 из 5). Звёзды демо на качествах, перенесённые в гостя (решение №096 В8 = А), не дадут ни одного
   общего измерения ни с кем: Связи останутся пустыми. Развилка владельцу — интервью №096 В14.
5. **Зрение пути слепо в двух местах:** у 146 из 152 людей с `landing_view` недели ролика браузер не записан (за 18–24.09 — у 138 из 147 событий);
   свойство `entry` объявлено и не заполняется нигде. Встроенный браузер Instagram/Facebook у гостей ролика есть (2 из
   7), а Google запрещает вход через Google во встроенных браузерах с 2021 года.
6. **Одна ставка за раз** — практика Shape Up (фиксированный срок, «выключатель») и OMTM; владелец утвердил её
   (интервью №096 В3 = А).

## 1. Требования — слова владельца, дословно

- «*спасаем НЕ КАТАЛОГ. а приложение. мне нужен трафик, люди, пользователи. об этом прошу третий месяц*» (2026-09-21)
- «*наша сео должна была выявить боли людей и их запрос, и под это настроить нас в поисковиках, чтобы донести нашу
  ценность в решении боли людей*» (2026-09-21)
- «*планируй работы по твоему аудиту. Только сильно КАИФ не правь… Сейчас на продукте и его инстурментах
  фокусируйся. Мета эпик планирование*» (2026-09-25)
- «*разворачивай GOAL и MASTER_PLAN согласно твоему аудиту, на наш успех!*» (2026-09-25)
- «*нам нужно писать о нас, о нашем функционале, писать складным русским языком, но пользоваться ЯЗЫКОМ САМЫХ
  МОЩНЫХ КЕЙВОРДОВ*» · «*я уверен, что никто в интернете не гуглит "поставить звёзды"*» (2026-09-25)
- «*FAQ нужно сильно расширить. Ищи в интернете, как индустрия и гугл советуют, сколько там оптимально вопросов, и
  какие текста с какими кейводрами писать*» (2026-09-25)
- «*сама структура нравится, утверждаю*» — новая V1 `design/new-landing-v1.html` (2026-09-25)
- Решения интервью №096: В2 = А (заморозка приборов, архив) · В3 = А (одна ставка на две недели) · В4 = Г (всё
  делает Opus 5.5) · В6 = Б (новый лендинг — главная) · В7 = Б (качества в демо, ярче) · В8 = А (звёзды демо → гость,
  «*честные изменения, которые реально внутри продукта будут*») · В9 = Б (персонажи после выката) · В10 (карточку
  новичка переосмыслить; «никто не видит» — ложь).
- Законы, которые эпик держит: правда на лице продукта · голос владельца (портрет) · четыре макета для вида · тест
  до слова «катить» · выкат только дверью со смоуком под сессией · добро, а не выручка · оценки и похожесть наружу
  не отдаём (№002 В4) · слово «вымышленные» о персонажах не пишем (2026-09-25).

## 2. Локальная разведка — живые числа 2026-09-25

| Что | Число | Чем снято |
|---|---|---|
| Людей / живых за 7 дней / оценок | 95 / 1 / 4 077 (оценок не прибавилось 20–24.09) | `node tools/probe-prod-stats.mjs` |
| Неделя ролика 14–20.09 (PostHog, `env=prod`, людей; поправка 2026-09-25 02:2x — прежние 162 и 10 несли стейдж) | `landing_view` 152 · `guest_start` 9 · `rating_saved` 45 у 6 человек · `relations_view` 32 у 13 · `account_created` 1 | запрос по неделям, этот разбор |
| Рефереры 19–20.09 | instagram.com 83 · m.facebook.com 21 · l.instagram.com 7 · прямые 18 | запрос по дням |
| Что делали 9 гостей недели ролика (14–20.09, по людям, без личных данных) | 1 — 26 оценок, открыл двух людей, профиль, аккаунт (23 мин) · 2 — 5–7 оценок → Связи → ушли за 2–3 мин · 1 — 3 оценки, Связи 7 раз · 1 — 3 оценки и ушёл · 4 — ни одной оценки (1 — стена входа). **Утечка после входа — экран Связей** | HogQL по `person_id` гостей недели, 2026-09-25 01:5x |
| Встроенный браузер FB/IG среди гостей 18–24.09 | 2 из 7 `guest_start`; 1 из 3 `signin_wall_view` | `$raw_user_agent ~ Instagram|FBAN|FBAV|FB_IAB` |
| Встроенный браузер среди гостей недели ролика 14–20.09 (окно 14.09 00:00 — 21.09 00:00 +03:00) | Instagram — 2 из 9 людей с `guest_start` (браузер известен у всех 9), Facebook — 0. Среди пришедших на главную доля неизмерима: у 146 из 152 людей с `landing_view` браузера нет (строка корня, `plans/105` Б3) | HogQL по `person_id`, `env=prod`, 2026-09-25 02:07; скрипт `test-results/tmp/inapp-share.mjs` (вне git) |
| `landing_view` без браузера, 18–24.09 | 138 из 147 | тот же запрос: `$browser` пуст |
| `signin_failed` (след отказа входа, в бою с 19.09 23:14) | 0 событий за 30 дней | схема событий PostHog |
| Свойство `entry` у событий | объявлено, не заполняется | `src/lib/data/analytics.ts:230,241` |
| Первый экран главной на телефоне | выбор языка, четыре числа («96 человек»), описание на двух языках, кнопки действия нет | кадр `test-results/audit-2026-09-25/root-390-first.png` |
| Качества демо в каталоге | 0 из 5 | `src/lib/ui/SimilarityDemo.svelte:32–38` против `dims-build.json` |
| Объекты каталога с голосами | 1 881 из 5 144; максимум 14 голосов | `dims-build.json` → `rates` |
| Журнал выкатов | нет (след — только коммиты «снимок чисел при выкате») | `tools/deploy.mjs` |
| Спрос (Вордстат 2026-08-02) | знакомства 6,6 млн · сайт знакомств 1,7 млн · познакомиться 691 тыс. · найти друзей 268 тыс. · тест личности 219 тыс. · поиск людей 155 тыс. · новые знакомства 76 тыс. · тест на совместимость 46 тыс. · клуб по интересам 12 тыс.; «найти людей с похожими вкусами» 5 · «кто любит те же фильмы» 0 | `researches/30_demand_ru.json` |

Прежние разведки, на которые эпик опирается: `researches/74` (лендинг, образцы владельца, боли и запросы) ·
`researches/25` (онбординг, 128 источников) · `researches/30` (ядро притока, спрос) · `researches/60` (двери топов).

## 3. Индустрия — веб-разведка субагента (сила источника: [П] первоисточник · [В] вторичный · [С] слабый)

### 3.1 Холодный старт

- **Атомная сеть:** *"The 'atomic network' is the smallest network needed that can stand on its own"*; первая сеть
  *"probably smaller and more specific than you think… maybe on the order of hundreds of people, at a specific moment
  in time"* — https://www.lennysnewsletter.com/p/atomic-network [П: отрывок книги Chen].
- **Трудная сторона:** *"The hardest problem to solve in creating the first atomic network is, well, the hard side."*
  — https://andrewchen.com/solve-a-hard-problem-cold-start-problem/ [П].
- **Tinder и кампусы:** *"get 10 girls on the app before ever going to a sorority…"* —
  https://techcrunch.com/2014/07/09/whitney-wolfe-vs-tinder/ [В]. **Facebook:** больше половины бакалавров Гарварда
  за первый месяц, затем кампус за кампусом — https://en.wikipedia.org/wiki/History_of_Facebook [В].
- **«Come for the tool, stay for the network»** (Chris Dixon): *"initially attract users with a single-player tool
  and then, over time, get them to participate in a network"* — https://cdixon.org/2015/01/31/come-for-the-tool-stay-for-the-network [П].
- **Letterboxd** (дневник ценен одному): 1,8 млн (2020) → 17 млн (2024) → 30+ млн (07.2026) —
  https://en.wikipedia.org/wiki/Letterboxd [В]. **Hot or Not:** оценивать весело и одному, знакомства пристроены
  позже — https://en.wikipedia.org/wiki/Hot_or_Not [В]. **OkCupid** вырос из шуточных тестов SparkNotes —
  https://en.wikipedia.org/wiki/OkCupid [В].
- **Похожие по вкусу — готовая практика:** Criticker TCI от 3 общих названий — https://www.criticker.com/explain/
  [П, по выдаче поиска]; Last.fm «Neighbours» [П]; FilmAffinity «Movie Soulmates» [П]; MovieLens: *"All selected users
  had rated at least 20 movies"* — https://files.grouplens.org/datasets/movielens/ml-latest-small-README.html [П].
- **Худшее:** волна без атома рассыпается (Clubhouse −90 % установок —
  https://www.digitalmusicnews.com/2021/06/22/clubhouse-app-over/ [В]); фейковая наполненность (фейки Reddit —
  https://www.vice.com/en/article/how-reddit-got-huge-tons-of-fake-accounts--2/ [В]).

### 3.2 Активация и сохранение сделанного гостем

- **Duolingo:** *"Simply moving the sign-up screen back a few steps led to about a 20% increase in DAUs"*; *"Discard
  my progress"* заменили на *"Later"* — https://review.firstround.com/the-tenets-of-a-b-testing-from-duolingos-master-growth-hacker/ [П: интервью].
- **Отложенная регистрация** — https://alistapart.com/article/signupforms/ [П: Вроблевски].
- **Firebase:** `linkWithCredential` сохраняет UID и данные анонима —
  https://firebase.google.com/docs/auth/android/anonymous-auth [П]; аноним не переносится между устройствами —
  https://firebase.blog/posts/2023/07/best-practices-for-anonymous-authentication/ [П].
- **Встроенные браузеры:** *"All embedded webviews will be blocked starting on September 30, 2021"*, ошибка
  `disallowed_useragent` — https://developers.googleblog.com/upcoming-security-changes-to-googles-oauth-20-authorization-endpoint-in-embedded-webviews/ [П].
- **Критика «магических чисел»:** *"If you're looking for just one thing to indicate whether a user will be
  retained, you'll be hard pressed to find it."* — https://mixpanel.com/blog/magic-numbers-are-an-illusion/ [В].

### 3.3 Петли через пары и приглашения

- **Петли:** *"closed systems where the inputs through some process generate more of an output that can be
  reinvested in the input"* — https://www.reforge.com/blog/growth-loops [П].
- **Время цикла важнее K:** *"The most important factor… is not the Viral Coefficient, but the Viral Cycle Time"* —
  https://www.forentrepreneurs.com/lessons-learnt-viral-marketing/ [П].
- **Spotify Blend:** *"taste match score"* и *"shareable data stories that are unique to every listening pair"* —
  https://newsroom.spotify.com/2021-08-31/how-spotifys-newest-personalized-experience-blend-creates-a-playlist-for-you-and-your-bestie/ [П];
  Wrapped в формате сторис, 60 млн расшаренных карточек в 2021 — https://time.com/6340656/spotify-wrapped-guide-2023/ [В].
- **Число совместимости меняет поведение** (OkCupid показывал 30 % как 90 %) —
  https://www.forbes.com/sites/kashmirhill/2014/07/28/okcupid-experiment-compatibility-deception/ [В] — отсюда:
  число Похожести не подкручивается никогда.
- **Импорт контактов больше не работает** (Goodreads) и дорог (LinkedIn $13 млн) —
  https://www.newsweek.com/linkedin-13-million-class-action-lawsuit-emails-379975 [В].

### 3.4 Посадочная для трафика из коротких роликов

- В подписи Reels ссылка не кликается — ссылка в профиле и стикер в сторис; YouTube отключил ссылки в описаниях
  Shorts с 31.08.2023 — https://techcrunch.com/2023/08/10/youtube-is-disabling-links-on-shorts-to-cut-down-on-spam [В].
- **Message match** — *"how well your landing page copy matches the phrasing of the ad or link that brought the
  visitor there"* — https://unbounce.com/conversion-glossary/definition/message-match/ [П].
- **Медиана конверсии посадочных** 6,6 % (41 000 страниц) — https://unbounce.com/landing-pages/whats-a-good-conversion-rate/ [П].
- 53 % мобильных посетителей уходят при загрузке дольше 3 секунд —
  https://www.marketingdive.com/news/google-53-of-mobile-users-abandon-sites-that-take-over-3-seconds-to-load/426070/ [В].
- **Метки ссылок:** `utm_source`, `utm_medium`, `utm_campaign`, нижний регистр —
  https://support.google.com/analytics/answer/10917952 [П].

### 3.5 Метрики ранней стадии

- **OMTM:** *"At any given time, there's one metric you should care about above all else"* —
  https://leananalyticsbook.com/one-metric-that-matters/ [П]; **North Star** —
  https://amplitude.com/books/north-star/about-north-star-framework [П].
- **Малые числа:** пять человек дают основную массу находок юзабилити —
  https://www.nngroup.com/articles/why-you-only-need-to-test-with-5-users/ [П]; тест Эллиса осмыслен от ~40
  ответивших — https://review.firstround.com/how-superhuman-built-an-engine-to-find-product-market-fit/ [П].
- **Записи сессий:** PostHog маскирует поля ввода по умолчанию, текст — нет (`maskTextSelector`, `ph-no-capture`) —
  https://posthog.com/docs/session-replay/privacy [П].

### 3.6 Одна ставка за раз

- **Shape Up:** *"Appetites start with a number and end with a design"*; *"If they don't finish, by default the
  project doesn't get an extension"*; *"Backlogs are a big weight we don't need to carry"* —
  https://basecamp.com/shapeup/1.2-chapter-03 · https://basecamp.com/shapeup/2.2-chapter-08 ·
  https://basecamp.com/shapeup/2.1-chapter-07 [П]. **WIP-лимиты** — https://www.atlassian.com/agile/kanban/wip-limits [П].

## 4. Выводы → что это значит для эпика

| # | Вывод | Что делаем в эпике |
|---|---|---|
| 1 | Посадочная ролика = главная (№096 В6 = Б), message match и действие на первом экране | новая V1 на главной, заголовок на словах поиска (четыре варианта, выбор владельца) |
| 2 | Сделанное гостем не пропадает (Duolingo, Firebase) | звёзды демо → оценки гостя (№096 В8 = А), вход привязывает тот же UID |
| 3 | Плотность = общие оценки | общий стартовый набор: объекты демо — самые оцениваемые в каталоге; при качествах — развилка №096 В14 |
| 4 | Честный порог похожести | карточка связи при малом числе общих объектов говорит «общего пока мало» (текст — владельцу) |
| 5 | Пара — атом, короткий цикл | «Тест на совместимость» для двоих на пути после демо; карточка для сторис (владелец: «*берём в v1*») |
| 6 | Зрение пути | прибор числа недели; `entry` у `guest_start`; браузер у `landing_view`; метка ссылки у каждого ролика; журнал выкатов |
| 7 | Встроенные браузеры | замер доли; вход, работающий внутри Instagram, или подсказка «откройте в браузере» в момент входа через Google (вид — четыре макета) |
| 8 | Одна ставка, выключатель | ставка 1 — две недели, число недели в конце; не успели — пересборка, срок не продлевается сам |

## 5. Худшие решения — не берём, поимённо

1. Фейковые профили и боты «для жизни» (Ashley Madison, FTC $1,6 млн —
   https://www.ftc.gov/news-events/news/press-releases/2016/12/operators-ashleymadisoncom-settle-ftc-state-charges-resulting-2015-data-breach-exposed-36-million [П]).
2. Письма «вами заинтересовались» ради подписки (Match, FTC 2019 —
   https://www.ftc.gov/news-events/news/press-releases/2019/09/ftc-sues-owner-online-dating-service-matchcom-using-fake-love-interest-ads-trick-consumers-paying [П]).
3. Подкрутка числа похожести (OkCupid 2014). 4. Спам-приглашения по адресной книге. 5. Тёмные паттерны подписок и
   отмены (Match, FTC 2025 [П]). 6. Стрики, бесконечная лента, уведомления-крючки — против `GOAL.md`. 7. Покупка
   трафика в пустую сеть. 8. Ложь о наполненности. 9. Обязательный вход через соцсеть. 10. Регистрация первым экраном
   и угроза «потерять сделанное». 11. Записи сессий без маскировки текста.

## 6. Развилки владельцу

- **Что оценивают в демо** — фильмы героя, качества или то и другое (интервью №096, В14; числа — §2).
- **Заголовок главной** — один из четырёх вариантов на словах поиска (макет `design/new-landing-v1.html`).
- Ранее поставленные В11–В13 интервью №096 (вход по ссылке) — в работе ставки не блокируют.
