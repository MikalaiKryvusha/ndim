// Полный проход главной ГЛАЗАМИ: каждый раздел отдельным кадром, 390/1440 × светлая/тёмная × RU/EN.
// Плюс машинные проверки: текст «системный персонаж» в DOM, горизонтальное переполнение, консоль,
// анимация FAQ (покадровая высота details при раскрытии), подписи портретов и названия карточек «Как устроено».
import { chromium } from 'file:///D:/work/ai_sandbox/ndim/node_modules/@playwright/test/index.mjs';
import { markProbeContext } from 'file:///D:/work/ai_sandbox/ndim/tools/lib/probe-mark.mjs';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:4173';
const tag = process.argv[3] ?? 'local';
const out = `D:/work/ai_sandbox/ndim/test-results/walk-${tag}`;
mkdirSync(out, { recursive: true });
const b = await chromium.launch();
const results = [];
for (const path of ['/', '/en']) {
  for (const [w, theme] of [[390, 'light'], [390, 'dark'], [1440, 'light'], [1440, 'dark']]) {
    const ctx = await b.newContext({ viewport: { width: w, height: 900 } });
    await markProbeContext(ctx);
    await ctx.addInitScript((t) => localStorage.setItem('ndim-theme', t), theme);
    const p = await ctx.newPage();
    const errors = [];
    p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    p.on('pageerror', (e) => errors.push(String(e)));
    await p.goto(base + path, { waitUntil: 'load' });
    await p.waitForFunction(() => window.__ndimDemoLive === true, null, { timeout: 15000 });
    // Прокрутка до низа по шагам — всё, что проявляется при входе в окно, успевает проявиться.
    const H = await p.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < H; y += 600) { await p.evaluate((yy) => window.scrollTo(0, yy), y); await p.waitForTimeout(120); }
    await p.evaluate(() => window.scrollTo(0, 0));
    await p.waitForTimeout(400);
    const id = `${path === '/' ? 'ru' : 'en'}-${w}-${theme}`;
    // Каждый раздел — свой кадр.
    const secs = await p.locator('header.top, main.wrap > section, footer.foot').all();
    let i = 0;
    for (const s of secs) { i += 1; await s.scrollIntoViewIfNeeded(); await p.waitForTimeout(250); await s.screenshot({ path: `${out}/${id}-s${String(i).padStart(2, '0')}.png` }); }
    const info = await p.evaluate(() => {
      const txt = document.body.innerText;
      const caps = [...document.querySelectorAll('.hero .cap')].map((c) => { const r = c.getBoundingClientRect(); return { t: c.textContent, w: Math.round(r.width), h: Math.round(r.height) }; });
      // Названия карточек в телефоне 2 «Как устроено» (класс nm внутри карточки измерения) — видимы и не перекрыты.
      const nms = [...document.querySelectorAll('.sec .dimc .nm, .sec .ph .nm')].slice(0, 6).map((n) => { const cs = getComputedStyle(n); return { t: n.textContent?.trim().slice(0, 30), pos: cs.position, bg: cs.backgroundColor }; });
      return {
        sys: /системный персонаж|system character|вымышлен|fictional/i.test(txt),
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        caps, nms,
        details: document.querySelectorAll('.faq details').length,
      };
    });
    // FAQ: раскрыть второй вопрос и снять высоту по кадрам.
    const d2 = p.locator('.faq details').nth(1);
    await d2.scrollIntoViewIfNeeded();
    await p.waitForTimeout(300);
    const trace = await p.evaluate(async () => {
      const d = document.querySelectorAll('.faq details')[1];
      const hs = [];
      const s = d.querySelector('summary');
      s.click();
      await new Promise((res) => { let n = 0; const f = () => { hs.push(Math.round(d.getBoundingClientRect().height)); if (++n < 30) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
      return hs;
    });
    await p.waitForTimeout(400);
    await d2.screenshot({ path: `${out}/${id}-faq-open.png` });
    const distinct = [...new Set(trace)].length;
    results.push({ id, secs: secs.length, ...info, faqFrames: distinct, faqTrace: trace.join(','), errors: errors.length, errs: errors.slice(0, 3) });
    await ctx.close();
  }
}
await b.close();
for (const r of results) console.log(JSON.stringify(r));
