/**
 * Тесты правил безопасности Firebase Storage на эмуляторе (`bugs/04`, шаг 3).
 *
 * ⚠️ ЗДЕСЬ ПРОВЕРЯЮТСЯ ОТКАЗЫ, А НЕ РАЗРЕШЕНИЯ — по тому же канону, что и `rules.test.ts`:
 * сломанное разрешение видно сразу (пропали лица), сломанный отказ не виден никогда — до дня,
 * когда кто-то перезапишет чужую фотографию.
 *
 * ── ЗАЧЕМ ЭТИ ТЕСТЫ ПОЯВИЛИСЬ ──────────────────────────────────────────────────────────────
 * `storage.rules` жил в репозитории как ЧЕРНОВИК для эмулятора стенда (`bugs/14`) и не был
 * покрыт ничем: `bugs/04` прямо перечисляет это третьим пунктом — «покрыть тестами отказов на
 * эмуляторе Storage, так же как `tests/rules/rules.test.ts` покрывает Firestore, и проверить
 * мутациями». В бою при этом до сих пор действуют правила 1.x (админ — списком email). Пока у
 * черновика не было тестов, выпускать его было нельзя: на чтении аватаров держится показ лиц
 * (`src/lib/data/avatar.ts`, `EXP-0043`), и ужесточение сгоряча погасило бы фотографии всем.
 *
 * ── ЧТО ЭТИ ТЕСТЫ НЕ ДЕЛАЮТ (честная граница) ──────────────────────────────────────────────
 * Они НЕ проверяют модель видимости 2.0 (круги, бакеты): сегодня аватар читает любой ВОШЕДШИЙ —
 * это осознанный ПАРИТЕТ с 1.x, и `bugs/04` пункт 2 просит не ужесточать до отдельного решения.
 * Тест на это поведение стоит здесь именно поэтому: когда фото можно будет скрыть, он покраснеет
 * и заставит поменять правила СОЗНАТЕЛЬНО, а не обнаружить расхождение постфактум.
 *
 * Запуск: npm run test:rules  (поднимает эмуляторы Firestore и Storage, Java обязательна)
 * Правила: storage.rules · Контекст: bugs/04, bugs/14
 */

import { after, before, beforeEach, describe, test } from 'node:test';
import { readFileSync } from 'node:fs';

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { getBytes, ref, uploadBytes } from 'firebase/storage';

const PROJECT_ID = 'ndim-storage-rules-test';

/**
 * Адрес эмулятора Storage — из окружения, которое выставляет `firebase emulators:exec`
 * (`FIREBASE_STORAGE_EMULATOR_HOST` вида `127.0.0.1:9199`). Порт в тесте не зашит: на машине
 * владельца дефолтные порты заняты, и он уже менялся (`firebase.json`).
 */
function emulatorAddress(): { host: string; port: number } {
  const fromEnv = process.env.FIREBASE_STORAGE_EMULATOR_HOST;
  if (!fromEnv) {
    throw new Error(
      'FIREBASE_STORAGE_EMULATOR_HOST не задан. Запускай через `npm run test:rules` — он поднимает ' +
        'эмуляторы Firestore и Storage. Прямой `node --test` их не выполнит.',
    );
  }
  const [host, port] = fromEnv.split(':');
  return { host: host!, port: Number(port) };
}

const ALICE = 'alice';
const BOB = 'bob';
const GHOST = 'ghost';

let testEnv: RulesTestEnvironment;

/** Вошедший человек (обычный аккаунт). */
const signedIn = (uid: string) => testEnv.authenticatedContext(uid, { email_verified: true });
/** Не вошёл вовсе — ни аккаунта, ни гостевой сессии. */
const anonymous = () => testEnv.unauthenticatedContext();
/** Гость — Firebase Anonymous Auth (plans/03, этап 2). */
const guest = (uid: string) =>
  testEnv.authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } });

/** Путь фотографии человека — наследие 1.x (`EXP-0043`). */
const avatarPath = (uid: string) => `users/${uid}/avatar/avatar.webp`;

/** Крошечный «файл»: правилам всё равно, что внутри, а тесту важна только реакция. */
const bytes = new Uint8Array([1, 2, 3, 4]);

before(async () => {
  const { host, port } = emulatorAddress();
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    storage: { rules: readFileSync('storage.rules', 'utf8'), host, port },
  });
});

after(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearStorage();
  // Фотография Алисы кладётся В ОБХОД правил — иначе проверки ЧТЕНИЯ проверяли бы запись.
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await uploadBytes(ref(context.storage(), avatarPath(ALICE)), bytes);
  });
});

describe('правила Storage: фотографии людей', () => {
  // ── ОТКАЗЫ. Главная часть файла ──────────────────────────────────────────────────────────

  test('🔒 НЕ ВОШЕДШИЙ не может прочитать чужую фотографию', async () => {
    await assertFails(getBytes(ref(anonymous().storage(), avatarPath(ALICE))));
  });

  test('🔒 НЕ ВОШЕДШИЙ не может записать фотографию — ни свою, ни чужую', async () => {
    await assertFails(uploadBytes(ref(anonymous().storage(), avatarPath(ALICE)), bytes));
    await assertFails(uploadBytes(ref(anonymous().storage(), avatarPath(BOB)), bytes));
  });

  test('🔒 ГЛАВНОЕ: человек не может перезаписать ЧУЖУЮ фотографию', async () => {
    // Тот самый отказ, который не видно, пока он не сломан: Боб вошёл честно, но путь не его.
    await assertFails(uploadBytes(ref(signedIn(BOB).storage(), avatarPath(ALICE)), bytes));
  });

  test('🔒 гость тоже не может перезаписать чужую фотографию', async () => {
    await assertFails(uploadBytes(ref(guest(GHOST).storage(), avatarPath(ALICE)), bytes));
  });

  test('🔒 закрыто ВСЁ, кроме папки фотографий — умолчанием, а не перечислением', async () => {
    /*
     * В правилах 2.0 нет ни `/admin`, ни `/public` из 1.x, и это сознательно: статику раздаёт
     * хостинг, а админ в 2.0 — claim в токене, а не список почт в тексте правил (`bugs/04`
     * пункт 1). Значит любой путь вне `users/{uid}/avatar/**` обязан быть закрыт УМОЛЧАНИЕМ.
     */
    const alice = signedIn(ALICE).storage();
    for (const path of [
      'admin/secret.txt',
      'public/logo.png',
      `users/${ALICE}/private/passport.pdf`,
      `users/${ALICE}/avatar-old.webp`,
      'avatar.webp',
    ]) {
      await assertFails(uploadBytes(ref(alice, path), bytes));
      await assertFails(getBytes(ref(alice, path)));
    }
  });

  // ── РАЗРЕШЕНИЯ. Их немного, но каждое держит работающую функцию продукта ─────────────────

  test('человек записывает СВОЮ фотографию', async () => {
    await assertSucceeds(uploadBytes(ref(signedIn(ALICE).storage(), avatarPath(ALICE)), bytes));
  });

  test('ПАРИТЕТ С 1.x: любой ВОШЕДШИЙ видит фотографию другого человека', async () => {
    /*
     * ⚠️ Этот тест охраняет не приватность, а РАБОТОСПОСОБНОСТЬ: на чтении аватаров держится
     * показ лиц (`data/avatar.ts`, канон «карточка ждёт фото», bugs/57). Ужесточение правила
     * под модель видимости 2.0 (`bugs/04` пункт 2) обязано ронять ЭТОТ тест — тогда решение
     * будет принято сознательно, а не обнаружено по пропавшим лицам в бою (`EXP-0043`).
     */
    await assertSucceeds(getBytes(ref(signedIn(BOB).storage(), avatarPath(ALICE))));
    await assertSucceeds(getBytes(ref(guest(GHOST).storage(), avatarPath(ALICE))));
  });
});
