/**
 * ЧИСТАЯ ЛОГИКА МАШИННОЙ ПОДАЧИ ПЕРЕОБХОДА — что отправлять, сколько и как понимать ответы.
 *
 * Сети здесь нет: всё, что можно решить до вызова, решается тут и покрывается юнитами.
 * Сетевая часть — `tools/yandex-recrawl.mjs`; читающая библиотека API (`lib/yandex-webmaster.mjs`)
 * остаётся ЧИТАЮЩЕЙ намеренно — её шапка объявляет это границей области, и пишущий вызов внутри
 * неё сделал бы объявление неправдой.
 *
 * Контракт API снят с первоисточника, а не по памяти — `researches/56` §3.5:
 *   · подача: `POST /v4/user/{uid}/hosts/{hid}/recrawl/queue`, тело `{"url": "…"}`,
 *     **один адрес за запрос** (150 адресов — это 150 вызовов);
 *   · ответ 202: `{task_id, quota_remainder}` — остаток приезжает С КАЖДЫМ ответом;
 *   · ошибки именованные: 400 INVALID_URL · 403 INVALID_USER_ID · 404 HOST_NOT_VERIFIED ·
 *     409 URL_ALREADY_ADDED · 429 QUOTA_EXCEEDED.
 */

/** Разобрать файл адресов: пустые строки и хвостовой перевод не считаются. */
export function parseAddresses(text) {
	return text
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
}

/**
 * Что осталось подать: очередь минус уже отправленное, порядок очереди сохраняется.
 *
 * 🔑 Порядок — не косметика: очередь построена «последние удалённые первыми» (`bugs/203`), и
 * пересортировка обесценила бы приоритет, выбранный при её сборке.
 */
export function remainingQueue(queue, alreadySent) {
	const sent = new Set(alreadySent);
	return queue.filter((url) => !sent.has(url));
}

/**
 * Сколько адресов подать сейчас — минимум из трёх границ.
 *
 * 🔴 МАШИНА УСТУПАЕТ ЧЕЛОВЕКУ. Квота общая у интерфейса и API (замерено, `bugs/203`), поэтому
 * владелец может слать руками в тот же день. Прибор берёт остаток квоты КАК ЕСТЬ и никогда не
 * пытается послать больше: спорить с человеком за общий ресурс — не его дело.
 */
export function planBatch({ remaining, quotaRemainder, cap = Infinity }) {
	const limits = [remaining.length, Math.max(0, quotaRemainder), Math.max(0, cap)];
	const size = Math.min(...limits);
	return {
		size,
		urls: remaining.slice(0, size),
		limitedBy:
			size === 0
				? remaining.length === 0
					? 'очередь пуста'
					: 'квота исчерпана'
				: size === remaining.length
					? 'очередь'
					: size === quotaRemainder
						? 'квота'
						: 'потолок порции',
	};
}

/** Именованные коды отказа Яндекса — из первоисточника, без нашего перевода. */
export const REFUSALS = {
	400: 'INVALID_URL — адрес не принят как валидный',
	403: 'INVALID_USER_ID — пользователь не тот',
	404: 'HOST_NOT_VERIFIED — права на хост не подтверждены',
	409: 'URL_ALREADY_ADDED — адрес уже в очереди переобхода',
	429: 'QUOTA_EXCEEDED — суточная квота исчерпана',
};

/**
 * Как понимать один ответ подачи.
 *
 * Три исхода, и путать их дорого:
 *   · `accepted` — адрес принят, квота потрачена;
 *   · `skipped` — адрес уже в очереди (409). Квота НЕ потрачена, и это не ошибка прогона;
 *   · `stop` — дальше слать бессмысленно (429 квота, 403/404 доступ): прогон останавливается,
 *     а не долбит API 149 раз подряд одним и тем же отказом.
 */
export function classifyResponse({ status, body }) {
	if (status === 202 || status === 200) {
		return {
			outcome: 'accepted',
			taskId: body?.task_id ?? null,
			quotaRemainder: typeof body?.quota_remainder === 'number' ? body.quota_remainder : null,
		};
	}
	if (status === 409) return { outcome: 'skipped', why: REFUSALS[409] };
	if (status === 429) return { outcome: 'stop', why: REFUSALS[429] };
	if (status === 403 || status === 404) return { outcome: 'stop', why: REFUSALS[status] };
	if (status === 400) return { outcome: 'failed', why: REFUSALS[400] };
	return { outcome: 'failed', why: `неизвестный код ${status}` };
}

/**
 * Строка отчёта для `bugs/203` — числами, как предписал Менеджер: отправлено / остаток очереди /
 * остаток квоты. Строка собирается ЗДЕСЬ, чтобы её форма была одна и покрывалась юнитом.
 */
export function ledgerLine({ date, accepted, skipped, failed, queueLeft, quotaLeft }) {
	const parts = [
		`- **${date}** — отправлено **${accepted}**`,
		skipped > 0 ? `· уже в очереди ${skipped}` : null,
		failed > 0 ? `· отказов ${failed}` : null,
		`· остаток очереди **${queueLeft}**`,
		`· остаток квоты ${quotaLeft}`,
	];
	return parts.filter(Boolean).join(' ');
}
