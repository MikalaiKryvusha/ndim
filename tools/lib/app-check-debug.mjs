/**
 * ПРОПУСК ПРИБОРОВ ЧЕРЕЗ ЗАЩИТУ ОТ РОБОТОВ (App Check debug token).
 *
 * ЗАЧЕМ. App Check в бою работает по делу: живых людей пропускает, а наши headless-приборы
 * честно опознаёт роботами и отказывает обмену токена reCAPTCHA v3 — 403 на каждой странице
 * (`bugs/169`). Пострадали не люди, а ВОРОТА ДВЕРИ: смоук под сессией краснеет на проверке
 * «консоль чиста», и выкатить в бой становится нечем.
 *
 * КАК ЭТО РАБОТАЕТ. Firebase JS SDK, увидев `self.FIREBASE_APPCHECK_DEBUG_TOKEN`, вместо
 * reCAPTCHA предъявляет эту строку, а сервер узнаёт её по списку заведённых пропусков.
 * 🔑 Ставить ОБЯЗАТЕЛЬНО через `addInitScript`: врезка App Check живёт в модуле `firebase.ts` и
 * срабатывает при первом импорте — то есть раньше любого нашего кода на странице.
 *
 * 🔴 РАЗРЕШЕНИЕ ВЛАДЕЛЬЦА на существование пропуска — интервью №046, В1 = Б: «**Б — Разрешаю**».
 * Значение живёт ТОЛЬКО в `.env` (`NDIM_APP_CHECK_DEBUG_TOKEN`), заводится
 * `tools/app-check-debug-token.mjs`.
 *
 * ⛔ ЧЕГО ЭТОТ МОДУЛЬ НЕ ДЕЛАЕТ. Он не ослепляет проверку «консоль чиста» и вообще ничего не
 * судит: он даёт прибору законно пройти защиту, а не прячет её отказ. Ворота, которые молчат,
 * красят зелёным непроверенное.
 */

/** Имя переменной — одно на проект, чтобы «взял не ту строку» было невыразимо. */
export const DEBUG_TOKEN_VAR = 'NDIM_APP_CHECK_DEBUG_TOKEN';

/**
 * Значение пропуска из окружения либо `null`.
 *
 * Отсутствие — законное состояние: на стенде и на стейдже App Check не включён вовсе
 * (`src/lib/firebase.ts` → `maybeInitAppCheck`), и пропуск там не нужен.
 */
export function debugToken() {
  const value = process.env[DEBUG_TOKEN_VAR]?.trim();
  return value ? value : null;
}

/**
 * Выдать контексту браузера пропуск.
 *
 * ПЕЧАТАЕТ, что делает, и печатает ОТСУТСТВИЕ тоже — молчащая врезка неотличима от
 * работающей, а именно на этой неотличимости стоит весь класс ложных зелёных.
 *
 * @param {import('playwright').BrowserContext} ctx контекст браузера
 * @param {{ quiet?: boolean, required?: boolean }} [opts]
 *   `required` — контур, где App Check ВКЛЮЧЁН (бой): отсутствие пропуска роняет прибор,
 *   потому что прогон без него даст 403 и красную «консоль чиста» по ложной причине.
 */
export async function grantAppCheckDebug(ctx, opts = {}) {
  const token = debugToken();
  if (!token) {
    if (opts.required) {
      throw new Error(
        `нет пропуска App Check: переменная ${DEBUG_TOKEN_VAR} пуста.\n` +
          '  Прогон по боевому контуру без неё даст 403 на обмене токена и красную «консоль чиста»\n' +
          '  по ЛОЖНОЙ причине. Завести пропуск: node tools/app-check-debug-token.mjs create "<имя>"',
      );
    }
    if (!opts.quiet) console.log('   пропуск App Check: не задан (контур без App Check — это норма)');
    return false;
  }
  await ctx.addInitScript((value) => {
    // eslint-disable-next-line no-undef
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = value;
  }, token);
  if (!opts.quiet) console.log('   пропуск App Check: выдан');
  return true;
}
