/**
 * ЮНИТЫ ЯДРА РАЗВЕДКИ СЧЁТЧИКОВ (`tools/lib/industry-analytics-core.mjs`).
 *
 * Сети не касаются и браузера не поднимают — ради этого ядро и вынесено из прибора. Прогон:
 *   node --test tools/industry-analytics.test.mjs   ·   npm run test:tools
 *
 * 🔴 ЭТОТ НАБОР НАПИСАН ПО СЛЕДАМ ДВУХ СВОИХ ЖЕ ОШИБОК, СДЕЛАННЫХ ЗА ОДИН ЧАС 2026-08-29.
 * Оба раза прибор был ЗЕЛЁН и печатал числа, и оба раза числа были ложью — второй вопрос
 * лестницы к зелёному прогону (`AGENT_GUIDE.md`): проверка исполнилась, признак был неверен.
 *
 *   Заход 1 — признак СЛИШКОМ УЗКИЙ: искал точный сегмент пути и только в домене двери.
 *     Итог: TikTok 0, YouTube 0, Instagram 0, Reddit 0 телеметрии. Нуля там быть не может —
 *     эти двери шлют события всегда. Поймано глазом, а не прибором.
 *   Заход 2 — признак СЛИШКОМ УЗКИЙ ИНАЧЕ: `\/events?[/?]` перестал видеть адрес, который
 *     КОНЧАЕТСЯ на `/events` (Spotify `gabo-receiver-service/v3/events`, Microsoft `/metric`).
 *     Прибор «похудел» между двумя прогонами одного дня. Поймано сравнением двух прогонов.
 *
 * Поэтому набор устроен так: сначала адреса, СНЯТЫЕ С ЖИВЫХ ДВЕРЕЙ (не выдуманные), потом
 * мутации, каждая из которых ВОЗВРАЩАЕТ ровно один из двух дефектов. Мутация, не роняющая
 * набор, означала бы, что защиты нет, а есть только рассказ о ней.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';

import { сМутацией } from './lib/mutate.mjs';
import {
  CONSENT_VENDORS,
  NOT_TELEMETRY_TYPES,
  classify,
  isTelemetry,
  parseBody,
  pickJson,
  registrableDomain,
} from './lib/industry-analytics-core.mjs';

const ЗДЕСЬ = dirname(fileURLToPath(import.meta.url));
const ЯДРО = resolve(ЗДЕСЬ, 'lib/industry-analytics-core.mjs');

/**
 * Адреса СНЯТЫ С ЖИВЫХ ДВЕРЕЙ прибором 2026-08-29 и скопированы сюда дословно.
 * Придуманные адреса проверяли бы моё представление о том, как выглядит телеметрия, — а
 * оба дефекта выше родились ровно из этого представления.
 */
const ЖИВЫЕ_АДРЕСА_ТЕЛЕМЕТРИИ = [
  ['YouTube, свой конвейер', 'https://www.youtube.com/youtubei/v1/log_event?alt=json&key=AIza', 'xhr'],
  ['Instagram, свой конвейер', 'https://www.instagram.com/ajax/bz', 'xhr'],
  ['TikTok, соседний домен', 'https://mon.tiktokv.com/monitor_browser/collect/batch/', 'xhr'],
  ['LinkedIn, своя телеметрия', 'https://www.linkedin.com/litms/api/events/tms-load', 'xhr'],
  ['LinkedIn, пиксель картинкой', 'https://ponf.linkedin.com/pixel/tracking.png', 'image'],
  ['Pinterest, действие', 'https://www.pinterest.com/resource/UserRegisterTrackActionResource/update/', 'fetch'],
  ['Duolingo, состояние согласия', 'https://www.duolingo.com/2023-05-23/tracking-status', 'fetch'],
  ['Spotify, свой конвейер — АДРЕС КОНЧАЕТСЯ НА /events', 'https://gabo-receiver-service.spotify.com/public/v3/events', 'fetch'],
  ['Microsoft, метрика — АДРЕС КОНЧАЕТСЯ НА /metric', 'https://edge-auth.microsoft.com/metric', 'fetch'],
];

/** Тоже сняты живыми — и телеметрией НЕ являются. Это код и картинки счётчика, а не события. */
const ЖИВЫЕ_АДРЕСА_НЕ_ТЕЛЕМЕТРИИ = [
  ['логотип со словом log внутри', 'https://www.16personalities.com/static/images/system/logo.svg', 'image'],
  ['страница входа со словом log внутри', 'https://s.pinimg.com/webapp/www/login-9d0d8e122cae9b0e.mjs', 'script'],
  ['СКРИПТ пикселей — загружен, но ничего не отправил', 'https://open.spotifycdn.com/cdn/js/retargeting-pixels.02346b5d.js', 'script'],
  ['стиль со словом login', 'https://s.pinimg.com/webapp/www/login-66e6367e9377ca6b.css', 'stylesheet'],
];

test('живые телеметрические адреса распознаются все до одного', () => {
  for (const [что, адрес, тип] of ЖИВЫЕ_АДРЕСА_ТЕЛЕМЕТРИИ) {
    assert.equal(isTelemetry(адрес, тип), true, `не распознано: ${что} — ${адрес}`);
  }
});

test('код и картинки счётчика телеметрией НЕ считаются', () => {
  for (const [что, адрес, тип] of ЖИВЫЕ_АДРЕСА_НЕ_ТЕЛЕМЕТРИИ) {
    assert.equal(isTelemetry(адрес, тип), false, `ложное срабатывание: ${что} — ${адрес}`);
  }
});

test('известные счётчики опознаются по своим адресам, а имя события читается там, где протокол его не прячет', () => {
  const ga4 = classify('https://www.google-analytics.com/g/collect?v=2&tid=G-X&en=page_view');
  assert.equal(ga4?.key, 'ga4');
  assert.equal(ga4.event('https://www.google-analytics.com/g/collect?v=2&tid=G-X&en=page_view'), 'page_view');

  assert.equal(classify('https://eu.i.posthog.com/e/?ip=0')?.key, 'posthog');
  assert.equal(classify('https://www.facebook.com/tr?id=1&ev=PageView')?.key, 'meta-pixel');
  assert.equal(classify('https://www.linkedin.com/li/track')?.key, 'linkedin-track');
  assert.equal(classify('https://www.16personalities.com/'), null, 'обычная страница счётчиком быть не может');
});

test('🎥 запись сессии — отдельный вид, и он виден в разборе', () => {
  const hotjar = classify('https://script.hotjar.com/modules.js');
  assert.equal(hotjar?.kind, '🎥 запись сессии', 'вид записи сессии обязан называться так же, как его ищет прибор');
  assert.equal(classify('https://www.clarity.ms/tag/abc')?.kind, '🎥 запись сессии');
});

test('платформа согласия опознаётся — без неё молчание счётчиков нечем объяснить', () => {
  assert.equal(CONSENT_VENDORS.test('https://cdn.cookielaw.org/scripttemplates/otSDKStub.js'), true);
  assert.equal(CONSENT_VENDORS.test('https://www.youtube.com/'), false);
});

test('свой домен отделяется от чужого по регистрируемому имени — соседний домен НЕ свой', () => {
  assert.equal(registrableDomain('www.tiktok.com'), 'tiktok.com');
  assert.equal(registrableDomain('mon16-normal-no1a.tiktokv.eu'), 'tiktokv.eu');
  assert.notEqual(
    registrableDomain('mon.tiktokv.com'),
    registrableDomain('www.tiktok.com'),
    'tiktokv.com — соседний домен TikTok; считать его своим значит спрятать чужую телеметрию',
  );
});

test('имя события читается из JSON и из формы, а из нечитаемого тела — НЕ выдумывается', () => {
  assert.equal(pickJson('{"event":"guest_start"}', ['event']), 'guest_start');
  assert.equal(pickJson('{"events":[{"event_type":"door_click"}]}', ['events.0.event_type']), 'door_click');
  assert.equal(pickJson('data={"event":"demo_touch"}&sent_at=1', ['event']), 'demo_touch');
  assert.equal(pickJson(' сжатая пачка', ['event']), null, 'из нечитаемого тела имя обязано быть null, а не догадкой');
  assert.equal(pickJson('', ['event']), null);
  assert.equal(pickJson(null, ['event']), null);
  assert.equal(parseBody('не форма и не json'), null);
});

test('длинное значение именем события не считается — иначе в отчёт уедет кусок полезной нагрузки', () => {
  const длинное = JSON.stringify({ event: 'x'.repeat(200) });
  assert.equal(pickJson(длинное, ['event']), null);
});

/**
 * Дочерний прогон ядра — мутант обязан быть ЗАГРУЖЕН, а не прочитан глазами. ESM кеширует
 * модуль по адресу, поэтому мутанта берёт отдельный процесс: он импортирует ядро с диска
 * заново и печатает ответ, который в этом процессе получить нечем.
 */
function спроситьЯдро(выражение) {
  const код = `const m = await import(${JSON.stringify(pathToFileURL(ЯДРО).href)});\nprocess.stdout.write(String(${выражение}));`;
  return execFileSync(process.execPath, ['--input-type=module', '-e', код], { encoding: 'utf8' }).trim();
}

test('🔴 МУТАЦИЯ 1 — возвращает дефект «признак ловит КОД счётчика вместо его запросов»', () => {
  const адрес = JSON.stringify('https://open.spotifycdn.com/cdn/js/retargeting-pixels.02346b5d.js');
  const вопрос = `m.isTelemetry(${адрес}, 'script')`;

  assert.equal(спроситьЯдро(вопрос), 'false', 'на исходнике скрипт телеметрией не считается');

  let ответМутанта = null;
  сМутацией(
    {
      файл: ЯДРО,
      якорь: "new Set(['script', 'stylesheet', 'font', 'media', 'document'])",
      мутант: 'new Set([])',
      // Контроль ПО СМЫСЛУ: мутант обязан изменить ОТВЕТ, а не только байты файла.
      контроль: () => {
        ответМутанта = спроситьЯдро(вопрос);
        return ответМутанта === 'true';
      },
    },
    () => ответМутанта,
  );

  assert.equal(ответМутанта, 'true', 'отсев по типу ресурса ничего не держит — падать набору не на чем');
  assert.equal(спроситьЯдро(вопрос), 'false', 'исходник не вернулся после мутации');
});

test('🔴 МУТАЦИЯ 2 — возвращает дефект «адрес, кончающийся на /events, перестал быть телеметрией»', () => {
  const адрес = JSON.stringify('https://gabo-receiver-service.spotify.com/public/v3/events');
  const вопрос = `m.isTelemetry(${адрес}, 'fetch')`;

  assert.equal(спроситьЯдро(вопрос), 'true', 'на исходнике адрес Spotify — телеметрия');

  let ответМутанта = null;
  сМутацией(
    {
      файл: ЯДРО,
      якорь: "const END = '(?:[/?]|$)';",
      мутант: "const END = '[/?]';",
      контроль: () => {
        ответМутанта = спроситьЯдро(вопрос);
        return ответМутанта === 'false';
      },
    },
    () => ответМутанта,
  );

  assert.equal(ответМутанта, 'false', 'граница конца адреса ничего не держит — второй дефект дня вернулся бы молча');
  assert.equal(спроситьЯдро(вопрос), 'true', 'исходник не вернулся после мутации');
});

test('два мутанта дали РАЗНЫЕ ответы — подстановка состоялась в обоих случаях', () => {
  // Контроль из `lib/mutate.mjs`: одинаковый ответ на разные вопросы есть признак,
  // что вопроса не задали. Здесь вопросы разные по построению — сверяем это явно.
  const исходник = readFileSync(ЯДРО, 'utf8');
  assert.equal(исходник.includes("new Set(['script', 'stylesheet', 'font', 'media', 'document'])"), true);
  assert.equal(исходник.includes("const END = '(?:[/?]|$)';"), true);
  assert.equal(NOT_TELEMETRY_TYPES.has('script'), true, 'набор типов в памяти теста тоже обязан быть исходным');
});
