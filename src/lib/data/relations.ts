/**
 * Слой данных экрана «Связи» — топ похожих людей из модели 2.0.
 *
 * `relations/{uid}` пишет ТОЛЬКО вычислитель (клиенту запись запрещена правилами),
 * читает только владелец. Карточка гостя собирается из его публичного бакета
 * `users/{guest}/profile/everyone` — ровно то и только то, что гость открыл всем.
 *
 * ⚠️ Приватность 2.0: «был онлайн», почта и прочее гостя зрителю НЕ доступны —
 * это не упущение, а модель (researches/04). Показываем имя и математику связи.
 */

import { doc, getDoc } from 'firebase/firestore';

import { FRESH, KEYS, cached, own, peek } from './cache.ts';
import { db } from '../firebase.ts';
import type {
  BirthDate,
  Gender,
  Localized,
  PointDoc,
  RelationEntry,
  RelationsDoc,
  Uid,
} from '../model/schema.ts';

/** Строка топа + публичный профиль гостя (из его бакета everyone). */
export interface RelationCard {
  readonly entry: RelationEntry;
  /** Имя гостя, как он открыл его всем; null — гость не открыл имя. */
  readonly guestName: Localized | null;
  readonly guestNick: Localized | null;
  /**
   * Есть ли у человека фотография (сам файл — в Storage, см. `data/avatar.ts`).
   *
   * Флаг берём здесь, а не ходим за картинкой на каждого: без него список на 250 человек
   * устроил бы 250 заведомо пустых запросов. Фото в боевой базе загрузили считаные люди.
   */
  readonly guestAvatar: boolean;
  /**
   * Персональная информация человека — то, что он открыл ВСЕМ (bugs/46, канон 1.x: раскрытая
   * карточка была досье знакомства, а не тремя цифрами).
   *
   * ⚠️ Осознанное отличие от 1.x: там в чужой карточке было видно всё, здесь — только
   * содержимое бакета `everyone`. Скрытое поле не показывается и НЕ подменяется прочерком:
   * зритель не должен уметь отличить «не заполнено» от «скрыто от меня» (`researches/04`).
   * Читаем из того же документа, что и имя, — новых чтений Firestore не добавляется.
   */
  readonly guestGender: Gender;
  readonly guestBorn: BirthDate | null;
  readonly guestAbout: Localized | null;
}

export interface RelationsScreenData {
  readonly computedAt: number;
  readonly cards: readonly RelationCard[];
}

/**
 * Загружает топ связей владельца. `null` — вычислитель ещё ни разу не считал.
 *
 * Кэшируется на сессию с МИНУТНОЙ свежестью (`ideas/18`, `FRESH.server`): топ производит сервер
 * синхронизации, а он ходит циклом в минуту — спрашивать чаще нечего. Возврат на экран внутри
 * этого окна не стоит ни одного чтения, а за окном топ освежается тихо, поверх уже показанного.
 */
export async function loadRelations(uid: Uid): Promise<RelationsScreenData | null> {
  own(uid);
  return cached(KEYS.relations, FRESH.server, () => fetchRelations(uid));
}

/** Что лежит в памяти прямо сейчас — для первого кадра экрана «Связи», без лоадера. */
export function peekRelations(): RelationsScreenData | null | undefined {
  return peek<RelationsScreenData | null>(KEYS.relations);
}

async function fetchRelations(uid: Uid): Promise<RelationsScreenData | null> {
  const store = db();
  const snapshot = await getDoc(doc(store, 'relations', uid));
  if (!snapshot.exists()) return null;

  const relations = snapshot.data() as RelationsDoc;

  const cards = await Promise.all(
    relations.top.map(async (entry): Promise<RelationCard> => {
      const guestProfile = await getDoc(doc(store, 'users', entry.guestUid, 'profile', 'everyone'));
      const data = guestProfile.exists()
        ? (guestProfile.data() as {
            name?: { first: Localized; nick: Localized };
            avatar?: boolean;
            gender?: Gender;
            born?: BirthDate;
            about?: Localized;
          })
        : {};
      return {
        entry,
        guestName: data.name?.first ?? null,
        guestNick: data.name?.nick ?? null,
        guestAvatar: data.avatar === true,
        guestGender: data.gender ?? null,
        guestBorn: data.born ?? null,
        guestAbout: data.about ?? null,
      };
    }),
  );

  return { computedAt: relations.computedAt, cards };
}

/** Сводка топа для виджета «Мои связи» в профиле: без имён, без лиц — только числа. */
export interface RelationsSummary {
  /** Похожести всех связей топа. Полосы 90 / 75…89 / 50…74 считает `model/ndimid.ts`. */
  readonly similarities: readonly number[];
  /**
   * Когда сервер синхронизации в последний раз ОБРАБОТАЛ эту точку. `null` — ни разу.
   *
   * ⚠️ Берётся из `points/{uid}.lastSync`, а НЕ из `relations/{uid}.computedAt`, и это
   * принципиально. С экономией запросов (`ideas/14`) топ переписывается только когда он
   * ИЗМЕНИЛСЯ, а `lastSync` обновляется каждый раз, когда точку посчитали. Если бы строка
   * «Синхронизирован» показывала `computedAt`, у человека со стабильным топом она застыла
   * бы на неделю — и отвечала бы не на свой вопрос («когда связи менялись» вместо «когда
   * меня синхронизировали»). Витрина обязана отвечать ровно на тот вопрос, который задаёт
   * её подпись (EXP-0033).
   */
  readonly lastSync: number | null;
}

/**
 * Лёгкая сводка «Дома» для профиля (bugs/43) — ДВА чтения Firestore, оба маленькие.
 *
 * Отдельная функция, а не `loadRelations`, именно ради экономии запросов (канон владельца
 * 2026-07-12): полная загрузка ходит ещё и в публичный бакет КАЖДОГО человека из топа —
 * до 250 чтений. Здесь читаются ровно два документа: собственный топ и собственная точка.
 *
 * `null` — сервер синхронизации ещё ни разу не считал связи этого человека.
 */
export async function loadRelationsSummary(uid: Uid): Promise<RelationsSummary | null> {
  own(uid);
  return cached(KEYS.relationsSummary, FRESH.server, () => fetchRelationsSummary(uid));
}

/** Сводка из памяти — синхронно, для первого кадра профиля. */
export function peekRelationsSummary(): RelationsSummary | null | undefined {
  return peek<RelationsSummary | null>(KEYS.relationsSummary);
}

async function fetchRelationsSummary(uid: Uid): Promise<RelationsSummary | null> {
  const store = db();
  const [top, point] = await Promise.all([
    getDoc(doc(store, 'relations', uid)),
    getDoc(doc(store, 'points', uid)),
  ]);
  if (!top.exists()) return null;

  const relations = top.data() as RelationsDoc;
  const lastSync = point.exists() ? ((point.data() as PointDoc).lastSync ?? null) : null;
  return {
    similarities: relations.top.map((entry) => entry.similarity),
    lastSync,
  };
}

/**
 * Уровень силы метрики для «яркости связи» (утверждено владельцем 2026-07-11):
 * слабая (<30) гаснет, средняя (30–59) — синяя, сильная (≥60) — циан и светится.
 */
export function strengthLevel(percent: number): 'lv1' | 'lv2' | 'lv3' {
  if (percent >= 60) return 'lv3';
  if (percent >= 30) return 'lv2';
  return 'lv1';
}
