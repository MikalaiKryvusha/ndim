/**
 * Тесты сторонней аналитики (`data/analytics.ts`, `plans/78` Ш3 и Ш4).
 *
 * 🔴 ЭТОТ НАБОР — И ЕСТЬ ИНВАРИАНТ ВЛАДЕЛЬЦА, ПЕРЕВЕДЁННЫЙ В МАШИНУ. Интервью №002 В4:
 * предмет оценки третьей стороне не уходит. До сих пор это держалось тем, что своего трекера
 * у нас не было вовсе; с приходом PostHog оно обязано держаться проверкой, а не памятью того,
 * кто в следующий раз тронет конфиг. Плановая формулировка Ш3 дословно: «настройки
 * приватности — и они ДОКАЗЫВАЮТСЯ, а не объявляются».
 *
 * Что здесь стерегут по слоям:
 *   1. **Конфиг** — автозахват, запись сессии, тепловые карты и мёртвые клики выключены; ни
 *      один из четырёх не имеет права стать `true` молча;
 *   2. **Белый список имён** — новое имя, похожее на предмет оценки, роняет прогон;
 *   3. **Паритет со своей воронкой** — все шесть её шагов обязаны быть в списке, иначе ряды
 *      нечем сверять, и эталон превращается во второе мнение;
 *   4. **Контур** — стенд и стейдж не считаются: один проект PostHog на всех, и наши прогоны
 *      легли бы в боевой ряд (болезнь `bugs/202`, вылеченная своей воронке метками);
 *   5. **Зеркало хостов стейджа** — читается ИЗ `firebase.ts`, а не набирается тут руками:
 *      копия, которую никто не сверяет, расходится на первой же правке.
 *
 * Запуск: npm test
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { FUNNEL_STEPS } from './funnel.ts';
import {
  ANALYTICS_EVENTS,
  ANALYTICS_PROPERTIES,
  POSTHOG_HOST,
  POSTHOG_TOKEN,
  analyticsHostAllowed,
  capture,
  eventNameIsSafe,
  nameSmellsOfSubject,
  posthogConfig,
  setAnalyticsClientForTests,
  whitelistLooksSafe,
} from './analytics.ts';

describe('Ш3 — настройки приватности доказываются, а не объявляются', () => {
  test('🔴 четыре выключателя инварианта №002 В4 стоят в положении «выключено»', () => {
    const config = posthogConfig();
    assert.equal(config.autocapture, false, 'автозахват пишет тексты элементов — а это названия измерений');
    assert.equal(config.disable_session_recording, true, 'кадр нашего экрана — это предмет оценки целиком');
    assert.equal(config.capture_heatmaps, false, 'координаты касания на ленте суть указание на карточку измерения');
    assert.equal(config.capture_dead_clicks, false, 'тот же довод, что у тепловых карт');
  });

  test('личных профилей не заводим, опросов не показываем, страницы считаем своими именами', () => {
    const config = posthogConfig();
    assert.equal(config.person_profiles, 'never');
    assert.equal(config.disable_surveys, true);
    assert.equal(config.capture_pageview, false, 'страницы считает свой шаг landing_view, а не автоматика');
    assert.equal(config.capture_pageleave, false);
  });

  test('регион ЕС и публичный ключ — ровно те, что решил владелец (№054 В1 = А)', () => {
    assert.equal(POSTHOG_HOST, 'https://eu.i.posthog.com', 'данные живут во Франкфурте');
    assert.equal(posthogConfig().api_host, POSTHOG_HOST);
    assert.match(POSTHOG_TOKEN, /^phc_/, 'в код едет ТОЛЬКО публичный ключ проекта');
  });

  test('🔴 читающий ключ в код не попадает — ни один `phx_` не имеет права здесь оказаться', () => {
    const source = readFileSync(new URL('./analytics.ts', import.meta.url), 'utf8');
    assert.equal(/phx_[A-Za-z0-9]/.test(source), false, 'личный ключ владельца в бандл не едет НИКОГДА');
  });
});

describe('Ш4 — список событий белый, а не «что придёт»', () => {
  test('🔴 имя вне списка не отправляется', () => {
    assert.equal(eventNameIsSafe('guest_start'), true);
    assert.equal(eventNameIsSafe('relations_view'), true);
    assert.equal(eventNameIsSafe('$autocapture'), false);
    assert.equal(eventNameIsSafe('rated_the_matrix'), false, 'имя с предметом оценки — запрет');
    assert.equal(eventNameIsSafe(''), false);
  });

  test('🔴 имя, ПОХОЖЕЕ на предмет оценки, роняет прогон, даже если кто-то внёс его в список', () => {
    const verdict = whitelistLooksSafe();
    assert.equal(
      verdict.ok,
      true,
      `в белом списке появились имена, говорящие о предмете оценки: ${verdict.offenders.join(', ')}`,
    );
  });

  test('🔴 САМ СТРАЖ СПОСОБЕН ПОКРАСНЕТЬ — проверен на выдуманных именах, а не только на своём списке', () => {
    // Если бы кто-то завтра внёс такое имя в белый список, прогон обязан упасть.
    for (const плохое of ['dimension_rated', 'movie_score_set', 'similar_shown', 'stars_picked', 'item_slug_opened']) {
      assert.equal(nameSmellsOfSubject(плохое), true, `страж пропустил имя с предметом оценки: ${плохое}`);
    }
    // И столь же обязателен обратный полюс: страж, краснеющий на честном имени, будет отключён
    // первым же человеком, которому он помешает. `guest_start` ловился подстрокой «star».
    for (const честное of [...FUNNEL_STEPS, 'relations_view', 'person_opened', 'profile_filled']) {
      assert.equal(nameSmellsOfSubject(честное), false, `ложное срабатывание стража на честном имени: ${честное}`);
    }
  });

  test('паритет со своей воронкой — все шесть её шагов в списке, иначе ряды нечем сверять', () => {
    for (const step of FUNNEL_STEPS) {
      assert.equal(
        (ANALYTICS_EVENTS as readonly string[]).includes(step),
        true,
        `шаг своей воронки «${step}» пропал из списка PostHog — эталонная сверка сломана`,
      );
    }
  });

  test('список остаётся МАЛЫМ — планка первоисточников, а не «на всякий случай»', () => {
    assert.equal(ANALYTICS_EVENTS.length, 10);
    assert.equal(new Set(ANALYTICS_EVENTS).size, ANALYTICS_EVENTS.length, 'дубль имени в списке');
    assert.ok(ANALYTICS_EVENTS.length <= 15, 'больше пятнадцати — это уже «что придёт», а не белый список');
  });

  test('свойства — закрытый список, и ни одно не знает предмета оценки', () => {
    assert.deepEqual([...ANALYTICS_PROPERTIES], ['lang', 'is_guest', 'entry', 'has_matches']);
    for (const property of ANALYTICS_PROPERTIES) {
      assert.equal(/dim|slug|title|rating|score/.test(property), false, `свойство «${property}» пахнет предметом оценки`);
    }
  });
});

describe('контур — считает только бой', () => {
  test('🔴 стенд и стейдж молчат: проект PostHog один, их события легли бы в боевой ряд', () => {
    assert.equal(analyticsHostAllowed('localhost'), false);
    assert.equal(analyticsHostAllowed('127.0.0.1'), false);
    assert.equal(analyticsHostAllowed('ndim-stage.web.app'), false);
    assert.equal(analyticsHostAllowed('ndim-stage.firebaseapp.com'), false);
  });

  /**
   * 🔴 БОЕВОЙ ДОМЕН НАЗВАН ЯВНО — дефект Д3 вердикта QA №14, вторая его половина.
   * Здесь проверялись только `ndim-space.web.app` и `ndim-space.firebaseapp.com`, а домен,
   * на котором живут настоящие посетители, в наборе не был назван ВООБЩЕ. Пока список был
   * чёрным, оба случая проходили; перепиши функцию на белый — и набор остался бы зелёным,
   * а бой замолчал бы. Материал не был способен отличить исправное от чёрного списка.
   */
  test('🔴 ЗЕРКАЛО: дом продукта из `site.ts` считается — иначе бой молчит', () => {
    const source = readFileSync(new URL('../site.ts', import.meta.url), 'utf8');
    const origin = source.match(/SITE_ORIGIN = '([^']+)'/u)?.[1];
    assert.notEqual(origin, undefined, 'в site.ts не найден SITE_ORIGIN — сверять не с чем');
    const home = new URL(origin as string).hostname;
    assert.equal(
      analyticsHostAllowed(home),
      true,
      `дом продукта «${home}» из site.ts аналитикой НЕ считается — бой молчит`,
    );
  });

  /**
   * 🔑 ЦЕНА БЕЛОГО СПИСКА, ПРИБИТАЯ К ИСТОЧНИКУ. Новый боевой адрес белый список молча не
   * посчитает — поэтому ожидаемые адреса выводятся из `.firebaserc`, а не набираются здесь
   * руками. Заведут третий сайт хостинга — этот случай покраснеет раньше, чем ряд опустеет.
   */
  test('🔴 ЗЕРКАЛО: служебные адреса Firebase всех сайтов из `.firebaserc` считаются', () => {
    type Проект = { hosting?: Record<string, string[]> };
    const rc = JSON.parse(readFileSync(new URL('../../../.firebaserc', import.meta.url), 'utf8')) as {
      targets?: Record<string, Проект>;
    };
    const sites = Object.values(rc.targets ?? {})
      .flatMap((проект) => Object.values(проект.hosting ?? {}))
      .flat();
    assert.ok(sites.length > 0, 'в .firebaserc не нашлось ни одного сайта хостинга');
    for (const site of sites) {
      for (const host of [`${site}.web.app`, `${site}.firebaseapp.com`]) {
        assert.equal(
          analyticsHostAllowed(host),
          true,
          `адрес «${host}» сайта «${site}» из .firebaserc не считается — белый список отстал от источника`,
        );
      }
    }
  });

  test('🔴 канал предпросмотра и «второй стейдж» МОЛЧАТ — их ловил только белый список', () => {
    // Живой прогон судьи по чёрному списку: все три считались. Теперь ни один.
    assert.equal(analyticsHostAllowed('ndim-space--pr42-a1b2c3d4.web.app'), false);
    assert.equal(analyticsHostAllowed('ndim-stage-2.web.app'), false);
    assert.equal(analyticsHostAllowed('192.168.1.50'), false);
    assert.equal(analyticsHostAllowed('ndimspace.app.evil.example'), false);
  });

  test('пустой хост не считается — «нет хоста» это не «бой»', () => {
    assert.equal(analyticsHostAllowed(''), false);
  });

  test('🔑 ЗЕРКАЛО: список хостов стейджа сходится с `firebase.ts` — копия под стражем, а не на веру', () => {
    const source = readFileSync(new URL('../firebase.ts', import.meta.url), 'utf8');
    const match = source.match(/const STAGE_HOSTS = \[([^\]]+)\]/u);
    assert.notEqual(match, null, 'в firebase.ts не найден STAGE_HOSTS — зеркало сверять не с чем');
    const fromFirebase = [...(match?.[1] ?? '').matchAll(/'([^']+)'/gu)].map((hit) => hit[1]);
    assert.ok(fromFirebase.length > 0, 'список хостов стейджа в firebase.ts пуст');
    for (const host of fromFirebase) {
      assert.equal(
        analyticsHostAllowed(host),
        false,
        `хост стейджа «${host}» из firebase.ts не глушится аналитикой — зеркала разъехались`,
      );
    }
  });
});

/**
 * 🔴🔴 ЮНИТ НА САМО РЕШЕНИЕ ОБ ОТПРАВКЕ — дефект Д2 вердикта QA №14.
 *
 * Судья сформулировала так, что лучше не скажешь: «Набор стережёт ИНГРЕДИЕНТЫ
 * (`posthogConfig()`, `eventNameIsSafe()`, `analyticsHostAllowed()`, `whitelistLooksSafe()`)
 * и ни разу — БЛЮДО». Три мутации ПРЯМО В ТЕЛЕ `capture()` оставили набор зелёным:
 *   · снята проверка контура — стенд и стейдж начинают слать в боевой ряд;
 *   · снят белый список на отправке — летит любое имя;
 *   · снята метка прибора — смоуки снова считаются людьми (`bugs/202`).
 * Причина простая: набор `capture()` даже не импортировал.
 *
 * 🔑 И это стояло рядом с собственным утверждением разведдока: «инвариант держит МАШИНА, а не
 * дисциплина». До этого набора последнюю милю держала дисциплина. Здесь она оплачена.
 *
 * Клиент подставной (`setAnalyticsClientForTests`), SDK не грузится вовсе: `capture()` идёт за
 * ним только при `client === null`. Проверяется ровно то, чего требовал вердикт, — ДОШЛО ли до
 * клиента.
 */
describe('capture() — блюдо, а не ингредиенты (Д2 вердикта №14)', () => {
  // `props` объявлено НЕобязательным и допускающим `undefined` сразу: проект стоит на
  // `exactOptionalPropertyTypes`, где «поля нет» и «поле есть, но undefined» — разные вещи,
  // а клиент SDK второй аргумент вправе не передать вовсе.
  type Звонок = { event: string; props?: Record<string, unknown> | undefined };

  /** Ставит мир браузера: хост, метку прибора и подставного клиента. Возвращает журнал звонков. */
  const постановка = ({ hostname = 'ndimspace.app', метка = false } = {}): Звонок[] => {
    const звонки: Звонок[] = [];
    (globalThis as Record<string, unknown>).location = { hostname };
    // probeMarked() читает sessionStorage и на бросок отвечает «метки нет» — подменяем честно.
    (globalThis as Record<string, unknown>).sessionStorage = {
      getItem: () => (метка ? '1' : null),
    };
    setAnalyticsClientForTests({ capture: (event, props) => звонки.push({ event, props }) });
    return звонки;
  };

  const убрать = () => {
    setAnalyticsClientForTests(null);
    delete (globalThis as Record<string, unknown>).location;
    delete (globalThis as Record<string, unknown>).sessionStorage;
  };

  test('на боевом хосте честное имя ДОХОДИТ до клиента', async () => {
    const звонки = постановка();
    try {
      await capture('relations_view', { has_matches: true });
      assert.deepEqual(звонки, [{ event: 'relations_view', props: { has_matches: true } }]);
    } finally {
      убрать();
    }
  });

  test('🔴 стенд НЕ шлёт — иначе прогоны легли бы в боевой ряд', async () => {
    const звонки = постановка({ hostname: 'localhost' });
    try {
      await capture('landing_view');
      assert.deepEqual(звонки, [], 'со стенда событие дошло до клиента');
    } finally {
      убрать();
    }
  });

  test('🔴 стейдж НЕ шлёт — проект PostHog у нас ОДИН, ряд был бы общий', async () => {
    const звонки = постановка({ hostname: 'ndim-stage.web.app' });
    try {
      await capture('landing_view');
      assert.deepEqual(звонки, [], 'со стейджа событие дошло до клиента');
    } finally {
      убрать();
    }
  });

  test('🔴 под меткой прибора НЕ шлёт — иначе смоуки снова люди (bugs/202)', async () => {
    const звонки = постановка({ метка: true });
    try {
      await capture('landing_view');
      assert.deepEqual(звонки, [], 'помеченный прогон дошёл до клиента');
    } finally {
      убрать();
    }
  });

  test('🔴 имя вне белого списка НЕ шлёт — на отправке, а не только в прогоне набора', async () => {
    const звонки = постановка();
    try {
      await capture('rating_saved_dimension_matrix' as never);
      assert.deepEqual(звонки, [], 'имя вне списка дошло до клиента');
    } finally {
      убрать();
    }
  });

  test('🔴 свойство вне списка отсекается, а честное рядом — доезжает', async () => {
    const звонки = постановка();
    try {
      await capture('rating_saved', { dim_title: 'Матрица', is_guest: true } as never);
      assert.deepEqual(звонки, [{ event: 'rating_saved', props: { is_guest: true } }]);
    } finally {
      убрать();
    }
  });

  test('🔑 КОНТРОЛЬ: без хоста браузера capture() молчит и НЕ бросает', async () => {
    // Серверный рендер зовёт тот же модуль; падение здесь уронило бы страницу целиком.
    setAnalyticsClientForTests({ capture: () => { throw new Error('клиента звать не должны'); } });
    try {
      await capture('landing_view');
    } finally {
      убрать();
    }
  });
});
