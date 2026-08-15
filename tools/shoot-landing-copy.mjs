/**
 * ПРИЁМКА ВЫНОСА ТЕКСТОВ ВИТРИНЫ В КОНТЕНТ-МОДУЛЬ — `plans/29` §4, фаза 2 эпика `plans/21`.
 *
 * Канон проекта (вердикт владельца 2026-07-16, `plans/06`): «тесты зелёные» ≠ готово. Путь
 * человека прогоняется настоящим браузером, в ОБЕИХ темах и на ДВУХ ширинах, со скриншотами.
 * Ничего не утверждает — это ПРИБОР; проверки живут в стражах.
 *
 * 🔑 Что здесь важно увидеть ГЛАЗАМИ, а не в диффе. Правка была объявлена «переносом строк без
 * изменения композиции» — и ровно такие правки ломают вёрстку тише всего: английский
 * подзаголовок стал длиннее на два слова, а надзаголовок сменился с `New Dimension Friendships`
 * на `New Dimension Connections` (`plans/51` В2 = Б). Обе строки стоят в первом экране, где
 * перенос строки виден сразу.
 *
 * Снимается по четыре кадра на язык: 390 и 1440 × светлая и тёмная.
 *
 * Запуск (сначала подними собранный сайт):
 *   npx vite preview --port 4173 --strictPort   # в отдельном окне
 *   node tools/shoot-landing-copy.mjs
 *
 * 🔴 Капкан, стоивший 21 ложного падения (`STATUS.md`): без `--strictPort` preview уезжает на
 * 4174, а прибор судит ЧУЖОЙ сервер — чаще всего старую сборку.
 */
import { chromium } from '@playwright/test';
import { mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const BASE = process.env.NDIM_BASE ?? 'http://localhost:4173';
const OUT = resolve('test-results', 'landing-copy');

const SHOTS = [
	{ lang: 'ru', w: 390, h: 844 },
	{ lang: 'ru', w: 1440, h: 900 },
	{ lang: 'en', w: 390, h: 844 },
	{ lang: 'en', w: 1440, h: 900 },
];

const run = async () => {
	await rm(OUT, { recursive: true, force: true });
	await mkdir(OUT, { recursive: true });

	const browser = await chromium.launch();
	let shots = 0;
	let failures = 0;

	for (const theme of ['light', 'dark']) {
		for (const { lang, w, h } of SHOTS) {
			const ctx = await browser.newContext({
				viewport: { width: w, height: h },
				deviceScaleFactor: 2,
			});
			const page = await ctx.newPage();

			/*
			 * 🔴 ТЕМУ СТАВИМ ТАК, КАК ЕЁ СТАВИТ ПРОДУКТ, а не через `colorScheme` контекста.
			 *
			 * Первая редакция прибора передавала Playwright `colorScheme: 'dark'` — и получала
			 * СВЕТЛЫЕ кадры под именем `-dark.png`. Лендинг системную тему не слушает: инлайн-скрипт
			 * `src/app.html:35` читает `localStorage['ndim-theme']` с умолчанием `light` (светлая
			 * «Бумага» — решение владельца). То есть прибор объявлял, что снял обе темы, и снимал
			 * одну — ровно тот класс, за который проект уже платил (`EXP-0155`: страж мерил не то,
			 * что объявлял, и я ему поверил).
			 *
			 * `addInitScript` кладёт ключ ДО первого скрипта страницы, иначе щит успевает прочитать
			 * пустое хранилище и поставить светлую.
			 */
			await page.addInitScript((t) => {
				try {
					localStorage.setItem('ndim-theme', t);
				} catch {
					/* приватный режим — пусть остаётся умолчание, кадр это покажет */
				}
			}, theme);

			// Консоль собираем поимённо: молчаливая ошибка на витрине — это дефект, а не мелочь.
			const errors = [];
			page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
			page.on('pageerror', (e) => errors.push(String(e)));

			await page.goto(`${BASE}/${lang}`, { waitUntil: 'networkidle' });
			// Загрузочный щит уезжает анимацией — ждём, пока витрина действительно открыта.
			await page.waitForTimeout(1200);

			// Проверяем, что тема ДЕЙСТВИТЕЛЬНО применилась, а не только запрошена. Кадр с чужим
			// именем хуже отсутствующего кадра: он врёт молча и попадает в отчёт как доказательство.
			const applied = await page.evaluate(
				() =>
					document.documentElement.dataset.theme ??
					document.documentElement.getAttribute('data-theme') ??
					(document.documentElement.classList.contains('dark') ? 'dark' : 'light'),
			);
			if (applied !== theme) {
				console.log(`        🔴 ТЕМА НЕ ПРИМЕНИЛАСЬ: просили ${theme}, на странице ${applied}`);
				failures += 1;
			}

			const name = `landing-${lang}-${w}-${theme}.png`;
			await page.screenshot({ path: resolve(OUT, name), fullPage: false });
			shots += 1;

			// Первый экран — то, что человек видит до прокрутки. Читаем ровно те строки, что правились.
			// 🔴 Селекторы КЛАССОВЫЕ, а не порядковые: первая редакция прибора брала `p` первым
			// попавшимся и печатала надзаголовок в обеих строках — прибор врал, показывая одно
			// значение дважды. Порядковый селектор на живой вёрстке не доказывает ничего.
			const read = async (sel) =>
				(await page.locator(sel).first().textContent().catch(() => ''))?.trim() ?? '';
			const eyebrow = await read('p.eyebrow');
			const sub = await read('p.sub');

			console.log(`  ${theme.padEnd(5)} ${lang} ${String(w).padStart(4)} → ${name}`);
			console.log(`        надзаголовок: ${eyebrow || '— НЕ НАЙДЕН'}`);
			console.log(`        подзаголовок: ${sub ? sub.slice(0, 100) + '…' : '— НЕ НАЙДЕН'}`);
			// Отказ соединения к 127.0.0.1:8181 — это эмулятор Firestore при погашенном стенде
			// (воронка пишет `landing_view`). Витрины он не касается, но печатаем адресом, а не
			// общим словом: «ошибка в консоли» без адреса — это повод не смотреть.
			if (errors.length) {
				const uniq = [...new Set(errors)];
				console.log(`        консоль: ${errors.length} (уникальных ${uniq.length}) — ${uniq[0].slice(0, 90)}`);
			}

			await ctx.close();
		}
	}

	await browser.close();
	console.log(`\nКадров снято: ${shots} → ${OUT}`);
	if (failures) {
		console.log(`🔴 КАДРОВ С ЧУЖОЙ ТЕМОЙ: ${failures}. Чини ПРИБОР, а не продукт.`);
		process.exitCode = 1;
	} else {
		console.log('✅ на каждом кадре тема совпала с запрошенной');
	}
};

run().catch((e) => {
	console.error(e);
	process.exit(1);
});
