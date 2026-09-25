/**
 * Тесты воронки (`data/funnel.ts`, эпик `plans/74` фаза 1).
 *
 * Здесь стерегутся ровно те инварианты, которые браузером дёшево не проверить, а цена ошибки
 * в которых — ВРАНЬЁ ПРИБОРА владельцу:
 *
 *   · **ключ суток** — граница дня совпадает с часами владельца, а не с UTC
 *     (`bugs/204_klyuch_dnya_voronki_beryotsya_v_utc`). Сдвиг на сутки переносит события
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

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { dayKey, shiftDayKey, probeMarked, PROBE_MARK, claimStep, releaseStep, entryOf, ANALYTICS_ENTRIES, landingTrackOptions } from './funnel.ts';

/*
 * МЕСТО ВХОДА — слово двери в адресе `?guest=<слово>` (`plans/105` Б2, 2026-09-25).
 *
 * Два инварианта, и оба про враньё ряда владельцу:
 *   · слово вне союза читается как `direct`, а не теряется: иначе у части гостей места входа не
 *     было бы вовсе, и число недели делило бы людей на корзины без одной, безымянной;
 *   · каждая дверь в коде говорит словом ИЗ СОЮЗА. Дверь с опечаткой (`?guest=catalogcard`)
 *     продукт не уронит — человек войдёт гостем, — но в ряд она молча запишет `direct`, и
 *     приток с этой двери исчезнет из разреза. Ловит это только сверка кода с союзом.
 */
describe('Место входа — слово двери → союз мест входа', () => {
  test('каждое слово союза читается как есть', () => {
    for (const слово of ANALYTICS_ENTRIES) assert.equal(entryOf(слово), слово);
  });

  test('🔴 слово вне союза — прямой заход, а не пустота и не само слово', () => {
    assert.equal(entryOf('1'), 'direct', 'старые ссылки `?guest=1` — прямой заход');
    assert.equal(entryOf(null), 'direct');
    assert.equal(entryOf(''), 'direct');
    assert.equal(entryOf('matrix-1999-a1b2'), 'direct', 'слаг измерения не уезжает местом входа');
    assert.equal(entryOf('LANDING'), 'direct', 'регистр не угадывается: союз закрыт буквально');
  });

  test('🔑 каждая дверь в гостя в коде говорит словом из союза', () => {
    const корень = join(import.meta.dirname, '..', '..');
    const файлы = (readdirSync(корень, { recursive: true }) as string[])
      .filter((путь) => /\.(svelte|ts|js)$/.test(путь) && !/\.test\.ts$/.test(путь));
    const слова = new Map<string, string>();
    for (const путь of файлы) {
      readFileSync(join(корень, путь), 'utf8').split('\n').forEach((строка, номер) => {
        // Судится КОД, а не проза: комментарии цитируют прежний адрес `/profile?guest=1` как историю.
        if (/^\s*(\*|\/\/|\/\*|<!--)/.test(строка)) return;
        for (const найдено of строка.matchAll(/\/profile\?guest=([A-Za-z0-9_-]+)/g)) {
          слова.set(`${путь}:${номер + 1}`, найдено[1]);
        }
      });
    }
    // Контроль прибора: дверей пять (главная, лендинг, карточка каталога, вход, «начать заново»),
    // и ноль найденных значил бы «смотрю не туда», а не «все двери чисты».
    assert.ok(слова.size >= 5, `найдено дверей ${слова.size} из ожидаемых ≥ 5 — сверка смотрит не туда`);
    const чужие = [...слова].filter(([, слово]) => !(ANALYTICS_ENTRIES as readonly string[]).includes(слово));
    assert.deepEqual(чужие, [], 'дверь говорит словом вне союза — в ряд она запишет `direct`');
  });
});

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

/*
 * ВИЗИТ КОНЧИЛСЯ, ВКЛАДКА ОСТАЛАСЬ — `bugs/NEW_restart_guest_start_swallowed_in_same_tab.md`.
 * «Начать заново» рождает нового гостя той же вкладкой; вкладка 7+ суток держала шаг прежнего, и событие съедалось.
 */
describe('Отпущенный шаг — «Начать заново» рождает нового гостя той же вкладкой', () => {
  test('🔴 отпущенный guest_start занимается снова — новый гость засчитан', () => {
    withStorage();
    assert.equal(claimStep('guest_start'), true);
    assert.equal(claimStep('guest_start'), false);
    releaseStep('guest_start');
    assert.equal(claimStep('guest_start'), true);
  });

  test('отпущенный landing_view занимается снова — функция читает шаг, а не зашитый guest_start (мутант М5 суда)', () => {
    withStorage();
    assert.equal(claimStep('landing_view'), true);
    releaseStep('landing_view');
    assert.equal(claimStep('landing_view'), true);
  });

  test('отпускается ровно названный шаг — соседние по-прежнему заняты', () => {
    withStorage();
    claimStep('guest_start');
    claimStep('landing_view');
    releaseStep('guest_start');
    assert.equal(claimStep('landing_view'), false);
  });

  test('🔑 хранилище недоступно — отпускание ничего не роняет', () => {
    (globalThis as { sessionStorage?: Storage }).sessionStorage = {
      removeItem() {
        throw new Error('хранилище заблокировано');
      },
    } as unknown as Storage;
    assert.doesNotThrow(() => releaseStep('guest_start'));
  });

  test('🔴 проводка: «Начать заново» отпускает guest_start после выхода и ДО ухода на дверь restart', () => {
    const src = readFileSync('src/routes/profile/+page.svelte', 'utf8');
    const body = src.slice(src.indexOf('async function restartAsGuest()'), src.indexOf("location.href = '/profile?guest=restart'"));
    assert.ok(body.length > 0, 'функция restartAsGuest и её дверь найдены');
    const out = body.indexOf('await signOutUser()');
    const release = body.indexOf("releaseStep('guest_start')");
    assert.ok(out >= 0 && release > out, 'releaseStep стоит после signOutUser и до location.href');
  });
});

/*
 * ГЛАВНАЯ СЧИТАЕТ ТОЛЬКО В POSTHOG — слово владельца, интервью №078, В1 = Г (2026-09-09):
 * «только аналитикой постхог, мы свою БД фаерстор не грузим запросами».
 *
 * Новая V1 главной (`plans/106`) поначалу звала на корне обычный `track()`, а он пишет ещё и свой счётчик в
 * Firestore — решение владельца было нарушено молча (находка суда 2026-09-25). Здесь стерегутся две вещи:
 *   · решение по входам — корень без своего счётчика, `/ru` и `/en` со счётчиком, как до новой V1;
 *   · КАЖДЫЙ вызов `track` в компоненте главной идёт через это решение: новый шаг, дописанный голым
 *     `track('…')`, на корне снова писал бы в Firestore, и поведенческий тест этого не увидел бы.
 */
describe('Главная: корень считает только в PostHog (№078 В1 = Г)', () => {
  test('корень `/` — без своего счётчика; `/ru` и `/en` — со счётчиком', () => {
    assert.equal(landingTrackOptions('root').ownCounter, false);
    assert.equal(landingTrackOptions('landing').ownCounter, true);
  });

  test('🔑 каждый вызов `track` в компоненте главной несёт решение страницы', () => {
    const файл = join(import.meta.dirname, '..', 'ui', 'landing', 'LandingV1.svelte');
    const вызовы = [...readFileSync(файл, 'utf8').matchAll(/\btrack\(([^)]*)\)/g)].map((m) => m[1]);
    // Контроль прибора: на главной два шага (`landing_view`, `demo_touch`) в трёх местах; ноль вызовов значил бы
    // «смотрю не туда», а не «все вызовы честны».
    assert.ok(вызовы.length >= 3, `найдено вызовов track ${вызовы.length} из ожидаемых ≥ 3 — сверка смотрит не туда`);
    const голые = вызовы.filter((аргументы) => !/,\s*COUNT\s*$/.test(аргументы));
    assert.deepEqual(голые, [], 'вызов track без решения страницы — на корне он снова пишет в Firestore');
  });
});
