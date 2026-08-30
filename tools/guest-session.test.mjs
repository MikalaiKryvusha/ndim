/**
 * ЮНИТЫ ГОСТЕВОЙ СЕССИИ СТЕНДА — суждение, отделённое от эмулятора.
 *
 * Дефект, ради которого модуль и юниты существуют: прибор `bugs/226` напечатал «гость рождён»
 * с uid `dev@ndim.space` и уборкой снёс dev-пользователя стенда целиком. Обе половины лечения
 * (выбор записи по СВОЙСТВУ · отказ удалять негостевую учётку) — чистые функции, и проверяются
 * они здесь, без браузера и без эмуляторов: живой прогон такой случай воспроизводит редко и
 * недетерминированно, а юнит — каждый раз.
 *
 * 🔑 Случай «несколько гостевых записей» стоит в наборе не для полноты: именно на нём соблазн
 * «возьмём первую» выглядит безобиднее всего.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { chooseGuestRecord, mayDeleteAsGuest } from './lib/guest-session.mjs';

const anonRecord = (uid, app = '[DEFAULT]') => ({
  fbase_key: `firebase:authUser:AIzaKEY:${app}`,
  value: { uid, isAnonymous: true },
});
const fullRecord = (uid, app = '[DEFAULT]') => ({
  fbase_key: `firebase:authUser:AIzaKEY:${app}`,
  value: { uid, isAnonymous: false },
});

test('гостевая запись выбирается по свойству, а не по порядку', () => {
  // Ровно тот порядок, на котором дефект и случился: полноценная учётка стоит ПЕРВОЙ,
  // и `find` без разбора вернул бы её.
  const got = chooseGuestRecord([fullRecord('DEV_UID'), anonRecord('GUEST_UID', 'secondary')]);
  assert.equal(got.uid, 'GUEST_UID');
  assert.equal(got.authRecords, 2);
  assert.equal(got.anonymous, 1);
  assert.equal(got.reason, null);
});

test('гостевой записи нет — прибор возвращает причину, а не чужой uid', () => {
  const got = chooseGuestRecord([fullRecord('DEV_UID')]);
  assert.equal(got.uid, null, 'полноценная учётка НЕ смеет выдаваться за гостя');
  assert.match(got.reason, /полноценным учёткам/);
});

test('записей аутентификации нет вовсе — причина названа отдельно', () => {
  const got = chooseGuestRecord([{ fbase_key: 'firebase:heartbeat', value: {} }]);
  assert.equal(got.uid, null);
  assert.equal(got.authRecords, 0);
  assert.match(got.reason, /дверь не сработала/);
});

test('гостей несколько — прибор отказывается выбирать наугад', () => {
  const got = chooseGuestRecord([anonRecord('A'), anonRecord('B', 'second')]);
  assert.equal(got.uid, null, 'выбор наугад здесь и был бы тем же дефектом, только тише');
  assert.equal(got.anonymous, 2);
  assert.match(got.reason, /наугад/);
});

test('пустой вход не роняет прибор и не выдаёт uid', () => {
  for (const empty of [[], null, undefined]) {
    const got = chooseGuestRecord(empty);
    assert.equal(got.uid, null);
    assert.equal(got.authRecords, 0);
  }
});

test('🔒 удаление отказано на учётке с провайдером входа', () => {
  const verdict = mayDeleteAsGuest({
    uid: 'DEV_UID',
    email: 'dev@ndim.space',
    providerData: [{ providerId: 'password' }],
  });
  assert.equal(verdict.ok, false);
  assert.match(verdict.why, /НЕ гостевая/);
});

test('🔒 удаление отказано на учётке с почтой, даже без провайдеров', () => {
  // Учётка с почтой и пустым providerData — состояние, которое эмулятор порождает при
  // связывании; вести себя как с гостем на ней нельзя.
  const verdict = mayDeleteAsGuest({ uid: 'U', email: 'someone@ndim.space', providerData: [] });
  assert.equal(verdict.ok, false);
});

test('удаление разрешено на анонимной учётке: провайдеров нет, почты нет', () => {
  const verdict = mayDeleteAsGuest({ uid: 'GUEST_UID', email: null, providerData: [] });
  assert.equal(verdict.ok, true);
  assert.match(verdict.why, /анонимная/);
});

test('🔒 учётки нет — удалять нечего, и это не «разрешено»', () => {
  const verdict = mayDeleteAsGuest(null);
  assert.equal(verdict.ok, false);
  assert.match(verdict.why, /нет/);
});
