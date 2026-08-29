/**
 * ЮНИТЫ ТЕСТОВОГО ПАРКА, ФАЗА 2 — адрес сайта роли берётся из её слота.
 *
 * 🔴 ЧТО ИМЕННО СТЕРЕЖЁТСЯ И ПОЧЕМУ ЭТОГО НЕ ХВАТАЕТ В `stand-slot.test.ts`. Тот файл судит
 * ЧИСТУЮ функцию «слот → порты» и делает это хорошо. Здесь судится другое — ПРОВОДКА: доехали ли
 * эти порты до двух конфигов, от которых зависит, свой ли сайт видит прогон. Проводку нельзя
 * проверить арифметикой: она либо есть в конфиге, либо нет, и «нет» выглядит как обычный зелёный
 * прогон по чужой сборке.
 *
 * 🔑 КОНФИГ VITE ЗАГРУЖАЕТСЯ ПО-НАСТОЯЩЕМУ, А НЕ ЧИТАЕТСЯ ТЕКСТОМ. Греп по исходнику доказывает
 * написание, а не поведение — ровно тот класс, про который канон говорит «`check(имя, true)` это
 * не проверка, а комментарий». Здесь vite сам разбирает свой конфиг, и утверждения делаются о
 * РАЗРЕШЁННЫХ значениях.
 *
 * Три вещи, возврат которых был бы тихой катастрофой:
 *   1. **`reuseExistingServer: false`.** Вернуть `true` — вернуть мину «чужая сборка молча»:
 *      Playwright делает `return` ВЫШЕ `launchProcess`, а наш `command` собирает и поднимает
 *      одной строкой, значит не запускается и СБОРКА. Роль со сломанной правкой получает зелёное.
 *   2. **Адрес прогона = preview-порт СВОЕГО слота.** Литерал вернул бы всех ролей на общий порт.
 *   3. **`strictPort` у обоих серверов.** Без него занятый порт не роняет запуск, а тихо
 *      переезжает на соседний — и роль смотрит чужой сайт (`EXP-0091`).
 *
 * Прогон: node --test tools/stand-fleet.test.mjs   ·   npm run test:tools   ·   npm run guards
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { portsFor, slotOf } from './lib/stand-slot.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SLOT = slotOf(basename(ROOT)).slot;
const PORTS = portsFor(SLOT);

test('vite: dev-сервер и preview слушают порты СВОЕГО слота, и оба со strictPort', async () => {
  const { loadConfigFromFile } = await import('vite');
  const loaded = await loadConfigFromFile({ command: 'serve', mode: 'development' }, resolve(ROOT, 'vite.config.ts'));
  assert.ok(loaded, 'vite.config.ts не загрузился вовсе');
  const { config } = loaded;

  assert.equal(config.server?.port, PORTS.dev, 'dev-сервер встал не на порт слота');
  assert.equal(config.preview?.port, PORTS.preview, 'preview встал не на порт слота');
  assert.equal(config.server?.strictPort, true, 'без strictPort занятый порт даёт тихий переезд');
  assert.equal(config.preview?.strictPort, true, 'без strictPort занятый порт даёт тихий переезд');
});

test('vite: порты эмуляторов слота уезжают в артефакт — их ставит конфиг, а не обёртка запуска', async () => {
  /*
   * Проверяем не текст, а СЛЕД: загрузка конфига обязана выставить переменные сборки, которые
   * читает `src/lib/firebase.ts`. Без них артефакт запечёт слот 0, то есть эмулятор соседа.
   *
   * 🔑 СНАЧАЛА СТИРАЕМ, ПОТОМ ГРУЗИМ. Без стирания проверка была бы зелёной от чего угодно: от
   * предыдущего теста в этом же файле, от окружения вызывающего, от обёртки запуска. Зелёное по
   * неизвестной причине — ровно то, что этот парк и лечит.
   */
  delete process.env.VITE_STAND_FIRESTORE_PORT;
  delete process.env.VITE_STAND_AUTH_PORT;
  delete process.env.VITE_STAND_STORAGE_PORT;
  const { loadConfigFromFile } = await import('vite');
  await loadConfigFromFile({ command: 'build', mode: 'production' }, resolve(ROOT, 'vite.config.ts'));
  assert.equal(process.env.VITE_STAND_FIRESTORE_PORT, String(PORTS.firestore));
  assert.equal(process.env.VITE_STAND_AUTH_PORT, String(PORTS.auth));
  assert.equal(process.env.VITE_STAND_STORAGE_PORT, String(PORTS.storage));
});

test('🔴 playwright: reuseExistingServer выключен — мина «чужая сборка молча» мертва', async () => {
  const config = (await import(pathToFileURL(resolve(ROOT, 'playwright.config.ts')).href)).default;
  assert.equal(
    config.webServer?.reuseExistingServer,
    false,
    'true возвращает мину: Playwright выходит ДО launchProcess, и наш command не собирает сайт',
  );
});

test('playwright: адрес прогона — preview-порт своего слота, в обоих местах', async () => {
  const config = (await import(pathToFileURL(resolve(ROOT, 'playwright.config.ts')).href)).default;
  const expected = `http://localhost:${PORTS.preview}`;
  assert.equal(config.use?.baseURL, expected);
  assert.equal(config.webServer?.url, expected, 'baseURL и webServer.url обязаны совпадать');
});

test('ни один из двух конфигов не несёт литерального порта стенда', () => {
  // Единственный список портов в проекте — `tools/lib/stand-cleanup.mjs`. Литерал в конфиге
  // означает, что кто-то «починил» вывод слота обратно в число.
  const literals = Object.values(portsFor(0)).map(String);
  for (const file of ['vite.config.ts', 'playwright.config.ts']) {
    const text = readFileSync(resolve(ROOT, file), 'utf8');
    const code = text
      .replace(/\/\*[\s\S]*?\*\//g, ' ') // блочные комментарии: там числа стоят по делу
      .replace(/(^|[^:])\/\/.*$/gm, '$1'); // строчные — тоже
    for (const port of literals) {
      assert.equal(
        new RegExp(`(?<![\\d.])${port}(?![\\d.])`).test(code),
        false,
        `${file} несёт литеральный порт ${port} — адрес обязан выводиться из слота`,
      );
    }
  }
});

test('tools/stand.mjs больше не называет порт dev-сервера сам', () => {
  const text = readFileSync(resolve(ROOT, 'tools/stand.mjs'), 'utf8');
  assert.equal(/STAND_DEV_PORT/.test(text), false, 'вернулось второе место правды о порте');
  assert.equal(/'--port'|"--port"/.test(text), false, 'порт снова назван руками, минуя конфиг');
});

/*
 * ═══ ПРЕДУПРЕЖДЕНИЕ О ЧУЖОМ СЛОТЕ — три случая, условие У3 суда №33 ═══
 *
 * 🔴 ПОЧЕМУ ЭТИ ТРИ ТЕСТА ВООБЩЕ ЕСТЬ. В шапке `stand-addresses.mjs` стояло «тестируется
 * подменой `process.chdir()` — так проверены все три случая». Артефакта в дереве у этого
 * заявления не было: `addressesLine` не упоминался ни в одном `tools/*.test.mjs`. Заявление о
 * проверке, которое нельзя повторить, — это не проверка (вердикт №33, У3).
 *
 * Класс, который стережётся: прибор, позванный из голой оболочки в копии роли, честно падает на
 * умолчание и уходит мерить стенд ГЛАВНОЙ копии. Отчёт, код выхода и кадры при этом
 * НЕОТЛИЧИМЫ от честных — единственная улика — эта строка (`EXP-NEW-instrument-measured-another-tree`).
 *
 * 🔑 Каталоги делаются ВРЕМЕННЫЕ, а не берутся с машины: тест, опирающийся на то, что рядом
 * лежит `…/ndim_designer`, зелен только у того, у кого он лежит.
 */
const сСлотом = async (dirName, env, fn) => {
  const { mkdtempSync, mkdirSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const база = mkdtempSync(resolve(tmpdir(), 'ndim-slot-'));
  const каталог = resolve(база, dirName);
  mkdirSync(каталог);
  const былCwd = process.cwd();
  const былиEnv = { ...process.env };
  try {
    process.chdir(каталог);
    for (const ключ of ['PROBE_BASE', 'FIREBASE_AUTH_EMULATOR_HOST', 'FIRESTORE_EMULATOR_HOST'])
      delete process.env[ключ];
    Object.assign(process.env, env);
    // Модуль читает окружение при КАЖДОМ вызове, поэтому импортируется один раз.
    const { addressesLine } = await import('./lib/stand-addresses.mjs');
    return fn(addressesLine());
  } finally {
    process.chdir(былCwd);
    for (const ключ of Object.keys(process.env)) delete process.env[ключ];
    Object.assign(process.env, былиEnv);
    rmSync(база, { recursive: true, force: true });
  }
};

test('🔴 адреса: промах КРИЧИТ — каталог роли со слотом ≠ 0, а адреса по умолчанию', async () => {
  await сСлотом('ndim_designer', {}, (строка) => {
    assert.match(строка, /ВНИМАНИЕ/, 'промах вызова обязан кричать, а не шептать');
    assert.match(строка, /designer/, 'предупреждение обязано назвать РОЛЬ каталога');
    assert.match(строка, /слот 1/, 'предупреждение обязано назвать НОМЕР слота');
    assert.match(строка, /stand-launch/, 'предупреждение обязано назвать способ позвать правильно');
  });
});

test('адреса: окружение задано — предупреждения НЕТ даже в каталоге роли', async () => {
  // Штатный путь: `firebase emulators:exec` выставил переменные потомкам. Кричать не о чем.
  await сСлотом(
    'ndim_designer',
    {
      PROBE_BASE: 'http://localhost:4183',
      FIREBASE_AUTH_EMULATOR_HOST: 'localhost:9109',
      FIRESTORE_EMULATOR_HOST: 'localhost:8191',
    },
    (строка) => {
      assert.match(строка, /адреса из окружения/, 'строка обязана назвать источник адресов');
      assert.doesNotMatch(строка, /ВНИМАНИЕ/, 'ложная тревога на штатном пути');
    },
  );
});

test('адреса: каталог вне рабочих мест ролей — молчит (дверь выката на слоте 0 не задета)', async () => {
  // ⛔ Главная копия и любой посторонний каталог обязаны вести себя байт-в-байт как до парка:
  // на слоте 0 стоит дверь выката, и её поведение менять нельзя (довод шапки `stand-launch.mjs`).
  await сСлотом('ndim', {}, (строка) => {
    assert.match(строка, /слот 0, умолчание/, 'умолчание обязано быть названо');
    assert.doesNotMatch(строка, /ВНИМАНИЕ/, 'посторонний каталог не повод кричать');
  });
});
