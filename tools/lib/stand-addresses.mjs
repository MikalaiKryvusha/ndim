/**
 * АДРЕСА СТЕНДА — ОДНО ЧТЕНИЕ УЖЕ СУЩЕСТВУЮЩИХ КОНВЕНЦИЙ, А НЕ НОВЫЕ ИМЕНА.
 *
 * 🔴 ПОВОД (замечание QA 2026-08-22 по `verify-bug172`): прибор держал литеральные адреса —
 * `localhost:5173`, `127.0.0.1:9099`, `127.0.0.1:8181`. Пока стенд был один, это было незаметно;
 * с парком стендов (`plans/69`) литерал означает «этот прибор умеет работать только на слоте 0»,
 * то есть ровно там, где стоит дверь выката. Прибор, привязанный к чужому слоту, не запускается
 * тогда, когда он нужнее всего.
 *
 * 🔑 ИМЕНА ПЕРЕМЕННЫХ НЕ ВЫДУМАНЫ ЗДЕСЬ, И ЭТО ГЛАВНОЕ В ЭТОМ МОДУЛЕ. Первая редакция завела
 * собственные `NDIM_STAND_*` — и была неправа: конвенции уже есть, их поставил dev-2 замером,
 * а я проверил грепом по дереву:
 *   · `FIRESTORE_EMULATOR_HOST` — **38 файлов** · `FIREBASE_AUTH_EMULATOR_HOST` — 7 ·
 *     `FIREBASE_STORAGE_EMULATOR_HOST` — 4. Их выставляет ПОТОМКАМ САМ `firebase emulators:exec`,
 *     то есть прибор становится слотовым даром, ничего не зная про слоты;
 *   · `PROBE_BASE` — адрес сайта, **34 прибора** проекта уже читают именно её.
 * Свои имена поверх этого были бы велосипедом и второй парой «истина ↔ зеркало»
 * (`PHILOSOPHY.md` → best practices, DRY).
 *
 * ⛔ ТАБЛИЦЫ «РОЛЬ → СЛОТ → ПОРТЫ» ЗДЕСЬ НЕТ НАМЕРЕННО. Она принадлежит хозяину парка
 * (`tools/lib/stand-slot.mjs`, ведёт dev-2). Вторая копия разъехалась бы при первом изменении
 * парка — и разъехалась бы молча, потому что оба списка выглядят правдоподобно.
 *
 * ⚠️ ФОРМА ЗНАЧЕНИЙ РАЗНАЯ, и на этом легко обжечься: переменные Firebase несут `host:port`
 * БЕЗ СХЕМЫ (`127.0.0.1:8211`), а приборам нужен URL. Схему приписывает этот модуль — один раз
 * здесь, а не в каждом приборе по-своему.
 *
 * Как пользоваться:
 *   · ничего не выставлено → слот 0, прежнее поведение до последней запятой;
 *   · под `firebase emulators:exec` → переменные приедут сами, трогать ничего не надо;
 *   · руками: `PROBE_BASE=http://localhost:5203 FIRESTORE_EMULATOR_HOST=127.0.0.1:8211 …`
 *
 * ⚠️ Флаг `--base`, если он у прибора есть, СИЛЬНЕЕ окружения: он адресует конкретный прогон
 * (бой, стейдж, чужой preview), а окружение описывает «где мой стенд». Разные вопросы.
 */

/** Умолчания — слот 0. Менять их нельзя: на них стоит всё, что писалось до парка. */
const СЛОТ_0 = {
  app: 'http://localhost:5173',
  preview: 'http://localhost:4173',
  auth: '127.0.0.1:9099',
  firestore: '127.0.0.1:8181',
  storage: '127.0.0.1:9199',
  project: 'demo-ndim-dev',
};

const чисто = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
/** `host:port` → `http://host:port`; уже готовый URL оставляется как есть. */
const какURL = (v) => (/^https?:\/\//.test(v) ? v : `http://${v}`).replace(/\/+$/, '');

/**
 * Адреса текущего стенда.
 * @returns {{app:string, preview:string, auth:string, firestore:string, storage:string,
 *            project:string, слот0:boolean}}
 */
export function standAddresses() {
  const app = какURL(чисто(process.env.PROBE_BASE) ?? СЛОТ_0.app);
  const preview = какURL(чисто(process.env.PROBE_PREVIEW_BASE) ?? СЛОТ_0.preview);
  const authHost = чисто(process.env.FIREBASE_AUTH_EMULATOR_HOST) ?? СЛОТ_0.auth;
  const fsHost = чисто(process.env.FIRESTORE_EMULATOR_HOST) ?? СЛОТ_0.firestore;
  const stHost = чисто(process.env.FIREBASE_STORAGE_EMULATOR_HOST) ?? СЛОТ_0.storage;
  // Имя проекта эмулятора у нас задаётся отдельно; `GCLOUD_PROJECT` — то, что ставит сам CLI.
  const project =
    чисто(process.env.NDIM_EMULATOR_PROJECT) ?? чисто(process.env.GCLOUD_PROJECT) ?? СЛОТ_0.project;

  const слот0 =
    app === СЛОТ_0.app && authHost === СЛОТ_0.auth && fsHost === СЛОТ_0.firestore;

  return {
    app,
    preview,
    auth: какURL(authHost),
    firestore: какURL(fsHost),
    storage: какURL(stHost),
    project,
    слот0,
  };
}

/**
 * Строка для шапки отчёта. Прибор ОБЯЗАН её печатать: кадры и числа, снятые не на том стенде,
 * ничем не отличаются от снятых на том — кроме этой строки.
 */
export function addressesLine(a = standAddresses()) {
  return (
    `стенд: приложение ${a.app} · auth ${a.auth} · firestore ${a.firestore} · проект ${a.project}` +
    (a.слот0 ? ' (слот 0, умолчание)' : ' (адреса из окружения)')
  );
}
