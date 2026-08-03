import { defineConfig } from '@playwright/test';

// E2E-стенд NDim Space (Playwright). Философия: тестируем ПРОДАКШЕН-артефакт,
// а не dev-сервер — webServer сначала собирает сайт (adapter-static + пререндер),
// затем отдаёт его через `vite preview`. Так каждый прогон проверяет ровно то,
// что уедет на Firebase Hosting, включая пререндеренный HTML (SEO из GOAL.md).
//
// Запуск: `npm run e2e`. Артефакты падений (трейсы, скриншоты) — в test-results/ (вне git).
export default defineConfig({
	testDir: 'e2e',
	fullyParallel: true,
	reporter: 'list',
	use: {
		baseURL: 'http://localhost:4173',
		trace: 'retain-on-failure',
		// 🔴 ЯЗЫК БРАУЗЕРА ФИКСИРУЕТСЯ ЯВНО, а не берётся с машины, где идёт прогон.
		//
		// С `plans/39` шага 1 человек с ПУСТОЙ памятью получает язык, который просит его
		// браузер (решение владельца, интервью №024, В1 = А). До этого умолчание было
		// жёстко русским, и 31 проверка молча опиралась на него — прогон в Chromium
		// Playwright (он английский) стал давать `<html lang="en">` и красить красным
		// всё, что ждало русских слов.
		//
		// Это НЕ подгонка теста под код: проверки продолжают судить РУССКОГО человека,
		// просто теперь они это ГОВОРЯТ вслух. Цена решения была названа владельцу до
		// ответа ровно этими словами — «в стражах фиксировать язык явно, а не полагаться
		// на машину, где идёт прогон». Английского человека судит отдельный сценарий
		// `e2e/lang-default.spec.ts`, который свою локаль объявляет так же явно.
		locale: 'ru-RU',
	},
	webServer: {
		// Пересборка на каждый прогон (~5 с) — e2e никогда не смотрит на протухший build/
		command: 'npm run build && npm run preview',
		url: 'http://localhost:4173',
		reuseExistingServer: true,
		timeout: 120_000,
	},
	projects: [
		// Mobile-first: 430 px — та же ширина, которой проверялись макеты владельца
		{ name: 'mobile', use: { viewport: { width: 430, height: 940 } } },
		{ name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
	],
});
