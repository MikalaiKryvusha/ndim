import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
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
