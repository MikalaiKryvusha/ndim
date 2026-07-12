import { readFileSync } from 'node:fs';

import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

// Версия приложения и дата сборки вшиваются в бандл (ideas/06: «версии на виду»).
// Источник версии один — package.json: две записи о версии в проекте неминуемо разойдутся.
// Дата сборки берётся в момент сборки: соврать о ней невозможно.
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const builtAt = new Date().toISOString().slice(0, 10);

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __APP_BUILT_AT__: JSON.stringify(builtAt),
  },

  plugins: [
    sveltekit({
      compilerOptions: {
        // Режим рун для нашего кода; библиотеки в node_modules решают сами. Можно убрать в Svelte 6.
        runes: ({ filename }) =>
          filename.split(/[/\\]/).includes('node_modules') ? undefined : true,
      },

      // adapter-static: весь сайт пререндерится в статический HTML (см. prerender в +layout.ts).
      // Это осознанный выбор, а не заглушка: индексация поисковиками — главная боль из GOAL.md,
      // а Firebase Hosting отдаёт статику как есть. Когда появятся экраны с авторизацией,
      // адаптер пересмотрим (SSR-узлу пока неоткуда взяться: бэкенд — без входящих портов).
      adapter: adapter(),
    }),
  ],
});
