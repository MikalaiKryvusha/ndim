#!/usr/bin/env node
/**
 * contour.mjs — ДВЕРЬ ПРОЕКТА В ГОТОВУЮ СТРАНИЦУ ВОПРОСОВ KAIF (`npm run review`).
 *
 * Переход — слово владельца «*Перейти сейчас, на этой неделе*» (интервью №093, В2 = Б, 2026-09-18) и
 * «*нужно все сделать*» (2026-09-26); план — `plans/100`. Страницу, запись ответов, очередь, звонок,
 * ожидатель и закрытие делает поставляемый генератор `.kaif/tools/contour/review.mjs` (контракт —
 * `.kaif/INTERACTIVE_CONTOUR_SPEC.md`). Эта обёртка добавляет ровно три вещи, которых у готового нет:
 *
 *   1. ГОЛОС ЕВГЕНИЯ. Готовая страница зовёт богатый голос через окружение (`KAIF_VOICE_TOOL`,
 *      `KAIF_VOICE`). Обёртка ставит их, когда окружение молчит: тракт Silero соседнего проекта KLAS
 *      (`F:\KLAS\tools\voice-say.mjs`, путь переопределяет `NDIM_VOICE_TOOL`) и голос `eugene` — выбор
 *      владельца слепым прослушиванием (интервью №011, В1 = Д). Интерфейс тракта совпадает с готовым:
 *      `node <тракт> <фраза> --play --voice <голос>`.
 *   2. ВОПРОС НЕ ОТСЫЛАЕТ НАРУЖУ. Слово владельца 2026-08-15: «*Пиши прямо в вопросе то, что
 *      предлагаешь взять. Я не собираюсь скролить этот длинный документ и искать „вон ту формулу“*».
 *      У готового генератора этой проверки нет, поэтому она идёт ЗДЕСЬ, до любого показа, до `--check`
 *      (проверка обязана говорить правду о том, откроется ли страница) и до постановки в очередь.
 *      Проверка — `lintSelfContained` из `tools/lib/review-core.mjs`, одна на старую и новую страницу.
 *   3. СТАРЫЕ СЛОВА. `open`, `list`, `queue`, `batch`, `close`, `render` и флаг `--no-signal` живут в
 *      истории проекта (EXPERIENCE, планы, эстафеты) — обёртка переводит их в флаги генератора, чтобы
 *      старая строка не звала владельца мимо страницы и не падала непонятно.
 *
 * Всё прочее — флаги, коды выхода (0 · 2 · 3 · 4 · 130) — генератора, без изменений.
 *
 *   npm run review -- interviews/<файл>.md          показать интервью (страница + звонок)
 *   npm run review -- interviews/<файл>.md --check  проверить форму, ничего не показывая
 *   npm run review -- --wait interviews/<файл>.md   ожидатель: будит агента на каждом ответе
 *   npm run review -- --queue --list                очередь владельца без браузера (выход 2 — есть ни разу не показанный)
 *   npm run review -- --call "<что нужно>"          позвать владельца без страницы
 *
 * Запуск: npm run review -- <аргументы генератора> · юнит: node --test tools/contour.test.mjs
 *
 * [TESTED: 2026-09-26 16:05 · ручной функциональный прогон 15/15 на дереве проекта — отказ «ссылка наружу» до генератора,
 *  показ, ответы по одному, ожидатель, сервер умер → ответ на компьютере → забран; qa/reports/2026-09-26_shipped-review-page.md.
 *  Голос Евгения и окно у владельца этим прогоном НЕ проверены (`--silent --no-open`) — их подтверждает интервью №106]
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { parseInterview, lintSelfContained } from './lib/review-core.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const GENERATOR = resolve(ROOT, '.kaif/tools/contour/review.mjs');
const KLAS_VOICE_TOOL = 'F:\\KLAS\\tools\\voice-say.mjs'; // машинный ресурс соседнего проекта, не путь внутри NDim
const OWNER_VOICE = 'eugene';                              // интервью №011, В1 = Д — менять может только владелец
const EXIT_REFUSED = 3;                                    // тот же код, что у предполёта генератора

/** Старое слово первой позиции → флаги генератора. */
const LEGACY_WORDS = {
  open: (doc) => [doc],
  list: () => ['--queue', '--list'],
  queue: (doc) => ['--enqueue', doc],
  batch: () => ['--queue'],
  close: (doc) => [doc, '--close'],
  render: (doc) => [doc, '--no-serve'],
};
/** Флаги генератора, при которых страница НЕ поднимается (показа нет — проверять нечего). */
const NO_SHOW_FLAGS = ['--no-serve', '--close', '--mark-shown', '--mark-implemented', '--mark-withdrawn', '--selftest',
  '--search', '--wait', '--call'];
/** Лица, у которых нет вопросов с вариантами: проверка «отсылка наружу» к ним не относится. */
const NON_INTERVIEW_FACES = ['--notice', '--proofread', '--mockup'];

/**
 * Переводит аргументы проекта в аргументы генератора: старое слово → флаги, `--no-signal` → `--silent`,
 * `--voice <имя>` → переменная `KAIF_VOICE` (у генератора голос — окружение, не флаг).
 */
export function translateArgs(argv) {
  let args = [...argv];
  let voice = null;
  const legacy = LEGACY_WORDS[args[0]];
  if (legacy) args = [...legacy(args[1]), ...args.slice(legacy.length ? 2 : 1)]; // слово с документом съедает два аргумента, без — один
  args = args.map((a) => (a === '--no-signal' ? '--silent' : a));
  const v = args.indexOf('--voice');
  if (v >= 0) { voice = args[v + 1] ?? null; args.splice(v, 2); }
  return { args, voice };
}

/** Окружение для генератора: голос владельца, если машина его не задала сама. */
export function voiceEnv(env, voice = null) {
  const out = { ...env };
  const tool = env.KAIF_VOICE_TOOL || env.NDIM_VOICE_TOOL || KLAS_VOICE_TOOL;
  if (!env.KAIF_VOICE_TOOL && existsSync(tool)) out.KAIF_VOICE_TOOL = tool;
  out.KAIF_VOICE = voice || env.KAIF_VOICE || env.NDIM_VOICE || OWNER_VOICE;
  return out;
}

/** Какие документы увидит владелец, если выполнить эти аргументы (пусто — показа нет). */
export async function docsToLint(args, root = ROOT) {
  if (args.some((a) => NON_INTERVIEW_FACES.includes(a))) return [];
  if (args.includes('--queue')) {
    if (args.includes('--list')) return [];
    const { pendingDocs } = await import(pathToFileURL(GENERATOR).href);
    return pendingDocs(root).map((d) => d.doc);
  }
  const enq = args.indexOf('--enqueue');
  if (enq >= 0) return args[enq + 1] ? [args[enq + 1]] : [];
  if (args.some((a) => NO_SHOW_FLAGS.includes(a))) return [];
  return args.filter((a, i) => !a.startsWith('--') && !(i > 0 && ['--timeout', '--transport', '--where', '--why', '--owner-word'].includes(args[i - 1])) && /\.md$/i.test(a));
}

/** Вопросы документа, которые отсылают за своим содержимым наружу: `[{ doc, label, line, text }]`. */
export function outwardRefs(docs, root = ROOT) {
  const bad = [];
  for (const doc of docs) {
    const abs = resolve(root, doc);
    if (!existsSync(abs)) continue; // несуществующий документ генератор назовёт сам
    const text = readFileSync(abs, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    for (const b of lintSelfContained(parseInterview(abs, text), text)) bad.push({ doc: relative(root, abs).split('\\').join('/'), ...b });
  }
  return bad;
}

async function main() {
  const { args, voice } = translateArgs(process.argv.slice(2));
  const bad = outwardRefs(await docsToLint(args));
  if (bad.length) {
    console.error('\n⛔ СТРАНИЦА НЕ ПОДНЯТА (код 3): вопрос отсылает за своим содержимым НАРУЖУ.\n');
    for (const b of bad) console.error('   ' + b.doc + ':' + b.line + ' · ' + b.label + '\n      ' + b.text);
    console.error('\n   Слово владельца, ради которого стоит проверка: «Пиши прямо в вопросе то, что предлагаешь взять.\n' +
      '   Я не собираюсь скролить этот длинный документ и искать „вон ту формулу“».\n' +
      '   Лечение: перенеси текст ВНУТРЬ вопроса. Законную отсылку объяви в строке: <!-- ССЫЛКА-ОК: причина -->\n');
    process.exit(EXIT_REFUSED);
  }
  const child = spawn(process.execPath, [GENERATOR, ...args], { cwd: ROOT, stdio: 'inherit', env: voiceEnv(process.env, voice) });
  process.on('SIGINT', () => {}); // Ctrl+C получает и генератор: ждём, пока он закончит сам и назовёт исход (код 130)
  child.on('error', (e) => { console.error('генератор не запустился: ' + e.message); process.exit(1); });
  child.on('exit', (code, signal) => process.exit(code ?? (signal ? 130 : 1)));
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] || '')).href) main();
