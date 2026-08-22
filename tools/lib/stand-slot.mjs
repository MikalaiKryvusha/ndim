/**
 * СЛОТ РАБОЧЕГО МЕСТА — один адрес стенда на роль, выведенный из каталога.
 *
 * Зачем модуль (`plans/68` фаза 1 → `plans/69` шаг 2; разведка — `researches/45` §4).
 * До него стенд был один на машину: порты 8181·9099·9199·4173·5173 вшиты литералами, и за них
 * дрались все роли команды разом. Замок доски разводил очередь, но очередь — это простой: за
 * один вечер к единственному стенду выстроились трое, а замер `plans/69` шага 1 показал, что
 * машина держит три стенда ОДНОВРЕМЕННО с большим запасом (минимум свободной фиксации за заход
 * 5 198 МБ при пороге остановки 500).
 *
 * 🔑 ПОЧЕМУ СЛОТ ВЫВОДИТСЯ, А НЕ НАСТРАИВАЕТСЯ. Файл настройки можно забыть, скопировать у
 * соседа или потерять при сбросе ветки — и роль молча уедет на чужие порты. Имя каталога
 * подделать нельзя: роль стоит там, где стоит (`ndim-team\ndim_<роль>`), а главная копия — это
 * Менеджер. Поэтому адрес стенда — ФУНКЦИЯ рабочего места, и второго источника у неё нет.
 *
 * 🔴 ДВА РАЗНЫХ ЧИСЛА, КОТОРЫЕ НЕЛЬЗЯ ПУТАТЬ (и это стоило бы дорого, будь они одним):
 *   · **СЛОТ (здесь)** — адрес роли, 0…5, по одному на КАЖДУЮ роль. Он существует, чтобы порты
 *     двух ролей не пересеклись НИКОГДА; он стабилен и человеком не выбирается.
 *   · **Строка замка на доске** (`tools/team-status.mjs`) — одно из ТРЁХ мест за столом:
 *     сколько стендов машина тянет разом (слово владельца 2026-08-22: «*если их три уже у нас,
 *     то на каждый по строчке заведите*»). Их три, а ролей шесть — значит строка замка это
 *     лицензия, а не адрес.
 * Первое — про «чтобы не столкнулись», второе — про «сколько влезает». Ограничение числа живёт
 * не в документе, а в `capacityVerdict()` ниже: обёртка запуска считает живые стенды и отказывает
 * четвёртому.
 *
 * Базы портов НЕ объявляются здесь: они лежат в `stand-cleanup.mjs` единственным списком в
 * проекте (`AGENT_GUIDE.md` → «Реестр пар»: вторая копия расходится с первой в день рождения).
 *
 * Доказательства — `checks()` внизу: их печатает `node tools/lib/stand-slot.mjs --selftest`
 * и они же прогоняются юнитами `src/lib/ops/stand-slot.test.ts` в составе `npm test`.
 */
import { STAND_PORTS } from './stand-cleanup.mjs';

/**
 * Роли команды В ПОРЯДКЕ СЛОТОВ: индекс в этом массиве И ЕСТЬ слот роли.
 *
 * Порядок — из манифеста (`NDIM_WORKTREE_DEV_TEAM_MANIFEST.md` → «Карта команды»), и он же
 * зафиксирован разведкой: manager 0 · designer 1 · qa 2 · dev-1 3 · dev-2 4 · dev-3 5.
 * ⚠️ Порядок — часть контракта, а не оформление: переставить строку значит переселить роль на
 * чужие порты и обнулить её конфиг слота. Новая роль дописывается В КОНЕЦ.
 */
export const ROLES = Object.freeze(['manager', 'designer', 'qa', 'dev-1', 'dev-2', 'dev-3']);

/** Слоты, которые вообще существуют: по одному на роль. */
export const SLOTS = Object.freeze(ROLES.map((_, i) => i));

/**
 * Шаг сетки портов. Обходит занятые машиной 8080 (`llama-swap`), 9100 (`lghub_updater`) и
 * 9247 (`nordvpn-service`) — все три сняты ПРОБОЙ, а не памятью (`researches/45` §4).
 */
export const SLOT_STEP = 10;

/** Порты, которые машина держит занятыми под чужое. Сетка обязана их обходить. */
export const MACHINE_BUSY_PORTS = Object.freeze([8080, 9100, 9247]);

/**
 * Сколько стендов машина тянет ОДНОВРЕМЕННО. Число снято замером `plans/69` шага 1 и совпало
 * со словом владельца («три»). Это потолок ресурса, а не потолок адресов.
 */
export const MAX_CONCURRENT_STANDS = 3;

/**
 * Роль по имени каталога рабочего места. Канон — `ndim_<роль>` (приписка владельца 2026-08-21:
 * отличает окна команды NDim в VS Code среди окон чужих проектов); имена без приписки
 * принимаются как наследие переезда (`team-workplaces.mjs relocate`).
 *
 * 🔑 Разбор имени каталога живёт ЗДЕСЬ в единственном экземпляре: доска (`team-status.mjs`)
 * берёт эту же функцию. Вторая копия разъехалась бы с первой — и роль получила бы одну строку
 * на доске и другой адрес стенда.
 *
 * @param {string} dir имя каталога (не путь)
 * @returns {string|null} идентификатор роли или `null`, если каталог не наш
 */
export function roleFromDirName(dir) {
  if (ROLES.includes(dir)) return dir; // старое имя каталога, до приписки
  const m = String(dir).match(/^ndim_(.+)$/);
  if (!m) return null;
  const role = m[1].replace(/^dev(\d)$/, 'dev-$1'); // ndim_dev1 → dev-1
  return ROLES.includes(role) ? role : null;
}

/**
 * Слот роли. Роль неизвестна → `null` (решение о запасном слоте принимает `slotOf`, а не эта
 * функция: чистая функция не должна тихо подставлять умолчание).
 *
 * @param {string|null} role
 * @returns {number|null}
 */
export function slotOfRole(role) {
  // Пустую роль отвергаем ДО поиска: `indexOf(null)` дал бы -1 и тот же ответ, но через путь,
  // который проверка типов законно считает ошибкой вызова.
  if (role === null || role === undefined) return null;
  const i = ROLES.indexOf(role);
  return i === -1 ? null : i;
}

/**
 * Порты слота: база + слот × шаг. Возвращает ОБЪЕКТ — обёртке запуска нужны порты по именам, а
 * не по позиции в массиве (позиционный список уже однажды родил ошибку сопоставления на доске).
 *
 * @param {number} slot
 * @returns {{preview:number, dev:number, firestore:number, auth:number, storage:number}}
 */
export function portsFor(slot) {
  if (!SLOTS.includes(slot)) throw new Error(`слота ${slot} нет: разведены ${SLOTS.join(', ')}`);
  const shift = slot * SLOT_STEP;
  // Имена перечислены явно, а не выведены обходом: так у результата есть ТИП, и опечатка в имени
  // порта краснеет проверкой типов, а не всплывает «undefined» в адресе эмулятора. Полнота набора
  // при этом стережётся юнитом `portsFor(0) === STAND_PORTS` — забытый новый порт там краснеет.
  return Object.freeze({
    preview: STAND_PORTS.preview + shift,
    dev: STAND_PORTS.dev + shift,
    firestore: STAND_PORTS.firestore + shift,
    auth: STAND_PORTS.auth + shift,
    storage: STAND_PORTS.storage + shift,
  });
}

/**
 * Слот по рабочему каталогу — главный вход модуля.
 *
 * Неизвестный каталог (не рабочее место роли: чужой проект, копия, временный клон) получает
 * слот 0 и ПРИЧИНУ строкой. Так одиночная сессия в главной копии и любой посторонний запуск
 * работают ровно как раньше, а не падают: парк добавляет адреса, а не отменяет прежний стенд.
 *
 * @param {string} dirName имя каталога рабочего места
 * @returns {{slot:number, role:string|null, note:string|null}}
 */
export function slotOf(dirName) {
  const role = roleFromDirName(dirName);
  const slot = slotOfRole(role);
  if (slot === null) {
    return {
      slot: 0,
      role: null,
      note: `каталог «${dirName}» не рабочее место роли команды — беру слот 0 (штатный стенд), как было до парка`,
    };
  }
  return { slot, role, note: null };
}

/**
 * Имя конфига эмуляторов для слота. Слот 0 работает ШТАТНЫМ `firebase.json` — не потому, что
 * так короче, а потому что это делает поведение главной копии байт-в-байт прежним: файл,
 * который читают дверь выката и все прежние приборы, остаётся тем же самым.
 *
 * @param {number} slot
 * @returns {string}
 */
export function slotConfigName(slot) {
  if (!SLOTS.includes(slot)) throw new Error(`слота ${slot} нет: разведены ${SLOTS.join(', ')}`);
  return slot === 0 ? 'firebase.json' : `firebase.slot${slot}.json`;
}

/**
 * Секция `emulators` для конфига слота: та же форма, что в `firebase.json`, с портами слота.
 * Хост не трогаем — он одинаков у всех слотов и меняться не должен.
 *
 * @param {Record<string, any>} emulators секция `emulators` исходного `firebase.json`
 * @param {number} slot
 * @returns {Record<string, any>} новая секция (исходная не мутируется)
 */
export function emulatorsForSlot(emulators, slot) {
  const ports = portsFor(slot);
  const out = /** @type {Record<string, any>} */ (structuredClone(emulators));
  for (const name of /** @type {const} */ (['firestore', 'auth', 'storage'])) {
    if (out?.[name] && typeof out[name].port === 'number') out[name].port = ports[name];
  }
  return out;
}

/**
 * Вердикт о вместимости: можно ли поднимать ещё один стенд.
 *
 * 🔴 ПОЧЕМУ ЭТО ФУНКЦИЯ, А НЕ СТРОКА В ДОКУМЕНТЕ. Правило «не больше трёх» в документе
 * исполняется, только пока его помнят; ровно этим болел прежний одиночный стенд — «не гони e2e
 * при поднятом стенде» стояло записью и нарушалось. Здесь потолок владельца — механика:
 * обёртка запуска считает ЖИВЫЕ стенды и отказывает четвёртому с именами занятых слотов.
 *
 * Чистая: живость портов измеряет вызывающий и передаёт список сюда. Так вердикт доказуем без
 * сети и без поднятых эмуляторов.
 *
 * @param {number[]} liveSlots слоты, чей эмулятор Firestore прямо сейчас слушает
 * @param {number} wanted слот, который хотят поднять
 * @returns {{ok:true}|{ok:false, reason:string}}
 */
export function capacityVerdict(liveSlots, wanted) {
  const live = [...new Set(liveSlots)].sort((a, b) => a - b);
  if (live.includes(wanted)) {
    return {
      ok: false,
      reason:
        `слот ${wanted} уже поднят (порт ${portsFor(wanted).firestore} слушает) — это твой же стенд ` +
        `от прошлого запуска либо его сирота; погаси держателя порта и повтори`,
    };
  }
  if (live.length >= MAX_CONCURRENT_STANDS) {
    const who = live
      .map((s) => `слот ${s} (${ROLES[s]}, firestore ${portsFor(s).firestore})`)
      .join(' · ');
    return {
      ok: false,
      reason:
        `машина держит ${MAX_CONCURRENT_STANDS} стенда разом (замер plans/69 шага 1, слово владельца), ` +
        `а сейчас подняты: ${who}. Договорись сообщением с держателем или дождись свободного места — ` +
        `состояние команды видно на доске: node tools/team-status.mjs show`,
    };
  }
  return { ok: true };
}

/* ── Доказательства ─────────────────────────────────────────────────────────────────────── */

/**
 * Проверки модуля одним списком: их печатает `--selftest` и прогоняют юниты `npm test`.
 * Один источник на двух потребителей — иначе списки разъедутся, и «зелено» будет означать
 * разное в разных прогонах.
 *
 * @returns {[string, () => boolean][]}
 */
export function checks() {
  return [
    ['слот каждой из ШЕСТИ ролей выводится из каталога', () =>
      slotOf('ndim_manager').slot === 0 &&
      slotOf('ndim_designer').slot === 1 &&
      slotOf('ndim_qa').slot === 2 &&
      slotOf('ndim_dev1').slot === 3 &&
      slotOf('ndim_dev2').slot === 4 &&
      slotOf('ndim_dev3').slot === 5],

    ['старые имена каталогов (до приписки ndim_) ещё принимаются', () =>
      slotOf('qa').slot === 2 && slotOf('dev-3').slot === 5 && slotOf('manager').slot === 0],

    ['чужой каталог не падает, а получает слот 0 И ПРИЧИНУ строкой', () => {
      const r = slotOf('kumm-d2');
      return r.slot === 0 && r.role === null && typeof r.note === 'string' && r.note.includes('kumm-d2');
    }],

    ['🔑 СЛОТЫ НЕ ПЕРЕСЕКАЮТСЯ: все порты всех шести слотов различны', () => {
      const all = SLOTS.flatMap((s) => Object.values(portsFor(s)));
      return all.length === SLOTS.length * Object.keys(STAND_PORTS).length &&
        all.length === new Set(all).size;
    }],

    ['сетка обходит порты, занятые машиной под чужое (8080 · 9100 · 9247)', () => {
      const all = new Set(SLOTS.flatMap((s) => Object.values(portsFor(s))));
      return MACHINE_BUSY_PORTS.every((p) => !all.has(p));
    }],

    ['слот 0 — это сегодняшний стенд байт-в-байт: порты те же и конфиг штатный', () => {
      const p = portsFor(0);
      return p.firestore === STAND_PORTS.firestore && p.auth === STAND_PORTS.auth &&
        p.storage === STAND_PORTS.storage && p.preview === STAND_PORTS.preview &&
        p.dev === STAND_PORTS.dev && slotConfigName(0) === 'firebase.json';
    }],

    ['порт = база + слот × 10, и это видно числами', () =>
      portsFor(4).firestore === 8221 && portsFor(4).auth === 9139 &&
      portsFor(4).storage === 9239 && portsFor(4).preview === 4213 && portsFor(4).dev === 5213],

    ['конфиг слота ≠ 0 назван по слоту и не затирает firebase.json', () =>
      slotConfigName(1) === 'firebase.slot1.json' && slotConfigName(5) === 'firebase.slot5.json'],

    ['несуществующий слот — отказ, а не тихая подстановка нуля', () => {
      for (const bad of [-1, 6, 1.5]) {
        try { portsFor(bad); return false; } catch { /* ожидаемо */ }
      }
      return true;
    }],

    ['секция emulators слота несёт ЕГО порты, а исходная не тронута', () => {
      const src = { firestore: { host: '127.0.0.1', port: 8181 }, auth: { host: '127.0.0.1', port: 9099 },
        storage: { host: '127.0.0.1', port: 9199 }, ui: { enabled: false }, singleProjectMode: true };
      const out = emulatorsForSlot(src, 2);
      return out.firestore.port === 8201 && out.auth.port === 9119 && out.storage.port === 9219 &&
        out.ui.enabled === false && out.singleProjectMode === true &&
        out.firestore.host === '127.0.0.1' && src.firestore.port === 8181;
    }],

    ['🔴 ПОТОЛОК ВЛАДЕЛЬЦА: четвёртый стенд получает отказ С ИМЕНАМИ занятых', () => {
      const v = capacityVerdict([0, 2, 4], 3);
      return v.ok === false && v.reason.includes('слот 0') && v.reason.includes('слот 2') &&
        v.reason.includes('слот 4') && v.reason.includes('dev-2');
    }],

    ['три стенда разом — законны: третий поднимается', () => capacityVerdict([0, 2], 4).ok === true],

    ['свой уже поднятый слот — отказ про сироту, а не про потолок', () => {
      const v = capacityVerdict([4], 4);
      return v.ok === false && v.reason.includes('сирот');
    }],
  ];
}

/* ── Точка входа: только по прямому запуску, иначе модуль нельзя импортировать ──────────── */

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).href) {
  if (process.argv.includes('--selftest')) {
    let fail = 0;
    for (const [name, fn] of checks()) {
      const ok = (() => { try { return fn(); } catch { return false; } })();
      console.log(`${ok ? '✅' : '❌'} ${name}`);
      if (!ok) fail++;
    }
    const total = checks().length;
    console.log(fail ? `\n❌ провалов: ${fail}` : `\n✅ самопроверка чиста: ${total}/${total}`);
    process.exit(fail ? 1 : 0);
  } else {
    const { slot, role, note } = slotOf(process.argv[2] ?? '');
    if (note) console.log(`⚠️  ${note}`);
    console.log(`слот ${slot}${role ? ` · роль ${role}` : ''} · порты ${JSON.stringify(portsFor(slot))}`);
  }
}
