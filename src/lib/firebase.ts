/**
 * Подключение к Firebase.
 *
 * ДВА ОБЛИЧЬЯ, ОДИН КОД:
 *   · **стенд** (localhost) — эмуляторы Firestore :8181 и Auth :9099, проект `demo-*`.
 *     Такой идентификатор SDK считает заведомо локальным и физически не может дотянуться
 *     до боевых данных. Здесь живут `npm run stand` и e2e.
 *   · **бой** (публичный домен) — настоящий проект `ndim-space`.
 *
 * Выбор делает ХОСТ, а не флаг сборки: перепутать окружения нельзя даже случайно, а
 * продакшен-артефакт остаётся один и тот же.
 *
 * ⚠️ Веб-конфиг Firebase (apiKey и прочее) — НЕ секрет: он по устройству лежит в бандле у
 * каждого посетителя. Данные стережёт не он, а правила безопасности (`firestore.rules`).
 *
 * `DATABASE_OVERRIDE` — репетиция перед боем: приложение можно направить на копию боевой базы
 * (`?db=sandbox2`), чтобы прогнать живой сценарий на мигрированных данных, не трогая бой.
 */

import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore';

/** Идентификатор дев-проекта. Префикс `demo-` = только эмуляторы, никакого прода. */
export const DEV_PROJECT_ID = 'demo-ndim-dev';

/** Пользователь дев-стенда. Создаётся сидом (`tools/seed-dev.mjs`), почта «подтверждена». */
export const DEV_USER = { email: 'dev@ndim.space', password: 'ndim-dev-stand' } as const;

/** Боевой веб-конфиг проекта `ndim-space` (публичный по устройству Firebase). */
const PROD_CONFIG = {
  apiKey: 'AIzaSyCZsGkY0Lw_OJ35QhRumcD5RzNJUFsAsww',
  authDomain: 'ndim-space.firebaseapp.com',
  projectId: 'ndim-space',
  storageBucket: 'ndim-space.appspot.com',
  messagingSenderId: '1077558742259',
  appId: '1:1077558742259:web:0de996aa7f186d7d13bb86',
} as const;

const FIRESTORE_EMULATOR = { host: '127.0.0.1', port: 8181 } as const;
const AUTH_EMULATOR_URL = 'http://127.0.0.1:9099';

/** Стенд — это localhost. Всё остальное — бой. */
export function isStand(): boolean {
  return typeof location !== 'undefined' && ['localhost', '127.0.0.1'].includes(location.hostname);
}

/**
 * База Firestore. В бою — основная; для репетиции миграции можно указать копию: `?db=sandbox2`.
 * Опечатка в имени базы приведёт к пустому экрану, а не к записи не туда, — это безопасно.
 */
function databaseId(): string {
  if (typeof location === 'undefined') return '(default)';
  const requested = new URLSearchParams(location.search).get('db');
  return requested && /^[a-z0-9-]+$/.test(requested) ? requested : '(default)';
}

let app: FirebaseApp | null = null;
let firestore: Firestore | null = null;
let auth: Auth | null = null;

function ensureApp(): FirebaseApp {
  if (app) return app;
  app =
    getApps()[0] ??
    initializeApp(
      isStand()
        ? {
            projectId: DEV_PROJECT_ID,
            // Эмулятору годится любой непустой ключ; боевым этот конфиг не станет никогда.
            apiKey: 'demo-api-key',
          }
        : PROD_CONFIG,
    );
  return app;
}

/** Firestore: на стенде — эмулятор, в бою — боевая база. Вызывать только в браузере. */
export function db(): Firestore {
  if (firestore) return firestore;

  if (isStand()) {
    firestore = getFirestore(ensureApp());
    connectFirestoreEmulator(firestore, FIRESTORE_EMULATOR.host, FIRESTORE_EMULATOR.port);
    return firestore;
  }

  firestore = getFirestore(ensureApp(), databaseId());
  return firestore;
}

/** Auth: на стенде — эмулятор, в бою — настоящий. Вызывать только в браузере. */
export function devAuth(): Auth {
  if (auth) return auth;

  auth = getAuth(ensureApp());
  if (isStand()) connectAuthEmulator(auth, AUTH_EMULATOR_URL, { disableWarnings: true });
  return auth;
}
