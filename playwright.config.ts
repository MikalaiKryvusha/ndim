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
