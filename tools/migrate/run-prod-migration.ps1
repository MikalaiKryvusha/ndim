#Requires -Version 5.1
<#
  БОЕВАЯ МИГРАЦИЯ NDim Space: (default) -> ndim-db-prod    (plans/53, фаза 3)

  Зачем скрипт, а не команды агента: удаление боевой базы блокирует классификатор
  безопасности Claude Code. Это законный рубеж, и обходить его нельзя — необратимый шаг
  выполняет ЧЕЛОВЕК. AUTH владельца 2026-08-16: «Да, начинай, мигрируем, даю добро».

  ЧТО ДЕЛАЕТ (и только это):
    1. проверяет предусловия и ОСТАНАВЛИВАЕТСЯ, если хоть одно не сошлось;
    2. снимает защиту от удаления с боевой базы;
    3. УДАЛЯЕТ (default)                                        <- необратимо
    4. создаёт ndim-db-prod в eur3;
    5. проверяет, что бесплатный тир перешёл к ней (критерий П3);
    6. загружает точку возврата и ждёт завершения.

  ЧЕГО НЕ ДЕЛАЕТ: не сверяет отпечатки, не катит правила, не собирает приложение,
  не поднимает сервер синхронизации. Это следующие шаги, их доделывает агент.

  ЕСЛИ ЧТО-ТО ПОЙДЁТ НЕ ТАК: точка возврата
    gs://ndim-space-backup/2026-08-16-migration
  снята при ЗАМОРОЖЕННОЙ записи и сверена с отпечатком — 11 266 документов.
  Восстановление: создать базу и загрузить в неё этот же слепок (репетиция Р3 это доказала).

  Запуск из корня репозитория:
    powershell -ExecutionPolicy Bypass -File tools\migrate\run-prod-migration.ps1
#>

$ErrorActionPreference = 'Stop'

$PROJECT   = 'ndim-space'
$OLD_DB    = '(default)'
$NEW_DB    = 'ndim-db-prod'
$LOCATION  = 'eur3'
$BACKUP    = 'gs://ndim-space-backup/2026-08-16-migration'
$EXPECTED  = 11266

function Say([string]$text, [string]$color = 'Gray') { Write-Host $text -ForegroundColor $color }
function Die([string]$text) { Say "`nСТОП: $text" 'Red'; exit 1 }

Say "`n===== БОЕВАЯ МИГРАЦИЯ $OLD_DB -> $NEW_DB =====" 'Cyan'
Say "начало: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"

# ── 0. ПРЕДУСЛОВИЯ ───────────────────────────────────────────────────────────
Say "`n[0] Проверяю предусловия…" 'Yellow'

# 0.1 Точка возврата обязана существовать. Без неё шаг 3 — не миграция, а потеря данных.
$meta = gcloud storage ls "$BACKUP/" 2>&1 | Where-Object { $_ -match 'overall_export_metadata$' }
if (-not $meta) { Die "точка возврата $BACKUP не найдена. Выгрузка не сделана — миграцию начинать нельзя." }
Say "  ok  точка возврата на месте: $meta"

# 0.2 Запись обязана быть заморожена: выгрузка Firestore не даёт консистентного снимка,
#     если в базу пишут, и сервер синхронизации допишет в базу, которую мы уносим.
$running = docker ps --filter "name=ndim-server-prod" --format "{{.Names}}" 2>&1
if ($running -match 'ndim-server-prod') { Die "сервер синхронизации ndim-server-prod РАБОТАЕТ. Погасите: docker stop ndim-server-prod" }
Say "  ok  запись боя заморожена (ndim-server-prod погашен)"

# 0.3 Эталонный отпечаток обязан быть снят — иначе сверять переезд будет не с чем.
$fingerprint = 'test-results/db-fingerprint/MIGRATION-reference.json'
if (-not (Test-Path $fingerprint)) { Die "нет эталонного отпечатка $fingerprint" }
$docs = (Get-Content $fingerprint -Raw | ConvertFrom-Json).documents
if ($docs -ne $EXPECTED) { Die "эталон содержит $docs документов, ожидалось $EXPECTED" }
Say "  ok  эталонный отпечаток: $docs документов"

# 0.4 Старая база обязана быть на месте (иначе скрипт уже отработал).
$old = gcloud firestore databases describe --database="$OLD_DB" --project=$PROJECT --format="value(name)" 2>&1
if ($old -match 'ERROR') { Die "база $OLD_DB не найдена — возможно, миграция уже выполнена." }
Say "  ok  база $OLD_DB на месте"

# ── ПОДТВЕРЖДЕНИЕ ────────────────────────────────────────────────────────────
Say "`nСЛЕДУЮЩИЙ ШАГ НЕОБРАТИМ: будет УДАЛЕНА боевая база $OLD_DB проекта $PROJECT." 'Red'
Say "Данные 94 человек живут в точке возврата $BACKUP."
$answer = Read-Host "Введите  МИГРИРУЕМ  чтобы продолжить"
if ($answer -ne 'МИГРИРУЕМ') { Say "`nОтменено человеком. Ничего не тронуто." 'Yellow'; exit 2 }

# ── 1. СНЯТЬ ЗАЩИТУ ──────────────────────────────────────────────────────────
Say "`n[1] Снимаю защиту от удаления…" 'Yellow'
gcloud firestore databases update --database="$OLD_DB" --project=$PROJECT --no-delete-protection --quiet | Out-Null
if (-not $?) { Die "не удалось снять защиту от удаления" }
Say "  ok  защита снята"

# ── 2. УДАЛЕНИЕ ──────────────────────────────────────────────────────────────
Say "`n[2] УДАЛЯЮ $OLD_DB … $(Get-Date -Format 'HH:mm:ss')" 'Red'
gcloud firestore databases delete --database="$OLD_DB" --project=$PROJECT --quiet | Out-Null
if (-not $?) { Die "удаление не прошло" }
Say "  ok  база удалена"

# ── 3. СОЗДАНИЕ ИМЕНОВАННОЙ ──────────────────────────────────────────────────
# Порядок «сначала удалить, потом создать» доказан замером: бесплатный тир переходит к базе,
# созданной ПОСЛЕ удаления держателя. Создание до удаления дало бы freeTier: false навсегда.
Say "`n[3] Создаю $NEW_DB в $LOCATION …" 'Yellow'
gcloud firestore databases create --database="$NEW_DB" --location=$LOCATION --type=firestore-native --project=$PROJECT --quiet | Out-Null
if (-not $?) { Die "не удалось создать $NEW_DB" }
Say "  ok  база создана"

# ── 4. КРИТЕРИЙ П3 — БЕСПЛАТНЫЙ ТИР ──────────────────────────────────────────
Say "`n[4] Проверяю бесплатный тир (критерий П3)…" 'Yellow'
$freeTier = gcloud firestore databases describe --database="$NEW_DB" --project=$PROJECT --format="value(freeTier)" 2>&1
Say "  freeTier = $freeTier"
if ("$freeTier" -ne 'True') {
  Say "  ВНИМАНИЕ: бесплатный тир НЕ перешёл. Данные не потеряны, но П3 не выполнен." 'Red'
  Say "  Загрузку всё равно делаем — иначе бой останется пустым." 'Yellow'
}

# ── 5. ЗАГРУЗКА ТОЧКИ ВОЗВРАТА ───────────────────────────────────────────────
Say "`n[5] Загружаю данные из $BACKUP …" 'Yellow'
$op = gcloud firestore import $BACKUP --database=$NEW_DB --project=$PROJECT --async --format="value(name)" 2>&1
if ("$op" -match 'ERROR') { Die "загрузка не запустилась: $op" }
Say "  операция: $op"

$done = $false
for ($i = 0; $i -lt 60; $i++) {
  Start-Sleep -Seconds 10
  $st = gcloud firestore operations describe $op --project=$PROJECT --database=$NEW_DB --format="value(done,metadata.progressDocuments.completedWork)" 2>&1
  Say "  [$i] $st"
  if ("$st" -match '^True') { $done = $true; break }
}
if (-not $done) { Die "загрузка не завершилась за 10 минут — проверьте операцию вручную" }

# ── ИТОГ ─────────────────────────────────────────────────────────────────────
Say "`n===== ГОТОВО: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') =====" 'Cyan'
gcloud firestore databases list --project=$PROJECT --format="table(name,locationId,freeTier)"
Say "`nДальше доделывает агент:" 'Green'
Say "  · отпечаток новой базы и сверка с эталоном (критерии П1/П2)"
Say "  · выкат правил:  firebase deploy --only firestore --project ndim-space"
Say "  · выкат приложения:  npm run deploy   (единственная дверь в бой)"
Say "  · подъём сервера синхронизации с FIRESTORE_DATABASE_ID=ndim-db-prod"
Say "`nСкажите агенту, что скрипт отработал."
