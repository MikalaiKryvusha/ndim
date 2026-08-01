# Исследование 26 — Поисковая видимость пререндеренного приложения: что реально работает в 2026

**Снято:** 2026-08-01 · **Заказано:** подкрепить ответы владельца на вопросы **В8** (`/en/` + hreflang),
**В9** (`og:image`), **В10** (регистрация в поисковиках) интервью
`interviews/interview_009_frictionless_entry.md` · **Обслуживает:** фазу SEO эпика «вход без трения»

> **Чем этот документ отличается от `researches/08`.** Тот собран 2026-07-11 — до покупки домена,
> до выката 2.0, до появления семнадцати экранов. Он отвечал на вопрос *«что вообще нужно сделать»*.
> Этот отвечает на другой: ***что из сделанного работает, что за год устарело и во что обойдётся
> каждый следующий шаг.*** Дублирования нет намеренно — §2 перечисляет, что осталось в `researches/08`
> и здесь не повторяется, §3 перечисляет, что там **устарело или оказалось неверным**.
>
> **Дисциплина источников.** У каждого факта — URL и дословная цитата. Позиция поисковика помечена
> **ОФИЦИАЛЬНО**, всё остальное — **МНЕНИЕ**, даже если автор уверен. SEO-ниша переполнена
> пересказом слухов, и §9 показывает это на живом примере: блоги массово пишут про ужесточение
> порога LCP в 2026 году, чего в документации Google нет.
>
> **Про наш случай ничего не взято на слово.** Всё в §1 — замеры по собранному `build/`, а не
> чтение исходников. Раздел §5 содержит **проведённый эксперимент**, а не рассуждение.
> Живой справочник — не помечается DONE.

---

## §0. Резюме: что этот обзор меняет в постановке задачи

| Было в наших документах | Разведка и замеры показали |
|---|---|
| Интервью №009: «`hreflang` и per-URL i18n» — самая крупная и самая дорогая дыра (В8) | **Дыра не в `hreflang`, а в том, что английского текста нет ни в одном отданном HTML.** `hreflang` без отдельных адресов бессмыслен, а отдельный адрес без `hreflang` уже работает. Это два шага разной цены, и интервью склеило их в один |
| `researches/08` §6: внедрение `/en/` — «порядка одного дня работы» | **Оценка занижена по объёму работы, но завышена по риску.** Механика проверена экспериментом (§5): обе ветки `[[lang]]` пререндерятся, краулер сам находит `/en/` по `hreflang`-ссылке, `<html lang>` чинится хуком. Неожиданной оказалась не техника, а **разбросанность языка по 12 файлам** |
| Считалось, что главная SEO-проблема — двуязычие | **Главная проблема — объём индексируемого текста.** В бою 19 пререндеренных страниц, из них поиску открыты **две**. Замер: 3 692 знака открыто, **53 385 знаков закрыто `noindex`**, и около 46 000 из них — обычный публичный текст, у которого нет причин быть закрытым |
| «Нужен JSON-LD (`WebSite`/`Organization`)» (интервью №009, раздел «что сделаю сам») | Половина верна. `WebSite` и `Organization` документированы, а `SearchAction`, `FAQPage`, `HowTo`, «разметка под AI Overviews» — **карго-культ**, причём три из четырёх Google официально похоронил (§7) |
| «AI-поиск требует особой подготовки, `llms.txt`» | **Google официально: не требует ничего.** Дословно — «You don't need to create new machine readable files, AI text files, or markup». Замер по 137 тыс. доменов: 97 % файлов `llms.txt` не прочитаны никем (§6) |
| «`og:image` 1200×630 — общепринятый стандарт» | **Это число Meta, а не Open Graph.** В спецификации размера нет вовсе; 1200×630 годится потому, что одновременно проходит минимумы Meta, LinkedIn и допуск X. А узкое место — не размер, а **вес: 600 КБ у WhatsApp** (§8) |
| `researches/08` §2: 301 с `web.app` на домен «сделать конфигом хостинга нельзя» | **Неверно — и мы сами это опровергли в бою.** В `firebase.json` ровно такой редирект и стоит; механизм — два сайта Hosting в одном проекте (§3) |

---

## §1. Наш случай, снятый прибором (не по исходникам — по собранному `build/`)

Всё ниже получено из артефакта `npm run build` 2026-08-01. Метод указан у каждой строки, чтобы
следующая сессия могла повторить замер, а не поверить.

### 1.1 Что уехало в бой в `<head>` лендинга

Извлечено из `build/index.html`:

| Есть | Нет |
|---|---|
| `<link rel="canonical" href="https://ndimspace.app/">` | `og:image` |
| `<meta name="description">` | `twitter:card` |
| `og:title`, `og:description`, `og:type`, `og:url` | JSON-LD любого типа |
| `og:locale` — **всегда `ru_RU`** | `hreflang` / `<link rel="alternate">` |

`og:locale` в исходнике зависит от языка (`lang === 'en' ? 'en_US' : 'ru_RU'`,
`src/routes/+page.svelte:182`), но пререндер фиксирует русскую ветку — в отданном файле стоит
`ru_RU`, и ничего другого никакой краулер или скрапер превью не увидит.

### 1.2 🔴 Английской версии не существует — замер, а не оценка

Проверка: шесть английских строк лендинга искались во **всех** файлах `build/**/*.html`.

```
НЕТ  New Dimension Friendships        НЕТ  Your unique multi-dimensional profile
НЕТ  Welcome to the NDim Space        НЕТ  Real Connections
НЕТ  Create Account                   НЕТ  Log In
```

Ни одного вхождения. При этом те же строки **лежат в JS-чанке**
`build/_app/immutable/nodes/2.RGybtH5z.js` — то есть мы платим за английский трафиком байтов и не
получаем от него ни одной индексируемой страницы. Формулировка интервью №009 («самая большая
невозвращённая инвестиция в проекте») подтверждается замером буквально.

Важное уточнение к постановке В8: это **не** «плохо размечено» и **не** «`hreflang` отсутствует».
Английский контент физически отсутствует в DOM до клика человека. Никакая разметка этого не лечит —
лечит только отдельный адрес с английским текстом.

### 1.3 🔴 Самая крупная находка: поиску открыты две страницы из девятнадцати

Метод: для каждого `build/**/*.html` снят объём видимого текста (скрипты и стили вырезаны, теги
сняты) и наличие `noindex`.

| Знаков | Состояние | Страница |
|---:|---|---|
| 20 633 | `noindex` | `/menu/manual` — руководство пользователя |
| 8 002 | `noindex` | `/menu/terms` — условия |
| 4 612 | `noindex` | `/menu/about` — о системе |
| 4 110 | `noindex` | `/menu/privacy` — политика |
| 3 265 | `noindex` | `/menu/disclaimer` — отказ от ответственности |
| **2 569** | **индексируется** | **`/` — лендинг** |
| 1 598 | `noindex` | `/menu/donate` |
| 1 357 | `noindex` | `/menu/share` |
| 1 332 | `noindex` | `/menu/support` |
| 1 322 | `noindex` | `/menu` |
| 1 229 | `noindex` | `/menu/author` — об авторе |
| **997** | **индексируется** | **`/delete-account`** |
| 1 061 / 1 017 / 989 / 981 / 977 / 900 | `noindex` | `/space`, `/account`, `/dims`, `/relations`, `/profile`, `/auth/action` — **закрыты по делу** |

**Итого: 3 692 знака открыто поиску против 53 385 закрытых.** Из закрытых примерно **46 000 знаков —
обычный публичный текст** (руководство, условия, о системе, политика, отказ, поддержать, поделиться,
об авторе), который никакой приватности не содержит и открыт любому без входа.

Причина — одна строка в общей оболочке документов:

```svelte
<!-- src/lib/ui/DocShell.svelte:41-42 -->
<title>NDim Space — {title[lang]}</title>
<meta name="robots" content="noindex" />
```

**Обоснования у этой строки в комментарии нет.** Соседние `noindex` в проекте объяснены (приватные
экраны, заглушка до миграции), а этот — нет: похоже на умолчание «все экраны приложения закрыты»,
которое механически накрыло страницы документации. Ни один e2e-страж на `noindex` у страниц `/menu/*`
не опирается (`grep noindex e2e/` даёт `account`, `dims`, `profile`, `relations`, `space` — все
действительно приватные), то есть снятие ничего не ломает.

Это самый выгодный шаг всего документа: **одна строка + список в карте сайта дают поиску в 13 раз
больше текста, чем у него есть сегодня.**

### 1.4 Вес и раскладка первого экрана (материал для §9)

| Замер | Значение |
|---|---|
| JS первого экрана (14 `modulepreload`, несжатый) | **144 КБ** |
| `build/index.html` | 34,0 КБ |
| Шрифты | только системные (`system-ui`, `-apple-system`, `Segoe UI`) — **веб-шрифты не грузятся** |
| Внешние домены в HTML | **ни одного**, кроме `ndimspace.app` |
| Картинки лендинга | 3 лица персонажей, `loading="lazy"` |
| Вес этих картинок | 144 + 169 + 157 = **470 КБ PNG**, отрисованных в боксе **40×40 px** |
| Резерв места | задан CSS (`.ava { width: 40px; height: 40px }`) — **сдвига раскладки не будет** |

Профиль здоровый: нет веб-шрифтов, нет третьих сторон, TTFB закрыт статикой. Единственная явная
неопрятность — 470 КБ растра ради трёх кружков по 40 пикселей (в проекте уже используется `webp`).

### 1.5 Карта сайта, `robots.txt`, хостинг

- `sitemap.xml` — пререндеренный эндпоинт, **два адреса**: `/` и `/delete-account`
  (`src/routes/sitemap.xml/+server.ts:22`). Ровно столько, сколько сейчас индексируется, — карта
  честна, но пуста не по своей вине.
- `robots.txt` — обход разрешён, `Sitemap:` абсолютным URL. Правильно.
- `firebase.json` — `cleanUrls: true` на обоих сайтах; `ndim-space.web.app` отдаёт **301 на домен**
  по семи маршрутам. Дублей хостов нет (см. §3, п. 1 — это опровергает `researches/08`).
- `static/404.html` есть.
- `trailingSlash` нигде не задан → умолчание `'never'`; с `cleanUrls: true` адреса чистые и без
  дублей со слэшем.

### 1.6 Где живёт язык (материал для оценки В8)

`localStorage.getItem('ndim-lang')` читается **в 12 файлах независимо**; общего модуля языка нет
(в отличие от темы — у неё есть `src/lib/ui/theme.svelte.ts`). Плюс инлайн-скрипт в `src/app.html:36`
ставит `lang` на `<html>` из `localStorage` **на каждой странице**. Это прямо влияет на цену В8 (§5.4).

Словарь самого лендинга при этом маленький: **21 пара `ru`/`en`** в `src/routes/+page.svelte`.

---

## §2. Что уже сказано в `researches/08` и здесь не повторяется

Эти разделы остаются в силе, проверены и переиспользуются как есть — идти за ними туда:

| Раздел `researches/08` | Что там, и почему это не дублируется здесь |
|---|---|
| §2 «Домен: привязка к Firebase Hosting» | Порядок TXT + A-записей, автоматический SSL, сроки. **Исполнено 2026-07-11**, домен в бою |
| §4 «sitemap.xml и robots.txt» | Лимиты 50 000 URL / 50 МБ, игнорирование `<priority>`/`<changefreq>`, канонический способ генерации эндпоинтом SvelteKit, антипаттерн «`noindex` + запрет в robots.txt». Всё исполнено и всё ещё верно |
| §5 «canonical» | Иерархия сигналов каноничности, абсолютный URL, самоканоникал, кросс-доменный canonical. Исполнено |
| §7 «Специфика Firebase Hosting» | `cleanUrls`, `trailingSlash`, кеш и его сброс при деплое, `404.html`, публичность preview-каналов. Исполнено, кроме `Cache-Control: immutable` (оптимизация, не SEO) |
| §3 «Bing Webmaster Tools» | Импорт из GSC одной кнопкой — механика не менялась |
| §6, первая половина | Почему клиентский свап языка не существует для поисковика. Здесь этот вывод **подтверждён замером** (§1.2), а не пересказан |

Здесь — только то, чего в `researches/08` нет вовсе: AI-поиск и `llms.txt` (§6), состояние
schema.org после трёх похорон Google (§7), `og:image` и превью (§8), пересборка Core Web Vitals
после INP (§9), актуальные требования `hreflang` обоих поисковиков (§4), **эксперимент** по цене
per-URL i18n в нашем стеке (§5) и порядок действий по отношению «эффект / трудоёмкость» (§13).

---

## §3. 🔴 Что в `researches/08` УСТАРЕЛО или оказалось неверным

Самая ценная часть документа: на этих утверждениях сессия может построить неверное решение.

### 1. НЕВЕРНО: «301 с `web.app` на домен конфигом хостинга сделать нельзя»

`researches/08` §2 утверждает:

> «`redirects` в `firebase.json` матчатся **по пути**, не по хосту […] сделать 301
> `web.app → ndim.space` конфигом хостинга нельзя (без Cloud Functions, которых у нас нет)».

Посылка верна, **вывод неверен**. Решение — не редирект по хосту, а **два сайта Hosting в одном
проекте**, у каждого свой конфиг:

> «Each site has its own hosting configuration. Each site hosts its own collection of content.»
> — [firebase.google.com/docs/hosting/multisites](https://firebase.google.com/docs/hosting/multisites)

Мы это и сделали: `.firebaserc` объявляет цели `landing → ndimspace` и `app → ndim-space`, а
`firebase.json` вешает на второй сайт семь 301-редиректов на домен. То есть **самый сильный сигнал
каноничности у нас уже стоит**, и рассуждения `researches/08` о том, что дубли хостов гасит только
`canonical`, устарели. `canonical` остаётся как второй рубеж, а не как единственный.

### 2. УСТАРЕЛО: домен назван `ndim.space`, каталог языка — `ndim.space/en/`

По всему `researches/08` фигурируют `ndim.space` и `ndim.app` — оба имени оказались заняты
(`researches/09`). Канон: **`ndimspace.app`** (`AGENT_GUIDE.md` → «Идентичность проекта»). Любая
цитата вида «`Sitemap: https://ndim.space/sitemap.xml`» из §4 — черновик, а не образец.

### 3. УСТАРЕЛО: «страница одна», «сайт из 1–2 страниц»

Оценки §4 («для сайта из 1–2 страниц sitemap не критичен»), §5 («`<title>` и `description` уже есть
и уникальны — страница одна») и §6 («сейчас, пока страница одна») описывают состояние до выката 2.0.
В бою **19 пререндеренных страниц**, и §1.3 показывает, что главный вопрос теперь не «нужна ли
карта сайта», а «почему семнадцать из них закрыты».

### 4. УСТАРЕЛО: «JSON-LD `WebSite` — сразу после домена» без оговорок

`researches/08` §5 рекомендует `WebSite` и упоминает его роль для «site name». Роль сохранилась, но
за это время Google **удалил sitelinks search box** — то есть `SearchAction` внутри `WebSite`,
который ставят по привычке, стал мёртвым кодом (§7.2). Кроме того, у `WebSite` появились жёсткие
условия, которых в `researches/08` нет: только на главной, только одно имя на домен, не на уровне
подкаталога.

### 5. УСТАРЕЛО: «`og:image` … размер 1200×630 — общепринятая практика, *не спецификация*»

Оговорка была честной и остаётся верной по букве, но за год выяснилось, кто именно этот размер
документирует (§8) — то есть «не спецификация» ≠ «ничем не подтверждено».

### 6. ТРЕБУЕТ ПРОВЕРКИ: «preview-канал живёт до 2026-08-10»

`researches/08` §7 называет канал `ndim-space--landing-3jvzs4cd.web.app` и дату его смерти —
**через девять дней после снятия этого документа**. Если канал ещё жив, проверить, что он не
индексируется; если умер — вычеркнуть абзац.

### 7. НЕ УСТАРЕЛО, но получило подтверждение сильнее прежнего

§8 `researches/08` про Core Web Vitals написан осторожно и **устоял целиком**: набор метрик, статус
«один из многих сигналов», приоритет релевантности. Единственное, что изменилось, — Google убрал
page experience из списка систем ранжирования (§9.3), и это усиливает исходный вывод, а не отменяет.

---

## §4. `hreflang` и per-URL i18n: чего требуют Google и Яндекс сегодня

### 4.1 Что обязательно у Google

**ОФИЦИАЛЬНО** — [developers.google.com/search/docs/specialty/international/localized-versions](https://developers.google.com/search/docs/specialty/international/localized-versions):

| Требование | Дословно |
|---|---|
| Три способа равноправны | «The three methods are equivalent from Google's perspective and you can choose the method that's the most convenient for your site.» |
| Двусторонность — жёстко | «If two pages don't both point to each other, the tags will be ignored.» |
| Самоссылка обязательна | «Each language version must list itself as well as all other language versions.» |
| `x-default` | «The reserved `x-default` value is used when no other language/region matches the user's browser setting.» |
| Коды языков | «The first code of the `hreflang` attribute is the language code (in ISO 639-1 format) followed by an optional second code that represents the region code (in ISO 3166-1 Alpha 2 format).» |

Частые ошибки, названные самим Google: «Missing return links», «Incorrect language codes»,
«Incorrect region codes». Первая — наша будущая: односторонняя разметка не «работает хуже», она
**игнорируется целиком**, то есть выглядит как сделанная работа и не даёт ничего.

**Отдельно и важно для В8:** `hreflang` у Google — **не требование, а помощь**. Формулировка
рекомендательная — «use `hreflang` annotations **to help** Google Search results link to the correct
language version of a page»
([managing-multi-regional-sites](https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites)).
Требование там ровно одно, и оно про адреса:

> «Google recommends using different URLs for each language version of a page rather than using
> cookies or browser settings to adjust the content language on the page.»

Из этого следует практический вывод, которого нет в интервью №009: **`/en/` без `hreflang` уже
приносит пользу** (страница индексируется и ранжируется), а **`hreflang` без `/en/` не приносит
ничего**. Это два шага, и их можно и нужно разнести по цене.

Структура адресов — там же, сравнение четырёх вариантов. Подкаталог (`example.com/de/`): «Easy
setup, low maintenance»; URL-параметры (`site.com?loc=de`) — **«Not recommended»**. Наш выбор
`/en/` — рекомендованный.

И запрет, который стоит помнить, когда захочется «умного» переключателя:

> «Avoid automatically redirecting users from one language version of a site to a different language
> version of a site. […] These redirections could prevent users (and search engines) from viewing all
> the versions of your site.»

### 4.2 Что у Яндекса — и чем он отличается

**ОФИЦИАЛЬНО** — [yandex.ru/support/webmaster/yandex-indexing/locale-pages.html](https://yandex.ru/support/webmaster/yandex-indexing/locale-pages.html):

> «Яндекс больше не поддерживает файл Sitemap для языковых версий. Рекомендуем использовать
> разметку локализованных страниц.»

> «На каждой версии страницы укажите ссылки на все ее альтернативные версии. Для этого в элементе
> `head` добавьте элемент `link`.»

`x-default` поддержан:

> «Если язык страницы определяется автоматически (например, через IP-адрес или заголовок
> Accept-Language), добавьте эту информацию в разметку вместе с другими жестко локализованными
> страницами, используя `hreflang="x-default"`.»

Коды — те же ISO 639-1 / ISO 3166-1 Alpha-2.

**Практический вывод:** размещать `hreflang` нужно **именно `<link>` в `<head>`**. Google принимает
все три способа, Яндекс — только разметку. Один способ закрывает обоих; выбор «положим в sitemap,
там аккуратнее» закрыл бы только Google.

### 4.3 Что мы теряем, если НЕ делать (случай Б в В8)

Честный ответ разбивается на измеримое и неизмеримое.

**Измеримое (наш замер, §1.2):** английского текста нет ни в одном отданном HTML. Не «хуже
ранжируется» — **отсутствует**. Английский поисковый запрос не может привести к нам никого, потому
что приводить нечего. Это не прогноз, а свойство артефакта.

**Неизмеримое:** сколько именно англоязычного трафика мы недополучаем. **Замера не нашёл, и
достоверно его получить нельзя** — потерянный трафик по несуществующим страницам не измеряется ни
одним инструментом. Любая цифра здесь была бы выдумкой. Ближайшее, что можно сделать честно:
после запуска `/en/` смотреть в Search Console срез по стране и языку и мерить факт, а не гадать
заранее.

**Что стоит держать в голове против аргумента «отложим»:** отдельная страница живёт в индексе тем
дольше, чем раньше появилась, но **официального подтверждения «возраста страницы» как фактора
ранжирования у Google нет** — в интервью №009 («возраст домена работает на того, кто начал раньше»)
это МНЕНИЕ, а не факт поисковика. Аргумент «сделать раньше» держится не на возрасте, а на другом,
проверяемом: чем больше экранов появится до внедрения, тем больше страниц придётся переносить в
схему (§5.5).

---

## §5. Сколько это стоит в НАШЕМ стеке — эксперимент, а не рассуждение

Это ключевой раздел для В8. Всё ниже — не чтение документации, а **проведённый и снятый опыт** на
нашем дереве: `SvelteKit 2.63`, `Svelte 5.56`, `adapter-static 3.0.10`, `vite 8`.

### 5.1 Что говорит документация (и где в ней ловушка)

Три факта из первоисточника:

> «SvelteKit will discover pages to prerender automatically, by starting at entry points and crawling
> them.» — [svelte.dev/docs/kit/page-options](https://svelte.dev/docs/kit/page-options)

> «A route like `[lang]/home` contains a parameter named `lang` which is required. Sometimes it's
> beneficial to make these parameters optional […] You can do that by wrapping the parameter in
> another bracket pair: `[[lang]]/home`»
> — [svelte.dev/docs/kit/advanced-routing](https://svelte.dev/docs/kit/advanced-routing)

🔴 **Ловушка, ради которой стоит читать конфиг, а не гайды:**

> «The `*` string includes all routes containing no required `[parameters]` **with optional
> parameters included as being empty** (since SvelteKit doesn't know what value any parameters should
> have).» — [svelte.dev/docs/kit/configuration](https://svelte.dev/docs/kit/configuration)

То есть по умолчанию из `[[lang]]` пререндерится **только пустая ветка** (`/`), а `/en` — нет.
Именно на этом спотыкаются в экосистеме: [sveltejs/kit#9913](https://github.com/sveltejs/kit/issues/9913).
Обычный ответ — руками перечислять адреса в `entries()` или в `prerender.entries`, и это тот
источник трудоёмкости, из-за которого оценка «`/en/` — заметная работа» выглядит правдоподобно.

### 5.2 🟢 Эксперимент показал, что перечислять руками НЕ придётся

Я завёл временный маршрут `src/routes/__probe/[[lang]]/+page.svelte` с обычной двусторонней
разметкой `hreflang` в `<svelte:head>` — **без** `entries()`, без правки `prerender.entries` — и
собрал проект.

```
$ npm run build            → ✓ built in 4.43s
build/__probe.html         → PROBE LANG = ru
build/__probe/en.html      → PROBE LANG = en      ← появился САМ
```

**Обе ветки пререндерились.** Причина — в исходнике краулера SvelteKit
(`node_modules/@sveltejs/kit/src/core/postbuild/crawl.js:199-208`): он забирает `href` **с любого
тега**, если в `rel` нет слова `external`:

```js
if (href) {
  if (tag === 'BASE') { … }
  else if (!rel || !/\bexternal\b/i.test(rel)) { push_href(href); }
}
```

То есть **сама разметка `hreflang` и служит краулеру списком адресов**. Это снимает главный
источник трудоёмкости целиком: `entries()` не нужен, список языковых адресов не дублируется, а
пререндер вдобавок **валидирует** эти ссылки — опечатка в `hreflang` уронит сборку, а не уедет в бой.

⚠️ Оговорка честности: эксперимент проверил механику на одном маршруте. Он **не** проверял, что
перенос лендинга целиком пройдёт без сюрпризов, — это отдельная работа со своей проверкой.

### 5.3 🟢 `<html lang>` чинится хуком, и хук работает при пререндере

Второй известный камень: `src/app.html` содержит **жёстко зашитый** `<html lang="ru">`, поэтому
английская ветка отдавалась бы с русским `lang`. Замер это подтвердил: до правки
`build/__probe/en.html` содержал `<html lang="ru">`.

Документация обещает, что серверный хук исполняется при пререндере:

> «This function runs every time the SvelteKit server receives a request — whether that happens while
> the app is running, **or during prerendering** — and determines the response.»
> — [svelte.dev/docs/kit/hooks](https://svelte.dev/docs/kit/hooks)

Проверил. Временный `src/hooks.server.ts` в семь строк:

```ts
export const handle: Handle = async ({ event, resolve }) => {
  const lang = event.url.pathname.startsWith('/__probe/en') ? 'en' : 'ru';
  return resolve(event, {
    transformPageChunk: ({ html }) => html.replace('<html lang="ru"', `<html lang="${lang}"`),
  });
};
```

Результат сборки:

```
build/__probe/en.html   → <html lang="en"      ← починено
build/__probe.html      → <html lang="ru"
build/index.html        → <html lang="ru"      ← не задет
```

**Вывод: `<html lang>` на языковых адресах стоит семь строк один раз на весь проект.** Зонд и хук
после замера удалены, дерево чистое, `build/` пересобран начисто.

### 5.4 ⚠️ Единственный настоящий подводный камень — наш собственный код

Инлайн-скрипт в `src/app.html:36` делает так:

```js
var l = localStorage.getItem('ndim-lang') || 'ru';
d.setAttribute('lang', l);
```

Он выполняется **на каждой странице до отрисовки**. Значит человек, у которого в памяти браузера
записан `ru`, откроет `/en/` — и первым же кадром `lang` вернётся в `ru`, а язык текста, читаемый
из того же ключа в 12 файлах (§1.6), перепишет английскую страницу русской. Поисковику это не
навредит (у робота нет `localStorage`), **а живому человеку — да**, и это классическая ловушка
«работает у робота, ломается у людей».

Лечение простое и в духе проекта: на языковых адресах **источник истины — адрес**, а `localStorage`
служит памятью только там, где адрес языка не задаёт. Это правка того же инлайн-скрипта и общего
модуля языка, которого у нас пока нет.

### 5.5 Честная оценка трудоёмкости В8 — по частям, а не одним числом

Оценка дана в **единицах работы**, а не в часах: часы у сессии агента ничего не значат, а объём
проверяем. Порядок — от дешёвого к дорогому.

| Шаг | Что делается | Объём | Проверяемо |
|---|---|---|---|
| **Ш1. Английский лендинг отдельным адресом** | `[[lang]]` вокруг корня; словарь лендинга — 21 пара `ru`/`en`, уже готов и вынесен почти механически; `title`/`description`/`og:*`/`canonical` берут язык из параметра | **1 маршрут, 1 модуль словаря** | `build/en.html` существует и содержит английский текст |
| **Ш2. `hreflang` + `x-default`** | По три `<link>` на каждой из двух страниц, двусторонне | **6 строк** | Пререндер валидирует ссылки; сборка падает на опечатке |
| **Ш3. `<html lang>` и `og:locale`** | `hooks.server.ts` с `transformPageChunk` | **7 строк, проверено §5.3** | `grep '<html lang' build/en.html` |
| **Ш4. Карта сайта** | Добавить `/en/` в `PUBLIC_PATHS` | **1 строка** | `e2e/seo.spec.ts` |
| **Ш5. 🔴 Развести язык и память браузера** | Общий модуль языка; на языковых адресах правит адрес, не `localStorage`; правка инлайн-скрипта `app.html` | **12 файлов читают ключ независимо** — это и есть основная работа | Живой прогон Chrome: `/en/` остаётся английской у человека с `ru` в памяти |
| **Ш6. Стражи** | `e2e`: `/en/` пререндерена, английский текст в сыром HTML, `hreflang` двусторонний, `lang="en"` | **~1 файл сценариев** | `npm run e2e` |

**Честный итог для владельца.** Шаги Ш1–Ш4 — **малая работа**: техника проверена экспериментом,
неизвестных не осталось, объём — один маршрут и полтора десятка строк. Шаг Ш5 — **средняя**, и он
не про SEO вовсе: это уборка нашего собственного долга (язык размазан по 12 файлам без общего
источника). Шаг Ш6 обязателен по канону проекта.

Это заметно **меньше**, чем предполагало интервью №009 («заметная работа: маршруты, пререндер,
двусторонние `hreflang`, вторая карта сайта»), — по трём из четырёх названных пунктов цена
оказалась в строках, а не в днях. Но появился пятый пункт, которого интервью не называло, и он
дороже остальных вместе.

**И главное про масштаб.** Сегодня схема нужна ровно **двум** адресам — индексируемым (§1.3).
Остальные 17 экранов под `noindex`, и переводить их на языковые адреса **не нужно**: за стеной
входа язык честно живёт в памяти браузера. Если же сначала снять `noindex` с документов (§1.3), то
языковых адресов станет одиннадцать — поэтому **порядок имеет значение**: делать Ш1–Ш6 либо до
раскрытия документов, либо сразу с их учётом.

---

## §6. AI-поиск и `llms.txt`: мода или стандарт

Владелец просил ответить прямо: тратить ли на это время. **Отвечаю: нет.** Ниже — почему, с
первоисточниками, и это тот редкий случай, когда позиция поисковика и независимый замер совпадают.

### 6.1 Официальная позиция Google — «делать ничего не нужно»

В мае 2026 Google выпустил отдельный документ ровно по этому вопросу.

**ОФИЦИАЛЬНО** — [developers.google.com/search/docs/fundamentals/ai-optimization-guide](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide)
(*Last updated 2026-07-10*):

> «You don't need to create new machine readable files, AI text files, markup, or Markdown to appear
> in Google Search (including its generative AI capabilities), **as Google Search itself doesn't use
> them**.»

> «Doing so will neither harm nor help your site's visibility or rankings in Google Search, as Google
> Search ignores them.»

Про сам термин «оптимизация под ИИ»:

> «From Google Search's perspective, optimizing for generative AI search is optimizing for the search
> experience, and thus **still SEO**.»

Что действительно требуется, чтобы попасть в ИИ-ответ:

> «To be eligible to be shown in generative AI features on Google Search, a page must be **indexed and
> eligible to be shown in Google Search with a snippet**.»

**ОФИЦИАЛЬНО** — [developers.google.com/search/docs/appearance/ai-features](https://developers.google.com/search/docs/appearance/ai-features):

> «There are no additional requirements to appear in AI Overviews or AI Mode, nor other special
> optimizations necessary.»

> «You don't need to create new machine readable files, AI text files, or markup to appear in these
> features. **There's also no special schema.org structured data that you need to add.**»

**Что из этого следует для нас.** Условие попадания в ИИ-ответ Google — быть проиндексированным и
показываемым со сниппетом. То есть **лучшая подготовка к ИИ-выдаче у нас — это §1.3**: семнадцать
страниц под `noindex` для ИИ-ответов не существуют ровно по той же причине, по которой их нет в
обычной выдаче. Отдельной работы «под ИИ» не требуется, и любой её план — трата.

### 6.2 `llms.txt` — предложение, а не стандарт

Первоисточник — [llmstxt.org](https://llmstxt.org/), Jeremy Howard, 3 сентября 2024:

> «We propose adding a `/llms.txt` markdown file to websites to provide LLM-friendly content.»

Страница называет это **proposal**; **ни одного заявления об адопции поисковиками или
ИИ-провайдерами на ней нет** — проверено чтением самой страницы.

### 6.3 Замер: файл читают почти нигде

**Замер третьей стороны (не поисковика), но с описанной методикой** — Ahrefs,
[ahrefs.com/blog/llmstxt-study/](https://ahrefs.com/blog/llmstxt-study/), 15 июня 2026:

> «Our study focuses on all **137,210 domains** in Ahrefs Web Analytics that received traffic in May 2026.»

> «28% of the 137K domains using Ahrefs Web Analytics publish an llms.txt file»

> «**97% of those files received zero traffic in May 2026.**»

Вывод авторов:

> «If your goal is showing up in ChatGPT, Perplexity, or AI Overviews, an llms.txt file is largely
> **decoration**.»

⚠️ Это данные вендора SEO-инструмента, а не поисковика. Методика описана и воспроизводима, поэтому
привожу; но помечаю честно: **не официальный источник**.

### 6.4 Что говорят сотрудники Google (мнение, не документация)

**МНЕНИЕ** (John Mueller, Google Search Advocate, апрель 2025; первоисточник — пост в соцсети,
цитируется по [searchenginejournal.com](https://www.searchenginejournal.com/google-says-llms-txt-comparable-to-keywords-meta-tag/544804/);
**оригинал сам не открывал**): Мюллер сравнил `llms.txt` с мета-тегом `keywords` — разметкой, которой
не пользуется ни один поисковик, потому что содержимому, которое сайт объявляет о себе сам, доверять
нельзя. **Помечаю как мнение сотрудника, а не позицию продукта** — позиция продукта в §6.1, и она
сформулирована сильнее и без метафор.

### 6.5 Ни у одного ИИ-поисковика нет консоли вебмастера

Проверено по документации вендоров: у OpenAI, Anthropic и Perplexity **нет** ни регистрации сайта,
ни подтверждения прав, ни консоли. Управление — только `robots.txt` по user-agent:

- **OpenAI** — [developers.openai.com/api/docs/bots](https://developers.openai.com/api/docs/bots):
  `OAI-SearchBot`, `GPTBot`, `ChatGPT-User`, `OAI-AdsBot`. Существенно: закрыть `OAI-SearchBot` =
  выпасть из поисковых ответов ChatGPT.
- **Anthropic** — [support.claude.com/…/8896518](https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler):
  `ClaudeBot`, `Claude-User`, `Claude-SearchBot`; список IP — `https://claude.com/crawling/bots.json`.
- **Perplexity** — [docs.perplexity.ai/guides/bots](https://docs.perplexity.ai/guides/bots):
  `PerplexityBot`, `Perplexity-User`.
- **Google-Extended** — [google-common-crawlers](https://developers.google.com/search/docs/crawling-indexing/google-common-crawlers):
  «Google-Extended doesn't have a separate HTTP request user agent string. […] the robots.txt
  user-agent token is used in a control capacity» + «Google-Extended does not impact a site's
  inclusion in Google Search nor is it used as a ranking signal».

Наш `robots.txt` разрешает всё — значит все перечисленные боты уже допущены. Единственное осмысленное
решение здесь — **не закрыть их случайно**.

### 6.6 Сколько трафика на самом деле идёт через ИИ

**Замера, на который можно опереться, я не нашёл.** Публикации SEO-вендоров (Semrush, Similarweb,
Ahrefs) меряют рост ИИ-переходов в разы, но **долю ИИ-трафика относительно органики не приводят**: в
клик-стрим-исследовании Semrush (1 млрд строк, октябрь 2024 — февраль 2026) сопоставления с общим
объёмом органики Google нет вовсе. Поэтому:

- «Трафик всё чаще идёт через ИИ-ответы» — **правдоподобная тенденция без числа**.
- Любая конкретная цифра доли, встреченная в блоге, — **МНЕНИЕ**.
- Для нашего масштаба вопрос практически не стоит: Google прямо говорит, что отдельной работы под ИИ
  не существует, а условие попадания — обычная индексируемость.

**Итог §6: `llms.txt` — мода, времени владельца он не стоит.** Того же результата достигает шаг,
который обязателен и без всякого ИИ: открыть поиску то, что уже написано (§1.3).

---

## §7. JSON-LD: что даёт эффект, а что карго-культ

Область, где фольклора особенно много, а Google за три года похоронил три популярных типа. Рамка от
самого Google:

> «Google uses structured data to understand the content on the page and show that content in a
> **richer appearance** in search results, which is called a rich result.»
> — [search-gallery](https://developers.google.com/search/docs/appearance/structured-data/search-gallery)

### 7.1 Разметка не влияет на ранжирование

**ОФИЦИАЛЬНО** — [sd-policies](https://developers.google.com/search/docs/appearance/structured-data/sd-policies):

> «A structured data manual action means that a page loses eligibility for appearance as a rich
> result; **it doesn't affect how the page ranks in Google web search.**»

> «**Important:** Google does not guarantee that your structured data will show up in search results,
> even if your page is marked up correctly according to the Rich Results Test.»

> «Using structured data **enables** a feature to be present, it does not **guarantee** that it will be present.»

**ОФИЦИАЛЬНО, и сказано прямее, чем у Google** — Яндекс,
[schema-org/semantic-faq](https://yandex.ru/support/webmaster/ru/schema-org/semantic-faq):

> «Разметка может сделать ваш сайт более заметным в Поиске Яндекса… **Однако, напрямую семантическая
> разметка не влияет на ранжирование.**»

> «Робот Яндекса сможет проиндексировать информацию с сайта и без разметки, на показ страниц в поиске
> это не повлияет.»

⚠️ Честная оговорка: прямой фразы «structured data is not a ranking factor» **в документации Google
нет** — есть только формулировка про ручные санкции. Самое прямое высказывание принадлежит Мюллеру в
соцсети, то есть это **МНЕНИЕ сотрудника**. Позиция Яндекса, наоборот, задокументирована.

### 7.2 Что Google похоронил — не ставить

| Тип | Статус | Первоисточник |
|---|---|---|
| **`SearchAction`** / sitelinks search box | Мёртв с 21 ноября 2024 | «we'll be removing this visual element starting on November 21, 2024» — [blog/2024/10/sitelinks-search-box](https://developers.google.com/search/blog/2024/10/sitelinks-search-box) |
| **`HowTo`** | Мёртв с 13 сентября 2023 | «As of September 13, Google Search no longer shows How-to rich results on desktop, which means **this result type is now deprecated**» — [blog/2023/08/howto-faq-changes](https://developers.google.com/search/blog/2023/08/howto-faq-changes) |
| **`FAQPage`** | Мёртв окончательно с **7 мая 2026**, документация удалена в июне 2026 | «This feature will no longer appear in Google Search starting May 7, 2026» → «Removed documentation for the FAQ rich result feature» — [developers.google.com/search/updates](https://developers.google.com/search/updates) |

Полезное уточнение из поста про sitelinks search box — **снимать старую разметку не надо**:

> «While you can remove sitelinks search box structured data from your site, there's no need to do so.
> Unsupported structured data like this won't cause issues in Search, and won't trigger errors in
> Search Console reports.»

И сразу закрываю обходной путь, который обычно предлагают вместо `FAQPage`: **`QAPage` — не замена.**

> «**Don't use `QAPage` markup for FAQ pages** or pages where there are multiple questions per page.
> `QAPage` markup is for pages where the focus of the page is a single question and its answers.»
> — [qapage](https://developers.google.com/search/docs/appearance/structured-data/qapage)

### 7.3 Что документировано и работает

| Тип | Google | Яндекс | Что реально даёт |
|---|---|---|---|
| **`Organization`** (на главной) | ✅ | ✅ | Логотип в выдаче, knowledge panel, дизамбигуация. **Rich result — не даёт** |
| **`WebSite`** (на главной, `name` + `url`) | ✅ | ❌ не упоминает вовсе | Имя сайта в выдаче. **Без `SearchAction`** |
| **`BreadcrumbList`** | ✅ desktop | ✅ **только JSON-LD** | Хлебные крошки вместо URL |
| `SoftwareApplication` / `WebApplication` | ✅, но с порогом | ✅ | **Недостижим без рейтинга** — см. ниже |

**`Organization`** — [organization](https://developers.google.com/search/docs/appearance/structured-data/organization):

> «Adding organization structured data to your home page can help Google better understand your
> organization's administrative details and disambiguate your organization in search results.»

> «**There are no required properties;** instead, we recommend adding as many properties that are
> relevant to your organization.»

Нам полезны `name`, `url`, `logo`, `description`, `sameAs` (репозиторий проекта). Мерчантские поля
(`hasMerchantReturnPolicy`, `hasShippingService`, `duns`, `vatID`, `naics`) — игнорировать, они для
магазинов.

**`WebSite`** — [site-names](https://developers.google.com/search/docs/appearance/site-names). Условия
жёсткие, и их обычно нарушают:

> «**Only one name per site:** Currently, Google Search only supports one site name per site, where a
> site is defined by the domain or subdomain. Google Search does not support site names at the
> subdirectory level.»

> «**Structured data must be on the home page of a site:** The `WebSite` structured data must be on the
> home page of the site.»

> «However, `WebSite` structured data is most important, if you want to specify a preference.»

⚠️ **Прямое следствие для В8:** «does not support site names at the subdirectory level» означает, что
`/en/` **не получит** отдельного имени сайта. `WebSite` ставится один раз на русской главной;
дублировать его на английской бессмысленно.

**🔴 `SoftwareApplication` — ловушка, в которую легко попасть именно нам.** Тип выглядит «нашим» (мы
же веб-приложение), и Яндекс его поддерживает
([supported-schemas/software](https://yandex.ru/support/webmaster/ru/supported-schemas/software):
«Для формирования сниппета Яндекс поддерживает следующие типы стандарта Schema.org: SoftwareApplication /
MobileApplication / WebApplication / VideoGame»). Но у Google обязательные свойства делают его
недостижимым:

> «Required properties: `name` … `offers.price` … Rating or review — A rating or review of the app.
> **You must include one of the following properties:** `aggregateRating` … `review`»
> — [software-app](https://developers.google.com/search/docs/appearance/structured-data/software-app)

**Без агрегированного рейтинга или отзыва rich result невозможен в принципе.** Публичных оценок
продукта у нас нет и не предвидится (`GOAL.md` отвергает механики вовлечения). Размечать ради Яндекса
можно, но это работа ради сниппета в одном поисковике при пустом результате в другом — низкий
приоритет.

### 7.4 Особенности Яндекса, которых нет у Google

- **Между валидной разметкой и сниппетом стоит модерация:** «Прежде, чем появиться в сниппетах,
  данные должны быть: корректно размечены; проиндексированы; **промодерированы**» + «Через некоторое
  время (около двух недель) сниппеты с вашими данными появятся в Поиске».
- **`BreadcrumbList` — только JSON-LD:** «используйте на сайте микроразметку типа BreadcrumbList
  **в формате JSON-LD**» ([supported-schemas/navigation-links](https://yandex.ru/support/webmaster/ru/supported-schemas/navigation-links)).
- **`WebSite` и `FAQPage` Яндекс не знает вовсе.**
- Быстрые ссылки разметкой **не управляются**: «Быстрые ссылки формируются автоматически».

### 7.5 Разметка и ИИ-выдача — прямой ответ «нет»

> «There's also no special schema.org structured data that you need to add.» — [ai-features](https://developers.google.com/search/docs/appearance/ai-features)

Единственное упоминание разметки в контексте ИИ — требование честности, а не рычаг: «Making sure your
structured data matches the visible text on the page». **Прямого утверждения «structured data помогает
в AI Overviews» у Google не существует; существует прямое утверждение обратного.**

### 7.6 Что ставить нам

**Ставить:** `Organization` (лого, `sameAs` на репозиторий) и `WebSite` (`name: "NDim Space"`, `url`) —
одним блоком JSON-LD в `<svelte:head>` лендинга. Это ровно то, что интервью №009 отнесло к «механике,
сделаю сам», и это верно.

**Не ставить:** `SearchAction`, `FAQPage`, `HowTo`, `SiteNavigationElement`, любую «разметку под ИИ».
`SoftwareApplication` — отложить.

**`BreadcrumbList`** — обретёт смысл, когда откроются документы `/menu/*` (§1.3): у них есть
естественная иерархия «Меню → документ».

---

## §8. `og:image` и превью ссылок (под В9)

Зачем это нам конкретно: `og:image` — не сигнал ранжирования, а **витрина**. И у нас уже выпущена в
бой страница `/menu/share`, которая раздаёт ссылку **в девять сетей**, — то есть каждый, кто ею
воспользовался, отправил голый текст.

Этот раздел писался дважды: первая редакция утверждала, что у WhatsApp официальных требований нет, а
у X проверить нечего. **Оба утверждения оказались неверны** — ниже исправленная версия. Оставляю это
замечание намеренно: оно показывает, чего стоит фраза «источника не нашёл» без второго захода.

### 8.1 Спецификация: `og:image` — обязательное свойство, размера в ней нет

**ОФИЦИАЛЬНО** — [ogp.me](https://ogp.me/):

> «The four required properties for every page are: […] **`og:image` — An image URL which should
> represent your object within the graph.** […] `og:url` — The canonical URL of your object»

То есть у нас сегодня **протокол выполнен не полностью**: три обязательных свойства из четырёх есть,
`og:image` нет.

Структурные свойства картинки — все **необязательные**, кроме одного «should»:

> «`og:image:width` — The number of pixels wide. `og:image:height` — The number of pixels high.
> **`og:image:alt` — A description of what is in the image (not a caption). If the page specifies an
> og:image it should specify og:image:alt.**»

🔴 **Двух вещей в спецификации НЕТ, вопреки распространённому пересказу:**

1. **Рекомендуемого размера нет вообще.** Ни 1200×630, ни какого-либо другого. Единственные числа на
   странице — в примере разметки (`400`×`300`).
2. **Слова «absolute» на странице нет.** Требование абсолютного адреса выводится косвенно, из
   определения типа: «All valid URLs that utilize the http:// or https:// protocols». Кто пишет
   «ogp.me требует абсолютный URL» — пересказывает, а не цитирует.

Полезное для В8, чего нет в `researches/08`:

> «`og:locale:alternate` — An array of other locales this page is available in.»

Когда появится `/en/`, языковые версии стоит объявить и здесь — одна строка сверх `hreflang`.

### 8.2 Кто ОФИЦИАЛЬНО документирует размер — прямой ответ на главный вопрос

| Источник | Числа | Дословно | Статус |
|---|---|---|---|
| **ogp.me** | — | ничего | размера в спецификации нет |
| **Meta** | **1200×630**; мин. 200×200; 600×315; 1.91:1; **8 МБ** | «Use images that are **at least** 1200 x 630 pixels **for the best display** on high resolution devices» | ОФИЦИАЛЬНО |
| **LinkedIn** | **1200×627**; 1.91:1; **5 МБ** | «**Minimum** image dimensions: 1200 (w) x 627 (h) pixels» | ОФИЦИАЛЬНО |
| **X** | 300×157 … 4096×4096; **2:1**; **5 МБ** | «Images for this Card support an aspect ratio of **2:1** with minimum dimensions of 300x157» | ОФИЦИАЛЬНО (архивный снимок, §8.5) |
| **WhatsApp** | ширина ≥ 300px; ≤ 4:1; **600 КБ** | «Image should be 300px or more in width with 4:1 width/height or less aspect ratio» | ОФИЦИАЛЬНО |
| **Telegram** | — | ничего | спецификации нет вовсе |

Источники: Meta — [developers.facebook.com/documentation/sharing/webmasters/images](https://developers.facebook.com/documentation/sharing/webmasters/images) ·
LinkedIn — [linkedin.com/help/linkedin/answer/a521928](https://www.linkedin.com/help/linkedin/answer/a521928) ·
WhatsApp — [developers.facebook.com/documentation/business-messaging/whatsapp/link-previews](https://developers.facebook.com/documentation/business-messaging/whatsapp/link-previews/)
(*Updated: May 21, 2026*).

**Точный ответ на вопрос «кто документирует 1200×630»: только Meta** — и формулировкой «**at least** …
for the best display», то есть как нижнюю границу качественного отображения, а не как «рекомендуемый
размер».

🔴 **Поэтому формулировать надо честно: 1200×630 — не стандарт Open Graph и не универсальная
рекомендация. Это число Meta, которое стало практикой, потому что одновременно проходит минимум Meta
(1200×630), минимум LinkedIn (1200×627) и допуск X (2:1; 1200×630 = 1.905:1).** Родным для X был бы
1200×600. Это ровно та поправка, которой не хватало осторожной оговорке `researches/08` («стандарт
де-факто, не спецификация»): оговорка была верна, но не называла, **чьё** это требование.

### 8.3 🔴 Узкое горлышко — не размер, а ВЕС, и его задаёт WhatsApp

Разброс официальных потолков — в **13 раз**: Meta 8 МБ · LinkedIn 5 МБ · X 5 МБ · **WhatsApp 600 КБ**.
Универсального лимита не существует; проектировать надо по самому узкому.

**Практически для нас это не ограничение**, а подсказка: 1200×630 в WebP/JPEG укладывается в 600 КБ
с запасом. Но это значит, что **PNG-скриншот делать нельзя** — он туда не влезет.

Два дополнительных лимита, про которые обычно не знают, и оба про **страницу**, а не про картинку:

> «Twitter's crawler has a limit of **2 MB for page responses**.» — X (архив, troubleshooting)

> «The `<head>` containing the HTML mark-ups must appear within the **first 300KB of the HTML**.» — WhatsApp

Наш `build/index.html` — **34 КБ** целиком (замер §1.4), то есть оба лимита пройдены с запасом в
десятки раз. Но правило «важное — выше по документу» из §10.2 (лимит Googlebot 2 МБ) здесь звучит
второй раз уже от другой платформы: **мета-теги обязаны быть в начале `<head>`**.

### 8.4 «Абсолютный URL» — официально это требует ровно одна платформа

> «The `<og:image>` mark-up is **an absolute URL** for an image used as the thumbnail for the link
> preview.» — WhatsApp, там же

**Это единственная найденная официальная формулировка со словом «absolute» во всей выборке.** Ни
ogp.me, ни Meta, ни LinkedIn его не используют (LinkedIn в собственном примере пишет вообще
протокол-относительный `//media.example.com/…`).

Для нас это не спор, а решённая задача: `SITE_ORIGIN` в `src/lib/site.ts` уже питает `canonical` и
карту сайта — тот же источник даст абсолютный `og:image`.

### 8.5 X (Twitter): живой документации больше нет, но факты есть

🔴 **Находка, которую стоит знать до того, как кто-то пойдёт «свериться с докой X»:**
`developer.x.com/en/docs/x-for-websites/cards/…` отдаёт **302 на `docs.x.com/overview`**, а в полном
`sitemap.xml` сайта документации X (4 782 адреса) подстрока `card` **не встречается ни разу**.
Публичной документации Twitter Cards на август 2026 **не существует**. Всё, что о карточках пишут
сегодня, опирается на архив или на фольклор.

Цитаты ниже — из **архивных снимков официальных страниц** (то есть ОФИЦИАЛЬНО, но с датой снимка):

**Фолбэк на Open Graph задокументирован** (снимок 2024-05-14):

> «The table in this section explains the OpenGraph fallback behavior for each Twitter tag.»
> «If an `og:type`, `og:title` and `og:description` exist in the markup but `twitter:card` is absent,
> then a **summary card may be rendered**.»

⚠️ **Практический вывод, который меняет решение:** «**may** be rendered», и по умолчанию это **мелкий
`summary`**, а не широкая карточка. **Чтобы получить широкое превью на X, `twitter:card` ставить всё
же надо** — одним Open Graph не обойтись. Это ответ на вопрос «чем отличается `twitter:card`».

Про синтаксис — приятная новость (снимок 2025-01-06):

> «Twitter's parser will fall back to using `property` and `content`, so there is no need to modify
> existing Open Graph protocol markup if it already exists.»

Типы карточек (снимок 2024-05-15): `summary`, `summary_large_image`, `app`, `player`. Форматы и вес
(снимок 2024-05-14):

> «Images must be less than 5MB in size. JPG, PNG, WEBP and GIF formats are supported. […] **SVG is
> not supported.**»

**Валидатор карточек превью больше не показывает** — ОФИЦИАЛЬНО и это **живой** первоисточник:
[devcommunity.x.com/t/card-validator-preview-removal/175006](https://devcommunity.x.com/t/card-validator-preview-removal/175006),
аккаунт `XDevelopers` (в форуме помечен `admin/staff`), 2 августа 2022:

> «We've recently removed the preview functionality from the Card Validator.»
> «The best way to check this is via the app itself.»
> «**Cards data continues to be cached for up to 7 days before being refreshed.**»

То есть **единственный официально рекомендованный способ проверить карточку X — вставить ссылку в
окно создания поста в самом клиенте.**

### 8.6 Кэш превью: сроки у всех разные, и это документировано

| Платформа | Срок | Как сбросить |
|---|---|---|
| **X** | **7 дней** — «re-indexes the Card tag information on your page roughly every seven days» | Сброса нет. Для картинки — уникальный параметр в её URL |
| **LinkedIn** | **48 часов** — «Please allow **48 hours** from the last time you've shared this URL» | Post Inspector ([живой, HTTP 200](https://www.linkedin.com/post-inspector/)); но «The preview for any **existing** posts with this URL will remain the same» |
| **Facebook** | 🔴 **противоречие в документации самой Meta** | Sharing Debugger (требует логин) либо программно: `POST /{version}/?id={url}&scrape=true` ([Graph API](https://developers.facebook.com/docs/graph-api/reference/url/)) |
| **Telegram** | не документирован нигде | `@WebpageBot` — единственный первоисточник [bugs.telegram.org/c/57](https://bugs.telegram.org/c/57): «If a link shows an outdated preview […] Open Webpagebot and send it a link» |
| **WhatsApp** | **цитаты не нашёл** | — |

🔴 **Про «LinkedIn кэширует 7 дней» — это МНЕНИЕ, и оно неверно.** Официальная справка LinkedIn
([a525063](https://www.linkedin.com/help/linkedin/answer/a525063)) говорит **48 часов**. Число «7
дней» растиражировано из статьи на LinkedIn Pulse (пользовательский контент, не документация) и,
похоже, перепутано с **настоящими** семью днями у X.

**Противоречие Meta, фиксирую честно:** живая страница best-practices говорит про «standard **24 hour**
update period», архивная страница Using Objects — про «Every **30 days** after the first scrape»
(живой адрес сейчас 404, хотя Meta сама на него ссылается). Согласовать эти два числа официальным
текстом нельзя.

**🟢 Золотое правило, снимающее весь этот разнобой** — ОФИЦИАЛЬНО, Meta:

> «To update an image after it's been published, **use a new URL for the new image**. Images are
> cached based on the URL and won't be updated unless the URL changes.»

**Меняете картинку — меняйте имя файла.** Это ровно тот приём, которым в проекте уже сделаны иконки
приложения (`tools/make-pwa-icons.mjs` — растеризация Chromium через Playwright): картинку превью
правильно **генерировать** из SVG/HTML по канону бренда, а не рисовать руками.

Ещё требование Meta, о котором легко не знать:

> «Our crawler only accepts **gzip** and **deflate** encodings, so make sure your server uses the right
> encoding.»

Brotli в этом списке нет. На нашем масштабе риск теоретический (хостингу незачем сжимать WebP), но
если превью однажды не соберётся — смотреть сюда.

### 8.7 Telegram: официальной спецификации не существует

Проверено по сырому HTML `telegram.org/faq`, `core.telegram.org/bots`, `/bots/api`,
`core.telegram.org/constructor/webPage` — **ноль вхождений «Open Graph» и «og:»**.

Что есть официального: [блог о запуске превью (2015)](https://telegram.org/blog/link-preview) — «Once
you paste a URL to the message input field, Telegram will start analyzing the link and getting a
preview for it»; и управление показом превью в
[Bot API `LinkPreviewOptions`](https://core.telegram.org/bots/api#linkpreviewoptions) (`prefer_large_media`,
`show_above_text`) — но это про **отправку**, а не про то, что читает парсер.

⚠️ Самая цитируемая в интернете фраза «Telegram uses the Open Graph protocol» происходит с вики
волонтёров поддержки, которая **сама себя дисклеймит** как «not powered by Telegram». Это **МНЕНИЕ**,
хотя цитируется как канон. Читает ли Telegram `twitter:*` — официального ответа нет.

**Практически:** Telegram превью показывает, Open Graph почти наверняка читает — но **обещать это,
ссылаясь на документацию, нельзя**. Проверять только глазами, живой отправкой.

### 8.8 Что делать нам

1. Одна картинка **1200×630** (1.91:1), **в WebP или JPEG, весом до 600 КБ** (потолок WhatsApp —
   самый узкий). По В9 вариант А: знак N-сети, светлая тема «Бумага», обещание одной строкой из В6.
   Генерировать из SVG/HTML тем же приёмом, что иконки приложения.
2. `og:image` **абсолютным URL** через `SITE_ORIGIN`, плюс `og:image:width`, `og:image:height` и
   **`og:image:alt`** (единственное «should» спецификации).
3. **`twitter:card = summary_large_image` ставить обязательно** — без него X отрисует мелкую
   карточку, даже когда Open Graph полон (§8.5).
4. Поставить это **и на `/delete-account`** — у неё нет ни одного `og:`-тега вообще (замер §13.1), — и
   на документы `/menu/*` после снятия `noindex`.
5. Мета-теги — **в начале `<head>`** (лимиты X 2 МБ и WhatsApp 300 КБ, §8.3; то же требование
   Googlebot, §10.2).
6. При смене картинки — **новое имя файла**, не перезапись.
7. Проверять — **живой отправкой** в Telegram и X (валидатора превью у X больше нет), плюс
   LinkedIn Post Inspector.

---

## §9. Core Web Vitals в 2026: что изменилось и что из этого влияет на ранжирование

### 9.1 Набор метрик: изменений нет

**ОФИЦИАЛЬНО** — [web.dev/articles/vitals](https://web.dev/articles/vitals) (*Last updated: October 31, 2024*):

> «Largest Contentful Paint (LCP) : measures loading performance. […] LCP should occur within
> **2.5 seconds**»
> «Interaction to Next Paint (INP) : measures interactivity. […] pages should have a INP of
> **200 milliseconds or less**»
> «Cumulative Layout Shift (CLS) : measures visual stability. […] maintain a CLS of **0.1. or less**»
> «LCP : Stable / CLS : Stable / INP : Stable»

Свежая страница Google (*Last updated 2025-12-10*) —
[core-web-vitals](https://developers.google.com/search/docs/appearance/core-web-vitals) — повторяет
те же три метрики и те же пороги.

**INP заменил FID 12 марта 2024** — **ОФИЦИАЛЬНО**,
[blog/2023/04/page-experience-in-search](https://developers.google.com/search/blog/2023/04/page-experience-in-search):

> «Update on March 12, 2024 : Interaction to Next Paint (INP) has replaced FID as a part of Core Web Vitals.»

FID окончательно снят 9 сентября 2024
([web.dev/blog/inp-cwv-launch](https://web.dev/blog/inp-cwv-launch)).

**Что изменилось с середины 2025: ничего.** Ни новой метрики, ни отменённой, ни сдвинутого порога.
Проверено по настоящему ченджлогу метрик
([chromium.googlesource.com/…/metrics_changelog](https://chromium.googlesource.com/chromium/src/+/main/docs/speed/metrics_changelog/README.md)):
последние записи — исправление бага таймстемпов LCP (Chrome 140 → 143) и смена единиц атрибуции CLS
(Chrome 145, февраль 2026), причём прямо оговорено: «The shift scores themselves remain unchanged».

Политика Google на этот счёт: «Stable Core Web Vitals metrics won't change more than once per year».

### 9.2 🔴 Здесь SEO-блоги врут, и это стоит знать

**МНЕНИЕ, не подтверждённое первоисточником.** В выдаче по запросу «Core Web Vitals 2026» массово
встречаются утверждения, что порог LCP ужесточён с 2,5 до 2,0 с «в мартовском апдейте 2026», что
«вес page experience увеличен в декабре 2025», что «методология INP переписана». **Ни одно из них не
подтверждается документацией:** страница Google от 2025-12-10 всё ещё пишет «2.5 seconds»,
«200 milliseconds», «0.1».

Привожу это не ради спора с блогерами, а как иллюстрацию к дисциплине источников: в этой нише
уверенный тон и конкретное число не значат ничего.

### 9.3 Что Google говорит про ранжирование сегодня

**ОФИЦИАЛЬНО** — [page-experience](https://developers.google.com/search/docs/appearance/page-experience) (*Last updated 2025-12-10*):

> «**There is no single signal.** Our core ranking systems look at a variety of signals that align with
> overall page experience.»

> «**Core Web Vitals are used by our ranking systems.**»

> «Keep in mind that getting good results in reports like Search Console's Core Web Vitals report or
> third-party tools **doesn't guarantee that your pages will rank at the top** of Google Search results»

> «These scores are meant to help you to improve your site for your users overall, and **trying to get
> a perfect score just for SEO reasons may not be the best use of your time.**»

> «**Beyond Core Web Vitals, other page experience aspects don't directly help your website rank higher**
> in search results.»

И главное для расстановки приоритетов:

> «Google Search always seeks to show the most relevant content, **even if the page experience is
> sub-par**. But for many queries, there is lots of helpful content available. Having a great page
> experience can contribute to success in Search, in such cases.»

**Page experience больше не значится системой ранжирования.** В
[ranking-systems-guide](https://developers.google.com/search/docs/appearance/ranking-systems-guide)
(*Last updated 2025-12-10*) слов «page experience», «page speed», «mobile-friendly», «Core Web Vitals»
нет ни в активных системах, ни в отставных. Объяснение — от самого Google
([blog/2023/04](https://developers.google.com/search/blog/2023/04/page-experience-in-search), Danny Sullivan):

> «**It was not a separate ranking system**, and it did not combine all these signals into one single
> "page experience" signal.»

**Количественной оценки влияния CWV на ранжирование у Google НЕ СУЩЕСТВУЕТ.** Это проверенная
находка, а не пробел поиска: пройдены `page-experience`, `core-web-vitals`, `ranking-systems-guide`,
лента `search/updates` и блог-посты 2020–2023 — ни процентов, ни веса, ни слова «tiebreaker». Любая
цифра вида «CWV = N % алгоритма» — МНЕНИЕ.

### 9.4 Яндекс: аналога CWV как объявленного фактора нет

**ОФИЦИАЛЬНО** — [yandex-indexing/page-speed](https://yandex.ru/support/webmaster/ru/yandex-indexing/page-speed.html):

> «Скорость загрузки страниц сайта это один из важных показателей его качества.»

Слова «ранжирование» на странице нет. Есть «индекс скорости сайта» в Вебмастере
([блог, 20 апреля 2020](https://webmaster.yandex.ru/blog/novoe-dostizhenie-skorost-sayta)):

> «Индекс скорости сайта рассчитывается на основе переходов пользователей на сайт из поисковой выдачи
> Яндекс.Браузера.» / «Индекс скорости рассчитывается для тех сайтов, у которых достаточно трафика.»

На прямой вопрос «участвует ли этот показатель в ранжировании» сотрудник Яндекса (`platon`) в
комментариях под тем же постом ответил:

> «повторюсь: **влияние конкретных факторов на ранжирование мы не комментируем.**»

**Вывод:** у Яндекса скорость — показатель качества в Вебмастере, а не публично объявленный фактор.
Приписывание её алгоритмам «Вега»/«Нептун» в российских SEO-блогах — **МНЕНИЕ** без первоисточника.

### 9.5 Что из этого касается нас (по замерам §1.4)

| Метрика | Наш риск | Почему |
|---|---|---|
| **LCP** | низкий | TTFB закрыт статикой («achieves a consistently fast TTFB» — [rendering-on-the-web](https://web.dev/articles/rendering-on-the-web)); **веб-шрифтов нет**, третьих сторон нет |
| **CLS** | низкий | Обычные причины — шрифтовой своп и картинки без размеров. У нас шрифты системные, а аватары лежат в жёстком боксе 40×40 (замер §1.4) |
| **INP** | средний, единственный содержательный | «The primary downside of server-side rendering with rehydration is that it can have a significant negative impact on TBT and INP […] **as long as you limit the amount of client-side JavaScript**» — [rendering-on-the-web](https://web.dev/articles/rendering-on-the-web). У нас 144 КБ несжатого JS на первом экране |

⚠️ **Ловушка измерения, которую надо знать заранее:**

> «Tools like Lighthouse that load pages in a simulated environment without a user **cannot measure
> INP**, as there is no user input. However, the Total Blocking Time (TBT) metric is lab-measurable and
> is a proxy for INP.» — [web.dev/articles/vitals](https://web.dev/articles/vitals)

То есть PageSpeed Insights **не покажет** наш единственный реальный риск. Смотреть придётся TBT в
лаборатории и поле (CrUX) — а поле появится только с трафиком.

**Вывод по §9: Core Web Vitals у нас — гигиена, а не рычаг.** Единственная явная неопрятность —
470 КБ PNG ради трёх кружков по 40 пикселей (§1.4); это стоит починить как расточительство, а не как
SEO-меру. Погоня за «идеальным баллом» прямо отговорена самим Google.

**Замера наших живых CWV нет:** PageSpeed Insights по боевому домену в этой сессии не запускался,
полевых данных без трафика не существует. Первый честный шаг — прогнать PSI по `ndimspace.app` и
записать результат.

---

## §10. Индексация JS-приложений: изменилось ли отношение к пререндеру

Короткий ответ: **отношение к пререндеру улучшилось, а не наоборот, — и появилось новое ограничение,
которое делает наш выбор ещё правильнее.**

### 10.1 Google рендерит всё — но пререндер по-прежнему рекомендует

**ОФИЦИАЛЬНО** — [javascript-seo-basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)
(*Last updated 2026-03-04*):

> «Googlebot queues all pages with a `200` HTTP status code for rendering […] **The page may stay on
> this queue for a few seconds, but it can take longer than that.**»

> «Keep in mind that **server-side or pre-rendering is still a great idea** because it makes your
> website faster for users and crawlers, and **not all bots can run JavaScript**.»

В [how-search-works](https://developers.google.com/search/docs/fundamentals/how-search-works)
(*Last updated 2025-12-18*) рендеринг подан уже как часть обхода: «**During the crawl**, Google renders
the page and runs any JavaScript it finds using a recent version of Chrome».

**ОФИЦИАЛЬНО** — подкаст Search Off the Record, эп. 77 (июль 2024), Zoe Clifford из команды рендеринга:

> «Oh, **we just render all of them** as long as their HTML and not other content types like PDFs.»

⚠️ **Честный пробел.** Официального заявления «рендеринг теперь почти мгновенный» **не существует** —
в текущей документации по-прежнему «a few seconds, but it can take longer than that». Гуляющая по
блогам цифра «медиана 5 секунд» восходит к выступлению 2019 года, **первоисточника не нашёл**. Это
МНЕНИЕ. Заодно: устаревшая модель «двух волн индексирования» из документации Google **вычищена** —
слов «two waves» / «second wave» там больше нет.

### 10.2 🔴 Новое в марте 2026: Googlebot качает не более 2 МБ на URL

**ОФИЦИАЛЬНО** — [blog/2026/03/crawler-blog-post](https://developers.google.com/search/blog/2026/03/crawler-blog-post)
«Inside Googlebot», Gary Illyes, 31 марта 2026:

> «**Googlebot currently fetches up to 2MB for any individual URL** (excluding PDFs).»

> «**Any bytes that exist after that 2MB threshold are entirely ignored.** They aren't fetched, they
> aren't rendered, and they aren't indexed.»

> «if your page includes bloated inline base64 images, massive blocks of inline CSS/JavaScript, or
> starts with megabytes of menus, you could accidentally push your actual textual content or critical
> structured data past the 2MB mark. **If those crucial bytes aren't fetched, to Googlebot, they simply
> don't exist.**»

> «**Order matters:** Place your most critical elements — like meta tags, `<title>` elements, `<link>`
> elements, canonicals, and essential structured data — higher up in the HTML document.»

**Наш случай:** `build/index.html` — **34 КБ** (§1.4), то есть 1,7 % от лимита. Запас огромный.
Но правило «важное — выше» стоит соблюдать, когда появится JSON-LD: класть его в `<svelte:head>`, а
не в конец страницы. Оговорка Google: «this limit is not set in stone and may change over time».

### 10.3 Dynamic rendering официально закрыт

**ОФИЦИАЛЬНО** — [dynamic-rendering](https://developers.google.com/search/docs/crawling-indexing/javascript/dynamic-rendering)
(*Last updated 2025-12-10*), страница уже переименована в «Dynamic rendering as a workaround»:

> «**Dynamic rendering was a workaround and not a long-term solution** for problems with
> JavaScript-generated content in search engines. **Instead, we recommend that you use server-side
> rendering, static rendering, or hydration as a solution.**»

Наша схема (`adapter-static` + гидратация) — буквально в списке рекомендованного.

### 10.4 🔴 Яндекс — вот где пререндер обязателен, а не желателен

Это самая важная находка раздела для русскоязычной аудитории.

**ОФИЦИАЛЬНО** — [yandex-indexing/rendering](https://yandex.ru/support/webmaster/ru/yandex-indexing/rendering).
Страница до сих пор называется «**Индексирование страниц с JavaScript β**» — фича в бете:

> «По умолчанию включена опция **На усмотрение робота Яндекса**. Это значит, что **робот
> самостоятельно определит, выполнять ли JavaScript-код** на страницах сайта.»

> «**Совет. Запретите рендеринг, если на сайте реализован SSR (Server-Side Rendering) или пререндеринг.**»

**ОФИЦИАЛЬНО** — [блог Яндекса для вебмастеров, 11 июля 2022](https://webmaster.yandex.ru/blog/rendering-stranits-javascript-i-proverka-stranitsy-peredavayte-poisku-kontent-v-polnom-obeme):

> «**Большинство страниц не требуют рендеринга при индексировании и скачиваются без JavaScript.**
> Но если выполнение JS даёт новый ценный контент поиску, алгоритм может рекомендовать использование
> рендеринга. **Это решение принимается автоматически.**»

Ответ сотрудника Яндекса в комментариях под тем же постом (**официальная позиция сотрудника, но не
текст документации**):

> «Эти методы равноценны, **исполнение JS на стороне робота не даёт преимуществ**. Главное, чтобы
> робот мог получить контент страниц.»

**Вывод:** пререндер — не оптимизация, а страховка. И **практический шаг для В10**: когда владелец
заведёт Яндекс Вебмастер, там надо **выключить рендеринг JS** — Яндекс сам это советует для сайтов с
пререндером.

### 10.5 AI-краулеры JavaScript не исполняют

**Официальных заявлений НЕТ ни у кого** — проверено грепом по страницам OpenAI, Anthropic и
Perplexity: слов «JavaScript»/«render» о поведении бота там ноль. Единственные твёрдые данные —
измерение:

**МНЕНИЕ (но эмпирическое измерение на миллиардах выборок)** — Vercel + MERJ,
[vercel.com/blog/the-rise-of-the-ai-crawler](https://vercel.com/blog/the-rise-of-the-ai-crawler), 17 декабря 2024:

> «The results consistently show that **none of the major AI crawlers currently render JavaScript**.
> This includes: OpenAI (OAI-SearchBot, ChatGPT-User, GPTBot), Anthropic (ClaudeBot), Meta, ByteDance,
> Perplexity (PerplexityBot)»

> «**ChatGPT and Claude don't execute JavaScript, so any important content should be server-rendered.**»

⚠️ Свежего (2026) измерения такого же качества **не нашёл**; публикации 2026 года ссылаются на то же
исследование. Это ограничение источника, а не подтверждение неизменности.

**Практический вывод, который стоит держать рядом с §1.2:** ровно поэтому английская версия для
ИИ-поисковиков тоже не существует. Она появляется только после клика по переключателю, а
переключатель никто из них не нажмёт.

### 10.6 «Кроулеры не нажимают кнопки» — прямая цитата под наш случай

**ОФИЦИАЛЬНО** — [pagination-and-incremental-page-loading](https://developers.google.com/search/docs/specialty/ecommerce/pagination-and-incremental-page-loading)
(*Last updated 2025-12-10*):

> «**Google's crawlers don't "click" buttons and generally don't trigger JavaScript functions that
> require user actions to update the current page contents.**»

Это самая короткая и самая точная формулировка того, почему `TODO(SEO)` в
`src/routes/+page.svelte:12` — реальный долг, а не педантизм. Английский текст у нас появляется
ровно по клику.

---

## §11. Регистрация в поисковиках: что попросить у владельца (под В10)

Задача этого раздела — чтобы владелец сделал ровно нужный минимум руками, а всё остальное подготовил
агент.

### 11.1 Google Search Console

**ОФИЦИАЛЬНО** — [support.google.com/webmasters/answer/9008080](https://support.google.com/webmasters/answer/9008080).
Методы: HTML file upload, HTML tag, Google Analytics, Google Tag Manager, Google Sites/Blogger, Domain
name provider. Ключевое разделение:

> «HTML file upload can be used for URL-prefix properties, **but not Domain properties**.»

> «More complex, but is **the only way to verify a Domain property**. […] Domain properties are useful
> because they include data for all protocol (http/https) and subdomain variations of your property.»

> «Add a DNS record to your domain provider's record list to prove ownership.»

**Запись должна остаться навсегда:**

> «**Important: To stay verified, don't remove the DNS record from your provider, even after
> verification succeeds.**»

> «Verifying ownership of a root domain automatically verifies ownership of all subdomains»

**Наш выбор — Domain property через TXT в Porkbun.** Мы всё равно держим там записи ради Hosting;
одна TXT закроет `ndimspace.app` со всеми поддоменами и обоими протоколами.

**Про «ускорить индексацию»** — [answer/9012289](https://support.google.com/webmasters/answer/9012289):

> «Submitting a request **does not guarantee** that the page will appear in the Google Index.»
> «There is a daily limit to how many index requests you can submit.»
> «To request indexing of many new or updated pages, your best choice is to **submit a sitemap**, with
> the updated pages marked by `<lastmod>`.»

Точных квот Google не публикует — **цифр не нашёл**.

**Новое в GSC за 2025–2026:** появились *platform properties* (соцсети и видео —
[блог, 29 июля 2026](https://developers.google.com/search/blog/2026/07/platform-properties-social-video-guide)).
К сайту на своём домене это отношения не имеет; **методы подтверждения и типы ресурсов сайта не
менялись**.

### 11.2 Яндекс Вебмастер

**ОФИЦИАЛЬНО** — [yandex.ru/support/webmaster/ru/service/rights](https://yandex.ru/support/webmaster/ru/service/rights)
(старый адрес из `researches/08` с `.html` теперь редиректит сюда). Способы:

1. **HTML-файл в корневом каталоге — «(рекомендуемый)»**, помечен так самим Яндексом:
   > «Создайте HTML-файл с заданным уникальным именем и содержимым, и разместите его в корневом
   > каталоге вашего сайта.»
   > «Убедитесь, что файл содержит **только указанный код**.»
2. **Метатег на главной странице** — «Он должен располагаться в элементе head» + «Если вы добавите
   метатег в другое место главной страницы, то права подтвердить не удастся.»
3. **TXT-запись в DNS** — «адреса с префиксом www и без него считаются разными сайтами».
4. **Менеджер тегов** (YTM/GTM).
5. **Через доменного регистратора β**.

**Артефакт тоже нужно оставить навсегда:**

> «Яндекс периодически проверяет изменения на сайте, которые подтверждают право на управление им.
> Если при очередной проверке эти изменения не будут обнаружены, сайт перейдет в разряд
> «неподтвержденных».»

**Наш выбор — HTML-файл:** агент кладёт его в `static/`, он попадает в `build/` пререндером, владельцу
остаётся нажать «Проверить». Это единственный метод, где работа владельца — один клик.

**Карта сайта у Яндекса** — [indexing-options/sitemap](https://yandex.ru/support/webmaster/ru/indexing-options/sitemap):

> «Робот загрузит его в течение двух недель.»
> «Чтобы ускорить обход файла, нажмите значок. […] Использовать функцию можно **до 10 раз для одного хоста**.»

**Директивы robots.txt, поддерживаемые сегодня** —
[controlling-robot/robots-txt](https://yandex.ru/support/webmaster/ru/controlling-robot/robots-txt):
ровно пять — `User-agent`, `Disallow`, `Allow`, `Sitemap`, `Clean-param`. **Директива `Host` отменена**
([Платон Щукин, 12 марта 2018](https://yandex.ru/blog/platon/pereezd-sayta-posle-otkaza-ot-direktivy-host)):

> «было решено отказаться от использования директивы Host — теперь переезд будет выполняться только
> при помощи редиректа HTTP-301.»

Наш `robots.txt` её и не содержит — упоминаю, чтобы никто не добавил по старой памяти.

### 11.3 Bing

Импорт из GSC жив — **ОФИЦИАЛЬНО**,
[blogs.bing.com/webmaster/september-2019/Import-sites-from-Search-Console](https://blogs.bing.com/webmaster/september-2019/Import-sites-from-Search-Console-to-Bing-Webmaster-Tools):

> «Bing Webmaster Tools now supports a feature that lets you verify your sites by importing them
> directly from Google Search Console.»
> «The imported sites will be **automatically verified**, eliminating the need for manual site
> verification steps.»

Отличие от Google, которое легко пропустить: у Bing DNS-метод — **CNAME**, не TXT. Но при импорте из
GSC DNS не нужен вовсе.

### 11.4 🔴 Пинг карты сайта умер — не закладывайте его в автоматику

**ОФИЦИАЛЬНО** — [blog/2023/06/sitemaps-lastmod-ping](https://developers.google.com/search/blog/2023/06/sitemaps-lastmod-ping),
плашка на странице сегодня: «The sitemaps ping endpoint deprecation is complete.»

> «we're deprecating our support for sitemaps ping and the endpoint will stop functioning in 6 months.
> You can still submit your sitemaps through robots.txt and Search Console, but the HTTP requests
> ("pings") to the deprecated REST endpoint will result in a **404 error**.»

Bing убрал свой пинг ещё раньше
([май 2022](https://blogs.bing.com/webmaster/may-2022/Spring-cleaning-Removed-Bing-anonymous-sitemap-submission)).

Из того же поста Google — полезное про `lastmod`, которого нет в `researches/08`:

> «nowadays **lastmod is indeed useful** in many cases and we're using it as a signal for scheduling
> crawls»
> «it needs to **consistently match reality**: if your page changed 7 years ago, but you're telling us
> in the lastmod element that it changed yesterday, eventually we're not going to believe you anymore»
> «Google still **doesn't use the changefreq or priority** elements at all.»

**Практический вывод:** `lastmod` в нашей карте стоит завести — но только правдивый (например, из даты
коммита файла страницы). Комментарий в `sitemap.xml/+server.ts` («пишем один `<loc>`») остаётся
верным ровно до тех пор, пока мы не научились не врать про даты.

### 11.5 IndexNow

**ОФИЦИАЛЬНО** — [indexnow.org](https://indexnow.org/): участники — Microsoft Bing, Naver, Seznam.cz,
**Yandex**, Yep (в FAQ добавлен Amazon). **Google в списке нет**, и ни одной страницы Google, где
IndexNow упоминался бы, не существует — **официального заявления Google о статусе IndexNow не нашёл**.
Утверждение «Google тестировал и не внедрил» — МНЕНИЕ вторичных источников.

Яндекс — [indexing-options/index-now](https://yandex.ru/support/webmaster/ru/indexing-options/index-now):

> «Данный способ **не гарантирует**, что переданные страницы будут проиндексированы.»

**Нам сейчас не нужно.** Для сайта, где страницы меняются раз в неделю деплоем, это овердоз (тот же
вывод, что и в `researches/08`, и он не устарел).

### 11.6 Итог: что попросить у владельца, а что сделает агент

**Руки владельца (единственное, чего агент не может):**

| Что | Где | Сколько занимает |
|---|---|---|
| Завести ресурс в Google Search Console, тип **Domain property** | GSC | 5 минут |
| Добавить выданную **TXT-запись** в DNS Porkbun и **не удалять её никогда** | Porkbun | 5 минут |
| Завести сайт в Яндекс Вебмастере и передать агенту **имя и содержимое HTML-файла** проверки | Вебмастер | 3 минуты |
| После выката файла — нажать «Проверить» | Вебмастер | 1 минута |
| **Выключить рендеринг JS** в Вебмастере (§10.4 — совет самого Яндекса для сайтов с пререндером) | Вебмастер | 1 минута |
| Подать карту сайта в обеих консолях | GSC + Вебмастер | 2 минуты |
| Bing — по желанию, импортом из GSC (нужен вход в Google) | Bing WT | 5 минут |

**Всё остальное — агент:** `robots.txt` (уже есть), `sitemap.xml` (есть, расширить), HTML-файл
проверки Яндекса в `static/`, мета-теги проверки в `<svelte:head>`, JSON-LD, `og:image`.

Это подтверждает рекомендацию **В10 = А** (Google + Яндекс), с одной поправкой к цене: в интервью
названы «20 минут на два подтверждения прав» — по факту ближе к 15, и **самое важное здесь не время,
а то, что TXT-запись обязана остаться в DNS навсегда**. Об этом стоит сказать владельцу прямо: запись
выглядит мусором и её легко удалить при уборке, а вместе с ней уйдут и права.

---

## §12. Что противоречит рекомендациям интервью №009

Раздел заведён намеренно: интервью уже лежит у владельца и ждёт ответов, а разведка обязана
поправить его там, где оно ошибается, — иначе владелец примет решение на неверном основании.
Это поправки к **основанию**, а не смена рекомендаций: три из четырёх рекомендаций интервью
подтвердились.

### 🔴 1. В8 склеивает два шага разной цены в один вопрос

Интервью: *«Лечится per-URL i18n: `/en/…` + `hreflang`»* — и вариант А описан как одно решение с
одной ценой.

**Разведка:** это **два независимых шага**, и они не равны.

- **`/en/` без `hreflang`** уже работает: страница индексируется и ранжируется. Требование Google —
  именно про адреса: «Google recommends using different URLs for each language version».
- **`hreflang` без `/en/`** не даёт **ничего**: размечать нечего.
- Более того, `hreflang` у Google — **не требование, а помощь**: «use `hreflang` annotations **to
  help** Google Search results link to the correct language version».

**Что это меняет для владельца:** ответ «А» можно исполнить поэтапно и увидеть эффект после первого
этапа. Формулировка интервью подталкивает к «или всё, или ничего».

### 🔴 2. В8 ошибается в цене — в обе стороны

Интервью: *«Цена: заметная работа: маршруты, пререндер, двусторонние `hreflang`, вторая карта сайта»*.

**Разведка (эксперимент §5):** по трём из четырёх названных пунктов цена оказалась **в строках, а не
в днях** — маршрут `[[lang]]` пререндерится сам, краулер находит `/en/` по самой `hreflang`-ссылке,
`<html lang>` чинится семистрочным хуком, карта — одна строка.

**Но появился пятый пункт, которого интервью не называло, и он дороже остальных вместе:** язык у нас
живёт в `localStorage` и читается **в 12 файлах независимо**, а инлайн-скрипт `app.html` переписывает
`lang` на каждой странице. На языковом адресе это ломается **у людей** (робот `localStorage` не имеет).
Это не SEO-работа — это уборка нашего собственного долга, и её надо назвать честно.

### 🔴 3. В8 опирается на аргумент, у которого нет источника

Интервью: *«решение легко отложить и трудно догнать (**возраст домена работает на того, кто начал
раньше**)»*.

**Официального подтверждения «возраста домена/страницы» как фактора ранжирования у Google нет** — это
устойчивое SEO-поверье. **Аргумент за «сделать раньше» есть, но другой и проверяемый:** сегодня схема
нужна двум адресам, а после раскрытия документов (§1.3) — одиннадцати. Чем позже, тем больше страниц
переносить.

### 🔴 4. Интервью не называет САМУЮ большую дыру

Таблица SEO в интервью перечисляет отсутствующее (`og:image`, JSON-LD, `hreflang`) и упоминает, что
*«в sitemap всего два адреса»* — как недостаток карты.

**Замер (§1.3) показал: карта не виновата.** В карте два адреса, потому что индексируется ровно две
страницы из девятнадцати. **3 692 знака открыто поиску против 53 385 закрытых**, и около 46 000 из
закрытых — обычный публичный текст (руководство, условия, о системе, политика, об авторе), у которого
нет причины быть закрытым. Причина — одна необоснованная строка в `DocShell.svelte`.

Это дешевле и результативнее всего остального в документе вместе взятого, и в интервью этого нет.

### ⚠️ 5. Список JSON-LD в интервью нужно сузить

Интервью относит *«`og:image`, JSON-LD, расширение sitemap»* к «механике, сделаю сам» — верно. Но
`WebSite`/`Organization` названы без оговорок, а рядом с ними в любом руководстве лежат мёртвые типы:

- `SearchAction` внутри `WebSite` — мёртв с ноября 2024;
- `FAQPage` — мёртв с 7 мая 2026, документация Google удалена;
- `SoftwareApplication` — у Google **недостижим** без рейтинга или отзыва, которых у нас не будет.

Без этой оговорки «сделаю сам» рискует превратиться в разметку ради разметки (§7).

### ⚠️ 6. В10: время названо, а главное условие — нет

Интервью: *«Цена: ваши 20 минут на два подтверждения прав»*. По факту ближе к 15 (§11.6), но важно не
это: **TXT-запись Search Console обязана остаться в DNS навсегда** — «To stay verified, don't remove
the DNS record from your provider, even after verification succeeds». То же у Яндекса с
HTML-файлом. Запись выглядит мусором, и её легко снести при уборке DNS вместе с правами на ресурс.

Плюс к В10 добавляется бесплатный шаг, которого в интервью нет: **выключить рендеринг JS в Яндекс
Вебмастере** — это прямой совет Яндекса для сайтов с пререндером (§10.4).

### ✅ 7. Что интервью говорит верно (и разведка это подтверждает)

- **В9 = А** — картинка нужна, и рекомендация «лого + обещание одной строкой» состоятельна (§8).
- **В10 = А** — Google + Яндекс; Bing импортом потом (§11.3).
- **В8 = А по существу** — английский без отдельного адреса не существует; замер §1.2 подтверждает
  это буквальнее, чем формулировка интервью.
- Оценка «самая большая невозвращённая инвестиция» — **подтверждена замером**: английский словарь
  уезжает в JS-чанке и не даёт ни одной индексируемой страницы.

---

## §13. Порядок действий: ранжирование по отношению «эффект / трудоёмкость»

Владельцу нужен порядок, а не список возможностей. Трудоёмкость — в единицах работы (строки, файлы,
маршруты), а не в часах: часы у сессии агента ничего не значат, объём проверяем.

### Очередь 1 — делать первым (большой эффект, цена в строках)

| № | Шаг | Эффект | Трудоёмкость | Чьи руки |
|---|---|---|---|---|
| **1** | **Снять `noindex` с публичных документов `/menu/*`** и внести их в карту сайта. Проверить, что `/menu/manual`, `/about`, `/author`, `/terms`, `/privacy`, `/disclaimer`, `/donate`, `/share`, `/support` действительно публичны | 🟢 **Максимальный.** Индексируемого текста становится в **13 раз** больше (3 692 → ~50 000 знаков, замер §1.3). Это же — единственное, что требуется для ИИ-выдачи (§6.1) | **1 строка** в `DocShell.svelte` + список в `sitemap.xml` + `description` на страницу. Стражи `noindex` этих страниц не проверяют — ломать нечего | агент |
| **2** | **`canonical` на `/delete-account`** + добавить её и `/account`, `/auth/action` в редиректы со второго хоста | 🟢 Высокий. Сейчас **половина индексируемой поверхности** дублируется на `ndim-space.web.app` **без единого сигнала каноничности** (замер §13.1 ниже) | **1 строка** в `<svelte:head>` + 3 строки в `firebase.json` | агент |
| **3** | **Владелец: Google Search Console (Domain property, TXT в Porkbun) + Яндекс Вебмастер (HTML-файл)** | 🟢 Высокий и **разблокирующий**: без консолей мы не измеряем ничего и не подаём карту | **~15 минут владельца.** Всё остальное готовит агент. 🔴 **TXT-запись остаётся в DNS навсегда** | **владелец** |
| **4** | **`og:image` + `twitter:card`** на лендинге и на `/delete-account` | 🟢 Высокий и виден сразу: сегодня ссылка в мессенджере выглядит голой, **а страница `/menu/share` раздаёт её в девять сетей** | **1 картинка + ~6 строк.** 1200×630, **WebP/JPEG до 600 КБ** (потолок WhatsApp — самый узкий, §8.3). `twitter:card` обязателен: без него X даёт мелкую карточку (§8.5). Растеризатор в проекте уже есть (`tools/make-pwa-icons.mjs` — Chromium через Playwright) | агент + **один выбор владельца** (В9) |
| **5** | **JSON-LD: `Organization` + `WebSite`** одним блоком на главной | 🟡 Средний: имя сайта и логотип в выдаче. Rich result не даёт — и не должен | **~15 строк**, один раз | агент |

### Очередь 2 — делать вторым (ответ на В8)

| № | Шаг | Эффект | Трудоёмкость |
|---|---|---|---|
| **6** | **`/en/` отдельным адресом** (Ш1 §5.5): маршрут `[[lang]]`, словарь из 21 пары, свои `title`/`description`/`og`/`canonical` | 🟢 Высокий: английской версии сейчас **не существует ни для одного робота** (замер §1.2) | **1 маршрут + 1 модуль словаря.** Механика проверена экспериментом — неизвестных нет |
| **7** | **`hreflang` + `x-default` + `<html lang>` + карта** (Ш2–Ш4) | 🟡 Средний: помогает отдать нужную версию нужному человеку и гасит риск дублей | **~14 строк суммарно**, из них 7 — хук. Пререндер сам валидирует ссылки |
| **8** | 🔴 **Развести язык и память браузера** (Ш5): общий модуль языка, адрес главнее `localStorage` | 🟡 Средний для SEO, **высокий для людей**: без этого `/en/` ломается у человека с `ru` в памяти | **Основная работа эпика.** 12 файлов читают ключ независимо; общего модуля нет |
| **9** | **Стражи** (Ш6): e2e на пререндер `/en/`, английский текст в сыром HTML, двусторонний `hreflang`, `lang="en"` | Обязательно по канону проекта | **~1 файл сценариев** |

> **Порядок 1 → 6 не случаен.** Если сначала раскрыть документы (шаг 1), языковых адресов станет
> одиннадцать вместо двух. Поэтому либо шаги 6–9 делаются **до** раскрытия, либо раскрытие делается
> сразу с учётом языковой схемы. Дешевле первое: шаг 1 стоит одну строку и его не жалко повторить.

### Очередь 3 — гигиена, когда дойдут руки

| № | Шаг | Замечание |
|---|---|---|
| **10** | Прогнать `ndimspace.app` через PageSpeed Insights и **записать результат** | Наших живых CWV **никто не мерил**. Помнить: PSI не покажет INP (§9.5) — смотреть TBT |
| **11** | 470 КБ PNG трёх аватаров → `webp` | Это расточительство, а не SEO-мера (§1.4). Картинки отрисованы в боксе 40×40 px |
| **12** | `lastmod` в карте сайта | Только правдивый: «it needs to consistently match reality» (§11.4). Врущий `lastmod` хуже отсутствующего |
| **13** | `BreadcrumbList` на документах | Обретёт смысл после шага 1: «Меню → документ». Яндекс — **только JSON-LD** |
| **14** | Проверить судьбу preview-канала из `researches/08` §7 | Срок жизни истекал 2026-08-10 |
| **15** | Bing — импортом из GSC | Ноль работы с DNS, 5 минут владельца. Когда появится смысл |

### ⛔ Не делать вовсе

| Что | Почему |
|---|---|
| **`llms.txt`** | Google: «Google Search itself doesn't use them». Замер: 97 % таких файлов не прочитаны никем (§6) |
| **Отдельная «оптимизация под ИИ», AEO/GEO** | Google: «optimizing for generative AI search is … **still SEO**»; условие попадания — обычная индексируемость (§6.1) |
| **`FAQPage`, `HowTo`, `SearchAction`** | Все три официально мертвы (2023, 2024, 2026). Документация удалена (§7.2) |
| **`SoftwareApplication`** | У Google **недостижим** без `aggregateRating`/`review`, которых у нас не будет (§7.3) |
| **`QAPage` вместо `FAQPage`** | Прямое нарушение гайдлайна: «Don't use `QAPage` markup for FAQ pages» (§7.2) |
| **Пинг карты сайта (`google.com/ping?sitemap=`)** | Отключён, отвечает 404 (§11.4). Не закладывать в автоматику |
| **IndexNow** | Google не участвует; для сайта, меняющегося деплоем раз в неделю, — овердоз (§11.5) |
| **Погоня за «идеальным баллом» CWV** | Прямо отговорено Google: «trying to get a perfect score just for SEO reasons may not be the best use of your time» (§9.3) |
| **`hreflang` в sitemap вместо `<link>`** | Яндекс sitemap для языковых версий **больше не поддерживает** (§4.2) |
| **Директива `Host` в robots.txt** | Отменена Яндексом в 2018 (§11.2) |
| **Автоперенаправление по языку браузера** | Google: «Avoid automatically redirecting users from one language version…» (§4.1) |

### 13.1 Приложение: замер дублей по хостам

Редиректы со второго хоста (`ndim-space.web.app`) покрывают семь путей: `/`, `/dims`, `/menu`,
`/menu/:rest*`, `/profile`, `/relations`, `/space`. **Не покрыты** `/delete-account`, `/account`,
`/auth/action`.

Из них важен один: **`/delete-account`** — вторая из двух индексируемых страниц сайта. У неё
одновременно **нет `canonical`**, **нет `noindex`** (и правильно — она обязана находиться) и **нет
редиректа со второго хоста**. То есть `https://ndim-space.web.app/delete-account` — живой
индексируемый дубль без единого сигнала каноничности. Иерархия сигналов
([consolidate-duplicate-urls](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls))
ставит 301 выше `canonical`, поэтому правильнее закрыть обоими: добавить путь в редиректы и
поставить `canonical`.

Замечено также состязательной проверкой интервью №009 (коммит `b4be66a`) — то есть находка
подтверждена дважды и независимо.

---

## Главные источники

**Google Search Central**
[ai-optimization-guide](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide) ·
[ai-features](https://developers.google.com/search/docs/appearance/ai-features) ·
[javascript-seo-basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics) ·
[dynamic-rendering](https://developers.google.com/search/docs/crawling-indexing/javascript/dynamic-rendering) ·
[how-search-works](https://developers.google.com/search/docs/fundamentals/how-search-works) ·
[Inside Googlebot (2 МБ, 31.03.2026)](https://developers.google.com/search/blog/2026/03/crawler-blog-post) ·
[localized-versions (hreflang)](https://developers.google.com/search/docs/specialty/international/localized-versions) ·
[managing-multi-regional-sites](https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites) ·
[page-experience](https://developers.google.com/search/docs/appearance/page-experience) ·
[core-web-vitals](https://developers.google.com/search/docs/appearance/core-web-vitals) ·
[ranking-systems-guide](https://developers.google.com/search/docs/appearance/ranking-systems-guide) ·
[search-gallery](https://developers.google.com/search/docs/appearance/structured-data/search-gallery) ·
[sd-policies](https://developers.google.com/search/docs/appearance/structured-data/sd-policies) ·
[site-names / WebSite](https://developers.google.com/search/docs/appearance/site-names) ·
[Organization](https://developers.google.com/search/docs/appearance/structured-data/organization) ·
[software-app](https://developers.google.com/search/docs/appearance/structured-data/software-app) ·
[qapage](https://developers.google.com/search/docs/appearance/structured-data/qapage) ·
[sitelinks search box снят (2024)](https://developers.google.com/search/blog/2024/10/sitelinks-search-box) ·
[HowTo/FAQ (2023)](https://developers.google.com/search/blog/2023/08/howto-faq-changes) ·
[updates — смерть FAQ (2026)](https://developers.google.com/search/updates) ·
[sitemaps ping отключён](https://developers.google.com/search/blog/2023/06/sitemaps-lastmod-ping) ·
[build-sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap) ·
[consolidate-duplicate-urls](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls) ·
[common-crawlers (Google-Extended)](https://developers.google.com/search/docs/crawling-indexing/google-common-crawlers) ·
[«кроулеры не нажимают кнопки»](https://developers.google.com/search/docs/specialty/ecommerce/pagination-and-incremental-page-loading) ·
[верификация GSC](https://support.google.com/webmasters/answer/9008080) ·
[URL Inspection](https://support.google.com/webmasters/answer/9012289)

**web.dev / Chrome**
[vitals](https://web.dev/articles/vitals) ·
[INP заменил FID](https://web.dev/blog/inp-cwv-launch) ·
[rendering-on-the-web](https://web.dev/articles/rendering-on-the-web) ·
[optimize-lcp](https://web.dev/articles/optimize-lcp) ·
[optimize-cls](https://web.dev/articles/optimize-cls) ·
[optimize-inp](https://web.dev/articles/optimize-inp) ·
[ченджлог метрик (Chromium)](https://chromium.googlesource.com/chromium/src/+/main/docs/speed/metrics_changelog/README.md)

**Яндекс**
[языковые версии (hreflang)](https://yandex.ru/support/webmaster/yandex-indexing/locale-pages.html) ·
[права на сайт](https://yandex.ru/support/webmaster/ru/service/rights) ·
[Sitemap](https://yandex.ru/support/webmaster/ru/indexing-options/sitemap) ·
[robots.txt](https://yandex.ru/support/webmaster/ru/controlling-robot/robots-txt) ·
[отмена Host (2018)](https://yandex.ru/blog/platon/pereezd-sayta-posle-otkaza-ot-direktivy-host) ·
[индексирование JS β](https://yandex.ru/support/webmaster/ru/yandex-indexing/rendering) ·
[блог: рендеринг страниц (2022)](https://webmaster.yandex.ru/blog/rendering-stranits-javascript-i-proverka-stranitsy-peredavayte-poisku-kontent-v-polnom-obeme) ·
[разметка: FAQ](https://yandex.ru/support/webmaster/ru/schema-org/semantic-faq) ·
[скорость сайта](https://yandex.ru/support/webmaster/ru/yandex-indexing/page-speed.html) ·
[IndexNow](https://yandex.ru/support/webmaster/ru/indexing-options/index-now)

**SvelteKit / Firebase**
[page-options](https://svelte.dev/docs/kit/page-options) ·
[advanced-routing](https://svelte.dev/docs/kit/advanced-routing) ·
[configuration → prerender.entries](https://svelte.dev/docs/kit/configuration) ·
[hooks](https://svelte.dev/docs/kit/hooks) ·
[adapter-static](https://svelte.dev/docs/kit/adapter-static) ·
[kit#9913](https://github.com/sveltejs/kit/issues/9913) ·
[Firebase multisites](https://firebase.google.com/docs/hosting/multisites)

**Краулеры ИИ**
[OpenAI bots](https://developers.openai.com/api/docs/bots) ·
[Anthropic crawler](https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler) ·
[Perplexity bots](https://docs.perplexity.ai/guides/bots)

**Превью ссылок (§8)**
[ogp.me — спецификация Open Graph](https://ogp.me/) ·
[Meta: Images in Link Shares (1200×630)](https://developers.facebook.com/documentation/sharing/webmasters/images) ·
[Meta: Webmasters / Open Graph](https://developers.facebook.com/documentation/sharing/webmasters) ·
[Meta: Graph API scrape=true](https://developers.facebook.com/docs/graph-api/reference/url/) ·
[WhatsApp: Link Previews](https://developers.facebook.com/documentation/business-messaging/whatsapp/link-previews/) ·
[LinkedIn: make your website shareable](https://www.linkedin.com/help/linkedin/answer/a521928) ·
[LinkedIn: 48 часов кэша](https://www.linkedin.com/help/linkedin/answer/a525063) ·
[LinkedIn: Post Inspector](https://www.linkedin.com/help/linkedin/answer/a6233775) ·
[X: удаление превью из Card Validator + кэш 7 дней](https://devcommunity.x.com/t/card-validator-preview-removal/175006) ·
[Telegram: запуск превью (2015)](https://telegram.org/blog/link-preview) ·
[Telegram: @WebpageBot](https://bugs.telegram.org/c/57) ·
[Telegram Bot API: LinkPreviewOptions](https://core.telegram.org/bots/api#linkpreviewoptions)

⚠️ Документация Twitter Cards **живой больше не существует** (§8.5): `developer.x.com/…/cards/…`
редиректит на `docs.x.com/overview`, а в `sitemap.xml` документации X (4 782 адреса) слова `card`
нет ни разу. Цитаты в §8.5 сняты с **архивных снимков официальных страниц** и помечены датой снимка.

**Третьи стороны (не поисковики — помечено как таковое в тексте)**
[llmstxt.org (предложение)](https://llmstxt.org/) ·
[Ahrefs: замер llms.txt, 137K доменов](https://ahrefs.com/blog/llmstxt-study/) ·
[Vercel + MERJ: AI-краулеры не исполняют JS](https://vercel.com/blog/the-rise-of-the-ai-crawler)

---

## Честные пробелы этого документа

- **Наших живых Core Web Vitals никто не мерил** — PageSpeed Insights по `ndimspace.app` в этой
  сессии не запускался, полевых данных без трафика не существует (шаг 10 очереди 3).
- **Сколько англоязычного трафика мы теряем — замера нет и быть не может** (§4.3). Любая цифра была
  бы выдумкой.
- **Доли ИИ-трафика относительно органики я не нашёл** ни в одном исследовании с описанной методикой
  (§6.6).
- **Официального заявления Google о скорости рендеринга** («почти мгновенно») не существует;
  документация говорит «a few seconds, but it can take longer than that» (§10.1).
- **Свежего (2026) измерения по AI-краулерам** сопоставимого качества нет — все ссылаются на
  Vercel/MERJ от декабря 2024 (§10.5).
- **Официальной количественной оценки влияния CWV на ранжирование** не существует ни у Google, ни у
  Яндекса — это проверенная находка, а не пробел поиска (§9.3).
- **Оригинальный пост Мюллера про `llms.txt`** я сам не открывал — цитата пришла через SEJ (§6.4).
- **Эксперимент §5 проверил механику на одном маршруте**, а не перенос лендинга целиком.
- **Живой документации Twitter Cards не существует** — факты §8.5 взяты с архивных снимков
  официальных страниц X. Официального объявления о полном закрытии Card Validator не нашёл.
- **Telegram нигде не документирует свой парсер превью** — ни какие теги читает, ни лимиты, ни срок
  кэша (§8.7). Проверять только живой отправкой.
- **Срок кэша превью WhatsApp — цитаты не нашёл.**
- **Meta противоречит сама себе** про срок обновления превью: 24 часа на живой странице против
  30 дней на архивной (§8.6). Арбитра нет.
- **Первая редакция §8 содержала две ошибки** (утверждала, что у WhatsApp нет официальных требований
  и что у X проверить нечего). Обе исправлены вторым заходом — урок в том, что «источника не нашёл»
  после одной попытки поиска не равно «источника нет».
