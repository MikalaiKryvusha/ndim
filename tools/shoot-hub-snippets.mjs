/**
 * КАДРЫ И ТЕКСТЫ СНИППЕТА ХАБА НА СОБРАННОМ САЙТЕ — `plans/56` шаг 7, набор
 * `qa/suites/catalog-hub-snippets.md`.
 *
 * Ворота: нет — это ПРИБОР, а не страж. Он ничего не судит и всегда выходит нулём; судят юниты
 * (`src/lib/content/catalog-copy.test.ts`) и страж `tools/verify-catalog-hubs.mjs`.
 *
 * ═══ ЗАЧЕМ ОН СУЩЕСТВУЕТ ОТДЕЛЬНО ОТ `tools/shoot-catalog-hubs.mjs` ═══
 *
 * Тот съёмщик снимает ВЁРСТКУ формы V3 «Рейтинг»: границу голосов, пагинацию маленького хаба,
 * самое длинное название. Предмет здесь ДРУГОЙ — ТЕКСТ: заголовок вкладки, описание для выдачи и
 * вводная строка, которые с шага 7 ветвятся по составу страницы. Один прибор на два предмета
 * пришлось бы звать целиком ради половины, и его набор страниц выбран не под эту фикстуру.
 * Пара названа здесь, чтобы следующая сессия знала об обоих и не завела третий.
 *
 * ═══ ПОЧЕМУ КАДРЫ, А НЕ ТОЛЬКО ЧИСЛА ═══
 *
 * Вердикт QA №36 закрылся словами судьи о собственной работе: «№36 судил ТЕКСТЫ и МЕХАНИКУ, но
 * не видел ни одной собранной страницы». Числа юнитов говорят о ФУНКЦИИ; страж читает отданный
 * HTML; ни то, ни другое не отвечает на вопрос «как это выглядит человеку». Прибор снимает обе
 * половины сразу: кадр для глаза и ТЕКСТ ИЗ ЖИВОГО DOM рядом с ним — чтобы судье не приходилось
 * вычитывать буквы со скриншота.
 *
 * ═══ ЧТО ОН СНИМАЕТ И ЧЕГО НЕ СНИМАЕТ ═══
 *
 * · Снимает: `<title>`, `<meta name="description">` и видимую вводную строку — с СОБРАННОГО
 *   сайта, поднятого `vite preview`, то есть ровно то, что уедет в бой.
 * · НЕ снимает: живую выдачу Google. Где именно поисковик подрежет описание, прибор не знает и
 *   не заявляет; 155 и 60 — ориентиры публичной практики, а не закон (`design/hub-texts-approved.md` §5).
 * · НЕ судит вкус текста: вкус принадлежит владельцу, тексты приняты интервью №066/№067/№068.
 *
 * Запуск: node tools/shoot-hub-snippets.mjs [--keep] [--base http://...]
 *   Сборка обязана быть свежей: `npm run build`. Прибор поднимает preview СВОЕГО СЛОТА сам и
 *   гасит его за собой; `--keep` оставляет поднятым, `--base` адресует чужой контур.
 * ⚠️ Порт берётся у хозяина парка стендов, а не литералом: прибор, вшивший 4173, в командном
 *   режиме снимал бы кадры с ЧУЖОЙ сборки и выглядел бы при этом исправным.
 */
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { portsFor, slotOf } from './lib/stand-slot.mjs';

const KEEP = process.argv.includes('--keep');
const baseFlag = process.argv.indexOf('--base');
// Слот спрашивается у ХОЗЯИНА парка по имени рабочего каталога — таблица сюда не копируется
// (довод — шапка `tools/lib/stand-addresses.mjs`: вторая копия разъехалась бы молча).
const { slot: SLOT, note: SLOT_NOTE } = slotOf(basename(process.cwd()));
const PORT = portsFor(SLOT).preview;
/** Флаг сильнее окружения и умолчания: он адресует конкретный прогон (см. `stand-addresses.mjs`). */
const BASE = baseFlag > -1 ? process.argv[baseFlag + 1] : `http://localhost:${PORT}`;
const OWN = baseFlag === -1;
const OUT = resolve('test-results', 'hub-snippets');

/**
 * ФИКСТУРА — страницы §6 принятого документа, по одной на НАЗНАЧЕНИЕ.
 *
 * ⚠️ Назначение стоит рядом с адресом намеренно: подмена одной страницы другой ломает обе
 * проверки и ломает молча — «проверка исполнилась, признак верен, ПРЕДМЕТ другой». Цена этой
 * строки уже уплачена: две страницы свели в одну и приписали границу не той.
 */
const PAGES = [
  ['ru', 'movie', 1, 'А', 'ступень 3 на полностью оценённой: длинная голова съела имена'],
  ['ru', 'movie', 8, 'А', 'ГРАНИЦА СТУПЕНИ — описание ровно 155 знаков с двумя именами'],
  ['ru', 'movie', 25, 'Б', 'КОНТРОЛЬ ПРИЗНАКА — оценённых на странице 0 при 983 по виду'],
  ['en', 'movie', 25, 'Б', 'то же на английском'],
  ['ru', 'book', 1, 'В', 'КОРЕНЬ ХАБА В СМЕШАННОМ СЛУЧАЕ — 9 оценённых из 60'],
  ['en', 'book', 1, 'В', 'то же на английском'],
  ['en', 'tv-series', 2, 'В', 'СТРОЧНАЯ ФОРМА ВИДА: «TV series» не смеет стать «tv series»'],
  ['en', 'video-game', 14, 'Б', 'СТУПЕНЬ 3 — длинные имена, обе первые ступени перебирают'],
  ['ru', 'practice', 1, 'А', 'первое имя уходит в выдачу КАК ЕСТЬ (№066 В2 = А); фильтра нет'],
];

const THEMES = ['light', 'dark'];
const WIDTHS = [390, 1440];

const path = (lang, kind, page) =>
  page === 1 ? `/${lang}/catalog/${kind}` : `/${lang}/catalog/${kind}/${page}`;

/** Поднимаем preview СВОЕГО слота и ждём, пока он ответит. */
async function raisePreview() {
  /*
   * Зовём БИНАРЬ vite тем же `node`, что исполняет нас, а не `npx` через оболочку.
   * ⚠️ Node на Windows отказывает `spawn` для `.cmd` без `shell: true` (EINVAL) — а `shell: true`
   * с кириллицей в путях и аргументах открывает класс «текст через argv» (`AGENT_GUIDE.md` →
   * гигиена текста). Прямой вызов обходит обе беды и совпадает с тем, как процесс и так выглядит
   * в системе: `"node" "…\\vite\\bin\\vite.js" preview` (досье окружения).
   */
  const bin = resolve('node_modules', 'vite', 'bin', 'vite.js');
  if (!existsSync(bin)) throw new Error(`нет ${bin} — выполните npm install`);
  const child = spawn(process.execPath, [bin, 'preview', '--port', String(PORT), '--strictPort'], {
    stdio: 'ignore',
  });
  const deadline = Date.now() + 40_000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${BASE}/ru/catalog`, { signal: AbortSignal.timeout(2000) });
      if (r.ok) return child;
    } catch {
      /* ещё не поднялся */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  child.kill();
  throw new Error(`preview на ${PORT} не поднялся за 40 с`);
}

async function main() {
  if (!existsSync('build')) {
    console.error('⛔ нет каталога build/ — сначала `npm run build`');
    process.exit(1);
  }
  console.log(`🎯 слот ${SLOT} · preview ${BASE} · сборка build/`);
  if (SLOT_NOTE) console.log(`   ⚠️ ${SLOT_NOTE}`);

  const server = OWN ? await raisePreview() : null;
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  const browser = await chromium.launch();
  const rows = [];

  try {
    for (const [lang, kind, page, кейс, назначение] of PAGES) {
      const url = `${BASE}${path(lang, kind, page)}`;
      for (const theme of THEMES) {
        for (const width of WIDTHS) {
          const ctx = await browser.newContext({ viewport: { width, height: 900 } });
          // Тему ставим ДО загрузки: продукт читает ключ до первой отрисовки, и переключение
          // после загрузки проверяло бы «обе темы» лишь формально.
          await ctx.addInitScript(
            (t) => window.localStorage.setItem('ndim-theme', t),
            theme,
          );
          const p = await ctx.newPage();
          const errors = [];
          p.on('console', (m) => {
            if (m.type() === 'error') errors.push(m.text());
          });
          await p.goto(url, { waitUntil: 'domcontentloaded' });
          await p.waitForSelector('h1');

          const seen = await p.evaluate(() => ({
            title: document.title,
            desc: document.querySelector('meta[name="description"]')?.getAttribute('content') ?? '',
            lede: document.querySelector('.lede')?.textContent?.trim() ?? '',
            theme: document.documentElement.getAttribute('data-theme') ?? '',
          }));

          const name = `${kind}-${page}-${lang}-${theme}-${width}.png`;
          await p.screenshot({ path: resolve(OUT, name), fullPage: false });

          // Текст снимается ОДИН раз на страницу — он от темы и ширины не зависит; кадр снимается
          // на каждой из четырёх, потому что от них зависит вид.
          if (theme === THEMES[0] && width === WIDTHS[0]) {
            rows.push({ lang, kind, page, кейс, назначение, url, ...seen, errors: errors.length });
          }
          await ctx.close();
        }
      }
      console.log(`  ✔ ${path(lang, kind, page)} · случай ${кейс} · 4 кадра`);
    }
  } finally {
    await browser.close();
    if (server && !KEEP) server.kill();
  }

  const chars = (s) => [...s].length;
  const report = [
    '# Кадры и тексты сниппета хаба — собранный сайт',
    '',
    `Снято: ${new Date().toISOString()} · слот ${SLOT} · ${BASE}`,
    `Кадров: ${PAGES.length * THEMES.length * WIDTHS.length} (${PAGES.length} страниц × 2 темы × 390/1440)`,
    'Кадры: `test-results/hub-snippets/`',
    '',
    '⚠️ Прибор ничего не судит. Тексты приняты владельцем — интервью №066 В1/В2/В4, №067 В2,',
    '№068 В1/В2. Вкус принадлежит ему; здесь только то, что реально отдаёт собранный сайт.',
    '',
  ];
  for (const r of rows) {
    report.push(
      `## ${r.kind}/${r.page} ${r.lang} — случай ${r.кейс}`,
      '',
      `**Назначение:** ${r.назначение}`,
      `**Адрес:** \`${r.url}\``,
      '',
      `- **title** (${chars(r.title)} знаков): ${r.title}`,
      `- **description** (${chars(r.desc)} знаков): ${r.desc}`,
      `- **вводная строка**: ${r.lede}`,
      `- ошибок в консоли: ${r.errors}`,
      '',
    );
  }
  await writeFile(resolve(OUT, 'report.md'), report.join('\n'), 'utf8');
  console.log(`\n📄 отчёт: ${resolve(OUT, 'report.md')}`);
  console.log(`🖼  кадров: ${PAGES.length * THEMES.length * WIDTHS.length}`);
}

// Предохранитель: прибор работает под ЗАПУСКОМ, а не под импортом (`tools/verify-import-safety.mjs`).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
