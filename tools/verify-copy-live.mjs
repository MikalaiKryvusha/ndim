/**
 * ВИТРИНА ЛЕНДИНГА ПРОТИВ БАЗЫ — наблюдатель за расхождением (`bugs/170`).
 *
 * ── ЧТО ЛЕЧИТ ──────────────────────────────────────────────────────────────────────────────
 * `bugs/170`: «Число на витрине разошлось с базой на четыре дня, и заметить это было нечем».
 * Снимок `src/lib/content/landing-metric.ts` обновляется ТОЛЬКО боевым выкатом (шаг 3 двери,
 * `tools/snapshot-landing-metric.mjs`). Между выкатами витрина расходится с правдой на сколько
 * угодно, и первым это увидит владелец. Симптом лечится не «правильным числом», а НАБЛЮДАТЕЛЕМ
 * — так и написано в разборе бага.
 *
 * Класс уже оплачен дважды: `bugs/07` («с нами уже 2 184 человека» при 331 в базе) и принцип 8
 * `MASTER_PLAN.md` — обещание на лице продукта опирается на источник, иначе это не маркетинг,
 * а враньё.
 *
 * ── ДВЕ ДВЕРИ, ПОТОМУ ЧТО У НАБЛЮДЕНИЯ ДВЕ РАЗНЫЕ ЦЕНЫ ─────────────────────────────────────
 * Лестница лечения названа в самом `bugs/170`, и здесь взяты обе её исполнимые ступени:
 *
 *   БЕЗ СЕТИ (по умолчанию) — ВОЗРАСТ снимка. Говорит не о расхождении, а о риске расхождения,
 *   зато стоит ноль и годится в ворота: сеть в воротах — это ложные красные в самолёте.
 *
 *   `--live` — НАСТОЯЩЕЕ РАСХОЖДЕНИЕ: боевые числа против снимка, поле за полем. Стоит сети и
 *   секунды, поэтому в ворота НЕ идёт — её место рядом с выкатом, как у `sync:image`.
 *
 * Третью ступень («число не снимок, а запрос») брать нельзя: витрина живёт в ПРЕРЕНДЕРЕ
 * намеренно (`bugs/81`, слово владельца `ideas/21` п. 10), иначе строка доезжает «на горячую».
 *
 * ── ПОЧЕМУ ЧТЕНИЕ БОЯ ЗДЕСЬ СВОЁ, А НЕ ОБЩЕЕ С `snapshot-landing-metric.mjs` ───────────────
 * Это НЕ забытая развязка, а суть проверки. Прибор, который читает источник ТЕМ ЖЕ кодом, что
 * и проверяемый, не проверяет ничего: общая ошибка чтения даст согласие двух голосов вместо
 * расхождения. Здесь нужно ВТОРОЕ независимое мнение — тогда расхождение правил чтения (а
 * именно оно однажды и занизило витрину на единицу: поправка «−1» пережила свою причину)
 * становится видимым, а не согласованным.
 * ⚠️ Цена независимости названа честно: правила чтения продублированы, и если снимок сменит
 * своё правило, этот прибор закричит. Крик и есть желаемое поведение — молчание было бы хуже.
 *
 * ── ПРАВИЛО ПРИГОВОРА АСИММЕТРИЧНО, И ЭТО НЕ КАПРИЗ ────────────────────────────────────────
 * ЗАВЫШЕНИЕ («на витрине больше, чем в базе») — красное ВСЕГДА, при любой единице: это ровно
 * `bugs/07`, продукт обещает то, чего нет. ЗАНИЖЕНИЕ терпимо в пределах порога: снимок стареет
 * по устройству, и пока он отстаёт, витрина скромничает, а не врёт.
 *
 * ── СОСТОЯНИЕ ПРОВЕРКИ, ЧЕСТНО ─────────────────────────────────────────────────────────────
 * [TESTED: 2026-08-29, дерево ndim_integrator f6f84e5] дверь БЕЗ СЕТИ и ВСЯ ЛОГИКА ПРИГОВОРА —
 * самотест 14/0 на чистых функциях, включая воспроизведение случая `bugs/170` (витрина 5122
 * против базы 5121 → ЗАВЫШЕНИЕ) и оба контроля-пропуска; живой прогон офлайн-двери на снимке
 * дерева: 6 дн., порог 7, код 0.
 * [TESTED: 2026-08-29 — прогон МЕНЕДЖЕРА из главной копии против снимка главной копии, 4 поля ×
 * разница 0; расхождение доказано самотестом, ЖИВЬЁМ НЕ НАБЛЮДАЛОСЬ]
 * Форма маркера — требование судьи (вердикт №17): `[TESTED]` читается следующей сессией как
 * «автор наблюдал», а здесь наблюдал не автор, в другой копии и только сошедшийся случай. Чей
 * это был прогон — часть улики, и потому стоит внутри маркера, а не рядом с ним.
 * Числа того прогона: снимок от 2026-08-29 (0 дн.), витрина людей 95 · измерений 5144 · оценок
 * 4071 · связей 2368, вердикт «сходится, снимок свежий».
 * ⚠️ В ЭТОЙ ветке снимок старше и даёт другие `dims` — число без контура здесь особенно опасно.
 * 🔑 Прогон сделала роль, которой бой открыт. Из сессии Интегратора боевой запрос отбит
 * предохранителем (тот же класс, что запрет `git merge`), и обойти его чужими руками было бы
 * тем же обходом — поэтому дверь ждала того, чей доступ настоящий.
 *
 * Запуск:   node tools/verify-copy-live.mjs                 # без сети: возраст снимка
 *           node tools/verify-copy-live.mjs --max-age 3     # свой порог возраста, в днях
 *           node tools/verify-copy-live.mjs --live          # боевые числа против снимка
 * Самотест: node tools/verify-copy-live.mjs --selftest
 */

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { docsUrl } from './lib/contours.mjs';

const SNAPSHOT = 'src/lib/content/landing-metric.ts';

/** Публичный веб-ключ боя — тот же, что в `src/lib/firebase.ts`; он публичен по устройству. */
const API_KEY = 'AIzaSyCZsGkY0Lw_OJ35QhRumcD5RzNJUFsAsww';

/** Сколько дней снимку позволено стареть, если не сказано иного. */
const MAX_AGE_DAYS = 7;

/** Насколько витрине позволено ЗАНИЖАТЬ, в долях. Завышение не позволено вовсе. */
const UNDER_TOLERANCE = 0.02;

const FIELDS = ['people', 'dims', 'ratings', 'relations'];

/**
 * Разбор сгенерированного снимка. Регулярки собираются конкатенацией без обратных слешей —
 * тот же приём, что в соседних приборах: слеш в шаблонной строке однажды стал символом забоя
 * и ослепил правило (`bugs/218`).
 */
export function parseSnapshot(source) {
	const text = String(source || '');
	const out = { takenAt: null };
	for (const name of FIELDS) {
		const m = text.match(new RegExp(name + '[ \t]*:[ \t]*([0-9]+)'));
		out[name] = m ? Number(m[1]) : null;
	}
	const d = text.match(/takenAt[ \t]*:[ \t]*'([0-9]{4}-[0-9]{2}-[0-9]{2})'/);
	out.takenAt = d ? d[1] : null;
	return out;
}

/**
 * Возраст снимка в днях. Считается по ЛОКАЛЬНЫМ часам машины — канон `candidates/README.md`
 * («Часы машины»), слово владельца: «проверить локальное время машины ОБЯЗАТЕЛЬНО». Дата снимка
 * — календарный день без времени, поэтому обе стороны приводятся к полуночи, иначе прибор
 * вечером судил бы завтрашним днём (`bugs/195`, второй дефект той же строки).
 */
export function ageInDays(takenAt, now = new Date()) {
	if (!takenAt) return null;
	const [y, m, d] = takenAt.split('-').map(Number);
	const then = new Date(y, m - 1, d).getTime();
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
	return Math.round((today - then) / 86_400_000);
}

/** Приговор по возрасту: список причин. Пустой список = всё в порядке. Чистая функция. */
export function judgeAge(snapshot, maxAgeDays = MAX_AGE_DAYS, now = new Date()) {
	const stop = [];
	const missing = FIELDS.filter((f) => !Number.isInteger(snapshot[f]) || snapshot[f] < 0);
	if (missing.length) stop.push(`в снимке нет годных чисел: ${missing.join(', ')}`);
	if (!snapshot.takenAt) {
		stop.push('в снимке нет даты (takenAt) — возраст числа нечем измерить');
		return stop;
	}
	const age = ageInDays(snapshot.takenAt, now);
	if (age < 0) stop.push(`дата снимка в БУДУЩЕМ (${snapshot.takenAt}) — часы машины или снимок врут`);
	else if (age > maxAgeDays) {
		stop.push(
			`снимку витрины ${age} дн. (от ${snapshot.takenAt}), порог ${maxAgeDays} — ` +
				'между выкатами витрина расходится с базой молча (bugs/170)',
		);
	}
	return stop;
}

/**
 * Приговор по расхождению. Асимметричен намеренно — см. шапку.
 * Чистая функция: сеть остаётся снаружи, а судит самотест именно её.
 */
export function judgeDrift(snapshot, live, tolerance = UNDER_TOLERANCE) {
	const rows = [];
	for (const name of FIELDS) {
		const shown = snapshot[name];
		const real = live[name];
		if (!Number.isInteger(shown) || !Number.isInteger(real)) {
			rows.push({ name, shown, real, delta: null, verdict: 'нечем сверить' });
			continue;
		}
		const delta = shown - real;
		if (delta > 0) rows.push({ name, shown, real, delta, verdict: 'ЗАВЫШЕНИЕ' });
		else if (real > 0 && -delta / real > tolerance) rows.push({ name, shown, real, delta, verdict: 'занижение сверх порога' });
		else rows.push({ name, shown, real, delta, verdict: 'ок' });
	}
	return rows;
}

/**
 * Боевые числа — ВТОРЫМ, независимым чтением. `people` лежит в публичном `space/public_metrics`,
 * агрегаты каталога — в `space/stats`, закрытом правилами для не вошедших: он читается анонимным
 * входом, тем же приёмом и с тем же разрешением владельца, что `tools/probe-prod-stats.mjs`
 * (интервью №013, В2 = Б). Учётная запись удаляется здесь же, в `finally`.
 */
async function readLive() {
	const metrics = await fetch(`${docsUrl()}/space/public_metrics?key=${API_KEY}`);
	if (!metrics.ok) return { error: `space/public_metrics: HTTP ${metrics.status}` };
	const people = Number((await metrics.json())?.fields?.people?.integerValue ?? NaN);

	const signUp = await fetch(
		`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`,
		{ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }) },
	);
	if (!signUp.ok) return { error: `анонимный вход: HTTP ${signUp.status}` };
	const { idToken } = await signUp.json();
	try {
		const stats = await fetch(`${docsUrl()}/space/stats`, { headers: { Authorization: `Bearer ${idToken}` } });
		if (!stats.ok) return { error: `space/stats: HTTP ${stats.status}` };
		const fields = (await stats.json())?.fields ?? {};
		const int = (name) => Number(fields?.[name]?.integerValue ?? NaN);
		return { people, dims: int('dims'), ratings: int('ratings'), relations: int('relations') };
	} finally {
		await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${API_KEY}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ idToken }),
		}).catch(() => {});
	}
}

function selftest() {
	const SNAP = `export const PUBLIC_PEOPLE_SNAPSHOT = {
  people: 95,
  dims: 5137,
  ratings: 4071,
  relations: 2368,
  takenAt: '2026-08-23',
} as const;`;
	const AT = (s) => new Date(`${s}T12:00:00`);
	const full = { people: 95, dims: 5137, ratings: 4071, relations: 2368, takenAt: '2026-08-23' };

	const cases = [
		['снимок разобран: все четыре числа и дата', () => {
			const s = parseSnapshot(SNAP);
			return s.people === 95 && s.dims === 5137 && s.ratings === 4071 && s.relations === 2368 && s.takenAt === '2026-08-23';
		}],
		['возраст считается календарными днями', () => ageInDays('2026-08-23', AT('2026-08-29')) === 6],
		['возраст в день снимка — ноль, а не отрицательный вечером', () =>
			ageInDays('2026-08-29', new Date('2026-08-29T23:59:00')) === 0],
		['отказ: снимок старше порога', () =>
			judgeAge(full, 5, AT('2026-08-29')).some((s) => s.includes('снимку витрины'))],
		['отказ: дата снимка в будущем', () =>
			judgeAge(full, 7, AT('2026-08-20')).some((s) => s.includes('БУДУЩЕМ'))],
		['отказ: снимок без даты', () =>
			judgeAge({ ...full, takenAt: null }, 7, AT('2026-08-29')).some((s) => s.includes('нет даты'))],
		['отказ: в снимке нет годного числа', () =>
			judgeAge({ ...full, dims: null }, 7, AT('2026-08-23')).some((s) => s.includes('нет годных чисел'))],
		/*
		 * 🔑 КОНТРОЛЬ, БЕЗ КОТОРОГО НАБОР — ЗЕЛЁНАЯ ШИРМА: проверка, умеющая только краснеть,
		 * проходит все отказы выше и не различает ничего.
		 */
		['ПРОПУСК: свежий снимок нарушений не даёт', () => judgeAge(full, 7, AT('2026-08-24')).length === 0],

		['🔑 ЗАВЫШЕНИЕ красное при ОДНОЙ единице', () => {
			const r = judgeDrift({ ...full, people: 96 }, { people: 95, dims: 5137, ratings: 4071, relations: 2368 });
			return r.find((x) => x.name === 'people').verdict === 'ЗАВЫШЕНИЕ';
		}],
		['🔑 занижение в пределах порога — не нарушение', () => {
			const r = judgeDrift(full, { people: 96, dims: 5137, ratings: 4071, relations: 2368 });
			return r.find((x) => x.name === 'people').verdict === 'ок';
		}],
		['занижение сверх порога названо', () => {
			const r = judgeDrift(full, { people: 200, dims: 5137, ratings: 4071, relations: 2368 });
			return r.find((x) => x.name === 'people').verdict === 'занижение сверх порога';
		}],
		['случай bugs/170 воспроизводится: витрина 5122 против базы 5121', () => {
			const r = judgeDrift({ ...full, dims: 5122 }, { people: 95, dims: 5121, ratings: 4071, relations: 2368 });
			return r.find((x) => x.name === 'dims').verdict === 'ЗАВЫШЕНИЕ';
		}],
		['нечитанное поле не выдаётся за согласие', () => {
			const r = judgeDrift(full, { people: NaN, dims: 5137, ratings: 4071, relations: 2368 });
			return r.find((x) => x.name === 'people').verdict === 'нечем сверить';
		}],
		['ПРОПУСК: сошлось поле в поле — нарушений нет', () => {
			const r = judgeDrift(full, { people: 95, dims: 5137, ratings: 4071, relations: 2368 });
			return r.every((x) => x.verdict === 'ок');
		}],
	];

	let bad = 0;
	for (const [label, run] of cases) {
		let ok = false;
		try {
			ok = Boolean(run());
		} catch {
			ok = false;
		}
		if (!ok) bad += 1;
		console.log(`  ${ok ? '✅' : '❌'} ${label}`);
	}
	console.log(`\nпроверок ${cases.length} · провалов ${bad}`);
	return bad === 0 ? 0 : 1;
}

async function main(argv) {
	if (argv.includes('--selftest')) return selftest();

	const ai = argv.indexOf('--max-age');
	const maxAge = ai !== -1 && /^[0-9]+$/.test(argv[ai + 1] || '') ? Number(argv[ai + 1]) : MAX_AGE_DAYS;

	let source;
	try {
		source = readFileSync(SNAPSHOT, 'utf8');
	} catch {
		console.error(`❌ снимок витрины не прочитан: ${SNAPSHOT}`);
		return 1;
	}
	const snapshot = parseSnapshot(source);
	const age = ageInDays(snapshot.takenAt);

	console.log(`\n══ витрина лендинга против базы ══  снимок от ${snapshot.takenAt ?? '—'} (${age ?? '—'} дн.)`);
	console.log(
		`   витрина: людей ${snapshot.people} · измерений ${snapshot.dims} · ` +
			`оценок ${snapshot.ratings} · связей ${snapshot.relations}`,
	);

	const stop = judgeAge(snapshot, maxAge);
	for (const s of stop) console.log(`   🔴 ${s}`);

	if (!argv.includes('--live')) {
		if (stop.length === 0) console.log(`✅ снимок свежее порога (${maxAge} дн.).`);
		console.log('   Расхождение с базой этой дверью НЕ проверяется — для него нужен --live (сеть).');
		return stop.length ? 1 : 0;
	}

	const live = await readLive();
	if (live.error) {
		console.error(`\n❌ боевые числа не прочитаны: ${live.error}`);
		console.error('   Приговора о расхождении НЕТ — это отказ чтения, а не согласие витрины с базой.');
		return 1;
	}

	const rows = judgeDrift(snapshot, live);
	console.log(`\n   поле        витрина      база     разница   вердикт`);
	for (const r of rows) {
		console.log(
			`   ${r.name.padEnd(11)} ${String(r.shown).padStart(7)} ${String(r.real).padStart(9)} ` +
				`${String(r.delta ?? '—').padStart(9)}   ${r.verdict}`,
		);
	}
	const bad = rows.filter((r) => r.verdict !== 'ок');
	if (bad.length === 0 && stop.length === 0) {
		console.log('\n✅ витрина сходится с базой, снимок свежий.');
		return 0;
	}
	if (bad.some((r) => r.verdict === 'ЗАВЫШЕНИЕ')) {
		console.log('\n🔴 ВИТРИНА ОБЕЩАЕТ БОЛЬШЕ, ЧЕМ ЕСТЬ — это класс `bugs/07`.');
	}
	console.log('\n   Лечение: `node tools/snapshot-landing-metric.mjs` — снимок берётся из боя.');
	console.log('   ⛔ Править `src/lib/content/landing-metric.ts` руками нельзя: он генерируемый.');
	return 1;
}

const запущенНапрямую =
	Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
if (запущенНапрямую) process.exitCode = await main(process.argv.slice(2));
