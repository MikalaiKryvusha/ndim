#!/usr/bin/env node
/**
 * СТРАЖ ЦЕПИ ЗАГРУЗОЧНОГО ЩИТА — у каждого входа, где щит поднимают, обязан быть тот, кто его опустит.
 *
 * Регрессия боя 2026-09-05 (`bugs/NEW_root_boot_shield_never_drops`): `app.html` поднимает щит
 * (`data-booting`) на корне и на лендинге у всякого с маркером сессии `ndim-session`; опускал его
 * только лендинг (`endBoot()` из `session.ts`), куда корень до V5 уводил. V5 снял увод — и на корне
 * щит стало опускать некому: владелец увидел вечную «Загрузка выполняется необычно долго», а все
 * смоуки были зелёными, потому что ходили свежими контекстами без маркера.
 *
 * Страж СТАТИЧЕСКИЙ и дешёвый: он не заменяет e2e корня и проход с маркером в смоуке двери, а
 * ловит разрыв цепи в момент правки — ещё до сборки. Что сторожит:
 *   · `app.html` поднимает щит на корне (`atRoot`) и на лендинге (`atLanding`) по маркеру;
 *   · корень (`src/routes/+page.svelte`, без гидратации) опускает щит уводом: инлайн-скрипт читает
 *     маркер `ndim-session` и делает `location.replace('/profile')`;
 *   · лендинг (`[lang=lang]/+page.svelte`) зовёт `hasSession()` и `endBoot()`;
 *   · `session.ts` — единственное место, снимающее `data-booting`.
 *
 * Запуск:  node tools/verify-boot-shield.mjs
 *          node tools/verify-boot-shield.mjs --selftest
 * Ворота: npm run guards (запись «цепь загрузочного щита»); юниты рядом в `npm run test:tools`.
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const ЗАПУЩЕН_НАПРЯМУЮ = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;

/** Файлы цепи — от корня проекта. */
export const ЦЕПЬ = {
  shell: 'src/app.html',
  root: 'src/routes/+page.svelte',
  landing: 'src/routes/[lang=lang]/+page.svelte',
  session: 'src/lib/data/session.ts',
};

/**
 * Судит цепь по ТЕКСТАМ файлов — чистая функция, её же зовут юниты с подложными текстами.
 * @param {{shell: string, root: string, landing: string, session: string}} t
 * @returns {string[]} претензии; пусто — цепь цела
 */
export function judgeShield(t) {
  const беды = [];
  const raisesRoot = /atRoot/u.test(t.shell) && /data-booting/u.test(t.shell) && /ndim-session/u.test(t.shell);
  const raisesLanding = /atLanding/u.test(t.shell);
  if (!raisesRoot) беды.push('app.html: щит на корне больше не поднимается по маркеру ndim-session — либо это решение владельца (тогда перепиши стража), либо цепь порвана');
  if (!raisesLanding) беды.push('app.html: щит на лендинге больше не поднимается (atLanding) — цепь порвана');

  // Корень без гидратации: опускает уводом внутрь, читая ТОТ ЖЕ маркер.
  const rootReadsMark = /localStorage\.getItem\(['"]ndim-session['"]\)/u.test(t.root);
  const rootLeadsInside = /location\.replace\(['"]\/profile['"]\)/u.test(t.root);
  if (raisesRoot && !(rootReadsMark && rootLeadsInside)) {
    беды.push('корень: щит поднят app.html по маркеру, а на корне никто не читает ndim-session и не уводит в /profile — вечная «Загрузка» у всех, кто хоть раз входил (bugs/NEW_root_boot_shield_never_drops)');
  }
  if (/export const csr = false/u.test(t.root) === false && /onMount/u.test(t.root)) {
    // информационно: корень с гидратацией — цепь можно держать и через onMount; страж не мешает
  }

  // Лендинг гидратируется: решает hasSession() и опускает endBoot().
  if (raisesLanding && !(/hasSession\(/u.test(t.landing) && /endBoot\(/u.test(t.landing))) {
    беды.push('лендинг: щит поднят app.html, а лендинг не зовёт hasSession()/endBoot() — щит висит до потолка');
  }

  // Единственный опускатель.
  if (!/removeAttribute\(['"]data-booting['"]\)/u.test(t.session)) {
    беды.push('session.ts: endBoot() больше не снимает data-booting — опускать щит стало нечем');
  }
  return беды;
}

/** Прочитать живую цепь с диска. */
export function readChain(root = process.cwd()) {
  const out = {};
  for (const [k, p] of Object.entries(ЦЕПЬ)) out[k] = readFileSync(`${root}/${p}`, 'utf8');
  return out;
}

/** Самотест — на подложных текстах, без диска: здоровая цепь чиста, каждая порванная звенья краснеет. */
export function selftest() {
  const fails = [];
  const ok = (name, cond) => { if (!cond) fails.push(name); };
  const healthy = {
    shell: "var atRoot = p === '/'; var atLanding = true; if ((atRoot || atLanding) && localStorage.getItem('ndim-session')) d.setAttribute('data-booting', '')",
    root: "export const csr = false; if (localStorage.getItem('ndim-session')) { location.replace('/profile'); }",
    landing: 'void hasSession().then((inside) => { if (inside) return; endBoot(); })',
    session: "document.documentElement.removeAttribute('data-booting');",
  };
  ok('здоровая цепь чиста', judgeShield(healthy).length === 0);
  ok('корень без увода по маркеру — красный (регрессия 2026-09-05)', judgeShield({ ...healthy, root: 'export const csr = false;' }).some((b) => /корень/u.test(b)));
  ok('лендинг без endBoot — красный', judgeShield({ ...healthy, landing: 'void hasSession()' }).some((b) => /лендинг/u.test(b)));
  ok('session.ts без снятия атрибута — красный', judgeShield({ ...healthy, session: 'export function endBoot() {}' }).some((b) => /session\.ts/u.test(b)));
  return fails;
}

if (ЗАПУЩЕН_НАПРЯМУЮ) {
  if (process.argv.includes('--selftest')) {
    const fails = selftest();
    console.log(fails.length ? '🔴 ПРОВАЛЫ:\n  ' + fails.join('\n  ') : '✅ самотест стража щита чист');
    process.exit(fails.length ? 1 : 0);
  }
  const беды = judgeShield(readChain());
  if (беды.length) {
    console.log('🔴 ЦЕПЬ ЗАГРУЗОЧНОГО ЩИТА ПОРВАНА:');
    for (const b of беды) console.log('   · ' + b);
    process.exit(1);
  }
  console.log('✅ цепь щита цела: корень уводит по маркеру, лендинг опускает через hasSession/endBoot, session.ts снимает data-booting');
  process.exit(0);
}
