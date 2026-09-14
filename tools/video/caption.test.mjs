/**
 * Юниты `caption.mjs` (эпик `plans/90`, пакет выхода навыка `/video-studio`).
 * Запуск: node --test tools/video/caption.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { checkCaption, makeLink } from './caption.mjs';

const GOOD = `Пространство NDim находит людей с похожими вкусами в кино, играх и книгах.
Оцените то, что Вы любите, и Пространство NDim покажет Ваши Связи.
${makeLink({ lang: 'ru', source: 'instagram', medium: 'reel', campaign: 'pilot-001' })}
#кино #книги #игры`;

test('ссылка ведёт на языковую страницу с тремя метками — главная метки отрезает', () => {
  assert.equal(makeLink({ lang: 'ru', source: 'instagram', medium: 'reel', campaign: 'pilot-001' }),
    'https://ndimspace.app/ru?utm_source=instagram&utm_medium=reel&utm_campaign=pilot-001');
  assert.throws(() => makeLink({ lang: 'de', source: 'x', campaign: 'y' }));
});

test('годная подпись зелёная', () => {
  const r = checkCaption(GOOD);
  assert.deepEqual(r.problems, []);
});

test('🔴 каждая поломка называет себя', () => {
  const cases = [
    [GOOD.replace(/https:\S+/, 'https://ndimspace.app/ru'), 'utm_source'],
    [`${GOOD} #a #b #c`, 'хэштегов 6'],
    [GOOD.replace('Пространство NDim находит', 'Ndim Space находит'), 'имя бренда'],
    [GOOD.replace('Пространство NDim находит', 'Приложение находит'), 'приложение'],
    [GOOD.replace('Оцените то, что Вы любите', 'Ищем не по фото, а по вкусам'), 'противопоставление'],
  ];
  for (const [text, expected] of cases) {
    const r = checkCaption(text);
    assert.equal(r.ok, false, expected);
    assert.ok(r.problems.some((p) => p.includes(expected)), `${expected}: ${JSON.stringify(r.problems)}`);
  }
});
