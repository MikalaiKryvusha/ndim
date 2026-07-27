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
 * ⚠️ Канон 1.x — КАРТОЧКА ЖДЁТ ФОТО (bugs/57, разведка в `researches/12` → «Фотографии в
 * карточках»). `fetchUserAvatar` 1.x качал файл ЦЕЛИКОМ (`getDownloadURL` → `fetch` → `blob`)
 * и отдавал в `<img>` локальный `URL.createObjectURL` — сетевого догруза после показа карточки
 * не существовало в принципе. Здесь тот же механизм: {@link avatarUrl} возвращает blob-URL,
 * экраны предзагружают лица {@link preloadAvatars} ДО отрисовки карточек, а компонент лица
 * берёт готовый URL синхронно через {@link cachedAvatarUrl} — первый кадр карточки уже с лицом.
 *
 * Ссылку берём через SDK: правила Storage 1.x разрешают чтение любому вошедшему
 * (`allow read: if request.auth != null`), и SDK приложит токен. Без входа файл отдаёт 403,
 * поэтому «собрать URL руками» тут не работает.
 */
import { getDownloadURL, ref } from 'firebase/storage';

import { storage } from '../firebase.ts';
import type { Uid } from '../model/schema.ts';

/** Где 1.x положил фотографию человека. */
const avatarPath = (uid: Uid) => `users/${uid}/avatar/avatar.webp`;

/**
 * Кэш сессии (канон владельца «экономить запросы»): лицо человека не меняется посреди сессии,
 * а один и тот же гость встречается в топе, в раскрытой карточке и после перезахода на экран.
 * `pending` дедуплицирует ПАРАЛЛЕЛЬНЫЕ запросы (порция из 24 карточек не должна качать одно
 * лицо дважды), `ready` отдаёт готовый blob-URL синхронно — для первого кадра компонента.
 * Инвалидация не нужна, пока в 2.0 нет редактора фото (bugs/44); появится — чистить по uid.
 */
const pending = new Map<Uid, Promise<string | null>>();
const ready = new Map<Uid, string | null>();

/** Скачивание файла целиком — дословно механизм `fetchUserAvatar` 1.x (app.js:4967). */
async function download(uid: Uid): Promise<string | null> {
  try {
    const url = await getDownloadURL(ref(storage(), avatarPath(uid)));
    const response = await fetch(url);
    if (!response.ok) return null;
    const objectUrl = URL.createObjectURL(await response.blob());
    // Декодируем ДО вставки в DOM: без этого <img> с готовым blob всё равно один кадр
    // стоит пустым (замер трассой: 17 мс EMPTY между монтированием и naturalWidth > 0).
    // После decode() битмап в кэше документа, и карточка красится лицом с первого кадра.
    const image = new Image();
    image.src = objectUrl;
    await image.decode().catch(() => undefined);
    return objectUrl;
  } catch {
    // Флаг мог пережить сам файл (человек удалил фото). Показать букву — честнее, чем битую картинку.
    return null;
  }
}

/**
 * Локальный blob-URL фото человека — или `null`, если фото нет.
 *
 * Отсутствие фото — норма, а не ошибка: в боевой базе фотографию загрузили считаные люди.
 * Поэтому любая неудача (нет файла, нет доступа) — это спокойный `null` и кружок с буквой,
 * а не сломанный экран. Стенд ходит в ЭМУЛЯТОР Storage (bugs/14) — фото там кладёт сид.
 */
export function avatarUrl(uid: Uid): Promise<string | null> {
  let promise = pending.get(uid);
  if (promise === undefined) {
    promise = download(uid).then((url) => {
      ready.set(uid, url);
      return url;
    });
    pending.set(uid, promise);
  }
  return promise;
}

/** Уже скачанное лицо — синхронно, для ПЕРВОГО кадра карточки. `null` — ещё не готово/нет. */
export function cachedAvatarUrl(uid: Uid): string | null {
  return ready.get(uid) ?? null;
}

/**
 * Предзагрузка лиц ДО отрисовки карточек — то самое «карточка ждёт фото» 1.x.
 *
 * Потолок ожидания — отличие от 1.x (там карточка ждала бесконечно): медленный Storage не
 * должен превращать экран в вечный лоадер (bugs/57 → «Чего НЕ делать»). Не успевшие лица
 * доедут фоном и встанут атомарной заменой буквы (blob уже локален — без пустого круга).
 * Пустой список (ни у кого нет фото) не ждёт ничего.
 */
export async function preloadAvatars(uids: readonly Uid[], capMs = 1500): Promise<void> {
  if (uids.length === 0) return;
  await Promise.race([
    Promise.all(uids.map((uid) => avatarUrl(uid))),
    new Promise((resolve) => setTimeout(resolve, capMs)),
  ]);
}
