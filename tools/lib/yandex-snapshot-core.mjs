/**
 * ЯДРО СНИМКА ЯНДЕКС.ВЕБМАСТЕРА — чистые функции, сети не касаются.
 *
 * Отделено от `yandex-webmaster.mjs` по той же причине, что ядро Google от своего прибора: юниты
 * обязаны гоняться БЕЗ токена. Токен здесь появится не сегодня (его выдаёт владелец), а код
 * должен быть готов и проверен к тому часу, когда появится, — иначе прибор пишется в спешке в
 * день инцидента.
 *
 * 🔴 ГЛАВНОЕ ПРАВИЛО МОДУЛЯ, И ОНО ОПЛАЧЕНО ЗАМЕРОМ: КОДЫ ПРИЧИН НЕ ЗАШИТЫ.
 *
 * Документация Яндекса перечисляет `ApiExcludedUrlStatus` четырнадцатью значениями
 * (`NOTHING_FOUND`, `HOST_ERROR`, `LOW_QUALITY`, `NO_INDEX` и родня). А живая консоль 2026-08-28
 * показала на наших 1352 выкинутых страницах **`LOW_DEMAND`** и **`META_NO_INDEX`** — ДВУХ этих
 * кодов в документированном перечне НЕТ ВОВСЕ (`researches/56_console_apis_bing_yandex.md`
 * §3.4.1). Причин расхождения три, и по бумаге между ними не выбрать.
 *
 * Отсюда конструкция: **прибор складывает коды КАК ЕСТЬ и печатает пришедшее**. Он никогда не
 * спрашивает «равен ли код известному слову» и не имеет списка, с которым сверяется. Прибор,
 * отбирающий строки по заранее известному коду, на нашем реальном ответе нашёл бы НОЛЬ
 * страниц — и остался бы зелёным, потому что искал не то слово. Это ровно вопрос 2 лестницы
 * трёх вопросов (`AGENT_GUIDE.md`): «признак проверки верен?».
 */

/** Типы события выборки — единственное, что мы всё-таки различаем по имени. */
export const EVENT_REMOVED = 'REMOVED_FROM_SEARCH';
export const EVENT_APPEARED = 'APPEARED_IN_SEARCH';

/**
 * Наш хост среди тех, что видит токен.
 *
 * Яндекс адресует хост строкой вида `https:ndimspace.app:443`, а не голым доменом, и угадывать
 * её форму нельзя — она приходит в списке. Поэтому ищем по ВХОЖДЕНИЮ домена, а не по равенству:
 * равенство сломалось бы от схемы, порта или лишнего `www`.
 */
export function findHost(hostList, domain) {
	const match = hostList.find(
		(host) =>
			typeof host?.unicode_host_url === 'string' && host.unicode_host_url.includes(domain),
	);
	if (match) return match;
	return (
		hostList.find(
			(host) => typeof host?.host_id === 'string' && host.host_id.includes(domain),
		) ?? null
	);
}

/**
 * Раскладка событий на «появилось» и «выпало».
 *
 * Строка без известного типа события НЕ выбрасывается, а собирается в `other`: молчаливое
 * отбрасывание непонятного — тот же класс, что зашитые коды. Пусть лучше в отчёте будет
 * непонятная строка, чем не будет никакой.
 */
export function splitEvents(samples) {
	const removed = [];
	const appeared = [];
	const other = [];
	for (const sample of samples) {
		if (sample?.event === EVENT_REMOVED) removed.push(sample);
		else if (sample?.event === EVENT_APPEARED) appeared.push(sample);
		else other.push(sample);
	}
	return { removed, appeared, other };
}

/**
 * Свод выпавших страниц по причине — КАК ОНА ПРИШЛА.
 *
 * Ни одного сравнения с известным кодом; список причин рождается из данных. Строка без причины
 * попадает под честное имя `(причина не указана)`, а не приписывается к соседней.
 *
 * Возвращает причины в порядке убывания числа страниц: читающему нужен масштаб, а не алфавит.
 */
export function groupByReason(samples) {
	const byReason = new Map();
	for (const sample of samples) {
		const reason =
			typeof sample?.excluded_url_status === 'string' && sample.excluded_url_status.length > 0
				? sample.excluded_url_status
				: '(причина не указана)';
		if (!byReason.has(reason)) byReason.set(reason, { reason, count: 0, samples: [] });
		const bucket = byReason.get(reason);
		bucket.count += 1;
		if (bucket.samples.length < 20) bucket.samples.push(sample.url);
	}
	return [...byReason.values()].sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));
}

/**
 * Разрез выпавших страниц по разделам сайта.
 *
 * Нужен, чтобы отличить «выкинуло каталог» от «выкинуло документы»: у этих двух бед разная цена
 * и разное лечение. Раздел определяется по адресу, а не по данным Яндекса, — у него такого
 * понятия нет.
 */
export function groupBySection(samples) {
	const sections = new Map();
	for (const sample of samples) {
		const url = typeof sample?.url === 'string' ? sample.url : '';
		const section = sectionOf(url);
		sections.set(section, (sections.get(section) ?? 0) + 1);
	}
	return [...sections.entries()]
		.map(([section, count]) => ({ section, count }))
		.sort((a, b) => b.count - a.count || a.section.localeCompare(b.section));
}

/** Раздел сайта по адресу. Порядок проверок важен: корень определяется последним. */
export function sectionOf(url) {
	if (/\/dimension\//.test(url)) return 'карточки каталога';
	if (/\/catalog\//.test(url)) return 'хабы каталога';
	if (/\/test\//.test(url)) return 'семейство ТЕСТ';
	if (/\/menu\//.test(url)) return 'документы «Меню»';
	if (/\/delete-account/.test(url)) return 'удаление аккаунта';
	if (/^https?:\/\/[^/]+\/(ru|en)\/?$/.test(url)) return 'языковой лендинг';
	if (/^https?:\/\/[^/]+\/?$/.test(url)) return 'корень';
	return 'прочее';
}

/**
 * Приговор квоте переобхода: один пул с интерфейсом или два.
 *
 * 🔑 ЗАЧЕМ ЭТО ОТДЕЛЬНОЙ ФУНКЦИЕЙ. Менеджер 2026-08-28 отправил 150 адресов РУКАМИ через
 * интерфейс Вебмастера (его дневной лимит — 150). Совпадает ли этот лимит с `daily_quota`
 * официального API — неизвестно, и разница определяет срок разбора очереди из 1201 адреса
 * ВДВОЕ: при общем пуле сегодня уже ничего не отправить, при раздельном — можно ещё столько же.
 *
 * Функция не гадает: она сопоставляет то, что вернул API, с тем, что мы отправили руками, и
 * называет исход. Когда данных не хватает на вывод — говорит «неизвестно», а не выбирает
 * удобное.
 */
export function quotaVerdict({ dailyQuota, quotaRemainder, sentByHand = 0 }) {
	if (typeof dailyQuota !== 'number' || typeof quotaRemainder !== 'number') {
		return { pool: 'неизвестно', reason: 'API не вернул числа квоты' };
	}
	const spent = dailyQuota - quotaRemainder;
	if (sentByHand <= 0) {
		return {
			pool: 'неизвестно',
			spent,
			reason: 'руками сегодня ничего не отправляли — сопоставлять не с чем',
		};
	}
	// Допуск в единицу: между отправкой и опросом могло пройти что-то ещё.
	if (Math.abs(spent - sentByHand) <= 1) {
		return {
			pool: 'общий',
			spent,
			reason: `израсходовано ${spent} при ${sentByHand} отправленных руками — интерфейс и API берут из одной квоты`,
		};
	}
	if (spent === 0) {
		return {
			pool: 'раздельный',
			spent,
			reason: `API показывает нулевой расход при ${sentByHand} отправленных руками — квоты независимы`,
		};
	}
	return {
		pool: 'неизвестно',
		spent,
		reason: `израсходовано ${spent} при ${sentByHand} отправленных руками — не сходится ни с общим пулом, ни с раздельным`,
	};
}

/**
 * Ряд статистики поиска из ответа `search-queries/all/history`.
 *
 * Ответ приходит формой `{indicators: {TOTAL_SHOWS: [{date, value}, …], …}}` — то есть
 * показатель снаружи, дата внутри. Читать её так неудобно и человеку, и коду, поэтому
 * разворачиваем в ряд по датам: одна строка — один день, показатели столбцами.
 *
 * Имена показателей НЕ зашиты и здесь: что пришло, то и станет столбцом.
 */
export function indicatorsToRows(body) {
	const indicators = body?.indicators ?? {};
	const byDate = new Map();
	for (const [name, points] of Object.entries(indicators)) {
		for (const point of points ?? []) {
			const date = typeof point?.date === 'string' ? point.date.slice(0, 10) : null;
			if (!date) continue;
			if (!byDate.has(date)) byDate.set(date, { date });
			byDate.get(date)[name] = point.value;
		}
	}
	return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}
