#!/usr/bin/env node
/**
 * ПРОД-СТРАЖ 301-ПЕРЕАДРЕСАЦИЙ — приёмка шага 3 плана `plans/39` ПО ЖИВОМУ БОЮ.
 *
 * Прогоняется СРАЗУ ПОСЛЕ выката языковых адресов (и потом в любой момент). Только читает:
 * шлёт HEAD/GET без следования редиректу и судит ответ. Ничего не пишет, входа не требует.
 *
 * 🔴 Почему по бою, а не по эмулятору. Hosting-эмулятор firebase-tools 15.23 redirects
 * МОЛЧА НЕ ПРИМЕНЯЕТ (проверено 2026-08-14 на минимальном одиночном конфиге: правило из
 * документации дословно, запрос в логе эмулятора есть, ответ 404). Боевой hosting — другой
 * код (edge Google, не superstatic), и три хостовых 301 в бою работают с июля. Значит
 * единственный честный прибор для правил `firebase.json` — сам бой.
 *
 * Что охраняется:
 *   1. Каждый из 10 старых публичных адресов отвечает **301** → свой `/ru/…` (`plans/39`,
 *      критерий 2: адреса проиндексированы с 2026-08-01, 404 выбросил бы их заработок).
 *   2. Личный `/menu` НЕ переадресуется (маска задела бы его — правила поимённые).
 *   3. Корень `/` отвечает 200 (он распознаватель, а не редирект — интервью №010, Р5 = В).
 *   4. Новые адреса `/ru/…` отвечают 200.
 *   5. 📊 Судьба query при 301 — ДОКЛАДЫВАЕТСЯ (важно письмам входа: старое письмо несёт
 *      `oobCode` на голый адрес). Не проверка, а замер: поведение решает платформа, мы его
 *      фиксируем числом, а не гадаем.
 *
 * Запуск:  node tools/verify-prod-lang-redirects.mjs [--base https://ndim-stage.web.app]
 *          (`--host` понимается по-прежнему — им прибор запускали до появления контуров)
 * Выход:   0 — чисто; 1 — есть провалы.
 */
import { contourFromArgv } from './lib/contours.mjs';

const HOST = process.argv.includes('--host')
  ? process.argv[process.argv.indexOf('--host') + 1]
  : contourFromArgv().site;

const OLD_PATHS = [
  '/delete-account',
  '/menu/manual',
  '/menu/terms',
  '/menu/privacy',
  '/menu/disclaimer',
  '/menu/about',
  '/menu/author',
  '/menu/support',
  '/menu/donate',
  '/menu/share',
];

let failed = 0;
let passed = 0;
const check = (name, ok, detail = '') => {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`  ${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

/** Запрос без следования редиректу; отвечает статусом и Location. */
async function probe(path) {
  const res = await fetch(`${HOST}${path}`, { redirect: 'manual' });
  return { status: res.status, location: res.headers.get('location') ?? '' };
}

console.log(`\nПрод-страж 301 языковых адресов · ${HOST}\n`);

// ── Контроль прибора: хост жив и отдаёт распознаватель ───────────────────────
console.log('— контроль прибора —');
const root = await probe('/');
check('корень отвечает (хост жив)', root.status === 200, `HTTP ${root.status}`);

// ── 1. Старые адреса → 301 → /ru/… ───────────────────────────────────────────
console.log('\n— старые адреса отвечают 301 на /ru/… —');
for (const path of OLD_PATHS) {
  const { status, location } = await probe(path);
  const target = `/ru${path}`;
  const ok = status === 301 && (location === target || location === `${HOST}${target}`);
  check(`${path}`, ok, `HTTP ${status}${location ? ` → ${location}` : ''}`);
}

// ── 2–4. Границы: /menu личный, корень — страница, новые адреса живут ────────
console.log('\n— границы —');
const menu = await probe('/menu');
check('личный /menu НЕ переадресован', menu.status === 200, `HTTP ${menu.status}`);
for (const p of ['/ru', '/en', '/ru/menu/terms', '/en/delete-account']) {
  const { status } = await probe(p);
  check(`${p} отвечает 200`, status === 200, `HTTP ${status}`);
}

// ── 5. Замер: судьба query при 301 (письма входа) ────────────────────────────
console.log('\n— замер: query при 301 —');
{
  const { status, location } = await probe('/delete-account?mode=signIn&oobCode=probe123');
  // Это ЗАМЕР, а не проверка: платформа решает, мы фиксируем. Если query ТЕРЯЕТСЯ —
  // старое письмо со ссылкой на голый адрес деградирует до экрана входа (мягко, но знать надо).
  console.log(`  📊 HTTP ${status} → ${location || '(нет Location)'}`);
  if (status === 301) {
    console.log(`  📊 query ${location.includes('oobCode=probe123') ? 'СОХРАНЯЕТСЯ' : 'ТЕРЯЕТСЯ'} при переадресации`);
  } else {
    console.log('  📊 переадресации ещё нет — замер снимется после выката');
  }
}

console.log(`\n${failed === 0 ? '✅' : '❌'} проверок ${passed + failed} · провалов ${failed}\n`);
process.exit(failed === 0 ? 0 : 1);
