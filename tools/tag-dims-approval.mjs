/**
 * ТЕХНИЧЕСКИЕ ТЕГИ ОДОБРЕНИЯ НА ВЕСЬ КАТАЛОГ — разовый прибор шага 1 `plans/58`.
 *
 * Заказ владельца, дословно: «*В димс лист обычный боевой нужно добавить статус одобрения.
 * Текущие без этого свойства — не вычитаны и формально не одобрены*» и в тот же час, увидев
 * числа: «*значит то, что уже в БД, помечаем статусом принято*». Разметку ВСЕГО каталога он
 * подтвердил отдельно (интервью №039, В2 = A): «*A — размечаем всё. но не сегодня, планируем в
 * четверг это сделать*».
 *
 * 🔴 ПИШЕМ В `techTags`, А НЕ В `tags`. Поле `tags` публичное и уже несёт 43 011 пользовательских
 * значений — служебное слово, положенное туда, уехало бы на страницу каталога, и «требует правки»
 * увидели бы все. Разделение держится ПОЛЕМ, а не уговором о префиксах (`plans/58` → ТЕРМИНОЛОГИЯ).
 * Прибор не просто пишет в другое поле — он ОТКАЗЫВАЕТСЯ работать, увидев служебное значение в
 * публичном `tags`: раз оно там, утечка уже случилась, и дописывать поверх неё нельзя.
 *
 * 🔴 ДВА ИСТОЧНИКА СУЖДЕНИЯ, И ОНИ НЕ ВЗАИМОЗАМЕНЯЕМЫ. Записи, снятые сводом, судит свод (три
 * класса ниже). Записи, рождённые ПОСЛЕ снятия свода, сводом судить нечем — о них знает очередь
 * кандидатов: одобренный кандидат с адресом измерения означает `owner-approved` (слово владельца,
 * интервью №044 В4 = A). Ни того, ни другого нет — класс НЕ присваивается, запись печатается
 * поимённо. Это не аномалия: измерение заводится и ручной формой комнаты, минуя очередь.
 *
 * 🔴 ИМЯ `migrated`, А НЕ `approved`. «Принято миграцией» и «вычитано агентом» — разные вещи:
 * агент прочитал 307 записей из 5111. Одно имя на двоих через месяц не позволило бы отличить
 * общий штамп владельца от настоящей вычитки.
 *
 * ⚠️ СУХОЙ ПРОГОН ПО УМОЛЧАНИЮ, как у всех пишущих приборов проекта. `--apply` — осознанный шаг.
 *
 * Запуск:
 *   node tools/tag-dims-approval.mjs --selftest                     # без сети и без базы
 *   node tools/tag-dims-approval.mjs --contour stand                # сухой разбор на стенде
 *   node tools/tag-dims-approval.mjs --contour stand --apply --backup
 *   node tools/tag-dims-approval.mjs --contour prod                 # сухой разбор по бою
 *   node tools/tag-dims-approval.mjs --contour prod --apply --auth-owner "<слова владельца>"
 *
 * Юниты чистого ядра: `node --test tools/tag-dims-approval.test.mjs`.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { slugify, TAIL_LENGTH } from '../src/lib/content/dim-slug.ts';
import { TECH_TAG } from '../src/lib/model/schema.ts';

// ── ОБЪЯВЛЕНИЯ, КОТОРЫЕ ЖИВУТ В ОДНОМ МЕСТЕ ────────────────────────────────────────────────

/**
 * ЗНАЧЕНИЯ ТЕХНИЧЕСКИХ ТЕГОВ БЕРУТСЯ У ПРОДУКТА, а не объявляются здесь второй раз.
 *
 * Требование владельца к форме состояния: «*только различаем теги — по чем люди ищут фильмы, и
 * наши технические теги… смотри, не перепутай эти термины и переменные по ним*». С тех пор как
 * тег ставит и сама комната измерений (`newDimDoc`), словарь обязан быть ОДИН — он живёт в
 * `src/lib/model/schema.ts` вместе с формой документа. Прибор его импортирует, как импортирует
 * оттуда же `slugify` вместо копии.
 */
export { TECH_TAG };

/**
 * Классы, ВЫВОДИМЫЕ ИЗ СВОДА. Только они участвуют в сверке с ярлыками свода: `owner-approved`
 * приходит из другого источника (очередь кандидатов), и требовать его от свода бессмысленно.
 */
export const SVOD_CLASSES = Object.freeze([
  TECH_TAG.MIGRATED,
  TECH_TAG.NEEDS_REWRITE,
  TECH_TAG.UNCHECKED,
]);

/** Все технические теги жизненного цикла одним списком — для предохранителя и слияния. */
export const LIFECYCLE_TECH_TAGS = Object.freeze(Object.values(TECH_TAG));

/**
 * ПОРОГ, КОТОРЫМ СУДИМ ЗАИМСТВОВАНИЕ, — тот же, что у прибора свода: 10 слов подряд.
 *
 * Взят из поля, а не из головы: им отделены восемь подтверждённых случаев от чистых текстов
 * (`tools/measure-wikipedia-overlap.mjs` → `RUN_THRESHOLD`, `plans/56` шаг 3). Здесь он назван
 * снова, потому что этот прибор ВЫВОДИТ класс сам, а не переписывает чужой ярлык, — и сверка
 * вывода с ярлыками свода ловит расхождение порогов (см. `crossCheck`).
 */
export const RUN_THRESHOLD = 10;

/** Служебный документ каталога — индекс, а не измерение (`EXP-0041`). Разметке не подлежит. */
export const SERVICE_DOC_ID = 'dims_list';

/** Потолок пакета Firestore — 500; берём 400 с запасом на служебные поля пакета. */
export const BATCH_SIZE = 400;

/** Языки свода. Запись судится по ОБОИМ: заимствование в одном языке — уже заимствование. */
export const SVOD_LANGS = Object.freeze(['ru', 'en']);

/**
 * Свод лежит в ГЛАВНОЙ КОПИИ и читается только на чтение: повторного обхода Википедии нет и не
 * должно быть — 5111 записей × 2 языка уже сняты (2026-08-17), и трогать чужой сервис ради того,
 * что лежит на диске, незачем.
 */
export const SVOD_DIR_DEFAULT = 'D:/work/ai_sandbox/ndim/test-results';

// ── ЧИСТОЕ ЯДРО РАЗБОРА: ни сети, ни базы, ни файлов ───────────────────────────────────────

/**
 * Запись одного языка — ДОСЛОВНОЕ ЗАИМСТВОВАНИЕ?
 *
 * Три условия, и каждое оплачено полем:
 *   · `unverified` — статья не найдена; это утверждение о ПОИСКЕ, а не о тексте (`EXP-0165`);
 *   · `names` — ряд длинный, но это ПЕРЕЧЕНЬ ИМЁН (дискография, список ролей). Совпадение там
 *     неустранимо: альбомы нельзя переименовать. Свод отделяет речь от перечня долей служебных
 *     слов, и переигрывать его решение здесь нечем;
 *   · длина ряда ниже порога — пересказ, а не копия.
 */
export function isVerbatimCopy(rec, threshold = RUN_THRESHOLD) {
  if (!rec) return false;
  if (rec.verdict === 'unverified' || rec.verdict === 'names') return false;
  return Number(rec.run ?? 0) >= threshold;
}

/** Запись одного языка — машина судить не смогла (статья не найдена, API не ответил, текст пуст). */
export function isUnverified(rec) {
  return Boolean(rec) && rec.verdict === 'unverified';
}

/**
 * КЛАСС ЗАПИСИ ПО ДВУМ ЯЗЫКАМ. Классы ВЗАИМОИСКЛЮЧАЮЩИЕ — у записи ровно один тег.
 *
 * 🔑 Порядок приоритета не декоративен: заимствование БЬЁТ «не проверено». Если в английском
 * описании найден дословный ряд, а русская статья не нашлась, — мы про эту запись ЗНАЕМ, что её
 * надо переписать; ненайденная статья другого языка этого знания не отменяет. Обратный порядок
 * прятал бы известный дефект за словом «не проверено».
 *
 * Ровно из взаимоисключающих классов следует, что сумма разбора равна числу записей каталога, —
 * то самое равенство, которым план проверяет, что разбор никого не потерял.
 */
export function classify(entry, threshold = RUN_THRESHOLD) {
  const langs = SVOD_LANGS.map((l) => entry?.[l]);
  if (langs.some((r) => isVerbatimCopy(r, threshold))) return TECH_TAG.NEEDS_REWRITE;
  if (langs.some((r) => isUnverified(r))) return TECH_TAG.UNCHECKED;
  return TECH_TAG.MIGRATED;
}

/**
 * КЛАСС ПО ЯРЛЫКАМ САМОГО СВОДА — без порога, только по записанному вердикту.
 *
 * Существует ради одной проверки: вывод прибора обязан совпасть с тем, что свод уже решил про эти
 * же записи. Совпадают — порог на месте; разошлись — порог уехал, и числам разбора верить нельзя
 * (мутация плана: «подменить порог так, чтобы копии считались чистыми»).
 */
export function recordedClass(entry) {
  const langs = SVOD_LANGS.map((l) => entry?.[l]);
  if (langs.some((r) => r && r.verdict === 'copied')) return TECH_TAG.NEEDS_REWRITE;
  if (langs.some((r) => isUnverified(r))) return TECH_TAG.UNCHECKED;
  return TECH_TAG.MIGRATED;
}

/** Свод двух языков → один указатель `слаг → { ru, en }`. Слаг уникален, проверено на 5111. */
export function indexSvod(byLang) {
  const index = new Map();
  for (const lang of SVOD_LANGS) {
    for (const rec of byLang[lang] ?? []) {
      const entry = index.get(rec.slug) ?? {};
      entry[lang] = rec;
      index.set(rec.slug, entry);
    }
  }
  return index;
}

/**
 * СОЕДИНЕНИЕ ЗАПИСИ КАТАЛОГА СО СВОДОМ. Ключ свода — слаг публичного адреса, а не идентификатор.
 *
 * Первый ход — та же функция, которой слаг и рождался (`slugify` из продукта, не копия её здесь).
 * Второй ход нужен ровно для одного случая: владелец правил НАЗВАНИЕ после того, как свод сняли, —
 * тогда слаг разъехался, а хвост идентификатора внутри него остался прежним. Совпадение по хвосту
 * названо в отчёте отдельным числом: это не «всё сошлось», а «сошлось иначе, чем ожидалось».
 *
 * Больше одной записи свода на хвост — НЕ повод выбрать первую: возвращаем неоднозначность, и
 * класс такой записи не присваивается вовсе.
 */
export function matchSvod(dim, index) {
  const key = slugify(dim.title?.en || dim.title?.ru, dim.id);
  const direct = index.get(key);
  if (direct) return { slug: key, entry: direct, via: 'слаг' };

  const tail = String(dim.id).slice(0, TAIL_LENGTH).toLowerCase();
  const hits = [];
  for (const slug of index.keys()) {
    if (slug === tail || slug.endsWith(`-${tail}`)) hits.push(slug);
  }
  if (hits.length === 1) return { slug: hits[0], entry: index.get(hits[0]), via: 'хвост' };
  if (hits.length > 1) return { ambiguous: hits };
  return null;
}

/**
 * ПРЕДОХРАНИТЕЛЬ УТЕЧКИ: служебное значение в ПУБЛИЧНОМ поле `tags`.
 *
 * Возвращает найденное значение (или `null`). Прибор, увидев его хоть у одной записи, отказывается
 * работать целиком: одно такое значение означает, что служебный тег уже уехал на публичную
 * страницу каталога, и правильный ход — разобраться, откуда он там, а не дописать поверх.
 */
export function leakedTechTag(tags) {
  for (const t of tags ?? []) {
    if (LIFECYCLE_TECH_TAGS.includes(String(t))) return String(t);
  }
  return null;
}

/**
 * НОВОЕ ЗНАЧЕНИЕ `techTags` ИЛИ `null`, ЕСЛИ ПИСАТЬ НЕЧЕГО.
 *
 * Облако тегов, а не поле-статус (слово владельца: «*тегов можно сколько хочешь вешать*»), поэтому
 * чужие технические теги сохраняются — заменяется только тег жизненного цикла. Повторный прогон
 * по размеченному каталогу не пишет НИЧЕГО: 5121 запись Firestore при суточной квоте 20 000
 * слишком дороги, чтобы тратить их на подтверждение уже известного.
 */
export function techTagsFor(existing, cls) {
  const kept = (existing ?? []).map(String).filter((t) => !LIFECYCLE_TECH_TAGS.includes(t));
  const next = [...kept, cls].sort();
  const now = [...(existing ?? []).map(String)].sort();
  const same = now.length === next.length && now.every((v, i) => v === next[i]);
  return same ? null : next;
}

/** Нарезка на пакеты записи. Вынесена ради юнита: потолок пакета — граница, а не деталь. */
export function chunk(items, size = BATCH_SIZE) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * РАЗБОР ВСЕГО КАТАЛОГА — чистая функция: на входе записи, свод и очередь кандидатов.
 *
 * 🔴 ЗАПИСЬ ВНЕ СВОДА СУДИТСЯ ДРУГИМ ИСТОЧНИКОМ, А НЕ ДОГАДКОЙ. Каталог вырос (5111 → 5121)
 * уже после того, как свод сняли, и «нет записи в своде» — утверждение о нашем ПОИСКЕ, а не о
 * качестве текста (`EXP-0165`). Судить такую запись сводом нечем — зато о ней может знать очередь
 * кандидатов: одобренный кандидат с адресом этого измерения означает, что запись прошла через
 * руки владельца. Это `owner-approved` (слово владельца, интервью №044 В4 = A).
 *
 * 🔴 А ЕСЛИ КАНДИДАТА НЕТ — КЛАСС НЕ ПРИСВАИВАЕТСЯ, и это НЕ «такого не бывает». В панели есть
 * ВТОРАЯ законная дверь: ручная форма создания измерения (`src/routes/admin/dims/+page.svelte`
 * зовёт `createDim` напрямую, минуя кандидатов). Запись, заведённая ею, кандидата не имеет
 * никогда. Отсутствие кандидата поэтому не улика: оно значит «мы не нашли», а не «владелец не
 * видел» (`EXP-0165` ровно про это). Такие записи печатаются поимённо и ждут решения человека.
 */
export function planCatalog(dims, index, threshold = RUN_THRESHOLD, approved = new Map()) {
  const rows = [];
  const unknown = [];
  const ambiguous = [];
  const counts = {
    [TECH_TAG.MIGRATED]: 0,
    [TECH_TAG.NEEDS_REWRITE]: 0,
    [TECH_TAG.UNCHECKED]: 0,
    [TECH_TAG.OWNER_APPROVED]: 0,
  };
  const recorded = { [TECH_TAG.MIGRATED]: 0, [TECH_TAG.NEEDS_REWRITE]: 0, [TECH_TAG.UNCHECKED]: 0 };
  let matchedByTail = 0;

  for (const dim of dims) {
    if (dim.id === SERVICE_DOC_ID) continue;
    const hit = matchSvod(dim, index);
    if (!hit) {
      const кандидат = approved.get(dim.id);
      if (кандидат === undefined) {
        unknown.push({ id: dim.id, title: dim.title?.ru || dim.title?.en || '' });
        continue;
      }
      counts[TECH_TAG.OWNER_APPROVED] += 1;
      rows.push({
        id: dim.id,
        slug: null,
        cls: TECH_TAG.OWNER_APPROVED,
        via: `кандидат ${кандидат}`,
        tags: dim.tags ?? [],
        techTags: dim.techTags ?? [],
      });
      continue;
    }
    if (hit.ambiguous) {
      ambiguous.push({ id: dim.id, slugs: hit.ambiguous });
      continue;
    }
    if (hit.via === 'хвост') matchedByTail += 1;
    const cls = classify(hit.entry, threshold);
    counts[cls] += 1;
    recorded[recordedClass(hit.entry)] += 1;
    rows.push({
      id: dim.id,
      slug: hit.slug,
      cls,
      via: hit.via,
      tags: dim.tags ?? [],
      techTags: dim.techTags ?? [],
    });
  }
  return { rows, unknown, ambiguous, counts, recorded, matchedByTail };
}

/**
 * ДВЕ ПРОВЕРКИ СУММЫ — и обе обязаны быть зелёными до того, как прибор напишет хоть одну запись.
 *
 * ① Разбор никого не потерял: классы + не в своде + неоднозначные = число записей каталога.
 *    Ловит дефект в самом разборе (запись прошла мимо всех веток и исчезла молча).
 * ② Вывод согласен со сводом: числа классов совпадают с числами по ярлыкам свода.
 *    Ловит уехавший порог — ту самую мутацию, которой план проверяет этот прибор.
 */
export function crossCheck(plan, catalogSize) {
  const classified = Object.values(plan.counts).reduce((a, b) => a + b, 0);
  const total = classified + plan.unknown.length + plan.ambiguous.length;
  const sumOk = total === catalogSize;
  // Сверяются только классы, ВЫВЕДЕННЫЕ ИЗ СВОДА: `owner-approved` приходит из очереди
  // кандидатов, и спрашивать о нём ярлыки свода не у кого.
  const svodOk = SVOD_CLASSES.every((t) => plan.counts[t] === plan.recorded[t]);
  return { sumOk, svodOk, classified, total, catalogSize };
}

/**
 * КОНТРОЛЬНЫЕ СЛУЧАИ — записи, чей класс известен человеку, а не выведен этим же прибором.
 *
 * ⚠️ Случай из плана (`the-matrix-reloaded-qk7spuk4`, «до правки был копией») сюда взят с ДРУГИМ
 * ожиданием: к моменту снятия свода запись уже вычистили (`tools/rewrites-ru-final.json`), и в
 * своде она чистая. Ждать от неё `needs-rewrite` значило бы требовать от прибора неправды.
 * Именно поэтому она и осталась в списке — как страж обратного хода: вычищенная запись НЕ должна
 * снова числиться требующей правки.
 */
export const CONTROL_CASES = Object.freeze([
  {
    slug: 'the-matrix-z3jmk1ix',
    ждём: TECH_TAG.NEEDS_REWRITE,
    почему: 'русское описание — копия, ряд 28 слов',
  },
  {
    slug: 'corrective-measures-akp4cezf',
    ждём: TECH_TAG.NEEDS_REWRITE,
    почему: 'английское описание — копия, ряд 50 слов',
  },
  {
    slug: 'titanic-ivgignxl',
    ждём: TECH_TAG.MIGRATED,
    почему: 'ряд 58 слов, но это ПЕРЕЧЕНЬ ИМЁН, а не речь',
  },
  {
    slug: 'the-ragged-trousered-philanthropists-05ncdnpb',
    ждём: TECH_TAG.UNCHECKED,
    почему: 'статья не нашлась — судить нечем',
  },
  {
    slug: 'the-matrix-reloaded-qk7spuk4',
    ждём: TECH_TAG.MIGRATED,
    почему: 'копия вычищена до снятия свода — обратного хода быть не должно',
  },
]);

/**
 * ОДОБРЕННЫЕ КАНДИДАТЫ: `идентификатор рождённого измерения → идентификатор кандидата`.
 *
 * Форма связи снята С КОДА КОНВЕЙЕРА, а не придумана: одобрение пишет кандидату
 * `status: 'approved'` и `approvedDimId` с адресом только что рождённого измерения
 * (`src/lib/data/admin-dims.ts` → `approveCandidate`; тем же полем ходит `fix-catalog-tags.mjs`).
 *
 * 🔑 Статус проверяется ТОЧНЫМ равенством. У кандидата их четыре — `pending` · `approved` ·
 * `rejected` · `returned`, — и три из них означают, что владелец записи НЕ одобрял: возвращённый
 * на доработку кандидат тоже несёт `approvedDimId`, если его когда-то одобряли, и «есть поле»
 * не равно «одобрено».
 */
export function indexApprovedCandidates(candidates) {
  const index = new Map();
  for (const c of candidates ?? []) {
    if (c?.status !== 'approved') continue;
    const dimId = c.approvedDimId;
    if (typeof dimId === 'string' && dimId !== '') index.set(dimId, c.id);
  }
  return index;
}

/** Чтение свода с диска. Тонкая обёртка над ядром: всё, что можно проверить, проверяется без неё. */
export function loadSvod(dir) {
  const byLang = {};
  for (const lang of SVOD_LANGS) {
    byLang[lang] = JSON.parse(readFileSync(join(dir, `wiki-overlap-${lang}.json`), 'utf8'));
  }
  return byLang;
}

// ── ЗАПУСК: всё, что ниже, работает только когда файл ЗАПУСТИЛИ, а не подключили ────────────

/*
 * 🔴 Оплачено 2026-08-17 соседним прибором (`measure-wikipedia-overlap.mjs`): файл, у которого
 * есть и экспорт, и работа на верхнем уровне, обязан спрашивать, запустили его или подключили.
 * Иначе юнит, импортирующий ядро, получает чужой прогон с `process.exit` в конце.
 */
const runAsScript = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (runAsScript) {
  const argOf = (name, def = null) => {
    const i = process.argv.indexOf(name);
    return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
  };
  const CONTOUR = argOf('--contour', 'stand');
  const SVOD_DIR = argOf('--svod-dir', SVOD_DIR_DEFAULT);
  const APPLY = process.argv.includes('--apply');
  const SELFTEST = process.argv.includes('--selftest');
  const AUTH = argOf('--auth-owner', null);
  const THRESHOLD = Number(argOf('--run-threshold', RUN_THRESHOLD));
  /*
   * 🔴 Снимок ПЕРЕД записью обязателен вне стенда и не обсуждается. 5121 запись обратно руками не
   * вернуть, а `.private/` лежит вне git — там ему и место (снимок каталога: не секрет, но и не
   * история проекта).
   */
  const BACKUP = process.argv.includes('--backup') || (APPLY && CONTOUR !== 'stand');

  const свод = loadSvod(SVOD_DIR);
  const index = indexSvod(свод);

  // ── САМОТЕСТ: свод на месте и разбор согласен с известными случаями. Без базы и без сети ──
  if (SELFTEST) {
    console.log('\n═══ САМОТЕСТ РАЗБОРА (без сети и без базы) ═══');
    console.log(`Свод: ${SVOD_DIR}`);
    for (const lang of SVOD_LANGS) console.log(`  ${lang}: ${свод[lang].length} записей`);
    console.log(`Слагов в указателе: ${index.size}`);

    let плохо = 0;
    console.log('\nКонтрольные случаи (класс известен человеку, а не выведен прибором):');
    for (const c of CONTROL_CASES) {
      const entry = index.get(c.slug);
      const got = entry ? classify(entry, THRESHOLD) : '— НЕТ В СВОДЕ';
      const ok = got === c.ждём;
      if (!ok) плохо += 1;
      console.log(`  ${ok ? '✅' : '❌'} ${c.slug}`);
      console.log(`       ждём ${c.ждём} · получили ${got} — ${c.почему}`);
    }

    // Разбор всего свода сам с собой: вывод по порогу против ярлыков свода.
    const свои = { [TECH_TAG.MIGRATED]: 0, [TECH_TAG.NEEDS_REWRITE]: 0, [TECH_TAG.UNCHECKED]: 0 };
    const ярлыки = { [TECH_TAG.MIGRATED]: 0, [TECH_TAG.NEEDS_REWRITE]: 0, [TECH_TAG.UNCHECKED]: 0 };
    for (const entry of index.values()) {
      свои[classify(entry, THRESHOLD)] += 1;
      ярлыки[recordedClass(entry)] += 1;
    }
    const согласны = SVOD_CLASSES.every((t) => свои[t] === ярлыки[t]);
    if (!согласны) плохо += 1;
    console.log(`\nРазбор свода при пороге ${THRESHOLD} слов:`);
    for (const t of SVOD_CLASSES) {
      console.log(
        `  ${t.padEnd(14)} вывод ${String(свои[t]).padStart(5)} · ярлык свода ${String(ярлыки[t]).padStart(5)}`,
      );
    }
    const сумма = Object.values(свои).reduce((a, b) => a + b, 0);
    console.log(`  сумма ${сумма} при ${index.size} слагах свода`);
    console.log(`  ${согласны ? '✅' : '❌'} вывод и ярлыки свода ${согласны ? 'согласны' : 'РАЗОШЛИСЬ — порог уехал'}`);

    console.log(плохо ? `\n❌ САМОТЕСТ КРАСНЫЙ: расхождений ${плохо}` : '\n✅ САМОТЕСТ ЧИСТ');
    process.exit(плохо ? 1 : 0);
  }

  // ── ЗАМОК ЖИВОГО КОНТУРА ─────────────────────────────────────────────────────────────────
  /*
   * Запись 5121 боевой записи — решение владельца, а не побочный эффект запуска прибора. Слово
   * получено (интервью №039, В2 = A) и передаётся В ЯВНОМ ВИДЕ: через месяц никто не вспомнит,
   * по чьему слову изменился весь каталог, а строка запуска останется в отчёте.
   */
  if (APPLY && CONTOUR !== 'stand' && !AUTH) {
    console.error('🔴 Запись по живому контуру требует слова владельца.');
    console.error('   Снять замок: --auth-owner "A — размечаем всё. но не сегодня, планируем в четверг это сделать"');
    console.error('   (интервью №039, В2 = A). Сухой прогон замка не требует.');
    process.exit(2);
  }

  // ── БАЗА ─────────────────────────────────────────────────────────────────────────────────
  const { cert, initializeApp } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  let db;
  if (CONTOUR === 'stand') {
    process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8181';
    initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'demo-ndim-dev' });
    db = getFirestore();
  } else {
    const { serviceAccount } = await import('./lib/credentials.mjs');
    const { CONTOURS } = await import('./lib/contours.mjs');
    const contour = CONTOURS[CONTOUR];
    if (contour === undefined) {
      console.error(`Неизвестный контур «${CONTOUR}». Возможные: stand · stage · prod`);
      process.exit(2);
    }
    initializeApp({ credential: cert(serviceAccount(CONTOUR)), projectId: contour.project });
    db = getFirestore(contour.database);
  }

  console.log('\n═══ ТЕХНИЧЕСКИЕ ТЕГИ ОДОБРЕНИЯ — plans/58 шаг 1 ═══');
  console.log(`Контур: ${CONTOUR} · режим: ${APPLY ? '🔴 ЗАПИСЬ' : 'сухой прогон'} · порог ряда: ${THRESHOLD} слов`);
  console.log(`Свод: ${SVOD_DIR} (только чтение, Википедия повторно НЕ обходится)`);

  const snap = await db.collection('dims').get();
  const dims = [];
  for (const doc of snap.docs) {
    if (doc.id === SERVICE_DOC_ID) continue;
    const d = doc.data() ?? {};
    dims.push({ id: doc.id, title: d.title ?? {}, tags: d.tags ?? [], techTags: d.techTags ?? [] });
  }
  /*
   * Очередь кандидатов — ВТОРОЙ источник правды, и нужен он только записям вне свода. Читается
   * целиком: очередь на порядки меньше каталога (сотни против пяти тысяч), а выборка по статусу
   * потребовала бы индекса ради экономии, которой не видно.
   */
  const candSnap = await db.collection('dim_candidates').get();
  const approved = indexApprovedCandidates(candSnap.docs.map((d) => ({ id: d.id, ...(d.data() ?? {}) })));

  console.log(`\nКаталог: ${dims.length} записей (служебный ${SERVICE_DOC_ID} не в счёт) · свод: ${index.size}`);
  console.log(`Очередь кандидатов: ${candSnap.size} · из них одобренных с адресом измерения: ${approved.size}`);

  // ── ПРЕДОХРАНИТЕЛЬ УТЕЧКИ — ДО всего остального ──────────────────────────────────────────
  const утечки = dims.map((d) => ({ id: d.id, tag: leakedTechTag(d.tags) })).filter((x) => x.tag);
  if (утечки.length) {
    console.error(`\n🔴 ОТКАЗ: служебное значение найдено в ПУБЛИЧНОМ поле tags у ${утечки.length} записей.`);
    for (const u of утечки.slice(0, 20)) console.error(`   ${u.id} → «${u.tag}»`);
    if (утечки.length > 20) console.error(`   … и ещё ${утечки.length - 20}`);
    console.error('   Публичное поле уже несёт служебный тег — значит утечка на страницу каталога');
    console.error('   уже случилась. Прибор не дописывает поверх утечки: сначала разберись, откуда она.');
    process.exit(3);
  }

  const plan = planCatalog(dims, index, THRESHOLD, approved);
  const check = crossCheck(plan, dims.length);

  console.log('\n── РАЗБОР ──');
  for (const t of SVOD_CLASSES) {
    console.log(`  ${t.padEnd(14)} ${String(plan.counts[t]).padStart(5)}   (по ярлыкам свода ${plan.recorded[t]})`);
  }
  console.log(
    `  ${TECH_TAG.OWNER_APPROVED.padEnd(14)} ${String(plan.counts[TECH_TAG.OWNER_APPROVED]).padStart(5)}   (по одобренным кандидатам, не по своду)`,
  );
  console.log(`  размечено     ${String(check.classified).padStart(5)}`);
  console.log(`  без источника ${String(plan.unknown.length).padStart(5)}   ← ни в своде, ни в одобренных кандидатах: класс НЕ присваивается`);
  console.log(`  неоднозначно  ${String(plan.ambiguous.length).padStart(5)}   ← класс НЕ присваивается`);
  console.log(`  ИТОГО         ${String(check.total).padStart(5)}   при ${check.catalogSize} записях каталога`);
  if (plan.matchedByTail) {
    console.log(`  ⚠️ по хвосту идентификатора: ${plan.matchedByTail} — название правили после снятия свода`);
  }

  console.log(`\n  ${check.sumOk ? '✅' : '❌'} ① сумма разбора ${check.sumOk ? 'сошлась' : 'НЕ СОШЛАСЬ'} с числом записей каталога`);
  console.log(`  ${check.svodOk ? '✅' : '❌'} ② вывод и ярлыки свода ${check.svodOk ? 'согласны' : 'РАЗОШЛИСЬ — порог уехал'}`);

  if (plan.unknown.length) {
    console.log(`\n🔴 БЕЗ ИСТОЧНИКА СУЖДЕНИЯ: ${plan.unknown.length}. Их судьбу решает человек, а не прибор.`);
    console.log('   Записи нет ни в своде, ни среди одобренных кандидатов. Это НЕ обязательно');
    console.log('   аномалия: измерение можно завести и ручной формой комнаты, минуя очередь');
    console.log('   кандидатов, — тогда кандидата у него нет никогда.');
    for (const u of plan.unknown) console.log(`   ${u.id}  ${u.title}`);
  }
  if (plan.ambiguous.length) {
    console.log(`\n⚠️ НЕОДНОЗНАЧНОЕ СОЕДИНЕНИЕ: ${plan.ambiguous.length}`);
    for (const a of plan.ambiguous) console.log(`   ${a.id} → ${a.slugs.join(' · ')}`);
  }

  const писать = plan.rows
    .map((r) => ({ id: r.id, cls: r.cls, next: techTagsFor(r.techTags, r.cls) }))
    .filter((r) => r.next);
  console.log(`\nК записи: ${писать.length} · уже размечено верно: ${plan.rows.length - писать.length}`);

  if (!APPLY) {
    console.log('\n⚪ СУХОЙ ПРОГОН — не записано НИЧЕГО. Писать: добавь --apply (и --backup).');
    process.exit(check.sumOk && check.svodOk ? 0 : 1);
  }

  // ── ЗАПИСЬ ───────────────────────────────────────────────────────────────────────────────
  if (!check.sumOk || !check.svodOk) {
    console.error('\n🔴 ОТКАЗ ЗАПИСИ: проверки разбора красные. Числам, которыми размечают каталог,');
    console.error('   верить нельзя, пока они не сошлись сами с собой.');
    process.exit(1);
  }

  if (BACKUP) {
    mkdirSync('.private', { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const file = join('.private', `tag-dims-approval--${CONTOUR}--${stamp}.json`);
    writeFileSync(file, JSON.stringify({ контур: CONTOUR, снят: stamp, записей: dims.length, dims }, null, 1), 'utf8');
    console.log(`\n💾 Снимок каталога ДО записи: ${file} (вне git)`);
  }

  console.log(`\n🔴 ЗАПИСЬ: ${писать.length} записей пакетами по ${BATCH_SIZE} (поле techTags; tags НЕ трогается)`);
  let сделано = 0;
  for (const пакет of chunk(писать, BATCH_SIZE)) {
    const batch = db.batch();
    for (const r of пакет) batch.update(db.collection('dims').doc(r.id), { techTags: r.next });
    await batch.commit();
    сделано += пакет.length;
    console.log(`   … ${сделано}/${писать.length}`);
  }
  console.log(`\n✅ ЗАПИСАНО: ${сделано}`);
}
