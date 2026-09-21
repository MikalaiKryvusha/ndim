/**
 * Юниты `words-to-ass.mjs` (эпик `plans/90`, шаг Ш3 `plans/91`).
 * Каждый тест держит дефект, найденный прогоном на пробе 2026-09-14, а не придуманный.
 * Запуск: node --test tools/video/words-to-ass.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { alignScript, assTime, groupWords, readWords, styleLine, toAss, wrapLines, lineCount, LINE_CHARS, SUB_FONT } from './words-to-ass.mjs';

test('четыре вида субтитров для выбора владельцем (фаза 2): плашки — BorderStyle 3, «Крупно» — по центру, чужой вид — отказ', () => {
  const f = (s) => styleLine(s, { fontSize: 86, marginV: 422 }).split(',');
  assert.equal(f('A')[15], '1');
  assert.equal(f('B')[15], '3');
  assert.equal(f('C')[15], '3');
  assert.equal(f('C')[6], '&H00D66714', 'плашка бренда — цвет --primary #1467d6 в порядке BGR');
  assert.equal(f('D')[18], '5', 'Alignment 5 — центр кадра');
  assert.throws(() => styleLine('E', { fontSize: 86, marginV: 422 }), /только A, B, C, D/);
  assert.ok(toAss([], { style: 'C' }).includes('&H00D66714'));
});

test('🔴 субтитры берут текст сценария, время — из распознавания (репетиция пилота 2026-09-14)', () => {
  // Распознавание дословно как на репетиции: «пространство НДИМ», «звезды», «от 0 до 10».
  const rec = ['Я', 'сделал', 'пространство', 'НДИМ', 'ставите', 'фильму', 'звезды', 'от', '0', 'до', '10', 'Ваши', 'связи']
    .map((text, i) => ({ text, from: i * 500, to: i * 500 + 400 }));
  const { words, matched } = alignScript('Я сделал Пространство NDim. Ставите фильму звёзды, от нуля до десяти. Ваши Связи — людей', rec);
  const texts = words.map((w) => w.text);
  assert.ok(texts.includes('Пространство NDim.'), JSON.stringify(texts));
  assert.ok(texts.includes('звёзды,'));
  assert.ok(texts.includes('Связи —'), 'тире сценария не теряется');
  const nulya = words.find((w) => w.text === 'нуля');
  assert.ok(nulya.from >= 3500 && nulya.to <= 5000, `«нуля» без пары получает время между соседями: ${JSON.stringify(nulya)}`);
  assert.ok(matched > 0.5 && matched < 1);
});

const seg = (from, to, text) => ({ offsets: { from, to }, text });

test('🔴 имя бренда не разрезается между субтитрами и пишется как в продукте', () => {
  // Ровно тот вход, на котором первый прогон отдал «Я сделал Ndim» и «Space, бесплатное…».
  const json = { transcription: [seg(0, 300, ''), seg(2990, 2990, ' Я'), seg(2990, 2990, ' сделал'), seg(2990, 3820, ' Ndim'), seg(3820, 4400, ' Space,'), seg(4400, 5000, ' бесплатное')] };
  const groups = groupWords(readWords(json), 3);
  const texts = groups.map((g) => g.text);
  assert.ok(texts.some((t) => t.includes('NDim Space,')), `имя целиком в одной группе: ${JSON.stringify(texts)}`);
  assert.ok(!texts.some((t) => /\bNdim\b/.test(t)), 'написание модели не доезжает до кадра');
});

test('английская речь: «Endim Space» тоже становится «NDim Space»', () => {
  // Дословно из распознавания английской пробы 2026-09-14: «I built Endim Space, a free space…».
  const json = { transcription: [seg(0, 400, ' I'), seg(400, 800, ' built'), seg(800, 1200, ' Endim'), seg(1200, 1700, ' Space,'), seg(1700, 1900, ' a')] };
  const texts = groupWords(readWords(json), 3).map((g) => g.text);
  assert.ok(texts.some((t) => t.includes('NDim Space,')), JSON.stringify(texts));
});

test('нулевое слово не рождает мигания: группа живёт до начала следующей', () => {
  const words = [
    { from: 1000, to: 1000, text: 'Я' },
    { from: 1000, to: 1000, text: 'сделал' },
    { from: 1000, to: 1500, text: 'сайт.' },
    { from: 2000, to: 2400, text: 'Смотрите' },
  ];
  const [first, second] = groupWords(words, 3);
  assert.equal(first.end, second.start);
  assert.ok(first.end > first.start);
});

test('🔴 строка не кончается предлогом и рвётся по паузе голоса (слово владельца №088 В1, пилот 001)', () => {
  // Дословно с пилота: распознавание ставит «с» в тишину 11,84–12,13 с после «музыки».
  const words = [[9180, 9620, 'оценки'], [9620, 10080, 'игр,'], [10080, 10990, 'фильмов,'], [10990, 11280, 'книг,'], [11280, 11840, 'музыки'], [11840, 12000, 'с'], [12000, 12600, 'оценками'], [12600, 13120, 'других'], [13120, 13580, 'людей']]
    .map(([from, to, text]) => ({ from, to, text }));
  const pauses = [{ start: 11840, end: 12130 }, { start: 13640, end: 13840 }];
  const texts = groupWords(words, { pauses }).map((g) => g.text);
  assert.ok(texts.includes('с оценками других людей'), JSON.stringify(texts));
  assert.ok(!texts.some((t) => / с$/.test(t)), `ни одна строка не кончается «с»: ${JSON.stringify(texts)}`);
  // Тот же вход по прежнему правилу «три слова» давал «книг, музыки с» — ровно то, что вернул владелец.
  const legacy = [];
  for (let i = 0; i < words.length; i += 3) legacy.push(words.slice(i, i + 3).map((w) => w.text).join(' '));
  assert.ok(legacy.includes('книг, музыки с'), 'контроль: прежняя разбивка воспроизводит дефект');
});

test('строка из одного слова не мелькает там, где слово держится за соседей', () => {
  const words = [[44440, 44850, 'внизу'], [44850, 45700, 'в'], [45700, 46000, 'профиле.'], [46000, 46690, 'Оцените'], [46690, 47000, 'то,']]
    .map(([from, to, text]) => ({ from, to, text }));
  const texts = groupWords(words, { pauses: [{ start: 44800, end: 45000 }] }).map((g) => g.text);
  assert.equal(texts[0], 'внизу в профиле.');
});

test('субтитры выше на лице и ниже поверх записи экрана (№088 В1; карточка «Связей» пилота 001)', () => {
  const ass = toAss([{ start: 1000, end: 2000, text: 'на лице' }, { start: 30000, end: 31000, text: 'на экране' }], { screens: [{ start: 29930, end: 35600 }] });
  // Кегль 79 при кадре 1920 — это доля `SUB_FONT` 0,041, уменьшенная 2026-09-19 по слову владельца
  // «*уменьши кегель чуточку*» (было 0,045 = 86). Проверка держит ПАРУ: кегль и число знаков в строке.
  assert.ok(ass.includes(`Style: Default,Arial,${Math.round(1920 * SUB_FONT)},`) && ass.includes(',403,204'), 'на лице — 21 % высоты: субтитры опущены, чтобы над ними встала плашка (слово владельца 2026-09-15)');
  assert.ok(ass.includes(`Style: Screen,Arial,${Math.round(1920 * SUB_FONT)},`) && ass.includes(',365,204'), 'на экране — 19 % высоты, ниже, чем на лице: карточки экрана «Связи» не перекрываются');
  assert.ok(ass.includes(',Default,,0,0,0,,на лице'));
  assert.ok(ass.includes(',Screen,,0,0,0,,на экране'));
});

test('конец фразы закрывает группу раньше лимита', () => {
  const words = [{ from: 0, to: 500, text: 'Привет.' }, { from: 600, to: 900, text: 'Меня' }];
  assert.deepEqual(groupWords(words, 3).map((g) => g.text), ['Привет.', 'Меня']);
});

test('время ASS и фигурные скобки в тексте', () => {
  assert.equal(assTime(3_723_450), '1:02:03.45');
  const ass = toAss([{ start: 0, end: 1000, text: 'a {\\b1}b' }]);
  assert.ok(ass.includes(',a \\b1b'), 'теги ASS из речи не исполняются');
});

/**
 * Куплено прогоном 2026-09-19 двумя дефектами сразу: автоперенос ASS дал ТРИ строки на блоке
 * «Он называется Пространство NDim Space.», и верхняя строка накрыла ссылку на плашке-логотипе; а на
 * «заходи в Пространство NDim и найди» он разрезал имя бренда между строками — то самое, ради чего имя
 * склеивается в один кусок. Перенос забран у ASS (`WrapStyle: 2`). Проверка стережёт три вещи: число
 * строк НАИМЕНЬШЕЕ из возможных, склеенное имя бренда целым куском, строки соизмеримы по длине.
 */
test('🔴 перенос блока субтитров — наш: наименьшее число строк, имя бренда целым куском', () => {
  const N = '\\N';
  const a = wrapLines(['Он', 'называется', 'Пространство NDim Space.']);
  assert.equal(a, `Он называется${N}Пространство NDim Space.`);
  assert.equal(lineCount(['Он', 'называется', 'Пространство NDim Space.']), 2, 'две строки, а не три');
  // Имя бренда — один кусок, деления внутри него не существует ни при какой раскладке.
  const b = wrapLines(['заходи', 'в', 'Пространство NDim', 'и', 'найди', 'свои', 'Связи.']);
  assert.ok(b.split(N).every((l) => l.trim() !== 'NDim' && l.trim() !== 'Пространство'), `имя бренда не разорвано: ${b}`);
  assert.ok(b.includes('Пространство NDim'), 'имя стоит целиком в одной строке');
  // Короткий блок переноса не получает вовсе.
  assert.equal(wrapLines(['свои', 'Связи.']), 'свои Связи.');
  assert.equal(lineCount(['свои', 'Связи.']), 1);
  // Деление ищется самое ровное: строки соизмеримы, а не «одно слово и хвост».
  const c = wrapLines(['не', 'тратя', 'своё', 'время', 'и', 'ментальный', 'ресурс?']).split(N);
  assert.equal(c.length, 2);
  assert.ok(Math.abs(c[0].length - c[1].length) <= 4, `строки соизмеримы: ${JSON.stringify(c)}`);
  // Ни одна строка не шире предела — иначе текст вылезет за кадр, а `WrapStyle: 2` его уже не подберёт.
  for (const line of wrapLines(['Всё', 'ещё', 'ходишь', 'на', 'свидание,', 'тратишь', 'своё', 'время', 'в', 'бесконечных']).split(N)) {
    assert.ok(line.length <= LINE_CHARS, `строка «${line}» шире ${LINE_CHARS} знаков`);
  }
  assert.ok(LINE_CHARS >= 20 && LINE_CHARS <= 28, 'ширина строки снята прогоном, а не выдумана');
});
