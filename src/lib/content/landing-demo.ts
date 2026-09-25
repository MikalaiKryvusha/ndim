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
 * `[AI]` Состав списка — предложение агента по голосам каталога боя (замер 2026-09-25 15:21, 5 153
 * записи): самые оцениваемые фильмы и сериалы плюс практики. Выбор — за владельцем (интервью №097);
 * меняется он ЗДЕСЬ, одной константой.
 * 🔴 Практику «Секс» (11 голосов — первая практика каталога по голосам) агент поначалу снял вкусом и поставил
 * «Путешествия» (3 голоса) — это нарушало стоячее слово владельца о витрине: «*НУ И ЧТО, ЧТО СЕКС — люди
 * любят, вот и показываем честно*» (главная V5, 2026-09-05, `PROJECT_HISTORY.md`) и №066 В2 = А. Витрину
 * отбирают голоса людей; вид снимается только по инженерной причине. Исправлено 2026-09-25 по находке суда;
 * оценки персонажей переехали с «Путешествий» на «Секс» без изменения чисел.
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
  { id: 'mDnwq3epw5X4MokeMd9v', slug: 'reading-mdnwq3ep', kind: 'practice', title: { ru: 'Чтение', en: 'Reading' }, year: null, rating: 9.3, votes: 6 },
  { id: 'HW247wWXQMxb1aFFFdFJ', slug: 'board-gaming-hw247wwx', kind: 'practice', title: { ru: 'Настольные игры', en: 'Board Gaming' }, year: null, rating: 7.1, votes: 7 },
  { id: 'YSsMo1ODoVZ5o34IxZSX', slug: 'cycling-yssmo1od', kind: 'practice', title: { ru: 'Велоспорт', en: 'Cycling' }, year: null, rating: 8.5, votes: 6 },
];

/** Короткие имена объектов для оценок персонажей — читаемость таблицы ниже, а не второй id. */
const [HP, SHAWSHANK, MATRIX, INTERSTELLAR, TITANIC, GOT, SEX, READING, BOARD, CYCLING] = DEMO_ITEMS.map((d) => d.id);

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
    ratings: { [HP]: 10, [SHAWSHANK]: 8, [MATRIX]: 7, [INTERSTELLAR]: 10, [TITANIC]: 8, [GOT]: 6, [SEX]: 9, [READING]: 10, [BOARD]: 7, [CYCLING]: 4 },
    favorite: INTERSTELLAR,
    loves: [INTERSTELLAR, HP],
  },
  {
    id: 'max',
    name: { ru: 'Макс', en: 'Liam' },
    age: 31,
    color: '#0ea578',
    angle: 28,
    ratings: { [MATRIX]: 10, [INTERSTELLAR]: 8, [GOT]: 9, [BOARD]: 9, [CYCLING]: 10 },
    favorite: MATRIX,
    loves: [MATRIX, GOT],
  },
  {
    id: 'nastya',
    name: { ru: 'Настя', en: 'Mia' },
    age: 24,
    color: '#d6544f',
    angle: 152,
    ratings: { [HP]: 5, [SHAWSHANK]: 6, [MATRIX]: 3, [INTERSTELLAR]: 4, [TITANIC]: 10, [GOT]: 10, [SEX]: 8, [READING]: 5, [BOARD]: 8, [CYCLING]: 6 },
    favorite: GOT,
    loves: [GOT, TITANIC],
  },
];

/** Портреты: карточка героя 3:4 и лицо для карты и карточек — лёгкие webp (было 1,2 МБ png). */
export const personaCard = (id: PersonaId): string => `/img/personas/${id}_card.webp`;
export const personaFace = (id: PersonaId): string => `/img/personas/${id}_face.webp`;
