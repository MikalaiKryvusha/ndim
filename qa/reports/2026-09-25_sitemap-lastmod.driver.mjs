/**
 * Разовый драйвер ручного функционального прогона правдивого `<lastmod>` на НАСТОЯЩЕЙ сборке (`tools/lib/sitemap-lastmod.mjs`,
 * `plans/NEW_sitemap_truthful_lastmod.md`, FORK Б). Не прибор проекта. Шаг двери `stampBuild` вызывается тем же кодом,
 * что в `tools/deploy.mjs`, но реестр «контура» подаётся из памяти прогона — в сеть не пишется ничего, выката нет.
 *
 *   ЛМ-01 · сборка A, реестра нет (первый выкат): карта без `lastmod`, реестр только отпечатками всех страниц карты.
 *   ЛМ-02 · сборка B без правок, реестр A: ни одна дата не появилась, ни один отпечаток не сменился (пересборка — тот же).
 *   ЛМ-03 · сборка C с временной правкой одной фразы «Политики» (п. 2.6 есть только на /ru/menu/privacy), реестр B:
 *           `lastmod` ровно у /ru/menu/privacy, дата = момент штампа, у остальных нет. Файл восстанавливается побайтово.
 *   ЛМ-04 · повторный штамп C (как `--skip-build`) с тем же реестром — карта та же.
 *
 * Запуск из корня рабочего места: node qa/reports/2026-09-25_sitemap-lastmod.driver.mjs   (≈4 мин: три сборки)
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const { stampBuild, RULES } = await import(pathToFileURL(`${ROOT}/tools/lib/sitemap-lastmod.mjs`).href);
const SITE = 'https://ndim-stage.web.app';
const DOC = 'src/lib/content/docs.ts';
const FROM = 'аналитики PostHog для понимания того';
const TO = 'аналитики PostHog для лучшего понимания того';

let failures = 0;
function check(id, name, ok, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? '  PASS' : '  FAIL'} ${id} · ${name}${detail ? ` — ${detail}` : ''}`);
}
const t = () => new Date().toTimeString().slice(0, 8);
function build(label) {
  const at = t();
  execSync('npm run build', { stdio: 'pipe' });
  console.log(`  сборка ${label}: ${at}–${t()} · ${JSON.parse(readFileSync('build/build-stamp.json', 'utf8')).buildNumber}`);
}
/** Реестр «контура» из памяти прогона — как его отдал бы хостинг; `null` — 404. */
const serve = (ledger) => async () => (ledger ? new Response(JSON.stringify(ledger), { status: 200 }) : new Response('Not Found', { status: 404 }));
const read = () => ({ xml: readFileSync('build/sitemap.xml', 'utf8'), ledger: JSON.parse(readFileSync('build/sitemap-lastmod.json', 'utf8')) });
const lastmods = (xml) => [...xml.matchAll(/<url><loc>([^<]+)<\/loc><lastmod>([^<]+)<\/lastmod><\/url>/g)].map((m) => [new URL(m[1]).pathname, m[2]]);

console.log(`Голова: ${execSync('git rev-parse --short HEAD').toString().trim()} · дерево ${execSync('git status --porcelain --untracked-files=no').toString().trim() ? 'ГРЯЗНОЕ' : 'чистое'}`);

console.log('\nЛМ-01 · сборка A, реестра нет:');
build('A');
const sA = await stampBuild({ site: SITE, fetchImpl: serve(null) });
const A = read();
check('ЛМ-01', 'реестр «не прочитался» (404)', sA.why === 'HTTP 404', sA.why);
check('ЛМ-01', 'карта без lastmod целиком', !A.xml.includes('<lastmod>'), `с датой ${sA.dated}`);
check('ЛМ-01', 'реестр — отпечатки всех страниц карты, дат нет', A.ledger.rules === RULES && Object.keys(A.ledger.pages).length === sA.pages && Object.values(A.ledger.pages).every((p) => p.fp && p.lastmod === null), `страниц ${sA.pages}`);

console.log('\nЛМ-02 · сборка B без правок, реестр A:');
build('B');
const sB = await stampBuild({ site: SITE, fetchImpl: serve(A.ledger) });
const B = read();
const moved = Object.keys(B.ledger.pages).filter((p) => B.ledger.pages[p].fp !== A.ledger.pages[p]?.fp);
check('ЛМ-02', 'пересборка без правок — ни один отпечаток не сменился', moved.length === 0, `сменилось ${moved.length}${moved.length ? `: ${moved.slice(0, 5).join(', ')}` : ''}`);
check('ЛМ-02', 'ни одна дата не появилась', !B.xml.includes('<lastmod>') && sB.dated === 0, `прежних ${sB.kept}, изменились ${sB.changed}, новых ${sB.added}`);

console.log('\nЛМ-03 · сборка C с правкой одной фразы «Политики», реестр B:');
const orig = readFileSync(DOC);
let C;
let sC;
let stampAt;
try {
  const src = orig.toString('utf8');
  if (!src.includes(FROM)) throw new Error('фраза для правки не найдена');
  writeFileSync(DOC, src.replace(FROM, TO));
  build('C');
  stampAt = new Date();
  sC = await stampBuild({ site: SITE, fetchImpl: serve(B.ledger) });
  C = read();
} finally {
  writeFileSync(DOC, orig);
  console.log(`  ${DOC} восстановлен побайтово: ${Buffer.compare(readFileSync(DOC), orig) === 0}`);
}
const dated = lastmods(C.xml);
check('ЛМ-03', 'lastmod ровно у /ru/menu/privacy', dated.length === 1 && dated[0][0] === '/ru/menu/privacy', JSON.stringify(dated));
check('ЛМ-03', 'дата — момент штампа, с поясом, не позже него', dated.length === 1 && dated[0][1] === sC.now && Math.abs(Date.parse(sC.now) - stampAt.getTime()) < 5000, `${sC.now}`);
check('ЛМ-03', 'счёт штампа: изменилась 1, прочие прежние', sC.changed === 1 && sC.added === 0 && sC.kept === sC.pages - 1, `изменились ${sC.changed}, прежних ${sC.kept}`);

console.log('\nЛМ-04 · повторный штамп сборки C (как --skip-build), тот же реестр B:');
const sC2 = await stampBuild({ site: SITE, fetchImpl: serve(B.ledger), now: sC.now });
const C2 = read();
check('ЛМ-04', 'карта та же', C2.xml === C.xml, `с датой ${sC2.dated}`);

console.log(`\nИТОГ: провалов ${failures}. ⚠️ build/ теперь — сборка C (правка откатана в исходнике): пересоберите перед выкатом.`);
process.exitCode = failures ? 1 : 0;
