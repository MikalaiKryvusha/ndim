/**
 * ДОСТУП К GOOGLE SEARCH CONSOLE ПО API — ключ, токен, запросы.
 *
 * Вынесено из `tools/probe-search-console.mjs`, когда у доступа появился ВТОРОЙ потребитель —
 * прибор снимка (`tools/console-snapshot.mjs`). Копия подписи JWT во втором файле была бы парой
 * «истина ↔ зеркало» ровно того класса, который канон велит не заводить: правится сторона,
 * которую видишь, а вторая расходится молча.
 *
 * Зависимостей нет намеренно: JWT подписывается штатным `node:crypto`, запросы — штатным
 * `fetch`. Прибор, ходящий за боевыми числами, не тащит цепочку поставки ради трёх строк.
 *
 * ⛔ ОБЛАСТЬ ДОСТУПА — ТОЛЬКО ЧТЕНИЕ (`webmasters.readonly`). Права на запись этому контуру не
 * нужны ни для одной задачи миссии консолей, и расширять область «на будущее» здесь нельзя:
 * ключ, которым можно подать карту сайта или снять адрес с индексации, — другой предмет
 * хранения и другой разговор с владельцем.
 */
import { createSign } from 'node:crypto';
import { loadEnv } from './env.mjs';

export const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
export const TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const API = 'https://searchconsole.googleapis.com/webmasters/v3';

/** Ресурс, заведённый в консоли ДОМЕННЫМ (`homeworks/04`, часть 1, шаг 2). */
export const EXPECTED_PROPERTY = 'sc-domain:ndimspace.app';

const b64url = (buf) => Buffer.from(buf).toString('base64url');

/**
 * Ключ аккаунта чтения консолей из `.env`.
 *
 * Проверяет не только наличие, но и ЧЕЙ ключ: перепутанная строка в `.env` иначе дала бы
 * невнятную ошибку авторизации через минуту работы вместо адреса лечения сразу.
 *
 * ⚠️ В рабочих копиях ролей (`git worktree`) `.env` НЕТ по построению: он в `.gitignore`, а
 * ignore-файлы в worktree не переносятся вместе с деревом. Сообщение об этом названо прямо —
 * иначе роль читает «нет ключа» как «доступ не выдан» и идёт заводить его заново.
 */
export function consoleReaderKey() {
	loadEnv();
	const raw = process.env.NDIM_CONSOLE_SA_B64;
	if (!raw) {
		throw new Error(
			'нет ключа: переменная NDIM_CONSOLE_SA_B64 пуста.\n' +
				'Значение — base64 от JSON-ключа аккаунта ndim-console-reader@ndim-space (см. .env.example).\n' +
				'Работаете в рабочей копии роли (worktree)? `.env` туда не едет — он в .gitignore. ' +
				'Возьмите его из главной копии: cp D:/work/ai_sandbox/ndim/.env .env',
		);
	}
	let key;
	try {
		key = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
	} catch (error) {
		throw new Error(`NDIM_CONSOLE_SA_B64 не разбирается: ожидался base64 от JSON (${error.message})`);
	}
	if (!key.client_email?.startsWith('ndim-console-reader@')) {
		throw new Error(
			`NDIM_CONSOLE_SA_B64 содержит ключ аккаунта «${key.client_email}», а ожидался ` +
				'ndim-console-reader@ndim-space.iam.gserviceaccount.com.\n' +
				'🔴 Боевой ключ Firebase сюда подставлять НЕЛЬЗЯ: им можно перезаписать данные живых людей, ' +
				'а этому прибору нужно только чтение метрик.',
		);
	}
	return key;
}

/** Меняет подписанный JWT на токен доступа. Своими руками — чтобы не тащить зависимость. */
export async function accessToken(key) {
	const now = Math.floor(Date.now() / 1000);
	const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
	const claims = b64url(
		JSON.stringify({
			iss: key.client_email,
			scope: SCOPE,
			aud: TOKEN_URL,
			iat: now,
			exp: now + 3600,
		}),
	);
	const signer = createSign('RSA-SHA256');
	signer.update(`${header}.${claims}`);
	const jwt = `${header}.${claims}.${signer.sign(key.private_key, 'base64url')}`;

	const response = await fetch(TOKEN_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
			assertion: jwt,
		}),
	});
	const body = await response.json();
	if (!response.ok) {
		throw new Error(
			`обмен JWT на токен не удался (${response.status}): ${body.error} — ${body.error_description}\n` +
				'Если сказано «API has not been used» — включите его: ' +
				'gcloud services enable searchconsole.googleapis.com --project ndim-space',
		);
	}
	return body.access_token;
}

/** GET по API консоли. Возвращает разобранный ответ вместе с кодом — судит вызывающий. */
export async function apiGet(token, path) {
	const response = await fetch(`${API}${path}`, {
		headers: { Authorization: `Bearer ${token}` },
	});
	const body = await response.json().catch(() => ({}));
	return { ok: response.ok, status: response.status, body };
}

/** POST по API консоли. Та же форма ответа, что у `apiGet`. */
export async function apiPost(token, path, payload) {
	const response = await fetch(`${API}${path}`, {
		method: 'POST',
		headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
		body: JSON.stringify(payload),
	});
	const body = await response.json().catch(() => ({}));
	return { ok: response.ok, status: response.status, body };
}
