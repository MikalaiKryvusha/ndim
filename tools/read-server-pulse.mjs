/**
 * ПУЛЬС СЕРВЕРА СИНХРОНИЗАЦИИ — читает `space/server` контура и говорит, жив он или стоит.
 *
 * ЗАЧЕМ. 2026-09-08 обнаружилось, что боевой сервер синхронизации мёртв 6,6 часов, и узнал об
 * этом агент СЛУЧАЙНО — разбирая последствия выключенного гипервизора. Прибора, который отвечает
 * на вопрос «жив ли он», в проекте не было вовсе: лампочка живёт на экране «Пространство», а
 * экран требует входа. Пока такого прибора нет, простой службы обнаруживает человек, а это ровно
 * тот способ ловить дефект, который `GOAL.md` называет неверно спроектированной работой.
 *
 * ПРИЗНАК ЖИЗНИ — тот же, что у лампочки 1.x: сердцебиение `lastRunAt` сравнивается с ОЖИДАЕМЫМ
 * временем следующего такта, а не с «ровно столько-то секунд назад». Допуск — ОДИН такт: живой
 * сервер иначе мигал бы красным каждый цикл. Такт берётся из самого отчёта (`intervalSeconds`).
 *
 * Запуск:  node tools/read-server-pulse.mjs [--contour prod|stage]
 * ВЫХОД:   0 — жив · 1 — опоздал больше допуска · 2 — отчёта нет вовсе. Ничего не пишет.
 */
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { pathToFileURL } from 'node:url';

import { CONTOURS } from './lib/contours.mjs';
import { serviceAccount } from './lib/credentials.mjs';

const довод = (имя, умолчание = null) => {
	const i = process.argv.indexOf(имя);
	return i === -1 ? умолчание : process.argv[i + 1];
};

const момент = (значение) => {
	if (значение === null || значение === undefined) return null;
	if (typeof значение === 'number') return new Date(значение);
	if (typeof значение.toDate === 'function') return значение.toDate();
	const разобран = new Date(значение);
	return Number.isNaN(разобран.getTime()) ? null : разобран;
};

const часовНазад = (дата) => ((Date.now() - дата.getTime()) / 3_600_000).toFixed(1);

export async function пульс(контур = 'prod') {
	const описание = CONTOURS[контур];
	if (!описание) throw new Error(`неизвестный контур «${контур}»; ожидались: ${Object.keys(CONTOURS).join(', ')}`);

	initializeApp({ credential: cert(serviceAccount(контур)), projectId: описание.project });
	const снимок = await getFirestore(описание.database).doc('space/server').get();
	if (!снимок.exists) return { контур, есть: false };

	const данные = снимок.data() ?? {};
	const такт = Number(данные.intervalSeconds) || 60;
	const сердце = момент(данные.lastRunAt);
	// Допуск — ОДИН такт сверх ожидаемого времени следующего удара (канон лампочки 1.x).
	const опоздание = сердце ? (Date.now() - сердце.getTime()) / 1000 - такт : null;

	return {
		контур,
		есть: true,
		жив: опоздание !== null && опоздание <= такт,
		такт,
		сердце,
		опозданиеСек: опоздание,
		поднят: момент(данные.startedUpAt),
		полныйПроход: момент(данные.fullSync?.at),
		следующийПолный: момент(данные.fullSync?.nextAt),
		версия: данные.version ?? null,
		сборка: данные.build ?? null,
		собран: данные.builtAt ?? null,
	};
}

async function главная() {
	const контур = довод('--contour', 'prod');
	const п = await пульс(контур);
	const заголовок = `контур ${CONTOURS[контур].title} · база ${CONTOURS[контур].database}`;

	if (!п.есть) {
		console.error(`❌ ${заголовок}: отчёта space/server НЕТ ВОВСЕ — сервер синхронизации здесь никогда не работал.`);
		process.exit(2);
	}

	console.log(заголовок);
	console.log(`  версия ${п.версия ?? '—'} · сборка ${п.сборка ?? '—'} · собран ${п.собран ?? '—'}`);
	console.log(`  поднят        ${п.поднят ? `${п.поднят.toISOString()}  (${часовНазад(п.поднят)} ч назад)` : '—'}`);
	console.log(`  сердцебиение  ${п.сердце ? `${п.сердце.toISOString()}  (${часовНазад(п.сердце)} ч назад)` : '—'}  · такт ${п.такт} с`);
	console.log(`  полный проход ${п.полныйПроход ? `${п.полныйПроход.toISOString()}  (${часовНазад(п.полныйПроход)} ч назад)` : '—'}`);
	console.log(`  следующий     ${п.следующийПолный ? п.следующийПолный.toISOString() : '—'}`);

	if (п.жив) {
		console.log('✅ ЖИВ — сердцебиение в пределах допуска (один такт).');
		process.exit(0);
	}
	const часы = п.сердце ? часовНазад(п.сердце) : '—';
	console.error(`🔴 СТОИТ — последний удар ${часы} ч назад при такте ${п.такт} с. Связи не считаются, индекс каталога не обновляется.`);
	process.exit(1);
}

// Входной предохранитель: импорт не должен ходить в боевую базу.
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
	await главная();
}
