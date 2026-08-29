/**
 * ЯДРО СНИМКА BING — чистые функции, сети не касаются.
 *
 * 🔴 ГЛАВНАЯ ЛОВУШКА ЭТОГО ИСТОЧНИКА — ФОРМАТ ДАТЫ, и она стоит отдельного модуля.
 *
 * Bing отдаёт даты наследием WCF: `"/Date(1316156400000-0700)/"`. Это НЕ ISO, НЕ число и НЕ то,
 * что понимает `new Date(...)`: `new Date("/Date(1316156400000-0700)/")` возвращает
 * `Invalid Date` молча, а `Number(...)` — `NaN`. То есть неверный разбор здесь не падает — он
 * даёт ряд с датами `null` или `Invalid Date`, который выглядит как «данных нет» и читается как
 * факт о продукте вместо факта о нашем парсере.
 *
 * ⚠️ И вторая половина той же ловушки: смещение в хвосте (`-0700`) — это ЧАСОВОЙ ПОЯС СЕРВЕРА
 * Microsoft, а число перед ним — уже полноценная метка Unix в миллисекундах UTC. Прибавлять
 * смещение к метке НЕЛЬЗЯ: получится сдвиг на семь часов, то есть у части дней съедет дата.
 * Смещение здесь — украшение сериализатора, а не часть значения.
 */

/** Разбор даты WCF в ISO-дату (`YYYY-MM-DD`) по UTC. Возвращает `null`, если форма не та. */
export function parseWcfDate(value) {
	if (typeof value !== 'string') return null;
	const match = /^\/Date\((-?\d+)([+-]\d{4})?\)\/$/.exec(value.trim());
	if (!match) return null;
	const millis = Number(match[1]);
	if (!Number.isFinite(millis)) return null;
	// Смещение из хвоста НЕ применяется намеренно — см. шапку модуля.
	return new Date(millis).toISOString().slice(0, 10);
}

/**
 * Ряд «показы и клики по дням» из ответа `GetRankAndTrafficStats`.
 *
 * Ответ приходит завёрнутым в поле `d` — это тоже наследие WCF, и забыть про обёртку значит
 * получить пустой ряд на исправном ответе.
 *
 * Строка с неразобранной датой НЕ выбрасывается молча: она уходит в `dropped`, чтобы вызывающий
 * увидел, что часть ответа не понята. Молчаливая потеря строк — тот же класс, что зашитые коды
 * причин у Яндекса.
 */
export function rankAndTrafficRows(body) {
	const raw = Array.isArray(body?.d) ? body.d : [];
	const rows = [];
	const dropped = [];
	for (const item of raw) {
		const date = parseWcfDate(item?.Date);
		if (!date) {
			dropped.push(item);
			continue;
		}
		rows.push({
			date,
			impressions: Number(item?.Impressions ?? 0),
			clicks: Number(item?.Clicks ?? 0),
		});
	}
	rows.sort((a, b) => (a.date < b.date ? -1 : 1));
	return { rows, dropped };
}

/**
 * Свод по ряду Bing.
 *
 * Позиции этот метод не отдаёт вовсе — поэтому её здесь нет, и придумывать её нельзя. Отсутствие
 * величины честнее выдуманной (`PHILOSOPHY.md`, правило трёх дверей).
 */
export function bingTotals(rows) {
	const impressions = rows.reduce((sum, row) => sum + (row.impressions || 0), 0);
	const clicks = rows.reduce((sum, row) => sum + (row.clicks || 0), 0);
	return { impressions, clicks, ctr: impressions > 0 ? clicks / impressions : 0 };
}

/** Ошибка Bing машиночитаема: `{"ErrorCode":3,"Message":"InvalidApiKey"}`. */
export function explainBingError(body) {
	if (body && typeof body.ErrorCode === 'number') {
		return `${body.Message ?? 'без описания'} (ErrorCode ${body.ErrorCode})`;
	}
	return 'ответ не разобран как ошибка Bing';
}
