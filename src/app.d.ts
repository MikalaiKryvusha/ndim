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

	// Версия, номер сборки и дата: подставляются Vite при сборке (vite.config.ts → define).
	// Источник версии — package.json, номера сборки — число коммитов в истории git,
	// даты — момент сборки. Экраны «Пространство», «Меню» и «О системе» их показывают.
	const __APP_VERSION__: string;
	const __APP_BUILD__: number;
	const __APP_BUILT_AT__: string;
}

export {};
