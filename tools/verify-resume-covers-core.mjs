#!/usr/bin/env node
/**
 * СТРАЖ ВХОДА В СЕССИЮ — `/resume` ОБЯЗАН ОТКРЫВАТЬ ВСЁ ЯДРО ПЕРЕЧИТЫВАНИЯ.
 *
 * ЗАЧЕМ. `AGENT_GUIDE.md` → «Таксономия документов», ярус 1 объявляет ядро перечитывания
 * (девять документов) и прямо пишет: «`/resume` читает полный набор». Это утверждение
 * ПРОВЕРЯЛОСЬ ТОЛЬКО ЧТЕНИЕМ — и оказалось неправдой.
 *
 * 🔴 ЦЕНА, ОПЛАЧЕННАЯ 2026-09-09. Наша копия скилла открывала ПЯТЬ документов из девяти.
 * Методологии тестирования среди них не было. Сессия честно прошла ритуал, доложила владельцу
 * «канон перечитан целиком» — и `TESTING_FRAMEWORK.md` не открыла ни разу; следом она
 * «протестировала» работу приоритета 0 двумя прогонами одного прибора, без тест-плана, кейсов,
 * чек-листа и отчёта. Слова владельца: «*из этой таблицы я вижу, что ТЕСТИРОВАНИЯ НЕ БЫЛО*»
 * и «*вопиюще возмутительно*». Замер того же часа: соседний проект на ТОМ ЖЕ KAIF 2.5
 * открывает одиннадцать документов — расхождение накопила наша копия, и не заметил его никто.
 *
 * 🔑 ПОЧЕМУ СТРАЖ, А НЕ ЗАПИСЬ. Ровно этот дефект — «пара истина ↔ зеркало без команды
 * проверки» (`AGENT_GUIDE.md` → «Реестр пар»): ядро объявлено в одном месте, читающий список
 * живёт в другом, и разъехаться они могут молча. Пара без однострочной команды — не пара,
 * а обещание.
 *
 * ЧТО СУДИТСЯ. Множество документов ядра из `AGENT_GUIDE.md` против множества документов,
 * которые `/resume` велит прочитать. Красное — документ ядра, которого в списке нет.
 * Лишний документ в списке нарушением НЕ является: скилл вправе добавлять своё
 * (`EXPERIENCE.md`, карты) — ядро задаёт ПОЛ, а не потолок.
 *
 * Запуск:  node tools/verify-resume-covers-core.mjs [--selftest]
 * Ворота: `npm run guards` (запись «вход в сессию открывает ядро перечитывания целиком»);
 *         страж дешёвый — читает два файла, ни стенда, ни сети.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Корень судимого дерева. По умолчанию — свой проект; `--root <путь>` даёт юниту судить
 * дерево-КОПИЮ, не трогая рабочее (мутация в рабочем дереве ломает соседние прогоны и остаётся
 * следом при падении).
 */
const rootFlag = process.argv.indexOf('--root');
const ROOT = rootFlag === -1
  ? resolve(dirname(fileURLToPath(import.meta.url)), '..')
  : resolve(process.argv[rootFlag + 1]);

const GUIDE = 'AGENT_GUIDE.md';
const SKILL = '.claude/skills/resume/SKILL.md';

/**
 * Ядро перечитывания — из объявления яруса 1 таксономии.
 *
 * Границы окна названы текстом самого объявления, а не номерами строк: номера уезжают при
 * первой же правке документа, и страж молча начал бы судить пустоту.
 */
export function coreDocsFrom(guideText) {
  const from = guideText.indexOf('ядро перечитывания.');
  const to = guideText.indexOf('Главные документы ссылаются', from);
  if (from === -1 || to === -1) return { ok: false, docs: [], why: 'объявление ядра не найдено — поправь границы стража' };
  const window = guideText.slice(from, to);
  const docs = [...new Set([...window.matchAll(/`([A-Z_]+\.md)`/g)].map((m) => m[1]))];
  return { ok: docs.length > 0, docs, why: docs.length > 0 ? '' : 'в объявлении ядра не названо ни одного документа' };
}

/**
 * Что `/resume` велит прочитать: пункты-списки вида «- `ДОКУМЕНТ.md` — …» из шага 1.
 *
 * ⚠️ Окно — до заголовка шага 2: ниже скилл законно УПОМИНАЕТ документы, не веля их читать
 * (`PROJECT_HISTORY.md` там прямо назван как НЕ входящий в набор). Судить весь файл значило бы
 * засчитывать упоминание за чтение — ложный зелёный ровно того класса, ради которого страж и
 * заведён.
 */
export function skillReadsFrom(skillText) {
  const from = skillText.indexOf('## Шаг 1.');
  const to = skillText.indexOf('## Шаг 2.', from);
  if (from === -1) return { ok: false, docs: [], why: 'шаг 1 скилла не найден — поправь границы стража' };
  const window = skillText.slice(from, to === -1 ? undefined : to);
  const docs = [...new Set([...window.matchAll(/^-\s+`([A-Z_]+\.md)`/gm)].map((m) => m[1]))];
  return { ok: true, docs, why: '' };
}

/** Вердикт: какие документы ядра скилл не открывает. */
export function judge(guideText, skillText) {
  const core = coreDocsFrom(guideText);
  const reads = skillReadsFrom(skillText);
  if (!core.ok) return { ok: false, missing: [], broken: core.why };
  if (!reads.ok) return { ok: false, missing: [], broken: reads.why };
  const missing = core.docs.filter((d) => !reads.docs.includes(d));
  return { ok: missing.length === 0, missing, broken: '', core: core.docs, reads: reads.docs };
}

function selftest() {
  const GUIDE_OK = 'ядро перечитывания. Набор: `GOAL.md` · `STATUS.md` · `PHILOSOPHY.md`. Главные документы ссылаются на прочее.';
  const cases = [
    {
      what: 'все документы ядра в списке — зелено',
      guide: GUIDE_OK,
      skill: '## Шаг 1. Читай\n\n- `STATUS.md` — сводка\n- `GOAL.md` — видение\n- `PHILOSOPHY.md` — простота\n\n## Шаг 2. Дальше',
      expect: true,
    },
    {
      what: 'документ ядра пропущен — красное, и он назван',
      guide: GUIDE_OK,
      skill: '## Шаг 1. Читай\n\n- `STATUS.md` — сводка\n- `GOAL.md` — видение\n\n## Шаг 2. Дальше',
      expect: false,
      names: ['PHILOSOPHY.md'],
    },
    {
      what: 'лишний документ сверх ядра нарушением не считается',
      guide: GUIDE_OK,
      skill: '## Шаг 1. Читай\n\n- `STATUS.md`\n- `GOAL.md`\n- `PHILOSOPHY.md`\n- `EXPERIENCE.md`\n\n## Шаг 2.',
      expect: true,
    },
    {
      what: 'УПОМИНАНИЕ ниже шага 1 за чтение не засчитывается',
      guide: GUIDE_OK,
      skill: '## Шаг 1. Читай\n\n- `STATUS.md`\n- `GOAL.md`\n\n## Шаг 2. Синтезируй\n\n- `PHILOSOPHY.md` — тут только упомянут',
      expect: false,
      names: ['PHILOSOPHY.md'],
    },
    {
      what: 'документ, названный в прозе шага 1, а не пунктом, чтением не считается',
      guide: GUIDE_OK,
      skill: '## Шаг 1. Читай\n\nЗаодно держи в уме `PHILOSOPHY.md`.\n\n- `STATUS.md`\n- `GOAL.md`\n\n## Шаг 2.',
      expect: false,
      names: ['PHILOSOPHY.md'],
    },
    {
      what: 'сломанное объявление ядра — красное, а не пустой зелёный',
      guide: 'тут вообще нет объявления',
      skill: '## Шаг 1.\n\n- `STATUS.md`\n\n## Шаг 2.',
      expect: false,
    },
  ];
  let bad = 0;
  for (const c of cases) {
    const v = judge(c.guide, c.skill);
    const ok = v.ok === c.expect && (c.names === undefined || c.names.every((n) => v.missing.includes(n)));
    if (!ok) bad += 1;
    console.log(`  ${ok ? '✅' : '❌'} ${c.what}`);
  }
  console.log(bad === 0 ? `\n✅ САМОТЕСТ ЧИСТ: случаев ${cases.length}` : `\n🔴 САМОТЕСТ КРАСНЫЙ: провалов ${bad}`);
  return bad === 0 ? 0 : 1;
}

function main() {
  if (process.argv.includes('--selftest')) process.exit(selftest());

  const verdict = judge(readFileSync(resolve(ROOT, GUIDE), 'utf8'), readFileSync(resolve(ROOT, SKILL), 'utf8'));
  if (verdict.broken !== '') {
    console.error(`🔴 ПРИБОР СЛЕП: ${verdict.broken}`);
    process.exit(1);
  }
  console.log(`ядро перечитывания: ${verdict.core.length} · открывает /resume: ${verdict.reads.length}`);
  if (!verdict.ok) {
    console.error(`\n🔴 /resume НЕ ОТКРЫВАЕТ ДОКУМЕНТЫ ЯДРА: ${verdict.missing.join(' · ')}`);
    console.error(`   Сессия войдёт в работу без них и доложит «канон перечитан». Впиши их в ${SKILL}, шаг 1.`);
    process.exit(1);
  }
  console.log('✅ вход в сессию открывает ядро целиком');

}

/**
 * ПРЕДОХРАНИТЕЛЬ «ЗАПУЩЕН ИЛИ ПОДКЛЮЧЁН» (`ideas/43`, класс `EXP-0188`). Без него `import` этого
 * файла исполнял бы прогон и звал `process.exit()` — юнит умирал бы до первого утверждения, а
 * `node --test` засчитывал бы его пройденным.
 */
const ЗАПУЩЕН_НАПРЯМУЮ = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;

if (ЗАПУЩЕН_НАПРЯМУЮ) main();
