/**
 * QA-прогон тира A (plans/07) живым браузером на стенде: bugs/43, 46, 47, 48.
 * Канон процесса — plans/06: обе темы, две ширины, чтение консоли, скриншоты глазами.
 *
 * Требует поднятый `npm run stand`. Скриншоты — test-results/tierA/.
 * Запуск: node tools/verify-tierA.mjs
 *
 * Проверяем НАБЛЮДЕНИЕМ то, что тесты увидеть не могут: что числа на экране совпадают с
 * числами соседнего экрана, что скрытое чужое поле не проступает, что блоки видны в обеих
 * темах и на обеих ширинах.
 */

import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { markProbeContext } from './lib/probe-mark.mjs';

const BASE = 'http://localhost:5173';
const SHOTS = 'test-results/tierA';

let failures = 0;

// Заголовки блоков рендерятся CSS-ом в верхнем регистре (text-transform: uppercase),
// и innerText отдаёт их уже преобразованными. Сравниваем без учёта регистра — иначе
// оснастка ловила бы собственную невнимательность вместо дефектов продукта.
const has = (haystack, needle) => haystack.toLowerCase().includes(needle.toLowerCase());
function check(name, ok, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? '  ✅' : '  ❌'} ${name}${detail ? ` — ${detail}` : ''}`);
}

/**
 * Барьер: сводка связей грузится ПОСЛЕ профиля (отдельным запросом), поэтому виджет
 * «Мои связи» несколько кадров пуст. Без ожидания оснастка читает пустоту и врёт про
 * продукт — ровно класс EXP-0049 (наличие узла ≠ готовность данных).
 */
async function awaitRelationsWidget(page) {
  await page.waitForFunction(
    () => {
      const text = document.querySelector('main.body')?.textContent ?? '';
      return text.includes('Количество установленных связей') || text.includes('ещё не рассчитывались');
    },
    { timeout: 20000 },
  );
}

async function person(browser, { theme = 'light', width = 390, lang } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 820 }, locale: 'ru-RU' });
  await markProbeContext(context);
  await context.addInitScript((value) => localStorage.setItem('ndim-theme', value), theme);
  if (lang) await context.addInitScript((value) => localStorage.setItem('ndim-lang', value), lang);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (event) => errors.push(String(event)));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return { context, page, errors };
}

// ── Прямой доступ к эмулятору Firestore ──
// Эмулятор применяет правила и к REST: без заголовка `Authorization: Bearer owner` чтение
// отвергается, и ответ выглядит как «документа нет» (EXP-0029).
const FIRESTORE = 'http://127.0.0.1:8181/v1/projects/demo-ndim-dev/databases/(default)/documents';
const ADMIN = { Authorization: 'Bearer owner' };

async function firestoreGet(path) {
  const response = await fetch(`${FIRESTORE}/${path}`, { headers: ADMIN });
  return response.ok ? response.json() : null;
}

/** uid хозяина стенда: единственная точка, не принадлежащая сеянным гостям. */
async function standOwnerUid() {
  const list = await firestoreGet('points');
  const names = (list?.documents ?? []).map((d) => d.name.split('/').pop());
  return names.find((uid) => !uid.startsWith('stand-guest-')) ?? null;
}

const browser = await chromium.launch();
await mkdir(SHOTS, { recursive: true });

try {
  // ── bugs/43: профиль показывает статистику «Дома» ──
  for (const [theme, width] of [['light', 390], ['dark', 1440]]) {
    console.log(`bugs/43 · виджеты профиля (${theme}, ${width}):`);
    const { context, page, errors } = await person(browser, { theme, width });
    await page.goto(`${BASE}/profile`);
    await page.waitForSelector('.card', { timeout: 30000 });
    await awaitRelationsWidget(page);

    const body = await page.locator('main.body').innerText();
    check('виджет «Мой NDim ID» на месте', body.includes('Количество измерений'));
    check('эмоциональная шкала 1.x показана', /\((очень мало|мало|средне|много|очень много|Отлично!|Ого!)/.test(body), body.match(/\([^)]*[😭☹️😐🙂😎🥰🤩]\)/)?.[0] ?? '—');
    check('диаметр моего пространства', body.includes('Диаметр моего пространства'));
    check('строка «Обновлен»', body.includes('Обновлен'));
    check('виджет «Мои связи» на месте', has(body, 'Мои связи'));
    check('полосы похожести', body.includes('Топ-90%') && body.includes('75%…89%') && body.includes('50%…74%'));
    check('вводная подсказка экрана вернулась', body.includes('Это Ваша домашняя страница'));
    check('подсказка НЕ обещает управление аккаунтом', !body.includes('управлять Вашей учётной записью'));

    // Числа виджета обязаны совпадать с реальностью, а не быть красивыми.
    const rated = Number((body.match(/Количество измерений\s+(\d+)/) ?? [])[1]);
    const relationsTotal = Number((body.match(/Количество установленных связей\s+(\d+)/) ?? [])[1]);
    check('количество измерений — число', Number.isFinite(rated), String(rated));
    check('связей — число', Number.isFinite(relationsTotal), String(relationsTotal));

    // Диаметр = √N · 10 (формула ядра). Считаем независимо и сверяем с экраном.
    const shownDiameter = (body.match(/Диаметр моего пространства\s+([\d\s,.]+)\s/) ?? [])[1];
    const expected = Math.round(Math.sqrt(rated) * 10 * 10) / 10;
    const parsed = Number(String(shownDiameter).replace(/\s/g, '').replace(',', '.'));
    check('диаметр совпадает с √N·10', Math.abs(parsed - expected) < 0.05, `экран ${parsed} · расчёт ${expected}`);

    await page.screenshot({ path: `${SHOTS}/profile-${theme}-${width}.png`, fullPage: true });
    // Отдельный кадр виджета: на fullPage-снимке прибитая нижняя панель перекрывает верх
    // карточки, и строку «N (комментарий шкалы)» глазами не проверить.
    const widget = page.locator('main.body > .card', { hasText: 'Мой NDim ID' }).first();
    await widget.scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    await widget.screenshot({ path: `${SHOTS}/ndimid-card-${theme}-${width}.png` });
    check('консоль чиста (профиль)', errors.length === 0, errors.join(' | ').slice(0, 200));

    // Сверка с экраном «Связи»: то же число связей, посчитанное другим путём.
    await page.goto(`${BASE}/relations`);
    await page.waitForSelector('.card .head', { timeout: 30000 });
    const cards = await page.locator('main.body > .card').count();
    check('число связей совпадает с экраном «Связи»', cards === relationsTotal, `профиль ${relationsTotal} · связи ${cards}`);
    await context.close();
  }

  // ── bugs/43, страж класса: «Синхронизирован» отвечает на СВОЙ вопрос ──
  //
  // С экономией запросов (ideas/14) `relations.computedAt` обновляется только когда топ
  // ИЗМЕНИЛСЯ, а `points.lastSync` — каждый раз, когда сервер синхронизации посчитал точку.
  // Виджет обязан показывать второе. Проверка портит computedAt заведомо старой датой:
  // если экран читает его, дата на экране станет старой — и страж покраснеет.
  {
    console.log('bugs/43 · «Синхронизирован» показывает синхронизацию, а не смену топа:');
    const uid = await standOwnerUid();
    check('хозяин стенда найден', uid !== null, String(uid));

    const before = await firestoreGet(`relations/${uid}`);
    const savedComputedAt = before?.fields?.computedAt?.integerValue;
    check('топ на стенде существует', savedComputedAt !== undefined);

    const ancient = String(Date.UTC(2020, 0, 1));
    await fetch(`${FIRESTORE}/relations/${uid}?updateMask.fieldPaths=computedAt`, {
      method: 'PATCH',
      headers: { ...ADMIN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { computedAt: { integerValue: ancient } } }),
    });

    const { context, page } = await person(browser, { width: 390 });
    await page.goto(`${BASE}/profile`);
    await page.waitForSelector('.card', { timeout: 30000 });
    await awaitRelationsWidget(page);
    const body = await page.locator('main.body').innerText();
    check('дата синхронизации НЕ взята из computedAt', !body.includes('2020'), body.match(/Синхронизирован\s+(.+)/)?.[1] ?? '—');
    check('строка «Синхронизирован» на месте', /Синхронизирован\s+\d/.test(body));
    await context.close();

    // Возвращаем стенд в исходное состояние: оснастка не оставляет следов.
    await fetch(`${FIRESTORE}/relations/${uid}?updateMask.fieldPaths=computedAt`, {
      method: 'PATCH',
      headers: { ...ADMIN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { computedAt: { integerValue: savedComputedAt } } }),
    });
  }

  // ── bugs/46: раскрытая связь — досье, а не три цифры ──
  for (const [theme, width] of [['light', 390], ['dark', 1440]]) {
    console.log(`bugs/46 · раскрытая связь (${theme}, ${width}):`);
    const { context, page, errors } = await person(browser, { theme, width });
    await page.goto(`${BASE}/relations`);
    await page.waitForSelector('.card .head', { timeout: 30000 });

    // Раскрываем карточку Анны — она открыла всем гендер, дату рождения и «о себе».
    const anna = page.locator('main.body > .card', { hasText: 'Анна' }).first();
    await anna.locator('button.who').click();
    await page.waitForTimeout(400);
    const deep = await anna.locator('.deep').innerText();

    check('блок «Параметры пространства» (его)', has(deep, 'Параметры пространства'));
    check('блок «Параметры нашего общего пространства»', has(deep, 'Параметры нашего общего пространства'));
    // Коэффициенты считаем ПОШТУЧНО. Короткая подстрока «×… моего» встречается и в блоке
    // общего пространства — она осталась бы зелёной, потеряй мы весь блок параметров гостя
    // (BUG_FIXING_FRAMEWORK → «Стражи»: стереги форму, а не подстроку; проверено мутацией).
    const mine = (deep.match(/×[\d.]+\s+моего/g) ?? []).length;
    const owner = (deep.match(/×[\d.]+\s+хозяина/g) ?? []).length;
    check('коэффициентов «×… моего» ровно 4', mine === 4, String(mine));
    check('коэффициентов «×… хозяина» ровно 2', owner === 2, String(owner));
    check('расстояние с долей диаметра', /%\s+от диаметра/.test(deep));
    check('персональная информация показана', has(deep, 'Персональная информация'));
    check('гендер Анны виден', deep.includes('Женщина'));
    check('день рождения с возрастом', /\(\d+\s+(год|года|лет)\)/.test(deep), (deep.match(/\(\d+\s+(?:год|года|лет)\)/) ?? [])[0] ?? '—');
    check('«О себе» показано', deep.includes('тишину'));

    /*
     * Последний блок канона 1.x (`bugs/46`): «Последнее обновление NDim ID» — когда ЭТОТ человек
     * менял свой NDim ID. Число кладёт сервер синхронизации в саму запись топа: `points/{uid}` соседа
     * зрителю по правилам недоступен.
     *
     * Проверяем не наличие подписи, а ДАТУ рядом с ней: подпись без значения — ровно тот вид
     * зелёного, из-за которого блок и был потерян (экран показывал часть досье и выглядел
     * рабочим). Формат даты — `dateTime`, тот же, что в 1.x: «30 июля 2026 г. в 17:12».
     */
    const ndimUpd = /Последнее обновление NDim ID\s+(\d{1,2}\s+\S+\s+\d{4}\s*г\.\s*в\s*\d{1,2}:\d{2})/.exec(deep);
    check('«Последнее обновление NDim ID» с датой и временем', ndimUpd !== null, ndimUpd?.[1] ?? '—');

    await anna.screenshot({ path: `${SHOTS}/relation-expanded-${theme}-${width}.png` });

    // Виктор указал только год: возраста быть не должно — догадка хуже отсутствия.
    const viktor = page.locator('main.body > .card', { hasText: 'Виктор' }).first();
    await viktor.locator('button.who').click();
    await page.waitForTimeout(400);
    const viktorDeep = await viktor.locator('.deep').innerText();
    check('неполная дата — год без выдуманного возраста', viktorDeep.includes('1979') && !/\(\d+\s+(год|года|лет)\)/.test(viktorDeep));

    // Мария не открыла ничего: блока персональной информации быть не должно вовсе.
    const maria = page.locator('main.body > .card', { hasText: 'Мария' }).first();
    await maria.locator('button.who').click();
    await page.waitForTimeout(400);
    const mariaDeep = await maria.locator('.deep').innerText();
    check('скрытое не проступает и не даёт прочерков', !has(mariaDeep, 'Персональная информация') && !mariaDeep.includes('—'));
    check('но математика связи у Марии есть', has(mariaDeep, 'Параметры нашего общего пространства'));

    check('консоль чиста (связи)', errors.length === 0, errors.join(' | ').slice(0, 200));
    await context.close();
  }

  // ── bugs/48: правила оформления в форме предложения ──
  for (const [theme, lang] of [['light', 'ru'], ['dark', 'en']]) {
    console.log(`bugs/48 · правила оформления (${theme}, ${lang}):`);
    const { context, page, errors } = await person(browser, { theme, lang, width: 390 });
    await page.goto(`${BASE}/dims`);
    await page.waitForSelector('article.dim', { timeout: 30000 });
    // Вход «Предложить измерение» переехал К ПОИСКУ (bugs/51, выбор владельца V3):
    // кнопки под лентой больше нет — страж приведён к текущему канону.
    await page.locator('button.suggest-btn').click();
    await page.waitForTimeout(300);

    const form = await page.locator('.card.sug').innerText();
    check('заголовок блока', has(form, lang === 'ru' ? 'Правила оформления' : 'Description rules'));
    check('живой пример из 1.x', form.includes(lang === 'ru' ? '«Пятый элемент»' : 'The Fifth Element') || form.includes(lang === 'ru' ? 'Пятый элемент' : 'The Fifth Element'));
    check('все четыре правила', (form.match(/\n/g) ?? []).length >= 4);
    check('форма ввода на месте', await page.locator('textarea.ta').isVisible());
    await page.locator('.card.sug').screenshot({ path: `${SHOTS}/suggest-rules-${theme}-${lang}.png` });
    check('консоль чиста (измерения)', errors.length === 0, errors.join(' | ').slice(0, 200));
    await context.close();
  }

  // ── bugs/47: «Пригласить друзей» — сетка соцсетей ──
  for (const [theme, width] of [['light', 390], ['dark', 1440]]) {
    console.log(`bugs/47 · сетка соцсетей (${theme}, ${width}):`);
    const { context, page, errors } = await person(browser, { theme, width });
    await page.goto(`${BASE}/ru/menu/share`);
    await page.waitForSelector('.grid .net', { timeout: 30000 });

    const nets = page.locator('.grid .net');
    const count = await nets.count();
    check('сетка из 13 сетей', count === 13, String(count));

    // Каждая ссылка обязана вести на НАСТОЯЩИЙ домен своей сети и нести наш адрес.
    const hrefs = await nets.evaluateAll((nodes) => nodes.map((n) => n.getAttribute('href')));
    const domains = {
      telegram: 't.me', whatsapp: 'api.whatsapp.com', vk: 'vk.com', facebook: 'facebook.com',
      x: 'twitter.com', threads: 'threads.net', linkedin: 'linkedin.com', reddit: 'reddit.com',
      ok: 'connect.ok.ru', mailru: 'connect.mail.ru', viber: 'viber://', pinterest: 'pinterest.com',
      email: 'mailto:',
    };
    const ids = await nets.evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-net')));
    for (const [index, id] of ids.entries()) {
      const href = hrefs[index] ?? '';
      check(`${id}: адрес сети`, href.includes(domains[id]), href.slice(0, 60));
      check(`${id}: несёт ссылку на NDim`, href.includes('ndimspace.app') || href.includes(encodeURIComponent('https://ndimspace.app')), '');
    }
    check('прямая ссылка показана', (await page.locator('.link').innerText()).includes('ndimspace.app'));
    await page.screenshot({ path: `${SHOTS}/share-${theme}-${width}.png`, fullPage: true });
    check('консоль чиста (поделиться)', errors.length === 0, errors.join(' | ').slice(0, 200));
    await context.close();
  }

  // ── Дверь из меню на страницу (канон 1.x: «Пригласить друзей» — отдельный экран) ──
  {
    console.log('bugs/47 · дверь из меню:');
    const { context, page } = await person(browser, { width: 390 });
    await page.goto(`${BASE}/menu`);
    await page.locator('a.row[href="/ru/menu/share"]').click();
    await page.waitForSelector('.grid .net', { timeout: 30000 });
    check('из меню открывается «Пригласить друзей»', page.url().endsWith('/menu/share'));
    await context.close();
  }
} finally {
  await browser.close();
}

console.log(failures === 0 ? '\n✅ Тир A: все проверки зелёные' : `\n❌ Провалов: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
