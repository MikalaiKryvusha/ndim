/**
 * ДРЕЙФ КАТАЛОГА — сколько страниц изменилось с прошлой сборки (решение владельца 2026-08-16).
 *
 * Его слово, дословно: «*Собираем и передеплоиваем раз в день во время цикла полной синхронизации
 * И ТОЛЬКО ПРИ УСЛОВИИ, если с прошлой пересборки более 20% страниц претерпели изменения*».
 *
 * Прибор отвечает ровно на этот вопрос — числом, а не ощущением: берёт два снимка каталога и
 * считает долю объектов, у которых изменилось хоть что-то ИЗ ТОГО, ЧТО ВИДНО НА СТРАНИЦЕ.
 *
 * 🔴 СРАВНИВАЮТСЯ ТОЛЬКО ОТРИСОВЫВАЕМЫЕ ПОЛЯ, и это не мелочь. В документе каталога есть поля,
 * которых страница не показывает; их дрожание не меняет ни байта в HTML, а порог по ним
 * гонял бы выкат впустую. Список полей взят из `+page.server.ts` (что уезжает в `DimView`) и из
 * `catalog-hub.ts` → `toCard` (что рисует хаб).
 *
 * ⚠️ Порядок в хабах зависит ещё и от ОПОРЫ каталога (`m`, `C`), которая считается по всем
 * оценённым: один новый голос слегка двигает опору и потому способен переставить соседей. Этот
 * прибор такой перестановки НЕ считает изменением страницы — он мерит содержание карточек.
 * Если владелец захочет считать и перестановки, это отдельная мера и отдельное число.
 *
 * Запуск:
 *   node tools/measure-catalog-drift.mjs <старый.json> [новый.json]
 * Второй по умолчанию — `src/lib/content/dims-build.json` (снимок текущей сборки).
 * Код возврата: 0 — дрейф ниже порога (пересборка не нужна), 10 — порог превышен.
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/**
 * ПОРОГ ПЕРЕСБОРКИ — **0**: пересобираем, если изменилось ХОТЬ ЧТО-ТО (решение владельца
 * 2026-08-16, дословно: «*значит делаем, если хоть одно изменение было — пересобираем*»).
 *
 * 🔴 Здесь стояло **0.2** — первая редакция решения владельца, отменённая им же ПОСЛЕ ЗАМЕРА.
 * Замер: за двое суток (14.08 → 16.08) изменилось **0 объектов из 5111**, то есть порог 20 %
 * не открылся бы ни разу и заморозил бы данные для роботов — прямая противоположность заказу.
 *
 * 🔑 И довод, который важнее сегодняшних чисел: порог, привязанный к ДОЛЕ каталога, ломается на
 * ОБОИХ концах роста — сегодня не срабатывает никогда, а на большом трафике сработает по многу
 * раз в день, и его придётся перенастраивать на каждом этапе. Правило «изменилось хоть что-то, но
 * не чаще раза в сутки» перенастройки не требует НИКОГДА: при тишине оно молчит, при миллионах
 * даёт ровно один выкат в сутки. Механизм проектируется под рост, которого мы добиваемся.
 */
export const REBUILD_THRESHOLD = 0;

const OLD = process.argv[2];
const NEW = process.argv[3] ?? 'src/lib/content/dims-build.json';

/**
 * 🔴 ПРЕДОХРАНИТЕЛЬ «ЗАПУЩЕН ИЛИ ПОДКЛЮЧЁН» (`ideas/43`; страж класса — `verify-import-safety.mjs`).
 * Измеритель экспортирует свой порог, и порог просится в чужие проверки — а импорт ради него
 * прогонял весь замер по каталогу и звал `process.exit`, убивая чужой процесс.
 */
const ЗАПУЩЕН_НАПРЯМУЮ = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;

function выполнить() {
  if (!OLD) {
    console.error('нужен путь к старому снимку: node tools/measure-catalog-drift.mjs <старый.json> [новый.json]');
    process.exit(1);
  }

  const load = (p) => {
    const raw = JSON.parse(readFileSync(p, 'utf8'));
    const list = Array.isArray(raw) ? raw : Object.values(raw);
    return new Map(list.map((d) => [d.id ?? d.slug, d]));
  };

  /**
   * Отпечаток ВИДИМОЙ части объекта. Всё, что сюда попало, человек читает на странице; всё, что не
   * попало, странице неизвестно. Числа приводятся к строке, чтобы `8` и `8.0` не считались разными.
   */
  const visible = (d) =>
    JSON.stringify([
      d.slug,
      d.title?.ru, d.title?.en,
      d.description?.ru, d.description?.en,
      d.type?.ru, d.type?.en,
      d.author?.ru, d.author?.en,
      d.year,
      [...(d.tags ?? [])].join('|'),
      String(Math.floor(Number(d.rates) || 0)),
      String(Number(d.rating) || 0),
    ]);

  const before = load(OLD);
  const after = load(NEW);

  let changed = 0, added = 0, removed = 0;
  const byField = { rates: 0, rating: 0, title: 0, description: 0, tags: 0, other: 0 };

  for (const [id, now] of after) {
    const was = before.get(id);
    if (!was) { added += 1; continue; }
    if (visible(was) === visible(now)) continue;
    changed += 1;
    // Чем именно отличается — чтобы владелец видел, ЧТО двигает порог, а не только сколько.
    if (Math.floor(Number(was.rates) || 0) !== Math.floor(Number(now.rates) || 0)) byField.rates += 1;
    else if ((Number(was.rating) || 0) !== (Number(now.rating) || 0)) byField.rating += 1;
    else if (was.title?.ru !== now.title?.ru || was.title?.en !== now.title?.en) byField.title += 1;
    else if (was.description?.ru !== now.description?.ru || was.description?.en !== now.description?.en) byField.description += 1;
    else if ([...(was.tags ?? [])].join('|') !== [...(now.tags ?? [])].join('|')) byField.tags += 1;
    else byField.other += 1;
  }
  for (const id of before.keys()) if (!after.has(id)) removed += 1;

  const total = after.size;
  // Появившиеся и исчезнувшие объекты — это тоже изменившиеся страницы: у одних их не было, у
  // других они пропадут. Считать только правки значило бы проспать наполнение каталога.
  const touched = changed + added + removed;
  const share = total ? touched / total : 0;

  const pct = (x) => `${(x * 100).toFixed(2)} %`;
  console.log(`объектов в новом снимке : ${total}`);
  console.log(`изменилось содержание   : ${changed}`);
  console.log(`  из них по числу голосов: ${byField.rates}`);
  console.log(`  из них по средней      : ${byField.rating}`);
  console.log(`  из них по названию     : ${byField.title}`);
  console.log(`  из них по описанию     : ${byField.description}`);
  console.log(`  из них по тегам        : ${byField.tags}`);
  console.log(`  из них прочее          : ${byField.other}`);
  console.log(`добавлено объектов      : ${added}`);
  console.log(`исчезло объектов        : ${removed}`);
  console.log(`──────────────────────────────`);
  console.log(`ЗАТРОНУТО ВСЕГО         : ${touched} из ${total} — ${pct(share)}`);
  console.log(`ПОРОГ ВЛАДЕЛЬЦА         : ${pct(REBUILD_THRESHOLD)}`);
  console.log(share > REBUILD_THRESHOLD ? '🔴 ПОРОГ ПРЕВЫШЕН — пересборка нужна' : '✅ ниже порога — пересборка не нужна');

  process.exit(share > REBUILD_THRESHOLD ? 10 : 0);
}

if (ЗАПУЩЕН_НАПРЯМУЮ) выполнить();
