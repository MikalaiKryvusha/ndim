/**
 * ИМЕНА КОНТУРОВ — один источник истины для приборов, ходящих в живые базы.
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
 */
import { readFileSync } from 'node:fs';

/** Проекты Firebase каждого контура. */
export const PROD_PROJECT = 'ndim-space';
export const STAGE_PROJECT = 'ndim-stage';

/** Базы Firestore каждого контура. */
export const PROD_DATABASE = 'ndim-db-prod';
export const STAGE_DATABASE = 'ndim-db-stage';

/*
 * Сверка с приложением. Читается ИСХОДНИК, а не сборка: сборка может быть старой, а спор именно
 * о том, что поедет людям.
 */
const APP_FIREBASE = 'src/lib/firebase.ts';
try {
	const source = readFileSync(APP_FIREBASE, 'utf8');
	const prod = source.match(/const PROD_DATABASE = '([^']+)'/)?.[1];
	const stage = source.match(/const STAGE_DATABASE = '([^']+)'/)?.[1];
	if (prod !== PROD_DATABASE || stage !== STAGE_DATABASE) {
		throw new Error(
			`имена баз РАЗОШЛИСЬ с приложением (${APP_FIREBASE}):\n` +
				`  приложение: prod=${prod} · stage=${stage}\n` +
				`  приборы:    prod=${PROD_DATABASE} · stage=${STAGE_DATABASE}\n` +
				'Правьте ОБА места одной правкой — иначе половина проекта ходит в другую базу.',
		);
	}
} catch (error) {
	// Отсутствие файла приборам не мешает (их запускают и из других мест), а вот РАСХОЖДЕНИЕ —
	// мешает смертельно, поэтому оно и только оно останавливает прогон.
	if (error instanceof Error && error.message.startsWith('имена баз РАЗОШЛИСЬ')) throw error;
}

/** Базовый адрес документов REST для контура. */
export const docsUrl = (contour = 'prod') =>
	contour === 'stage'
		? `https://firestore.googleapis.com/v1/projects/${STAGE_PROJECT}/databases/${STAGE_DATABASE}/documents`
		: `https://firestore.googleapis.com/v1/projects/${PROD_PROJECT}/databases/${PROD_DATABASE}/documents`;
