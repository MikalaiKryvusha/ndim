/**
 * Юниты слоя аккаунта — сегодня ровно один предмет: КАКУЮ ПОЧТУ предъявить Firebase при
 * возврате по ссылке из письма (`emailForLink`, `bugs/233`).
 *
 * Предмет выбран не случайно. До `bugs/233` источник был РОВНО ОДИН — память того браузера,
 * где вход начали, — и из этой единственности вырос дефект, который владелец поймал в бою:
 * письмо, открытое в другом браузере, объявлялось мёртвой ссылкой. Теперь источников три, у них
 * есть ПОРЯДОК, и порядок — это ровно то, что тихо разъезжается при следующей правке. Поэтому
 * он и закреплён здесь, а не оставлен на чтение комментария.
 *
 * ⛔ Чего здесь НЕТ и почему: почты из адреса ссылки. Она запрещена первоисточником Firebase
 * («*Do not pass the user's email in the redirect URL parameters … session injections*»), то
 * есть у функции просто нет такого довода — запрет держится формой, а не проверкой.
 *
 * Прогон: `node --test src/lib/data/account.test.ts`
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { emailForLink } from './account.ts';

/** Человек, который уже вошёл своей почтой. */
const signedIn = (email: string) => ({ isAnonymous: false, email });
/** Гость: анонимная сессия, почты нет. */
const guest = { isAnonymous: true, email: null };

test('рука человека сильнее всех остальных источников', () => {
  assert.equal(emailForLink(null, null, 'ruka@ndim.space'), 'ruka@ndim.space');
  assert.equal(emailForLink(null, 'pamyat@ndim.space', 'ruka@ndim.space'), 'ruka@ndim.space');
  assert.equal(
    emailForLink(signedIn('voshel@ndim.space'), 'pamyat@ndim.space', 'ruka@ndim.space'),
    'ruka@ndim.space',
  );
});

test('пробелы вокруг введённой почты не делают её другой почтой', () => {
  assert.equal(emailForLink(null, null, '  ruka@ndim.space  '), 'ruka@ndim.space');
});

test('пустая строка от человека — это НЕ ответ: берём следующий источник', () => {
  // Иначе пустое поле формы молча становилось бы «почтой» и Firebase отвечал бы отказом,
  // а человек читал бы его как приговор ссылке — тот самый ложный диагноз `bugs/233`.
  assert.equal(emailForLink(null, 'pamyat@ndim.space', ''), 'pamyat@ndim.space');
  assert.equal(emailForLink(null, 'pamyat@ndim.space', '   '), 'pamyat@ndim.space');
});

test('память браузера идёт второй — штатный путь «вход начали здесь же»', () => {
  assert.equal(emailForLink(null, 'pamyat@ndim.space'), 'pamyat@ndim.space');
  assert.equal(
    emailForLink(signedIn('voshel@ndim.space'), 'pamyat@ndim.space'),
    'pamyat@ndim.space',
  );
});

test('🔴 СЛУЧАЙ ВЛАДЕЛЬЦА: письмо открыто там, где человек уже вошёл', () => {
  // Памяти о начале входа в этом браузере нет — и раньше это кончалось «ссылка больше не
  // действует» поверх его же данных. Его собственная почта — законный третий источник.
  assert.equal(emailForLink(signedIn('nikolai@ndim.space'), null), 'nikolai@ndim.space');
});

test('гость третьим источником НЕ считается — его путь другой', () => {
  // У анонима почты нет вовсе; а если бы и была, гость — это временная сессия, а не
  // «человек, который уже вошёл». Его ссылка идёт в привязку (`linkWithCredential`).
  assert.equal(emailForLink(guest, null), null);
  assert.equal(emailForLink({ isAnonymous: true, email: 'prizrak@ndim.space' }, null), null);
});

test('вошедший без почты (вход через Google) третьим источником не становится', () => {
  assert.equal(emailForLink({ isAnonymous: false, email: null }, null), null);
});

test('неоткуда взять — честный null, а не выдуманная почта', () => {
  // `null` здесь означает ВОПРОС человеку, а не приговор ссылке: так велит сам Firebase
  // («ask the user to provide the associated email again»).
  assert.equal(emailForLink(null, null), null);
  assert.equal(emailForLink(null, null, undefined), null);
});

test('порядок источников именно такой, а не «какой найдётся»', () => {
  // Один случай, где различимы все три сразу: подмена порядка ломает ровно этот тест.
  const all = emailForLink(signedIn('tretiy@ndim.space'), 'vtoroy@ndim.space', 'perviy@ndim.space');
  assert.equal(all, 'perviy@ndim.space');

  const withoutHand = emailForLink(signedIn('tretiy@ndim.space'), 'vtoroy@ndim.space');
  assert.equal(withoutHand, 'vtoroy@ndim.space');

  const onlySession = emailForLink(signedIn('tretiy@ndim.space'), null);
  assert.equal(onlySession, 'tretiy@ndim.space');
});
