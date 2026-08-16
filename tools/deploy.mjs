/**
 * 🔴 ЕДИНСТВЕННАЯ ДВЕРЬ ВЫКАТА — `npm run deploy` (бой) и `npm run deploy -- --stage` (стейдж).
 *
 * Существует потому, что 2026-08-15 агент трижды выкатил прод «руками» (`firebase deploy`) и
 * трижды не проверил результат под сессией. В бою оказалось приложение, которое не стартовало
 * вовсе, и нашёл это ВЛАДЕЛЕЦ, а не приборы. Его слова дословно: «**деплой без тестирования это
 * пердёж в лужу, а не работа**» и «**после каждого деплоя ты должен залогиниться в свой тестовый
 * аккаунт и пройти смоук тестирование**».
 *
 * Правило, записанное в документ, сессия нарушает — правило, встроенное в единственную дверь,
 * нарушить нечем (`AGENT_GUIDE.md` → «Журнал опыта»: убрать ловушку > страж > запись).
 *
 * ═══ ОДНА ДВЕРЬ, ПАРАМЕТР КОНТУРА (фаза 4 `plans/53`) ═══
 *
 * Вторая дверь для стейджа ЗАПРЕЩЕНА планом эпика, и причина не вкусовая: два набора проверок
 * разъезжаются через месяц, и тогда стейдж перестаёт проверять то, что уезжает в бой, — то есть
 * перестаёт быть предрелизным рубежом, оставаясь им на бумаге. Поэтому контур здесь — ПАРАМЕТР, а
 * порядок шагов один и тот же.
 *
 * Различия контуров ровно три, и каждое названо:
 *   · бой обновляет снимок витрины лендинга, стейдж — нет (снимок читает БОЕВЫЕ числа и является
 *     частью боевого артефакта; собирать его на стейдже значило бы получить ВТОРОЙ артефакт — П9);
 *   · у стейджа есть свой страж невидимости поиску (П6), у боя его быть не должно;
 *   · адрес, проект и конфигурация выката берутся из реестра контуров.
 *
 * ЧТО ДЕЛАЕТ ПО ПОРЯДКУ, останавливаясь на первой же неудаче:
 *   0. 🔑 СТОП-ПРАВИЛО КОНТУРА (П8): каждая команда выката обязана НАЗЫВАТЬ проект заявленного
 *      контура и не упоминать чужой. Проверяется ДО запуска и доказывается `--selftest`.
 *   1. правила и индексы Firestore — ПЕРВЫМ шагом (см. ниже, почему);
 *   2. `npm run build` — С ОЧИСТКОЙ (`prebuild`), иначе уезжает смесь сборок: старый чанк ищет
 *      свой `globalThis.__sveltekit_<хеш>`, не находит и роняет приложение (`bugs/124`);
 *   3. ПРОВЕРКА ЦЕЛОСТНОСТИ СБОРКИ до выката: во всей `build/` обязан быть РОВНО ОДИН хеш;
 *   4. выкат хостинга;
 *   5. 🔑 ЗАМЕР ПОПАДАНИЯ (П8): целевой контур отдаёт хеш ИМЕННО этой сборки, а соседний контур
 *      остался таким, каким был до выката, — то есть выстрела не туда не случилось;
 *   6. заголовки кеширования (`verify-prod-cache`);
 *   7. только стейдж: `verify-stage-noindex` — контур закрыт от роботов (П6);
 *   8. 🔑 `verify-prod-signed-in` — СМОУК ПОД СЕССИЕЙ: вход, все пять экранов, консоль;
 *   9. `verify-prod-b4` — публичный смоук гостем.
 *
 * Выход ненулевой, если упал любой шаг: «выкатил и не проверил» больше не является достижимым
 * состоянием.
 *
 * Запуск:
 *   npm run deploy                  — бой
 *   npm run deploy -- --stage       — стейдж
 *   npm run deploy -- --skip-build  — только выкат уже собранного (повтор)
 *   node tools/deploy.mjs --selftest — доказать стоп-правило контура, ничего не выкатывая
 */
import { execSync, spawn } from 'node:child_process';
import { appendFileSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONTOURS, contourFromArgv } from './lib/contours.mjs';

/** Расписка стейджа — свидетель того, что ЭТОТ код уже проехал предрелизный рубеж. */
const RECEIPT = '.kaif/stage-receipt.json';

/**
 * СТОП-ПРАВИЛО КОНТУРА (критерий П8) — ВЕСЬ вердикт одной функцией, чтобы самопроверка судила
 * ТЕМ ЖЕ кодом, что рабочий путь. Две копии правила разъехались бы, и самопроверка стала бы
 * зелёной ширмой (тот же приём, что в `.claude/hooks/deploy-guard.mjs`).
 *
 * Что оно ловит: команду выката, целящуюся не в тот контур, который дверь объявила. Самый
 * опасный исход двухконтурной схемы — выкат стейджевой правки в БОЙ по забытому флагу, и стоить
 * он будет ровно столько же, сколько стоил `bugs/124`.
 */
export function targetFits(contour, command) {
	const alien = Object.values(CONTOURS).find((item) => item.name !== contour.name);
	const namesOwn = new RegExp(`--project[\\s=]+${contour.project}\\b`).test(command);
	const namesAlien = new RegExp(`\\b${alien.project}\\b`).test(command);
	// Конфигурация обязательна ровно у того контура, у которого она есть: у боя `firebase.json`
	// подхватывается сам, и требовать `--config` значило бы требовать выдуманного флага.
	const configOk = contour.config === null
		? !/--config/.test(command)
		: new RegExp(`--config[\\s=]+${contour.config.replace('.', '\\.')}\\b`).test(command);
	return namesOwn && !namesAlien && configOk;
}

if (process.argv.includes('--selftest')) {
	const cases = [
		[CONTOURS.prod, 'firebase deploy --only hosting --project ndim-space', true, 'бой в бой'],
		[CONTOURS.prod, 'firebase deploy --only hosting --project ndim-stage', false, '🔴 бой целится в стейдж'],
		[CONTOURS.prod, 'firebase deploy --only hosting', false, 'бой без явного проекта'],
		[CONTOURS.stage, 'firebase deploy --config firebase.stage.json --project ndim-stage --only hosting', true, 'стейдж в стейдж'],
		[CONTOURS.stage, 'firebase deploy --project ndim-stage --only hosting', false, '🔴 стейдж без своего конфига (полез бы в боевую базу)'],
		[CONTOURS.stage, 'firebase deploy --config firebase.stage.json --project ndim-space --only hosting', false, '🔴 стейдж целится в бой'],
		[CONTOURS.prod, 'firebase deploy --config firebase.stage.json --project ndim-space --only hosting', false, '🔴 бой с чужим конфигом'],
		/*
		 * 🔑 СЛУЧАЙ, РАДИ КОТОРОГО СУЩЕСТВУЕТ ПРОВЕРКА ЧУЖОГО ИМЕНИ, и он найден мутацией: без него
		 * снятие `!namesAlien` оставляло самопроверку ЗЕЛЁНОЙ — то есть строка правила ничем не
		 * охранялась. Промах выглядит так: проект назван свой, а таргет хостинга — соседнего
		 * контура (`--only hosting:<сайт>`). Проверка «свой проект назван» его пропускает.
		 */
		[CONTOURS.prod, 'firebase deploy --only hosting:ndim-stage --project ndim-space', false, '🔴 проект боевой, а таргет хостинга — стейджевый сайт'],
	];
	let bad = 0;
	for (const [contour, command, mustPass, label] of cases) {
		const got = targetFits(contour, command);
		const good = got === mustPass;
		if (!good) bad += 1;
		console.log(`  ${good ? '✅' : '❌'} ${label}: ${got ? 'пропущено' : 'ОСТАНОВЛЕНО'}`);
	}
	console.log(`\nпроверок ${cases.length} · провалов ${bad}`);
	process.exit(bad === 0 ? 0 : 1);
}

const CONTOUR = contourFromArgv();
const skipBuild = process.argv.includes('--skip-build');

function run(title, command) {
	console.log(`\n══ ${title} ══\n$ ${command}`);
	try {
		execSync(command, { stdio: 'inherit' });
	} catch {
		console.error(`\n🔴 ШАГ ПРОВАЛЕН: ${title}. Выкат остановлен.`);
		process.exit(1);
	}
}

/** Выкат Firebase в НАЗВАННЫЙ контур: команда собирается из реестра и проверяется стоп-правилом. */
function firebase(title, only) {
	const parts = ['firebase', 'deploy'];
	if (CONTOUR.config !== null) parts.push('--config', CONTOUR.config);
	parts.push('--project', CONTOUR.project, '--only', only);
	const command = parts.join(' ');
	if (!targetFits(CONTOUR, command)) {
		console.error(`\n🔴 СТОП-ПРАВИЛО КОНТУРА (П8): команда не целится в «${CONTOUR.title}».\n   ${command}`);
		process.exit(1);
	}
	run(title, command);
}

/**
 * Целостность сборки: один хеш на всю папку.
 *
 * `globalThis.__sveltekit_<хеш>` объявляет HTML, а читают его чанки. Два разных хеша в одной
 * папке означают файлы от РАЗНЫХ сборок — ровно то, что уехало в бой 2026-08-15 и уронило
 * приложение у всех, кто открыл его свежим браузером.
 *
 * Возвращает единственный хеш — им же ниже судится, ТУДА ЛИ уехала сборка.
 */
function checkBuildIntegrity() {
	console.log('\n══ целостность сборки: один хеш на всю папку ══');
	const hashes = new Map();
	const walk = (dir) => {
		for (const name of readdirSync(dir)) {
			const path = join(dir, name);
			if (statSync(path).isDirectory()) {
				walk(path);
				continue;
			}
			if (!/\.(js|html)$/.test(name)) continue;
			const text = readFileSync(path, 'utf8');
			for (const found of text.matchAll(/__sveltekit_([a-z0-9]+)/g)) {
				const list = hashes.get(found[1]) ?? [];
				if (list.length < 3) list.push(path);
				hashes.set(found[1], list);
			}
		}
	};
	walk('build');

	if (hashes.size === 0) {
		console.error('🔴 в сборке нет ни одного `__sveltekit_<хеш>` — это не собранное приложение.');
		process.exit(1);
	}
	if (hashes.size > 1) {
		console.error(`🔴 В СБОРКЕ ${hashes.size} РАЗНЫХ ХЕША — это смесь сборок, выкатывать её нельзя (bugs/124):`);
		for (const [hash, files] of hashes) console.error(`   ${hash} → ${files.join(', ')}`);
		console.error('   Лечение: `npm run build` (он теперь чистит build/ сам) и повторить.');
		process.exit(1);
	}
	const hash = [...hashes.keys()][0];
	console.log(`✅ хеш один: ${hash}`);
	return hash;
}

/** Хеш рантайма, который контур отдаёт ЖИВЫМ людям прямо сейчас. `null` — не удалось прочитать. */
async function liveHash(site) {
	try {
		const response = await fetch(`${site}/ru`, { redirect: 'follow' });
		const html = await response.text();
		return html.match(/__sveltekit_([a-z0-9]+)/)?.[1] ?? null;
	} catch {
		return null;
	}
}

/*
 * 🔴 ПРАВИЛА ВЫКАТЫВАЕТ ДВЕРЬ, А НЕ РУКИ — И ПЕРВЫМ ШАГОМ (добавлено 2026-08-16, `plans/53` фаза 3).
 *
 * Дыра, вскрытая переездом на именованную базу: хук `deploy-guard` запрещает ЛЮБОЙ голый
 * `firebase deploy`, а дверь катила только хостинг — то есть выкатить правила в бой было НЕЧЕМ.
 * Пока правила совпадали с лежащими в бою, дыра ничего не стоила; в день, когда база сменила имя,
 * она стала блокирующей: у новой базы правила по умолчанию запрещают всё.
 *
 * ПОЧЕМУ ПЕРВЫМ, а не рядом с хостингом: следующий же шаг — снимок витрины лендинга — ЧИТАЕТ
 * боевую базу. С незакаченными правилами он упирается в отказ, и дверь падает на шаге, который
 * к правилам отношения не имеет.
 *
 * ⚠️ `--only firestore` ЦЕЛИКОМ, без подтаргета. При массивной форме `firestore` в `firebase.json`
 * команда `--only firestore:rules` завершается УСПЕХОМ и не катит НИЧЕГО (firebase-tools#10447) —
 * самый неприятный вид отказа: зелёный.
 */
console.log(`\n🎯 КОНТУР ВЫКАТА: ${CONTOUR.title} · проект ${CONTOUR.project} · база ${CONTOUR.database}\n   сайт ${CONTOUR.site}`);

/** Состояние репозитория: чем удостоверяется «это тот же код». */
function repoState() {
	const git = (command) => execSync(command, { encoding: 'utf8' }).trim();
	return { commit: git('git rev-parse HEAD'), dirty: git('git status --porcelain').length > 0 };
}

/*
 * 🔴 ЗАМОК ФАЗЫ 5: В БОЙ — ТОЛЬКО ЧЕРЕЗ СТЕЙДЖ (интервью №033, В5 = А).
 *
 * Решение принято словами «обязателен, МЕХАНИЗМОМ», и основание названо там же: «агент сам решит,
 * когда проверить» уже провалилось трижды подряд в ночь на 2026-08-15 (`bugs/124`). Правило,
 * которое можно забыть, здесь уже не работало — поэтому оно живёт в двери, а не в документе.
 *
 * ЧЕМ УДОСТОВЕРЯЕТСЯ «ТА ЖЕ СБОРКА». Не хешем рантайма: он рождается заново на каждой сборке, и
 * сравнение по нему запрещало бы выкат всегда. Удостоверяет КОММИТ: расписка стейджа несёт sha
 * HEAD и признак грязного дерева, а дверь боя требует совпадения и чистоты. Незакоммиченная
 * правка — это по определению код, которого на стейдже не было.
 *
 * ⚠️ ЧЕСТНАЯ ГРАНИЦА, названная вслух: бой собирается со свежим снимком витрины лендинга, а
 * стейдж — нет (П9). То есть на стейдже проверен тот же КОД с другим числом на витрине. Замок
 * стережёт код, а не число; притвориться, будто он стережёт байты, было бы враньём.
 */
/**
 * 🔑 ВОРОТА SMOKE (критерий К7 эпика `plans/54`) — набор гоняется ПО СОБРАННОМУ АРТЕФАКТУ ДО выката.
 *
 * ПОЧЕМУ ДО, А НЕ ПОСЛЕ. Смоук отвечает на вопрос «собрана ли сборка настолько, чтобы её вообще
 * тестировать». Ответ, полученный ПОСЛЕ выката, приходит к людям вместе со сломанной сборкой —
 * ровно это и случилось 2026-08-15 (`bugs/124`). Существующие боевые смоуки (`verify-prod-signed-in`,
 * `verify-prod-b4`) остаются на своих местах: они судят ЖИВОЙ контур после выката, а этот — артефакт
 * до него. Разные вопросы, оба нужны.
 *
 * ПОЧЕМУ НА LOCALHOST. Набор пишет в базу, ждёт цикла синхронизации и удаляет за собой — то есть
 * ему нужна база, в которую МОЖНО писать. На стенде это эмуляторы; писать этими шагами в бой
 * нельзя (они двигают NDim Space Rating живых объектов), а на стейдже у прибора нет доступа к
 * базе контура. Приём законен, потому что `isStand()` смотрит на hostname: собранный артефакт,
 * отданный с `localhost:4173`, работает против эмуляторов, оставаясь ТЕМ ЖЕ артефактом, который
 * уедет в контур.
 *
 * 🔴 ЭМУЛЯТОРЫ ОБЯЗАНЫ БЫТЬ ПОДНЯТЫ, и их отсутствие ОСТАНАВЛИВАЕТ выкат, а не пропускает шаг.
 * Ворота, которые тихо не срабатывают, хуже отсутствующих: они красят зелёным непроверенное.
 */
async function smokeGate(builtHash = null) {
	console.log('\n══ 🔑 ВОРОТА SMOKE по собранному артефакту (К7) ══');

	if (!existsSync('build')) {
		console.error('🔴 папки `build/` нет — нечего проверять. Соберите: `npm run build`.');
		process.exit(1);
	}

	const alive = async (port) => {
		try {
			await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1500) });
			return true;
		} catch {
			return false;
		}
	};
	if (!(await alive(8181)) || !(await alive(9099))) {
		console.error(
			'🔴 эмуляторы Firestore (8181) и Auth (9099) не отвечают, а набор Smoke без них не судит ' +
				'ни записи, ни входа.\n   Лечение: поднимите стенд `npm run stand` и повторите выкат.' +
				'\n   Пропустить этот шаг нечем — ворота, которые молчат, красят зелёным непроверенное.',
		);
		process.exit(1);
	}

	/*
	 * 🔴 ПОРТ 4173 ОБЯЗАН БЫТЬ СВОБОДЕН — иначе набор судит ЧУЖУЮ сборку.
	 *
	 * Капкан пойман на себе в день написания ворот. Осиротевший `vite preview` от предыдущего
	 * прогона держал 4173 и отдавал ПРЕЖНИЙ артефакт; новый с `--strictPort` не поднялся и тихо
	 * умер, а проверка «жив ли порт» ответила ДА — потому что отвечал старый. Набор выдал 13
	 * провалов подряд с 404 на чанках, и выглядело это как «сборка сломана целиком».
	 * Тот же класс уже описан у `verify-bug81`; здесь он закрыт двумя замками: порт проверяется
	 * ДО старта, а отданный артефакт сверяется с собранным ПО ХЕШУ.
	 */
	if (await alive(4173)) {
		console.error(
			'🔴 порт 4173 занят ДО старта — на нём ответит чужой сервер, и набор проверит не ту сборку.' +
				'\n   Найти: `Get-NetTCPConnection -LocalPort 4173 -State Listen`, погасить дерево от корневого pid.',
		);
		process.exit(1);
	}

	/*
	 * Хеш берётся ТЕМ ЖЕ прибором, что судит целостность: он обходит всю папку. В корневом
	 * `index.html` его нет вовсе — корень это распознаватель языка, а не приложение, и первая
	 * редакция ворот читала именно его, получала «не прочитано» и краснела на исправной сборке.
	 */
	const expected = builtHash ?? checkBuildIntegrity();

	const preview = spawn('npx', ['vite', 'preview', '--port', '4173', '--strictPort'], {
		stdio: 'ignore',
		shell: true,
	});
	/*
	 * 🔴 ВЫХОД ИЗ `try` ЧЕРЕЗ `process.exit` НЕ ДАЁТ ОТРАБОТАТЬ `finally` — и это тоже поймано на
	 * себе в день написания ворот. Красный набор ронял дверь немедленно, `vite preview` оставался
	 * сиротой на 4173, а СЛЕДУЮЩИЙ прогон судил по нему СТАРУЮ сборку. То есть первый же честный
	 * отказ ворот портил все последующие. Поэтому внутри — только исключения, а выход живёт ПОСЛЕ
	 * уборки.
	 */
	let problem = null;
	try {
		let up = false;
		for (let i = 0; i < 40 && !up; i++) {
			await new Promise((r) => setTimeout(r, 500));
			up = await alive(4173);
		}
		if (!up) throw new Error('`vite preview` не поднялся на 4173 за 20 с — артефакт отдать нечем.');

		// 🔑 Замер попадания в МАЛОМ: сервер обязан отдавать ИМЕННО собранное. Без этой строки
		// первый замок можно обойти любым сервером, успевшим занять порт после проверки.
		// Спрашиваем страницу ПРИЛОЖЕНИЯ: только она несёт `__sveltekit_<хеш>`.
		const servedHtml = await (await fetch('http://127.0.0.1:4173/profile')).text();
		const served = /__sveltekit_([a-z0-9]+)/i.exec(servedHtml)?.[1] ?? null;
		if (expected === null || served !== expected) {
			throw new Error(
				`на 4173 отдаётся НЕ та сборка: собрано ${expected ?? 'не прочитано'}, отдаётся ${served ?? 'не прочитано'}.` +
					'\n   Набор судил бы чужой артефакт и врал бы в обе стороны.',
			);
		}
		console.log(`  ✅ preview отдаёт собранный артефакт (${served})`);

		try {
			execSync('node tools/smoke.mjs --base http://localhost:4173', { stdio: 'inherit' });
		} catch {
			throw new Error('набор SMOKE красный — сборка до контура не доедет.');
		}
	} catch (e) {
		problem = e.message;
	} finally {
		// Гасим ПО ДЕРЕВУ: `spawn` с `shell: true` рождает посредника, и убийство одного pid
		// оставило бы сироту на порту (правило класса, `bugs/73`).
		try {
			execSync(`taskkill /PID ${preview.pid} /T /F`, { stdio: 'ignore' });
		} catch {
			// Уже умер — нормальный исход, а не ошибка.
		}
	}

	if (problem !== null) {
		console.error(`\n🔴 ВОРОТА SMOKE ЗАКРЫТЫ: ${problem}\n   Выкат остановлен.`);
		process.exit(1);
	}
}

function requireStagePass() {
	const now = repoState();
	const auth = process.argv.indexOf('--auth-owner');
	if (auth !== -1) {
		const words = process.argv[auth + 1];
		if (!words || words.startsWith('--')) {
			console.error('\n🔴 `--auth-owner` требует ДОСЛОВНЫХ слов владельца в кавычках. Без них замок не снимается.');
			process.exit(1);
		}
		console.log(`\n⚠️  ЗАМОК СТЕЙДЖА СНЯТ СЛОВОМ ВЛАДЕЛЬЦА: «${words}»`);
		console.log('   Это исключение, а не режим работы: оно ОДНОРАЗОВО и записывается в журнал.');
		/*
		 * 🔑 ОБХОД НЕ ВЫПИСЫВАЕТ РАСПИСКУ, и это поймано на себе: первая редакция писала обычную
		 * расписку, то есть одно слово владельца открывало дверь и ВСЕМ ПОСЛЕДУЮЩИМ выкатам того же
		 * коммита. Исключение, которое действует дальше одного раза, — это уже не исключение, а
		 * молчаливая отмена правила. Журнал — отдельный файл, и дверь его никогда не читает.
		 */
		appendFileSync(
			'.kaif/stage-bypass.log',
			`${new Date().toISOString()}\t${now.commit}\tdirty=${now.dirty}\t${words}\n`,
		);
		return;
	}

	const remedy =
		'\n   Лечение: `npm run deploy -- --stage`, затем повторить выкат в бой.' +
		'\n   Исключение — только словом владельца: `npm run deploy -- --auth-owner "<его слова>"`.';

	if (!existsSync(RECEIPT)) {
		console.error(`\n🔴 ЗАМОК: расписки стейджа нет (${RECEIPT}). Эта сборка не проходила предрелизный рубеж.${remedy}`);
		process.exit(1);
	}
	const receipt = JSON.parse(readFileSync(RECEIPT, 'utf8'));
	// Пояс поверх подтяжек: расписка со следом обхода не считается пропуском ни при каких условиях.
	if (receipt.bypass) {
		console.error(`\n🔴 ЗАМОК: расписка несёт след обхода («${receipt.bypass}») — пропуском она не является.${remedy}`);
		process.exit(1);
	}
	if (receipt.commit !== now.commit) {
		console.error(
			`\n🔴 ЗАМОК: на стейдже проверялся ДРУГОЙ коммит.` +
				`\n   стейдж: ${String(receipt.commit).slice(0, 8)} (${receipt.at})\n   сейчас: ${now.commit.slice(0, 8)}${remedy}`,
		);
		process.exit(1);
	}
	if (now.dirty || receipt.dirty) {
		console.error(
			'\n🔴 ЗАМОК: в дереве есть незакоммиченные правки — значит в бой поедет код, которого на стейдже не было.' +
				`\n   грязно сейчас: ${now.dirty} · было грязно при прогоне стейджа: ${receipt.dirty}${remedy}`,
		);
		process.exit(1);
	}
	console.log(`\n🔓 ЗАМОК СТЕЙДЖА ОТКРЫТ: коммит ${now.commit.slice(0, 8)} проверен на стейдже ${receipt.at}`);
}

if (CONTOUR.name === 'prod') requireStagePass();

/*
 * `--gate-only` — спросить замок, ничего не выкатывая. Существует по двум причинам: так замок
 * проверяется мутациями (иначе каждая проверка стоила бы выката в бой), и так сессия может узнать
 * «пустят ли меня» ДО того, как начнёт собирать.
 */
if (process.argv.includes('--gate-only')) {
	/*
	 * Ворота Smoke опрашиваются и здесь — по УЖЕ СОБРАННОЙ `build/`, без пересборки. Так они
	 * доказываются мутацией, не стоя выката (тот же приём, что у замка стейджа), и так сессия
	 * может спросить «пустят ли меня» до того, как начнёт собирать.
	 */
	await smokeGate();
	console.log('\n(--gate-only: замок и ворота Smoke опрошены, выкат не запускался)');
	process.exit(0);
}

// Снимок соседнего контура ДО выката: им доказывается, что мы в него не выстрелили (П8).
const alien = Object.values(CONTOURS).find((item) => item.name !== CONTOUR.name);
const alienBefore = await liveHash(alien.site);
console.log(`   соседний контур (${alien.title}) до выката: ${alienBefore ?? 'не прочитан'}`);

/*
 * Контуры обязаны совпадать там, где они изображают друг друга (`bugs/133`): прогон по стейджу,
 * отвечающему иначе, чем бой, ничего не репетирует. Проверка статическая и стоит миллисекунды,
 * поэтому стоит ДО выката, а не после — расхождение ловится прежде, чем уедет.
 */
run('контуры совпадают там, где обязаны (bugs/133)', 'node tools/verify-contour-parity.mjs');

firebase('правила и индексы Firestore', 'firestore');

if (!skipBuild) {
	/*
	 * Снимок витрины — только для боя. Он читает БОЕВЫЕ числа и порождает файл исходника; собрав
	 * его под стейдж, мы получили бы второй продакшен-артефакт, а критерий П9 требует одного.
	 */
	if (CONTOUR.name === 'prod') {
		run('снимок витрины лендинга (число стареет)', 'node tools/snapshot-landing-metric.mjs');
	} else {
		console.log('\n══ снимок витрины лендинга ══\n⏭  пропущен: витрина боевая, и её слепок — часть БОЕВОГО артефакта (П9).');
	}
	run('сборка НАЧИСТО', 'npm run build');
}
const builtHash = checkBuildIntegrity();

// 🔑 К7: набор Smoke судит АРТЕФАКТ до выката. Красный набор останавливает дверь здесь — то есть
// сломанная сборка до контура не доезжает вовсе.
await smokeGate(builtHash);

firebase(`выкат в ${CONTOUR.title}`, 'hosting');

/*
 * 🔑 ЗАМЕР ПОПАДАНИЯ (П8) — «контур цели совпал с заявленным» перестаёт быть намерением и
 * становится числом. Проверяется ПАРА, и без второй половины первая ничего не стоит:
 *   · целевой контур отдаёт ИМЕННО эту сборку — значит выкат дошёл;
 *   · соседний контур остался тем, чем был, — значит выстрела не туда не случилось.
 * Сравнение с «до», а не с «не равно нашему хешу»: одну и ту же сборку законно выкатить в оба
 * контура подряд, и жёсткое неравенство краснело бы на исправной работе.
 */
console.log('\n══ 🔑 замер попадания в контур (П8) ══');
const targetAfter = await liveHash(CONTOUR.site);
const alienAfter = await liveHash(alien.site);
console.log(`  цель  ${CONTOUR.title}: сборка ${builtHash} · сайт отдаёт ${targetAfter ?? 'не прочитан'}`);
console.log(`  сосед ${alien.title}: было ${alienBefore ?? 'не прочитан'} · стало ${alienAfter ?? 'не прочитан'}`);
if (targetAfter !== builtHash) {
	console.error(`\n🔴 ${CONTOUR.title} отдаёт НЕ ту сборку, которую мы собрали. Выкат не дошёл до цели.`);
	process.exit(1);
}
if (alienBefore !== null && alienAfter !== alienBefore) {
	console.error(`\n🔴 СОСЕДНИЙ КОНТУР (${alien.title}) ИЗМЕНИЛСЯ — выкат ушёл не туда. Это авария класса П8.`);
	process.exit(1);
}
console.log('  ✅ сборка легла в заявленный контур, соседний не тронут');

run('заголовки кеширования (bugs/124)', `node tools/verify-prod-cache.mjs --base ${CONTOUR.site}`);
/*
 * Переадресации проверяются В ЖИВОМ контуре, хотя `verify-contour-parity` уже сверил конфигурации.
 * Это не дубль: там сверяются НАМЕРЕНИЯ (два файла), здесь — ПОВЕДЕНИЕ (что реально отдаёт хостинг).
 * `bugs/133` жил ровно в промежутке между ними — конфигурация стейджа была честной сама по себе,
 * а вести себя как бой контур не мог.
 */
run('переадресации живы (bugs/133)', `node tools/verify-prod-lang-redirects.mjs --base ${CONTOUR.site}`);
if (CONTOUR.name === 'stage') {
	run('стейдж закрыт от роботов (П6)', 'node tools/verify-stage-noindex.mjs');
}
run('🔑 СМОУК ПОД СЕССИЕЙ — вход и все экраны', `node tools/verify-prod-signed-in.mjs --base ${CONTOUR.site}`);
run('публичный смоук гостем', `node tools/verify-prod-b4.mjs --base ${CONTOUR.site}`);

/*
 * РАСПИСКА СТЕЙДЖА пишется ТОЛЬКО здесь — то есть только после того, как все проверки прошли:
 * дверь выходит ненулевым кодом на первой же неудаче и до этой строки не доживает. Расписка,
 * выписанная авансом, открывала бы дверь в бой для сборки, которая на стейдже упала.
 */
if (CONTOUR.name === 'stage') {
	const state = repoState();
	writeFileSync(RECEIPT, JSON.stringify({ ...state, hash: builtHash, at: new Date().toISOString() }, null, '\t'));
	console.log(`\n🧾 расписка стейджа выписана: коммит ${state.commit.slice(0, 8)}${state.dirty ? ' ⚠️ дерево ГРЯЗНОЕ — дверь в бой её не примет' : ''}`);
}

console.log(`\n✅ ВЫКАТ В ${CONTOUR.title} ЗАВЕРШЁН И ПРОВЕРЕН: сборка целая, легла в свой контур, заголовки верны, приложение работает под сессией.`);
