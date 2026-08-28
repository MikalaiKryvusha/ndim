/**
 * Тесты воронки (`data/funnel.ts`, эпик `plans/74` фаза 1).
 *
 * Здесь стерегутся ровно те инварианты, которые браузером дёшево не проверить, а цена ошибки
 * в которых — ВРАНЬЁ ПРИБОРА владельцу:
 *
 *   · **ключ суток** — граница дня совпадает с часами владельца, а не с UTC
 *     (`bugs/NEW_klyuch_dnya_voronki_beryotsya_v_utc`). Сдвиг на сутки переносит события
 *     ночного выката во вчерашний день, и ворота фазы сверяли бы разные сутки;
 *   · **арифметика ряда** — соседний день считается календарно, через границу месяца и года;
 *   · **метка своего прогона** — прибор, помеченный `ndim-probe`, не двигает счётчики
 *     (`bugs/202`, дефект 2: всплески `guest_start` в дни выкатов — это мы сами);
 *   · **один визит — один шаг** — счётчик считает людей, а не клики (`EXP-0028`).
 *
 * 🔑 Момент времени приходит АРГУМЕНТОМ, а не из часов машины: тест, спрашивающий «который
 * час», проверяет машину прогона, а не функцию, и краснеет по расписанию вместо дефекта.
 *
 * Пояс владельца — `Europe/Moscow` (UTC+3, переходов нет). Тесты держат его в уме явно:
 * они называют ОЖИДАЕМЫЙ ключ, а не пересчитывают смещение своей арифметикой — иначе тест
 * повторил бы возможную ошибку кода (`AGENT_GUIDE` → «Зелёные тесты сами по себе ничего
 * не доказывают»).
 *
 * Запуск: npm test
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { dayKey, shiftDayKey, probeMarked, PROBE_MARK, claimStep } from './funnel.ts';

/** Подмена веб-хранилища: в Node его нет, а `funnel.ts` берёт его глобалем в момент вызова. */
function fakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => void map.delete(key),
    setItem: (key: string, value: string) => void map.set(key, value),
  } as Storage;
}

/** Каждому тесту — своё чистое хранилище: сессии тестов не должны перетекать друг в друга. */
function withStorage(): Storage {
  const storage = fakeStorage();
  (globalThis as { sessionStorage?: Storage }).sessionStorage = storage;
  return storage;
}

describe('Ключ суток — граница дня по часам владельца, а не по UTC', () => {
  test('🔴 ночь владельца остаётся ЕГО ночью: 22:30 UTC = 01:30 следующего дня в Москве', () => {
    // Ровно тот случай, ради которого заведён дефект: UTC-ключ дал бы 2026-08-28,
    // то есть событие ночного выката легло бы во вчерашний документ.
    assert.equal(dayKey(new Date('2026-08-28T22:30:00Z')), '2026-08-29');
  });

  test('полдень остаётся собой — правка не сдвигает обычные сутки', () => {
    assert.equal(dayKey(new Date('2026-08-28T12:00:00Z')), '2026-08-28');
  });

  test('вечер владельца НЕ уезжает в завтра (21:00 МСК = 18:00 UTC)', () => {
    // Соседний урок (EXP-0208) описывает класс формулой «вечером судит завтрашним днём».
    // Для UTC+3 это неверно, и тест фиксирует замер, а не формулировку.
    assert.equal(dayKey(new Date('2026-08-28T18:00:00Z')), '2026-08-28');
  });

  test('последняя секунда суток владельца ещё принадлежит им (20:59:59 UTC)', () => {
    assert.equal(dayKey(new Date('2026-08-28T20:59:59Z')), '2026-08-28');
  });

  test('первая секунда следующих суток владельца (21:00:00 UTC)', () => {
    assert.equal(dayKey(new Date('2026-08-28T21:00:00Z')), '2026-08-29');
  });

  test('ключ всегда двузначный по месяцу и дню — иначе строки ряда не сортируются', () => {
    assert.equal(dayKey(new Date('2026-01-05T12:00:00Z')), '2026-01-05');
  });
});

describe('Арифметика ряда — соседний день считается календарно', () => {
  test('шаг назад внутри месяца', () => {
    assert.equal(shiftDayKey('2026-08-28', -1), '2026-08-27');
  });

  test('шаг назад через границу месяца', () => {
    assert.equal(shiftDayKey('2026-08-01', -1), '2026-07-31');
  });

  test('шаг назад через границу года', () => {
    assert.equal(shiftDayKey('2026-01-01', -1), '2025-12-31');
  });

  test('високосный февраль не теряется', () => {
    assert.equal(shiftDayKey('2028-03-01', -1), '2028-02-29');
  });

  test('шаг вперёд и шаг назад возвращают на место', () => {
    assert.equal(shiftDayKey(shiftDayKey('2026-08-28', -7), 7), '2026-08-28');
  });
});

describe('Метка своего прогона — прибор не притворяется человеком (bugs/202, дефект 2)', () => {
  test('без метки шаг засчитывается', () => {
    withStorage();
    assert.equal(probeMarked(), false);
    assert.equal(claimStep('landing_view'), true);
  });

  test('🔴 с меткой шаг НЕ засчитывается — смоук перестаёт быть «человеком»', () => {
    const storage = withStorage();
    storage.setItem(PROBE_MARK, '1');
    assert.equal(probeMarked(), true);
    assert.equal(claimStep('landing_view'), false);
  });

  test('метка глушит ВСЕ шаги, а не только первый', () => {
    const storage = withStorage();
    storage.setItem(PROBE_MARK, '1');
    for (const step of ['landing_view', 'demo_touch', 'guest_start', 'door_click', 'signin_wall_view'] as const) {
      assert.equal(claimStep(step), false, `шаг ${step} обязан молчать под меткой`);
    }
  });

  test('🔑 помеченный прогон не оставляет следов и в самом хранилище', () => {
    // Иначе прибор, сходивший под меткой, «израсходовал» бы шаг для человека,
    // который сядет за ту же вкладку следующим.
    const storage = withStorage();
    storage.setItem(PROBE_MARK, '1');
    claimStep('landing_view');
    assert.equal(storage.getItem('ndim-funnel-landing_view'), null);
  });
});

describe('Один визит — один шаг каждого вида (счётчик считает людей, а не клики)', () => {
  test('повтор того же шага в той же сессии не засчитывается', () => {
    withStorage();
    assert.equal(claimStep('door_click'), true);
    assert.equal(claimStep('door_click'), false);
    assert.equal(claimStep('door_click'), false);
  });

  test('разные шаги друг друга не гасят', () => {
    withStorage();
    assert.equal(claimStep('door_click'), true);
    assert.equal(claimStep('signin_wall_view'), true);
    assert.equal(claimStep('guest_start'), true);
  });

  test('новая сессия считает заново — шаг помнится ровно один визит', () => {
    withStorage();
    assert.equal(claimStep('landing_view'), true);
    withStorage(); // другая вкладка, другое sessionStorage
    assert.equal(claimStep('landing_view'), true);
  });

  test('🔑 хранилище недоступно — шаг НЕ засчитывается и ничего не падает', () => {
    // Аналитика не имеет права ломать продукт (EXP-0028). Приватный режим и
    // заблокированное хранилище бросают на первом же обращении.
    (globalThis as { sessionStorage?: Storage }).sessionStorage = {
      getItem() {
        throw new Error('хранилище заблокировано');
      },
      setItem() {
        throw new Error('хранилище заблокировано');
      },
    } as unknown as Storage;
    assert.equal(claimStep('landing_view'), false);
  });
});
