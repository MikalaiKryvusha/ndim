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
 *   4. **Контур** — считаются бой И стейдж, а стенд молчит; каждое событие несёт `env`, и по
 *      нему ряд различается внутри одного проекта PostHog (слово владельца 2026-08-29). Стенд
 *      остаётся ОТРИЦАТЕЛЬНЫМ КОНТРОЛЕМ: на нём не уходит ни одного события;
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
  ANALYTICS_CONTOURS,
  ANALYTICS_ENTRIES,
  ANALYTICS_EVENTS,
  ANALYTICS_PROPERTIES,
  contourOf,
  POSTHOG_HOST,
  POSTHOG_TOKEN,
  analyticsHostAllowed,
  capture,
  eventNameIsSafe,
  nameSmellsOfSubject,
  posthogConfig,
  propertyValueIsSafe,
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
    // 🆕 `env` добавлен словом владельца 2026-08-29 («даём юзеру свойство — на каком он
    // окружении»). Список ОСТАЁТСЯ закрытым: расширение законно, открытость — нет.
    assert.deepEqual([...ANALYTICS_PROPERTIES], ['lang', 'is_guest', 'entry', 'has_matches', 'env']);
    for (const property of ANALYTICS_PROPERTIES) {
      assert.equal(/dim|slug|title|rating|score/.test(property), false, `свойство «${property}» пахнет предметом оценки`);
    }
  });
});

describe('контур — считает бой И стейдж, различая их свойством', () => {
  /*
   * 🔄 ЭТОТ СЛУЧАЙ ПЕРЕПИСАН 2026-08-29 ПО СЛОВУ ВЛАДЕЛЬЦА, и старое ожидание названо, а не
   * стёрто. Он требовал `analyticsHostAllowed('ndim-stage.web.app') === false` с доводом «ряд
   * один, события стейджа легли бы к боевым». Слово владельца: «*и стейдж и прод — всё шлём в
   * прод один проект постхога. юзеру даём свойство — на каком он окружении*».
   * Ряд остался один; события стали РАЗЛИЧИМЫ. Стенд — по-прежнему `false`, и это единственный
   * отрицательный контроль фичи: он проверяет, что белый список вообще что-то отсекает.
   */
  test('🔴 СТЕНД молчит — единственный отрицательный контроль фичи', () => {
    assert.equal(analyticsHostAllowed('localhost'), false);
    assert.equal(analyticsHostAllowed('127.0.0.1'), false);
    assert.equal(contourOf('localhost'), null);
  });

  test('🆕 СТЕЙДЖ считается и опознаётся как `stage`', () => {
    assert.equal(analyticsHostAllowed('ndim-stage.web.app'), true);
    assert.equal(contourOf('ndim-stage.web.app'), 'stage');
    assert.equal(contourOf('ndim-stage.firebaseapp.com'), 'stage');
  });

  test('бой опознаётся как `prod`, чужой адрес — никак', () => {
    assert.equal(contourOf('ndimspace.app'), 'prod');
    assert.equal(contourOf('ndimspace.app.evil.example'), null);
    assert.equal(contourOf(''), null);
  });

  /**
   * 🔒 ПАРА «СОЮЗ ПРОДУКТА ↔ `CONTOURS`» — имена не выдуманы здесь.
   *
   * Направление пары то же, что у всей семьи контуров: истина — продукт, зеркало — `tools/`
   * (`contours.mjs` сам читает `firebase.ts` и падает при расхождении). Поэтому сверяет ТЕСТ, а
   * не импорт продукта: `contours.mjs` тянет `node:fs`, и импорт из `analytics.ts` увёз бы
   * Node-код в браузерный бандл. Форма согласована с QA перед кодом.
   */
  test('🔒 ПАРА: союз контуров равен именам из `tools/lib/contours.mjs`', () => {
    /*
     * 🔴 ЧИТАЕМ ИСХОДНЫМ ТЕКСТОМ, А НЕ ИМПОРТОМ — и это поймано на себе, а не предположено.
     * Первая редакция делала `await import('../../../tools/lib/contours.mjs')`. Юниты позеленели,
     * а `npm run typecheck` СТАЛ КРАСНЫМ: импорт втягивает `.mjs` в TS-программу, и она честно
     * жалуется на пятерых неявных `any` внутри чужого модуля (`TS7006`, `TS7053`). То есть я
     * чинил бы чужой файл ради своей проверки. Чтение текстом — тот же приём, каким этот набор
     * уже сверяет `site.ts`, `.firebaserc` и `firebase.ts`; направление пары прежнее:
     * истина — продукт, зеркало — `tools/`.
     */
    const source = readFileSync(new URL('../../../tools/lib/contours.mjs', import.meta.url), 'utf8');
    const fromTools = [...source.matchAll(/^\t\tname: '([a-z]+)',$/gmu)].map((hit) => hit[1]).sort();
    assert.ok(fromTools.length > 0, 'в contours.mjs не найдено ни одного имени контура — сверять не с чем');
    assert.deepEqual([...ANALYTICS_CONTOURS].sort(), fromTools, 'союз контуров разъехался с contours.mjs');
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

  /*
   * 🔄 ЗЕРКАЛО ОСТАЛОСЬ, ОЖИДАНИЕ ПЕРЕВЕРНУЛОСЬ. Прежде оно требовало, чтобы хосты стейджа из
   * `firebase.ts` аналитикой ГЛУШИЛИСЬ; теперь — чтобы они считались и опознавались как `stage`.
   * Сверяемая пара та же и по тому же источнику: копия в `analytics.ts` живёт потому, что импорт
   * `firebase.ts` увёз бы SDK Firebase в чанк аналитики (`EXP-0028`), а не потому, что так проще.
   */
  test('🔑 ЗЕРКАЛО: список хостов стейджа сходится с `firebase.ts` — копия под стражем, а не на веру', () => {
    const source = readFileSync(new URL('../firebase.ts', import.meta.url), 'utf8');
    const match = source.match(/const STAGE_HOSTS = \[([^\]]+)\]/u);
    assert.notEqual(match, null, 'в firebase.ts не найден STAGE_HOSTS — зеркало сверять не с чем');
    const fromFirebase = [...(match?.[1] ?? '').matchAll(/'([^']+)'/gu)].map((hit) => hit[1]);
    assert.ok(fromFirebase.length > 0, 'список хостов стейджа в firebase.ts пуст');
    for (const host of fromFirebase) {
      assert.equal(
        contourOf(host),
        'stage',
        `хост стейджа «${host}» из firebase.ts не опознан аналитикой как stage — зеркала разъехались`,
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
      assert.deepEqual(звонки, [{ event: 'relations_view', props: { has_matches: true, env: 'prod' } }]);
    } finally {
      убрать();
    }
  });

  /*
   * 🔴 САМАЯ ЦЕННАЯ ПОЛОВИНА ЧИСЛА ЦЕННОСТИ — ЭТО `false`, И У НЕЁ НЕ БЫЛО НИ ОДНОГО ЮНИТА.
   *
   * `relations_view` заведён ради вопроса «сработал ли продукт для человека», и интересен в нём
   * прежде всего тот, кому НЕ показали никого: `has_matches: true` меряет успех, `false` —
   * ровно ту неудачу, ради поиска которой событие и существует.
   *
   * Случай выше проверял только `true`. Между тем `capture()` отсеивает свойства строкой
   * `value === undefined`, и правка её на соблазнительное `if (!value) continue` прошла бы ВСЕ
   * прежние проверки: `has_matches: false` молча исчезал бы из события, ряд показывал бы одни
   * успехи, и объяснить это можно было бы «людям всегда кого-то находило». Ноль здесь
   * неотличим от честного нуля — тот же класс, ради которого написан весь страж воронки.
   *
   * Проверка доказана мутацией: `value === undefined` → `!value` роняет ровно этот случай
   * (и только его), а `is_guest: false` в соседнем случае ловит ту же правку со второй стороны.
   */
  test('🔴 has_matches: false ДОЕЗЖАЕТ — «никого не показали» это факт, а не пустота', async () => {
    const звонки = постановка();
    try {
      await capture('relations_view', { has_matches: false });
      assert.deepEqual(
        звонки,
        [{ event: 'relations_view', props: { has_matches: false, env: 'prod' } }],
        'ложное значение отсеялось вместе с отсутствующим — половина числа ценности потеряна',
      );
    } finally {
      убрать();
    }
  });

  test('🔴 два оставшихся события белого списка доходят так же — уравнение проверено, а не предположено', async () => {
    const звонки = постановка();
    try {
      await capture('person_opened');
      await capture('profile_filled', { is_guest: false });
      assert.deepEqual(звонки, [
        { event: 'person_opened', props: { env: 'prod' } },
        { event: 'profile_filled', props: { is_guest: false, env: 'prod' } },
      ]);
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

  /*
   * 🔄 ПЕРЕВЁРНУТ 2026-08-29 СЛОВОМ ВЛАДЕЛЬЦА, старое ожидание названо: случай требовал
   * «со стейджа НЕ уходит ничего». Теперь уходит — и обязано уходить ПОМЕЧЕННЫМ.
   * 🔑 Именно этот случай делает фичу проверяемой до выката: раньше единственный контур, где
   * событие вообще могло родиться, был боевым, и «зелёное» на стейдже было зелёным от того,
   * что проверка не способна покраснеть (`TESTING_FRAMEWORK.md`, ворота выката).
   */
  test('🆕 стейдж ШЛЁТ — и событие помечено `env: stage`, иначе ряды неразличимы', async () => {
    const звонки = постановка({ hostname: 'ndim-stage.web.app' });
    try {
      await capture('landing_view');
      assert.deepEqual(звонки, [{ event: 'landing_view', props: { env: 'stage' } }]);
    } finally {
      убрать();
    }
  });

  /*
   * 🔴 ГАРАНТИЯ «КОНТУР ЕСТЬ ВСЕГДА» — проверяется на КАЖДОМ имени белого списка, а не на том,
   * где о ней вспомнили. Событие без контура в общем ряду хуже отсутствующего: ряд один на оба
   * окружения, и неразличимое событие портит обе выборки сразу.
   * Мутация, ради которой случай и написан (её же обещала поставить судья): убрать строку
   * `safeProps.env = contour` — этот случай обязан покраснеть, и покраснеть на всех десяти.
   */
  test('🔴 `env` приходит на КАЖДОМ событии белого списка — все десять, а не выборочно', async () => {
    const звонки = постановка();
    try {
      for (const event of ANALYTICS_EVENTS) await capture(event);
      assert.equal(звонки.length, ANALYTICS_EVENTS.length, 'дошли не все события');
      const без = звонки.filter((з) => (з.props as Record<string, unknown> | undefined)?.env !== 'prod');
      assert.deepEqual(
        без.map((з) => з.event),
        [],
        'эти события ушли БЕЗ контура — в общем ряду они неразличимы',
      );
    } finally {
      убрать();
    }
  });

  /*
   * Контур — факт о мире, а не мнение места вызова. Вызов из JS мимо типов может прислать `env`;
   * отправка обязана его перезаписать, а не поверить. Без этого случая «всегда» означало бы
   * «всегда какое-нибудь», и стейдж мог бы объявить себя боем одной строкой.
   */
  test('🔴 присланный `env` ПЕРЕЗАПИСЫВАЕТСЯ настоящим контуром, а не принимается на веру', async () => {
    const звонки = постановка({ hostname: 'ndim-stage.web.app' });
    try {
      await capture('landing_view', { env: 'prod' } as never);
      assert.deepEqual(звонки, [{ event: 'landing_view', props: { env: 'stage' } }],
        'стейдж объявил себя боем — контур взят у вызывающего, а не у location');
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
      assert.deepEqual(звонки, [{ event: 'rating_saved', props: { is_guest: true, env: 'prod' } }]);
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

/**
 * 🔴 ИНВАРИАНТ ПО ЗНАЧЕНИЯМ, А НЕ ТОЛЬКО ПО КЛЮЧАМ — дефект Д4 вердикта QA №14.
 *
 * Список ключей был закрыт, значения клались как есть. Шапка обещала больше, чем делала:
 * «свойства с идентификатором или названием измерения запрещены» — а запрещены были ИМЕНА
 * свойств. Судья назвала и место, где дыра откроется: `entry` объявлено, не используется ни
 * разу и есть «ровно то имя, в которое первый же будущий вызов положит слаг».
 *
 * ⚠️ Тип здесь не защита, а удобство автора: он исчезает при сборке. Поэтому все случаи ниже
 * идут через `as never` — то есть ровно так, как в продукт и попадёт обход типов.
 */
describe('значения свойств — закрытые союзы (Д4 вердикта №14)', () => {
  test('🔴 СЛАГ В entry НЕ УЕЗЖАЕТ — тот самый случай, который назвала судья', () => {
    assert.equal(propertyValueIsSafe('entry', 'matrix-1999-a1b2'), false);
    assert.equal(propertyValueIsSafe('entry', 'catalog_card'), true);
  });

  test('lang — только два языка продукта', () => {
    assert.equal(propertyValueIsSafe('lang', 'ru'), true);
    assert.equal(propertyValueIsSafe('lang', 'en'), true);
    assert.equal(propertyValueIsSafe('lang', 'Матрица'), false);
    assert.equal(propertyValueIsSafe('lang', 'de'), false, 'третий язык добавляется в союз, а не приезжает строкой');
  });

  /*
   * 🆕 КОНТУР судится на ЗНАЧЕНИИ, а не только на ключе (Д4 вердикта №14 — тот же класс).
   *
   * 🔴 `'stand'` отбивается НАРОЧНО: стенд обязан молчать, он единственный отрицательный
   * контроль фичи. Значения, которого нет в союзе, — это и есть замок на «впишем localhost для
   * симметрии»: сломать придётся ОБА места, список хостов и союз значений, а не одно.
   *
   * 🔑 Случай стоит ОТДЕЛЬНЫМ тестом, а не строками в соседнем: мутация «снять ветку `env` из
   * `propertyValueIsSafe`» сперва роняла случай с именем «булевы — именно булевы», и красная
   * строка называла не тот предмет. Красный обязан говорить, ЧТО сломано, — иначе следующая
   * сессия чинит соседа.
   */
  test('🆕 контур — закрытый союз, и `stand` в него не входит', () => {
    assert.equal(propertyValueIsSafe('env', 'prod'), true);
    assert.equal(propertyValueIsSafe('env', 'stage'), true);
    assert.equal(propertyValueIsSafe('env', 'stand'), false, 'стенд не имеет права оказаться в ряду');
    assert.equal(propertyValueIsSafe('env', 'localhost'), false);
    assert.equal(propertyValueIsSafe('env', true), false);
  });

  test('булевы — именно булевы, а не «правдоподобная строка»', () => {
    assert.equal(propertyValueIsSafe('is_guest', true), true);
    assert.equal(propertyValueIsSafe('has_matches', false), true);
    assert.equal(propertyValueIsSafe('is_guest', 'true'), false);
    assert.equal(propertyValueIsSafe('has_matches', 1), false);
  });

  test('🔑 каждое место входа союза признаётся — иначе союз молча сузился бы', () => {
    for (const место of ANALYTICS_ENTRIES) {
      assert.equal(propertyValueIsSafe('entry', место), true, `место входа «${место}» отбито своим же союзом`);
    }
  });

  test('🔴 БЛЮДО: capture() выбрасывает значение вне союза и оставляет честное рядом', async () => {
    const звонки: { event: string; props?: Record<string, unknown> | undefined }[] = [];
    (globalThis as Record<string, unknown>).location = { hostname: 'ndimspace.app' };
    (globalThis as Record<string, unknown>).sessionStorage = { getItem: () => null };
    setAnalyticsClientForTests({ capture: (event, props) => звонки.push({ event, props }) });
    try {
      await capture('rating_saved', { entry: 'matrix-1999-a1b2', is_guest: true } as never);
      assert.deepEqual(звонки, [{ event: 'rating_saved', props: { is_guest: true, env: 'prod' } }],
        'слаг уехал в значении свойства — инвариант №002 В4 нарушен');
    } finally {
      setAnalyticsClientForTests(null);
      delete (globalThis as Record<string, unknown>).location;
      delete (globalThis as Record<string, unknown>).sessionStorage;
    }
  });
});

/**
 * 🔑 РАЗДЕЛЕНИЕ ТРУДА МЕЖДУ ДВУМЯ ЗАЩИТАМИ — прибито юнитом, чтобы комментарий больше не
 * расходился с кодом (дефект Д6 вердикта QA №14: шапка обещала двойную проверку на отправке,
 * код делал одну).
 *
 * Случай стережёт ОБА полюса. Если кто-то «починит» код по старому комментарию и добавит
 * проверку слов прямо в `eventNameIsSafe`, первый случай покраснеет: `rating_saved` — честное
 * имя из белого списка, и отправку оно проходить обязано.
 */
describe('две защиты имени работают в РАЗНОЕ время (Д6 вердикта №14)', () => {
  test('на ОТПРАВКЕ судит только белый список — слова туда не лезут', () => {
    // `rating_saved` пахнет словом `rating` и всё равно разрешён: он в списке.
    assert.equal(nameSmellsOfSubject('rating_saved'), true, 'слово rating в имени есть — это исходное условие случая');
    assert.equal(eventNameIsSafe('rating_saved'), true, 'отправка обязана судить ТОЛЬКО по списку');
  });

  test('слова судят САМ СПИСОК во время прогона набора, а не отправку', () => {
    // Имя, пахнущее предметом оценки, отправку не проходит просто потому, что его нет в списке.
    assert.equal(eventNameIsSafe('dimension_rated'), false);
    assert.equal(nameSmellsOfSubject('dimension_rated'), true);
    // А сторож списка сегодня чист — и это его работа, а не работа отправки.
    assert.equal(whitelistLooksSafe().ok, true);
  });
});
