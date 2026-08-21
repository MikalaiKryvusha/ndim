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
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import { connectAuthEmulator, getAuth, onAuthStateChanged, type Auth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore';
import { connectStorageEmulator, getStorage, type FirebaseStorage } from 'firebase/storage';
import { rememberSession } from './data/session.ts';

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

/**
 * Веб-конфиг СТЕЙДЖА — проект `ndim-stage` (`plans/53`).
 *
 * Отдельный проект, а не вторая база в бою: Auth в Firebase живёт на уровне ПРОЕКТА, и общий
 * контур свёл бы тестовые учётки с живыми людьми и их ПДн (решение владельца 2026-08-15).
 */
const STAGE_CONFIG = {
  apiKey: 'AIzaSyDde20i1Bee1qvw7_srWWlrn2kI1Oom6Uw',
  authDomain: 'ndim-stage.firebaseapp.com',
  projectId: 'ndim-stage',
  storageBucket: 'ndim-stage.firebasestorage.app',
  messagingSenderId: '995928822280',
  appId: '1:995928822280:web:2950b2d9e0bf930795b7bd',
} as const;

/**
 * Хосты стейдж-контура. Список закрытый и короткий по замыслу: контур узнаётся по ТОЧНОМУ имени
 * хоста, а не по вхождению подстроки «stage», — иначе домен вроде `ndimspace.app/stage` увёл бы
 * живых людей в песочницу.
 *
 * Владелец 2026-08-15: стейдж «располагается только на дефолтном техническом firebase адресе» и к
 * боевому домену не привязывается никогда — поэтому список не растёт.
 */
const STAGE_HOSTS = ['ndim-stage.web.app', 'ndim-stage.firebaseapp.com'] as const;

/**
 * Имя базы боевого контура.
 *
 * ✅ Переезд фазы 3 `plans/53` выполнен 2026-08-16: бой живёт в ИМЕНОВАННОЙ базе, и «какая это
 * база» перестало быть вопросом. Прежнее имя `(default)` больше не существует — поход по нему
 * даёт пустые экраны, а не молчаливую запись не туда.
 *
 * 🔑 У этой строки есть ЗЕРКАЛО: приборы берут то же имя из `tools/lib/contours.mjs`, и тот
 * модуль читает ЭТОТ файл и падает при расхождении. Правишь здесь — правь и там же.
 */
const PROD_DATABASE = 'ndim-db-prod';

/** Имя базы стейджа. Именованная с рождения — переезжать ей не придётся. */
const STAGE_DATABASE = 'ndim-db-stage';

/** Стейдж ли это. Решает ХОСТ — тот же принцип, что у стенда: артефакт сборки один на все контуры. */
export function isStage(): boolean {
  return (
    typeof location !== 'undefined' && (STAGE_HOSTS as readonly string[]).includes(location.hostname)
  );
}

const FIRESTORE_EMULATOR = { host: '127.0.0.1', port: 8181 } as const;
const AUTH_EMULATOR_URL = 'http://127.0.0.1:9099';

/** Стенд — это localhost. Всё остальное — бой. */
export function isStand(): boolean {
  return typeof location !== 'undefined' && ['localhost', '127.0.0.1'].includes(location.hostname);
}

/**
 * База Firestore ТЕКУЩЕГО контура. Стейдж — своя, бой — своя; выбор делает тот же хост, что и
 * выбор проекта, поэтому «приложение стейджа в боевой базе» невозможно по построению.
 *
 * `?db=` остаётся дверью для отладки: им можно направить приложение в другую базу ТОГО ЖЕ проекта
 * (так в июле репетировали миграцию на копии). Опечатка в имени даёт пустой экран, а не запись не
 * туда, — это безопасно.
 */
function databaseId(): string {
  const contour = isStage() ? STAGE_DATABASE : PROD_DATABASE;
  if (typeof location === 'undefined') return contour;
  const requested = new URLSearchParams(location.search).get('db');
  return requested && /^[a-z0-9-]+$/.test(requested) ? requested : contour;
}

/**
 * Сайт-ключ reCAPTCHA v3 для App Check (`plans/22` фаза 3; обязательство владельца, интервью
 * №009: «App Check — включу сам… без него широкая гостевая дверь становится приглашением
 * накрутить воронку»).
 *
 * ПУСТАЯ строка = App Check выключен: код стоит на месте и ждёт ключа. Создать ключ может
 * только владелец — у админки reCAPTCHA нет API (`homeworks/13`). Сюда вписывается САЙТ-ключ,
 * публичная половина: как и весь веб-конфиг выше, он по устройству лежит в бандле у каждого
 * посетителя. Секретная половина машины не касается вовсе — владелец вносит её в консоль
 * Firebase при регистрации провайдера.
 *
 * 🔴 Принуждение этим НЕ включается. Ключ + выключенный переключатель принуждения в консоли =
 * РЕЖИМ НАБЛЮДЕНИЯ: токены прикладываются к запросам, консоль копит доли «с токеном / без»,
 * ни один запрос не блокируется. Принуждение — отдельный шаг фазы 3 после стабилизации метрик
 * (решение отдано агенту №009 — оно обратимо переключателем), и у него свой хвост: debug-токены
 * боевым смоукам двери, иначе они умрут первыми.
 */
// Ключ создан владельцем 2026-08-21 (homeworks/13, прислан в чат тем же часом).
const APP_CHECK_SITE_KEY = '6LftspEtAAAAAF7FP29ls_2OaGOglMT3F9wjrjlj';

let app: FirebaseApp | null = null;
let firestore: Firestore | null = null;
let auth: Auth | null = null;
let bucket: FirebaseStorage | null = null;

/**
 * App Check — только БОЕВОЙ контур: эмуляторы стенда токены не проверяют вовсе, а стейдж
 * закрыт от людей и роботов — защищать его не от кого, и плодить вторую регистрацию незачем
 * (Оккам). Врезка стоит сразу за рождением app, ДО первых запросов данных: в наблюдении
 * порядок безразличен, под будущим принуждением станет обязательным — пусть будет верным с
 * первого дня. Воронка лендинга (`data/funnel.ts`) импортирует этот же модуль — её запросы
 * получают токены той же врезкой («покрыть воронку тоже», `plans/22` фаза 3).
 */
function maybeInitAppCheck(current: FirebaseApp): void {
  if (!APP_CHECK_SITE_KEY) return;
  if (typeof document === 'undefined' || isStand() || isStage()) return;
  initializeAppCheck(current, {
    provider: new ReCaptchaV3Provider(APP_CHECK_SITE_KEY),
    isTokenAutoRefreshEnabled: true,
  });
}

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
            // Эмулятору Storage нужен явный бакет: без него getStorage() падает раньше,
            // чем connectStorageEmulator успевает его перенаправить (bugs/14).
            storageBucket: `${DEV_PROJECT_ID}.appspot.com`,
          }
        : isStage()
          ? STAGE_CONFIG
          : PROD_CONFIG,
    );
  maybeInitAppCheck(app);
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

/**
 * Storage: здесь живут ФОТОГРАФИИ людей — `users/{uid}/avatar/avatar.webp` (наследие 1.x).
 *
 * В Firestore лежит только ФЛАГ `avatar: boolean`, самой картинки там нет, — поэтому за фото
 * надо сходить отдельно. На стенде — эмулятор Storage (порт 9199): фотографии на стенде
 * НАСТОЯЩИЕ, их кладёт сид (bugs/14). Раньше стенд жил «без фотографий» — и поведение фото
 * было непроверяемо в принципе.
 */
export function storage(): FirebaseStorage {
  if (bucket) return bucket;
  bucket = getStorage(ensureApp());
  if (isStand()) connectStorageEmulator(bucket, '127.0.0.1', 9199);
  return bucket;
}

/** Auth: на стенде — эмулятор, в бою — настоящий. Вызывать только в браузере. */
export function devAuth(): Auth {
  if (auth) return auth;

  auth = getAuth(ensureApp());
  if (isStand()) connectAuthEmulator(auth, AUTH_EMULATOR_URL, { disableWarnings: true });

  /*
   * Признак сессии для загрузочного щита (bugs/40) держим ЗДЕСЬ — в единственной точке,
   * где рождается Auth, и подпиской БЕЗ отписки.
   *
   * Почему не у вызывающих: сессия появляется и исчезает многими путями — вход Google,
   * ссылка из письма, анонимный гость, апгрейд гостя в аккаунт, выход, а на стенде ещё и
   * `signInDev()` в обход общей дороги. Первая версия расставляла отметку по местам и
   * пропустила ровно эту ветку: на стенде щит не поднимался вовсе, и замер показал 0
   * кадров щита при исправном коде. Слушатель у самого источника правды не может
   * разойтись с ней по построению — любой новый способ входа учтётся сам.
   */
  onAuthStateChanged(auth, (user) => rememberSession(user !== null));
  return auth;
}
