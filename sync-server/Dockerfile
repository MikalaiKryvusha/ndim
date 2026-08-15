# Сервер синхронизации связей NDim Space 2.0.
# Собирать из КОРНЯ репозитория (контейнеру нужно ядро похожести из src/lib/similarity):
#   docker build -f sync-server/Dockerfile -t ndim-sync-server .
#
# Дев-запуск против локальных эмуляторов (Docker Desktop, эмулятор на хосте):
#   docker run --rm -e FIRESTORE_EMULATOR_HOST=host.docker.internal:8181 ndim-sync-server
# Один цикл вместо службы: добавь в конец  node sync-server/index.mjs --once
#
# Прод и стейдж: ключ подаётся ПЕРЕМЕННОЙ ОКРУЖЕНИЯ, файлов с ключами проект не держит
# (правило владельца 2026-08-15: «никогда ключи в коде и других файлах не храним»).
# Значения берутся из `.env` в корне репозитория — там же лежат оба контура:
#   docker run -d --restart unless-stopped --name ndim-server-prod \
#     --env-file .env \
#     -e FIREBASE_PROJECT_ID=ndim-space \
#     -e NDIM_SA_B64="$NDIM_PROD_SA_B64" ndim-sync-server
# Стейдж — тот же образ, другой контейнер, другой ключ и своя база:
#   docker run -d --restart unless-stopped --name ndim-server-stage \
#     -e FIREBASE_PROJECT_ID=ndim-stage \
#     -e FIRESTORE_DATABASE_ID=ndim-db-stage \
#     -e NDIM_SA_B64="$NDIM_STAGE_SA_B64" ndim-sync-server
# ⚠️ Смонтированной папки с ключами больше нет намеренно: монтирование ПАПКИ однажды затащило
# ключ второго контура внутрь боевого контейнера — смешение, запрещённое `plans/53`.
# Входящих портов у контейнера нет — только исходящие соединения (интервью №001, В3).

FROM node:24-alpine

WORKDIR /app

# Node 24 исполняет TypeScript нативно — ядро похожести копируется исходником, без сборки.
COPY sync-server/package.json sync-server/
RUN cd sync-server && npm install --omit=dev && npm cache clean --force

# Чистые модули, которые сервер переиспользует: ядро похожести и агрегаты Пространства.
#
# Копируем ДИРЕКТОРИЯМИ, а не отдельными файлами. Поймано на боевом выкате 2026-07-12: контейнер
# упал в цикле перезапуска (ERR_MODULE_NOT_FOUND: src/lib/model/stats.ts) — index.mjs начал
# импортировать stats.ts, когда сервер научился считать статистику Пространства, а Dockerfile
# всё ещё копировал один similarity.ts. На стенде дефект невидим: там весь репозиторий лежит на
# диске. Директория переживает появление новых импортов внутри неё — файл не переживает.
COPY src/lib/similarity/ src/lib/similarity/
COPY src/lib/model/ src/lib/model/
COPY sync-server/index.mjs sync-server/

# Номер сборки и момент сборки вшиваются в образ (требование владельца 2026-07-27:
# «каждый коммит кода сервера синхронизации повышает номер сборки на +1», и дата сборки
# нужна с часами и минутами).
#
# Считаются СНАРУЖИ и передаются аргументами: внутри образа истории git нет и быть не должно.
# Готовая команда — `npm run sync:image` (см. package.json), чтобы никому не приходилось
# помнить эти флаги:
#   docker build -f sync-server/Dockerfile -t ndim-sync-server \
#     --build-arg SYNC_BUILD=$(git rev-list --count HEAD -- sync-server) \
#     --build-arg SYNC_BUILT_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ) .
#
# Аргументы не заданы → номера и даты нет. Экран тогда покажет одну версию, без скобок:
# отсутствующее честнее выдуманного, а слово `dev` в бою владелец попросил убрать.
ARG SYNC_BUILD
ARG SYNC_BUILT_AT
ENV SYNC_BUILD=$SYNC_BUILD
ENV SYNC_BUILT_AT=$SYNC_BUILT_AT

USER node

CMD ["node", "sync-server/index.mjs"]
