/**
 * Фотографии людей.
 *
 * В 1.x фото жило в Firebase Storage по пути `users/{uid}/avatar/avatar.webp`, а в Firestore
 * хранился только ФЛАГ `avatar: boolean` — «есть ли аватар в Storage». Миграция флаг перенесла
 * честно, но 2.0 за самой картинкой не ходил, и после боевого выката (2026-07-12) люди увидели
 * профили без лиц: «в старом NDim были фотки». Файлы никуда не делись — их просто не показывали.
 *
 * Путь подтверждён по БОЕВОМУ бакету, а не по документу: `researches/02` знал только про флаг.
 *
 * Ссылку берём через SDK: правила Storage 1.x разрешают чтение любому вошедшему
 * (`allow read: if request.auth != null`), и SDK приложит токен. Без входа файл отдаёт 403,
 * поэтому «собрать URL руками» тут не работает.
 */
import { getDownloadURL, ref } from 'firebase/storage';

import { isStand, storage } from '../firebase.ts';
import type { Uid } from '../model/schema.ts';

/** Где 1.x положил фотографию человека. */
const avatarPath = (uid: Uid) => `users/${uid}/avatar/avatar.webp`;

/**
 * Ссылка на фото человека — или `null`, если его нет.
 *
 * Отсутствие фото — норма, а не ошибка: в боевой базе фотографию загрузили считаные люди.
 * Поэтому любая неудача (нет файла, нет Storage на стенде, нет доступа) — это спокойный `null`
 * и кружок с буквой, а не сломанный экран.
 */
export async function avatarUrl(uid: Uid): Promise<string | null> {
  if (isStand()) return null; // эмулятора Storage нет — на стенде фотографий не бывает
  try {
    return await getDownloadURL(ref(storage(), avatarPath(uid)));
  } catch {
    // Флаг мог пережить сам файл (человек удалил фото). Показать букву — честнее, чем битую картинку.
    return null;
  }
}
