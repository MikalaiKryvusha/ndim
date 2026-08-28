/**
 * INDEXNOW — уведомление поисковиков об изменившихся адресах. Чистая логика, сети не касается.
 *
 * Протокол, которым мы говорим Яндексу и Bing «вот эти адреса изменились, зайдите». Google в нём
 * НЕ участвует (`researches/26` §11.5) — для него остаётся карта сайта.
 *
 * 🔑 ПОЧЕМУ ЭТО ВЕРНУЛОСЬ В РАБОТУ ПОСЛЕ ОТКАЗА. IndexNow был отвергнут посылкой «страницы
 * меняются раз в неделю деплоем — овердоз» (`researches/26` §11.5). Ночная сборка каталога эту
 * посылку СНЯЛА: карточки прибавляются каждый день. Перемер записан в
 * `researches/NEW_console_apis_bing_yandex.md` §3.6.
 *
 * 🔑 И вторая причина, появившаяся 2026-08-28: Яндекс выкинул 1352 наши страницы (`bugs/203`),
 * а его интерфейсный переобход берёт 150 адресов в сутки — то есть разбор очереди руками занял
 * бы восемь дней. IndexNow принимает **до 10 000 адресов за один запрос**.
 *
 * ⚠️ КЛЮЧ INDEXNOW — НЕ СЕКРЕТ, и путать его с ключами из `.env` нельзя. По устройству протокола
 * он ПУБЛИЧНО выкладывается файлом в корень сайта: поисковик читает файл и так убеждается, что
 * адреса подаёт хозяин домена. Поэтому он живёт в `static/`, коммитится и уезжает выкатом — в
 * отличие от сервисных ключей, которым место только в `.env`.
 *
 * ⛔ ОТПРАВКА — ДЕЙСТВИЕ НАРУЖУ И ТРЕБУЕТ СЛОВА ВЛАДЕЛЬЦА. Здесь только логика: ключ, разбиение
 * на пачки, тело запроса, разбор кода ответа. Кто и когда нажимает — `tools/indexnow-submit.mjs`,
 * и он по умолчанию НИЧЕГО не отправляет.
 */
import { randomUUID } from 'node:crypto';

/** Потолок адресов в одном запросе — из первоисточника (справочник Яндекса по IndexNow). */
export const MAX_URLS_PER_REQUEST = 10_000;

/** Границы длины ключа — оттуда же: не короче 8 и не длиннее 128 знаков. */
export const KEY_MIN = 8;
export const KEY_MAX = 128;

/** Разрешённые знаки ключа: латиница, цифры и дефис. */
const KEY_ALPHABET = /^[a-zA-Z0-9-]+$/;

/**
 * Новый ключ IndexNow — 32 шестнадцатеричных знака.
 *
 * Берём `randomUUID` и снимаем дефисы: получается строка, заведомо укладывающаяся и в алфавит
 * протокола, и в границы длины. Своего генератора случайности не пишем — это ровно тот случай,
 * когда самодельное решение хуже штатного по всем осям (`PHILOSOPHY.md`: best practice вместо
 * велосипеда).
 */
export function generateKey() {
	return randomUUID().replaceAll('-', '');
}

/**
 * Проверка ключа по правилам протокола.
 *
 * Возвращает список нарушений, а не булево: «ключ негоден» без причины заставляет гадать, а
 * причин ровно три и они разные.
 */
export function validateKey(key) {
	const problems = [];
	if (typeof key !== 'string' || key.length === 0) {
		return ['ключ пуст'];
	}
	if (key.length < KEY_MIN) problems.push(`короче ${KEY_MIN} знаков (${key.length})`);
	if (key.length > KEY_MAX) problems.push(`длиннее ${KEY_MAX} знаков (${key.length})`);
	if (!KEY_ALPHABET.test(key)) problems.push('есть знаки вне алфавита a-zA-Z0-9- ');
	return problems;
}

/** Имя файла ключа в корне сайта: сам ключ плюс `.txt`. */
export function keyFileName(key) {
	return `${key}.txt`;
}

/**
 * Разбиение адресов на пачки под потолок протокола.
 *
 * Наш каталог — 10 460 страниц при потолке 10 000, то есть даже сегодня одна пачка не вмещает
 * сайт целиком. Разбиение поэтому не «на вырост», а нужно с первого же полного прогона.
 */
export function chunkUrls(urls, size = MAX_URLS_PER_REQUEST) {
	if (!Number.isInteger(size) || size <= 0) throw new Error(`размер пачки должен быть > 0, дано ${size}`);
	const chunks = [];
	for (let i = 0; i < urls.length; i += size) chunks.push(urls.slice(i, i + size));
	return chunks;
}

/**
 * Отбор адресов, годных к подаче.
 *
 * 🔴 Подавать чужой домен нельзя: поисковик отвергнет пачку целиком (403 «ключ не подошёл»), и
 * один посторонний адрес испортит подачу всех остальных. Поэтому отбор строгий и по хосту, а
 * негодные ВОЗВРАЩАЮТСЯ вызывающему — молча отбросить их значило бы отчитаться о подаче того,
 * что не подавалось.
 */
export function partitionUrls(urls, host) {
	const ok = [];
	const rejected = [];
	for (const raw of urls) {
		const url = typeof raw === 'string' ? raw.trim() : '';
		if (url.length === 0) continue;
		let parsed;
		try {
			parsed = new URL(url);
		} catch {
			rejected.push({ url: raw, why: 'не разбирается как адрес' });
			continue;
		}
		if (parsed.protocol !== 'https:') {
			rejected.push({ url: raw, why: `схема ${parsed.protocol} вместо https:` });
			continue;
		}
		if (parsed.host !== host) {
			rejected.push({ url: raw, why: `чужой хост ${parsed.host}, ожидался ${host}` });
			continue;
		}
		ok.push(parsed.toString());
	}
	return { ok, rejected };
}

/** Тело POST-запроса протокола. Форма — из первоисточника, поля именно эти и в этом виде. */
export function buildPayload({ host, key, keyLocation, urlList }) {
	const payload = { host, key, urlList };
	if (keyLocation) payload.keyLocation = keyLocation;
	return payload;
}

/**
 * Толкование кода ответа.
 *
 * У протокола коды говорящие, и разница между ними — это разница между «сделано», «подожди» и
 * «чини». Отдельно выделен 202: он выглядит как успех и успехом НЕ является — это «ключ ещё не
 * проверен», то есть файл ключа поисковик пока не прочитал.
 */
export function explainStatus(status) {
	switch (status) {
		case 200:
			return { ok: true, pending: false, meaning: 'принято' };
		case 202:
			return {
				ok: true,
				pending: true,
				meaning: 'принято условно — ключ ещё проверяется; файл ключа должен быть доступен',
			};
		case 400:
			return { ok: false, pending: false, meaning: 'неверные параметры запроса' };
		case 403:
			return { ok: false, pending: false, meaning: 'ключ не подошёл — файл в корне не совпал' };
		case 422:
			return { ok: false, pending: false, meaning: 'ошибка проверки: кривой адрес или формат ключа' };
		case 429:
			return { ok: false, pending: false, meaning: 'превышен темп подачи — притормозить' };
		default:
			return { ok: false, pending: false, meaning: `неожиданный код ${status}` };
	}
}
