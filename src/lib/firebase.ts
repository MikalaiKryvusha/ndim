/**
 * Подключение к Firebase для дев-стенда NDim Space 2.0.
 *
 * Пока продукт не опубликован, приложение работает ТОЛЬКО против локальных эмуляторов
 * (решение интервью №003, В2: модель 2.0 + тестовые данные на эмуляторе).
 * Проект — `demo-*`: такие идентификаторы эмулятор считает заведомо локальными,
 * и SDK физически не может дотянуться до боевых данных.
 *
 * Боевой конфиг появится в фазе публикации отдельным модулем; компоненты экранов
 * от этого файла не зависят — они говорят со слоем данных (`src/lib/data/`).
 *
 * Стенд поднимается одной командой: `npm run stand`
 * (эмуляторы Firestore:8181 + Auth:9099 → сид → vite dev).
 */

import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore';

/** Идентификатор дев-проекта. Префикс `demo-` = только эмуляторы, никакого прода. */
export const DEV_PROJECT_ID = 'demo-ndim-dev';

/** Пользователь дев-стенда. Создаётся сидом (`tools/seed-dev.mjs`), почта «подтверждена». */
export const DEV_USER = { email: 'dev@ndim.space', password: 'ndim-dev-stand' } as const;

const FIRESTORE_EMULATOR = { host: '127.0.0.1', port: 8181 } as const;
const AUTH_EMULATOR_URL = 'http://127.0.0.1:9099';

let app: FirebaseApp | null = null;
let firestore: Firestore | null = null;
let auth: Auth | null = null;

function ensureApp(): FirebaseApp {
  if (app) return app;
  app =
    getApps()[0] ??
    initializeApp({
      projectId: DEV_PROJECT_ID,
      // Эмулятору годится любой непустой ключ; боевым этот конфиг не станет никогда.
      apiKey: 'demo-api-key',
    });
  return app;
}

/** Firestore, привязанный к эмулятору. Вызывать только в браузере (после onMount). */
export function db(): Firestore {
  if (firestore) return firestore;
  firestore = getFirestore(ensureApp());
  connectFirestoreEmulator(firestore, FIRESTORE_EMULATOR.host, FIRESTORE_EMULATOR.port);
  return firestore;
}

/** Auth, привязанный к эмулятору. Вызывать только в браузере (после onMount). */
export function devAuth(): Auth {
  if (auth) return auth;
  auth = getAuth(ensureApp());
  connectAuthEmulator(auth, AUTH_EMULATOR_URL, { disableWarnings: true });
  return auth;
}
