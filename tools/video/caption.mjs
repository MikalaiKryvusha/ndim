#!/usr/bin/env node
/**
 * caption.mjs — ссылка с меткой и механическая проверка подписи ролика.
 *
 * ЗАЧЕМ. Эпик `plans/90`, пакет выхода навыка `/video-studio`: владелец только загружает, значит
 * подпись, хэштеги и ссылка приходят к нему готовыми. Текст подписи пишет агент по портрету голоса
 * (`AUTHOR_STYLOMETRY.md`) — этот прибор проверяет только то, что берётся машиной; З1, З3–З6 портрета
 * машиной не берутся и судятся чтением (раздел 0 портрета, «Почему портрет не спас»).
 *
 * ССЫЛКА. Ведёт на языковую страницу (`/ru`, `/en`), а не на главную: главная отрезает `utm_*`
 * (`bugs/NEW_root_landing_view_drops_utm.md`), а SDK на `/ru` метку доносит — проверено живым
 * прибором 2026-09-14. Когда корень вылечат, путь можно вернуть на главную.
 *
 * ПРОВЕРКИ ПОДПИСИ (каждая — источник):
 *   · ссылка несёт `utm_source`, `utm_medium`, `utm_campaign` — иначе переход не виден (`researches/70` §4.5);
 *   · хэштегов ≤ 5 — лимит Instagram с декабря 2025 (`researches/70` §4.1);
 *   · имя бренда только «NDim Space» / «Пространство NDim» — словарь продукта (`AGENT_GUIDE.md`);
 *   · нет конструкций противопоставления — запрет З2 портрета, машинная часть (E21 портрета, §8);
 *   · нет слова «приложение» в роли имени — словарь продукта;
 *   · длина: Instagram — 2200 знаков; заголовок YouTube — 100 знаков (первая строка подписи).
 *     ⚠️ Лимиты — справка площадок по памяти агента, НЕ сверены первоисточником в `researches/70`:
 *     отмечены `[NOT-TESTED]` до сверки.
 *
 * Запуск:
 *   node tools/video/caption.mjs link --lang ru --source instagram --medium reel --campaign pilot-001
 *   node tools/video/caption.mjs check <caption.md>
 */

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const SITE = 'https://ndimspace.app';

export function makeLink({ lang = 'ru', source, medium = 'short', campaign }) {
  if (!['ru', 'en'].includes(lang)) throw new Error(`язык ${lang}: только ru или en`);
  if (!source || !campaign) throw new Error('нужны --source и --campaign');
  const q = new URLSearchParams({ utm_source: source, utm_medium: medium, utm_campaign: campaign });
  return `${SITE}/${lang}?${q}`;
}

/** Конструкции противопоставления — запрет З2 портрета (список взят из строки З2 раздела 0). */
export const CONTRAST = [
  /(?<![а-яё])не\s+[^,.!?\n]{1,40},\s*а\s+/iu,
  /(?<![а-яё])а\s+не(?![а-яё])/iu,
  /(?<![а-яё])зато(?![а-яё])/iu,
  /(?<![а-яё])однако(?![а-яё])/iu,
  /(?<![а-яё])вместо(?![а-яё])/iu,
  /(?<![а-яё])наоборот(?![а-яё])/iu,
  /в\s+отличие\s+от/iu,
  /(?<![а-яё])тот\s+же(?![а-яё])/iu,
];

export function checkCaption(text) {
  const problems = [];
  const links = text.match(/https?:\/\/\S+/g) ?? [];
  const tracked = links.filter((l) => /utm_source=/.test(l) && /utm_medium=/.test(l) && /utm_campaign=/.test(l));
  if (tracked.length === 0) problems.push('нет ссылки с utm_source, utm_medium и utm_campaign');
  const tags = text.match(/(?<![\p{L}\p{N}_])#[\p{L}\p{N}_]+/gu) ?? [];
  if (tags.length > 5) problems.push(`хэштегов ${tags.length} (не больше 5)`);
  const bad = text.match(/\b(?:N\s?dim|Endim|Ndim|NDIM|Н?Дим)\s*Space\b/gu)?.filter((m) => m !== 'NDim Space') ?? [];
  if (bad.length) problems.push(`имя бренда написано не по словарю: ${[...new Set(bad)].join(', ')}`);
  if (/(?<![а-яё])приложени[еяюи](?![а-яё])/iu.test(text)) problems.push('слово «приложение» — по словарю продукта «Пространство NDim»');
  const prose = text.replace(/https?:\/\/\S+/g, '');
  for (const re of CONTRAST) {
    const m = prose.match(re);
    if (m) problems.push(`противопоставление (З2 портрета): «${m[0].trim()}»`);
  }
  if (text.length > 2200) problems.push(`длина ${text.length} знаков (Instagram — 2200) [NOT-TESTED лимит]`);
  const title = text.split(/\r?\n/).find((l) => l.trim()) ?? '';
  if (title.length > 100) problems.push(`первая строка ${title.length} знаков (заголовок YouTube — 100) [NOT-TESTED лимит]`);
  return { ok: problems.length === 0, problems, tags: tags.length, links: tracked.length };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [cmd, ...rest] = process.argv.slice(2);
  const opt = (k) => { const i = rest.indexOf(`--${k}`); return i >= 0 ? rest[i + 1] : undefined; };
  try {
    if (cmd === 'link') {
      console.log(makeLink({ lang: opt('lang'), source: opt('source'), medium: opt('medium'), campaign: opt('campaign') }));
    } else if (cmd === 'check' && rest[0]) {
      const r = checkCaption(readFileSync(rest[0], 'utf8'));
      for (const p of r.problems) console.log(`🔴 ${p}`);
      console.log(r.ok ? `ALL GREEN · хэштегов ${r.tags} · ссылок с меткой ${r.links}` : 'RED');
      process.exit(r.ok ? 0 : 1);
    } else {
      console.error('usage: caption.mjs link --lang ru|en --source <площадка> [--medium short] --campaign <имя> | caption.mjs check <файл>');
      process.exit(2);
    }
  } catch (e) {
    console.error(`🔴 ${e.message}`);
    process.exit(1);
  }
}
