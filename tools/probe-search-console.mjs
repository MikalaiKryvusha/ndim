/**
 * ПРОБА ДОСТУПА К GOOGLE SEARCH CONSOLE ПО API.
 *
 * Отвечает на ОДИН вопрос: пускает ли Search Console наш сервисный аккаунт и к каким ресурсам.
 * Это прибор ДОСТУПА, а не прибор миссии: снятие метрик, формат снимка, ряд истории и критерии
 * гипотез — работа эпика `ideas/37`, и она пойдёт по лестнице `/plan-epic`. Здесь только ворота.
 *
 * 🔑 ЗАЧЕМ ОТДЕЛЬНЫЙ ПРИБОР НА ТАКУЮ МЕЛОЧЬ. Доступ к консоли выдаёт не облако, а САМА КОНСОЛЬ:
 * прав IAM для чтения данных не существует, адрес аккаунта добавляется пользователем ресурса
 * руками владельца (`homeworks/12`). Значит между «ключ есть» и «данные читаются» лежит шаг,
 * который агент выполнить не может, — и его результат надо НАБЛЮДАТЬ, а не объявлять.
 *
 * ⛔ ПОЧЕМУ КОНТУР «consoles» НЕ ДОБАВЛЕН В `tools/lib/credentials.mjs`. Там контуров ровно два
 * (prod и stage), и на этой двоичности стоит вся защита «ключ не того контура»: `contours.mjs`
 * сверяется с `src/lib/firebase.ts` и ПАДАЕТ при расхождении. Третий контур пошёл бы не по новому
 * коду, а по старым двоичным развилкам — ровно класс `bugs/129` («условие „всё, что не X, — это Y“
 * живёт до появления Z»). Поэтому ключ читается здесь, своей строкой, и сверяется своей проверкой.
 *
 * Зависимостей нет намеренно: JWT подписывается штатным `node:crypto`, запросы — штатным `fetch`.
 *
 * Запуск:
 *   node tools/probe-search-console.mjs
 *
 * Код возврата: 0 — доступ есть и данные читаются · 1 — доступа ещё нет либо он неполон.
 * Молчаливого зелёного нет: «ресурсов ноль» — это КРАСНЫЙ, потому что именно так выглядит
 * непройденный шаг владельца, и ворота, которые его пропустят, покрасят зелёным ничто.
 */
import { createSign } from 'node:crypto';
import { loadEnv } from './lib/env.mjs';

const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://searchconsole.googleapis.com/webmasters/v3';

/** Ресурс, который мы завели в консоли: ДОМЕННЫЙ (`homeworks/04`, часть 1, шаг 2). */
const EXPECTED_PROPERTY = 'sc-domain:ndimspace.app';

const b64url = (buf) => Buffer.from(buf).toString('base64url');

/**
 * Ключ аккаунта чтения консолей из `.env`.
 *
 * Проверяет не только наличие, но и ЧЕЙ ключ: перепутанная строка в `.env` иначе дала бы
 * невнятную ошибку авторизации через минуту работы вместо адреса лечения сразу.
 */
function consoleReaderKey() {
	loadEnv();
	const raw = process.env.NDIM_CONSOLE_SA_B64;
	if (!raw) {
		throw new Error(
			'нет ключа: переменная NDIM_CONSOLE_SA_B64 пуста.\n' +
				'Значение — base64 от JSON-ключа аккаунта ndim-console-reader@ndim-space (см. .env.example).',
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
async function accessToken(key) {
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

async function api(token, path) {
	const response = await fetch(`${API}${path}`, {
		headers: { Authorization: `Bearer ${token}` },
	});
	const body = await response.json().catch(() => ({}));
	return { ok: response.ok, status: response.status, body };
}

async function main() {
	const key = consoleReaderKey();
	console.log('ПРОБА ДОСТУПА К SEARCH CONSOLE ПО API\n');
	console.log(`аккаунт: ${key.client_email}`);
	console.log(`проект:  ${key.project_id}`);
	console.log(`область: ${SCOPE}\n`);

	const token = await accessToken(key);
	console.log('✅ токен доступа получен — ключ и включённый API в порядке\n');

	const sites = await api(token, '/sites');
	if (!sites.ok) {
		console.error(`🔴 список ресурсов не отдан (${sites.status}): ${sites.body.error?.message ?? ''}`);
		return 1;
	}

	const entries = sites.body.siteEntry ?? [];
	if (entries.length === 0) {
		console.error('🔴 РЕСУРСОВ НОЛЬ — Search Console этот аккаунт ещё не знает.');
		console.error('   Это НЕ поломка прибора и не ошибка ключа: доступ к данным выдаёт сама консоль,');
		console.error('   а не облако. Шаг владельца не пройден — см. homeworks/12, часть 1.');
		console.error(`   Добавить в Search Console → Настройки → Пользователи и разрешения:`);
		console.error(`   ${key.client_email}`);
		return 1;
	}

	console.log(`РЕСУРСЫ, ВИДИМЫЕ АККАУНТУ — ${entries.length}:`);
	for (const entry of entries) {
		console.log(`  · ${entry.siteUrl}  —  уровень доступа: ${entry.permissionLevel}`);
	}
	console.log('');

	const target = entries.find((entry) => entry.siteUrl === EXPECTED_PROPERTY) ?? entries[0];
	if (target.siteUrl !== EXPECTED_PROPERTY) {
		console.log(`⚠️ ожидался доменный ресурс ${EXPECTED_PROPERTY}, а видно ${target.siteUrl}.`);
		console.log('   Доступ есть, но не к тому ресурсу — метрики каталога будут неполными.\n');
	}

	// Смоук чтения: одна настоящая выборка. «Список ресурсов отдан» и «данные читаются» —
	// два разных утверждения, и второе проверяется только запросом за данными.
	const to = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);
	const from = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
	const query = await fetch(
		`${API}/sites/${encodeURIComponent(target.siteUrl)}/searchAnalytics/query`,
		{
			method: 'POST',
			headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({ startDate: from, endDate: to, dimensions: ['date'], rowLimit: 10 }),
		},
	);
	const data = await query.json().catch(() => ({}));
	if (!query.ok) {
		console.error(`🔴 выборка не отдана (${query.status}): ${data.error?.message ?? ''}`);
		console.error('   Список ресурсов виден, а данные — нет: скорее всего уровень доступа ниже нужного.');
		return 1;
	}

	const rows = data.rows ?? [];
	console.log(`ВЫБОРКА ${from} … ${to} по дням — строк ${rows.length}`);
	if (rows.length === 0) {
		console.log('  (пусто — это законно: показов за окно могло не быть вовсе)');
	}
	for (const row of rows) {
		console.log(
			`  ${row.keys[0]}  показов ${row.impressions}  клики ${row.clicks}  ` +
				`CTR ${(row.ctr * 100).toFixed(2)} %  позиция ${row.position.toFixed(1)}`,
		);
	}

	console.log('\n✅ ДОСТУП НАСТРОЕН: ресурс виден и данные читаются.');
	return 0;
}

main().then(
	(code) => process.exit(code),
	(error) => {
		console.error(`🔴 ${error.message}`);
		process.exit(1);
	},
);
