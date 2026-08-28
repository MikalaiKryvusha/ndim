/**
 * ЯДРО СНИМКА ПОИСКОВЫХ КОНСОЛЕЙ — чистые функции, сети не касаются.
 *
 * Зачем отдельным модулем: прибор снимка (`tools/console-snapshot.mjs`) ходит в Search Console
 * по ключу из `.env`, и юниты такого прибора либо требуют ключа, либо не существуют вовсе. Здесь
 * живёт всё, что можно проверить БЕЗ ключа и БЕЗ сети: окно, свод, свежесть, недельные корзины и
 * правило малых чисел. Прибор остаётся тонкой оболочкой «сходить и записать».
 *
 * 🔴 ГЛАВНАЯ ЛОВУШКА, РАДИ КОТОРОЙ МОДУЛЬ НАПИСАН ПЕРВЫМ: СРЕДНЯЯ ПОЗИЦИЯ — ВЗВЕШЕННАЯ.
 * Search Console считает среднюю позицию по ресурсу, взвешивая её ПОКАЗАМИ, а не усредняя
 * позиции строк. Наивное среднее по дням даёт другое число, и оно молча расходится с тем, что
 * владелец видит в панели, — то есть прибор врал бы, оставаясь зелёным. Свод здесь взвешивает
 * (`totals`), и на это стоит отдельный юнит.
 *
 * ⚠️ И вторая ловушка того же рода: у дня БЕЗ показов Search Console отдаёт `position: 0`.
 * Ноль здесь означает «мерить нечего», а не «мы на нулевой позиции» (позиций с номером 0 не
 * бывает). Такой день обязан выпадать из знаменателя, иначе средняя позиция ползёт к нулю тем
 * сильнее, чем БОЛЬШЕ у нас пустых дней, — то есть прибор тем оптимистичнее, чем хуже дела.
 */

/** Максимум строк на один запрос Search Console (лимит API). */
export const ROW_LIMIT = 25_000;

/** Глубина хранения Search Console — 16 месяцев; глубже прошлого не существует. */
export const RETENTION_MONTHS = 16;

/** ── ОКНО СНИМКА ───────────────────────────────────────────────────────────────────────── */

/** ISO-дата (`YYYY-MM-DD`) из объекта Date по ЛОКАЛЬНЫМ часам машины. */
export function isoDate(date) {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, '0');
	const d = String(date.getDate()).padStart(2, '0');
	return `${y}-${m}-${d}`;
}

/**
 * Окно снимка: вся доступная глубина хранения по сегодняшний день.
 *
 * 🔑 Окно берётся ЦЕЛИКОМ каждый раз, а не «сколько накопилось с прошлого снимка». Главный довод —
 * АРХИВНЫЙ: консоль хранит 16 месяцев и молча роняет всё, что старше, поэтому каждый снимок обязан
 * быть самодостаточным слепком всей доступной глубины. Тогда ряд файлов переживает саму консоль, а
 * не превращается в куски, которые придётся сшивать и решать, чьё число верное.
 *
 * ⚠️ Второй довод — пересмотр свежих дней задним числом — ЗАМЕРЕН И ОКАЗАЛСЯ СЛАБЫМ, и это
 * записано честно, чтобы следующая сессия не опиралась на выдумку. Сверка снимка 2026-08-28 с
 * базовой линией `researches/40` §14 по тому же окну (по 2026-08-15): **470 показов против
 * записанных 469** — за одиннадцать дней пересмотр составил один показ. То есть данные оседают
 * почти сразу, и полное окно оправдано архивом, а не ожиданием крупных правок.
 *
 * ⚠️ Часы машины — локальные, по правилу владельца («проверить локальное время машины
 * ОБЯЗАТЕЛЬНО»): UTC вечером даёт завтрашний день (`bugs/195`, второй дефект).
 */
export function snapshotWindow(today, months = RETENTION_MONTHS) {
	const start = new Date(today.getFullYear(), today.getMonth() - months, today.getDate());
	return { startDate: isoDate(start), endDate: isoDate(today) };
}

/** Имя файла снимка: дата + консоль. Один день — один файл, поэтому повтор дня перезаписывает. */
export function snapshotFileName(dateIso, source = 'google_search_console') {
	return `${dateIso}_${source}.json`;
}

/** ── СВОД ──────────────────────────────────────────────────────────────────────────────── */

/**
 * Свод по набору строк выдачи.
 *
 * `ctr` считается из сумм (клики / показы), а НЕ усреднением построчных CTR: среднее долей —
 * не доля сумм, и на маленьких числах эти два ответа расходятся в разы.
 * `position` взвешивается показами, дни без показов в знаменатель не входят (см. шапку).
 */
export function totals(rows) {
	let clicks = 0;
	let impressions = 0;
	let positionWeight = 0;
	let positionSum = 0;

	for (const row of rows) {
		clicks += row.clicks ?? 0;
		impressions += row.impressions ?? 0;
		const shown = row.impressions ?? 0;
		// Строка без показов позиции не несёт: её `position: 0` — «мерить нечего», не «нулевая позиция».
		if (shown > 0 && typeof row.position === 'number' && row.position > 0) {
			positionWeight += shown;
			positionSum += row.position * shown;
		}
	}

	return {
		clicks,
		impressions,
		ctr: impressions > 0 ? clicks / impressions : 0,
		position: positionWeight > 0 ? positionSum / positionWeight : null,
	};
}

/** ── СВЕЖЕСТЬ ДАННЫХ ───────────────────────────────────────────────────────────────────── */

/**
 * Насколько данные отстают от сегодняшнего дня.
 *
 * Search Console отдаёт свежие дни с задержкой в двое-трое суток, и величина задержки —
 * это факт о снимке, а не о продукте. Без неё следующая сессия прочитает «последние два дня
 * ноль показов» как провал притока, тогда как это просто ещё не приехавшие данные.
 *
 * Возвращает ДВЕ разные даты, и путать их нельзя: `lastDayPresent` — докуда консоль вообще
 * ответила строкой; `lastDayWithImpressions` — докуда были показы. Их расхождение и есть
 * «хвост нулей», который читается как падение и падением не является.
 */
export function freshness(dateRows, todayIso) {
	const withKey = dateRows.filter((row) => typeof row.keys?.[0] === 'string');
	const dates = withKey.map((row) => row.keys[0]).sort();
	const shown = withKey.filter((row) => (row.impressions ?? 0) > 0).map((row) => row.keys[0]).sort();

	const lastDayPresent = dates.at(-1) ?? null;
	const lastDayWithImpressions = shown.at(-1) ?? null;

	return {
		firstDayPresent: dates[0] ?? null,
		lastDayPresent,
		lastDayWithImpressions,
		lagDays: lastDayWithImpressions ? daysBetween(lastDayWithImpressions, todayIso) : null,
		trailingEmptyDays:
			lastDayPresent && lastDayWithImpressions
				? daysBetween(lastDayWithImpressions, lastDayPresent)
				: null,
	};
}

/** Разница в целых сутках между двумя ISO-датами (UTC-полночь — арифметика, не часовой пояс). */
export function daysBetween(fromIso, toIso) {
	const from = Date.parse(`${fromIso}T00:00:00Z`);
	const to = Date.parse(`${toIso}T00:00:00Z`);
	return Math.round((to - from) / 86_400_000);
}

/** ── НЕДЕЛЬНЫЕ КОРЗИНЫ (правило малых чисел) ───────────────────────────────────────────── */

/**
 * Ключ ISO-недели (`2026-W35`) и понедельник этой недели.
 *
 * Недели берутся ISO (с понедельника) намеренно: это единственная нумерация, о которой не надо
 * договариваться отдельно, и она же в BigQuery-выгрузке.
 */
export function isoWeek(dateIso) {
	const date = new Date(`${dateIso}T00:00:00Z`);
	const day = date.getUTCDay() || 7; // воскресенье = 7, а не 0
	const monday = new Date(date);
	monday.setUTCDate(date.getUTCDate() - (day - 1));

	const thursday = new Date(monday);
	thursday.setUTCDate(monday.getUTCDate() + 3); // четверг решает, к какому году принадлежит неделя
	const firstThursday = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
	const firstDay = firstThursday.getUTCDay() || 7;
	firstThursday.setUTCDate(firstThursday.getUTCDate() - (firstDay - 1));

	const week = Math.round((thursday - firstThursday) / (7 * 86_400_000)) + 1;
	return {
		key: `${thursday.getUTCFullYear()}-W${String(week).padStart(2, '0')}`,
		monday: monday.toISOString().slice(0, 10),
	};
}

/**
 * Складывает дневные строки в недельные корзины.
 *
 * 🔑 ЗАЧЕМ ЭТО ВООБЩЕ ЕСТЬ — прямое требование заказа: у нас единицы кликов в день, и дневная
 * «динамика» это дребезг, а не сигнал. Неделя — наименьшее окно, в котором наши числа вообще
 * начинают что-то значить.
 *
 * `complete` честно помечает корзину, в которой лежит меньше семи дней: неполная неделя ВСЕГДА
 * выглядит падением, и сравнивать её с полной — самый дешёвый способ выдумать тренд.
 */
export function weeklyBuckets(dateRows) {
	const byWeek = new Map();

	for (const row of dateRows) {
		const dateIso = row.keys?.[0];
		if (typeof dateIso !== 'string') continue;
		const { key, monday } = isoWeek(dateIso);
		if (!byWeek.has(key)) byWeek.set(key, { week: key, from: monday, rows: [] });
		byWeek.get(key).rows.push(row);
	}

	return [...byWeek.values()]
		.sort((a, b) => (a.from < b.from ? -1 : 1))
		.map((bucket) => ({
			week: bucket.week,
			from: bucket.from,
			days: bucket.rows.length,
			complete: bucket.rows.length === 7,
			...totals(bucket.rows),
		}));
}

/** ── ПРАВИЛО МАЛЫХ ЧИСЕЛ ───────────────────────────────────────────────────────────────── */

/**
 * Полоса шума для счётного показателя: ±2·√n.
 *
 * Обоснование, а не вкус: показы и клики — счётные события, их естественный разброс около
 * величины n имеет порядок √n (пуассоновский счёт). Две сигмы — обычный инженерный порог «за
 * пределами обычного дребезга». Это ЭВРИСТИКА и она названа эвристикой: она отвечает на вопрос
 * «стоит ли вообще смотреть», а не «доказано ли изменение».
 *
 * Что это даёт на наших числах: 3 клика → 5 кликов остаётся шумом (полоса ±3,5), а
 * 300 показов → 440 становится сигналом (полоса ±34,6). Ровно то различение, ради которого
 * правило заказано.
 */
export function noiseBand(base) {
	return 2 * Math.sqrt(Math.max(base, 0));
}

/**
 * Приговор изменению счётной величины между двумя периодами.
 *
 * `floor` отсекает второй способ выдумать тренд: при базе 0 полоса шума равна нулю, и любое
 * «было 0, стало 1» формально вылезло бы за неё сигналом. На таких величинах говорить не о чем,
 * и прибор обязан это признавать, а не производить гипотезы из единицы.
 */
export function countVerdict(before, after, { floor = 10 } = {}) {
	const delta = after - before;
	const band = noiseBand(before);
	const enough = Math.max(before, after) >= floor;

	return {
		before,
		after,
		delta,
		band: Number(band.toFixed(1)),
		relative: before > 0 ? delta / before : null,
		signal: enough && Math.abs(delta) > band,
		reason: !enough
			? `числа малы (максимум ${Math.max(before, after)} < ${floor}) — говорить не о чем`
			: Math.abs(delta) > band
				? `|${delta}| выходит за полосу шума ±${band.toFixed(1)}`
				: `|${delta}| укладывается в полосу шума ±${band.toFixed(1)}`,
	};
}

/**
 * Сравнение двух последних ПОЛНЫХ недель.
 *
 * Возвращает `null`, когда полных недель меньше двух: честное «сравнивать нечем» вместо
 * сравнения с неполной неделей, которое всегда покажет падение.
 */
export function weekOverWeek(buckets, options) {
	const complete = buckets.filter((bucket) => bucket.complete);
	if (complete.length < 2) return null;

	const previous = complete.at(-2);
	const current = complete.at(-1);

	return {
		previous: previous.week,
		current: current.week,
		impressions: countVerdict(previous.impressions, current.impressions, options),
		clicks: countVerdict(previous.clicks, current.clicks, options),
		position: {
			before: previous.position,
			after: current.position,
			delta:
				previous.position != null && current.position != null
					? Number((current.position - previous.position).toFixed(1))
					: null,
		},
	};
}

/** ── ТОПЫ ──────────────────────────────────────────────────────────────────────────────── */

/** Верхние N строк среза по показам — то, что попадает в человеческий отчёт. */
export function topBy(rows, field = 'impressions', limit = 10) {
	return [...rows]
		.sort((a, b) => (b[field] ?? 0) - (a[field] ?? 0))
		.slice(0, limit)
		.map((row) => ({
			key: row.keys?.[0] ?? null,
			clicks: row.clicks ?? 0,
			impressions: row.impressions ?? 0,
			ctr: row.ctr ?? 0,
			position: row.position ?? null,
		}));
}
