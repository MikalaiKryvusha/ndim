/**
 * ПРИБОР ЗАМЕРА ЦЕНЫ `listUsers` (не страж) — закрывает PENDING шага 2 `plans/63`:
 * «цена listUsers на боевом числе учёток не замерена — ожидание „сотни учёток = 1 страница“,
 * подтвердить числом».
 *
 * Уборка гостей (`sync-server/index.mjs` → `cleanupStaleGuests`) отбирает кандидатов через
 * `getAuth().listUsers(1000)` — Firestore-чтений это не тратит, но листает Auth постранично,
 * и опора на механизм без замера была бы верой, а не знанием (риск 3 плана: «дорого → фолбэк»).
 *
 * Что меряет: число страниц · число учёток · долю анонимов · сколько анонимов старше
 * GUEST_TTL_DAYS прямо сейчас (кандидаты будущей уборки) · время полного листания.
 *
 * ── ЧЕГО ПРИБОР НЕ ДЕЛАЕТ ──────────────────────────────────────────────────────────────────
 * Только читает. Ни одной записи, ни одного удаления, ни одного обращения к Firestore.
 * ПДн наружу не отдаёт: ни почт, ни uid — только счёт. Ключ — из `.env` через
 * `tools/lib/credentials.mjs` (правило владельца: ключи только в окружении).
 *
 * Запуск:  node tools/measure-listusers-cost.mjs            # бой
 *          node tools/measure-listusers-cost.mjs --stage    # стейдж
 */

import { cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { serviceAccount, PROJECT_OF } from './lib/credentials.mjs';

// Замер БОЕВОЙ цены: эмулятор Auth подменил бы и число учёток, и время листания.
if (process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  console.error('СТОП: задан FIREBASE_AUTH_EMULATOR_HOST — замер против эмулятора бессмыслен.');
  process.exit(1);
}

const contour = process.argv.includes('--stage') ? 'stage' : 'prod';
initializeApp({ credential: cert(serviceAccount(contour)), projectId: PROJECT_OF[contour] });

// Зеркало константы продукта (sync-server/index.mjs). Литерал намеренно: прибор одноразового
// замера, сдвиг TTL в продукте на его вывод влияет только строкой «кандидатов сегодня».
const GUEST_TTL_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
const cutoff = Date.now() - GUEST_TTL_DAYS * DAY_MS;

const started = Date.now();
let pages = 0;
let total = 0;
let anonymous = 0;
let candidates = 0;

let page = await getAuth().listUsers(1000);
for (;;) {
  pages += 1;
  for (const user of page.users) {
    total += 1;
    if (user.providerData.length === 0) {
      anonymous += 1;
      const bornAt = Date.parse(user.metadata.creationTime);
      if (Number.isFinite(bornAt) && bornAt < cutoff) candidates += 1;
    }
  }
  if (!page.pageToken) break;
  page = await getAuth().listUsers(1000, page.pageToken);
}

const elapsed = Date.now() - started;
console.log(`Контур: ${contour} (${PROJECT_OF[contour]})`);
console.log(`Страниц listUsers(1000): ${pages}`);
console.log(`Учёток всего: ${total}`);
console.log(`Из них анонимных: ${anonymous}`);
console.log(`Анонимов старше ${GUEST_TTL_DAYS} дн. (кандидаты уборки на сегодня): ${candidates}`);
console.log(`Полное листание: ${elapsed} мс`);
