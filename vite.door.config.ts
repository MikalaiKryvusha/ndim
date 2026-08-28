import { basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite';

import { portsFor, slotOf } from './tools/lib/stand-slot.mjs';

/**
 * 🅿 СЛОТ РАБОЧЕГО МЕСТА — ТА ЖЕ ПОДСТАНОВКА, ЧТО В ОСНОВНОМ КОНФИГЕ, И ОНА ЗДЕСЬ ОБЯЗАТЕЛЬНА.
 *
 * Мина названа в `vite.config.ts` словами «свой сайт, чужой эмулятор», и вторая сборка на неё
 * наступила: движок двери вшил умолчание 8181, а эмулятор этого рабочего места слушает 8211.
 * Прибор увидел ровно то, что и должен был: панель раскрылась, оценка «засчитана» на экране —
 * а точки в базе НЕТ. Ошибка была невидима, потому что остров глушит отказ записи молча.
 *
 * Порты берутся из ТОГО ЖЕ модуля, что и в основном конфиге (`tools/lib/stand-slot.mjs`), —
 * своя копия правила слота разъехалась бы с парком стендов при первой же его правке.
 * `??=`: заданное снаружи значение остаётся сильнее, как и там.
 */
const WORKPLACE = basename(dirname(fileURLToPath(import.meta.url)));
const STAND_SLOT =
  process.env.STAND_SLOT === undefined ? slotOf(WORKPLACE).slot : Number(process.env.STAND_SLOT);
const STAND = portsFor(STAND_SLOT);
process.env.VITE_STAND_FIRESTORE_PORT ??= String(STAND.firestore);
process.env.VITE_STAND_AUTH_PORT ??= String(STAND.auth);
process.env.VITE_STAND_STORAGE_PORT ??= String(STAND.storage);

/**
 * ВТОРАЯ СБОРКА — «ДВИЖОК ДВЕРИ» карточки каталога (`plans/75` Ш1, пункт 2 разведки).
 *
 * Зачем отдельная сборка. Карточки каталога объявлены `csr = false` (`dimension/[slug]/
 * +page.server.ts`): клиентского JS у них нет вовсе, и это решение куплено замером — минус
 * 10 222 файла `__data.json` ≈ 41 МБ на релиз и страница без бандла фреймворка. Включить
 * гидрацию «чтобы заработали звёзды» значило бы откатить оплаченную оптимизацию на всей
 * SEO-поверхности. Поэтому дверь — «ванильный остров»: разметка приходит пререндером,
 * обработчики вешает инлайн-скрипт, а тяжёлый слой данных приезжает ОТДЕЛЬНЫМ чанком и
 * только тому, кто реально тронул звёзды.
 *
 * 🔴 ХЕШ В ИМЕНИ ОБЯЗАТЕЛЕН — класс `bugs/124`. Файл с постоянным именем под кешем хостинга
 * пережил бы собственную замену: браузер отдавал бы старый чанк новой странице. Хеш делает
 * подмену невозможной по построению, а пререндер узнаёт настоящее имя из манифеста этой же
 * сборки — не из договорённости.
 *
 * Выход — `static/door/`: SvelteKit копирует `static/` в `build/` как есть, поэтому чанк
 * доезжает до хостинга без единой правки в конвейере выката.
 */
export default defineConfig({
  // Тот же приём, что в основном конфиге: код приложения читает эти константы.
  define: {
    __APP_VERSION__: JSON.stringify('door'),
    __APP_BUILD__: '0',
    __APP_BUILT_AT__: JSON.stringify(''),
  },
  build: {
    outDir: 'static/door',
    emptyOutDir: true,
    // Манифест — то, из чего пререндер узнаёт хешированное имя входа. Без него имя пришлось бы
    // угадывать, а угаданное имя и есть класс `bugs/124`.
    manifest: true,
    target: 'es2022',
    rollupOptions: {
      input: 'src/lib/door/engine.ts',
      /*
       * 🔴 БЕЗ ЭТОГО ВХОД СОБИРАЕТСЯ ПУСТЫМ ФАЙЛОМ, И СБОРКА ПРИ ЭТОМ ЗЕЛЁНАЯ.
       * Vite для сборки приложения ставит `preserveEntrySignatures: false`: экспорты входа
       * считаются никому не нужными, и дерево вытрясается целиком — на диск ложится 0 байт
       * с бодрым отчётом «built in 188ms». Замер первой попытки: engine-*.js весил ровно 0.
       * Дверь обязана ОТДАВАТЬ `saveTestRating` наружу, поэтому подпись входа сохраняется.
       */
      preserveEntrySignatures: 'exports-only',
      output: {
        entryFileNames: 'engine-[hash].js',
        chunkFileNames: 'chunk-[hash].js',
        assetFileNames: 'asset-[hash][extname]',
      },
    },
  },
});
