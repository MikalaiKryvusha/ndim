#!/usr/bin/env node
/**
 * СТРАЖ ДВЕРНОГО ТЕКСТА — строки, которые человек читает ПЕРВЫМИ, судятся как артефакт владельца.
 *
 * Заведён по слову владельца 2026-08-30 (`GOAL.md` → «ПЛАНКА БРЕНДА»):
 * «*какого хуя вы до сих пор не поняли, что мы разрабатываем уважаемый бренд и продук*» и
 * «*это текста не серьёзного уверенного в себе продукта, а текста сопливых школьников*».
 *
 * 🔑 КЛАСС, КОТОРЫЙ ОН ЗАКРЫВАЕТ. Портрет голоса лежал с 2 августа, поручение писать по нему
 * отдано 16 августа, роутер `AGENT_GUIDE.md` гонит через портрет «текст, который владелец
 * подписывает или читает как своё» — и НИКТО не отнёс к этому кнопки и подписи в `src/`. Строки
 * экрана входа простояли в бою непросуженными, макет перенёс их дословно, и дефект дошёл до
 * владельца. Указание владельца — не штатный способ ловить дефекты.
 *
 * 🔴 ПОЧЕМУ ЖЁСТКАЯ ЗОНА УЗКАЯ, И ЭТО НЕ РОБОСТЬ ПРИБОРА. Первая редакция судила жёстко весь
 * текст продукта и покраснела на ЗАКОННОМ: «одни и те же 12 вещей» — обычный русский, а не
 * противопоставление · «Пространство NDim» в разделе «О проекте» — зарегистрированное имя
 * проекта рядом с английским «NDim Space» · «Спасибо за Вашу поддержку ❤️» — текст владельца из
 * 1.x · смайлики шкалы оценки — канон 1.x, их стережёт `verify-manual-v1.mjs`. Портрет прямо
 * предупреждает: прибор, красный на собственном тексте владельца, выключат в первый же день.
 * Поэтому ЖЁСТКО судится ДВЕРЬ (экран входа), а весь остальной текст продукта идёт отчётом.
 *
 * ⛔ ЧЕГО ЭТОТ СТРАЖ НЕ ДЕЛАЕТ. Он не судит СОДЕРЖАНИЕ и не заменяет ни разведку топов, ни суд по
 * шести запретам портрета чтением. Он ловит улики, у которых на двери нет законного применения.
 *
 * Запуск: node tools/guard-product-copy.mjs
 * Самотест: node tools/guard-product-copy.mjs --selftest
 * Код возврата: 0 — на двери чисто; 1 — на двери улика.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const argv = process.argv.slice(2);

const ZONES = ['src/lib/content', 'src/lib/data', 'src/routes'];
const SKIP = /\.(test|spec)\.[tj]s$|\.d\.ts$/u;

/**
 * ВНЕ ЗОНЫ, и у каждого исключения названа причина.
 * `docs.ts` — пользовательское соглашение, политика и история версий: там имя системы стоит как
 * юридическое, а сердечки в благодарностях есть запись истории. Такой текст судит владелец.
 */
const OUT_OF_ZONE = /docs\.ts$/u;

/** Канон шкалы оценки 1.x — смайлики нарисованы в 1.x, стережёт `verify-manual-v1.mjs`. */
const SCALE_1X = /^\((?:очень мало|мало|средне|много|очень много|Отлично!|Ого!|Восторг!|Шедевр!|Идеал!|никак)/u;

/** УЛИКИ. На двери — жёсткие, вне двери — отчёт. У каждой названо, каким правилом она куплена. */
const RULES = [
	{
		id: 'З2-тождество',
		why: 'запрет З2 портрета называет «в ТОТ ЖЕ» дословно (раздел 0, слова владельца)',
		re: /(?<![А-Яа-яЁё-])(?:тот|та|то|те|той|том|тем|тех)\s+же(?![А-Яа-яЁё-])/giu,
	},
	{
		id: 'эмодзи',
		why: 'дверь уважаемого бренда эмодзи не носит',
		re: /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu,
	},
	{
		id: 'имя-бренда-усечено',
		why: 'канон: на двери имя повторяется целиком — «Пространство NDim Space»',
		re: /Пространств[а-яё]*\s+NDim(?!\s+Space)/gu,
	},
	{
		id: 'З1-робость',
		why: 'запрет З1 «не оправдываться»: дверь не извиняется за то, чего у продукта нет',
		re: /(?<![А-Яа-яЁё-])(?:не нужен|не нужна|не требуется|всего лишь|осмотреться|попробовать)(?![А-Яа-яЁё-])/giu,
	},
	{
		id: 'З2-союзы',
		why: 'запрет З2 «не противопоставлять»',
		re: /(?<![А-Яа-яЁё-])(?:зато|однако|вместо|наоборот|напротив)(?![А-Яа-яЁё-])/giu,
	},
];

const RU_LITERAL = /(['"`])([^'"`\n]*[А-яЁё][^'"`\n]*)\1/gu;

/**
 * ДВЕРЬ — блок `signedOut: { … }` и ключи, начинающиеся с `signin`. Зона ищется ПО ЯКОРЮ, а не по
 * номерам строк: номера разъезжаются молча, якорь — громко (самотест ниже это и проверяет).
 */
export function doorLines(src) {
	const lines = src.split('\n');
	const door = new Set();
	for (let i = 0; i < lines.length; i++) {
		if (!/^\s*(?:signedOut\s*:\s*\{|signin[A-Za-z]*\s*:\s*\{)/u.test(lines[i])) continue;
		let depth = 0;
		for (let j = i; j < lines.length; j++) {
			depth += (lines[j].match(/\{/gu) || []).length;
			depth -= (lines[j].match(/\}/gu) || []).length;
			door.add(j + 1);
			if (depth <= 0 && j > i) break;
		}
	}
	return door;
}

function walk(dir, out = []) {
	let entries;
	try { entries = readdirSync(dir); } catch { return out; }
	for (const e of entries) {
		const p = join(dir, e);
		if (statSync(p).isDirectory()) walk(p, out);
		else if (/\.(ts|js|svelte)$/u.test(e) && !SKIP.test(e) && !OUT_OF_ZONE.test(p)) out.push(p);
	}
	return out;
}

/** Судит один текст. Возвращает улики ПОИМЁННО — сводного числа намеренно нет. */
export function judge(text) {
	const hits = [];
	for (const rule of RULES) {
		for (const m of text.matchAll(rule.re)) hits.push({ rule: rule.id, why: rule.why, found: m[0] });
	}
	return hits;
}

function scan() {
	const found = [];
	for (const f of ZONES.flatMap((z) => walk(join(ROOT, z)))) {
		const src = readFileSync(f, 'utf8');
		const door = doorLines(src);
		src.split('\n').forEach((line, i) => {
			const t = line.trim();
			if (t.startsWith('*') || t.startsWith('//') || t.startsWith('/*')) return;
			for (const m of line.matchAll(RU_LITERAL)) {
				const str = m[2];
				if (SCALE_1X.test(str)) return;
				for (const hit of judge(str)) {
					found.push({
						file: relative(ROOT, f).split(String.fromCharCode(92)).join('/'),
						line: i + 1,
						onDoor: door.has(i + 1),
						str,
						...hit,
					});
				}
			}
		});
	}
	return found;
}

function run() {
	const found = scan();
	const onDoor = found.filter((f) => f.onDoor);

	console.log('\nСТРАЖ ДВЕРНОГО ТЕКСТА');
	console.log(`\n🔴 ДВЕРЬ (экран входа) — улик: ${onDoor.length}`);
	for (const h of onDoor) {
		console.log(`   ${h.file}:${h.line} · ${h.rule} · «${h.found}»`);
		console.log(`      строка: «${h.str.slice(0, 100)}»`);
		console.log(`      правило: ${h.why}`);
	}
	if (!onDoor.length) console.log('   чисто');

	// ПОИМЁННО ПО ПРАВИЛАМ: сводное число скрывает падение по одному правилу.
	console.log(`\n🟡 ОСТАЛЬНОЙ ТЕКСТ ПРОДУКТА — отчёт, прогон не роняет:`);
	for (const rule of RULES) {
		const n = found.filter((f) => !f.onDoor && f.rule === rule.id).length;
		console.log(`   ${rule.id}: ${n}`);
	}

	console.log('\n🔴 ГРАНИЦА СТРАЖА: он судит УЛИКИ, а не текст. Разведку топов и суд по шести');
	console.log('   запретам портрета он НЕ заменяет — они делаются чтением, до письма и после.');

	if (onDoor.length) {
		console.log(`\n⛔ НА ДВЕРИ ${onDoor.length} улик. Прогон красный.`);
		return 1;
	}
	console.log('\n✅ дверь чиста');
	return 0;
}

/** САМОТЕСТ: прибор обязан УВИДЕТЬ нарушение, смолчать на каноне и громко заметить снос якоря. */
function selftest() {
	let bad = 0;
	const ok = (name, cond) => { console.log(`${cond ? '  ✅' : '  ❌'} ${name}`); if (!cond) bad++; };
	console.log('\nСАМОТЕСТ стража дверного текста');

	ok('ловит «той же почтой»', judge('войдите той же почтой').some((h) => h.rule === 'З2-тождество'));
	ok('ловит «в тот же рейтинг» (пример из портрета)', judge('оценка встанет в тот же рейтинг').some((h) => h.rule === 'З2-тождество'));
	ok('ловит эмодзи', judge('💾 Всё останется Вашим').some((h) => h.rule === 'эмодзи'));
	ok('ловит усечённое «Пространстве NDim»', judge('Вы уже были в Пространстве NDim').some((h) => h.rule === 'имя-бренда-усечено'));
	ok('ловит робость «Пароль не нужен»', judge('Пароль не нужен.').some((h) => h.rule === 'З1-робость'));
	ok('МОЛЧИТ на полном имени', !judge('Пространство NDim Space найдёт Вам людей').some((h) => h.rule === 'имя-бренда-усечено'));
	ok('МОЛЧИТ на принятом тексте владельца', judge('NDim Space Rating отображает симпатии пользователей Пространства NDim Space. Ваша оценка будет первой!').length === 0);

	// ЯКОРЬ ДВЕРИ жив? Номера строк разъезжаются молча — якорь обязан ломаться громко.
	const profile = join(ROOT, 'src/routes/profile/+page.svelte');
	const src = readFileSync(profile, 'utf8');
	const door = doorLines(src);
	const lines = src.split('\n');
	const doorText = [...door].map((n) => lines[n - 1]).join('\n');
	ok('якорь двери найден в profile/+page.svelte', door.size > 0);
	ok('дверь содержит заголовок входа', doorText.includes('Войдите в Пространство'));
	ok('дверь содержит гостевую кнопку', doorText.includes('Осмотреться гостем'));

	console.log(bad ? `\n❌ самотест провален: ${bad}` : '\n✅ самотест пройден');
	return bad ? 1 : 0;
}

process.exit(argv.includes('--selftest') ? selftest() : run());
