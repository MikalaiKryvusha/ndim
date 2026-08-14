/**
 * 🔴 ЕДИНСТВЕННАЯ ДВЕРЬ В БОЙ — `npm run deploy`.
 *
 * Существует потому, что 2026-08-15 агент трижды выкатил прод «руками» (`firebase deploy`) и
 * трижды не проверил результат под сессией. В бою оказалось приложение, которое не стартовало
 * вовсе, и нашёл это ВЛАДЕЛЕЦ, а не приборы. Его слова дословно: «**деплой без тестирования это
 * пердёж в лужу, а не работа**» и «**после каждого деплоя ты должен залогиниться в свой тестовый
 * аккаунт и пройти смоук тестирование**».
 *
 * Правило, записанное в документ, сессия нарушает — правило, встроенное в единственную дверь,
 * нарушить нечем (`AGENT_GUIDE.md` → «Журнал опыта»: убрать ловушку > страж > запись).
 *
 * ЧТО ДЕЛАЕТ ПО ПОРЯДКУ, останавливаясь на первой же неудаче:
 *   1. `npm run build` — С ОЧИСТКОЙ (`prebuild`), иначе в бой уезжает смесь сборок: старый чанк
 *      ищет свой `globalThis.__sveltekit_<хеш>`, не находит и роняет приложение (`bugs/124`).
 *   2. ПРОВЕРКА ЦЕЛОСТНОСТИ СБОРКИ до выката: во всей `build/` обязан быть РОВНО ОДИН хеш.
 *      Это и есть машинная защита от того, что случилось.
 *   3. `firebase deploy --only hosting --project ndim-space` (оба таргета).
 *   4. `verify-prod-cache` — заголовки кеширования (`bugs/124`).
 *   5. `verify-prod-signed-in` — 🔑 СМОУК ПОД СЕССИЕЙ: вход, все пять экранов, консоль.
 *   6. `verify-prod-b4` — публичный смоук гостем.
 *
 * Выход ненулевой, если упал любой шаг: «выкатил и не проверил» больше не является достижимым
 * состоянием.
 *
 * Запуск: `npm run deploy`   (флаг `--skip-build` — только выкат уже собранного, для повтора)
 */
import { execSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const skipBuild = process.argv.includes('--skip-build');

function run(title, command) {
  console.log(`\n══ ${title} ══\n$ ${command}`);
  try {
    execSync(command, { stdio: 'inherit' });
  } catch {
    console.error(`\n🔴 ШАГ ПРОВАЛЕН: ${title}. Выкат остановлен.`);
    process.exit(1);
  }
}

/**
 * Целостность сборки: один хеш на всю папку.
 *
 * `globalThis.__sveltekit_<хеш>` объявляет HTML, а читают его чанки. Два разных хеша в одной
 * папке означают файлы от РАЗНЫХ сборок — ровно то, что уехало в бой 2026-08-15 и уронило
 * приложение у всех, кто открыл его свежим браузером.
 */
function checkBuildIntegrity() {
  console.log('\n══ целостность сборки: один хеш на всю папку ══');
  const hashes = new Map();
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) {
        walk(path);
        continue;
      }
      if (!/\.(js|html)$/.test(name)) continue;
      const text = readFileSync(path, 'utf8');
      for (const found of text.matchAll(/__sveltekit_([a-z0-9]+)/g)) {
        const list = hashes.get(found[1]) ?? [];
        if (list.length < 3) list.push(path);
        hashes.set(found[1], list);
      }
    }
  };
  walk('build');

  if (hashes.size === 0) {
    console.error('🔴 в сборке нет ни одного `__sveltekit_<хеш>` — это не собранное приложение.');
    process.exit(1);
  }
  if (hashes.size > 1) {
    console.error(`🔴 В СБОРКЕ ${hashes.size} РАЗНЫХ ХЕША — это смесь сборок, в бой её пускать нельзя (bugs/124):`);
    for (const [hash, files] of hashes) console.error(`   ${hash} → ${files.join(', ')}`);
    console.error('   Лечение: `npm run build` (он теперь чистит build/ сам) и повторить.');
    process.exit(1);
  }
  console.log(`✅ хеш один: ${[...hashes.keys()][0]}`);
}

if (!skipBuild) {
  run('снимок витрины лендинга (число стареет)', 'node tools/snapshot-landing-metric.mjs');
  run('сборка НАЧИСТО', 'npm run build');
}
checkBuildIntegrity();
run('выкат в бой', 'firebase deploy --only hosting --project ndim-space');
run('заголовки кеширования (bugs/124)', 'node tools/verify-prod-cache.mjs');
run('🔑 СМОУК ПОД СЕССИЕЙ — вход и все экраны', 'node tools/verify-prod-signed-in.mjs');
run('публичный смоук гостем', 'node tools/verify-prod-b4.mjs');

console.log('\n✅ ВЫКАТ ЗАВЕРШЁН И ПРОВЕРЕН: сборка целая, заголовки верны, приложение в бою работает под сессией.');
