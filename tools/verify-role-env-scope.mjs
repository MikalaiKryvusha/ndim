/**
 * СТРАЖ ГРАНИЦЫ КЛЮЧЕЙ — в рабочей копии роли нет ключа, который роли по манифесту не положен.
 *
 * ── ЗАЧЕМ ОН СУЩЕСТВУЕТ ──────────────────────────────────────────────────────────────────
 * Это оплаченный долг: `EXP-0216` называет его прямо — «механическое лечение (страж,
 * краснеющий на боевой ключ в `.env` рабочей копии роли) — предложено Менеджеру». До сегодня
 * граница держалась ЗАПИСЬЮ, то есть третьим сортом лечения.
 *
 * Класс подтверждён полем ТРИЖДЫ, и это уже не совпадение:
 *   · 2026-08-28 dev-3 скопировал `.env` главной копии ЦЕЛИКОМ, чтобы оживить прибор консоли, —
 *     и вместе с нужным ключом в его копию приехали `NDIM_PROD_SA_B64`, `NDIM_STAGE_SA_B64`,
 *     `NDIM_RECAPTCHA_SECRET`. Поймал Менеджер чтением, в тот же час;
 *   · в тот же день Дизайнер упёрся в ту же стену и поступил ВЕРНО — отказался копировать и
 *     запросил прогон у Менеджера;
 *   · 2026-08-29 dev-1 упёрся в неё третьим и тоже спросил.
 * Две правильные реакции из трёх — заслуга ролей, а не механизма: спросить успевает тот, кто
 * не торопится. Ворота обязаны держать границу и для того, кто торопится.
 *
 * ── ПОЧЕМУ ТАБЛИЦА ИМЁН, А НЕ ПРИЗНАК ────────────────────────────────────────────────────
 * Соблазн был написать признак вида «`_SA_B64$` — боевой ключ». Замер по живому `.env`
 * опровергает: `NDIM_CONSOLE_SA_B64` тоже кончается на `_SA_B64`, но это ключ Search Console,
 * и он роли dev-3 ПОЛОЖЕН по её постановке (указание Менеджера, смена 7). Признак покрасил бы
 * красным исправное — класс `EXP-0223`: ширина правила замеряется ДО объявления, а не после.
 * Поэтому здесь ТАБЛИЦА С ПРИЧИНОЙ НА КАЖДУЮ СТРОКУ, а неизвестный ключ судится отдельно:
 * страж не выдумывает класс за Менеджера, он требует его назвать.
 *
 * ── ГРАНИЦЫ, НАЗВАННЫЕ ЧЕСТНО ────────────────────────────────────────────────────────────
 * · ⛔ ГЛАВНАЯ КОПИЯ НЕ СУДИТСЯ. Боевые ресурсы принадлежат Менеджеру по манифесту, и её `.env`
 *   обязан нести всё. Страж, красящий её красным, был бы неверен по существу.
 * · Страж судит ФАКТ НАЛИЧИЯ ИМЕНИ, а не значение: значения он не читает и не печатает НИКОГДА —
 *   вывод ворот попадает в транскрипты и логи.
 * · Пустая строка `КЛЮЧ=` считается наличием: пустой боевой ключ безвреден сегодня и будет
 *   заполнен завтра тем, кто увидит знакомое имя.
 * · Копия без `.env` — норма, а не находка: ignore-файлы в `git worktree` не переносятся
 *   (первая половина урока `EXP-0216`), и роль до первой живой пробы живёт без него.
 * · Страж видит только копии, известные git. Ключ, вынесенный в чужой каталог руками, вне его
 *   досягаемости — эту дыру закрывает манифест, а не ворота.
 *
 * Запуск:  node tools/verify-role-env-scope.mjs   ·   самотест: --selftest
 * Ворота:  `npm run guards` (ни сети, ни стенда, ни сборки — чтение нескольких мелких файлов).
 * Код возврата: 0 — граница цела · 1 — ключ не по роли ИЛИ ключ без класса.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * КЛАССЫ КЛЮЧЕЙ. Один факт живёт в одном месте: ключ появился в `.env` — появляется и здесь,
 * с причиной. Причина не украшение: она печатается в отказе, и по ней роль понимает, ЧТО
 * именно она держит, не открывая файл.
 *
 * `owner: true` — ключ принадлежит Менеджеру и в копии роли запрещён.
 */
export const KEY_CLASSES = new Map([
	['NDIM_PROD_SA_B64', { owner: true, why: 'служебный счёт БОЯ — им перезаписываются данные живых людей' }],
	['NDIM_STAGE_SA_B64', { owner: true, why: 'служебный счёт стейджа — рубеж выката, зона Менеджера' }],
	['NDIM_RECAPTCHA_SECRET', { owner: true, why: 'секрет reCAPTCHA — проверочная сторона, наружу не уходит' }],
	/*
	 * ⚠️ Имя КАНОНИЧЕСКОЕ — то, которое читает код (`tools/lib/yandex-webmaster.mjs:43`).
	 * Первый живой прогон этого стража нашёл, что один и тот же секрет жил под ДВУМЯ именами:
	 * главная копия звала его `YANDEX_WEBMASTER`, копия dev-3 — канонически. Тождество значений
	 * доказано sha256 (значения не печатались), имя в главной копии приведено к каноническому
	 * 2026-08-29. Пока имён было два, прибор Яндекса из главной копии падал с «нет токена»,
	 * имея секрет в соседней строке.
	 *
	 * Класс `owner: false` — не послабление: владелец делегировал подачу правок агенту дословно
	 * («агент будет сам отправлять правки в яндекс», граница — `bugs/203` § «Разрешение
	 * владельца»), и роль, исполняющая переобход, держит этот ключ ПО СВОЕЙ ПОСТАНОВКЕ.
	 */
	[
		'NDIM_YANDEX_WEBMASTER_TOKEN',
		{ owner: false, why: 'токен Вебмастера — подача переобхода делегирована роли словом владельца (bugs/203)' },
	],
	[
		'POSTHOG_NDIM_SPACE_PERSONAL_API_KEY',
		{ owner: true, why: 'личный ключ владельца к его аккаунту PostHog (имя дано владельцем, не переименовывать)' },
	],
	[
		'NDIM_CONSOLE_SA_B64',
		{ owner: false, why: 'служебный счёт Search Console — только чтение консоли, положен роли по постановке' },
	],
	['NDIM_APP_CHECK_DEBUG_TOKEN', { owner: false, why: 'отладочный пропуск App Check — нужен любому живому прогону' }],
	['NDIM_RECAPTCHA_SITEKEY', { owner: false, why: 'публичный ключ сайта — он и так уезжает в отдаваемый HTML' }],
	['POSTHOG_PROJECT_TOKEN', { owner: false, why: 'публичный phc-токен — по решению идёт в код константой' }],
	['POSTHOG_PROJECT_ID', { owner: false, why: 'номер проекта, не секрет' }],
	['POSTHOG_REGION', { owner: false, why: 'регион размещения, не секрет' }],
]);

/**
 * Имена ключей из текста `.env` — ТОЛЬКО имена, значения не возвращаются никогда.
 *
 * ⚠️ CRLF учитывается: у проекта `core.autocrlf=true`, и хвостовой возврат каретки приклеился бы
 * к имени последнего ключа — тот же капкан, что уже оплачен в страже бренд-имени.
 *
 * @param {string} text содержимое файла `.env`
 * @returns {string[]} имена ключей в порядке появления
 */
export function keyNames(text) {
	const names = [];
	for (const line of String(text ?? '').split(/\r?\n/)) {
		const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
		if (m) names.push(m[1]);
	}
	return names;
}

/**
 * Суд над одной копией роли.
 *
 * @param {string[]} names имена ключей из её `.env`
 * @returns {{ forbidden: { key: string, why: string }[], unclassified: string[] }}
 */
export function judgeKeys(names) {
	const forbidden = [];
	const unclassified = [];
	for (const key of names) {
		const cls = KEY_CLASSES.get(key);
		if (!cls) unclassified.push(key);
		else if (cls.owner) forbidden.push({ key, why: cls.why });
	}
	return { forbidden, unclassified };
}

/** Рабочие копии ролей — все worktree, кроме главной (она идёт первой в выводе git). */
export function roleWorktrees() {
	const out = execFileSync('git', ['worktree', 'list', '--porcelain'], { encoding: 'utf8' });
	const paths = [];
	for (const line of out.split(/\r?\n/)) {
		if (line.startsWith('worktree ')) paths.push(line.slice('worktree '.length).trim());
	}
	return paths.slice(1); // первая — главная копия, она не судится (см. «Границы»)
}

function selftest() {
	const cases = [
		{ what: 'боевой ключ найден', names: ['POSTHOG_PROJECT_ID', 'NDIM_PROD_SA_B64'], forbidden: 1, unclassified: 0 },
		{ what: 'пустое значение — тоже наличие', names: keyNames('NDIM_PROD_SA_B64='), forbidden: 1, unclassified: 0 },
		{ what: 'консольный ключ роли положен', names: ['NDIM_CONSOLE_SA_B64'], forbidden: 0, unclassified: 0 },
		{ what: 'неизвестный ключ требует класса', names: ['NDIM_NEW_THING'], forbidden: 0, unclassified: 1 },
		{ what: 'закомментированная строка ключом не считается', names: keyNames('# NDIM_PROD_SA_B64=x'), forbidden: 0, unclassified: 0 },
		{ what: 'возврат каретки не приклеивается к имени', names: keyNames('POSTHOG_REGION=eu\r\n'), forbidden: 0, unclassified: 0 },
	];
	let bad = 0;
	for (const c of cases) {
		const got = judgeKeys(c.names);
		const ok = got.forbidden.length === c.forbidden && got.unclassified.length === c.unclassified;
		if (!ok) bad++;
		console.log(`${ok ? '✅' : '🔴'} ${c.what}`);
	}
	return bad === 0 ? 0 : 1;
}

function main(argv) {
	if (argv.includes('--selftest')) return selftest();

	const copies = roleWorktrees();
	const problems = [];
	let withEnv = 0;

	for (const dir of copies) {
		const envPath = join(dir, '.env');
		if (!existsSync(envPath)) continue; // норма, а не находка — см. «Границы»
		withEnv++;
		const { forbidden, unclassified } = judgeKeys(keyNames(readFileSync(envPath, 'utf8')));
		if (forbidden.length || unclassified.length) problems.push({ role: basename(dir), forbidden, unclassified });
	}

	// Число осмотренных печатается ВСЕГДА: «0 нарушений» и «0 наблюдений» выглядят одинаково.
	console.log(`ГРАНИЦА КЛЮЧЕЙ — рабочих копий ролей: ${copies.length}, из них с .env: ${withEnv}`);

	if (problems.length === 0) {
		console.log('✅ ключей не по роли нет, неклассифицированных нет');
		return 0;
	}

	for (const p of problems) {
		for (const f of p.forbidden) {
			console.error(`\n🔴 КЛЮЧ МЕНЕДЖЕРА В КОПИИ РОЛИ — ${p.role}/.env: ${f.key}`);
			console.error(`   ${f.why}`);
		}
		for (const key of p.unclassified) {
			console.error(`\n🔴 КЛЮЧ БЕЗ КЛАССА — ${p.role}/.env: ${key}`);
			console.error('   Страж не решает за Менеджера, чей это ключ: впишите строку в KEY_CLASSES с причиной.');
		}
	}
	console.error('\n   Правило (EXP-0216): в копию роли едут ТОЛЬКО ключи её постановки.');
	console.error('   Лечение — снять лишние строки из .env копии; нужен боевой прогон — заказать у Менеджера.');
	return 1;
}

/*
 * ПРЕДОХРАНИТЕЛЬ «ЗАПУЩЕН НАПРЯМУЮ ИЛИ ПОДКЛЮЧЁН» — конвенция приборов проекта.
 * Без него `import` из теста поднял бы живой обход рабочих копий и вернул бы коду возврата
 * теста чужой вердикт: набор краснел бы от состояния чужого `.env`, а не от своей логики.
 */
const запущенНапрямую = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
if (запущенНапрямую) process.exitCode = main(process.argv.slice(2));
