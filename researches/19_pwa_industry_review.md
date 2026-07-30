# Исследование 19 — Переиздание PWA и ссылки из писем: как это делает индустрия

**Когда:** 2026-07-30 · **Зачем:** канон `AGENT_GUIDE.md` шаг 7б — перед КРУПНОЙ фичей сначала
обзор индустрии по первоисточникам, потом проектирование ·
**Что разблокирует:** `bugs/83` (п. 12 волны владельца — ссылка из письма открылась в браузере, а
не в установленном приложении) · `plans/07` тир B2 (переиздание PWA) · `bugs/58` (иконка и сплэш) ·
`bugs/62` (кнопка установки)

> ⚠️ Документ написан **по прочитанному в вебе**, ссылки на первоисточники стоят у каждого
> утверждения. Обзор без ссылок — признак халтуры (`AGENT_GUIDE`), потому что память модели
> выдумывает ровно так же, как в предметной области.

---

## 0. Ответ владельцу одной страницей

Владелец описал боль так: *«при проходе по ссылке авторизации из письма — открыло приложение в
браузере, а не в PWA, который у меня установлен… меня не авторизовало в браузере, ибо браузер не в
курсе о том, что я начинал флоу в PWA»*.

Разбор индустрии даёт **три факта, которые меняют постановку задачи**:

1. **«Браузер не в курсе» — это про iOS и только про iOS.** На Android установленное
   приложение (WebAPK) работает **в том же профиле Chrome**: cookies, `localStorage`,
   IndexedDB — общие с вкладками браузера ([web.dev → WebAPKs on Android][webapk]). На
   **iOS хранилище PWA полностью изолировано** от Safari и от других иконок: сессия, cookies,
   `localStorage` и даже экземпляр service worker не разделяются
   ([Netguru][netguru], [Jakub Kozak][kozak]). То есть симптом «начал в приложении — не пустило в
   браузере» на Android невозможен, а на iOS **неустраним в принципе**.
2. **Ссылку в приложение уводит не «правильное письмо», а СОВПАДЕНИЕ АДРЕСА СО СКОУПОМ.**
   Браузер captures переход, только если URL попадает в `scope` установленного приложения
   ([Chrome → Navigation management into installed PWAs][navcap]). Сегодня письма NDim ведут на
   **чужой адрес** (Action URL Firebase указывает на корень старого домена — записано в
   `src/routes/+page.svelte`), поэтому захватывать их нечему, даже будь у нас манифест.
3. **У 2.0 нет ни манифеста, ни service worker** (`bugs/83`, доказано кодом). Значит у владельца
   на телефоне стоит приложение **1.x**, и никакая правка 2.0 сегодня не может открыть ссылку в
   нём. Это первое, что надо проверить на его устройстве.

**Вывод для проектирования:** задача «ссылка ведёт в приложение» решается не одним фиксом, а
тремя независимыми слоями — (а) собственный домен в письмах, (б) манифест со `scope`, покрывающим
адрес письма, (в) `launch_handler`, чтобы ссылка попала в УЖЕ ОТКРЫТОЕ окно. И даже все три вместе
дают результат **только на Android/десктопе**; на iOS остаётся честная переспрашивающая форма.

---

## 1. Что вообще делает приложение «установленным» (золотой стандарт)

**Манифест.** Спецификация требует минимум `name` и `icons`, но реально работающий набор — пять
полей: `name`, `short_name`, `icons`, `start_url`, `display`
([web.dev → Web app manifest][manifest], [MDN → Web application manifest][mdnmanifest]).

**Иконки.** Практический минимум для Chrome/Android — **192×192 и 512×512 PNG**, плюс отдельная
**maskable**-иконка 512×512 (`"purpose": "maskable"`), чтобы Android мог обрезать её под круг,
квадрат или каплю без обрезания смысла ([web.dev][manifest]).

**Service worker.** Требование смягчилось, и это важно знать точно: Chrome **убрал** требование
service worker с обработчиком `fetch` для установки из меню (мобильный — с версии 108, десктоп —
с 112), но **автоматическое приглашение установить** (`beforeinstallprompt`) по-прежнему опирается
на его наличие ([Chrome → Revisiting Chrome's installability criteria][installcrit]).
То есть: без SW приложение установить МОЖНО руками, но кнопка «Установить» сама не появится.

**iOS/Safari.** Манифест Safari поддерживает частично: конфигурация иконки и сплэша исторически
идёт через собственные `<link rel="apple-touch-icon">` ([web.dev][manifest]). Установка — только
вручную «На экран «Домой»» из самого Safari; из встроенных браузеров (почта, соцсети) пункта
«Добавить на экран Домой» может не быть вовсе ([MagicBell → PWA iOS limitations][ios]).

---

## 2. Как индустрия уводит ссылку в установленное приложение

### 2.1. Android и десктоп — «навигационный захват» (navigation capturing)

Механика, описанная Chrome ([Navigation management into installed PWAs][navcap]):

1. переход должен быть «захватываемым» (создаёт новый фрейм, не открывается во вспомогательном
   контексте);
2. браузер ищет приложение, чей **`scope` покрывает целевой URL**;
3. проверяет **настройку человека** (он мог отключить открытие в приложении);
4. запускает приложение по алгоритму `launch_handler`.

**`launch_handler.client_mode`** ([MDN → Launch Handler API][launch]) — четыре значения:

| Значение | Что делает |
|---|---|
| `focus-existing` | отдать ссылку УЖЕ ОТКРЫТОМУ окну; целевой URL приходит в `launchQueue.setConsumer()` |
| `navigate-existing` | перевести уже открытое окно на адрес ссылки |
| `navigate-new` | открыть новое окно приложения |
| `auto` (по умолчанию) | решает браузер: на мобильном обычно `navigate-existing`, на десктопе `navigate-new` |

Статус: `launch_handler` доступен с Chrome 110 и «становится по-настоящему полезен с обновлением
навигационного захвата в Chrome 139+» ([Chrome][navcap]); MDN помечает API как
**Limited availability / не Baseline** ([MDN][launch]). Более старый черновик `capture_links`
([WICG][wicg]) в MDN уже не упоминается — в проектирование его не берём.

### 2.2. Android + собственный APK — Digital Asset Links

Если приложение упаковано в APK (TWA), связь домена и приложения объявляется файлом
`https://<домен>/.well-known/assetlinks.json`; Android проверяет его для КАЖДОГО хоста из
intent-фильтров ([Android → Verify App Links][applinks],
[Android → Configure website associations][assetcfg]). Проверка учитывает **ключ подписи APK**, и
самая частая причина отказа — подпись не тем ключом ([Chrome → Multi-origin TWA][twamulti]).

⚠️ **Прямое следствие для NDim:** ключ подписи 1.x **изъят из репозитория** (`bugs/02`), то есть
обновить старое установленное приложение мы не можем в принципе — только выпустить новое. Это не
техническая деталь, а развилка для владельца (см. §5).

### 2.3. iOS — механизма нет

Universal Links работают для НАТИВНЫХ приложений; для PWA на домашнем экране аналога нет. Ссылка
из «Почты» откроется в Safari (или во встроенном браузере), а не в установленной иконке
([MagicBell][ios], [обсуждение Apple][applediscuss]). Плюс изоляция хранилища (§0.1) — то есть
даже если человек перейдёт из Safari в приложение руками, начатый в приложении флоу входа в Safari
не «узнается».

**Что делает индустрия на iOS:** не борется, а строит флоу так, чтобы он переживал разрыв —
переспрашивает почту на посадочной странице. Это же рекомендует Firebase (§3).

---

## 3. Вход по ссылке из письма: чем платит каждый способ

**Как это устроено у Firebase** ([Firebase → Email link auth in JavaScript][fbemail]): почта, с
которой начали, кладётся в `localStorage` устройства-инициатора; при переходе по ссылке
`isSignInWithEmailLink()` подтверждает вид ссылки, и почта берётся из хранилища. Если её там нет
(другое устройство ИЛИ другое хранилище — как на iOS), **надо спросить почту заново**, и это не
костыль, а рекомендация Firebase: она защищает от подмены сессии (session fixation).

**Firebase Dynamic Links, которыми раньше уводили ссылки в приложения, ВЫКЛЮЧЕНЫ 25 августа
2025 года** ([Firebase → Dynamic Links FAQ][fdlfaq]). Вход по почтовой ссылке остался жив, но
переведён на **домен Firebase Hosting проекта** ([Firebase → Migrate email link sign-in][fdlmig]).
Значит любые советы «сделайте динамическую ссылку, и она откроется в приложении» — устарели, и
опираться на них нельзя.

**Три способа, между которыми выбирает индустрия:**

| Способ | Что даёт | Чем платит |
|---|---|---|
| **A. Ссылка ведёт на СВОЙ домен в скоупе приложения** (`ndimspace.app/...`) | Android/десктоп открывают ссылку в приложении сами; на iOS хотя бы попадаем на свою страницу, а не на чужой домен | Надо переопределить Action URL в Firebase Console и держать домен в `authorized domains`; ссылка обязана попадать в `scope` |
| **B. Переспросить почту, если её нет в хранилище** | Работает ВЕЗДЕ, включая iOS и переход с другого устройства; рекомендация самого Firebase | Один лишний шаг для человека; текст должен объяснять, почему спрашиваем |
| **C. Нативная обёртка (TWA/APK) + assetlinks** | Ссылки уводятся в приложение самой ОС, магазин | Ключ подписи, публикация, ревью; для iOS всё равно ничего не меняет |

**Что годится нам:** **A + B обязательны, C — отдельное решение владельца.** A устраняет причину
(ссылка ведёт на чужой адрес), B делает флоу устойчивым к разрыву хранилищ, который на iOS
неустраним. Заметим: **B в продукте УЖЕ ЕСТЬ** — дверь «У меня уже есть аккаунт» просит почту
(`bugs/84`, интервью №007 В4). То есть худший исход для человека сегодня — лишний ввод почты, а
не тупик.

---

## 4. Чего в этом обзоре сознательно НЕТ

- **Push-уведомлений.** Они относятся к PWA, но это отдельная фича с отдельной ценой (разрешения,
  приватность, `GOAL.md` про отказ от механик удержания). Смешивать с переизданием PWA нельзя.
- **Офлайн-режима.** Service worker нужен нам для установки-из-меню и сплэша, а не ради офлайна;
  офлайн у приложения знакомств — сомнительная ценность и большой риск показать устаревшие данные.
- **Выбора магазина/TWA.** Это решение владельца (ключ подписи, аккаунт разработчика), а не
  техническая развилка.

---

## 5. Что из этого следует для NDim (проект, не код)

**Шаг 1 — узнать факт на устройстве владельца.** Что именно у него установлено: приложение 1.x
(старый адрес `ndim-space.web.app`), TWA из магазина или ярлык? От ответа зависит ВСЁ: старое
приложение мы обновить не можем (ключ изъят, `bugs/02`), а новое надо ставить заново.

**Шаг 2 — увести письма на свой домен.** Action URL писем сегодня указывает на корень старого
домена; лендинг уже умеет ловить `mode=signIn&oobCode=…` и переводить внутрь
(`src/routes/+page.svelte`). Правка — в консоли Firebase + `authorized domains`, код почти не
трогается.

**Шаг 3 — манифест 2.0** (`name`, `short_name`, `icons` 192/512 + maskable, `start_url`, `display:
standalone`, `scope: /`, `lang`, `theme_color`, `background_color`) + `apple-touch-icon` для iOS.
Два манифеста RU/EN, как было в 1.x (`researches/12`), — под вопросом: сегодня язык переключается
на клиенте, и два манифеста означают два `scope`. **Решение владельца.**

**Шаг 4 — `launch_handler: { client_mode: "navigate-existing" }`,** чтобы ссылка попадала в уже
открытое окно приложения, а не плодила новые. Поддержка ограничена, поведение по умолчанию
(`auto`) разумно — то есть это улучшение, а не фундамент.

**Шаг 5 — service worker**, минимальный, ради установки-из-меню и приглашения (`bugs/62`).
Осторожно: SW кеширует статику, а у нас пререндеренный сайт — стратегия кеша должна быть такой,
чтобы человек не застревал на старой сборке.

**Шаг 6 — честно сказать про iOS.** Ни один шаг не заставит письмо открыться в установленной
иконке на iPhone. Наш ответ там — форма «У меня уже есть аккаунт», и её текст должен быть понятен
человеку, который «уже вошёл, но не там».

---

## Источники

- [web.dev → WebAPKs on Android][webapk] — установленное приложение живёт в профиле Chrome,
  хранилище общее с браузером.
- [Netguru → How to share session cookie or state between PWA in standalone mode and Safari on
  iOS][netguru], [Jakub Kozak → How to share state/data between a PWA in iOS Safari and standalone
  mode][kozak] — изоляция хранилища на iOS.
- [Chrome for Developers → Navigation management into installed PWAs][navcap] — алгоритм
  навигационного захвата, роль `scope`, настройка человека, Chrome 139+.
- [MDN → Launch Handler API][launch] — `launch_handler.client_mode`, значения, статус Limited
  availability.
- [WICG → declarative link capturing][wicg] — исторический черновик `capture_links`.
- [web.dev → Web app manifest][manifest], [MDN → Web application manifest][mdnmanifest] — поля,
  иконки, maskable, ограничения Safari.
- [Chrome → Revisiting Chrome's installability criteria][installcrit] — SW с `fetch` больше не
  нужен для установки из меню (108/112), но нужен для автоприглашения.
- [Android → Verify App Links][applinks], [Android → Configure website associations][assetcfg],
  [Chrome → Multi-origin TWA][twamulti] — Digital Asset Links, `.well-known/assetlinks.json`,
  зависимость от ключа подписи.
- [Firebase → Authenticate with Firebase Using Email Link in JavaScript][fbemail] — почта в
  `localStorage`, переспрашивание против session fixation.
- [Firebase → Dynamic Links Deprecation FAQ][fdlfaq], [Firebase → Migrate email link sign-in away
  from Dynamic Links][fdlmig] — выключение 25.08.2025, переезд на домен Firebase Hosting.
- [MagicBell → PWA iOS Limitations and Safari Support][ios], [обсуждение на форуме Apple][applediscuss]
  — установка только из Safari, ссылки из писем в приложение не уводятся.

[webapk]: https://web.dev/articles/webapks
[netguru]: https://www.netguru.com/blog/how-to-share-session-cookie-or-state-between-pwa-in-standalone-mode-and-safari-on-ios
[kozak]: https://jakub-kozak.medium.com/how-to-share-state-data-between-a-pwa-in-ios-safari-and-standalone-mode-64174a48b043
[navcap]: https://developer.chrome.com/docs/capabilities/pwa-navigation-management
[launch]: https://developer.mozilla.org/en-US/docs/Web/API/Launch_Handler_API
[wicg]: https://github.com/WICG/web-app-launch/blob/main/declarative_link_capturing.md
[manifest]: https://web.dev/learn/pwa/web-app-manifest
[mdnmanifest]: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest
[installcrit]: https://developer.chrome.com/blog/update-install-criteria
[applinks]: https://developer.android.com/training/app-links/verify-applinks
[assetcfg]: https://developer.android.com/training/app-links/configure-assetlinks
[twamulti]: https://developer.chrome.com/docs/android/trusted-web-activity/multi-origin
[fbemail]: https://firebase.google.com/docs/auth/web/email-link-auth
[fdlfaq]: https://firebase.google.com/support/dynamic-links-faq
[fdlmig]: https://firebase.google.com/docs/auth/android/email-link-migration
[ios]: https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide
[applediscuss]: https://discussions.apple.com/thread/255423529
