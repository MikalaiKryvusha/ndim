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
