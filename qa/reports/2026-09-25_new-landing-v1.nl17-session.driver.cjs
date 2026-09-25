// Разовый сценарий ручного прогона 2026-09-25 16:33:10 +03:00: запущен из корня как `node -e "…"`; тело ниже приложено без изменений. Повтор: node qa/reports/2026-09-25_new-landing-v1.nl17-session.driver.cjs
const { chromium } = require('@playwright/test');
(async () => {
  const B='https://ndim-stage.web.app'; const KEY=require('fs').readFileSync('tools/lib/contours.mjs','utf8').match(/STAGE_API_KEY\s*=\s*'([^']+)'/)?.[1];
  const b = await chromium.launch(); const c = await b.newContext(); const p = await c.newPage();
  let tok=null, uid=null; p.on('response', async r => { if (/accounts:signUp/.test(r.url())) { try { const j = await r.json(); tok=j.idToken; uid=j.localId; } catch {} } });
  await p.goto(B+'/ru', { waitUntil: 'load' }); await p.waitForFunction(() => window.__ndimDemoLive === true);
  await p.getByRole('link', { name: 'Смотреть больше' }).click(); await p.waitForURL(/\/profile/, { timeout: 30000 }); await p.waitForTimeout(3000);
  let t0 = Date.now(); await p.goto(B+'/ru', { waitUntil: 'domcontentloaded' }); await p.waitForURL(/\/profile/, { timeout: 20000 }).catch(()=>{});
  console.log('НЛ-17 живая сессия гостя: /ru →', new URL(p.url()).pathname, 'за', Date.now()-t0, 'мс');
  t0 = Date.now(); await p.goto(B+'/', { waitUntil: 'domcontentloaded' }); await p.waitForURL(/\/profile/, { timeout: 20000 }).catch(()=>{});
  console.log('НЛ-17 живая сессия гостя: / →', new URL(p.url()).pathname, 'за', Date.now()-t0, 'мс');
  await b.close();
  if (tok && KEY) { const r = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:delete?key='+KEY, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ idToken: tok }) }); console.log('уборка учётки', uid, r.status); } else console.log('уборка: ключ или токен не найдены', !!tok, !!KEY);
})();
