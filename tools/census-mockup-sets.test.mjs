/**
 * ЮНИТЫ ПЕРЕПИСИ НАБОРОВ МАКЕТОВ (`tools/census-mockup-sets.mjs`).
 *
 * 🔴 ГЛАВНОЕ ЗДЕСЬ — НЕ АРИФМЕТИКА, А ТО, ЧТО ПЕРЕПИСЬ СЧИТАЕТ ЧУЖОЕ ДЕРЕВО. Прибор, который
 * умеет считать только СВОЙ каталог, доказать нечем: правильный и слепой дают там одинаковый
 * ответ ([[EXP-0269]]). Поэтому `перепись()` принимает ПУТЬ, а юниты строят поддельные каталоги
 * в песочнице с заведомо известным составом — и требуют от неё чисел этого состава.
 *
 * Прогон: node --test tools/census-mockup-sets.test.mjs · npm run test:tools
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { перепись, судХраповика, этоНабор, чегоНеХватает, selftest } from './census-mockup-sets.mjs';

/** Набор дома стиля со всеми крючками съёмщика. */
const ЦЕЛЫЙ = `<!doctype html><html><body>
<div class="picker"><button data-v="1">V1</button><button data-v="2">V2</button>
<button id="width-mid">1024</button><button id="width">390 ↔ 1440</button><button id="theme">тема</button></div>
<div id="stage" data-w="1440"><div class="variant" id="1">x</div></div></body></html>`;

/** Набор БЕЗ сцены — ровно та болезнь десяти старых наборов. */
const БЕЗ_СЦЕНЫ = ЦЕЛЫЙ.replace('<div id="stage" data-w="1440">', '<div class="stage">').replace(
  '<button id="width">390 ↔ 1440</button>',
  '',
);

function песочница(файлы) {
  const корень = mkdtempSync(join(tmpdir(), 'census-'));
  const design = join(корень, 'design');
  mkdirSync(design, { recursive: true });
  for (const [имя, текст] of Object.entries(файлы)) writeFileSync(join(design, имя), текст, 'utf8');
  return { корень, design };
}

test('перепись считает ЧУЖОЙ каталог, а не свой: 3 набора, 2 снимаемы', () => {
  const { корень, design } = песочница({
    'a-mockups.html': ЦЕЛЫЙ,
    'b-mockups.html': ЦЕЛЫЙ,
    'c-mockups.html': БЕЗ_СЦЕНЫ,
  });
  try {
    const и = перепись(design);
    assert.equal(и.всего, 3);
    assert.equal(и.снимаемых, 2);
    assert.deepEqual(и.долг.map((н) => н.файл), ['c-mockups.html']);
  } finally {
    rmSync(корень, { recursive: true, force: true });
  }
});

test('html без кнопок вариантов набором НЕ считается и в перепись не попадает', () => {
  const { корень, design } = песочница({
    'a-mockups.html': ЦЕЛЫЙ,
    'readme.html': '<html><body><h1>просто страница</h1></body></html>',
  });
  try {
    const и = перепись(design);
    assert.equal(и.всего, 1, 'посторонняя страница раздула бы знаменатель переписи');
  } finally {
    rmSync(корень, { recursive: true, force: true });
  }
});

test('средняя ширина считается ОТДЕЛЬНО и на приговор не влияет', () => {
  const безMid = ЦЕЛЫЙ.replace('<button id="width-mid">1024</button>', '');
  const { корень, design } = песочница({ 'a-mockups.html': ЦЕЛЫЙ, 'b-mockups.html': безMid });
  try {
    const и = перепись(design);
    assert.equal(и.снимаемых, 2, 'отсутствие #width-mid не делает набор неснимаемым');
    assert.equal(и.сСреднейШириной, 1);
  } finally {
    rmSync(корень, { recursive: true, force: true });
  }
});

test('пустой каталог даёт ноль, а не падение', () => {
  const { корень, design } = песочница({});
  try {
    const и = перепись(design);
    assert.equal(и.всего, 0);
    assert.equal(и.долг.length, 0);
  } finally {
    rmSync(корень, { recursive: true, force: true });
  }
});

// ── Признак ПО СУЩЕСТВУ: не один симптом, а все требования съёмщика ────────────────────────

test('🔴 набор с #stage, но без #theme — неснимаем: проверка по одному #stage пропустила бы его', () => {
  const безТемы = ЦЕЛЫЙ.replace('<button id="theme">тема</button>', '');
  assert.deepEqual(чегоНеХватает(безТемы), ['theme']);
  assert.ok(этоНабор(безТемы), 'это всё ещё набор — он просто неснимаем');
});

test('id="width-mid" не засчитывается за id="width" — кавычки в образце несущие', () => {
  const толькоMid = ЦЕЛЫЙ.replace('<button id="width">390 ↔ 1440</button>', '');
  assert.deepEqual(чегоНеХватает(толькоMid), ['width']);
});

// ── Храповик ───────────────────────────────────────────────────────────────────────────────

test('храповик молчит, когда долг совпал', () => {
  assert.ok(судХраповика(['a', 'b'], ['a', 'b']).чисто);
});

test('🔴 храповик краснеет, когда долг ВЫРОС, и называет новичка поимённо', () => {
  const с = судХраповика(['a', 'b'], ['a']);
  assert.equal(с.чисто, false);
  assert.deepEqual(с.появились, ['b']);
  assert.deepEqual(с.ушли, []);
});

test('🔴 храповик краснеет и когда долг УМЕНЬШИЛСЯ — иначе список сам станет протухшим числом', () => {
  const с = судХраповика(['a'], ['a', 'b']);
  assert.equal(с.чисто, false);
  assert.deepEqual(с.ушли, ['b']);
  assert.deepEqual(с.появились, []);
});

test('храповик не зависит от порядка имён', () => {
  assert.ok(судХраповика(['b', 'a'], ['a', 'b']).чисто);
});

// ── Самотест прибора исполняется, а не только написан ──────────────────────────────────────

test('самотест прибора зелёный', () => {
  assert.equal(selftest(), 0);
});
