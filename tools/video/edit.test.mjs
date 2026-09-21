/**
 * Юниты чистых частей `edit.mjs`: якоря вставок по словам и фильтр монтажа (эпик `plans/90`, репетиция пилота).
 * Запуск: node --test tools/video/edit.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { brollFilter, musicFilter, musicLicense, parseLogo, parseSegment, VOICE_CLEAN, wordRange, speedFilter, outroFilter, assertSegmentsInOrder, OUTRO_SEC, OUTRO_FADE, OUTRO_IN } from './edit.mjs';
import { speechHfLoss } from './selfcheck.mjs';

const words = ['Вы', 'открываете', 'карточку', 'от', 'нуля', 'до', 'десяти.', 'Пространство NDim', 'считает', 'Связи —', 'людей', 'вкусами.']
  .map((text, i) => ({ text, from: i * 1000, to: i * 1000 + 800 }));

test('отрезок вставки — от первого слова до первого после него конечного, знаки не мешают', () => {
  assert.deepEqual(wordRange(words, 'открываете', 'десяти'), { start: 1, end: 6.8 });
  assert.deepEqual(wordRange(words, 'считает', 'вкусами'), { start: 8, end: 11.8 });
});

test('🔴 нет якоря — остановка с именем слова, а не монтаж без показа', () => {
  assert.throws(() => wordRange(words, 'открываете', 'десять'), /«десять»/);
  assert.throws(() => wordRange(words, 'закрываете', 'десяти'), /«закрываете»/);
});

test('отрезок из командной строки: путь Windows с двоеточием не ломает разбор', () => {
  assert.deepEqual(parseSegment('D:\\studio\\broll\\a.mp4|открываете|десяти'), { file: 'D:\\studio\\broll\\a.mp4', fromWord: 'открываете', toWord: 'десяти' });
  assert.throws(() => parseSegment('a.mp4|открываете'));
});

test('🔴 фильтр: каждая запись на своём отрезке, окна с лицом нет, субтитры последними', () => {
  const f = brollFilter({ segments: [{ start: 1, end: 6.8 }, { start: 8, end: 11.8 }], assArg: 'x.ass' });
  assert.match(f, /\[1:v\].*setpts=PTS-STARTPTS\+1\.000\/TB\[s0\]/);
  assert.match(f, /\[0:v\]\[s0\]overlay=0:0:enable='between\(t,1\.000,6\.800\)'/);
  assert.match(f, /\[v0\]\[s1\]overlay=0:0:enable='between\(t,8\.000,11\.800\)'/);
  assert.doesNotMatch(f, /pip|face/, 'окно лица снято репетицией — закрывало проценты «Связей»');
  assert.ok(f.endsWith("[v1]ass='x.ass'[v]"));
});

test('🔴 запись экрана короче отрезка держит последний кадр, а не начинается заново (пилот 001)', () => {
  const f = brollFilter({ segments: [{ start: 20, end: 26 }], assArg: 'x.ass' });
  assert.match(f, /tpad=stop_mode=clone:stop_duration=6\.000,/);
  // …и медленно наезжает: статичный экран «Связи» иначе законно краснел проверкой застывшего кадра (5,7 с).
  assert.match(f, /scale=w='trunc\(1080\*\(1\+0\.06\*min\(t\/6\.000,1\)\)\/2\)\*2':h=-2:eval=frame,crop=1080:1920,setpts=PTS-STARTPTS\+20\.000\/TB\[s0\]/);
});

test('🔴 плашка по умолчанию — по центру МЕЖДУ бородой и субтитрами (слово владельца 2026-09-15)', () => {
  const f = brollFilter({ segments: [], assArg: 'x.ass', logo: { start: 6, end: 18 } });
  assert.match(f, /\[1:v\]format=rgba,.*fade=t=in:st=0:d=0\.3:alpha=1.*setpts=PTS-STARTPTS\+6\.000\/TB\[lg0\]/);
  // Плашка 1220…1328 стоит В ПОЛОСЕ между бородой (до 1180) и субтитрами (две строки начинаются с 1369 при SUB_MARGIN 0,21).
  // Пара с words-to-ass.mjs: сдвинешь субтитры — эта проверка не покраснеет, но плашка ляжет на лицо.
  assert.match(f, /\[0:v\]\[lg0\]overlay=\(W-w\)\/2:1220:enable='between\(t,6\.000,18\.000\)'/);
  assert.ok(!/scale=150/.test(f), 'плашка идёт своим размером, без масштаба');
  assert.ok(f.endsWith("[vl0]ass='x.ass'[v]"), 'субтитры поверх знака');
  assert.equal(brollFilter({ segments: [], assArg: 'x.ass' }), "[0:v]ass='x.ass'[v]", 'без вставок и знака — одни субтитры');
});

test('плашка-логотип встаёт своим PNG на заданное место, без масштаба при ширине 0 (№088 В1)', () => {
  const logo = parseLogo('D:\\studio\\brand\\lockup.png|Пространство NDim|Вашим|(W-w)/2|1000|0');
  assert.deepEqual(logo, { file: 'D:\\studio\\brand\\lockup.png', fromWord: 'Пространство NDim', toWord: 'Вашим', x: '(W-w)/2', y: '1000', width: 0 });
  const f = brollFilter({ segments: [], assArg: 'x.ass', logo: { ...logo, start: 6, end: 18 } });
  assert.match(f, /\[1:v\]format=rgba,loop/, 'ширина 0 — без scale');
  assert.match(f, /overlay=\(W-w\)\/2:1000:enable=/);
  assert.deepEqual(parseLogo('a.png|x|y'), { file: 'a.png', fromWord: 'x', toWord: 'y' }, 'без места — место по умолчанию из LOGO');
});

/**
 * Заказ владельца 2026-09-19 («*лого плашку со ссылкой*» на ролике 66 с): плашек может быть несколько —
 * у названия продукта и в конце под призыв. Проверка стережёт ровно то, что ломается молча при списке:
 * у каждой плашки СВОЙ вход ffmpeg и СВОЙ слой, и последний слой уходит под субтитры. Склеенные метки
 * дали бы ffmpeg два одинаковых имени — он упал бы уже на живом ролике, а не здесь.
 */
test('🔴 плашек может быть несколько: свой вход и свой слой у каждой, субтитры поверх последней', () => {
  const f = brollFilter({ segments: [], assArg: 'x.ass', logos: [{ start: 6, end: 10 }, { start: 30, end: 34 }] });
  assert.match(f, /\[1:v\]format=rgba,.*\[lg0\]/, 'первая плашка — вход 1');
  assert.match(f, /\[2:v\]format=rgba,.*\[lg1\]/, 'вторая плашка — вход 2, а не тот же');
  assert.match(f, /\[0:v\]\[lg0\]overlay=.*\[vl0\]/, 'первая ложится на ролик');
  assert.match(f, /\[vl0\]\[lg1\]overlay=.*\[vl1\]/, 'вторая — поверх первой, а не поверх ролика');
  assert.ok(f.endsWith("[vl1]ass='x.ass'[v]"), 'субтитры поверх последней плашки');
  // И со вставками экрана номера входов не сталкиваются: вставки идут первыми, плашки — после них.
  const g = brollFilter({ segments: [{ start: 1, end: 2 }], assArg: 'x.ass', logos: [{ start: 6, end: 10 }] });
  assert.match(g, /\[1:v\]scale=/, 'вход 1 — запись экрана');
  assert.match(g, /\[2:v\]format=rgba/, 'вход 2 — плашка');
});

test('🔴 музыка: голос — ключ приглушения, подложка по длине ролика, смесь без нормировки amix', () => {
  const f = musicFilter({ duration: 50, gainDb: -15.8 });
  assert.match(f, /\[1:a\].*atrim=duration=50\.000,volume=-15\.80dB,afade=t=in:st=0:d=1,afade=t=out:st=48\.000:d=2\[m\]/);
  assert.match(f, /\[0:a\].*asplit=2\[voice\]\[key\]/);
  assert.match(f, /\[m\]\[key\]sidechaincompress=/, 'ключ — голос, приглушается музыка');
  assert.match(f, /\[voice\]\[duck\]amix=inputs=2:duration=first:normalize=0\[mix\]/, 'normalize=0 — иначе amix вдвое тише голоса');
});

test('🔴 музыка без файла лицензии рядом в ролик не попадает', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ndim-music-'));
  const mp3 = join(dir, 'ocean-breeze.mp3');
  writeFileSync(mp3, 'x');
  assert.throws(() => musicLicense(mp3), /нет файла лицензии/);
  writeFileSync(join(dir, 'ocean-breeze.license.txt'), 'CC0 1.0');
  assert.equal(musicLicense(mp3), join(dir, 'ocean-breeze.license.txt'));
});

test('🔴 очистка голоса не принимает речь за шум: порог шума замерен, а не −25 (пилот 001)', () => {
  assert.match(VOICE_CLEAN, /^highpass=f=80,afftdn=nf=-60/);
  assert.doesNotMatch(VOICE_CLEAN, /nf=-25/);
  // Замер пилота 001: до очистки низ −33,5 / верх −51,9 дБ; прежняя очистка −34,2 / −62,0; нынешняя −33,5 / −52,0.
  const before = { low: -33.5, high: -51.9 };
  assert.ok(Math.abs(speechHfLoss(before, { low: -34.2, high: -62.0 }) - 9.4) < 1e-9);
  assert.ok(Math.abs(speechHfLoss(before, { low: -33.5, high: -52.0 }) - 0.1) < 1e-9);
});

test('🔴 ускорение речи: картинка и голос одним темпом, музыка и наезды сюда не попадают (слово владельца 2026-09-15)', () => {
  assert.equal(speedFilter(1.1), '[0:v]setpts=PTS/1.1[v];[0:a]atempo=1.1[a]');
  // Одно звено atempo честно работает до 2×; выше — молча испорченный звук, поэтому отказ.
  assert.throws(() => speedFilter(2.5), /от 0,5 до 2/);
  assert.throws(() => speedFilter(0), /от 0,5 до 2/);
});

/**
 * Проверка переписана 2026-09-19 вместе с поведением: владелец, посмотрев сборку, сказал «*финальная заставка
 * показывается резко, не хватает быстрого фейда*» — стык заменён переходом `xfade`. Что проверка стережёт
 * теперь: переход существует и начинается ровно за `OUTRO_IN` до конца ролика (промах здесь обрезал бы речь
 * или оставил стык), и ОБА тёмных отрезка по-прежнему короче порога 0,5 с проверки `black` — иначе страж
 * чёрной дыры ослеп бы на исправном ролике, ради чего прежняя проверка и была написана.
 */
test('🔴 концовка: переход в кадр знака и уход в чёрное — оба КОРОЧЕ полусекунды, страж чёрного кадра не слепнет', () => {
  const f = outroFilter({ sec: 2, fade: 0.45, duration: 65.6 });
  assert.match(f, /\[1:v\]scale=1080:1920,fps=30,format=yuv420p,fade=t=out:st=1\.550:d=0\.450,settb=AVTB\[o\]/);
  assert.match(f, /\[m\]\[o\]xfade=transition=fade:duration=0\.350:offset=65\.250\[v\]/, 'кадр проявляется переходом, а не стыком');
  // Обе ветки приведены к одной шкале времени: без этого `xfade` падает «timebase do not match» (прогон 2026-09-19).
  assert.match(f, /,settb=AVTB\[o\]/, 'кадр знака — на общей шкале времени');
  assert.match(f, /\[0:v\]settb=AVTB\[m\]/, 'дорожка ролика — на той же шкале');
  assert.match(f, /\[0:a\]\[2:a\]concat=n=2:v=0:a=1\[a\]/, 'звук склеивается отдельно: у видео переход, у звука стык тишины');
  assert.ok(OUTRO_FADE < 0.5, 'уход в чёрное короче порога проверки black (0,5 с)');
  assert.ok(OUTRO_IN < 0.5, 'переход короче того же порога — два полутёмных отрезка подряд его бы достигли');
  assert.ok(OUTRO_SEC >= 1 && OUTRO_SEC <= 2, 'владелец назвал вилку 1…2 с');
  // Ролик короче перехода — остановка с числом, а не молча обрезанная речь.
  assert.throws(() => outroFilter({ duration: 0.2 }), /нужна длительность ролика больше/);
});

test('🔴 вставки не наезжают друг на друга: якорь, встречающийся раньше, ловится ДО сборки (ошибка 2026-09-15)', () => {
  const ok = [{ file: 'a.mp4', fromWord: 'открываете', toWord: 'по', start: 21.17, end: 23.96 },
    { file: 'b.mp4', fromWord: 'десятибалльной', toWord: 'десяти', start: 23.96, end: 26.5 }];
  assert.equal(assertSegmentsInOrder(ok), ok, 'встык — законно, между экранами лицо не мелькает');
  // Ровно тот случай: «по» нашлось в «ближе всего ПО вашим общим интересам», окно уехало влево и накрыло первую.
  const bad = [{ file: 'a.mp4', fromWord: 'открываете', toWord: 'по', start: 21.17, end: 23.90 },
    { file: 'b.mp4', fromWord: 'по', toWord: 'десяти', start: 18.05, end: 26.5 }];
  assert.throws(() => assertSegmentsInOrder(bad), /наезжает на «a.mp4».*«по»/s);
});
