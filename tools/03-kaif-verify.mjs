#!/usr/bin/env node
// 03-kaif-verify.mjs — перепроверка развёрнутого KAIF (шаг 3 развёртывания, он же `npm run kaif:check`).
//
// Зачем: Stage 1.5 распаковщика проверяет только НАЛИЧИЕ файлов. Этот скрипт проверяет их
// СОДЕРЖИМОЕ — что адаптация к проекту действительно проведена, а не только объявлена:
// не осталось незаполненных плейсхолдеров, документы локализованы, скиллы сохранили канонические
// идентификаторы команд, маркер развёртывания валиден.
//
// Использование:  node tools/03-kaif-verify.mjs
// Коды возврата:  0 — всё чисто; 1 — есть ошибки (перечислены в выводе).

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const errors = [];
const warnings = [];
const ok = [];

const fail = (msg) => errors.push(msg);
const warn = (msg) => warnings.push(msg);
const pass = (msg) => ok.push(msg);

const read = (p) => readFileSync(p, 'utf8');
const exists = (p) => existsSync(p) && statSync(p).size > 0;

// --- 1. Ключевые документы на месте и непустые ---------------------------------
const ROOT_DOCS = [
  'AGENT_GUIDE.md', 'PHILOSOPHY.md', 'BUG_FIXING_FRAMEWORK.md', 'GOAL.md',
  'STATUS.md', 'EXPERIENCE.md', 'MASTER_PLAN.md',
  'PROJECT_STRUCTURE_EXTERNAL_MAP.md', 'PROJECT_ARCHITECTURE_INTERNAL_MAP.md',
  'KAIF_FRAMEWORK.md',
];
const KNOWLEDGE_DIRS = ['plans', 'ideas', 'bugs', 'researches', 'interviews', 'homeworks'];
const WIRING = ['.kaif/kaif.json', 'package.json', 'CLAUDE.md', 'AGENTS.md'];

for (const f of [...ROOT_DOCS, ...WIRING]) {
  if (exists(f)) pass(`есть ${f}`);
  else fail(`отсутствует или пуст: ${f}`);
}
for (const d of KNOWLEDGE_DIRS) {
  if (exists(`${d}/README.md`)) pass(`есть ${d}/README.md`);
  else fail(`отсутствует или пуст: ${d}/README.md`);
}

// --- 2. Плейсхолдеры KAIF не должны остаться незаполненными ---------------------
// Ищем только реальные плейсхолдеры из §11 ядра, а не любые угловые скобки:
// в прозе легально встречаются <дата>, <NN>, <имя> внутри шаблонов документов.
const PLACEHOLDERS = [
  'PROJECT_NAME', 'SHORT_NAME', 'AUTHOR', 'REPO_URL', 'LOCAL_PATH', 'LICENSE',
  'BUILD_COMMAND', 'TEST_HARNESS', 'COMMIT_COMMAND', 'YOUR AGENT/MODEL',
];
const placeholderRe = new RegExp(`<(${PLACEHOLDERS.map((p) => p.replace('/', '\\/')).join('|')})>`, 'g');

// Сканируем ТОЛЬКО то, что подлежало адаптации из шаблона.
// Не сканируем:
//   * директории знаний (bugs/, ideas/, interviews/, researches/, plans/, homeworks/) — это
//     артефакты работы; архивный журнал развёртывания законно хранит таблицу «плейсхолдер → значение»;
//   * GOAL.md — документ владельца, агент его не заполнял;
//   * EXPERIENCE.md — журнал уроков; в шаблоне плейсхолдеров нет, а записи законно их цитируют
//     (например, урок о том, как проверять, что плейсхолдеры заполнены).
const NOT_TEMPLATES = ['GOAL.md', 'EXPERIENCE.md'];

const skillFiles = existsSync('.claude/skills')
  ? readdirSync('.claude/skills', { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => `.claude/skills/${e.name}/SKILL.md`)
  : [];

const wrapperFiles = [
  ...ROOT_DOCS.filter((f) => !NOT_TEMPLATES.includes(f)),
  'CLAUDE.md', 'AGENTS.md',
  ...KNOWLEDGE_DIRS.map((d) => `${d}/README.md`),
  ...skillFiles,
].filter(exists);

let placeholderHits = 0;
for (const f of wrapperFiles) {
  const hits = [...read(f).matchAll(placeholderRe)].map((m) => m[0]);
  if (hits.length) {
    placeholderHits += hits.length;
    fail(`незаполненные плейсхолдеры в ${f}: ${[...new Set(hits)].join(', ')}`);
  }
}
if (!placeholderHits) pass(`плейсхолдеров не осталось (проверено ${wrapperFiles.length} файлов обёртки)`);

// --- 3. Скиллы: канонический name, локализованный description -------------------
const SKILLS_DIR = '.claude/skills';
const EXPECTED_SKILLS = [
  'resume', 'pause', 'autoloop', 'dayloop', 'nightloop', 'refresh-context', 'check-backlog',
  'experience', 'report-bug', 'bug-research', 'propose-idea', 'interview', 'revision',
  'fix-vision', 'what-next', 'help-kaif', 'release',
  'kaif-version', 'kaif-update', 'kaif-fork', 'kaif-switch-origin', 'kaif-remove',
  'fable-method', 'fable-loop', 'fable-judge', 'fable-domain',
];
const hasCyrillic = (s) => /[а-яёА-ЯЁ]/.test(s);

for (const skill of EXPECTED_SKILLS) {
  const p = `${SKILLS_DIR}/${skill}/SKILL.md`;
  if (!exists(p)) { fail(`отсутствует скилл: ${p}`); continue; }
  const text = read(p);

  const fm = text.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) { fail(`${p}: нет YAML-фронтматтера`); continue; }

  const name = (fm[1].match(/^name:\s*(.+)$/m) || [])[1]?.trim();
  const description = (fm[1].match(/^description:\s*([\s\S]*?)(?=\n\w+:|$)/m) || [])[1]?.trim();

  // name — это id слэш-команды. Он КАНОНИЧЕН: не переводится и обязан совпадать с именем папки.
  if (name !== skill) fail(`${p}: name «${name}» ≠ имени папки «${skill}» (name не переводится)`);
  else if (hasCyrillic(name)) fail(`${p}: name переведён на русский — это идентификатор /команды`);

  // description — то, по чему агент сопоставляет команду. Он ДОЛЖЕН быть локализован.
  if (!description) fail(`${p}: пустой description`);
  else if (!hasCyrillic(description)) fail(`${p}: description не локализован (нет кириллицы)`);
}
if (!errors.some((e) => e.includes(SKILLS_DIR))) pass(`все ${EXPECTED_SKILLS.length} скиллов корректны`);

// Лишние скиллы (например, забытые после anonymous-режима)
if (existsSync(SKILLS_DIR)) {
  const found = readdirSync(SKILLS_DIR, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  const extra = found.filter((s) => !EXPECTED_SKILLS.includes(s));
  if (extra.length) warn(`неизвестные скиллы в ${SKILLS_DIR}: ${extra.join(', ')}`);
}

// --- 4. Локализация ключевых документов -----------------------------------------
for (const f of ROOT_DOCS) {
  if (!exists(f)) continue;
  if (!hasCyrillic(read(f))) fail(`${f}: не локализован (нет кириллицы) — рабочий язык проекта русский`);
}

// --- 5. Маркер развёртывания -----------------------------------------------------
if (exists('.kaif/kaif.json')) {
  let marker;
  try { marker = JSON.parse(read('.kaif/kaif.json')); }
  catch { fail('.kaif/kaif.json: невалидный JSON'); }

  if (marker) {
    for (const field of ['framework', 'version', 'released', 'tracking', 'sphere']) {
      if (!marker[field]) fail(`.kaif/kaif.json: нет поля «${field}»`);
    }
    // Схема 1.4: строка «agent»; тонкая машинерия (пред-1.5): массив «agents».
    const agents = marker.agents ?? (marker.agent ? [marker.agent] : []);
    if (!Array.isArray(agents) || agents.length === 0) fail('.kaif/kaif.json: нет поля «agent»/«agents»');
    if (marker.framework !== 'KAIF') fail('.kaif/kaif.json: framework ≠ "KAIF"');
    if (!/^\d+\.\d+$/.test(marker.version ?? '')) fail('.kaif/kaif.json: версия должна быть MAJOR.MINOR');
    if (marker.tracking === 'anonymous' && marker.origin) fail('.kaif/kaif.json: anonymous-режим не должен содержать origin');
    if (marker.tracking === 'origin' && !marker.origin) fail('.kaif/kaif.json: tracking=origin, но поля origin нет');
    if (!errors.some((e) => e.startsWith('.kaif'))) pass(`маркер валиден: KAIF v${marker.version}, tracking=${marker.tracking}`);
  }
}

// --- 6. npm-хендлы kaif:* --------------------------------------------------------
if (exists('package.json')) {
  const pkg = JSON.parse(read('package.json'));
  const handles = Object.keys(pkg.scripts ?? {}).filter((s) => s.startsWith('kaif:'));
  if (handles.length < 2) fail('package.json: не добавлены хендлы kaif:* (минимум kaif:version и kaif:check)');
  else pass(`npm-хендлы: ${handles.join(', ')}`);
  if (!exists('tools/kaif.mjs')) fail('отсутствует tools/kaif.mjs — бэкенд хендлов kaif:*');
}

// --- 7. Инварианты, специфичные для NDim Space ------------------------------------
// Знание из версии 1.x выжато сюда: старого кода в проекте нет, а без этих документов
// его нельзя ни перенести, ни мигрировать данные.
const KNOWLEDGE_1X = [
  'researches/02_firestore_data_model_1x.md',   // источник миграции данных
  'researches/03_similarity_core_1x_source.md', // ядро похожести + матрица a…t
];
for (const f of KNOWLEDGE_1X) {
  if (exists(f)) pass(`знание из 1.x сохранено: ${f}`);
  else fail(`отсутствует ${f} — знание версии 1.x потеряно (архив: MikalaiKryvusha/ndim-old)`);
}

// Локальная копия истории 1.x. Не в git, но должна существовать на диске.
if (exists('.private/ndim-1.x-history.bundle')) pass('локальная копия истории 1.x на месте (.private/)');
else warn('нет .private/ndim-1.x-history.bundle — история 1.x только в приватном ndim-old');

// Старого кода в проекте быть не должно (решение владельца: чистый лист).
if (existsSync('legacy')) fail('каталог legacy/ вернулся — старого кода в проекте быть не должно');
else pass('старого кода в проекте нет');

// --- 8. Безопасность: секреты и ПДн не должны отслеживаться git ---------------------
// Репозиторий предназначен к публикации (interviews/001, В5). Однажды утечка уже случилась
// (bugs/01, bugs/03) — эта проверка не даёт ей повториться молча.
const SECRET_PATHS = [
  /(^|\/)\.private\//,
  /(^|\/)email_(list|blacklist)[^/]*\.txt$/,
  /\.(keystore|jks|pem)$/,
  /\.bundle$/,
  /(^|\/)\.env($|\.)/,
  // Ключ сервисного аккаунта: это ДОСТУП КО ВСЕЙ боевой базе в обход правил безопасности.
  // `.gitkeep` в той же папке отслеживать можно и нужно — папка должна существовать.
  /(^|\/)secrets\/(?!\.gitkeep$)/,
  /(^|\/)sa\.json$/,
  // Учётные данные OAuth-клиента Google. Консоль отдаёт их ФАЙЛОМ `client_secret_*.json`, и он
  // падает прямо в папку проекта — человек скачал и забыл (homeworks/07, 2026-07-12).
  /(^|\/)client_secret[^/]*\.json$/,
  /(^|\/)google\//,
];
try {
  const tracked = spawnSync('git', ['ls-files'], { encoding: 'utf8' });
  if (tracked.status === 0) {
    const leaks = tracked.stdout.split('\n').filter((f) => f && SECRET_PATHS.some((re) => re.test(f)));
    if (leaks.length) fail(`секреты или ПДн отслеживаются git: ${leaks.join(', ')}`);
    else pass('в git не отслеживается ни один файл с секретами или ПДн');
  }
} catch { warn('git недоступен — проверку на утечку секретов пропустил'); }

// --- Итог -------------------------------------------------------------------------
console.log(`\n✔ Проверок пройдено: ${ok.length}`);
for (const m of ok) console.log(`  ✓ ${m}`);

if (warnings.length) {
  console.log(`\n⚠ Предупреждений: ${warnings.length}`);
  for (const m of warnings) console.log(`  ⚠ ${m}`);
}

if (errors.length) {
  console.error(`\n✖ ОШИБОК: ${errors.length}`);
  for (const m of errors) console.error(`  ✖ ${m}`);
  console.error('\nРазвёртывание неполно. Исправь перечисленное и запусти проверку снова.');
  process.exit(1);
}

console.log('\n✅ KAIF развёрнут и адаптирован корректно.');
