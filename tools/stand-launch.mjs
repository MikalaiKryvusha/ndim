/**
 * ЗАПУСК СТЕНДА НА ПОРТАХ СВОЕГО СЛОТА — дверь тестового парка (`plans/69` шаги 3 и 4).
 *
 * Что делает, по порядку:
 *   1. выводит СЛОТ из рабочего каталога (`lib/stand-slot.mjs`) — роль ничего не настраивает;
 *   2. считает ЖИВЫЕ стенды по слотовым портам Firestore и спрашивает потолок владельца
 *      («три стенда разом») — четвёртому отказ С ИМЕНАМИ занятых, а не молчаливая давка;
 *   3. генерирует `firebase.slot<N>.json` — копию `firebase.json`, где подменена ТОЛЬКО секция
 *      `emulators`; слот 0 работает штатным `firebase.json` и не генерирует ничего;
 *   4. поднимает `firebase emulators:exec -c <конфиг>` с той же начинкой, что и прежний
 *      `npm run stand`: сид, затем `tools/stand.mjs` (сервер синхронизации + `vite dev`).
 *
 * 🔑 ПОЧЕМУ ПОВЕДЕНИЕ СЛОТА 0 ОБЯЗАНО ОСТАТЬСЯ БАЙТ-В-БАЙТ ПРЕЖНИМ. На слоте 0 стоит главная
 * копия, а в ней — дверь выката: её ворота Smoke поднимают стенд и судят по нему боевую сборку.
 * Парк добавляет адреса; он не имеет права переселить или переименовать то, на чём стоит выкат.
 * Поэтому слот 0 — тот же конфиг, те же порты, та же команда.
 *
 * 🔴 АДРЕС ЭМУЛЯТОРОВ ДОЕЗЖАЕТ ДО ДЕТЕЙ САМ. `firebase emulators:exec` экспортирует потомкам
 * `FIRESTORE_EMULATOR_HOST` / `FIREBASE_AUTH_EMULATOR_HOST` / `FIREBASE_STORAGE_EMULATOR_HOST`
 * с НАСТОЯЩИМИ портами поднятых эмуляторов. Значит приборам не нужно знать слот — им нужно
 * читать переменную вместо литерала (шаг 5). А вот ПРИЛОЖЕНИЕ в браузере переменных процесса не
 * видит, поэтому порты слота уезжают в него через `VITE_STAND_*` (шаг 6) — их и подставляем ниже.
 *
 * Команды:
 *   node tools/stand-launch.mjs                 # слот из каталога, поднять стенд
 *   node tools/stand-launch.mjs --slot 1        # явный слот (проверки парка, чужой адрес не занять)
 *   node tools/stand-launch.mjs --config-only   # только сгенерировать конфиг слота и выйти
 *   node tools/stand-launch.mjs --dry-run       # напечатать слот, порты и команду, ничего не поднимая
 *
 * ⚠️ `--slot` существует не для удобства, а ради проверяемости: доказать, что слоты 1 и 2 живут
 * одновременно, можно только из ОДНОГО рабочего места — чужие worktree трогать запрещено
 * манифестом. В обычной работе флаг не нужен и не используется.
 */
import { spawn } from 'node:child_process';
import { connect } from 'node:net';
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import {
  MAX_CONCURRENT_STANDS,
  SLOTS,
  capacityVerdict,
  emulatorsForSlot,
  portsFor,
  slotConfigName,
  slotOf,
} from './lib/stand-slot.mjs';

/** Проект эмуляторов стенда. Тот же, что был у `npm run stand`, — данные слотов разводит ПОРТ. */
const STAND_PROJECT = 'demo-ndim-dev';

/** Начинка стенда внутри эмуляторов — дословно прежняя строка `npm run stand`. */
const STAND_INNER = 'node tools/seed-dev.mjs && node tools/stand.mjs';

/** Корень рабочего места. Через git — чтобы прибор работал и из подкаталога. */
function repoRoot() {
  try {
    return execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
  } catch {
    return process.cwd();
  }
}

const argOf = (name) => {
  const i = process.argv.indexOf(name);
  return i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : undefined;
};

/**
 * Слушает ли кто-нибудь порт. Признак «стенд жив» берётся у ПОРТА, а не у маски командной
 * строки: тот же довод, по которому гашение привязано к порту (`lib/stand-cleanup.mjs`).
 */
function listens(port, ms = 400) {
  return new Promise((resolve) => {
    const socket = connect({ host: '127.0.0.1', port });
    const done = (v) => { socket.destroy(); resolve(v); };
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
    socket.setTimeout(ms, () => done(false));
  });
}

/** Слоты, чей эмулятор Firestore прямо сейчас отвечает. */
async function liveSlots() {
  const live = [];
  for (const s of SLOTS) if (await listens(portsFor(s).firestore)) live.push(s);
  return live;
}

/**
 * Сгенерировать конфиг слота. Возвращает путь к конфигу, которым надо поднимать эмуляторы.
 *
 * Детерминизм обязателен (канон «Стиль кода»: сравниваемый вывод не имеет права плыть):
 * повторный прогон на неизменённом `firebase.json` даёт побайтово тот же файл. Достигается тем,
 * что порядок ключей наследуется от исходника, а форматирование фиксировано двумя пробелами.
 * ⚠️ Все прочие секции (`hosting`, `firestore`, `storage`) копируются ДОСЛОВНО: расхождение
 * боевых секций между конфигами — это разные правила и разные переадресации у соседних ролей.
 */
function ensureSlotConfig(slot, root) {
  const name = slotConfigName(slot);
  const target = join(root, name);
  if (slot === 0) return target; // штатный firebase.json — ничего не генерируем
  const source = JSON.parse(readFileSync(join(root, 'firebase.json'), 'utf8'));
  source.emulators = emulatorsForSlot(source.emulators, slot);
  writeFileSync(target, JSON.stringify(source, null, 2) + '\n', 'utf8');
  return target;
}

/* ── Ход ────────────────────────────────────────────────────────────────────────────────── */

const root = repoRoot();
const explicit = argOf('--slot');
const derived = slotOf(basename(root));
if (derived.note) console.log(`⚠️  ${derived.note}`);

const slot = explicit === undefined ? derived.slot : Number(explicit);
if (!SLOTS.includes(slot)) {
  console.error(`⛔ слота ${slot} нет: разведены ${SLOTS.join(', ')}`);
  process.exit(1);
}
const ports = portsFor(slot);
// Роль называем только когда слот ВЫВЕДЕН: с явным флагом адрес и роль расходятся, и подпись
// «слот 1 · роль dev-2» читалась бы как утверждение о принадлежности слота.
const who = explicit !== undefined ? ' (задан флагом)' : derived.role ? ` · роль ${derived.role}` : '';
console.log(
  `🅿 слот ${slot}${who} · firestore ${ports.firestore} · auth ${ports.auth} · ` +
    `storage ${ports.storage} · vite ${ports.dev}`,
);

// Сухой прогон НИЧЕГО не пишет на диск — иначе он не сухой, а это ровно тот класс тихой
// неожиданности, из-за которого приборы перестают быть безопасными для опроса.
const configPath = join(root, slotConfigName(slot));
const command =
  `firebase emulators:exec -c "${configPath}" --only firestore,auth,storage --project ${STAND_PROJECT} "${STAND_INNER}"`;
if (process.argv.includes('--dry-run')) {
  console.log(command);
  process.exit(0);
}

const config = ensureSlotConfig(slot, root);
if (process.argv.includes('--config-only')) {
  console.log(`✅ конфиг слота готов: ${config}`);
  process.exit(0);
}

// Потолок владельца — механикой. Спрашиваем ДО генерации команды: отказ обязан быть дешёвым.
const live = await liveSlots();
const verdict = capacityVerdict(live, slot);
if (!verdict.ok) {
  console.error(`⛔ ${verdict.reason}`);
  process.exit(1);
}
if (live.length) console.log(`ℹ  уже подняты слоты: ${live.join(', ')} (потолок ${MAX_CONCURRENT_STANDS})`);

/**
 * Порты слота уезжают в приложение переменными сборки Vite (`VITE_STAND_*`, шаг 6) — их читает
 * `src/lib/firebase.ts` и только внутри ветки стенда. Порт `vite dev` едет отдельной переменной:
 * его подставляет `tools/stand.mjs`, потому что именно он поднимает dev-сервер.
 */
const env = {
  ...process.env,
  STAND_SLOT: String(slot),
  STAND_DEV_PORT: String(ports.dev),
  VITE_STAND_FIRESTORE_PORT: String(ports.firestore),
  VITE_STAND_AUTH_PORT: String(ports.auth),
  VITE_STAND_STORAGE_PORT: String(ports.storage),
};

const child = spawn(command, { shell: true, stdio: 'inherit', cwd: root, env });
child.on('exit', (code) => process.exit(code ?? 0));
