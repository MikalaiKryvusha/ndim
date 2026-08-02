/**
 * СТРАЖ `bugs/110` — контур вычитки больше не съедает ответы владельца молча.
 *
 * Дефект пришёл вестью из соседнего проекта Unliminium: владелец писал ответы больше часа,
 * нажал «Сохранить» и получил вечное «Записываю…» без единого слова об ошибке. Три причины
 * порознь терпимые, вместе смертельные:
 *   1. таймаут убивал СЕРВЕР, а вкладка об этом не знала;
 *   2. клиентский `fetch` не был обёрнут в try/catch → кнопка навсегда `disabled`;
 *   3. черновик нигде не хранился → ответы жили только в DOM.
 *
 * Здесь каждая из трёх проверяется ОТДЕЛЬНО и НАСТОЯЩИМ браузером — «тесты зелёные» тут не
 * доказательство: весь дефект в том, как ведёт себя живая страница у мёртвого сервера.
 *
 * 🔑 Контроль прибора (EXP-0082): прогон СНАЧАЛА доказывает, что при живом сервере сохранение
 * работает и черновик стирается. Без этого «ошибка показана» красилось бы зелёным даже там,
 * где страница сломана целиком.
 *
 * Запуск: node tools/verify-bug110.mjs      (стенд НЕ нужен — контур автономен)
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const FIXTURE = join(ROOT, 'interviews', 'interview_999_bug110_fixture.md');
const SHOTS = join(ROOT, 'test-results', 'bug110');

/** Время тишины, после которого сервер вправе уйти. Дробное значение — минуты. */
const IDLE_MIN = 0.5; // 30 секунд
const PORT = 47311;

let passed = 0;
let failed = 0;
const check = (ok, what) => {
	if (ok) { passed++; console.log(`  ✅ ${what}`); }
	else { failed++; console.log(`  ❌ ${what}`); }
};
const head = (t) => console.log(`\n— ${t} —`);

const FIXTURE_MD = `# Интервью №999 — фикстура стража bugs/100

> **Статус:** 🔴 ЖДЁТ ОТВЕТОВ ВЛАДЕЛЬЦА (техническая фикстура, удаляется прогоном).

### В1. Первый вопрос фикстуры?

- **А) Первый вариант** — раз.
- **Б) Второй вариант** — два.
- **В) Третий вариант** — три.
- **Г) свой ответ** —

**Ответ:**
`;

function startPage() {
	const child = spawn(
		process.execPath,
		[join(ROOT, 'tools', 'review.mjs'), 'open', 'interviews/interview_999_bug110_fixture.md',
			'--no-open', '--no-signal', '--port', String(PORT), '--timeout', String(IDLE_MIN)],
		{ cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
	);
	child.stdout.setEncoding('utf8');
	return new Promise((resolve, reject) => {
		let out = '';
		const timer = setTimeout(() => reject(new Error('страница не поднялась за 20 с')), 20_000);
		child.stdout.on('data', (chunk) => {
			out += chunk;
			const m = out.match(/http:\/\/127\.0\.0\.1:(\d+)/);
			if (m) { clearTimeout(timer); resolve({ child, url: m[0] }); }
		});
		child.on('exit', () => { clearTimeout(timer); reject(new Error('процесс страницы умер на старте')); });
	});
}

const alive = (child) => child.exitCode === null && !child.killed;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

mkdirSync(SHOTS, { recursive: true });
writeFileSync(FIXTURE, FIXTURE_MD, 'utf8');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

try {
	// ── 1. КОНТРОЛЬ ПРИБОРА: при живом сервере всё работает ────────────────────
	head('1. контроль прибора: живой сервер, сохранение проходит');
	let { child, url } = await startPage();
	await page.goto(url);
	await page.locator('[data-q] input[type=radio][value="Б"]').first().check();

	const draftAfterInput = await page.evaluate(() =>
		localStorage.getItem('ndim-review-draft:' + document.body.dataset.doc));
	check(Boolean(draftAfterInput) && draftAfterInput.includes('"Б"'),
		'ДЕФЕКТ 3: черновик лёг в браузер сразу после отметки');

	await page.locator('#save').click();
	await page.waitForFunction(() => document.body.innerText.includes('Записано'), null, { timeout: 10_000 });
	check(true, 'контроль: при живом сервере ответ записывается');
	const draftAfterSave = await page.evaluate(() =>
		localStorage.getItem('ndim-review-draft:' + document.body.dataset.doc));
	check(draftAfterSave === null, 'черновик стёрт после успешной записи');
	await page.screenshot({ path: join(SHOTS, '1-control-saved.png') });
	try { child.kill(); } catch {}

	// ── 2. ДЕФЕКТ 2: мёртвый сервер — страница говорит правду, а не «Записываю…» ─
	head('2. дефект 2: сервер умер, владелец жмёт «Сохранить»');
	writeFileSync(FIXTURE, FIXTURE_MD, 'utf8'); // вернуть фикстуре пустой ответ
	({ child, url } = await startPage());
	await page.goto(url);
	await page.evaluate(() => localStorage.clear());
	await page.locator('[data-q] input[type=radio][value="В"]').first().check();
	await page.locator('[data-q] [data-comment]').first().fill('Мой длинный комментарий, который жалко потерять.');

	child.kill('SIGKILL');
	await sleep(700);

	await page.locator('#save').click();
	await page.waitForFunction(() => document.body.innerText.includes('НЕ ЗАПИСАНО'), null, { timeout: 10_000 })
		.then(() => check(true, 'ДЕФЕКТ 2: страница честно говорит «НЕ ЗАПИСАНО», а не «Записываю…»'))
		.catch(() => check(false, 'ДЕФЕКТ 2: страница честно говорит «НЕ ЗАПИСАНО», а не «Записываю…»'));

	check(!(await page.locator('#save').isDisabled()), 'ДЕФЕКТ 2: кнопка «Сохранить» снова активна');
	const shown = await page.locator('.wrap textarea[readonly]').first().inputValue().catch(() => '');
	check(shown.includes('Мой длинный комментарий'),
		'ДЕФЕКТ 2: текст ответа выложен на страницу — есть что скопировать');
	await page.screenshot({ path: join(SHOTS, '2-server-dead.png') });

	// ── 3. ДЕФЕКТ 3: черновик переживает смерть сервера и возвращается ──────────
	head('3. дефект 3: черновик переживает перезапуск');
	({ child, url } = await startPage());
	await page.goto(url);
	await page.waitForFunction(() => document.body.innerText.includes('Восстановлен черновик'), null, { timeout: 10_000 })
		.then(() => check(true, 'ДЕФЕКТ 3: страница сама сообщила о восстановлении черновика'))
		.catch(() => check(false, 'ДЕФЕКТ 3: страница сама сообщила о восстановлении черновика'));
	check(await page.locator('[data-q] input[type=radio][value="В"]').first().isChecked(),
		'ДЕФЕКТ 3: выбранный вариант вернулся на место');
	check((await page.locator('[data-q] [data-comment]').first().inputValue()).includes('жалко потерять'),
		'ДЕФЕКТ 3: написанный текст вернулся на место');
	await page.screenshot({ path: join(SHOTS, '3-draft-restored.png') });

	// ── 4. ДЕФЕКТ 1: открытая вкладка не даёт серверу уйти по часам ────────────
	head(`4. дефект 1: вкладка открыта дольше времени тишины (${IDLE_MIN * 60} с)`);
	const waitMs = IDLE_MIN * 60_000 + 25_000;
	console.log(`  … держу вкладку открытой ${Math.round(waitMs / 1000)} с`);
	await sleep(waitMs);
	check(alive(child), 'ДЕФЕКТ 1: сервер ЖИВ — сердцебиение открытой вкладки его удержало');

	// И обратная половина: закрытая вкладка сервер не держит.
	head('5. обратная половина: закрытая вкладка сервер НЕ держит');
	await page.goto('about:blank');
	const died = await Promise.race([
		new Promise((r) => child.on('exit', () => r(true))),
		sleep(IDLE_MIN * 60_000 + 30_000).then(() => false),
	]);
	check(died, 'сервер ушёл сам, когда страницу закрыли — часы всё ещё работают');
	try { child.kill(); } catch {}
} finally {
	await browser.close();
	if (existsSync(FIXTURE)) rmSync(FIXTURE);
	// След убран — правило класса bugs/103.
	const decisions = join(ROOT, 'interviews', 'decisions');
	const dec = join(decisions, 'interview_999_bug110_fixture.decision.json');
	if (existsSync(dec)) rmSync(dec);
	// 🔴 Архив — тоже наш след. Первая редакция стража его не убирала, и после четырёх прогонов
	// в `interviews/decisions/archive/` осталось четыре записи фикстуры (правило класса bugs/103:
	// база и артефакты общие, страж обязан возвращать их в исходное состояние).
	const arch = join(decisions, 'archive');
	if (existsSync(arch)) {
		for (const name of readdirSync(arch)) {
			if (name.startsWith('interview_999_bug110_fixture')) rmSync(join(arch, name));
		}
	}
}

check(!existsSync(FIXTURE), 'след убран: фикстура удалена');
check(
	readdirSync(join(ROOT, 'interviews', 'decisions', 'archive')).every(
		(n) => !n.startsWith('interview_999_bug110_fixture'),
	),
	'след убран: архивных записей фикстуры нет',
);

console.log(`\n${failed === 0 ? '✅' : '🔴'} ИТОГ: ${passed} прошло, ${failed} провалов`);
console.log(`Кадры: ${SHOTS}`);
process.exit(failed === 0 ? 0 : 1);
