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

COPY src/lib/similarity/similarity.ts src/lib/similarity/
COPY calculator/index.mjs calculator/

USER node

CMD ["node", "calculator/index.mjs"]
