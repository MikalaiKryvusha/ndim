/**
 * СТРАЖ ПРАВИЛ ЯЗЫКА — ворота шага 1 `plans/39`.
 *
 * Проверяются ПРАВИЛА решения: «какой язык задаёт адрес» и «что показать человеку, о котором мы
 * не знаем ничего». Состояние (`lang()`, `setLang`, мост «адрес → память») живёт в
 * `$lib/ui/lang.svelte.ts` на рунах Svelte и под `node --test` не исполняется в принципе — его
 * доказывает живой Chrome в шаге 6. Разделение сознательное: **юнит доказывает ПРАВИЛО, браузер
 * доказывает ПОВЕДЕНИЕ**, и одно другое не заменяет.
 */
import assert from 'node:assert/strict';
import { test, afterEach } from 'node:test';

import { langFromPath, langFromBrowser, isLang, LANGS, X_DEFAULT } from './langs.ts';

// ── АДРЕС ЗАДАЁТ ЯЗЫК ────────────────────────────────────────────────────────────────────────

test('языковой префикс адреса распознаётся', () => {
  assert.equal(langFromPath('/ru/dimension/skiing-11mnoskt'), 'ru');
  assert.equal(langFromPath('/en/dimension/skiing-11mnoskt'), 'en');
  assert.equal(langFromPath('/ru/menu/terms'), 'ru');
  assert.equal(langFromPath('/en/'), 'en');
  assert.equal(langFromPath('/ru'), 'ru');
});

test('адрес БЕЗ языкового префикса языка не задаёт', () => {
  // За стеной входа языковых адресов нет и не будет — там правит память браузера.
  for (const p of ['/', '/profile', '/dims', '/menu', '/relations', '/space', '/account']) {
    assert.equal(langFromPath(p), null, `«${p}» не должен задавать язык`);
  }
});

test('🔴 ПОХОЖИЙ на язык сегмент языком НЕ считается', () => {
  // Ради этого правило и написано «ровно код языка», а не «начинается с кода». Иначе страница
  // `/russian-literature/…` или измерение со слагом на `ru` увели бы язык всей страницы.
  for (const p of ['/russian/x', '/ru-RU/x', '/english/x', '/rus/x', '/eng/x', '/e/x', '/rutrekker']) {
    assert.equal(langFromPath(p), null, `«${p}» не язык`);
  }
});

test('неизвестный язык не принимается — список один на проект', () => {
  // Третий язык добавляется в `LANGS` и в `src/params/lang.ts`, а не появляется сам из адреса.
  for (const p of ['/de/x', '/es/x', '/fr/x', '/zz/x']) {
    assert.equal(langFromPath(p), null);
  }
});

test('список языков и x-default согласованы', () => {
  assert.deepEqual([...LANGS], ['ru', 'en']);
  // Отдельная строка ответа владельца (интервью №010, Р5): «x-default указывает на английский».
  assert.equal(X_DEFAULT, 'en');
  assert.equal(isLang(X_DEFAULT), true);
  assert.equal(isLang('de'), false);
  assert.equal(isLang(null), false);
});

// ── УМОЛЧАНИЕ ДЛЯ ПУСТОЙ ПАМЯТИ (интервью №024, В1 = А) ─────────────────────────────────────

const realNavigator = globalThis.navigator;
const fakeNavigator = (language: unknown, languages: unknown = []) => {
  Object.defineProperty(globalThis, 'navigator', {
    value: { language, languages },
    configurable: true,
    writable: true,
  });
};

afterEach(() => {
  Object.defineProperty(globalThis, 'navigator', {
    value: realNavigator,
    configurable: true,
    writable: true,
  });
});

test('браузер просит русский — даём русский', () => {
  fakeNavigator('ru-RU', ['ru-RU', 'ru', 'en-US']);
  assert.equal(langFromBrowser(), 'ru');
});

test('браузер просит что угодно другое — даём английский', () => {
  for (const l of ['en-US', 'de-DE', 'es', 'zh-CN', 'pl-PL']) {
    fakeNavigator(l, [l]);
    assert.equal(langFromBrowser(), 'en', `на «${l}» должен быть английский`);
  }
});

test('русский ВТОРЫМ в списке предпочтений тоже считается', () => {
  // Человек с системой на английском, но с русским вторым языком — русскоязычный человек.
  fakeNavigator('en-US', ['en-US', 'ru']);
  assert.equal(langFromBrowser(), 'ru');
});

test('регистр не важен', () => {
  fakeNavigator('RU-ru', ['RU-ru']);
  assert.equal(langFromBrowser(), 'ru');
});

test('битый или пустой navigator не роняет решение', () => {
  fakeNavigator('', []);
  assert.equal(langFromBrowser(), 'en');
  fakeNavigator(undefined, undefined);
  assert.equal(langFromBrowser(), 'en');
  fakeNavigator(42, [null, 7]);
  assert.equal(langFromBrowser(), 'en');
});
