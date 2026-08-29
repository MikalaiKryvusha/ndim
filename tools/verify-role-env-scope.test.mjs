/**
 * ТЕСТ СТРАЖА ГРАНИЦЫ КЛЮЧЕЙ (`tools/verify-role-env-scope.mjs`).
 *
 * 🔴 ПОВОД. Страж заведён как оплата долга `EXP-0216` — границы «в копию роли едут только ключи
 * её постановки», которая семь дней держалась ЗАПИСЬЮ. Механизм, заменяющий запись, обязан сам
 * иметь механизм: иначе он разъедется тем же способом, что и правило, которое он заменил.
 *
 * 🔴🔴 ГЛАВНЫЙ СЛУЧАЙ ЗДЕСЬ — НЕ «БОЕВОЙ КЛЮЧ ПОЙМАН», А «КОНСОЛЬНЫЙ КЛЮЧ НЕ ПОЙМАН». Проверка
 * одного лишь отлова была бы зелёной и на признаке `_SA_B64$`, который первым просился в код, —
 * и красил бы `NDIM_CONSOLE_SA_B64`, положенный роли dev-3 по её постановке. Отлов и пропуск
 * различает только пара случаев, поэтому они стоят рядом и порознь смысла не имеют
 * (класс `EXP-0223`: ширина правила замеряется ДО объявления).
 *
 * ⚠️ Прибор ПОДКЛЮЧАЕТСЯ напрямую, и это законно: у него стоит предохранитель «запущен напрямую
 * или подключён», поэтому импорт отдаёт чистые функции и не поднимает обход рабочих копий.
 * Без предохранителя этот набор краснел бы от состояния чужого `.env`, а не от своей логики.
 *
 * Прогон: node --test tools/verify-role-env-scope.test.mjs   (или `npm run test:tools`)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { KEY_CLASSES, judgeKeys, keyNames } from './verify-role-env-scope.mjs';

test('боевой ключ в копии роли — отлов', () => {
	const got = judgeKeys(['POSTHOG_PROJECT_ID', 'NDIM_PROD_SA_B64']);
	assert.equal(got.forbidden.length, 1);
	assert.equal(got.forbidden[0].key, 'NDIM_PROD_SA_B64');
	assert.ok(got.forbidden[0].why.length > 0, 'отказ обязан нести причину: её читает роль');
});

test('🔴 консольный ключ роли ПОЛОЖЕН — признак по суффиксу покрасил бы исправное', () => {
	// NDIM_CONSOLE_SA_B64 кончается на _SA_B64 ровно как боевые, но принадлежит постановке dev-3.
	const got = judgeKeys(['NDIM_CONSOLE_SA_B64']);
	assert.deepEqual(got.forbidden, []);
	assert.deepEqual(got.unclassified, []);
});

test('пустое значение считается наличием', () => {
	// Пустой боевой ключ безвреден сегодня и будет заполнен завтра тем, кто увидит знакомое имя.
	assert.equal(judgeKeys(keyNames('NDIM_PROD_SA_B64=')).forbidden.length, 1);
});

test('неизвестный ключ требует класса, а не додумывания', () => {
	const got = judgeKeys(['NDIM_NEW_THING']);
	assert.deepEqual(got.forbidden, []);
	assert.deepEqual(got.unclassified, ['NDIM_NEW_THING']);
});

test('закомментированная строка ключом не считается', () => {
	assert.deepEqual(keyNames('# NDIM_PROD_SA_B64=x'), []);
});

test('возврат каретки не приклеивается к имени (core.autocrlf=true)', () => {
	assert.deepEqual(keyNames('POSTHOG_REGION=eu\r\nPOSTHOG_PROJECT_ID=1\r\n'), [
		'POSTHOG_REGION',
		'POSTHOG_PROJECT_ID',
	]);
});

test('значение не вытекает наружу ни одним путём', () => {
	// Вывод ворот попадает в транскрипты и логи: разбор обязан возвращать ИМЕНА, и только их.
	const secret = 'сюда-нельзя-смотреть';
	const names = keyNames(`NDIM_PROD_SA_B64=${secret}`);
	assert.deepEqual(names, ['NDIM_PROD_SA_B64']);
	const printed = JSON.stringify(judgeKeys(names));
	assert.ok(!printed.includes(secret), 'значение ключа не имеет права попасть в вывод суда');
});

test('каждая строка таблицы классов несёт причину', () => {
	// Причина печатается в отказе; строка без неё делает отказ немым.
	for (const [key, cls] of KEY_CLASSES) {
		assert.equal(typeof cls.owner, 'boolean', `${key}: класс обязан быть назван явно`);
		assert.ok(cls.why && cls.why.length > 10, `${key}: причина обязана быть содержательной`);
	}
});

test('🔑 контрольная мутация: страж СПОСОБЕН покраснеть', () => {
	// Зелёное прибора, который не умеет краснеть, не значит ничего (канон TESTING_FRAMEWORK).
	assert.equal(judgeKeys(['NDIM_STAGE_SA_B64']).forbidden.length, 1);
	assert.equal(judgeKeys(['POSTHOG_REGION']).forbidden.length, 0);
});
