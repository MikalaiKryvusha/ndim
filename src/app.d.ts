// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}

	// Версия приложения и дата сборки: подставляются Vite при сборке (vite.config.ts → define).
	// Источник версии — package.json, даты — момент сборки. Экран «Пространство» их показывает.
	const __APP_VERSION__: string;
	const __APP_BUILT_AT__: string;
}

export {};
