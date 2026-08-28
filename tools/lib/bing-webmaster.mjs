/**
 * ДОСТУП К BING WEBMASTER TOOLS API — ключ, адреса, разбор ответа.
 *
 * Третий машинный источник миссии консолей (`ideas/37`, `plans/74` Ф2). Разведка по
 * первоисточникам — `researches/56_console_apis_bing_yandex.md` §2.
 *
 * 🔴🔴 ДОПУЩЕНИЕ, НА КОТОРОМ СТОИТ ВЕСЬ ЭТОТ МОДУЛЬ, И ОНО НЕ ПРОВЕРЕНО.
 *
 * Microsoft объявила (страница протоколов, правка 2026-08-10), дословно: «*Legacy SOAP and POX
 * APIs will be retired on **August 31, 2026**. Migrate to our REST APIs to avoid service
 * disruption*». Отставку объявили ТОЛЬКО для SOAP и POX; JSON/HTTP на той же странице стоит
 * третьим протоколом со своим форматом адреса. Отсюда наш выбор: строим на JSON.
 *
 * ⚠️ **Прямой строки «JSON остаётся» в документации НЕТ**, а страница-разъяснение отставки
 * отдаётся без содержания. То есть «JSON переживёт 31.08.2026» — ДОПУЩЕНИЕ, помеченное здесь
 * намеренно, а не установленный факт.
 * 🔑 Проверка дешёвая и однозначная: **первый же прогон после 31.08.2026 либо отдаст данные,
 * либо нет**. Кто прогонит — обязан снять эту врезку и записать результат.
 *
 * 🔑 И почему это вообще важно, а не педантизм: официальный «Getting Started» Microsoft целиком
 * написан про SOAP-клиент в Visual Studio (дата правки — 2019). Агент, пошедший по первому
 * попавшемуся примеру из веба или из собственной памяти, построит на том, что умирает.
 *
 * ⛔ Область — только чтение. Подача адресов (`SubmitUrlBatch`) и прочие пишущие методы сюда не
 * входят: у нас для этого IndexNow, и он всё равно требует слова владельца.
 */
import { loadEnv } from './env.mjs';

/** База JSON-протокола — из первоисточника, таблица форматов адресов. */
export const API = 'https://ssl.bing.com/webmaster/api.svc/json';

/** Наш сайт в терминах Bing: он адресует ресурс полным адресом с протоколом. */
export const SITE_URL = 'https://ndimspace.app';

/** Дата, после которой допущение о живучести JSON становится проверяемым фактом. */
export const LEGACY_RETIREMENT = '2026-08-31';

/**
 * Ключ API из `.env`.
 *
 * Выдаётся ПОЛЬЗОВАТЕЛЮ, а не сайту (первоисточник: «*the API key is generated for a user and
 * not a site*»), то есть один шаг владельца открывает все его ресурсы сразу. Получается в панели
 * Bing Webmaster Tools: Settings → API Access → Generate API Key.
 */
export function bingKey() {
	loadEnv();
	const key = process.env.NDIM_BING_WEBMASTER_KEY;
	if (!key) {
		throw new Error(
			'нет ключа: переменная NDIM_BING_WEBMASTER_KEY пуста.\n' +
				'Это НЕ поломка прибора — ключ выдаёт владелец в панели Bing Webmaster Tools\n' +
				'(Settings → API Access → Generate API Key), шаги — homeworks/15_console_keys_yandex_bing.md.\n' +
				'Работаете в рабочей копии роли (worktree)? `.env` туда не едет — возьмите\n' +
				'ТОЛЬКО эту переменную из главной копии, не файл целиком.',
		);
	}
	return key;
}

/** Адрес метода JSON-протокола: ключ и параметры едут строкой запроса. */
export function methodUrl(method, key, params = {}) {
	const url = new URL(`${API}/${method}`);
	url.searchParams.set('apikey', key);
	for (const [name, value] of Object.entries(params)) {
		if (value !== undefined && value !== null) url.searchParams.set(name, String(value));
	}
	return url.toString();
}

/**
 * Запрос к методу.
 *
 * Ошибку Bing отдаёт кодом 400 с телом `{"ErrorCode":3,"Message":"InvalidApiKey"}` — то есть она
 * машиночитаема, и гадать по тексту не нужно.
 */
export async function callMethod(method, key, params = {}) {
	const response = await fetch(methodUrl(method, key, params), {
		headers: { 'Content-Type': 'application/json; charset=utf-8' },
	});
	const body = await response.json().catch(() => ({}));
	return { ok: response.ok, status: response.status, body };
}
