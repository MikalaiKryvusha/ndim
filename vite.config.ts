import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

// Версия приложения, номер сборки и дата вшиваются в бандл (ideas/06: «версии на виду»).
// Источник версии один — package.json: две записи о версии в проекте неминуемо разойдутся.
// Дата сборки берётся в момент сборки: соврать о ней невозможно.
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
// До минут, а не до дня (слово владельца 2026-07-27: «нужно добавить время, часы и минуты
// к каждой дате сборки»). Секунды отброшены: они шум, а не информация.
const builtAt = new Date().toISOString().replace(/:\d{2}\.\d{3}Z$/, ':00Z');

/**
 * Номер сборки = ЧИСЛО КОММИТОВ в истории (`git rev-list --count HEAD`).
 *
 * Требование владельца (2026-07-27): «каждый коммит должен автоматически повышать номер
 * сборки». Счётчик коммитов делает ровно это и БЕЗ хука: хук пришлось бы ставить каждому,
 * кто клонирует репозиторий, он молча не сработает на CI и при `git commit --amend`, а файл
 * со счётчиком пришлось бы коммитить — то есть каждый коммит порождал бы ещё один.
 * Здесь же номер не хранится нигде: он ВЫВОДИТСЯ из истории, монотонно растёт и не врёт.
 *
 * Если git недоступен (сборка из архива без .git) — честный 0, а не выдуманное число
 * (PHILOSOPHY: выдуманное число хуже отсутствующего).
 */
function buildNumber(): number {
  try {
    return Number(execSync('git rev-list --count HEAD', { encoding: 'utf8' }).trim()) || 0;
  } catch {
    return 0;
  }
}

/**
 * Полный снимок каталога живёт только в главной копии (пишется шагом выката, в git не кладётся).
 * Без него сборка честно идёт на запасном срезе из 50 записей — там ни один вид не набирает
 * второй страницы хаба, и маршрут пагинации каталога законно не посещается ни разу (bugs/160).
 */
const FULL_CATALOG = existsSync(new URL('./src/lib/content/dims-build.json', import.meta.url));
/** Единственный маршрут, которому на запасном срезе законно не достаётся ни одной страницы. */
const CATALOG_PAGED_ROUTE = '/[lang=lang]/catalog/[kind=kind]/[page=page]';

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __APP_BUILD__: JSON.stringify(buildNumber()),
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

      // bugs/160: на полном каталоге необойдённый пререндеримый маршрут ОБЯЗАН ронять сборку —
      // это дыра выката (глобальный 'warn' обменял бы падение на молча неполный сайт, ровно
      // класс bugs/124). На запасном срезе один-единственный маршрут пагинации хабов законно
      // пуст — только он и прощается, любой другой необойдённый маршрут роняет сборку и там.
      prerender: {
        handleUnseenRoutes: FULL_CATALOG
          ? 'fail'
          : ({ routes, message }) => {
              const unexpected = routes.filter((id) => id !== CATALOG_PAGED_ROUTE);
              if (unexpected.length > 0) throw new Error(message);
              console.warn(
                `[prerender] запасной срез каталога: маршрут ${CATALOG_PAGED_ROUTE} не набрал ` +
                  `ни одной страницы — это норма среза; на полном каталоге он обязателен (bugs/160)`
              );
            },
      },
    }),
  ],
});
