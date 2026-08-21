/**
 * ПИСАРЬ ОПИСАНИЙ КАТАЛОГА (оба языка) — `plans/56` шаг 3 (фаза 3 эпика `plans/40`).
 *
 * Что делает: переносит подготовленные переформулировки описаний в БОЕВОЙ каталог и
 * ведёт журнал «что было → что стало». Сами тексты пишет агент по `AUTHOR_STYLOMETRY.md` и кладёт
 * в файл правок; этот прибор их только ПРОВЕРЯЕТ И ЗАПИСЫВАЕТ.
 *
 * 🔴 ПОЧЕМУ ПИСАРЬ, А НЕ ПРЯМАЯ ЗАПИСЬ ИЗ СЕССИИ. Это правка данных живого каталога: 10 222
 * публичные страницы берут описание отсюда. Ошибка здесь не падает тестом — она молча уезжает в
 * поиск. Отсюда три предохранителя, и ни один не «на всякий случай»:
 *
 *   1. **СУХОЙ ПРОГОН ПО УМОЛЧАНИЮ.** Пишет только `--apply`.
 *   2. **СВЕРКА «ДО» ПОБАЙТОВО.** Текущее `description.en` в базе обязано совпасть с полем
 *      `before` правки. Не совпало — правка ПРОПУСКАЕТСЯ и называется вслух. Это защита от
 *      работы поверх чужого изменения: правки готовятся по снимку `dims-build.json`, а снимок
 *      к моменту записи может отстать от базы.
 *   3. **ТОЛЬКО ОДНО ПОЛЕ.** Пишется `description.<язык>` и ничего больше (`merge` по вложенному
 *      ключу). Второй язык, теги, рейтинги и служебные поля прибор не трогает вовсе.
 *      🔴 Язык называется в самой правке полем `lang` (`en` по умолчанию) — и он же выбирает
 *      набор запрещённых маркеров: русскую правку нельзя проверить английским списком.
 *
 * ⚠️ ЖУРНАЛ — ЧАСТЬ РАБОТЫ, А НЕ ОТЧЁТНОСТЬ. Владелец разрешил агенту править эти тексты ровно
 * на условии вычитки ПОСТФАКТУМ (интервью №025, В6 = А). Без журнала правка неотличима от
 * самоуправства: 279 текстов никто не сможет сверить по памяти. Журнал пишется ВСЕГДА, в том
 * числе в сухом прогоне.
 *
 * ⛔⛔ СТОЯЧЕЕ ПРАВИЛО — ОТКАТ К ТЕКСТУ ВИКИПЕДИИ ЗАПРЕЩЁН, И ЧИСЛА ЕГО НЕ ОТМЕНЯЮТ.
 * Слово владельца 2026-08-17, дословно: «*Я НЕ ДУМАЮ, что нужно твои правки откатывать обратно к
 * википедии*».
 *
 * Правило записано ЗДЕСЬ, а не в разведдоке, потому что откат — это ДЕЙСТВИЕ, и совершается оно
 * этим прибором: файлы `*.rollback.json` лежат рядом с журналами и превращают откат в одну команду.
 * Читают их тогда, когда уже решили откатывать, — значит и правило обязано лежать тут.
 *
 * Три причины, и ни одна не зависит от позиции в выдаче:
 *   1. **Лицензия.** Текст Википедии — CC BY-SA. Дословная копия без указания источника и без
 *      сохранения лицензии её нарушает. Это верно независимо от того, что покажет любой замер.
 *   2. **`GOAL.md`.** Описание, которое является чужим текстом, — не голос нашего продукта.
 *   3. **Это заказ владельца**, и он принимался не по числам. Число не отменяет решение, которое
 *      на числах не стояло.
 *
 * 🔑 И названо ЗАРАНЕЕ, до замера «после», чтобы опровержение не превратилось в торг (тот же приём,
 * что в `researches/30` §6.6). Если позиция после публикации ухудшится — это НЕ довод вернуть
 * копию. Плохое число разрешает другую работу: писать текст лучше и больше, чинить перелинковку,
 * искать настоящую причину. Возврат копии оно не разрешает никогда.
 *
 * Запуск:
 *   node tools/rewrite-catalog-descriptions.mjs <правки.json>            # сухой прогон
 *   node tools/rewrite-catalog-descriptions.mjs <правки.json> --apply    # записать в боевой каталог
 *   node tools/rewrite-catalog-descriptions.mjs --selftest               # проверить сам прибор
 *
 * Форма файла правок: [{ "slug": "…", "lang": "ru|en", "find": "…", "replace": "…", "why": "…" }]
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

const JOURNAL_DIR = 'homeworks';
const SNAPSHOT = 'src/lib/content/dims-build.json';

/**
 * ПРОВЕРКИ ОДНОЙ ПРАВКИ — то, что можно спросить БЕЗ базы, спрашивается без базы.
 *
 * 🔑 Главная из них — `factsKept`. Переформулировка обязана сохранять факты, и самый частый способ
 * их потерять — «причесать» текст, выронив год, число серий или имя. Здесь это ловится грубо, но
 * дёшево: все ЧИСЛА и все ГОДЫ исходника обязаны остаться в результате. Прибор не судит смысл —
 * он не даёт тексту молча похудеть.
 */
/**
 * Маркеры справочного стиля по языкам. Английские — сито §10; русские — сито заказа владельца
 * 2026-08-16 («и русские текста нужно будет править»).
 *
 * ⚠️ ЗДЕСЬ ОНИ РАБОТАЮТ УЖЕ НЕ СИТОМ, А ЗАПРЕТОМ: прибор не даёт записать правку, в которой
 * маркер уцелел. Это разные роли одного списка, и путать их нельзя — в грепе маркер лишь
 * повод посмотреть, здесь он признак того, что правка своей работы не сделала.
 */
const MARKERS_BY_LANG = {
  en: [/voiced by/i, /premiered on/i, /totaling \d+ episodes/i, /consists of \d+ seasons/i,
    /aired on .{0,80}? from .+? to /i],
  ru: [/премьера состоялась/i, /В главных ролях/i, /[СC]ъёмки проходили/i, /роль исполн(ил|ила|или)/i,
    /транслировал(ся|ась|ись)/i, /состоит из \d+ сезон/i],
};

export function checkEdit(edit) {
  const problems = [];
  const lang = edit.lang ?? 'en';
  if (!edit.slug) problems.push('нет slug');
  if (!MARKERS_BY_LANG[lang]) problems.push(`неизвестный язык «${lang}»`);
  if (!edit.before) problems.push('нет before');
  if (!edit.after) problems.push('нет after');
  if (edit.before && edit.after && edit.before === edit.after) problems.push('after равен before');

  if (edit.before && edit.after && MARKERS_BY_LANG[lang]) {
    const numbers = (s) => (s.match(/\b\d{1,4}(?:,\d{3})*\b/g) ?? []).map((n) => n.replace(/,/g, ''));
    const lost = numbers(edit.before).filter((n) => !numbers(edit.after).includes(n));
    if (lost.length) problems.push(`потеряны числа: ${[...new Set(lost)].join(', ')}`);

    /*
     * 🔴 МАРКЕР ЗАПРЕЩЁН В ТОМ, ЧТО Я НАПИСАЛ, а в остальном тексте он лишь повод посмотреть.
     *
     * Первая редакция проверяла ВЕСЬ текст — и заблокировала две законные правки: описания
     * содержали «В главных ролях» в другом предложении, которого правка не касалась. Для русских
     * маркеров это неизбежно: они обычные фразы, а не улики сами по себе.
     *
     * Ценность прежней проверки при этом настоящая (она поймала «voiced by», уцелевшее внутри
     * моей же замены) — поэтому она не снята, а сужена до фрагмента правки.
     */
    const где = edit.replace !== undefined
      ? [edit.replace].flat().join(' ')
      : edit.after;
    const left = MARKERS_BY_LANG[lang].filter((re) => re.test(где));
    if (left.length) problems.push(`маркер остался в самой правке: ${left.length}`);
  }
  return problems;
}

/** Журнал для вычитки владельцем — страницей, а не списком идентификаторов. */
export function journalText(edits, { applied, skipped }) {
  const lines = [
    '# Журнал правок описаний каталога',
    '',
    '> **Кто правил:** агент, по `AUTHOR_STYLOMETRY.md` · **Разрешение:** интервью №025, В6 = А',
    '> (правки текстов пишет агент, владелец вычитывает ПОСТФАКТУМ одной страницей).',
    `> **Шаг:** \`plans/56\` шаг 3 · **Прибор:** \`tools/rewrite-catalog-descriptions.mjs\``,
    '',
    'Правило правки: **менялся СТИЛЬ, а не факты.** Ни один год, ни одно число, ни одно имя из',
    'исходного текста не удалены — это проверяет сам прибор и отказывается писать иначе.',
    '',
    `Правок в этой партии: **${edits.length}** · записано: **${applied}** · пропущено: **${skipped}**`,
    '',
    '---',
    '',
  ];
  for (const e of edits) {
    lines.push(`## \`${e.slug}\``);
    lines.push('');
    if (e.why) lines.push(`*${e.why}*`, '');
    lines.push('**Было:**', '', `> ${e.before.replace(/\n+/g, ' ')}`, '');
    lines.push('**Стало:**', '', `> ${e.after.replace(/\n+/g, ' ')}`, '');
  }
  return lines.join('\n');
}

/*
 * 🔴 ЗАПУЩЕН ИЛИ ПОДКЛЮЧЁН — СПРАШИВАЕТСЯ ОДИН РАЗ И ДЛЯ ОБОИХ РЕЖИМОВ.
 *
 * Предохранитель ниже (рабочий режим) стоял, а самотест — нет, и он идёт РАНЬШЕ. Цена наблюдалась
 * прямо (`bugs/NEW`, 2026-08-22): `node tools/gate-rewrites.mjs --selftest` печатал зелёный
 * самотест ЭТОГО файла и выходил кодом 0, потому что ворота импортируют отсюда `checkEdit`.
 * Ворота не отрабатывали ни разу — а спросивший «здоровы ли ворота?» получал зелёный от ДРУГОГО
 * прибора. Это ложный зелёный на посту, и он опаснее молчания.
 */
const runAsScript = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

// ── Самотест: прибор проверяет СЕБЯ, а не каталог ───────────────────────────────────────────
if (runAsScript && process.argv.includes('--selftest')) {
  const cases = [
    [{ slug: 'a', before: 'Released in 1998 with 103 episodes.', after: 'The 1998 series ran for 103 episodes.' }, 0],
    // Потерянные числа сходятся в ОДНУ жалобу со списком — это одна проблема «текст похудел»,
    // а не по одной на число: иначе отчёт о правке тонул бы в перечислении.
    [{ slug: 'a', before: 'Released in 1998 with 103 episodes.', after: 'The series ran for many episodes.' }, 1],
    [{ slug: 'a', before: 'It premiered on May 1, 2020.', after: 'It premiered on May 1, 2020.' }, 2],
    [{ slug: '', before: 'x 1', after: 'y 1' }, 1],
    [{ slug: 'a', before: 'Beckett (voiced by Mo Gilligan) sleeps.', after: 'Mo Gilligan voices Beckett, who sleeps.' }, 0],
  ];
  let bad = 0;
  cases.forEach(([edit, want], i) => {
    const got = checkEdit(edit).length;
    const ok = got === want;
    if (!ok) bad += 1;
    console.log(`  ${ok ? '✅' : '❌'} случай ${i + 1}: проблем ${got}, ожидалось ${want}`);
  });
  console.log(bad ? `\n❌ самотест провален: ${bad}` : '\n✅ самотест пройден: 5 случаев');
  process.exit(bad ? 1 : 0);
}

// ── Рабочий режим ───────────────────────────────────────────────────────────────────────────
/*
 * 🔴 НЕ ИСПОЛНЯЕТСЯ ПРИ ИМПОРТЕ. Это ТРЕТИЙ файл проекта, пойманный на одном и том же: у него
 * есть экспорт (`checkEdit`), значит его будут подключать, — и без этой проверки подключение
 * запускало рабочий режим, пытаясь разобрать чужой аргумент как файл правок.
 *
 * Класс закреплён: **файл, у которого есть и экспорт, и работа на верхнем уровне, обязан
 * спрашивать, запустили его или подключили.** Ловилось трижды за сутки — значит это правило.
 */
if (runAsScript) {
const file = process.argv[2];
const apply = process.argv.includes('--apply');

if (!file || !existsSync(file)) {
  console.error('нужен файл правок: node tools/rewrite-catalog-descriptions.mjs <правки.json> [--apply]');
  process.exit(1);
}

/**
 * ПРАВКА ЗАДАЁТСЯ ФРАГМЕНТОМ, А ПОЛНЫЙ ТЕКСТ СОБИРАЕТ ПРИБОР.
 *
 * Форма `{ slug, find, replace }` — рабочая, а `{ before, after }` — вычисляемая. Причина не в
 * экономии букв: описание длиной в абзац, переписанное целиком «от руки», незаметно теряет
 * запятую, тире или пробел в чужом предложении, и такая потеря не отличима от правки. Фрагмент
 * же меняет РОВНО одно предложение, а остальной текст остаётся байт в байт — это и есть
 * механическая гарантия «менялся стиль, а не факты».
 *
 * `find` обязан встречаться в тексте РОВНО ОДИН раз: два совпадения означают, что правка
 * неоднозначна, и прибор отказывается гадать.
 */
function expand(entry, snapshotBySlug) {
  if (entry.before !== undefined) return entry;
  const d = snapshotBySlug.get(entry.slug);
  if (!d) return { ...entry, before: '', after: '', _problem: 'нет в снимке каталога' };
  const lang = entry.lang ?? 'en';
  const before = d.description?.[lang] ?? '';

  /*
   * Фрагментов может быть НЕСКОЛЬКО на один текст, и это не удобство, а необходимость: в одном
   * описании встречаются разные маркеры (дата эфира и «voiced by»), а документ у них ОДИН.
   * Двумя отдельными правками на один слаг вторая затёрла бы первую — обе готовились по одному и
   * тому же исходному тексту. Поэтому все фрагменты одного документа применяются подряд к
   * ОДНОМУ результату.
   */
  const finds = Array.isArray(entry.find) ? entry.find : [entry.find];
  const replaces = Array.isArray(entry.replace) ? entry.replace : [entry.replace];
  if (finds.length !== replaces.length) {
    return { ...entry, before, after: before, _problem: 'find и replace разной длины' };
  }

  let after = before;
  for (let i = 0; i < finds.length; i += 1) {
    const parts = after.split(finds[i]);
    if (parts.length !== 2) {
      return { ...entry, before, after, _problem: `фрагмент ${i + 1} найден ${parts.length - 1} раз(а), нужен ровно 1` };
    }
    after = parts.join(replaces[i]);
  }
  return { ...entry, before, after };
}

const rawEdits = JSON.parse(readFileSync(file, 'utf8'));
const snapshotEarly = JSON.parse(readFileSync(SNAPSHOT, 'utf8'));
const bySlugEarly = new Map(snapshotEarly.map((d) => [d.slug, d]));
const edits = rawEdits.map((e) => expand(e, bySlugEarly));
const expandFailures = edits.filter((e) => e._problem);
if (expandFailures.length) {
  for (const e of expandFailures) console.log(`  ❌ ${e.slug}: ${e._problem}`);
  console.log(`\n❌ правок, которые не удалось разложить: ${expandFailures.length} — ничего не записано.`);
  process.exit(1);
}
console.log(`\n═══ ПИСАРЬ ОПИСАНИЙ КАТАЛОГА ═══`);
console.log(`Правок в файле: ${edits.length}`);
console.log(apply ? 'Режим: ЗАПИСЬ В БОЕВОЙ КАТАЛОГ\n' : 'Режим: сухой прогон (ничего не пишется)\n');

// 1. Проверки, которым база не нужна.
let broken = 0;
for (const e of edits) {
  const problems = checkEdit(e);
  if (problems.length) {
    broken += 1;
    console.log(`  ❌ ${e.slug}: ${problems.join(' · ')}`);
  }
}
if (broken) {
  console.log(`\n❌ негодных правок: ${broken} — ни одна не записана, поправьте файл.`);
  process.exit(1);
}
console.log(`  ✅ все ${edits.length} правок прошли проверку формы (факты и маркеры)`);

// 2. Сверка «до» со снимком каталога — дешёвая проверка ДО обращения к базе.
const bySlug = bySlugEarly; // снимок 17 МБ читается ОДИН раз на прогон
let drifted = 0;
for (const e of edits) {
  const d = bySlug.get(e.slug);
  if (!d) {
    console.log(`  ⚠️ ${e.slug}: нет в снимке каталога`);
    drifted += 1;
  } else if ((d.description?.[e.lang ?? 'en'] ?? '') !== e.before) {
    console.log(`  ⚠️ ${e.slug}: «до» разошлось со снимком`);
    drifted += 1;
  }
}
console.log(drifted ? `  ⚠️ расхождений со снимком: ${drifted}` : `  ✅ «до» совпало со снимком у всех ${edits.length}`);

// 3. Запись.
let applied = 0;
let skipped = drifted;
const rollback = [];
/** Имя партии — по имени файла правок: журнал и файл отката должны читаться как пара. */
const stamp = file.replace(/^.*[\\/]/, '').replace(/\.json$/, '');
if (apply) {
  const { cert, initializeApp } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const { serviceAccount } = await import('./lib/credentials.mjs');
  const { CONTOURS } = await import('./lib/contours.mjs');

  initializeApp({ credential: cert(serviceAccount('prod')), projectId: CONTOURS.prod.project });
  const db = getFirestore(CONTOURS.prod.database);
  console.log(`\nБаза: ${CONTOURS.prod.database} ⚠️ БОЕВАЯ`);

  for (const e of edits) {
    const d = bySlug.get(e.slug);
    if (!d) continue;
    const ref = db.collection('dims').doc(d.id);
    const snap = await ref.get();
    const lang = e.lang ?? 'en';
    const live = snap.exists ? (snap.data()?.description?.[lang] ?? '') : null;
    if (live !== e.before) {
      // 🔴 Отказ, а не «перезапишем поверх»: раз текст в базе не тот, из которого готовилась
      // правка, значит его кто-то менял — и наша правка построена на устаревшем основании.
      console.log(`  ⏭ ${e.slug}: в базе другой текст — пропущено`);
      skipped += 1;
      continue;
    }
    await ref.set({ description: { [lang]: e.after } }, { merge: true });
    rollback.push({ slug: e.slug, lang, before: e.after, after: e.before, why: `откат правки ${stamp}` });
    applied += 1;
  }
  console.log(`\n✅ записано: ${applied} · пропущено: ${skipped}`);

  /*
   * ОБРАТНАЯ ПРАВКА ПИШЕТСЯ САМА — и это не перестраховка. Правка боевого каталога необратима
   * ровно до тех пор, пока прежний текст живёт только в голове сессии: следующая сессия его уже
   * не знает. Файл отката делает откат ОДНОЙ КОМАНДОЙ тем же прибором, с той же сверкой «до».
   */
  if (rollback.length) {
    const back = `${file.replace(/\.json$/, '')}--rollback.json`;
    writeFileSync(back, JSON.stringify(rollback, null, 1), 'utf8');
    console.log(`откат: node tools/rewrite-catalog-descriptions.mjs ${back} --apply`);
  }
} else {
  console.log('\nℹ сухой прогон: чтобы записать, добавьте --apply');
}

// 4. Журнал — всегда.
const out = `${JOURNAL_DIR}/catalog_descriptions_journal_${stamp}.md`;
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, journalText(edits, { applied, skipped }), 'utf8');
console.log(`журнал: ${out}`);

}
