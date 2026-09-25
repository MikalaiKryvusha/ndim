/**
 * МАТЕРИАЛ ТЕСТА НА СОВМЕСТИМОСТЬ НОВОЙ V1 — десять объектов каталога и три персонажа
 * (`plans/106` шаг Д1; эпик `plans/104`, фаза 2).
 *
 * Слово владельца о демо, интервью №096 В14: «*смесь ТОП фильмов, сериалов, качеств - то, что знают
 * или слышали 99% всех людей, очень популярных расхожие вещи. Можно до 10 штук, сделать компактно по
 * вертикали список*». И №096 В8 = А: «*нужны честные изменения, которые реально внутри продукта
 * будут*» — поэтому каждый объект здесь НАСТОЯЩЕЕ измерение каталога, и звезда, поставленная в
 * демо, уезжает в NDim ID гостя под тем же id.
 *
 * Состав списка (замер каталога боя 2026-09-25 15:21, 5 153 записи):
 * · фильмы и сериал — пять вещей с утверждённого владельцем макета новой V1 («Гарри Поттер и философский камень»,
 *   «Матрица», «Интерстеллар», «Игра Престолов», «Титаник») и «Побег из Шоушенка», второй фильм каталога по голосам
 *   (`[AI]` — добавлен агентом до десяти);
 * · практики — четыре самые оцениваемые по голосам людей Пространства, при равных голосах выше NDim Space Rating:
 *   «Секс» 11 · «Настольные игры» 7 · «Употребление алкогольных напитков» 7 · «Чтение» 6 (NDSR 9,3; «Велоспорт» и
 *   «Курение» — тоже по 6, NDSR 8,5 и 3,3).
 * 🔴 ОТБОР ПРАКТИК — ГОЛОСАМИ ЛЮДЕЙ, НЕ ВКУСОМ АГЕНТА. Слово владельца о витрине, 2026-09-05, дословно: «*Про секс я
 * уже отвечал — ДА, ТАК ПОЛУЧАЕТСЯ ПО ГОЛОСАМ ЛЮДЕЙ, ТАК И ПОКАЗЫВАЕМ. НУ И ЧТО, ЧТО СЕКС — СЕКС это хорошо, люди
 * любят, вот и показываем честно.*» (память проекта `show-catalog-honestly`; главная V5 в `PROJECT_HISTORY.md`) и
 * №066 В2 = А. Агент дважды подменял отбор вкусом — «Путешествия» (3 голоса) вместо «Секса» и «Велоспорт» (6) вместо
 * «Употребления алкогольных напитков» (7); оба раза нашёл суд 2026-09-25. Снять практику можно только по инженерной
 * причине, записанной здесь. Оценки персонажей переезжали на новую строку без изменения чисел — кроме одной: Макс
 * ставил «Велоспорту» 10, а «Употреблению алкогольных напитков» ставит 8, чтобы «Любит:» (два объекта с высшими
 * оценками) правдиво называл «Матрицу» (10) и «Игру Престолов» (9); пример теста «Матрица 9 → Макс 40 %» от этого не
 * меняется — в нём участвует одна «Матрица» (находка независимой проверки 2026-09-25).
 *
 * 🔴 Модуль НЕ импортирует каталог (`EXP-0136`: универсальная загрузка утащила бы 17 МБ в бандл).
 * Названия, годы, NDSR и голоса — снимок записей каталога на дату выше; расхождение с живым
 * каталогом ловит юнит `landing-demo.test.ts`, когда `dims-build.json` лежит на диске.
 *
 * Оценки персонажей `[AI]` — данные демо, согласованные с принятыми строками характера
 * («Алиса любит фантастику и истории о волшебстве», «Настя любит сериалы и истории о большой
 * любви»). Макс оценил НЕ всё — так в демо видна Общность: похожесть растёт и от того, насколько
 * широко пересекаются описания.
 * [NOT-TESTED]
 */
import type { KindKey } from './dim-kind';
import type { Lang } from './langs';

export interface DemoItem {
  /** id документа `dims/{id}` — тот же, под которым оценка ляжет в `points/{uid}/dims`. */
  readonly id: string;
  readonly slug: string;
  readonly kind: KindKey;
  readonly title: Readonly<Record<Lang, string>>;
  /** Год — только у фильмов и сериалов; у практик года нет на лице. */
  readonly year: string | null;
  /** NDim Space Rating и число голосов — для экрана «Измерения» в рамке телефона. */
  readonly rating: number;
  readonly votes: number;
}

export const DEMO_ITEMS: readonly DemoItem[] = [
  { id: 'dqjAgEOnbwCm7fMx2vTx', slug: 'harry-potter-and-the-sorcerer-s-stone-dqjageon', kind: 'movie', title: { ru: 'Гарри Поттер и философский камень', en: "Harry Potter and the Sorcerer's Stone" }, year: '2001', rating: 8.4, votes: 14 },
  { id: 'bqZ7OrSQO0aiPZX2sCKA', slug: 'the-shawshank-redemption-bqz7orsq', kind: 'movie', title: { ru: 'Побег из Шоушенка', en: 'The Shawshank Redemption' }, year: '1994', rating: 9.4, votes: 12 },
  { id: 'Z3jmK1IXmsKEneI72RVH', slug: 'the-matrix-z3jmk1ix', kind: 'movie', title: { ru: 'Матрица', en: 'The Matrix' }, year: '1999', rating: 9.3, votes: 11 },
  { id: 'wPykOfIB7PRnIMwvHHho', slug: 'interstellar-wpykofib', kind: 'movie', title: { ru: 'Интерстеллар', en: 'Interstellar' }, year: '2014', rating: 9.2, votes: 10 },
  { id: 'ivGigNxl0Szdt4LXlz5h', slug: 'titanic-ivgignxl', kind: 'movie', title: { ru: 'Титаник', en: 'Titanic' }, year: '1997', rating: 9, votes: 8 },
  { id: 'KX10jyFBeXdj28dU4S3i', slug: 'game-of-thrones-kx10jyfb', kind: 'tv-series', title: { ru: 'Игра Престолов', en: 'Game of Thrones' }, year: '2011', rating: 9.1, votes: 8 },
  { id: 'BDsOxBipIv04OwFlWuRv', slug: 'sex-bdsoxbip', kind: 'practice', title: { ru: 'Секс', en: 'Sex' }, year: null, rating: 9.4, votes: 11 },
  { id: 'HW247wWXQMxb1aFFFdFJ', slug: 'board-gaming-hw247wwx', kind: 'practice', title: { ru: 'Настольные игры', en: 'Board Gaming' }, year: null, rating: 7.1, votes: 7 },
  { id: 'FBvganYvQcCGOQCrR7ky', slug: 'alcohol-consumption-fbvganyv', kind: 'practice', title: { ru: 'Употребление алкогольных напитков', en: 'Alcohol Consumption' }, year: null, rating: 5.7, votes: 7 },
  { id: 'mDnwq3epw5X4MokeMd9v', slug: 'reading-mdnwq3ep', kind: 'practice', title: { ru: 'Чтение', en: 'Reading' }, year: null, rating: 9.3, votes: 6 },
];

/** Короткие имена объектов для оценок персонажей — читаемость таблицы ниже, а не второй id. */
const [HP, SHAWSHANK, MATRIX, INTERSTELLAR, TITANIC, GOT, SEX, BOARD, ALCOHOL, READING] = DEMO_ITEMS.map((d) => d.id);

export type PersonaId = 'alice' | 'max' | 'nastya';

export interface DemoPersona {
  readonly id: PersonaId;
  /** Имена популярны в своём языке — решение владельца 2026-07-11: Алиса/Emma, Макс/Liam, Настя/Mia. */
  readonly name: Readonly<Record<Lang, string>>;
  readonly age: number;
  /** Цвет кольца и угол на карте — из макета `design/new-landing-v1.html`. */
  readonly color: string;
  readonly angle: number;
  readonly ratings: Readonly<Record<string, number>>;
  /** Пузырь над портретом в герое — объект с оценкой 10 (макет: «Матрица» ★ 10 у Макса). */
  readonly favorite: string;
  /** Строка «Любит:» карточки персонажа — два объекта с высшими оценками персонажа. */
  readonly loves: readonly [string, string];
}

export const DEMO_PERSONAS: readonly DemoPersona[] = [
  {
    id: 'alice',
    name: { ru: 'Алиса', en: 'Emma' },
    age: 27,
    color: '#7c5cff',
    angle: -90,
    ratings: { [HP]: 10, [SHAWSHANK]: 8, [MATRIX]: 7, [INTERSTELLAR]: 10, [TITANIC]: 8, [GOT]: 6, [SEX]: 9, [READING]: 10, [BOARD]: 7, [ALCOHOL]: 4 },
    favorite: INTERSTELLAR,
    loves: [INTERSTELLAR, HP],
  },
  {
    id: 'max',
    name: { ru: 'Макс', en: 'Liam' },
    age: 31,
    color: '#0ea578',
    angle: 28,
    ratings: { [MATRIX]: 10, [INTERSTELLAR]: 8, [GOT]: 9, [BOARD]: 9, [ALCOHOL]: 8 },
    favorite: MATRIX,
    loves: [MATRIX, GOT],
  },
  {
    id: 'nastya',
    name: { ru: 'Настя', en: 'Mia' },
    age: 24,
    color: '#d6544f',
    angle: 152,
    ratings: { [HP]: 5, [SHAWSHANK]: 6, [MATRIX]: 3, [INTERSTELLAR]: 4, [TITANIC]: 10, [GOT]: 10, [SEX]: 8, [READING]: 5, [BOARD]: 8, [ALCOHOL]: 6 },
    favorite: GOT,
    loves: [GOT, TITANIC],
  },
];

/** Портреты: карточка героя 3:4 и лицо для карты и карточек — лёгкие webp (было 1,2 МБ png). */
export const personaCard = (id: PersonaId): string => `/img/personas/${id}_card.webp`;
export const personaFace = (id: PersonaId): string => `/img/personas/${id}_face.webp`;
