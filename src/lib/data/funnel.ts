/**
 * Воронка онбординга (plans/03, этап 4; интервью №004, В4 = A — своя воронка,
 * без сторонних трекеров).
 *
 * ЗАЧЕМ. Путь человека: лендинг → потрогал демо → стал гостем → создал аккаунт.
 * Где он рвётся — неизвестно, а чинить вслепую нельзя. Четыре счётчика на день
 * отвечают на этот вопрос и больше ни на какой.
 *
 * ЧТО ЗДЕСЬ НЕ ХРАНИТСЯ. Ничего персонального: ни UID, ни почты, ни адреса, ни
 * идентификатора устройства. Только четыре числа в документе `space/funnel/days/{дата}`.
 * Даже теоретически восстановить по ним человека нельзя — это и есть ответ на
 * «аналитика без слежки». Правила разрешают ровно +1 к одному счётчику за запись.
 *
 * ПОЧЕМУ ДИНАМИЧЕСКИЙ ИМПОРТ FIREBASE. Первый шаг воронки считается на лендинге, а
 * лендинг обязан оставаться лёгким (Lighthouse 100). Статический импорт затащил бы
 * SDK Firebase в главный бандл каждому посетителю. Здесь он подгружается отдельным
 * куском и только там, где действительно нужен.
 */

/** Четыре шага пути. Имена совпадают с полями документа и с именами в правилах. */
export type FunnelStep = 'landing_view' | 'demo_touch' | 'guest_start' | 'account_created';

/** Один визит — один шаг каждого вида: иначе счётчик считал бы клики, а не людей. */
const SESSION_PREFIX = 'ndim-funnel-';

/**
 * 🔴 ПРЕДОХРАНИТЕЛЬ, ПЕРЕЖИВШИЙ СВОЮ ПРИЧИНУ. Считает воронку только на стенде.
 *
 * Прежний комментарий здесь объяснял это тем, что «боевого конфига Firebase нет, ходим только в
 * эмуляторы». Это перестало быть правдой 12.07.2026: `firebase.ts` содержит `PROD_CONFIG` проекта
 * `ndim-space` и выбирает окружение по хосту. Причина исчезла — предохранитель остался, и в бою
 * `space/funnel/days/*` пуст с самого выката.
 *
 * ⚠️ Ложная причина стоила дорого: 01.08.2026 агент прочитал её, вывел «раз причина устранена,
 * значит воронка считает», и записал это в план и в интервью владельцу — под вопрос, где тот
 * выбирает, по каким данным просить человека завести аккаунт. Поймано состязательной проверкой
 * (`EXP-0113`). Комментарий не доказывает поведение; поведение доказывает только код.
 *
 * 🔲 СНЯТИЕ — решение не техническое: считать людей в бою можно лишь тогда, когда решено, кто и
 * где эти числа смотрит (`ideas/06`) и защищены ли они от накрутки (App Check). Обе задачи висят
 * в интервью №009. До этого предохранитель стоит СОЗНАТЕЛЬНО, а не по забывчивости — и эта
 * строка тому доказательство.
 */
function standOnly(): boolean {
  return typeof location !== 'undefined' && ['localhost', '127.0.0.1'].includes(location.hostname);
}

/** Ключ дня в UTC — `2026-07-12`. Один документ на сутки. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Отмечает шаг воронки. Никогда не бросает и никогда не заставляет ждать: аналитика
 * не имеет права ломать или тормозить продукт. Повторный вызов того же шага в том же
 * визите ничего не делает.
 */
export async function track(step: FunnelStep): Promise<void> {
  if (!standOnly()) return;

  const seen = `${SESSION_PREFIX}${step}`;
  if (sessionStorage.getItem(seen)) return;
  sessionStorage.setItem(seen, '1');

  try {
    const [{ db }, { doc, increment, setDoc }] = await Promise.all([
      import('../firebase.ts'),
      import('firebase/firestore'),
    ]);
    await setDoc(doc(db(), 'space', 'funnel', 'days', today()), { [step]: increment(1) }, { merge: true });
  } catch (error) {
    // Счётчик — не продукт. Молча выживаем, но оставляем след для отладки стенда.
    console.debug('Воронка: шаг не записан', step, error);
  }
}

/** Сводка за день — для «Пространства» владельца (ideas/06). Читает только админ. */
export interface FunnelDay {
  readonly date: string;
  readonly landing_view: number;
  readonly demo_touch: number;
  readonly guest_start: number;
  readonly account_created: number;
}

/** Читает счётчики дня. Правила пустят сюда только админа — это приборная панель владельца. */
export async function readFunnelDay(date: string = today()): Promise<FunnelDay> {
  const [{ db }, { doc, getDoc }] = await Promise.all([
    import('../firebase.ts'),
    import('firebase/firestore'),
  ]);
  const snapshot = await getDoc(doc(db(), 'space', 'funnel', 'days', date));
  const data = (snapshot.data() ?? {}) as Partial<FunnelDay>;
  return {
    date,
    landing_view: data.landing_view ?? 0,
    demo_touch: data.demo_touch ?? 0,
    guest_start: data.guest_start ?? 0,
    account_created: data.account_created ?? 0,
  };
}
