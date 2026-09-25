// МУТАНТЫ ДЛЯ РУЧНОГО ПРОГОНА `qa/reports/2026-09-25_signin-link-forks.driver.mjs` — доказывают, что прогон умеет краснеть
// (суд порции 1, п. 6: мутант файлом рядом с драйвером, а не в скретчпаде сессии). Адресаты названы ДО прогона и печатаются
// перед каждым заходом; файлы продукта восстанавливаются побайтово в finally. Нужен поднятый стенд рабочего места (vite dev
// перечитывает правленые модули сам — пауза 4 с перед драйвером).
// Запуск из корня рабочего места: node qa/reports/2026-09-25_signin-link-forks.mutants.mjs [P1|G2]   (без ключа — оба)
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const RUNS = [
  {
    key: 'P1',
    // Прежняя редакция снимала развилку целиком (`if (!user || user.isAnonymous) return null;` → `if (true)`); порция 2
    // перестроила `linkFork`, и снимается ровно ветка Б3 — строка, которая возвращает `other-account`.
    name: 'порция 1: ветка Б3 развилки снята (другой аккаунт не опознаётся) · подписка вкладки «отправлено» снята',
    flag: '--portion1',
    // Прежний заход этого мутанта (17:27, скретчпад) — 13 красных ровно здесь; отчёт порции 1.
    expectRed: ['ВС-01 ×3 и три клетки', 'ВС-02 «консоль чиста» (400 signInWithEmailLink — прежнее Б1)', 'ВС-03 ×2 и «консоль чиста»',
      'ВС-06', 'ВС-07 «вкладка ушла»', 'ВС-08'],
    expectGreen: ['ВС-04', 'ВС-05', 'ВС-09', 'ВС-07 «А, не гость, тот же uid» (читает общее хранилище, не экран)'],
    edits: [
      ['src/lib/data/account.ts', "    return current.toLowerCase() === link.toLowerCase() ? null : { kind: 'other-account', current, link };", '    return null;'],
      ['src/routes/profile/+page.svelte', "    return onSignedInElsewhere(() => location.replace('/profile'));", '    return;'],
    ],
  },
  {
    key: 'G2',
    name: 'порция 2: ветка Г2 развилки снята (письмо гостя в другом браузере не опознаётся)',
    flag: '--portion2',
    // Без Г2 чистый браузер входит адресом сразу — исход тот же, экрана нет. Свой гость второго браузера без Г2 НЕ
    // привязывается вовсе: адрес из ссылки при сессии гостя передаёт только ветка Г2 (`hereEmail`), без неё `emailForLink`
    // у гостя адреса не находит (`email-needed`). Прогон 19:29 это показал: ВС-12 «тот же uid» красная (прогноз был
    // ошибкой, поправлен судом Г2 — отчёт `qa/reports/2026-09-25_signin-link-forks-g2.md`, «Найдено»).
    expectRed: ['ВС-10 экран Г2 и «пока вопрос открыт — сессии нет»', 'ВС-10 три клетки', 'ВС-11 шаг «идёт вход» (вход прошёл раньше)',
      'ВС-12 экран Г2 своему гостю и шаг «идёт вход»', 'ВС-12 тот же uid стал аккаунтом адреса', 'ВС-15'],
    expectGreen: ['ВС-10 «ничего не вылезает»', 'ВС-11 аккаунт адреса · оценок 0 · гость контекста 1 цел', 'ВС-12 оценки целы',
      'ВС-13', 'ВС-14', 'ВС-16 (Б3 мутантом не тронут)'],
    edits: [
      ['src/lib/data/account.ts', "  if (fromGuest && !remembered) return { kind: 'guest-elsewhere', link };", '  if (false) return null;'],
    ],
  },
];

const only = process.argv[2];
for (const run of RUNS) {
  if (only && run.key !== only) continue;
  console.log('\n══ МУТАНТ ' + run.name);
  console.log('   обязаны покраснеть: ' + run.expectRed.join(' · '));
  console.log('   обязаны остаться зелёными: ' + run.expectGreen.join(' · '));
  const originals = new Map();
  const mutated = new Map();
  try {
    for (const [f, from, to] of run.edits) {
      if (!originals.has(f)) originals.set(f, readFileSync(f));
      const src = readFileSync(f, 'utf8');
      if (!src.includes(from)) throw new Error('мутация не легла: ' + f + ' · ' + from);
      writeFileSync(f, src.replace(from, to));
      mutated.set(f, readFileSync(f));
    }
    await new Promise((ok) => setTimeout(ok, 4000));
    const r = spawnSync(process.execPath, ['qa/reports/2026-09-25_signin-link-forks.driver.mjs', run.flag], { encoding: 'utf8', timeout: 900000 });
    process.stdout.write(r.stdout.split('\n').filter((l) => /❌|✅|Итог|Голова/.test(l)).join('\n') + '\n');
    if (r.stderr) process.stdout.write('stderr: ' + r.stderr.split('\n').slice(0, 6).join(' | ') + '\n');
  } finally {
    // Файл правили, пока мутант держал его мутированным, — исходник всё равно восстанавливается, чужая версия сохраняется.
    for (const [f] of originals) {
      const now = readFileSync(f);
      if (mutated.has(f) && Buffer.compare(now, mutated.get(f)) !== 0) {
        const keep = join(tmpdir(), basename(f) + '.changed-during-mutant-' + Date.now());
        writeFileSync(keep, now);
        console.log('   ⚠️ ' + f + ' МЕНЯЛСЯ во время прогона — его версия сохранена: ' + keep + ' (правку внести заново)');
      }
    }
    for (const [f, buf] of originals) writeFileSync(f, buf);
    console.log('   восстановлено побайтово: ' + [...originals].every(([f, buf]) => Buffer.compare(readFileSync(f), buf) === 0));
  }
}
