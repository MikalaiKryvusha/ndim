/**
 * СТРАЖ УБОРКИ СТЕНДА — ни один прибор не гасит процессы по маске командной строки.
 *
 * 🔴 ПОЧЕМУ ЭТОТ ТЕСТ ЖИВЁТ СРЕДИ ЮНИТОВ ПРОДУКТА, А СТЕРЕЖЁТ `tools/`. Он обязан идти в
 * `npm test`: командный манифест делает зелёные юниты условием ЛЮБОЙ передачи работы, то есть
 * это единственный прогон, который случается перед каждой сдачей у каждой роли. Прецедент в
 * проекте уже есть — `dims-rating.test.ts` тем же способом грепает все `.svelte` и ловит вторую
 * копию правила показа оценок.
 *
 * ЧТО ИМЕННО СТЕРЕЖЁТСЯ. Рецепт «перебери `node.exe` и убей всё, где в командной строке есть X»
 * ошибается В ОБЕ СТОРОНЫ, и обе стороны оплачены полем:
 *   · слишком ШИРОКАЯ маска бьёт по чужому — `EXP-0081` (убила собственный PowerShell, следом
 *     чужие MCP-серверы), `EXP-0131` (задела бы страницы другого проекта, спасла случайность),
 *     а в командном режиме пяти worktree маска `'vite'` гасит preview соседней роли, и та пойдёт
 *     искать дефект в продукте вместо своего сервера;
 *   · слишком УЗКАЯ молчит о своём — 2026-08-21: `-match 'vite preview'` дал «процессов 0» при
 *     живом сервере, потому что настоящая командная строка `"node" "…\vite\bin\vite.js" preview`.
 *     «Процессов 0» при отвечающем порте читается как «чисто», а осиротевший preview потом
 *     отдаёт СТАРУЮ сборку и кадры с него врут (`EXP-0091`).
 *
 * Правильный признак «моё» — ПОРТ: он выдан замком доски, держатель единственный и гасится по
 * PID. Рецепт живёт одной строкой в `tools/lib/stand-cleanup.mjs`.
 *
 * Мутация, которую тест обязан ронять: вернуть в любой прибор строку
 * `$_.CommandLine -match 'vite'` — тест краснеет и называет файл.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { killPortRecipe, whoHoldsPortRecipe, STAND_PORTS } from '../../../tools/lib/stand-cleanup.mjs';

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });

/**
 * Формы гашения по подстроке. Ищем именно СВЯЗКУ «фильтр по командной строке» + «убить», а не
 * слово `Stop-Process`: гасить по PID — законно и нужно, запрещено выбирать жертву маской.
 */
const BY_MASK: readonly [RegExp, string][] = [
  [/CommandLine\s+-(?:match|like)[\s\S]{0,200}?Stop-Process/i, 'выбор жертвы по CommandLine'],
  [/pkill\s+-f/i, 'pkill -f (на Windows он ещё и не работает)'],
  [/taskkill[^\n]*\/IM\s+node/i, 'taskkill /IM node — по площади'],
];

test('ни один прибор не гасит процессы по маске командной строки', () => {
  const guilty: string[] = [];
  for (const file of walk('tools').filter((f) => /\.(mjs|ts|ps1)$/.test(f))) {
    // Сам модуль рецептов ОБЪЯСНЯЕТ запрет и цитирует запрещённые формы в шапке — судить его
    // по собственным цитатам значило бы запретить документировать запрет.
    if (file.replace(/\\/g, '/').endsWith('tools/lib/stand-cleanup.mjs')) continue;
    const code = readFileSync(file, 'utf8');
    for (const [re, what] of BY_MASK) if (re.test(code)) guilty.push(`${file}: ${what}`);
  }
  assert.deepEqual(guilty, [], 'гашение по маске бьёт по процессам соседних ролей — гаси держателя ПОРТА по PID');
});

test('рецепт гашения привязан к порту и убивает по PID, а не по имени', () => {
  const recipe = killPortRecipe(STAND_PORTS.preview);
  assert.match(recipe, /-LocalPort 4173\b/, 'рецепт обязан называть порт');
  assert.match(recipe, /Stop-Process -Id \$_\.OwningProcess/, 'жертва берётся у порта, а не у маски');
  assert.doesNotMatch(recipe, /CommandLine|-match|Name='node/, 'в рецепте не должно быть признаков по имени');
});

test('рецепт «кто держит порт» читает командные строки, но никого не гасит', () => {
  const recipe = whoHoldsPortRecipe(STAND_PORTS.preview);
  assert.match(recipe, /Select-Object ProcessId, CommandLine/, 'смотреть глазами — часть канона (EXP-0131)');
  assert.doesNotMatch(recipe, /Stop-Process/, 'разведка не гасит: иначе смотреть будет уже нечего');
});

test('порты стенда названы в одном месте и совпадают с замком доски', () => {
  assert.deepEqual({ ...STAND_PORTS }, { preview: 4173, firestore: 8181, auth: 9099, storage: 9199 });
});
