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

import type { Lang } from './langs';
/** Русская морфология живёт в общем модуле — своя копия склонения разъезжается (`bugs/15`-класс). */
import { unitRu } from '$lib/ui/format';

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

/** Заголовок вкладки хаба: «Фильмы — топ по версии NDim Space», у второй страницы — с номером. */
export const hubMetaTitle = (title: string, lang: Lang, page: number, pages: number): string => {
  const base = lang === 'en' ? `${title} — top rated on NDim Space` : `${title} — топ по версии NDim Space`;
  return page > 1 ? `${base}, ${CATALOG_COPY[lang].pageOf(page, pages)}` : base;
};

/** Описание хаба для выдачи. Название вида стоит подлежащим — морфология не требуется. */
export const hubMetaDesc = (title: string, lang: Lang): string =>
  lang === 'en'
    ? `${title} rated by people of the NDim Space. NDim Space Rating is the community rating.`
    : `${title} с оценками людей из Пространства NDim. NDim Space Rating — рейтинг сообщества.`;
