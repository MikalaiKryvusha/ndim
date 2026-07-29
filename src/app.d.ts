// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		/**
		 * Состояние неглубокого маршрутирования SvelteKit (`pushState` + `page.state`).
		 *
		 * Здесь живут ПОЛНОЭКРАННЫЕ СЛОИ, которые выглядят дочерними страницами и обязаны
		 * закрываться системной кнопкой «Назад», не меняя адреса (ideas/21 п. 3, bugs/76).
		 * Без записи в истории такой слой уводил человека из приложения: владелец
		 * наблюдал это на «Как меня видят».
		 *
		 * Заводя НОВЫЙ такой слой (лайтбокс фото, панель глав), добавляй сюда его признак,
		 * а не изобретай свой перехват `popstate` — иначе в проекте заведётся роутер поверх
		 * штатного роутера.
		 */
		interface PageState {
			/** Открыто окно «Как меня видят» на «Профиле». */
			seeMe?: boolean;
		}
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
