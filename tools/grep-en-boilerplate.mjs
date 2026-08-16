/**
 * ГРЕП EN-КАТАЛОГА ПО МАРКЕРАМ СПРАВОЧНОГО СТИЛЯ — `plans/41`, шаг 4 (эпик `plans/40`, фаза 1).
 *
 * Зачем: §10 `researches/34` нашёл единственный паттерн, где генерация описаний прилипала к
 * Википедии, — справочные обороты дат эфира и производственных фактов. Этот скрипт находит ВСЕХ
 * кандидатов по пяти маркерам плана (список маркеров живёт ЗДЕСЬ, в файле, не в argv).
 *
 * 🔴 ДАННЫЕ НЕ МЕНЯЮТСЯ: выход — только список кандидатов
 * `researches/34_en_boilerplate_candidates.md`. Переформулировка — фаза 3 эпика, по ответу
 * владельца (интервью №025, В6 = А: опоры и правки текстов пишет агент по портрету).
 *
 * Контроль (plans/41): «Гадкие американцы» (`ugly-americans-zgji6eoe`) обязан попасть в список —
 * известный положительный случай из §10. Не попал — скрипт слеп, падать громко (`EXP-0082`).
 *
 * Запуск:  node tools/grep-en-boilerplate.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';

const SRC = 'src/lib/content/dims-build.json';
const OUT = 'researches/34_en_boilerplate_candidates.md';
/**
 * КОНТРОЛЬНЫЙ СЛУЧАЙ — известный положительный, на котором прибор доказывает, что он не ослеп.
 *
 * 🔄 СМЕНЁН 2026-08-16: здесь стояли «Гадкие американцы» (`ugly-americans-zgji6eoe`) — случай
 * §10 `researches/34`. Фаза 3 его ВЫЛЕЧИЛА (`plans/56` шаг 3, партия 1), и прибор честно упал:
 * контроль искал маркер там, где маркера больше нет.
 *
 * 🔑 Урок класса, а не про этот файл: **контроль, привязанный к дефекту, умирает вместе с
 * дефектом.** Такое падение — не поломка и не повод снять проверку; повод перевесить контроль на
 * ЖИВОЙ положительный случай и записать, почему прежний ушёл. Снять проверку значило бы отдать
 * будущие числа слепому грепу.
 */
const CONTROL_SLUG = 'rick-and-morty-qithkcea';

/** Пять маркеров плана — справочные обороты, которыми пишет Википедия, а не рассказчик. */
const MARKERS = [
  { имя: 'aired on … from … to', re: /aired on .{0,80}? from .+? to /i },
  { имя: 'totaling N episodes', re: /totaling \d+ episodes/i },
  { имя: 'voiced by', re: /voiced by/i },
  { имя: 'premiered on', re: /premiered on/i },
  { имя: 'consists of N seasons', re: /consists of \d+ seasons/i },
];

const dims = JSON.parse(readFileSync(SRC, 'utf8'));

/** Наивная нарезка на предложения — достаточно, чтобы показать владельцу контекст находки. */
const sentencesOf = (text) => text.split(/(?<=[.!?])\s+/);

const found = [];
for (const d of dims) {
  const en = d.description?.en ?? '';
  if (!en) continue;
  const hits = [];
  for (const s of sentencesOf(en)) {
    const markers = MARKERS.filter((m) => m.re.test(s)).map((m) => m.имя);
    if (markers.length) hits.push({ предложение: s.trim(), маркеры: markers });
  }
  if (hits.length) {
    found.push({ slug: d.slug, вид: d.type?.ru ?? '—', название: d.title?.en ?? d.title?.ru ?? '—', hits });
  }
}
found.sort((a, b) => (a.slug < b.slug ? -1 : 1));

// Контроль прибора: известный положительный случай обязан найтись.
if (!found.some((f) => f.slug === CONTROL_SLUG)) {
  console.error(`ОШИБКА СКРИПТА: контрольный случай ${CONTROL_SLUG} («Гадкие американцы», §10 ` +
    'researches/34) в список не попал — греп слеп, его числам верить нельзя.');
  process.exit(1);
}

const byMarker = {};
for (const f of found) for (const h of f.hits) for (const m of h.маркеры) byMarker[m] = (byMarker[m] ?? 0) + 1;

const lines = [];
lines.push('# Кандидаты EN-каталога со справочным стилем (маркеры Википедии)');
lines.push('');
lines.push('> **Создан:** 2026-08-14 скриптом `tools/grep-en-boilerplate.mjs` (plans/41, шаг 4) ·');
lines.push('> **Родитель:** `plans/41_epic40_phase1_instruments.md` → шаг 4; метод — §10 `researches/34` ·');
lines.push('> **Статус:** список снят; **правок в данных 0** — переформулировка ждёт фазы 3 эпика');
lines.push('> `plans/40` (интервью №025 В6 = А) · **Исходящее:** вход фазы 3 (правка EN-описаний)');
lines.push('');
lines.push(`Проверено записей каталога: **${dims.length}** · записей с маркерами: **${found.length}** · ` +
  `предложений-находок: **${found.reduce((n, f) => n + f.hits.length, 0)}**.`);
lines.push('');
lines.push('Частота маркеров (одно предложение может нести несколько):');
lines.push('');
for (const [m, n] of Object.entries(byMarker).sort(([, a], [, b]) => b - a)) lines.push(`- \`${m}\` — ${n}`);
lines.push('');
lines.push('**Чего этот список НЕ доказывает:** маркер ≠ дословное заимствование (это стилевой');
lines.push('запах, кандидат на вычитку, а не приговор); отсутствие маркера ≠ чистота (греп ловит');
lines.push('пять известных оборотов §10, а не все возможные); RU-тексты не проверялись вовсе.');
lines.push('');
lines.push('---');
lines.push('');
for (const f of found) {
  lines.push(`## \`${f.slug}\` · ${f.вид} · ${f.название}`);
  lines.push('');
  for (const h of f.hits) {
    lines.push(`- [${h.маркеры.join(' · ')}] «${h.предложение}»`);
  }
  lines.push('');
}

writeFileSync(OUT, lines.join('\n'), 'utf8');
console.log(`Записей с маркерами: ${found.length} из ${dims.length} · контроль ${CONTROL_SLUG}: в списке`);
console.log(`Частота: ${JSON.stringify(byMarker)}`);
console.log(`Записано: ${OUT}`);
