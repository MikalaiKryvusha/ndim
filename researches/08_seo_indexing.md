# Исследование 08 — SEO и индексация: что нужно, чтобы NDim Space находился в поиске

> **Зачем этот документ.** Индексация поисковиками — прямая боль из `GOAL.md`: людей в Пространстве
> не прибавится, если сайт нельзя найти. Стек 2.0 уже выбран под эту боль (adapter-static,
> пререндер — см. `vite.config.ts` и `src/routes/+layout.ts`), но пререндер — только фундамент.
> Здесь собрана фактура для **фазы 5 (публикация)** мастер-плана: домен, регистрация в поисковиках,
> sitemap, canonical, двуязычность, специфика Firebase Hosting, Core Web Vitals — и итоговый чеклист.
>
> Собрано 2026-07-11 по официальным источникам: Google Search Central, документация Firebase
> Hosting, справка Яндекс Вебмастера, документация SvelteKit. Ссылка на источник — прямо у
> утверждения; непроверенные факты помечены. **Живой справочник — не помечается DONE.**

---

## 1. Что уже решено стеком — и чего это НЕ решает

Google обрабатывает JS-сайты в три фазы: crawling → rendering → indexing. Страница попадает
в **очередь рендеринга**, где headless Chromium исполняет JS, — это дополнительная задержка
и точка отказа. Google прямо пишет: *«server-side rendering or pre-rendering is still a great
idea — it makes your website faster for users and crawlers, and not all bots can run JavaScript»*
([Google: JavaScript SEO basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)).

**Что у нас уже есть** (проверено по файлам проекта):

- `export const prerender = true` глобально — `src/routes/+layout.ts`; adapter-static —
  `vite.config.ts`. Весь сайт собирается в статический HTML в `build/`.
- Тексты лендинга попадают в сырой HTML без исполнения JS — проверено e2e-стендом
  (коммит `d454886`, `npm run e2e`).
- `static/robots.txt` — «разрешено всё» (`User-agent: *` + пустой `Disallow:`).
- `<title>`, `meta description`, `og:title/description/type/locale` — в `<svelte:head>`
  `src/routes/+page.svelte`.

**Чего пререндер НЕ решает:**

| Не решено | Почему это важно |
|---|---|
| Обнаружение (discovery) | Кроулер должен узнать о сайте: заявка в Search Console / Вебмастер, sitemap, внешние ссылки |
| Дубли хостов | Один и тот же HTML будет отдаваться с `ndim.space`, `ndim-space.web.app`, `ndim-space.firebaseapp.com` — нужен canonical (§5) |
| EN-версия | Клиентский свап языка для поисковика не существует (§6) |
| Разметка | canonical, `og:url`/`og:image`, JSON-LD — в коде их пока нет (§5) |
| Ранжирование | Индексация ≠ позиция. Релевантность контента и ссылки важнее любой технической настройки ([Google: page experience](https://developers.google.com/search/docs/appearance/page-experience)) |

---

## 2. Домен: привязка к Firebase Hosting

Домен предстоит купить: `ndim.space` или вернуть `ndim.app`
(`interviews/interview_001_stack_hosting_backend.md`, В2). Замечание: `.app` — TLD c принудительным
HTTPS (HSTS preload); Firebase выдаёт SSL автоматически, так что это не препятствие
(*непроверено в этой сессии, известный факт о Google Registry*). С точки зрения SEO выбор между
двумя gTLD нейтрален (*непроверено, устоявшаяся позиция Google*).

### Шаги привязки ([Firebase: Connect a custom domain](https://firebase.google.com/docs/hosting/custom-domain))

1. Консоль Firebase → Hosting → Add custom domain.
2. **Верификация владения — TXT-запись** в DNS. Важно: Firebase требует **хранить TXT-запись
   постоянно**, а не только на время проверки.
3. **A-записи** на выданные IP (quick setup). Для домена с живым трафиком есть advanced setup
   (сначала TXT + CAA + ACME-challenge, потом A-записи — миграция без простоя); нам хватит quick,
   на новом домене трафика нет. Старые A/AAAA/CNAME-записи удалить — иначе сертификат не выдадут.
4. **SSL-сертификат** выпускается и раскатывается автоматически, до 24 ч; в процессе может
   показываться чужой сертификат — это штатно.
5. Сроки: DNS-проверка обычно часы, максимум ~24 ч.

### www / без-www и 301

При добавлении домена консоль Firebase предлагает **redirect-режим**: все запросы на один домен
перенаправляются на второй (например, `www.ndim.space` → `ndim.space`)
([там же](https://firebase.google.com/docs/hosting/custom-domain)). Так и сделать: apex — основной,
www — редирект. Один канонический хост = нет дублей. Редирект — самый сильный сигнал каноничности
для Google ([Google: consolidate duplicate URLs](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)).

### Что будет со старым `ndim-space.web.app`

- Дефолтные домены `PROJECT_ID.web.app` и `PROJECT_ID.firebaseapp.com` продолжают отдавать тот же
  контент после привязки кастомного домена; возможность их отключить в документации
  **не описана** (считаем, что её нет — *непроверено официально*).
- `redirects` в `firebase.json` матчатся **по пути**, не по хосту ([Firebase: full config](https://firebase.google.com/docs/hosting/full-config)) —
  сделать 301 `web.app → ndim.space` конфигом хостинга нельзя (без Cloud Functions, которых у нас
  нет по решению интервью №001).
- **Рабочий механизм — абсолютный `rel="canonical"` на `https://ndim.space/…`**, запечённый в
  пререндеренный HTML: он автоматически отдаётся со всех трёх хостов и склеивает дубли на
  кастомный домен. Canonical — подсказка, не директива, но сильная
  ([Google: canonical](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)).
- Сейчас на `ndim-space.web.app` живёт приложение 1.x, и кнопки лендинга ведут туда (`STATUS.md`:
  деплой лендинга в прод создал бы кольцо). Судьба web.app-адреса решается вместе с переездом 1.x —
  до этого момента canonical у **лендинга** уже должен указывать на кастомный домен.

---

## 3. Регистрация в поисковиках

Аудитория двуязычная → регистрируемся и в Google, и в Яндексе; Bing — почти бесплатно довеском.

### Google Search Console

- Два типа ресурсов: **Domain property** (`ndim.space` — покрывает все поддомены и протоколы,
  верификация **только DNS TXT/CNAME**) и **URL-prefix property** (точный префикс; методы:
  HTML-файл, meta-тег, Google Analytics, Tag Manager)
  ([GSC: ownership verification](https://support.google.com/webmasters/answer/9008080)).
- Нам правильнее **Domain property**: мы всё равно идём в DNS ради привязки хостинга — заодно
  положить и TXT Search Console. Одна запись закроет apex + www.
- Подача sitemap: раздел Sitemaps в GSC, API, либо строка `Sitemap:` в robots.txt
  ([Google: build & submit sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)).
- Для разовой быстрой индексации главной — URL Inspection → Request indexing (штатная функция GSC,
  [справка](https://support.google.com/webmasters/answer/9012289), *страница не перечитывалась
  в этой сессии*).

### Яндекс Вебмастер

- Способы подтверждения прав: **HTML-файл** в корне (рекомендуемый), **meta-тег**
  `yandex-verification` на главной, **TXT-запись DNS**, менеджер тегов, через регистратора (бета)
  ([Яндекс: права на сайт](https://yandex.ru/support/webmaster/service/rights.html)).
  Для статики проще всего HTML-файл в `static/` — но раз DNS уже открыт, TXT единообразнее.
- Sitemap: добавить в разделе «Файлы Sitemap» и/или директивой `Sitemap:` в robots.txt
  ([Яндекс: Sitemap](https://yandex.ru/support/webmaster/controlling-robot/sitemap.html)).
- Яндекс поддерживает **IndexNow** — мгновенное уведомление об изменившихся URL
  ([Яндекс: IndexNow](https://yandex.ru/support/webmaster/ru/indexing-options/index-now)). Bing —
  участник того же протокола ([indexnow.org](https://www.indexnow.org/)). Для сайта из 1–2 страниц
  это овердоз — отметить и забыть до появления динамического контента.

### Bing Webmaster Tools

- Сайт можно **импортировать из Google Search Console**: верификация проходит автоматически,
  sitemap подтягивается из GSC ([Bing blog: Import from Search Console](https://blogs.bing.com/webmaster/september-2019/Import-sites-from-Search-Console-to-Bing-Webmaster-Tools)).
  10 минут работы после настройки GSC.

---

## 4. sitemap.xml и robots.txt

### robots.txt

Текущий `static/robots.txt` («разрешено всё») корректен. После появления домена добавить строку
с **абсолютным** URL sitemap — её понимают и Google, и Яндекс
([Google](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap),
[Яндекс](https://yandex.ru/support/webmaster/controlling-robot/sitemap.html)):

```
User-agent: *
Disallow:

Sitemap: https://ndim.space/sitemap.xml
```

Антипаттерн на будущее: **нельзя** одновременно закрыть страницу в robots.txt и поставить на ней
`noindex` — заблокированную страницу робот не прочитает и `noindex` не увидит
([Google: block indexing](https://developers.google.com/search/docs/crawling-indexing/block-indexing)).

### sitemap.xml

- Лимиты одинаковые у Google и Яндекса: 50 000 URL / 50 МБ на файл, UTF-8, абсолютные URL
  ([Google](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap),
  [Яндекс](https://yandex.ru/support/webmaster/controlling-robot/sitemap.html)).
- Google **игнорирует `<priority>` и `<changefreq>`**; `<lastmod>` учитывает, только если он
  правдив и стабилен ([там же](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)).
  Вывод: пишем только `<loc>` (+ `<lastmod>`, если умеем не врать).
- Для сайта из 1–2 страниц sitemap не критичен, но он бесплатный, а в GSC/Вебмастере даёт
  диагностику обхода — делаем.

**Как генерировать в SvelteKit (adapter-static).** Канонический способ из документации SvelteKit —
эндпоинт `src/routes/sitemap.xml/+server.js`, возвращающий XML с `Content-Type: application/xml`
([SvelteKit: SEO](https://svelte.dev/docs/kit/seo)). При глобальном `prerender = true` эндпоинт
пререндерится в статический файл `build/sitemap.xml` — ровно наш случай. Список URL на нашем
масштабе — литерал в коде (KISS); экосистемные генераторы (`super-sitemap`, `svelte-sitemap`)
имеют смысл от десятков маршрутов, не сейчас.

---

## 5. canonical, meta, Open Graph, JSON-LD

### canonical

- Иерархия сигналов каноничности: 301-редирект (сильнейший) → `rel="canonical"` → sitemap (слабый)
  ([Google: consolidate duplicate URLs](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)).
- Правила: **абсолютный URL**, самоканоникал на самой канонической странице — рекомендуется,
  кросс-доменный canonical допустим (наш случай: web.app-хосты → `ndim.space`).
- У нас canonical пока нет вообще — добавить в `<svelte:head>` после покупки домена (§2).

### meta

`<title>` и `meta description` уже есть и уникальны (страница одна). Правило на будущее: каждый
новый маршрут получает **свои** title/description
([SvelteKit: SEO](https://svelte.dev/docs/kit/seo),
[Google: JS SEO basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)).

### Open Graph

OG — не сигнал ранжирования Google, а превью в соцсетях и мессенджерах (Telegram, WhatsApp —
для «пригласи друга» это витрина). По протоколу обязательны **og:title, og:type, og:image,
og:url** ([ogp.me](https://ogp.me/)). У нас есть title/description/type/locale, **нет og:url и
og:image** — оба требуют абсолютных URL, то есть домена. Картинку 1200×630 можно подготовить
заранее (стандарт де-факто для share-превью; *размер — общепринятая практика, не спецификация*).

### JSON-LD (schema.org)

Уместны две сущности, обе — только на главной:

1. **WebSite** — влияет на «site name» в выдаче Google. Обязательные поля `name` + `url`,
   опционально `alternateName`; работает только на уровне домена/поддомена; разметка должна быть
   одинаковой на всех вариантах хоста ([Google: site names](https://developers.google.com/search/docs/appearance/site-names)).
2. **Organization** — административные данные, логотип в выдаче, задел на knowledge panel.
   Обязательных полей нет; рекомендуются `name`, `url`, `logo` (лого ≥112×112), `sameAs`;
   формат — JSON-LD в `<head>` главной ([Google: Organization](https://developers.google.com/search/docs/appearance/structured-data/organization)).

Для нас: WebSite (`name: "NDim Space"`) — сразу после домена; Organization — когда будет логотип,
доступный по постоянному URL. Разметка Product/FAQ и прочее — не про наш лендинг.

---

## 6. Двуязычность: RU пререндерится, EN — невидимка

### Почему клиентский свап EN не существует для поисковиков

- В пререндеренном HTML — только RU; EN появляется в DOM после клика пользователя. Googlebot
  видит только контент отрендеренного HTML, по кликам не ходит
  ([Google: JS SEO basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)).
- Google прямо: *«Google recommends using different URLs for each language version of a page
  rather than using cookies or browser settings to adjust the content language»*
  ([Google: multi-regional sites](https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites)).
- Автоопределение по заголовкам тоже не выход: кроулер **не шлёт `Accept-Language`** и ходит
  в основном с US-IP ([Google: locale-adaptive pages](https://developers.google.com/search/docs/specialty/international/locale-adaptive-pages)).
  Поэтому и **i18n-rewrites Firebase Hosting** (отдача контента по языку/стране запроса,
  [Firebase: i18n rewrites](https://firebase.google.com/docs/hosting/i18n-rewrites)) — не решение
  для SEO, только для UX.

Это осознанный `TODO(SEO)` в `src/routes/+page.svelte` (строки 12–13) — паритет с 1.x, долг
зафиксирован.

### Целевая схема: per-URL i18n

- URL-структура: подкаталог — `ndim.space/` (RU) и `ndim.space/en/` (EN). Подкаталоги Google
  называет самым дешёвым в поддержке вариантом; URL-параметры (`?lang=en`) — не рекомендованы
  ([Google: multi-regional sites](https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites)).
- В SvelteKit это делается опциональным параметром маршрута (`src/routes/[[lang]]/+page.svelte`)
  либо явной парой маршрутов `/` и `/en/` с общим словарём строк (словарь `t` в `+page.svelte`
  уже устроен как `{ru, en}` — выносится в модуль почти механически). Оба варианта пререндерятся
  adapter-static штатно. Библиотеки (paraglide-js и т.п.) — овердоз для одной страницы.
- **hreflang**: на каждой версии — `<link rel="alternate" hreflang="…">` на **все** версии,
  включая саму себя; связи обязаны быть **двусторонними**, иначе игнорируются; плюс `x-default`
  для несовпавших локалей ([Google: localized versions](https://developers.google.com/search/docs/specialty/international/localized-versions)).
  Для нас: `ru` → `/`, `en` → `/en/`, `x-default` → `/` (RU — основной язык проекта).
- Способ размещения hreflang — **именно `<link>` в `<head>`**: Google считает все три способа
  (HTML, HTTP-заголовок, sitemap) эквивалентными, но Яндекс **перестал поддерживать sitemap**
  для языковых версий и рекомендует разметку в `<link>`
  ([Яндекс: языковые версии](https://yandex.ru/support/webmaster/yandex-indexing/locale-pages.html)).
  HTML-вариант покрывает обе системы.
- Также на EN-версии: `<html lang="en">` из пререндера (не из onMount), свои `title`/`description`,
  `og:locale`, canonical на `/en/`, обе страницы в sitemap.

### Цена и рекомендация

Сейчас, пока страница одна: вынести словарь, добавить маршрут `/en/`, hreflang×2, обновить
sitemap — порядка одного дня работы вместе с e2e-проверками. С каждым новым экраном цена растёт.
**Рекомендация:** внедрять сразу после покупки домена, до любого продвижения EN-аудитории, и до
того, как появятся экраны 2.0 (чтобы новые экраны рождались сразу в per-URL схеме). До внедрения
EN-язык в поиске просто отсутствует — это надо честно понимать.

---

## 7. Специфика Firebase Hosting

Текущий `firebase.json` минимален: `public: build` + `ignore`, ничего из нижеперечисленного не
настроено. Источник по всем пунктам — [Firebase: full config](https://firebase.google.com/docs/hosting/full-config).

- **cleanUrls: true** — отдаёт `/page.html` по адресу `/page` и 301-редиректит `/page.html` →
  `/page`. SvelteKit с дефолтным `trailingSlash: 'never'` пререндерит маршруты в `page.html`
  ([SvelteKit: page options](https://svelte.dev/docs/kit/page-options)), а adapter-static
  предупреждает: если хост не отдаёт `/a.html` по запросу `/a`, нужен `trailingSlash: 'always'`
  ([SvelteKit: adapter-static](https://svelte.dev/docs/kit/adapter-static)). С `cleanUrls: true`
  хост отдаёт — значит, SvelteKit-дефолт остаётся, а URL чистые. Включить при первом же втором
  маршруте (`/en/`).
- **trailingSlash** (true/false/не задан) — принудительно добавляет/убирает конечный слэш;
  без параметра слэш остаётся только у directory-index (`about/index.html`). С `cleanUrls` +
  SvelteKit-дефолтом можно не задавать; главное — не плодить `/en` и `/en/` как две сущности:
  дубли URL вредят SEO ([SvelteKit: SEO](https://svelte.dev/docs/kit/seo)).
- **redirects** — 301/302, glob или RE2-regex, **только по пути** (не по хосту) — см. §2 про
  невозможность 301 с web.app.
- **Кеш**: вся статика автоматически кешируется на CDN, кеш **сбрасывается при каждом деплое**;
  404 кешируется 10 минут; заголовки переопределяются секцией `headers`
  ([Firebase: manage cache](https://firebase.google.com/docs/hosting/manage-cache)). Для
  пререндеренного HTML дефолт разумен; иммутабельным ассетам SvelteKit (`_app/immutable/**`)
  можно выдать `Cache-Control: public, max-age=31536000, immutable` — оптимизация, не SEO-нужда.
- **404**: положить `404.html` в `public` — Hosting подхватит автоматически. SvelteKit не
  генерирует его сам при полном пререндере; без него Firebase отдаёт свою заглушку. Осмысленные
  коды ответов — среди рекомендаций Google ([JS SEO basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)).
- **Preview-каналы**: URL вида `PROJECT--CHANNEL-HASH.web.app` **публичны** — *«although preview
  URLs are difficult to guess…, they are public. So, anyone who knows the URL can access it»*;
  про `noindex`/X-Robots-Tag для превью документация **молчит** — то есть автоматической защиты
  от индексации нет ([Firebase: preview & deploy](https://firebase.google.com/docs/hosting/test-preview-deploy)).
  Наш канал `ndim-space--landing-3jvzs4cd.web.app` живёт до 2026-08-10 (`STATUS.md`). Практический
  риск мал (случайный хеш, ссылок извне нет, канал смертен), радикальное лечение — отдельный
  деплой-конфиг с заголовком `X-Robots-Tag: noindex` для превью — не оправдывает сложности (KISS).
  Правило гигиены: не публиковать preview-ссылки на индексируемых страницах.

---

## 8. Core Web Vitals — кратко

- CWV (LCP, INP, CLS) **используются системами ранжирования**, но как один из многих сигналов;
  *«Google Search always seeks to show the most relevant content, even if the page experience
  is sub-par»*. В page experience также входят HTTPS, mobile-friendly, отсутствие навязчивых
  интерстишелов ([Google: page experience](https://developers.google.com/search/docs/appearance/page-experience)).
- Наш статический лендинг структурно в отличной позиции: SvelteKit + пререндер = минимум JS
  ([SvelteKit: SEO](https://svelte.dev/docs/kit/seo)); инлайн-скрипт темы в `app.html` ставит
  `data-theme` до отрисовки — защита от CLS-вспышки; шрифты и фоновые эффекты — главные кандидаты
  в LCP-проблемы.
- Проверять: **PageSpeed Insights** (лабораторные метрики доступны уже сейчас по preview-URL),
  позже — отчёт Core Web Vitals в Search Console (полевые данные появятся только с реальным
  трафиком) ([там же](https://developers.google.com/search/docs/appearance/page-experience)).

---

## 9. Чеклист фазы 5

Метки: **[сейчас]** — делается уже; **[домен]** — после покупки домена;
**[2.0]** — после появления экранов 2.0 / переезда 1.x.

1. **[сейчас · владелец]** Купить `ndim.space` или вернуть `ndim.app` (интервью №001, В2) —
   блокирует пункты 4–13.
2. **[сейчас]** Прогнать preview-URL через PageSpeed Insights; починить очевидное (LCP/CLS).
3. **[сейчас]** Подготовить `og:image` 1200×630 (положить в `static/`); каркас
   `sitemap.xml/+server.ts` можно написать заранее с доменом-константой.
4. **[домен]** Привязать домен: TXT-верификация + A-записи; www → apex 301 в консоли Firebase (§2).
5. **[домен]** Абсолютный `rel="canonical"` на каждой странице — гасит дубли
   web.app/firebaseapp.com (§2, §5).
6. **[домен]** Дозаполнить OG: `og:url`, `og:image`; JSON-LD **WebSite** на главной (§5).
7. **[домен]** `cleanUrls: true` в `firebase.json`; проверить отсутствие дублей со слэшем (§7).
8. **[домен]** `sitemap.xml` (пререндеренный эндпоинт) + строка `Sitemap:` в robots.txt (§4).
9. **[домен]** Google Search Console: Domain property через DNS TXT → подать sitemap →
   Request indexing главной (§3).
10. **[домен]** Яндекс Вебмастер: подтверждение прав (TXT или HTML-файл) → подать sitemap (§3).
11. **[домен]** Bing Webmaster Tools: импорт из GSC (§3).
12. **[домен]** Per-URL i18n: `/en/` + hreflang (`ru`/`en`/`x-default`, двусторонне, в `<link>`) +
    пререндеренный `lang` — закрывает `TODO(SEO)` из `+page.svelte` (§6).
13. **[домен]** `404.html`; опционально — `Cache-Control: immutable` для `_app/immutable/**` (§7).
14. **[2.0]** Уникальные title/description/canonical на каждый новый публичный маршрут; sitemap
    расширять; приватные экраны — `noindex` (meta, НЕ через robots.txt — §4) или закрытая зона.
15. **[2.0]** Судьба `ndim-space.web.app` после переезда 1.x: canonical со всех страниц на домен
    уже стоит (п.5); JSON-LD Organization — когда появится логотип; IndexNow — когда появится
    динамический контент (§3).

---

## Главные источники

- Google Search Central: [JavaScript SEO basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics) ·
  [canonical/дубли](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls) ·
  [sitemaps](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap) ·
  [hreflang](https://developers.google.com/search/docs/specialty/international/localized-versions) ·
  [многоязычные сайты](https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites) ·
  [locale-adaptive](https://developers.google.com/search/docs/specialty/international/locale-adaptive-pages) ·
  [page experience](https://developers.google.com/search/docs/appearance/page-experience) ·
  [site names / WebSite](https://developers.google.com/search/docs/appearance/site-names) ·
  [Organization](https://developers.google.com/search/docs/appearance/structured-data/organization) ·
  [block indexing](https://developers.google.com/search/docs/crawling-indexing/block-indexing) ·
  [верификация GSC](https://support.google.com/webmasters/answer/9008080)
- Firebase Hosting: [custom domain](https://firebase.google.com/docs/hosting/custom-domain) ·
  [full config](https://firebase.google.com/docs/hosting/full-config) ·
  [manage cache](https://firebase.google.com/docs/hosting/manage-cache) ·
  [preview channels](https://firebase.google.com/docs/hosting/test-preview-deploy)
- Яндекс Вебмастер: [права на сайт](https://yandex.ru/support/webmaster/service/rights.html) ·
  [Sitemap](https://yandex.ru/support/webmaster/controlling-robot/sitemap.html) ·
  [языковые версии](https://yandex.ru/support/webmaster/yandex-indexing/locale-pages.html) ·
  [IndexNow](https://yandex.ru/support/webmaster/ru/indexing-options/index-now)
- SvelteKit: [SEO](https://svelte.dev/docs/kit/seo) ·
  [adapter-static](https://svelte.dev/docs/kit/adapter-static) ·
  [page options / trailingSlash](https://svelte.dev/docs/kit/page-options)
- Bing: [импорт из Search Console](https://blogs.bing.com/webmaster/september-2019/Import-sites-from-Search-Console-to-Bing-Webmaster-Tools) ·
  [Open Graph протокол](https://ogp.me/)
