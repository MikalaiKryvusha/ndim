#!/usr/bin/env node
/**
 * СТРАЖ ТЕКСТОВ ГОСТЯ — приёмка `bugs/227`, решение владельца №069 В2 = А (2026-08-30).
 *
 * Владелец: «*на профиле плашка о гостевом аккаунте говорит, что сейчас вы невидимы — это
 * сильно устаревшее заявление, и уже это не соответствует действительности*». Его решение по
 * развилке — **убрать строку о видимости СОВСЕМ**, а не переписать её.
 *
 * 🔴 ПОЧЕМУ «УБРАТЬ», А НЕ «ПЕРЕПИСАТЬ», И ПОЧЕМУ ЭТО СТЕРЕЖЁТСЯ. Строка была ПРАВДИВОЙ по коду
 * и УСТАРЕВШЕЙ по решению: правило «гость невидим» (№004 В3) владелец отменил ответом №009 В5
 * ещё 2026-08-01, а код продолжал его исполнять — и текст описывал код точно. То есть **текст и
 * код были СОГЛАСНЫ между собой и оба расходились с решением владельца**, а расхождение с
 * третьей стороной не видит ни один страж кода. Починка одного текста развела бы его ещё и с
 * кодом: продукт начал бы обещать видимость, которой нет.
 * **Пока утверждения нет — расхождению негде возникнуть.** Это и стережётся: ОТСУТСТВИЕ.
 *
 * ⚠️ ГРАНИЦА, НАЗВАННАЯ ЧЕСТНО: страж судит ЭКРАН, а не исходник. Он не заметит, если строку
 * вернут под другим именем ключа с иной формулировкой; он заметит возврат САМОГО утверждения о
 * видимости — по словам, которыми оно только и может быть выражено на обоих языках.
 *
 * ⛔ `doneNote` («Вас по-прежнему не видит никто») НЕ проверяется и трогать его нельзя: он
 * показывается ПОСЛЕ создания аккаунта (`signupStep === 'done'`), говорит об умолчаниях
 * видимости зарегистрированного человека и ПРАВДИВ — у нового пользователя все свойства скрыты
 * (`src/lib/model/schema.test.ts`, «новый пользователь: всё скрыто»). Ложное попадание разбора,
 * снятое Менеджером до правки.
 *
 * Ворота: не стоит — нужен стенд. Прогон руками при правке текстов гостя.
 *
 * Запуск: стенд поднят (`npm run stand`) → node tools/verify-bug227-guest-texts.mjs
 *   --slot N   явный слот (или переменная STAND_SLOT) — для прогона из ЧУЖОГО дерева
 *   --stamp X  метка кадров (по умолчанию `after`)
 */

import { mkdirSync } from 'node:fs';
import { basename } from 'node:path';
import { execSync } from 'node:child_process';
import { chromium } from 'playwright';

import { portsFor, slotFromRequest } from './lib/stand-slot.mjs';
import { readGuestSession, removeGuest } from './lib/guest-session.mjs';
import { createRequire } from 'node:module';

const argv = process.argv.slice(2);
const { slot, role, источник } = slotFromRequest({
  argv,
  env: process.env,
  dirName: basename(execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim()),
});
const ports = portsFor(slot);
const BASE = `http://localhost:${ports.dev}`;
const stampFlag = argv.indexOf('--stamp');
const STAMP = stampFlag === -1 ? 'after' : String(argv[stampFlag + 1]);
const OUT = 'test-results/bug227-guest-texts';
mkdirSync(OUT, { recursive: true });

process.env.FIRESTORE_EMULATOR_HOST = `127.0.0.1:${ports.firestore}`;
process.env.FIREBASE_AUTH_EMULATOR_HOST = `127.0.0.1:${ports.auth}`;
process.env.FIREBASE_PROJECT_ID = 'demo-ndim-dev';
const requireSync = createRequire(new URL('../sync-server/', import.meta.url));
const { initializeApp, getApps } = requireSync('firebase-admin/app');
if (getApps().length === 0) initializeApp({ projectId: 'demo-ndim-dev' });
const { getFirestore } = requireSync('firebase-admin/firestore');
const { getAuth } = requireSync('firebase-admin/auth');
const db = getFirestore();

let failures = 0;
const check = (ok, label) => {
  console.log(`${ok ? '  ✅' : '  ❌'} ${label}`);
  if (!ok) failures += 1;
};

/**
 * Слова, которыми утверждение о видимости только и может быть выражено. Стерегутся ФОРМЫ, а не
 * точные строки: возврат класса перефразировкой — тот же дефект.
 */
/*
 * ⚠️ ПОРЯДОК СЛОВ РАЗНЫЙ У ДВУХ СТРОК, И ПЕРВАЯ РЕДАКЦИЯ ЭТОГО НЕ ЗНАЛА.
 * Убранный `fact1` говорил «Вас НИКТО НЕ ВИДИТ», а панель аудитории — «Вас НЕ ВИДИТ НИКТО».
 * Образец `/никто\s+не\s+видит/` ловил первое и молчал на втором: мутация, вернувшая отменённую
 * посылку в панель, прошла страж ЗЕЛЁНЫМ. Поймано мутацией, а не чтением.
 * 🔑 Класс тот же, что и весь день: **признак по СЛОВАМ ловит ту форму, которую автор помнил.**
 * Лечится не перечислением порядков, а признаком по СУЩЕСТВУ — «отрицание видимости рядом с
 * обращением к человеку», в обеих раскладках слов сразу.
 */
const ВИДИМОСТЬ = [
  /никто\s+не\s+видит/iu,
  /не\s+видит\s+никто/iu,
  /Вас\s+не\s+видит/iu,
  /Вы\s+невидим/iu,
  /nobody\s+sees\s+you/iu,
  /sees\s+you.{0,20}nobody/iu,
  /you\s+are\s+invisible/iu,
];

const ЯЗЫКИ = ['ru', 'en'];
const ТЕМЫ = ['light', 'dark'];
const ШИРИНЫ = [390, 1440];

console.log('═══ СТРАЖ ТЕКСТОВ ГОСТЯ (bugs/227, №069 В2 = А) ═══');
console.log(`  стенд: слот ${slot} · роль ${role ?? '—'} · источник слота: ${источник} · ${BASE}\n`);

const browser = await chromium.launch();
const гости = new Set();
let осмотрено = 0;

try {
  for (const lang of ЯЗЫКИ) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ru-RU' });
    await ctx.addInitScript((l) => {
      try {
        localStorage.setItem('ndim-lang', l);
      } catch {
        /* приватный режим — язык останется машинным, это увидит проверка ниже */
      }
    }, lang);
    const page = await ctx.newPage();

    // Гость двумя шагами: `?as=guest` даёт анонимную сессию, `&guest=1` — документы (bugs/NEW).
    await page.goto(`${BASE}/dims?as=guest`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    const s = await readGuestSession(page);
    if (!s.uid) throw new Error(`гостевая сессия не опознана: ${s.reason}`);
    гости.add(s.uid);
    await page.goto(`${BASE}/profile?as=guest&guest=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);

    for (const width of ШИРИНЫ) {
      await page.setViewportSize({ width, height: 900 });
      for (const theme of ТЕМЫ) {
        await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
        await page.waitForTimeout(250);

        const карточка = await page.locator('.guest-card').first();
        const есть = (await карточка.count()) > 0;
        const текст = есть ? ((await карточка.textContent()) ?? '') : '';
        if (есть) осмотрено += 1;
        const где = `${lang} · ${width}px · ${theme}`;

        check(есть, `${где}: гостевая карточка на экране`);
        for (const образец of ВИДИМОСТЬ) {
          check(!образец.test(текст), `${где}: карточка НЕ утверждает о видимости — ${образец}`);
        }
        /*
         * ОСТАВШИЕСЯ ФАКТЫ — НА МЕСТЕ. Без этой проверки «убрали строку» неотличимо от
         * «выпилили лишнего»: страж, судящий только ОТСУТСТВИЕ, зеленеет и на пустой карточке.
         * ⚠️ Первая редакция ждала здесь текст ДРУГОГО компонента (`$lib/ui/GuestCard.svelte`,
         * плашка на пяти экранах) вместо `fact2` карточки профиля — и честно покраснела
         * восемь раз. Дефект был в страже, а не в продукте, и нашёлся первым же прогоном.
         */
        const сохранность = lang === 'ru' ? /останется Вашим/u : /stays yours/u;
        const срок = lang === 'ru' ? /не вернётесь в течение/u : /do not come back within/u;
        check(сохранность.test(текст), `${где}: факт о сохранности результатов на месте`);
        check(срок.test(текст), `${где}: факт о сроке жизни гостя на месте`);

        await page.screenshot({ path: `${OUT}/${STAMP}-profile-${lang}-${theme}-${width}.png` });
      }
    }

    /*
     * ВТОРАЯ ПОЛОВИНА ПРАВКИ — ПАНЕЛЬ АУДИТОРИИ. Она открывается тапом по кнопке аудитории у
     * свойства, и без этого шага текст `audienceLocked` не показывается вовсе: страж, судивший
     * бы только карточку, объявил бы правку проверенной наполовину.
     * ⚠️ Здесь снималась ОТМЕНЁННАЯ ПОСЫЛКА и вывод из неё; правдивая половина осталась, и
     * проверяются обе стороны — что ушло и что уцелело.
     */
    await page.setViewportSize({ width: 1440, height: 900 });
    const кнопка = page.locator('.prop .aud').first();
    if ((await кнопка.count()) > 0) {
      await кнопка.click();
      await page.waitForTimeout(400);
      const панель = page.locator('.aud-panel').first();
      const текстПанели = (await панель.count()) > 0 ? ((await панель.textContent()) ?? '') : '';
      check(текстПанели.length > 0, `${lang}: панель аудитории открылась (иначе проверка пуста)`);
      for (const образец of ВИДИМОСТЬ) {
        check(!образец.test(текстПанели), `${lang} · панель аудитории: посылки о видимости нет — ${образец}`);
      }
      const уцелело = lang === 'ru' ? /Настройки аудитории появятся/u : /Audience settings arrive/u;
      check(уцелело.test(текстПанели), `${lang} · панель аудитории: правдивая половина на месте`);
      await page.screenshot({ path: `${OUT}/${STAMP}-audience-${lang}-1440.png` });
    } else {
      check(false, `${lang}: кнопка аудитории не найдена — панель не проверена, а не «проверена и чиста»`);
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}

/* Контроль прибора: карточка обязана найтись во ВСЕХ сочетаниях, иначе зелёное бессодержательно. */
const ожидалось = ЯЗЫКИ.length * ШИРИНЫ.length * ТЕМЫ.length;
check(
  осмотрено === ожидалось,
  `КОНТРОЛЬ: карточка найдена во всех сочетаниях — ${осмотрено} из ${ожидалось}` +
    (осмотрено === ожидалось ? '' : ' — прибор судил не то, проверки выше бессодержательны'),
);

console.log('\n── Уборка следов стража ──');
for (const uid of гости) {
  const done = await removeGuest({ db, auth: getAuth() }, uid);
  check(done.removed, `${uid}: уборка разрешена свойством учётки — ${done.why}`);
  check(done.traces.length === 0, `${uid}: следов не осталось`);
}

console.log(`\n  кадры «${STAMP}» → ${OUT}/`);
console.log(`\nИтог: ${failures === 0 ? '✅ страж пройден' : `❌ провалов: ${failures}`}`);
process.exit(failures === 0 ? 0 : 1);
