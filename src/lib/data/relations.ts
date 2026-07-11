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
import { db } from '../firebase.ts';
import type { Localized, RelationEntry, RelationsDoc, Uid } from '../model/schema.ts';

/** Строка топа + публичное имя гостя (из его бакета everyone). */
export interface RelationCard {
  readonly entry: RelationEntry;
  /** Имя гостя, как он открыл его всем; null — гость не открыл имя. */
  readonly guestName: Localized | null;
  readonly guestNick: Localized | null;
}

export interface RelationsScreenData {
  readonly computedAt: number;
  readonly cards: readonly RelationCard[];
}

/** Загружает топ связей владельца. `null` — вычислитель ещё ни разу не считал. */
export async function loadRelations(uid: Uid): Promise<RelationsScreenData | null> {
  const store = db();
  const snapshot = await getDoc(doc(store, 'relations', uid));
  if (!snapshot.exists()) return null;

  const relations = snapshot.data() as RelationsDoc;

  const cards = await Promise.all(
    relations.top.map(async (entry): Promise<RelationCard> => {
      const guestProfile = await getDoc(doc(store, 'users', entry.guestUid, 'profile', 'everyone'));
      const data = guestProfile.exists()
        ? (guestProfile.data() as { name?: { first: Localized; nick: Localized } })
        : {};
      return {
        entry,
        guestName: data.name?.first ?? null,
        guestNick: data.name?.nick ?? null,
      };
    }),
  );

  return { computedAt: relations.computedAt, cards };
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
