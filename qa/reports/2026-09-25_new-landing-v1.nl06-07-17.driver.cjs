// Разовый сценарий ручного прогона 2026-09-25 16:32:28 +03:00: запущен из корня как `node -e "…"`; тело ниже приложено без изменений. Повтор: node qa/reports/2026-09-25_new-landing-v1.nl06-07-17.driver.cjs
const { chromium } = require('@playwright/test');
(async () => {
  const B='https://ndim-stage.web.app'; const b = await chromium.launch();
  // НЛ-07: ссылки подвала → код ответа
  const p = await b.newPage(); await p.goto(B+'/ru', { waitUntil: 'load' });
  const hrefs = await p.locator('footer.foot a').evaluateAll(a => a.map(x => x.getAttribute('href')));
  for (const h of hrefs) { const r = await fetch(B+h); console.log('НЛ-07', h, r.status); }
  // НЛ-06: раскрыть вопрос второй группы
  const q = p.locator('.faq details').nth(4); await q.locator('summary').click(); await p.waitForTimeout(300);
  console.log('НЛ-06 открыт:', await q.evaluate(d => d.open), '|', (await q.locator('p').textContent()).slice(0,60));
  await p.close();
  // НЛ-17: маркер сессии на /ru и / → уход в /profile
  for (const path of ['/ru','/']) { const c = await b.newContext(); await c.addInitScript(() => { try { localStorage.setItem('ndim-session','1'); } catch {} });
    const pg = await c.newPage(); let landingSeen=false; await pg.goto(B+path, { waitUntil: 'domcontentloaded' });
    await pg.waitForURL(/\/profile/, { timeout: 20000 }).catch(()=>{}); console.log('НЛ-17', path, '→', new URL(pg.url()).pathname); await c.close(); }
  await b.close();
})();
