/**
 * ДОСТУП К API ЯНДЕКС.ВЕБМАСТЕРА 4.0 — токен, адреса, запросы.
 *
 * Второй машинный источник миссии консолей (`ideas/37`, фаза 2 `plans/74`). Первый — Google
 * (`tools/lib/console-auth.mjs`); третьим будет Bing. Разведка API по первоисточникам, со
 * ссылками и границами, — `researches/NEW_console_apis_bing_yandex.md`.
 *
 * 🔴 ЗАЧЕМ ЭТОТ ИСТОЧНИК ВООБЩЕ НУЖЕН, ЕСЛИ GOOGLE УЖЕ РАБОТАЕТ. Потому что он отвечает на
 * вопрос, на который Google не отвечает НИКОГДА: **какие наши страницы выпали из поиска и
 * ПОЧЕМУ**. У Search Console покрытия по API нет вовсе (`researches/40` §6) — это записано как
 * неустранимая дыра, и разведка показала, что неустранима она только у Google. Повод не
 * теоретический: 2026-08-28 Яндекс выкинул 1352 наши страницы (`bugs/203`), и прочитать это
 * машиной сегодня нечем.
 *
 * ⛔ ОБЛАСТЬ — ТОЛЬКО ЧТЕНИЕ. Здесь нет и не будет вызовов, меняющих поведение наших страниц в
 * чужом индексе: переобход (`recrawl/queue`) — действие, требующее слова владельца, и живёт оно
 * отдельно, а не в приборе наблюдения. Единственное исключение — ЧТЕНИЕ квоты переобхода
 * (`recrawl/quota`), потому что это вопрос «сколько можно», а не действие.
 *
 * Зависимостей нет: штатный `fetch`, токен из `.env`.
 */
import { loadEnv } from './env.mjs';

export const API = 'https://api.webmaster.yandex.net/v4';

/** Наш хост в терминах Вебмастера. Форма host-id у Яндекса — `https:ndimspace.app:443`. */
export const EXPECTED_HOST = 'ndimspace.app';

/**
 * OAuth-токен Яндекс ID из `.env`.
 *
 * Права, которых он требует, названы первоисточником: `webmaster:hostinfo` + `webmaster:verify`.
 * Живёт **6 месяцев** — то есть протухает молча и дважды в год; шаги владельца по перевыпуску —
 * `homeworks/NEW_console_keys_yandex_bing.md`.
 *
 * ⚠️ Подсказка про worktree здесь та же, что у ключа Google, и по той же причине (`.env` в
 * `.gitignore`, в рабочие копии ролей не едет) — оплачено уроком `EXP-NEW-env-ne-edet-v-worktree`.
 * 🔴 Но копировать в рабочую копию роли нужно ТОЛЬКО эту переменную, а не `.env` целиком:
 * в нём живёт боевой ключ Firestore, и он принадлежит Менеджеру, а не роли.
 */
export function yandexToken() {
	loadEnv();
	const token = process.env.NDIM_YANDEX_WEBMASTER_TOKEN;
	if (!token) {
		throw new Error(
			'нет токена: переменная NDIM_YANDEX_WEBMASTER_TOKEN пуста.\n' +
				'Это НЕ поломка прибора — токен выдаёт владелец, шаги расписаны в\n' +
				'homeworks/NEW_console_keys_yandex_bing.md (OAuth Яндекс ID, права\n' +
				'webmaster:hostinfo + webmaster:verify, живёт 6 месяцев).\n' +
				'Работаете в рабочей копии роли (worktree)? `.env` туда не едет — возьмите\n' +
				'ТОЛЬКО эту переменную из главной копии, не файл целиком.',
		);
	}
	return token;
}

/** GET по API Вебмастера. Форма ответа та же, что у соседних приборов: судит вызывающий. */
export async function apiGet(token, path, params = {}) {
	const url = new URL(`${API}${path}`);
	for (const [key, value] of Object.entries(params)) {
		if (value === undefined || value === null) continue;
		if (Array.isArray(value)) for (const item of value) url.searchParams.append(key, item);
		else url.searchParams.set(key, String(value));
	}
	const response = await fetch(url, { headers: { Authorization: `OAuth ${token}` } });
	const body = await response.json().catch(() => ({}));
	return { ok: response.ok, status: response.status, body };
}

/**
 * Идентификатор пользователя — первое звено любой цепочки адресов Вебмастера.
 *
 * У Яндекса все пути вида `/user/{user-id}/hosts/{host-id}/…`, и оба идентификатора не
 * угадываются: их спрашивают. Поэтому прибор всегда начинается с двух служебных запросов, и
 * это не расточительство, а устройство API.
 */
export async function userId(token) {
	const response = await apiGet(token, '/user/');
	if (!response.ok) {
		throw new Error(
			`не удалось узнать user_id (${response.status}): ${JSON.stringify(response.body)}\n` +
				'Код 401 — токен протух (живёт 6 месяцев) либо выдан без нужных прав.',
		);
	}
	return response.body.user_id;
}

/** Список хостов, доступных токену. */
export async function hosts(token, user) {
	const response = await apiGet(token, `/user/${user}/hosts/`);
	if (!response.ok) {
		throw new Error(`список хостов не отдан (${response.status}): ${JSON.stringify(response.body)}`);
	}
	return response.body.hosts ?? [];
}

/**
 * Постраничный обход выборки.
 *
 * 🔴 Без него прибор молча врал бы на нашем же масштабе: у `search-urls/events/samples` потолок
 * страницы — 100 строк при доступных 50 000, а Яндекс выкинул 1352 наши страницы. Первая
 * страница показала бы 100 из них, и «выпало 100» выглядело бы правдоподобно.
 *
 * `limit` жёстко ограничен сотней самим API; `offset` двигается шагом фактически полученных
 * строк, а не запрошенных, — иначе на неполной странице обход перепрыгнул бы хвост.
 */
export async function pagedSamples(token, path, { perPage = 100, max = 50_000 } = {}) {
	const rows = [];
	for (let offset = 0; rows.length < max; ) {
		const response = await apiGet(token, path, { offset, limit: perPage });
		if (!response.ok) {
			throw new Error(
				`выборка «${path}» не отдана (${response.status}): ${JSON.stringify(response.body)}`,
			);
		}
		const page = response.body.samples ?? [];
		rows.push(...page);
		if (page.length === 0 || page.length < perPage) break;
		offset += page.length;
	}
	return rows;
}
