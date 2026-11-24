#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { проверить } from './lib/grammar-agreement.mjs';

const RULES = [
  ['ложная антитеза', /не\s+просто\s+[^.!?]{1,160}(?:,|:)?\s+это/giu],
  ['необоснованное «не только, но и»', /не\s+только\s+[^.!?]{1,160}\s+но\s+и/giu],
  ['калька и канцелярит', /на\s+ежедневной\s+основе|на\s+сегодняшний\s+день|в\s+рамках\s+данного|играет\s+ключевую\s+роль|адресу(?:ет|ют|ем|ете)\s+проблему/giu],
  ['пустой авторитет', /важно\s+отметить|следует\s+подчеркнуть|исследования\s+показывают|эксперты\s+отмечают/giu],
  ['расщеплённое сказуемое', /осуществля(?:ет|ют|ется|ются)\s+(?:проверку|обработку|запись|контроль|производство)/giu],
  ['шаблонный зачин', /в\s+современном\s+мире|давайте\s+разбер(?:ём|ем)ся/giu],
  ['разговорная сравнительная степень', /(?<!\p{L})по(?:быстрее|проще|больше|меньше|лучше|хуже|выше|ниже|подробнее)(?!\p{L})/giu],
  ['английские прямые кавычки', /"/gu],
];

export function lintRussian(text) {
  const found = [];
  for (const [rule, pattern] of RULES) {
    for (const match of String(text ?? '').matchAll(pattern)) {
      found.push({ rule, fragment: match[0] });
    }
  }
  return found;
}

export function checkBatch(file) {
  const batch = JSON.parse(readFileSync(file, 'utf8'));
  const errors = [];
  const notes = [];
  for (const item of batch.candidates ?? []) {
    const title = item.title?.ru ?? item.wikidata;
    const text = item.description?.ru ?? '';
    for (const hit of lintRussian(text)) errors.push(`${title} · ${hit.rule}: «${hit.fragment}»`);
    const grammar = проверить(text);
    for (const hit of grammar.подозрения) notes.push(`${title} · ${hit.правило}: «${hit.цитата}» — ${hit.почему}`);
  }
  return { errors, notes, count: (batch.candidates ?? []).length };
}

function selftest() {
  const bad = lintRussian('В современном мире это не просто фильм, это опыт. Автор осуществляет проверку фактов и пишет "цитату".');
  const good = lintRussian('Фильм рассказывает о герое, который возвращается в родной город. Картина вышла в прокат в 2026 году и получила смешанные отзывы.');
  const checks = [
    ['машинные обороты пойманы', bad.length >= 4],
    ['обычная академическая фраза не окрашена', good.length === 0],
    ['русское согласование разбирается', проверить('Драма снята тунисской режиссёром.').подозрения.length > 0],
  ];
  for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  const failed = checks.filter(([, ok]) => !ok).length;
  console.log(`check-candidate-russian self-test: ${checks.length - failed}/${checks.length}`);
  process.exit(failed ? 1 : 0);
}

if (process.argv.includes('--selftest')) {
  selftest();
} else if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const file = process.argv[2];
  if (!file || file.startsWith('--')) {
    console.error('Запуск: node tools/check-candidate-russian.mjs candidates/batches/NN_*.json');
    process.exit(2);
  }
  const result = checkBatch(file);
  console.log(`Русские описания: ${result.count} карточек`);
  for (const line of result.errors) console.error(`ОШИБКА ${line}`);
  for (const line of result.notes) console.log(`ПРОВЕРИТЬ ${line}`);
  console.log(`Итог: ошибок ${result.errors.length} · грамматических подозрений ${result.notes.length}`);
  process.exit(result.errors.length ? 1 : 0);
}
