/**
 * ПАРНЫЙ ТЕСТ СТРАЖА ПРАВДЫ МАКЕТОВ.
 *
 * Страж без парного теста — мнение файла о себе: он может замолчать при первой же правке, и
 * ворота останутся зелёными. Здесь его самотест зовётся из `npm run test:tools`, а сверх него
 * стоят мутации на ЖИВЫХ строках продукта — те, что поймали дефект 2026-09-09.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { самотест, проверить, строкиПродукта, видимыйТекст } from './verify-mockup-truth.mjs';

const КОРЕНЬ = resolve(import.meta.dirname, '..');
const строки = строкиПродукта([
  readFileSync(resolve(КОРЕНЬ, 'src/routes/profile/+page.svelte'), 'utf8'),
  readFileSync(resolve(КОРЕНЬ, 'src/lib/ui/GuestCard.svelte'), 'utf8'),
]);

test('самотест стража зелёный', () => {
  assert.equal(самотест(), 0);
});

test('отменённое владельцем утверждение краснеет (№069 В2 = А)', () => {
  const улики = проверить('мутант', '<li>Вас никто не видит: в Пространстве Вы невидимы.</li>', строки);
  assert.equal(улики.filter((у) => у.вид === 'запрет').length, 1);
});

test('та же посылка другими словами тоже краснеет', () => {
  const улики = проверить('мутант', '<p>Пока что в Пространстве Вы невидимы для других.</p>', строки);
  assert.equal(улики.filter((у) => у.вид === 'запрет').length, 1);
});

test('цитата продукта, обрезанная на половине, краснеет', () => {
  const эталон = строки.find((с) => с.length > 90);
  const улики = проверить('мутант', `<p>${эталон.slice(0, 60)}</p>`, строки);
  assert.equal(улики.filter((у) => у.вид === 'дословность').length, 1);
});

test('цитата продукта целиком проходит', () => {
  const эталон = строки.find((с) => с.length > 90);
  assert.equal(проверить('мутант', `<p>${эталон}</p>`, строки).length, 0);
});

test('судимый набор «первый экран гостя» чист по запретам', () => {
  const html = readFileSync(resolve(КОРЕНЬ, 'design/guest-first-screen-mockups.html'), 'utf8');
  const улики = проверить('guest-first-screen-mockups.html', html, строки);
  assert.deepEqual(улики.filter((у) => у.вид === 'запрет'), []);
});

test('разметка и комментарии не считаются текстом макета', () => {
  const html = '<!-- Вас никто не видит: в Пространстве Вы невидимы -->\n<style>.a{}</style><p>Чистый текст</p>';
  assert.equal(проверить('мутант', html, строки).length, 0, 'запрет в КОММЕНТАРИИ — не показ владельцу');
  assert.equal(видимыйТекст(html), 'Чистый текст');
});
