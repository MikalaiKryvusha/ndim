/**
 * СТРАЖ РАСХОЖДЕНИЯ КОНТУРОВ ПО ХОСТИНГУ — `bugs/133`.
 *
 * Стейдж существует ради одного свойства, названного владельцем дословно: «*стейдж, который
 * ПОВТОРЯЕТ прод*». С фазы 5 `plans/53` прогон по нему обязателен перед каждым выкатом — значит
 * любое расхождение поведения означает, что правка уедет в бой, ни разу не отрепетированной.
 *
 * Первое такое расхождение нашлось в тот же день, когда приборы научились ходить по стейджу: в
 * `firebase.stage.json` не было ни одной из десяти боевых переадресаций, и десять адресов отвечали
 * 404 вместо 301. Копия конфигурации, сделанная руками, разъезжается молча — поэтому копия едет
 * вместе со стражем.
 *
 * ЧТО СВЕРЯЕТСЯ (боевой таргет `landing` ↔ стейдж):
 *   · переадресации — множество троек «источник → цель → тип»;
 *   · `cleanUrls`;
 *   · правила кеширования — источник и значение `Cache-Control`.
 *
 * ЧТО ЗАКОННО РАЗЛИЧАЕТСЯ (перечислено поимённо и с причиной — страж, который приходится
 * отключать при каждом честном отличии, перестают запускать):
 *   · `X-Robots-Tag` есть только у стейджа (П6: контур закрыт от роботов);
 *   · `site`/`target` и список `ignore` — адресация, а не поведение;
 *   · второй боевой таргет `app` (старый домен `ndim-space.web.app`) у стейджа отсутствует
 *     целиком: это дверь со старого адреса на купленный, у стейджа такой двери нет;
 *   · блок `firestore` — у каждого контура своя база, в этом и смысл разделения.
 *
 * Запуск: node tools/verify-contour-parity.mjs [--selftest]
 * Выход:  0 — контуры совпадают там, где обязаны; 1 — расхождение.
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** Тройка переадресации в сравнимом виде. Порядок правил значения не имеет — сравниваем множества. */
const redirectKey = (r) => `${r.source} → ${r.destination} (${r.type})`;

/** Правило кеширования: источник + значение `Cache-Control`. Прочие заголовки сверяет П6. */
const cacheKey = (h) => {
	const value = (h.headers ?? []).find((one) => one.key.toLowerCase() === 'cache-control')?.value;
	return value === undefined ? null : `${h.source} → ${value}`;
};

/** Расхождения двух наборов строк, обе стороны. */
export function diff(prod, stage) {
	const inProd = prod.filter((x) => !stage.includes(x));
	const inStage = stage.filter((x) => !prod.includes(x));
	return { onlyProd: inProd, onlyStage: inStage };
}

/**
 * 🔴 ПРЕДОХРАНИТЕЛЬ «ЗАПУЩЕН ИЛИ ПОДКЛЮЧЁН» (`ideas/43`; страж класса — `verify-import-safety.mjs`).
 * Без него импорт ради экспортируемой `diff` читал `firebase.json` и `firebase.stage.json` и
 * звал `process.exit` — то есть убивал чужой процесс, ничего у него не спросив.
 */
const ЗАПУЩЕН_НАПРЯМУЮ = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;

function выполнить() {
	if (process.argv.includes('--selftest')) {
		const cases = [
			['одинаковые наборы — расхождений нет', diff(['a', 'b'], ['b', 'a']).onlyProd.length === 0 && diff(['a', 'b'], ['b', 'a']).onlyStage.length === 0],
			['правило есть в бою и нет на стейдже — РАСХОЖДЕНИЕ', diff(['a', 'b'], ['a']).onlyProd.join() === 'b'],
			['правило есть на стейдже и нет в бою — РАСХОЖДЕНИЕ', diff(['a'], ['a', 'z']).onlyStage.join() === 'z'],
			['цель переадресации изменена — РАСХОЖДЕНИЕ с обеих сторон',
				diff(['/x → /ru/x (301)'], ['/x → /en/x (301)']).onlyProd.length === 1 &&
					diff(['/x → /ru/x (301)'], ['/x → /en/x (301)']).onlyStage.length === 1],
			['тип 301 подменён на 302 — РАСХОЖДЕНИЕ', diff(['/x → /ru/x (301)'], ['/x → /ru/x (302)']).onlyProd.length === 1],
		];
		let bad = 0;
		for (const [label, ok] of cases) {
			if (!ok) bad += 1;
			console.log(`  ${ok ? '✅' : '❌'} ${label}`);
		}
		console.log(`\nпроверок ${cases.length} · провалов ${bad}`);
		process.exit(bad === 0 ? 0 : 1);
	}

	const prodConfig = JSON.parse(readFileSync('firebase.json', 'utf8'));
	const stageConfig = JSON.parse(readFileSync('firebase.stage.json', 'utf8'));

	const prodSite = prodConfig.hosting.find((h) => h.target === 'landing');
	const stageSite = stageConfig.hosting.find((h) => h.site === 'ndim-stage');

	let passed = 0;
	const fails = [];
	const check = (ok, name, detail = '') => {
		if (ok) {
			passed += 1;
			console.log(`  ✅ ${name}${detail ? ` — ${detail}` : ''}`);
		} else {
			fails.push(`${name}${detail ? ` — ${detail}` : ''}`);
			console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`);
		}
	};

	console.log('\n═══ КОНТУРЫ СОВПАДАЮТ ТАМ, ГДЕ ОБЯЗАНЫ (bugs/133) ═══\n');

	// 🔑 Контроль прибора ПЕРВЫМ: сравнивать было ЧТО. Пустые наборы дали бы «расхождений 0» на
	// конфигурации, которую страж не нашёл вовсе (`EXP-0070`).
	check(Boolean(prodSite), 'боевой таргет landing найден');
	check(Boolean(stageSite), 'таргет стейджа найден');
	if (!prodSite || !stageSite) {
		console.log('\n🔴 сравнивать нечем — дальше идти нельзя.');
		process.exit(1);
	}

	const prodRedirects = (prodSite.redirects ?? []).map(redirectKey);
	const stageRedirects = (stageSite.redirects ?? []).map(redirectKey);
	check(prodRedirects.length > 0, 'в бою есть переадресации (иначе сверка пуста)', `${prodRedirects.length}`);

	const redirects = diff(prodRedirects, stageRedirects);
	check(
		redirects.onlyProd.length === 0,
		'🔑 ни одной боевой переадресации не потеряно на стейдже',
		redirects.onlyProd.length === 0 ? `${stageRedirects.length} шт.` : redirects.onlyProd.join(' · '),
	);
	check(
		redirects.onlyStage.length === 0,
		'на стейдже нет переадресаций, которых нет в бою',
		redirects.onlyStage.join(' · '),
	);

	check(prodSite.cleanUrls === stageSite.cleanUrls, 'cleanUrls одинаков', `бой ${prodSite.cleanUrls} · стейдж ${stageSite.cleanUrls}`);

	const prodCache = (prodSite.headers ?? []).map(cacheKey).filter(Boolean);
	const stageCache = (stageSite.headers ?? []).map(cacheKey).filter(Boolean);
	check(prodCache.length > 0, 'в бою есть правила кеширования (иначе сверка пуста)', `${prodCache.length}`);
	const cache = diff(prodCache, stageCache);
	check(
		cache.onlyProd.length === 0 && cache.onlyStage.length === 0,
		'🔑 правила кеширования совпадают (bugs/124 действует в обоих контурах)',
		[...cache.onlyProd.map((x) => `только бой: ${x}`), ...cache.onlyStage.map((x) => `только стейдж: ${x}`)].join(' · '),
	);

	console.log(`\n${'─'.repeat(56)}`);
	console.log(`${fails.length === 0 ? '✅ ЧИСТО' : '🔴 РАСХОЖДЕНИЕ'}: проверок ${passed + fails.length} · провалов ${fails.length}`);
	process.exit(fails.length === 0 ? 0 : 1);
}

if (ЗАПУЩЕН_НАПРЯМУЮ) выполнить();
