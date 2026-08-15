/**
 * КОНТУРЫ — один источник истины для двери и приборов, ходящих в живые окружения.
 *
 * Зачем модуль. Имя боевой базы было зашито ЛИТЕРАЛОМ в четырёх приборах и в приложении. При
 * переезде `(default)` → `ndim-db-prod` каждый такой литерал — отдельная возможность забыть один
 * файл: прибор молча пошёл бы в базу, которой больше нет, и его «ошибка сети» читалась бы как
 * что угодно, кроме настоящей причины. Это класс «истина ↔ зеркало» из `AGENT_GUIDE.md`.
 *
 * 🔑 ЗЕРКАЛО ПРОВЕРЯЕТ СЕБЯ САМО. Приложение не может импортировать этот файл (он вне бандла), и
 * своя константа у него остаётся. Поэтому модуль ЧИТАЕТ `src/lib/firebase.ts` и падает, если
 * имена разошлись. Пара, которая проверяет себя при каждом использовании, не может тихо
 * разъехаться — а именно тихо такие пары и расходятся.
 *
 * 🆕 Фаза 4 `plans/53` расширила модуль с ИМЁН БАЗ до ОПИСАНИЯ КОНТУРА целиком: проект, база,
 * адрес сайта, файл конфигурации выката, публичный веб-ключ. Причина ровно та же и оплачена тем
 * же классом дефекта: смоук боя, запущенный с `--base` стейджа, чистил за собой учётку БОЕВЫМ
 * ключом — то есть не чистил вовсе и молчал об этом. Контур должен выбираться ОДИН раз и целиком,
 * а не собираться по кусочкам в каждом приборе.
 */
import { readFileSync } from 'node:fs';

/** Проекты Firebase каждого контура. */
export const PROD_PROJECT = 'ndim-space';
export const STAGE_PROJECT = 'ndim-stage';

/** Базы Firestore каждого контура. */
export const PROD_DATABASE = 'ndim-db-prod';
export const STAGE_DATABASE = 'ndim-db-stage';

/**
 * Публичные веб-ключи. НЕ секрет по устройству Firebase: они лежат в бандле у каждого посетителя
 * (`src/lib/firebase.ts` — там же и живёт их первоисточник). Данные стерегут правила, а не ключ.
 */
const PROD_API_KEY = 'AIzaSyCZsGkY0Lw_OJ35QhRumcD5RzNJUFsAsww';
const STAGE_API_KEY = 'AIzaSyDde20i1Bee1qvw7_srWWlrn2kI1Oom6Uw';

/**
 * ОПИСАНИЕ КОНТУРА ЦЕЛИКОМ. Всё, чем контуры различаются, перечислено ЗДЕСЬ и больше нигде —
 * прибор берёт объект и не имеет возможности взять из одного контура проект, а из другого ключ.
 */
export const CONTOURS = {
	prod: {
		name: 'prod',
		title: 'БОЙ',
		project: PROD_PROJECT,
		database: PROD_DATABASE,
		site: 'https://ndimspace.app',
		/** Конфигурация выката: у боя — корневой `firebase.json` (флаг `--config` не нужен). */
		config: null,
		apiKey: PROD_API_KEY,
		hosts: ['ndimspace.app', 'www.ndimspace.app'],
	},
	stage: {
		name: 'stage',
		title: 'СТЕЙДЖ',
		project: STAGE_PROJECT,
		database: STAGE_DATABASE,
		site: 'https://ndim-stage.web.app',
		config: 'firebase.stage.json',
		apiKey: STAGE_API_KEY,
		hosts: ['ndim-stage.web.app', 'ndim-stage.firebaseapp.com'],
	},
};

/*
 * Сверка с приложением. Читается ИСХОДНИК, а не сборка: сборка может быть старой, а спор именно
 * о том, что поедет людям. Сверяются ТРИ вещи, и каждая уже была источником аварии или могла ею
 * стать: имена баз (переезд фазы 3), веб-ключи (уборка чужим ключом) и список хостов стейджа
 * (по нему приложение узнаёт контур — разойдись он, и стейдж пошёл бы в боевую базу).
 */
const APP_FIREBASE = 'src/lib/firebase.ts';
try {
	const source = readFileSync(APP_FIREBASE, 'utf8');
	const grab = (re) => source.match(re)?.[1];
	const appProd = grab(/const PROD_DATABASE = '([^']+)'/);
	const appStage = grab(/const STAGE_DATABASE = '([^']+)'/);
	if (appProd !== PROD_DATABASE || appStage !== STAGE_DATABASE) {
		throw new Error(
			`имена баз РАЗОШЛИСЬ с приложением (${APP_FIREBASE}):\n` +
				`  приложение: prod=${appProd} · stage=${appStage}\n` +
				`  приборы:    prod=${PROD_DATABASE} · stage=${STAGE_DATABASE}\n` +
				'Правьте ОБА места одной правкой — иначе половина проекта ходит в другую базу.',
		);
	}

	// Ключи ищутся В СВОЁМ блоке конфига: оба литерала лежат в одном файле, и поиск «есть ли такая
	// строка где-нибудь» не отличил бы боевой ключ от стейджевого.
	const keyOf = (block) => source.match(new RegExp(`const ${block}_CONFIG = \\{[^}]*apiKey: '([^']+)'`))?.[1];
	const appProdKey = keyOf('PROD');
	const appStageKey = keyOf('STAGE');
	if (appProdKey !== PROD_API_KEY || appStageKey !== STAGE_API_KEY) {
		throw new Error(
			`веб-ключи РАЗОШЛИСЬ с приложением (${APP_FIREBASE}):\n` +
				`  приложение: prod=${appProdKey} · stage=${appStageKey}\n` +
				'Ключ контура — это то, чем прибор входит и чем убирает за собой; ошибиться им значит\n' +
				'молча не убрать за собой в живом окружении.',
		);
	}

	const appHosts = source.match(/const STAGE_HOSTS = \[([^\]]+)\]/)?.[1] ?? '';
	for (const host of CONTOURS.stage.hosts) {
		if (!appHosts.includes(`'${host}'`)) {
			throw new Error(
				`хосты стейджа РАЗОШЛИСЬ с приложением (${APP_FIREBASE}): «${host}» есть у приборов и нет у приложения.\n` +
					'Приложение узнаёт контур ПО ХОСТУ — расхождение здесь уводит стейдж в боевую базу.',
			);
		}
	}
} catch (error) {
	// Отсутствие файла приборам не мешает (их запускают и из других мест), а вот РАСХОЖДЕНИЕ —
	// мешает смертельно, поэтому оно и только оно останавливает прогон.
	if (error instanceof Error && /РАЗОШЛИСЬ/.test(error.message)) throw error;
}

/** Контур по имени. Неизвестное имя — остановка, а не «ну пусть будет бой». */
export function contour(name = 'prod') {
	const found = CONTOURS[name];
	if (!found) throw new Error(`неизвестный контур «${name}»; есть: ${Object.keys(CONTOURS).join(', ')}`);
	return found;
}

/**
 * Контур по адресу, с которым запущен прибор (`--base`).
 *
 * 🔴 Незнакомый хост — ОСТАНОВКА, а не молчаливый бой. Ровно на этом месте прибор, запущенный по
 * стейджу, брал боевой ключ: «не узнал» тихо означало «значит бой». Незнание обязано быть громким.
 */
export function contourOfBase(base) {
	const host = new URL(base).hostname;
	for (const item of Object.values(CONTOURS)) {
		if (item.hosts.includes(host)) return item;
	}
	throw new Error(
		`хост «${host}» не принадлежит ни одному контуру.\n` +
			'Прибор, ходящий в живое окружение, обязан знать, В КАКОЕ именно: от этого зависят ключ входа\n' +
			'и база. Добавьте контур в tools/lib/contours.mjs или проверьте адрес.',
	);
}

/**
 * Контур из аргументов командной строки: `--stage`, `--contour stage|prod` или `--base <адрес>`.
 * Умолчание — бой: у двери оно самое строгое, а прибор без адреса и так ходит в бой.
 */
export function contourFromArgv(argv = process.argv) {
	if (argv.includes('--stage')) return CONTOURS.stage;
	const named = argv.indexOf('--contour');
	if (named !== -1) return contour(argv[named + 1]);
	const base = argv.indexOf('--base');
	if (base !== -1) return contourOfBase(argv[base + 1]);
	return CONTOURS.prod;
}

/** Базовый адрес документов REST для контура. Принимает и имя (`'stage'`), и сам объект. */
export const docsUrl = (which = 'prod') => {
	const item = typeof which === 'string' ? contour(which) : which;
	return `https://firestore.googleapis.com/v1/projects/${item.project}/databases/${item.database}/documents`;
};
