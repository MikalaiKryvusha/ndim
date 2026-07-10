/**
 * Механизм видимости профиля NDim Space 2.0.
 *
 * Человек решает по КАЖДОМУ свойству профиля, кто его видит. Аудитория — это набор его
 * собственных кругов, объединённых логическим ИЛИ («видят люди из этих трёх групп»).
 * «Друзья» — дефолтный круг, попадание в который требует взаимного согласия.
 *
 * ⚠️ ПОЧЕМУ ЭТОТ КОД СУЩЕСТВУЕТ ОТДЕЛЬНО ОТ FIRESTORE.
 * Firestore читает документы целиком: «You either retrieve the full document, or you retrieve
 * nothing». Скрыть отдельное поле правилами невозможно. Поэтому профиль физически разложен по
 * документам-бакетам (по документу на круг), а читатель склеивает те, к которым допущен.
 *
 * Правила безопасности стерегут ДОКУМЕНТЫ. Но правильность РАСКЛАДКИ свойств по документам они
 * проверить не могут — это делает вот этот модуль. Ошибка здесь = утечка личных данных.
 * Поэтому он чистый (ни Firestore, ни Node), покрыт тестами и не зависит от окружения.
 *
 * Подробности: researches/04_data_model_2x_proposal.md · interviews/interview_002.
 */

/** Бакет публичных свойств: их видит любой подтверждённый пользователь платформы. */
export const EVERYONE = 'everyone';

/** Бакет свойств, не видимых никому, кроме владельца. */
export const PRIVATE = 'private';

/** Дефолтный круг «Друзья»: единственный, попадание в который требует взаимного согласия. */
export const FRIENDS = 'friends';

/** Сколько своих кругов может завести пользователь (сверх дефолтного «Друзья»). */
export const MAX_CUSTOM_GROUPS = 10;

/** Идентификаторы, зарезервированные под служебные бакеты. Кругом так назваться нельзя. */
const RESERVED_IDS: readonly string[] = [EVERYONE, PRIVATE];

/** Идентификатор круга: `friends` либо непрозрачный id круга владельца. */
export type GroupId = string;

/** Идентификатор документа-бакета в `users/{uid}/profile/{bucketId}`. */
export type BucketId = typeof EVERYONE | typeof PRIVATE | GroupId;

/**
 * Аудитория свойства.
 * - `'everyone'` — видят все подтверждённые пользователи;
 * - массив кругов — видят те, кто входит **хотя бы в один** из них (логическое ИЛИ);
 * - пустой массив — не видит никто, кроме владельца.
 */
export type Audience = typeof EVERYONE | readonly GroupId[];

/** Свойства профиля, у каждого своя настройка видимости. Оценки по осям сюда НЕ входят. */
export type ProfileProperty = 'name' | 'born' | 'about' | 'avatar' | 'gender';

/** Значения профиля. Значение может быть любым сериализуемым — структура свойств задаётся отдельно. */
export type ProfileValues = Readonly<Partial<Record<ProfileProperty, unknown>>>;

/** Карта «свойство → его аудитория». Живёт в `users/{uid}` и читается только владельцем. */
export type VisibilityMap = Readonly<Partial<Record<ProfileProperty, Audience>>>;

/** Кто смотрит: в какие круги владельца он попал и подтверждена ли дружба. */
export interface Viewer {
  /** Дружба подтверждена обеими сторонами (`friendships/{pair}.status == 'accepted'`). */
  readonly isFriend: boolean;
  /** Круги владельца, в которые он положил этого зрителя. Без `friends`. */
  readonly groups: readonly GroupId[];
}

/**
 * Ошибка целостности данных: одно свойство пришло из разных бакетов с разными значениями.
 *
 * Поле объявлено явно, а не через параметр-свойство конструктора: Node исполняет TypeScript
 * стиранием типов и параметр-свойства стереть не умеет (`erasableSyntaxOnly` это стережёт).
 */
export class BucketConflictError extends Error {
  readonly property: string;

  constructor(property: string) {
    super(`Свойство «${property}» пришло из разных бакетов с разными значениями — данные рассогласованы`);
    this.name = 'BucketConflictError';
    this.property = property;
  }
}

/** Ошибка валидации аудитории. */
export class InvalidAudienceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidAudienceError';
  }
}

/**
 * Структурное сравнение. Своё, а не `node:util.isDeepStrictEqual`: модуль исполняется и в браузере.
 * Значения профиля — простые сериализуемые данные (строки, числа, вложенные объекты `{ru, en}`).
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;

  if (Array.isArray(a) !== Array.isArray(b)) return false;

  const keysA = Object.keys(a as object);
  const keysB = Object.keys(b as object);
  if (keysA.length !== keysB.length) return false;

  return keysA.every(
    (key) =>
      Object.prototype.hasOwnProperty.call(b, key) &&
      deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
  );
}

/** Проверяет, что идентификатором круга можно пользоваться. Бросает, если нет. */
export function assertValidGroupId(groupId: GroupId): void {
  if (groupId.length === 0) throw new InvalidAudienceError('пустой идентификатор круга');
  if (RESERVED_IDS.includes(groupId)) {
    throw new InvalidAudienceError(`«${groupId}» — служебный бакет, кругом так назваться нельзя`);
  }
}

/** Проверяет корректность аудитории. Бросает `InvalidAudienceError`, если она не годится. */
export function assertValidAudience(audience: Audience): void {
  if (audience === EVERYONE) return;

  const seen = new Set<GroupId>();
  for (const groupId of audience) {
    assertValidGroupId(groupId);
    if (seen.has(groupId)) throw new InvalidAudienceError(`круг «${groupId}» указан дважды`);
    seen.add(groupId);
  }

  const customCount = audience.filter((id) => id !== FRIENDS).length;
  if (customCount > MAX_CUSTOM_GROUPS) {
    throw new InvalidAudienceError(`кругов больше ${MAX_CUSTOM_GROUPS}: ${customCount}`);
  }
}

/**
 * В какие бакеты нужно положить свойство с данной аудиторией.
 *
 * Свойство, открытое нескольким кругам, **дублируется** в каждый из них: зритель может состоять
 * лишь в одном и обязан его увидеть. Это прямая цена решения «набор аудиторий» (интервью №002, В3).
 */
export function bucketsForAudience(audience: Audience): BucketId[] {
  assertValidAudience(audience);
  if (audience === EVERYONE) return [EVERYONE];
  if (audience.length === 0) return [PRIVATE];
  return [...audience];
}

/**
 * Раскладывает значения профиля по бакетам согласно карте видимости.
 *
 * Свойство, для которого в карте нет записи, считается приватным: **умолчание — скрыть**.
 * Так забытая настройка не превращается в утечку.
 *
 * @returns отображение «bucketId → значения, которые лежат в этом документе».
 */
export function distribute(
  values: ProfileValues,
  visibility: VisibilityMap,
): Map<BucketId, Record<string, unknown>> {
  const buckets = new Map<BucketId, Record<string, unknown>>();

  for (const [property, value] of Object.entries(values) as [ProfileProperty, unknown][]) {
    if (value === undefined) continue;

    // Нет записи в карте видимости → приватно. Умолчание в пользу приватности, а не наоборот.
    const audience = visibility[property] ?? [];

    for (const bucketId of bucketsForAudience(audience)) {
      const bucket = buckets.get(bucketId) ?? {};
      bucket[property] = value;
      buckets.set(bucketId, bucket);
    }
  }

  return buckets;
}

/**
 * Склеивает бакеты, прочитанные зрителем, в один набор значений.
 *
 * Одно свойство может прийти из нескольких бакетов (см. дублирование в {@link bucketsForAudience}).
 * Значения обязаны совпадать; расхождение — признак рассогласованных данных, и мы не выбираем молча
 * «какое-нибудь», а падаем.
 */
export function mergeBuckets(buckets: readonly Record<string, unknown>[]): Record<string, unknown> {
  const merged: Record<string, unknown> = {};

  for (const bucket of buckets) {
    for (const [property, value] of Object.entries(bucket)) {
      if (property in merged && !deepEqual(merged[property], value)) {
        throw new BucketConflictError(property);
      }
      merged[property] = value;
    }
  }

  return merged;
}

/**
 * Какие бакеты профиля владельца доступны этому зрителю, кроме публичного.
 *
 * Ровно это владелец кладёт в документ-подсказку `users/{uid}/audience/{viewerUid}`.
 * Подсказка не даёт прав — права проверяют правила безопасности; она лишь говорит клиенту,
 * какие документы вообще запрашивать, и не раскрывает ни названий кругов, ни их состава.
 */
export function extraBucketsFor(viewer: Viewer): BucketId[] {
  const buckets: BucketId[] = [];
  if (viewer.isFriend) buckets.push(FRIENDS);
  for (const groupId of viewer.groups) {
    assertValidGroupId(groupId);
    if (groupId !== FRIENDS) buckets.push(groupId);
  }
  return buckets;
}

/** Все бакеты, которые зритель вправе прочитать: публичный плюс его личные. */
export function readableBuckets(viewer: Viewer): BucketId[] {
  return [EVERYONE, ...extraBucketsFor(viewer)];
}

/**
 * Что зритель увидит в профиле владельца.
 *
 * Моделирует полный путь: раскладка по бакетам → чтение доступных → склейка.
 * Существует ради тестов: именно этой функцией проверяется, что скрытое остаётся скрытым.
 * В приложении раскладка и чтение разнесены во времени и выполняются разными сторонами.
 */
export function visibleTo(
  values: ProfileValues,
  visibility: VisibilityMap,
  viewer: Viewer,
): Record<string, unknown> {
  const buckets = distribute(values, visibility);
  const allowed = readableBuckets(viewer);

  return mergeBuckets(allowed.map((bucketId) => buckets.get(bucketId) ?? {}));
}
