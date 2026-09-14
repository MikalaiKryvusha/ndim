/**
 * Юниты `takes.mjs` — лучшие фразы из нескольких дублей (эпик `plans/90`, пилот 001, 2026-09-14).
 * Каждый тест держит поведение, найденное на ЖИВЫХ дублях владельца, а не придуманное.
 * Запуск: node --test tools/video/takes.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { checkJoins, chunksOf, cutRanges, frameGrid, matchBlocks, parseSilences, renderGraph, sentencesOf, similarity, snapSentences, speechRegions, splitScript, wordKey } from './takes.mjs';

test('паузы из отчёта silencedetect; пауза до конца файла закрывается длительностью', () => {
  const text = '[silencedetect @ 0] silence_start: 0\n[silencedetect @ 0] silence_end: 0.48 | silence_duration: 0.48\nsilence_start: 23.501\nsilence_end: 41.119\nsilence_start: 177.2';
  assert.deepEqual(parseSilences(text, 179.2), [{ start: 0, end: 0.48 }, { start: 23.501, end: 41.119 }, { start: 177.2, end: 179.2 }]);
});

test('куски речи: щелчок короче порога выбрасывается, паузы вокруг сливаются', () => {
  // Дубль 1 пилота: «речь» 0,48–0,50 с — щелчок, а не слово.
  const regions = speechRegions([{ start: 0, end: 0.48 }, { start: 0.5, end: 0.93 }, { start: 4.47, end: 5.34 }], 8.43);
  assert.deepEqual(regions, [{ start: 0.93, end: 4.47 }, { start: 5.34, end: 8.43 }]);
});

test('попытки: пауза внутри фразы (до 0,9 с) не режет, пауза между попытками (от 1,1 с) режет', () => {
  const chunks = chunksOf([{ start: 0.93, end: 4.47 }, { start: 5.34, end: 8.43 }, { start: 9.11, end: 15.56 }, { start: 41.12, end: 48.16 }]);
  assert.equal(chunks.length, 2);
  assert.deepEqual([chunks[0].start, chunks[0].end, chunks[0].regions.length], [0.93, 15.56, 3]);
});

const w = (text, from, to) => ({ text, from, to });

test('🔴 границы предложения — по звуку, а не по отметкам слов whisper', () => {
  // Отметки слов уходят в тишину; куски речи по звуку: 41,12–43,84 и 44,25–48,16.
  const sents = sentencesOf([w('Вы', 41.3, 41.9), w('открываете', 41.9, 43.9), w('шкале.', 44.4, 48.3)]);
  const [s] = snapSentences(sents, [{ start: 41.12, end: 43.84 }, { start: 44.25, end: 48.16 }]);
  assert.deepEqual([s.start, s.end, s.seamless], [41.12, 48.16, false]);
});

test('🔴 два предложения без паузы между ними делятся между словами и помечаются «без паузы»', () => {
  // «Пространство NDim полностью бесплатное. В Пространстве NDim нет подписок…» — одним куском речи.
  const sents = sentencesOf([w('Пространство', 141.6, 142.2), w('бесплатное.', 142.2, 143.9), w('В', 144.2, 144.3), w('рекламы.', 144.3, 146.2)]);
  const [a, b] = snapSentences(sents, [{ start: 141.6, end: 146.25 }]);
  assert.equal(a.end, b.start);
  assert.ok(a.end > 143.9 && a.end < 144.2, `граница между словами: ${a.end}`);
  assert.ok(a.seamless && b.seamless);
});

test('сходство по доле общих слов: имя бренда в написаниях модели, «ё», числа словами и цифрами, «10-ти»', () => {
  assert.equal(wordKey('Эндим'), 'ndim');
  assert.equal(wordKey('Endim'), 'ndim');
  assert.equal(wordKey('десяти.'), '10');
  assert.equal(wordKey('10-ти'), '10');
  assert.equal(similarity('Пространство NDim — звёзды от нуля до десяти.', 'пространство Эндим звезды от 0 до 10'), 1);
  assert.ok(similarity('Меня зовут Николай.', 'Ссылка в профиле.') < 0.35);
});

test('фразы сценария → кандидаты из дублей, лучшие первыми, непохожие не попадают', () => {
  const blocks = splitScript('Как найти людей с Вашим вкусом? Ссылка на Пространство NDim — в профиле.');
  assert.equal(blocks.length, 2);
  const sentences = [
    { id: 'T1-01', text: 'Как найти людей с вашим вкусом в кино, книгах и играх?' },
    { id: 'T2-12', text: 'Ссылка на пространство NDIM внизу в профиле.' },
    { id: 'T2-01', text: 'Как найти людей с вашим вкусом?' },
  ];
  const [hook, link] = matchBlocks(blocks, sentences);
  assert.deepEqual(hook.candidates.map((c) => c.id), ['T2-01', 'T1-01']);
  assert.deepEqual(link.candidates.map((c) => c.id), ['T2-12']);
});

const takes = {
  T1: {
    duration: 179.2,
    sentences: [
      { id: 'T1-01', start: 0.93, end: 4.47 },
      { id: 'T1-02', start: 5.34, end: 8.43 },
      { id: 'T1-15', start: 141.6, end: 144.05 },
      { id: 'T1-16', start: 144.05, end: 148.32 },
    ],
  },
};

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);

test('лист выбора → отрезки: запасы не заходят в соседние предложения, склеенные подряд — один кусок', () => {
  const [a, b] = cutRanges([{ ids: ['T1-01'], text: 'Как найти людей?' }, { ids: ['T1-15', 'T1-16'], text: 'Бесплатное. Нет рекламы.' }], takes);
  near(a.start, 0.85);
  near(a.end, 4.62);
  near(b.start, 141.52);
  near(b.end, 148.47);
  const [c] = cutRanges([{ ids: ['T1-16'], text: 'Нет рекламы.' }], takes);
  near(c.start, 144.05); // без паузы перед предложением запас не залезает в предыдущее
});

test('🔴 лист выбора отказывает: чужой дубль в одной строке, не подряд, без текста, время вне дубля', () => {
  assert.throws(() => cutRanges([{ ids: ['T1-01', 'T2-02'], text: 'x' }], takes), /из другого дубля/);
  assert.throws(() => cutRanges([{ ids: ['T1-01', 'T1-15'], text: 'x' }], takes), /не подряд/);
  assert.throws(() => cutRanges([{ ids: ['T1-01'] }], takes), /нет текста субтитров/);
  assert.throws(() => cutRanges([{ take: 'T1', start: 170, end: 190, text: 'x' }], takes), /вне дубля/);
  const [t] = cutRanges([{ take: 'T1', start: 9.025, end: 15.711, text: 'срез внутри предложения' }], takes);
  assert.deepEqual([t.start, t.end, t.ids.length], [9.025, 15.711, 0]);
  near(frameGrid([t])[0].start, 271 / 30);
});

test('🔴 склейка: картинка и звук одной длиной на сетке кадров, фейд на каждом стыке', () => {
  const cuts = frameGrid([{ take: 'T1', start: 9.025, end: 15.711 }, { take: 'T1', start: 0.85, end: 4.62 }]);
  for (const c of cuts) assert.ok(Math.abs((c.end - c.start) * 30 - Math.round((c.end - c.start) * 30)) < 1e-6, 'длина кратна кадру');
  const g = renderGraph(cuts);
  // 9,025 → 271-й кадр (9,0333 с), 15,711 → 471-й (15,7 с): длина 200 кадров = 6,6667 с.
  assert.match(g, /\[0:v\]fps=30,trim=duration=6\.6667,setpts=PTS-STARTPTS/, '`fps` до `trim` — иначе каждый отрезок длиннее на кадр');
  assert.match(g, /\[0:a\]atrim=duration=6\.6667,asetpts=PTS-STARTPTS.*afade=t=in.*afade=t=out/);
  assert.ok(g.endsWith('[v0][a0][v1][a1]concat=n=2:v=1:a=1[v][a]'));
});

test('🔴 проверка стыков: срезанное последнее слово и чужое слово краснеют, число «10-ти» — нет', () => {
  const cuts = [{ n: 1, text: 'и находит Вам тех, чьи вкусы ближе всего к Вашим.' }, { n: 2, text: 'по десятибалльной шкале от нуля до десяти.' }, { n: 3, text: 'с оценками других людей' }];
  const [ok, num, extra] = checkJoins(cuts, ['и находит вам тех чьи вкусы ближе всего к вашим', 'по 10-балльной шкале от 0 до 10-ти', 'с оценками других людей и находит']);
  assert.ok(ok.ok);
  assert.ok(num.ok, JSON.stringify(num));
  assert.equal(extra.ok, false, 'затащенное «и находит» соседнего предложения краснеет');
  const [clipped] = checkJoins([cuts[0]], ['и находит вам тех чьи вкусы ближе всего к']);
  assert.equal(clipped.lastOk, false);
});
