import { basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { test, expect, type Page, type Request } from '@playwright/test';

import { portsFor, slotOf } from '../tools/lib/stand-slot.mjs';

// @covers NDIM-PUBLIC-014 NDIM-PUBLIC-015
//
// СЧЁТ ПРИХОДА НА ГЛАВНУЮ — живой браузер по СОБРАННОМУ артефакту ПОД БОЕВЫМ ИМЕНЕМ ХОСТА
// (`bugs/NEW_funnel_blind_on_v5_root.md`; решение владельца №078 В1 = Г — только PostHog, без Firestore).
//
// 🔑 ПОЧЕМУ ПОДМЕНЯЕТСЯ ИМЯ, А НЕ СПИСОК ХОСТОВ (`TESTING_FRAMEWORK.md` → «контур, где фича
// молчит по построению, — это КОНТРОЛЬ»). Счёт открыт только на боевых и стейджевых именах; на
// `localhost` он молчит, и молчание — готовый отрицательный контроль, но НЕ проверка.
// Положительная половина: браузер открывает `http://ndimspace.app/`, а байты страницы приезжают
// с локального `vite preview` — перехват маршрута переписывает адрес запроса на localhost и
// отдаёт ответ как есть. Список хостов остаётся байт-в-байт тем, который уезжает; меняется
// только то, кто отвечает по имени. Исходящее к PostHog перехватывается и наружу не
// выпускается; всё прочее чужое — режется, чтобы прогон был герметичным.
//
// ⚠️ Первая редакция подменяла разрешение имени флагом Chromium `--host-resolver-rules` (приём
// набора «Аналитика»). Он честно довёл запрос до preview под боевым именем — и preview отказал:
// «Blocked request. This host ("ndimspace.app") is not allowed… add to `preview.allowedHosts`».
// Править конфиг продукта ради прибора — значит судить мутированный продукт; перехват маршрута
// живёт в приборе и продукта не касается.
//
// ⚠️ Оба проекта конфига (mobile · desktop) гоняют файл целиком — это намеренно: строка
// одна, но страница на двух ширинах разная, и «без единого файла кода» проверяется на обеих.

const SLOT = basename(dirname(dirname(fileURLToPath(import.meta.url))));
const PREVIEW = portsFor(slotOf(SLOT).slot).preview;
const PROD = 'ndimspace.app';
const STAGE = 'ndim-stage.web.app';
const CAPTURE = /\/i\/v0\/e\/?(\?|$)/u;

/*
 * 🔴 ПРИБОР ПРИХОДИТ ЧЕЛОВЕКОМ. Строка корня отсеивает роботов тем же признаком, что SDK PostHog
 * (`navigator.webdriver` · user agent · `userAgentData.brands`), а Playwright по умолчанию — робот
 * по всем трём («HeadlessChrome» в brands даже при подменённом user agent). Найдено прогулкой по
 * стейджу 2026-09-12: SDK честно молчал на прибор, и события лендинга «не доезжали». Поэтому
 * позитивные кейсы снимают все три признака, а робот остаётся ОТДЕЛЬНЫМ негативным кейсом.
 */
const HUMAN_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
test.use({
	userAgent: HUMAN_UA,
	launchOptions: { args: ['--disable-blink-features=AutomationControlled'] },
});
async function asHuman(page: Page): Promise<void> {
	await page.addInitScript(() => {
		try {
			Object.defineProperty(navigator, 'userAgentData', { get: () => undefined });
		} catch {}
	});
}

/**
 * Герметизирует страницу: наш хост под боевым/стейджевым именем — байты с localhost, PostHog —
 * заглушка с записью, остальное — отказ.
 */
async function seal(page: Page): Promise<Request[]> {
	const captured: Request[] = [];
	await page.route('**/*', async (route) => {
		const url = new URL(route.request().url());
		if (url.hostname === PROD || url.hostname === STAGE) {
			const local = new URL(url.pathname + url.search, `http://localhost:${PREVIEW}`);
			const response = await route.fetch({ url: local.toString() });
			return route.fulfill({ response });
		}
		if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return route.continue();
		if (url.hostname.endsWith('posthog.com')) {
			if (CAPTURE.test(url.pathname)) captured.push(route.request());
			return route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":"Ok"}' });
		}
		return route.abort();
	});
	return captured;
}

/** Даёт строке время выстрелить: она синхронная, но `fetch` идёт после разбора head. */
async function settle(page: Page): Promise<void> {
	await page.waitForLoadState('load');
	await page.waitForTimeout(400);
}

test('🔴 бой: свежий человек на главной даёт ровно одно landing_view, страница остаётся без файлов кода', async ({ page }) => {
	const captured = await seal(page);
	await asHuman(page);
	await page.goto(`http://${PROD}/`);
	await settle(page);
	// Контроль прибора: страница действительно наша и действительно под боевым именем.
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('NDim Space');
	expect(await page.evaluate(() => location.hostname)).toBe(PROD);
	// Главная — единственная страница продукта без единого файла кода (замер №078: кода 0).
	await expect(page.locator('script[src]')).toHaveCount(0);

	expect(captured, 'ровно одна отправка в PostHog').toHaveLength(1);
	const [req] = captured;
	expect(req.method()).toBe('POST');
	const body = JSON.parse(req.postData() ?? '{}') as { api_key: string; event: string; distinct_id: string; properties: Record<string, unknown> };
	expect(body.event).toBe('landing_view');
	expect(body.api_key).toMatch(/^phc_/u);
	expect(body.distinct_id.length).toBeGreaterThan(0);
	expect(body.properties.env).toBe('prod');
	expect(body.properties.$process_person_profile).toBe(false);
	expect(body.properties.$current_url).toBe(`http://${PROD}/`);
	// Предмету оценки взяться неоткуда: ни одного ключа, кроме объявленных.
	expect(Object.keys(body.properties).sort()).toEqual(['$current_url', '$host', '$lib', '$pathname', '$process_person_profile', 'env']);
});

test('стейдж: то же событие несёт env = stage', async ({ page }) => {
	const captured = await seal(page);
	await asHuman(page);
	await page.goto(`http://${STAGE}/`);
	await settle(page);
	expect(captured).toHaveLength(1);
	expect((JSON.parse(captured[0].postData() ?? '{}') as { properties: { env: string } }).properties.env).toBe('stage');
});

test('🔴 маркер сессии: вошедший и гость не считаются, а уводятся внутрь', async ({ page }) => {
	const captured = await seal(page);
	await asHuman(page);
	await page.addInitScript(() => {
		try {
			localStorage.setItem('ndim-session', '1');
		} catch {}
	});
	await page.goto(`http://${PROD}/`);
	await page.waitForURL(/\/profile(\?|$)/u, { timeout: 10000 });
	await page.waitForTimeout(400);
	expect(captured, 'с маркером сессии главная не считает никого').toHaveLength(0);
});

test('🔴 метка прибора: наш прогон человеком не считается', async ({ page }) => {
	const captured = await seal(page);
	await asHuman(page);
	await page.addInitScript(() => {
		try {
			sessionStorage.setItem('ndim-probe', '1');
		} catch {}
	});
	await page.goto(`http://${PROD}/`);
	await settle(page);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('NDim Space');
	expect(captured).toHaveLength(0);
});

test('ссылка из письма уходит в профиль и приходом не считается', async ({ page }) => {
	const captured = await seal(page);
	await asHuman(page);
	await page.goto(`http://${PROD}/?mode=signIn&oobCode=abc123&apiKey=demo`);
	await page.waitForURL(/\/profile\?mode=signIn&oobCode=abc123&apiKey=demo/u, { timeout: 10000 });
	await page.waitForTimeout(400);
	expect(captured).toHaveLength(0);
});

test('контроль: та же сборка под localhost не отправляет ничего', async ({ page }) => {
	const captured = await seal(page);
	await asHuman(page);
	await page.goto(`http://localhost:${PREVIEW}/`);
	await settle(page);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('NDim Space');
	expect(captured).toHaveLength(0);
});

test('🔴 робот (Playwright как есть: webdriver и HeadlessChrome в brands) не считается — тот же признак, что у SDK', async ({ browser }) => {
	// Отдельный контекст БЕЗ маскировки: голый headless Chromium несёт «HeadlessChrome» в user agent
	// (флаг запуска общий на файл, поэтому webdriver здесь снят — хватает и user agent). Считаться
	// он не должен — тот же признак, что у SDK.
	// Фикстура `browser` подмешивает user agent из `test.use` даже в ручной контекст — поэтому робот
	// называется явно тем же user agent, который несёт голый headless Chromium.
	const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/140.0.0.0 Safari/537.36' });
	const page = await context.newPage();
	const captured = await seal(page);
	const signs = { webdriver: false, brands: '', ua: '' };
	await page.goto(`http://${PROD}/`);
	await settle(page);
	Object.assign(signs, await page.evaluate(() => ({ webdriver: navigator.webdriver, ua: navigator.userAgent, brands: JSON.stringify((navigator as unknown as { userAgentData?: { brands: unknown[] } }).userAgentData?.brands ?? null) })));
	// Контроль прибора: признаки робота действительно на месте, иначе ноль был бы бессодержательным.
	expect(signs.webdriver || /headless/iu.test(signs.brands) || /headless/iu.test(signs.ua), `признаков робота нет: ${JSON.stringify(signs)}`).toBe(true);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('NDim Space');
	expect(captured, 'робот в приход не попадает').toHaveLength(0);
	await context.close();
});
