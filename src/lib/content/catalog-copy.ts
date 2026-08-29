/**
 * ТЕКСТЫ ХАБОВ КАТАЛОГА — лицо продукта, а не производная от данных (`plans/48` шаг 3).
 *
 * Правила, по которым это написано, и где они записаны:
 *   · **словарь продукта** (`AGENT_GUIDE.md`) — «Измерение», а не «ось»; величина оценки зовётся
 *     своим именем **NDim Space Rating**, и это имя НЕ переводится ни на один язык;
 *   · **термин на витрине не бросается голым** (правка владельца 2026-08-02): не «5111
 *     измерений», а «объекты человеческой культуры». Внутри приложения словарь действует как
 *     прежде — здесь витрина;
 *   · обращение — на **«Вы»**; слово «навсегда» не пишется никогда;
 *   · **конкурентов не называем** ни в тексте, ни в сравнении (слово владельца 2026-08-03);
 *   · **независимость рейтинга не рекламируется**: «говорить об этом на витрине не нужно —
 *     достаточно этого не делать» (`AGENT_GUIDE.md` → NDSR). Поэтому здесь нет ни строчки
 *     «без рекламы и платного продвижения» — при том что это правда.
 *
 * 🔴 Английская половина ждёт вычитки владельца — то же условие, на котором выпускались страницы
 * объектов (интервью №023, В2 = А). Оба языка равнозначны (поправка владельца 2026-08-03), но
 * ни один из них агент не подписывает за владельца.
 *
 * ⚠️ Числа в текст НЕ зашиты: их приносит загрузчик из самого каталога. Литерал здесь был бы
 * `bugs/07` — выдуманное число на витрине.
 */

/*
 * 🔴 ИМПОРТЫ ЗДЕСЬ — С РАСШИРЕНИЕМ И БЕЗ АЛИАСА `$lib`, И ЭТО НЕ КОСМЕТИКА.
 *
 * Алиас существует только внутри Vite, поэтому модуль с `$lib` для `node --test` не существует
 * вовсе: попытка импорта падает на «Cannot find package '$lib'». Тексты хабов при этом — ровно
 * тот слой, который обязан проверяться юнитами, раз он теперь ветвится по составу страницы
 * (`plans/56` шаг 7); по той же причине их читает и страж хабов. Приём не выдуман: так же
 * устроен `catalog-hub.ts`. `format.ts` — лист без единого импорта, так что относительный путь
 * ничего за собой не тянет.
 */
import type { Lang } from './langs.ts';
import { hubPageState, type HubPageFacts, type HubPageState } from './catalog-hub.ts';
/** Русская морфология живёт в общем модуле — своя копия склонения разъезжается (`bugs/15`-класс). */
import { unitRu } from '../ui/format.ts';

export interface CatalogCopy {
  /** Индексная страница каталога. */
  readonly indexH1: string;
  readonly indexLede: string;
  readonly indexMetaTitle: string;
  readonly indexMetaDesc: string;
  /** Подписи полосы чисел: «в каталоге» / «с оценками». */
  readonly ofTotal: string;
  readonly ofRated: string;
  /** Хвост — виды, которым не хватило объектов на собственную страницу. */
  readonly tailH2: string;
  readonly tailLede: string;
  /** Строка смысла хаба (порядок карточек назван прямо — см. `compareForHub`). */
  readonly hubLede: string;
  /** Имя величины. Одно на все языки: это бренд, а не описание. */
  readonly ratingBrand: string;
  readonly noVotes: string;
  /** «оценено N людьми» — форма выбрана владельцем дословно (2026-08-03). */
  readonly voted: (n: number) => string;
  /** «страница 2 из 47». */
  readonly pageOf: (page: number, pages: number) => string;
  readonly up: string;
  readonly pagerLabel: string;
  readonly prev: string;
  readonly next: string;
  readonly siblingsLabel: string;
  /**
   * Заголовок блока соседей на карточке.
   *
   * 🔴 Формулировка «Рядом в Пространстве» ЗАПРЕЩЕНА (метаплан `plans/40`, ⛔-таблица): она про
   * людей и про математику похожести, а здесь — классификация каталога, и путать их нельзя.
   */
  readonly similar: string;
  readonly enter: string;
  readonly theme: string;
  readonly foot: string;
}

const RU: CatalogCopy = {
  indexH1: 'Каталог',
  indexLede:
    'Объекты человеческой культуры, которым люди Пространства ставят оценки: фильмы, ' +
    'видеоигры, сериалы, книги, музыка и практики. Выберите, что Вам ближе.',
  indexMetaTitle: 'Каталог NDim Space — фильмы, игры, книги и их рейтинги',
  indexMetaDesc:
    'Фильмы, видеоигры, телесериалы, романы, книги, музыка и практики с оценками людей из ' +
    'Пространства NDim. NDim Space Rating — рейтинг сообщества.',
  ofTotal: 'в каталоге',
  ofRated: 'с оценками',
  tailH2: 'Остальное',
  tailLede: 'Виды, у которых пока слишком мало объектов для собственной страницы.',
  /*
   * Порядок назван в самой строке — интервью №030, В2 = Д: «по оценке, но с учётом числа
   * голосов». Человек имеет право понимать, почему одно выше другого, и это дешевле объяснить
   * половиной предложения, чем оставить загадкой.
   */
  hubLede: 'Топ по версии NDim Space: выше то, что людям понравилось больше, — с поправкой на то, сколько человек оценило.',
  ratingBrand: 'NDim Space Rating',
  noVotes: 'ещё без голосов',
  voted: (n) => `оценено ${n} ${unitRu(n, ['человеком', 'людьми', 'людьми'])}`,
  pageOf: (page, pages) => `страница ${page} из ${pages}`,
  up: 'Каталог',
  pagerLabel: 'Страницы',
  prev: 'Назад',
  next: 'Дальше',
  siblingsLabel: 'Разделы каталога',
  similar: 'Похожие по каталогу',
  enter: 'Войти',
  theme: 'Тема',
  foot:
    'NDim Space — честный поиск похожих людей по математической близости. ' +
    'Бесплатно, без рекламы и без подписок.',
};

const EN: CatalogCopy = {
  indexH1: 'Catalog',
  indexLede:
    'Things people rate in the Space: films, video games, TV series, books, music and ' +
    'practices. Pick what is closest to you.',
  indexMetaTitle: 'NDim Space catalog — films, games, books and their ratings',
  indexMetaDesc:
    'Films, video games, TV series, novels, books, music and practices rated by people of ' +
    'the NDim Space. NDim Space Rating is the community rating.',
  ofTotal: 'in the catalog',
  ofRated: 'rated',
  tailH2: 'Everything else',
  tailLede: 'Kinds with too few objects for a page of their own.',
  hubLede: 'The NDim Space top: what people liked more comes first, adjusted for how many rated it.',
  ratingBrand: 'NDim Space Rating',
  noVotes: 'no ratings yet',
  voted: (n) => `rated by ${n} ${n === 1 ? 'person' : 'people'}`,
  pageOf: (page, pages) => `page ${page} of ${pages}`,
  up: 'Catalog',
  pagerLabel: 'Pages',
  prev: 'Back',
  next: 'Next',
  siblingsLabel: 'Catalog sections',
  similar: 'Similar in the catalog',
  enter: 'Log in',
  theme: 'Theme',
  foot:
    'NDim Space — an honest search for similar people by mathematical proximity. ' +
    'Free, no ads, no subscriptions.',
};

export const CATALOG_COPY: Record<Lang, CatalogCopy> = { ru: RU, en: EN };

/*
 * ── СНИППЕТ СТРАНИЦЫ ХАБА: ГОВОРИМ О ТОМ, ЧТО НА ЭТОЙ СТРАНИЦЕ (`plans/56` шаг 7) ────────────
 *
 * 🔴 ПОЧЕМУ ТРИ ТЕКСТА ЗНАЮТ СОСТАВ СТРАНИЦЫ, А НЕ СВОДКУ ВИДА. Разведка `researches/57`:
 * `/en/catalog/movie/25` называлась «Movies — top rated on NDim Space, page 25 of 47», а
 * оценённых на ней НОЛЬ из шестидесяти. Таких страниц 53 из 89 на язык (замер стража на
 * собранном сайте: 106 из 178 по обоим языкам). Описание при этом было одно на все 47 страниц
 * вида, буквально до знака.
 *
 * 🎯 ЦЕЛЬ ЭТИХ ТЕКСТОВ — ПУТЬ ЧЕЛОВЕКА, А НЕ «СТРАНИЦА ПЕРЕСТАЛА ВРАТЬ». Слово владельца
 * (`GOAL.md` → «Критерий пути человека»): «*путь его должен быть интересным, увлекательным,
 * чтобы пользователю была понятна ценность проекта и чтобы ему хотелось внутрь проекта*».
 * Правда — это ПОЛ, который мы не пробиваем, а не цель и не критерий: страница, честно
 * сообщившая, что на ней ничего нет, свою работу ещё не сделала. Мерять эти тексты надо тем,
 * захотелось ли человеку внутрь.
 *
 * ⚠️ И ЧЕГО ЭТА ПРАВКА НЕ ОБЕЩАЕТ — названо здесь, а не в отчёте, чтобы не потерялось. Кликов
 * она не обещает: замер по снимку Search Console развёл две группы, и страницы с ПРАВДИВЫМ
 * заголовком собрали ровно тот же ноль кликов, что и лгущие (82 показа против 117) — то есть
 * сниппет нулевой CTR не объясняет вовсе (`EXP-0218`).
 */

/**
 * Заголовок вкладки хаба.
 *
 * Страница, где есть хотя бы один оценённый объект, — «топ по версии NDim Space»: её порядок
 * действительно определяется взвешенной оценкой. Страница, где оценённых нет вовсе, называет
 * себя тем, что она есть, — куском каталога.
 */
export const hubMetaTitle = (title: string, lang: Lang, facts: HubPageFacts): string => {
  /*
   * 🔴 СМЕШАННАЯ СТРАНИЦА ПОКА ДЕЛИТ ЗАГОЛОВОК С ПОЛНОСТЬЮ ОЦЕНЁННОЙ, И ЭТО НАЗВАНО ВСЛУХ.
   * Порядок на ней действительно определяется взвешенной оценкой, поэтому «топ» — не ложь; но
   * при 9 оценённых из 60 он оверселлит, и различить её обязано ЧИСЛО в описании («оценено 9 из
   * 60»), а не третья формулировка заголовка. Собственный заголовок смешанного случая — текст
   * лица продукта: он ждёт вычитки владельца, и точка подстановки для него здесь.
   */
  const claimsTop = hubPageState(facts) !== 'none';
  const base =
    lang === 'en'
      ? `${title} — ${claimsTop ? 'top rated on NDim Space' : 'NDim Space catalog'}`
      : `${title} — ${claimsTop ? 'топ по версии NDim Space' : 'каталог NDim Space'}`;
  // Номер — со второй страницы, как было до шага 7. Первая страница хаба живёт на собственном
  // адресе без номера, и «страница 1 из 47» в её заголовке спорила бы с её же адресом.
  return facts.page > 1 ? `${base}, ${CATALOG_COPY[lang].pageOf(facts.page, facts.pages)}` : base;
};

/**
 * ОРИЕНТИР ДЛИНЫ ОПИСАНИЯ. Не «правило поисковика» — правила на длину у Google нет; это ширина,
 * после которой сниппет обрезается в выдаче, и обрезанное последнее слово читается как небрежность.
 *
 * 📐 Число не из головы: прогон шаблона по всем 89 страницам × 2 языка дал **35 переполнений из
 * 178 (20 %)**, худшая строка 204 знака, и хуже всех — случай без оценок (замер Дизайнера).
 * Поэтому ниже стоит ЛЕСТНИЦА ОТКАТА, а не обрезка: обрезка рвёт слово, лестница снимает
 * содержимое целыми кусками.
 */
export const DESC_LIMIT = 155;

/** Имя объекта в кавычках: ёлочки в русском, парные английские в EN. */
const q = (s: string, lang: Lang) => (lang === 'en' ? `“${s}”` : `«${s}»`);

/**
 * ГОЛОВА ОПИСАНИЯ — три ступени от полной к короткой.
 *
 * ⚠️ Последняя ступень несёт НОМЕР СТРАНИЦЫ, и это не украшение: без него две страницы одного
 * вида, докатившиеся до третьей ступени, дали бы побайтно одинаковое описание — то есть тот
 * самый дубль, ради которого шаг затеян (замер: без номера совпали две).
 */
const heads = (title: string, lang: Lang, facts: HubPageFacts, pageOf: string): string[] => {
  const n = facts.names.map((s) => q(s, lang));
  const en = lang === 'en';
  const out: string[] = [];
  if (n.length >= 2) {
    out.push(
      en
        ? `${title}: ${n[0]}, ${n[1]} and ${facts.count - 2} more on this page.`
        : `${title}: ${n[0]}, ${n[1]} и ещё ${facts.count - 2} на этой странице.`,
    );
  }
  if (n.length >= 1) {
    out.push(
      en
        ? `${title}: ${n[0]} and ${facts.count - 1} more on this page.`
        : `${title}: ${n[0]} и ещё ${facts.count - 1} на этой странице.`,
    );
  }
  out.push(en ? `${title}, ${pageOf} — ${facts.count}.` : `${title}, ${pageOf} — ${facts.count}.`);
  return out;
};

/**
 * ХВОСТ ОПИСАНИЯ — свой у каждого из ТРЁХ состояний страницы.
 *
 * [AI] Все три редакции написаны агентом и ЖДУТ ВЫЧИТКИ ВЛАДЕЛЬЦА (`plans/56` шаг 7; кандидаты
 * и довод — `researches/57` → «Предложение шаблона», поправки Дизайнера смены 12). Снимает
 * пометку только его слово. Форма — по канону лица продукта 2026-08-28: констатация факта и
 * мягкое пояснение, что это такое; ни обещаний, ни оправданий.
 *
 * 🔑 Смешанное состояние НАЗЫВАЕТ ЧИСЛО, а не объясняется абзацем. Это прямой урок шага 1 той же
 * фазы: состояние продукта ПОКАЗЫВАЮТ, а не разъясняют, — «оценено 9 из 60» отличает `book` от
 * `tv-series/2` (58 из 60) одним фактом и без единого лишнего предложения.
 */
const tails: Record<HubPageState, (lang: Lang, f: HubPageFacts) => string> = {
  none: (lang) =>
    lang === 'en'
      ? 'NDim Space Rating appears on an object once people of NDim Space rate it.'
      : 'NDim Space Rating появляется у объекта, когда его оценивают люди Пространства NDim.',
  mixed: (lang, f) =>
    lang === 'en'
      ? `${f.rated} of ${f.count} rated — NDim Space Rating shows the community rating.`
      : `Оценено ${f.rated} из ${f.count} — NDim Space Rating показывает оценку сообщества.`,
  all: (lang) =>
    lang === 'en'
      ? 'Rated by people of NDim Space; NDim Space Rating is the community rating.'
      : 'С оценками людей Пространства NDim. NDim Space Rating — рейтинг сообщества.',
};

/**
 * Описание хаба для выдачи — своё у каждой страницы.
 *
 * Вид стоит ПОДЛЕЖАЩИМ, поэтому русская морфология не нужна вовсе: склонять в «Фильмы: «X», «Y»
 * и ещё 58 на этой странице» нечего. Прежняя редакция держалась того же приёма, и он остаётся —
 * новых форм склонения шаг 7 не заводит.
 *
 * ⚠️ Апострофы и кавычки ВНУТРИ имён приходят из данных и ровняются НЕ здесь: в каталоге они
 * смешаны (U+2019 у «Queen’s», прямой U+0027 у «Dead Man's»). Шаблон обрамляет имя своими
 * кавычками и в чужие глифы не лезет — иначе он правил бы данные молча.
 */
export const hubMetaDesc = (title: string, lang: Lang, facts: HubPageFacts): string => {
  const pageOf = CATALOG_COPY[lang].pageOf(facts.page, facts.pages);
  const tail = tails[hubPageState(facts)](lang, facts);
  const ladder = heads(title, lang, facts, pageOf).map((h) => `${h} ${tail}`);
  // Первая ступень, которая влезает. Последняя влезает по построению — она короче всех.
  return ladder.find((v) => v.length <= DESC_LIMIT) ?? ladder[ladder.length - 1];
};

/**
 * Строка смысла НА САМОЙ странице — та же правда, что и в заголовке вкладки.
 *
 * 🔴 Почему она едет вместе с заголовком, хотя критерий порции называл только `title`: неправду
 * видит ЧЕЛОВЕК, а не только робот. Починить невидимый `<title>` и оставить видимую строку
 * обещать «топ» там, где оценок нет, значило бы вылечить половину одного дефекта.
 *
 * [AI] Редакция для страницы без оценённых написана агентом и ЖДЁТ ВЫЧИТКИ ВЛАДЕЛЬЦА. Редакция
 * для страницы с оценёнными — прежняя, ни на знак не тронута.
 */
export const hubLede = (lang: Lang, facts: HubPageFacts): string => {
  const state = hubPageState(facts);
  if (state === 'all') return CATALOG_COPY[lang].hubLede;
  if (state === 'mixed') {
    // Порядок на смешанной странице тот же взвешенный — прежняя строка остаётся верной; число
    // оценённых договаривает то, чего она не знает.
    return lang === 'en'
      ? `${CATALOG_COPY.en.hubLede} ${facts.rated} of ${facts.count} on this page are rated.`
      : `${CATALOG_COPY.ru.hubLede} Оценено ${facts.rated} из ${facts.count} на этой странице.`;
  }
  return lang === 'en'
    ? 'Objects of this kind that no one has rated yet. NDim Space Rating appears on an object once people of NDim Space rate it.'
    : 'Объекты этого вида, которые пока никто не оценил. NDim Space Rating появляется у объекта, когда его оценивают люди Пространства NDim.';
};
