/**
 * Мост из демо внутрь продукта — проверка ВЫЧИСЛЯЕМОСТИ (`plans/67` Ш7).
 *
 * Здесь проверяется ровно то, ради чего мост строился отдельным модулем: поп-ап, итог-панель и
 * карточка-мостик обязаны выводиться из РАСЧЁТА, а не из сценария (`plans/21`, повторено в
 * `plans/26` §1). Сценарный вариант — литерал «Алиса — 61 %» в разметке — проходит любой
 * осмотр глазами и врёт с первого движения звёзд; поймать его может только проверка, которая
 * двигает числа и требует, чтобы ответ поехал за ними.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  barWidth,
  bridgeCrossed,
  bridgeLine,
  markBridgeCrossed,
  popupCorner,
  strongestPeer,
} from './handhold.ts';

const peer = (id: string, similarity: number | null) => ({ id, name: id, similarity });

test('поп-ап называет САМОГО похожего, а не первого в списке', () => {
  // Порядок нарочно не отсортирован: если бы код брал sorted[0], он назвал бы Макса.
  const top = strongestPeer([peer('max', 44), peer('alice', 61), peer('nastya', 27)]);

  assert.equal(top?.id, 'alice');
  assert.equal(top?.similarity, 61);
});

test('поп-ап ЕДЕТ ЗА ЧИСЛАМИ: сдвинулись оценки — сменился названный человек', () => {
  // Это и есть разделяющий признак «расчёт против сценария»: литерал здесь не выживает.
  const before = strongestPeer([peer('alice', 61), peer('max', 44)]);
  const after = strongestPeer([peer('alice', 12), peer('max', 44)]);

  assert.equal(before?.id, 'alice');
  assert.equal(after?.id, 'max');
});

test('персонаж без общих измерений в «самой сильной связи» не участвует', () => {
  // Инвариант ядра: |K| = 0 → связи не существует, и это не «похожесть 0», а её отсутствие.
  assert.equal(strongestPeer([peer('max', null), peer('alice', 3)])?.id, 'alice');
  assert.equal(strongestPeer([peer('max', null), peer('alice', null)]), null);
  assert.equal(strongestPeer([]), null);
});

test('бар зажат в 0…100 и переживает отсутствие связи', () => {
  assert.equal(barWidth(61), 61);
  assert.equal(barWidth(0), 0);
  assert.equal(barWidth(100), 100);
  assert.equal(barWidth(140), 100, 'ширина больше дорожки сломала бы вёрстку');
  assert.equal(barWidth(-5), 0, 'отрицательная ширина — тоже сломала бы');
  assert.equal(barWidth(null), 0, 'связи нет — бар пустой, но строка остаётся');
  assert.equal(barWidth(Number.NaN), 0);
});

test('поп-ап встаёт в угол, ДАЛЬШЕ отстоящий от лиц (урок Ш3 plans/65)', () => {
  const W = 480;

  // Лица слева — поп-ап уходит вправо.
  assert.equal(popupCorner([{ x: 60, y: 40 }, { x: 90, y: 120 }], W), 'right');
  // Лица справа — влево.
  assert.equal(popupCorner([{ x: 420, y: 40 }, { x: 390, y: 120 }], W), 'left');
  // Ничья обязана быть детерминированной, иначе поп-ап дрожал бы между углами.
  const symmetric = popupCorner([{ x: 96, y: 30 }, { x: 384, y: 30 }], W);
  assert.equal(symmetric, 'left');
  assert.equal(popupCorner([{ x: 384, y: 30 }, { x: 96, y: 30 }], W), symmetric);
});

test('лицо в верхнем углу выталкивает поп-ап в другой угол', () => {
  // Алиса стоит под углом −90°, то есть сверху по центру, и при высокой похожести
  // подходит к «мне» вплотную. Проверяем, что угол выбирается по фактическим точкам.
  const W = 480;
  assert.equal(popupCorner([{ x: 100, y: 35 }], W), 'right');
  assert.equal(popupCorner([{ x: 380, y: 35 }], W), 'left');
});

test('карточка-мостик достраивает фразу ПО ФАКТУ наличия связей (Н3)', () => {
  const full = bridgeLine('ru', true);
  assert.equal(full.lead, 'Это была демонстрация');
  assert.equal(full.tail, ' — вот Ваши настоящие связи.');
  assert.equal(full.draft, false, 'слова владельца плашкой не помечаются');

  const empty = bridgeLine('ru', false);
  assert.equal(empty.tail, ' — здесь будут Ваши настоящие связи.');
  assert.equal(empty.draft, true, 'новая строка обязана нести плашку до ответа владельца');
});

test('мостик не обещает пустоте того, чего в ней нет', () => {
  // Пустому списку нельзя говорить «вот они» — это и было ложью макета а4.
  for (const lang of ['ru', 'en'] as const) {
    assert.doesNotMatch(bridgeLine(lang, false).tail, /вот|here are/);
    assert.match(bridgeLine(lang, true).tail, /вот|here are/);
  }
});

test('в мостике НЕТ синтетических персонажей — их в базе не существует', () => {
  // Второе предложение макета а4 («Алиса, Макс и Настя останутся рядом…») описывало
  // поведение, которого в продукте нет. Проверка держит его снаружи.
  for (const lang of ['ru', 'en'] as const) {
    for (const hasCards of [true, false]) {
      const { lead, tail } = bridgeLine(lang, hasCards);
      assert.doesNotMatch(lead + tail, /Алиса|Макс|Настя|Emma|Liam|Mia|крестик/i);
    }
  }
});

test('обе ветки мостика есть на обоих языках и не пусты', () => {
  for (const lang of ['ru', 'en'] as const) {
    for (const hasCards of [true, false]) {
      const { lead, tail } = bridgeLine(lang, hasCards);
      assert.ok(lead.length > 0 && tail.length > 0);
    }
  }
});

test('отметка моста живёт во вкладке и переживает переход на другой экран', () => {
  const store = new Map<string, string>();
  const original = Reflect.get(globalThis, 'sessionStorage');
  Reflect.set(globalThis, 'sessionStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  });

  try {
    assert.equal(bridgeCrossed(), false, 'до моста карточки быть не должно');
    markBridgeCrossed();
    assert.equal(bridgeCrossed(), true);
  } finally {
    Reflect.set(globalThis, 'sessionStorage', original);
  }
});

test('недоступное хранилище мостик не роняет — он подсказка, а не опора', () => {
  const original = Reflect.get(globalThis, 'sessionStorage');
  Reflect.set(globalThis, 'sessionStorage', {
    getItem: () => {
      throw new Error('приватный режим');
    },
    setItem: () => {
      throw new Error('приватный режим');
    },
  });

  try {
    assert.doesNotThrow(() => markBridgeCrossed());
    assert.equal(bridgeCrossed(), false);
  } finally {
    Reflect.set(globalThis, 'sessionStorage', original);
  }
});
