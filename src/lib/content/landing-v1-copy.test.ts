/**
 * Тексты главной не называют Макса, Алису и Настю вымышленными — ни прямо, ни «системными персонажами».
 *
 * Слово владельца к герою V3 (2026-09-25, `design/new-landing-v1.html:12`): «*Только не пишем, что они
 * вымышленные!*». В бою 25.09 плашка «системный персонаж» всё равно стояла в «Связях» блока «Как устроено»,
 * и владелец поймал её сам: «*я ясно блять сказал на лендинге убрать нахуй упоминание, что это выдуманные
 * персонажи!*». Проверка идёт по ВСЕМ строкам копирайта главной и FAQ, на обоих языках: новая строка
 * с тем же смыслом краснеет здесь, до сборки.
 *
 * Образец Unicode-aware (`\p{L}` и флаг `u`): `\b` рядом с кириллицей молча не срабатывает
 * (`AGENT_GUIDE.md` → «САМОТЕСТ РУССКОЙ ПРОВЕРКИ ИДЁТ НА РУССКОМ ОБРАЗЦЕ»).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { landingFaq, landingV1 } from './landing-v1-copy.ts';

/** Смысл, запрещённый владельцем: персонажи ненастоящие. Русские и английские формы. */
const FORBIDDEN = /вымышл\p{L}*|выдуман\p{L}*|придуман\p{L}* персонаж\p{L}*|системн\p{L}* персонаж\p{L}*|ненастоящ\p{L}*|fictional|made[- ]up|imaginary|system character/iu;

/** Все строки объекта копирайта, с путём до каждой — чтобы красное называло место. */
function strings(node: unknown, path: string, out: Array<[string, string]>): Array<[string, string]> {
  if (typeof node === 'string') out.push([path, node]);
  else if (Array.isArray(node)) node.forEach((v, i) => strings(v, `${path}[${i}]`, out));
  else if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) strings(v, `${path}.${k}`, out);
  return out;
}

test('образец ловит запрещённый смысл на обоих языках (контроль прибора)', () => {
  for (const bad of ['системный персонаж', 'Макс — вымышленный персонаж', 'system character', 'fictional characters', 'выдуманные персонажи']) {
    assert.match(bad, FORBIDDEN, bad);
  }
  assert.doesNotMatch('Макс, Алиса и Настя любят кино', FORBIDDEN);
});

test('в текстах главной и FAQ персонажи не названы вымышленными', () => {
  const all = [...strings(landingV1, 'landingV1', []), ...strings(landingFaq, 'landingFaq', [])];
  assert.ok(all.length > 50, `строк копирайта прочитано ${all.length} — прибор не дошёл до текстов`);
  const hits = all.filter(([, s]) => FORBIDDEN.test(s)).map(([p, s]) => `${p}: «${s}»`);
  assert.deepEqual(hits, []);
});
