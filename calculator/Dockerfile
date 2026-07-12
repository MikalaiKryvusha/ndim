# Вычислитель связей NDim Space 2.0.
# Собирать из КОРНЯ репозитория (контейнеру нужно ядро похожести из src/lib/similarity):
#   docker build -f calculator/Dockerfile -t ndim-calculator .
#
# Дев-запуск против локальных эмуляторов (Docker Desktop, эмулятор на хосте):
#   docker run --rm -e FIRESTORE_EMULATOR_HOST=host.docker.internal:8181 ndim-calculator
# Один цикл вместо службы: добавь в конец  node calculator/index.mjs --once
#
# Прод (домашний ПК владельца, фаза 4): подать ключ сервисного аккаунта
#   docker run -d --restart unless-stopped \
#     -e FIREBASE_PROJECT_ID=ndim-space \
#     -e GOOGLE_APPLICATION_CREDENTIALS=/secrets/sa.json \
#     -v /путь/к/ключу:/secrets:ro ndim-calculator
# Входящих портов у контейнера нет — только исходящие соединения (интервью №001, В3).

FROM node:24-alpine

WORKDIR /app

# Node 24 исполняет TypeScript нативно — ядро похожести копируется исходником, без сборки.
COPY calculator/package.json calculator/
RUN cd calculator && npm install --omit=dev && npm cache clean --force

# Чистые модули, которые сервер переиспользует: ядро похожести и агрегаты Пространства.
#
# Копируем ДИРЕКТОРИЯМИ, а не отдельными файлами. Поймано на боевом выкате 2026-07-12: контейнер
# упал в цикле перезапуска (ERR_MODULE_NOT_FOUND: src/lib/model/stats.ts) — index.mjs начал
# импортировать stats.ts, когда сервер научился считать статистику Пространства, а Dockerfile
# всё ещё копировал один similarity.ts. На стенде дефект невидим: там весь репозиторий лежит на
# диске. Директория переживает появление новых импортов внутри неё — файл не переживает.
COPY src/lib/similarity/ src/lib/similarity/
COPY src/lib/model/ src/lib/model/
COPY calculator/index.mjs calculator/

USER node

CMD ["node", "calculator/index.mjs"]
