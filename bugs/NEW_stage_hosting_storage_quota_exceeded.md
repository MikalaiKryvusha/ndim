# Bug NEW — выкат стейджа отказан Firebase: превышена квота хранилища хостинга (HTTP 429)

**Статус:** 🔴 OPEN — ждёт слова владельца (удаление прежних версий хостинга): вопрос — интервью №099
`interviews/interview_099_hosting_keep_last_versions.md` (2026-09-26 00:26, ни разу не показано) · **Тяжесть:** S1 — стейдж заперт, а без
стейджа заперт и выкат в бой (замок стейджа) · **Когда/контекст:** 2026-09-25 23:51, второй выкат живого прохода
правдивого `lastmod` (`plans/NEW_sitemap_truthful_lastmod.md`, шаг 4).

## Симптом

`npm run deploy -- --stage` (коммит `7248b54`) прошёл сборку, штамп карты, проверку целостности и Smoke 19/0, а шаг
выката упал:

```
Error: Request to https://firebasehosting.googleapis.com/v1beta1/projects/-/sites/ndim-stage/versions had HTTP Error: 429,
You have exceeded the Hosting storage quota for your Firebase project, so you cannot deploy to your site right now.
Visit the Firebase console to either manage your Hosting storage or upgrade to the Blaze plan.
Tip: Manage your Hosting storage by setting the number of releases to keep for each channel so that older releases are
automatically deleted. Learn more: https://firebase.google.com/docs/hosting/manage-releases#release-storage-settings
🔴 ШАГ ПРОВАЛЕН: выкат в СТЕЙДЖ. Выкат остановлен.
```

Предыдущий выкат стейджа того же коммита (23:43–23:47) прошёл — квота кончилась на нём. Боевой выкат того же коммита
`7248b54` в 23:52–23:57 прошёл (отдельный проект `ndim-space`) — у боя место пока есть, объём не замерен.

## Корневая причина (по тексту отказа, без замера объёма)

Firebase Hosting хранит ВСЕ прежние версии сайта; на бесплатном тарифе у хранилища хостинга есть потолок. Каждая
версия несёт ≈10 500 страниц каталога. 2026-09-25 стейдж выкатывался не меньше девяти раз (журналы двери в сессии
Менеджера), и прежние версии копятся без удаления. Число хранимых версий в проекте не задано.

## Лечение (решает владелец — удаляются прежние версии хостинга)

1. Задать число хранимых версий канала `live` сайта `ndim-stage` (консоль Firebase → Hosting → «Release storage
   settings», или API `sites.channels.patch` с `retainedReleaseCount`) — например, 5; Firebase сам удалит старые.
2. То же для боевого сайта `ndim-space`: он в ОТДЕЛЬНОМ проекте, и его квота не замерена — тот же отказ в бою остановит
   выкат посреди починки.
3. Замерить объём хранилища обоих сайтов до и после (консоль → Hosting → использование).

Цена: откат на удалённые версии станет невозможен (останутся последние N).

## Решения, принятые без владельца

`[AI]` Прежние версии не удалялись и число хранимых не менялось: это удаление данных в проекте владельца.

## Ссылки

`plans/NEW_sitemap_truthful_lastmod.md` (шаг 4: выкат 1 прошёл 23:43–23:47, выкат 2 упал на квоте) · журнал двери —
скретчпад сессии Менеджера `deploy-stage-lm2.log`.
