/**
 * Тесты кэша данных экранов (`ideas/18`, `data/cache.ts`).
 *
 * Здесь стерегутся инварианты, которые НЕЛЬЗЯ проверить браузером дёшево и надёжно, а цена
 * ошибки в которых — либо деньги, либо приватность:
 *
 *   · **приватность** — кэш персональный: сменился человек, и содержимое обязано исчезнуть.
 *     Это главный тест файла. Забытая строка очистки превращает «кэш сессии» в дыру, через
 *     которую следующий вошедший за той же вкладкой увидит чужой профиль и чужие связи;
 *   · **экономия** — свежее отдаётся из памяти и НЕ порождает чтения (канон владельца
 *     «экономить запросы»), а устаревшее перечитывается;
 *   · **дедупликация** — два экрана, спросившие одно и то же разом, дают один запрос;
 *   · **инвалидация по префиксу** — моя оценка гасит родственные ключи, а не один свой.
 *
 * Часы здесь настоящие (`Date.now()`), поэтому окна свежести в тестах — миллисекунды, а не
 * минуты: тест обязан быть быстрым и не зависеть от таймеров.
 *
 * Запуск: npm test
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { FRESH, cacheOwner, cacheSize, cached, forgetAll, invalidate, own, peek, remember } from './cache.ts';
import { HEARTBEAT_TOLERANCE } from '../model/stats.ts';

/** Счётчик обращений: каждая «загрузка» отмечается, чтобы видеть, был ли поход в базу. */
function counted<T>(value: T) {
  const calls = { n: 0 };
  return {
    calls,
    load: async () => {
      calls.n += 1;
      return value;
    },
  };
}

describe('кэш данных экранов', () => {
  test('свежее отдаётся из памяти и НЕ ходит в базу', async () => {
    forgetAll();
    const source = counted('первое');

    assert.equal(await cached('k', FRESH.mine, source.load), 'первое');
    assert.equal(await cached('k', FRESH.mine, source.load), 'первое');
    assert.equal(await cached('k', FRESH.mine, source.load), 'первое');

    assert.equal(source.calls.n, 1, 'три запроса экрана обязаны стоить одно чтение');
  });

  test('устаревшее перечитывается — кэш не превращается в вечную правду', async () => {
    forgetAll();
    let answer = 'старое';
    const calls = { n: 0 };
    const load = async () => {
      calls.n += 1;
      return answer;
    };

    assert.equal(await cached('k', 1, load), 'старое');
    await new Promise((resolve) => setTimeout(resolve, 5)); // окно свежести — 1 мс, оно истекло
    answer = 'новое';

    assert.equal(await cached('k', 1, load), 'новое');
    assert.equal(calls.n, 2);
  });

  test('peek отдаёт лежащее в памяти синхронно — это и есть первый кадр без лоадера', async () => {
    forgetAll();
    assert.equal(peek('k'), undefined, 'пусто — значит заход первый, и лоадер честен');

    await cached('k', FRESH.mine, async () => 'данные');
    assert.equal(peek('k'), 'данные');
  });

  test('peek НЕ проверяет свежесть: устаревшее показываем, пока освежаем', async () => {
    forgetAll();
    await cached('k', 1, async () => 'устареет через миллисекунду');
    await new Promise((resolve) => setTimeout(resolve, 5));

    // Это не недосмотр, а сам смысл stale-while-revalidate (RFC 5861, `researches/17`):
    // показать последнее известное немедленно и освежить в фоне.
    assert.equal(peek('k'), 'устареет через миллисекунду');
  });

  test('параллельные запросы одного ключа дедуплицируются в одно чтение', async () => {
    forgetAll();
    const source = counted('одно');

    const [a, b, c] = await Promise.all([
      cached('k', FRESH.mine, source.load),
      cached('k', FRESH.mine, source.load),
      cached('k', FRESH.mine, source.load),
    ]);

    assert.deepEqual([a, b, c], ['одно', 'одно', 'одно']);
    assert.equal(source.calls.n, 1, 'порция карточек не должна качать одно и то же трижды');
  });

  test('упавшее чтение не остаётся в памяти и не залипает навсегда', async () => {
    forgetAll();
    await assert.rejects(
      cached('k', FRESH.mine, async () => {
        throw new Error('сеть');
      }),
    );
    assert.equal(peek('k'), undefined, 'ошибку кэшировать нельзя');

    // И следующий заход обязан суметь прочитать — иначе один сбой сети убил бы экран до
    // перезагрузки страницы (незавершённое обещание осталось бы висеть в очереди).
    assert.equal(await cached('k', FRESH.mine, async () => 'получилось'), 'получилось');
  });

  test('инвалидация по НАЧАЛУ ключа гасит родственные записи', async () => {
    forgetAll();
    await cached('ratings', FRESH.mine, async () => 1);
    await cached('ratings:screen', FRESH.mine, async () => 2);
    await cached('profile', FRESH.mine, async () => 3);

    invalidate('ratings');

    assert.equal(peek('ratings'), undefined);
    assert.equal(peek('ratings:screen'), undefined, 'собранный экран устарел вместе с оценками');
    assert.equal(peek('profile'), 3, 'чужой ключ трогать нельзя');
  });

  test('remember кладёт значение без похода в базу', () => {
    forgetAll();
    remember('ratings:shown', ['a', 'b']);
    assert.deepEqual(peek('ratings:shown'), ['a', 'b']);
  });

  /*
   * ⚠️ ГЛАВНЫЙ ТЕСТ ФАЙЛА. Всё остальное здесь про деньги и удобство; этот — про то, что
   * человек не увидит чужих данных. Кэш живёт во вкладке, а вкладка переживает смену человека.
   */
  test('ПРИВАТНОСТЬ: смена человека уничтожает содержимое кэша', async () => {
    forgetAll();
    own('человек-А');
    await cached('profile', FRESH.mine, async () => 'профиль А');
    await cached('relations', FRESH.mine, async () => 'связи А');
    assert.equal(cacheSize(), 2);

    own('человек-Б');

    assert.equal(peek('profile'), undefined, 'профиль А не имеет права пережить смену человека');
    assert.equal(peek('relations'), undefined);
    assert.equal(cacheSize(), 0);
    assert.equal(cacheOwner(), 'человек-Б');
  });

  test('ПРИВАТНОСТЬ: тот же человек кэш НЕ теряет (иначе экономии бы не было)', async () => {
    forgetAll();
    own('человек-А');
    const source = counted('профиль А');
    await cached('profile', FRESH.mine, source.load);

    own('человек-А'); // повторное объявление того же хозяина — обычное дело, оно ничего не рушит
    await cached('profile', FRESH.mine, source.load);

    assert.equal(source.calls.n, 1);
    assert.equal(peek('profile'), 'профиль А');
  });

  test('ПРИВАТНОСТЬ: выход из аккаунта забывает всё и хозяина', async () => {
    forgetAll();
    own('человек-А');
    await cached('profile', FRESH.mine, async () => 'профиль А');

    forgetAll();

    assert.equal(cacheSize(), 0);
    assert.equal(cacheOwner(), null, 'после выхода кэш ничей — следующий вход начнётся начисто');
    assert.equal(peek('profile'), undefined);
  });

  test('контракт свежести: мои данные и цифры сервера — всю сессию, пульс — минуту', () => {
    // Значения контракта — часть договора (`ideas/14` + решение владельца, интервью №005, В4),
    // а не случайные числа: если кто-то поменяет их «на глазок», тест скажет об этом вслух.
    assert.equal(FRESH.mine, Number.POSITIVE_INFINITY);
    assert.equal(FRESH.server, Number.POSITIVE_INFINITY);
    assert.equal(FRESH.pulse, 60_000);
  });

  test('пульс сервера НЕ имеет права стать сессионным: из него выводится лампочка', () => {
    /*
     * Это не дубль теста выше: тот стережёт ЧИСЛО, а этот — ПРИЧИНУ, по которой пульс единственный
     * остался конечным. `syncServerState` считает «Работает / Не отвечает» из сердцебиения
     * ОТНОСИТЕЛЬНО «сейчас» и прощает HEARTBEAT_TOLERANCE циклов молчания. Переживи запись кэша
     * это окно — и живой сервер показался бы человеку умершим, потому что в памяти лежит старый
     * пульс. Поэтому граница выражена связью с терпимостью, а не переписанной константой: сдвинут
     * терпимость — тест продолжит стеречь смысл, а не устаревшее число.
     */
    const cycleMs = 60_000; // штатный цикл сервера синхронизации (`calculator/index.mjs`)
    assert.ok(Number.isFinite(FRESH.pulse), 'пульс на всю сессию = замороженная лампочка');
    assert.ok(
      FRESH.pulse < HEARTBEAT_TOLERANCE * cycleMs,
      'запись пульса обязана устаревать РАНЬШЕ, чем молчание становится поводом для «Не отвечает»',
    );
  });
});
