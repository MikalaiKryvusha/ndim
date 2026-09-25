// Драйвер: метка пула в коде набора ссылки пары (`set=<метка>.<номера>`, находка 4 суда V4).
// Запуск: `npm run build`, `npx vite preview --port 4196 --strictPort`, затем этот файл. Второй человек
// приходит без сессии: до первой оценки очередь строится только из кода ссылки.
import { chromium } from '@playwright/test';
import { poolMark } from '../../src/lib/model/test-pair.ts';
import { TEST_POOL } from '../../src/lib/content/test-set.ts';

const BASE = process.env.BASE ?? 'http://localhost:4196';
const PAIR = 'abcdefghijklmnopqrstuv'; // 22 знака — форма id пары; документа нет, до оценки он не читается
let fails = 0;
const check = (id, ok, text) => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'} ${id} — ${text}`); };

const browser = await chromium.launch();
async function firstCard(query) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/ru/test/compatibility?${query}`);
  await page.waitForSelector('.qcard[data-live] .name', { timeout: 20000 });
  await page.waitForTimeout(300);
  const name = (await page.textContent('.qcard[data-live] .name'))?.trim() ?? '';
  const faces = await page.$$eval('.qcard .pre[data-i]', (els) => els.map((e) => e.querySelector('.name')?.textContent?.trim() ?? ''));
  await ctx.close();
  return { name, faces };
}

const mark = poolMark(TEST_POOL);
console.log(`INFO метка пула ${mark} · пул ${TEST_POOL.length}`);
// Пререндер несёт лица в порядке пула — по ним узнаём имена вещей 0, 5 и 7.
const probe = await browser.newContext().then(async (c) => {
  const p = await c.newPage();
  await p.route('**/_app/immutable/**/*.js', (r) => r.abort());
  await p.goto(`${BASE}/ru/test/compatibility`);
  const names = await p.$$eval('.qcard .pre[data-i]', (els) => els.map((e) => e.querySelector('.name')?.textContent?.trim() ?? ''));
  await c.close();
  return names;
});
const [n0, n5] = [probe[0], probe[5]];

const own = await firstCard(`pair=${PAIR}&set=${mark}.57`);
check('ПМ-01', own.name === n5, `код своего пула «${mark}.57»: первая карточка «${own.name}», ждали вещь 5 «${n5}»`);
const other = await firstCard(`pair=${PAIR}&set=zzz.57`);
check('ПМ-02', other.name === n0, `код с чужой меткой «zzz.57»: первая «${other.name}», ждали порядок пула — вещь 0 «${n0}»`);
const bare = await firstCard(`pair=${PAIR}&set=57`);
check('ПМ-03', bare.name === n0, `код без метки «57»: первая «${bare.name}», ждали вещь 0 «${n0}»`);

await browser.close();
console.log(fails === 0 ? 'ИТОГ: провалов 0' : `ИТОГ: провалов ${fails}`);
process.exit(fails === 0 ? 0 : 1);
