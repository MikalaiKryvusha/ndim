/**
 * ТЕСТ НА СОВМЕСТИМОСТЬ НОВОЙ V1 — вычисляемая часть (`plans/106` шаги Д3, Д5, Д6).
 *
 * Чистый модуль по причине, записанной у соседа `handhold.ts`: решения «кого называем, где стоит лицо,
 * что уезжает в NDim ID» проверяются юнитами, а `node --test` компонент Svelte не поднимает.
 *
 * Похожесть считает НАСТОЯЩЕЕ ядро (`computeRelation`) — копий формулы нет (урок демо V5).
 * [NOT-TESTED]
 */
import { computeRelation, type Relation } from '../similarity/similarity.ts';
import { DEMO_ITEMS, DEMO_PERSONAS, type DemoPersona } from '../content/landing-demo.ts';

/** Оценки человека в демо: id объекта → звёзды 1…10. Неоценённого объекта в записи НЕТ. */
export type DemoRatings = Readonly<Record<string, number>>;

/**
 * Жест звезды — тот же, что в каталоге и в демо V5: повторное касание текущей оценки снимает её.
 *
 * 🔴 Снятая оценка УДАЛЯЕТСЯ из записи, а не пишется нулём. Ядро считает измерением каждый ключ
 * (`ownerAxes = Object.keys(ownerDims)`): ноль в записи раздул бы Общность и отправил бы в NDim ID
 * гостя оценку «0», которой человек не ставил. Ноль как законная оценка (канон шкалы 0…10) в демо
 * недостижим — звёзды здесь 1…10, как в макете владельца.
 */
export function applyStar(mine: DemoRatings, id: string, value: number): DemoRatings {
  const next: Record<string, number> = { ...mine };
  if (next[id] === value) delete next[id];
  else next[id] = value;
  return next;
}

export interface PersonaRelation {
  readonly persona: DemoPersona;
  /** `null` — общих оценённых объектов нет, связи не существует (инвариант ядра `|K| = 0`). */
  readonly r: Relation | null;
}

/** Связи со всеми тремя персонажами, от самой сильной к самой слабой; без связи — в конце. */
export function rankedRelations(mine: DemoRatings): PersonaRelation[] {
  const list = DEMO_PERSONAS.map((persona) => ({ persona, r: computeRelation({ ...mine }, { ...persona.ratings }) }));
  // Тай-брейк по порядку персонажей в данных — канонический порядок у всего, что сравнивается.
  const order = new Map(DEMO_PERSONAS.map((p, i) => [p.id, i]));
  return list.sort(
    (a, b) =>
      (b.r?.similarity ?? -1) - (a.r?.similarity ?? -1) || (order.get(a.persona.id) ?? 0) - (order.get(b.persona.id) ?? 0),
  );
}

/**
 * Что уезжает в NDim ID гостя по «Смотреть больше» — оценки в порядке списка демо.
 * Порядок фиксирован списком, а не порядком касаний: запись детерминирована.
 */
export function ratingsToCarry(mine: DemoRatings): Array<readonly [string, number]> {
  return DEMO_ITEMS.filter((d) => mine[d.id] !== undefined).map((d) => [d.id, mine[d.id]] as const);
}

/**
 * ЗАПИСЬ ОЦЕНОК ДЕМО В NDIM ID ГОСТЯ — все оценки ОДНИМ вызовом `saveAll` (пакет `saveRatingsBatch`, 2026-09-25).
 * Прежде первая оценка писалась одна (она рождала гостя), остальные — после неё: замер моста на стейдже — ≈3,06 с, из
 * них ≈1,5 с последовательных записей (`qa/reports/2026-09-25_bridge-timing.md`); пакет пишет всё одним запросом.
 *
 * Ждём записи не дольше `capMs`: мост уводит страницу, а уход обрывает незавершённую запись. Потолок
 * — образец острова двери карточки (`src/lib/door/island.js:201-212`, 8 с): медленная сеть не
 * запирает человека на лендинге. Ошибки не роняют мост — человек уходит внутрь и без оценок; число
 * записанных возвращается для отметки моста (пакет атомарен: все или ни одной).
 */
export async function carryAll(
  entries: ReadonlyArray<readonly [string, number]>,
  saveAll: (entries: ReadonlyArray<readonly [string, number]>) => Promise<number>,
  capMs = 8000,
): Promise<number> {
  if (entries.length === 0) return 0;
  let saved = 0;
  const work = saveAll(entries).then((n) => {
    saved = n;
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cap = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, capMs);
  });
  await Promise.race([work.catch(() => undefined), cap]);
  clearTimeout(timer);
  return saved;
}

/**
 * ОЧЕРЕДЬ КАСАНИЙ ДО ГИДРАТАЦИИ (`plans/106` Д6, риск «а» `plans/104`).
 *
 * Инлайн-скрипт в разметке ловит касание звезды, пока Svelte ещё не ожил, красит строку и кладёт
 * пару «id · звёзды» в `window.__ndimDemoQ`. Компонент при монтировании проигрывает очередь теми же
 * жестами (`applyStar`), поднимает флаг `__ndimDemoLive` — и инлайн-скрипт замолкает.
 *
 * Скрипт — СТРОКА, а не модуль: он исполняется до всякого JS приложения, сразу за разметкой строк.
 * Без `import`, без стрелочных функций — старые встроенные браузеры соцсетей тоже его исполнят.
 */
export const EARLY_TAP_SCRIPT = `(function(){try{var q=window.__ndimDemoQ=window.__ndimDemoQ||[];var root=document.getElementById('compat-rows');if(!root)return;root.addEventListener('click',function(e){if(window.__ndimDemoLive)return;var b=e.target&&e.target.closest?e.target.closest('[data-star]'):null;if(!b)return;var row=b.closest('[data-dim]');if(!row)return;var v=+b.getAttribute('data-star');var id=row.getAttribute('data-dim');var prev=row.getAttribute('data-early');var off=prev===String(v);row.setAttribute('data-early',off?'':String(v));q.push([id,v]);var bs=row.querySelectorAll('[data-star]');for(var i=0;i<bs.length;i++){bs[i].classList.toggle('on',!off&&+bs[i].getAttribute('data-star')<=v)}var val=row.querySelector('[data-val]');if(val)val.textContent=off?'':String(v);},true);}catch(err){}})();`;

/** Проигрывание очереди: чистая функция, чтобы юнит видел ровно то, что сделает компонент. */
export function replayQueue(mine: DemoRatings, queue: ReadonlyArray<readonly [string, number]>): DemoRatings {
  const known = new Set(DEMO_ITEMS.map((d) => d.id));
  let next = mine;
  for (const [id, value] of queue) {
    if (!known.has(id) || !Number.isInteger(value) || value < 1 || value > 10) continue;
    next = applyStar(next, id, value);
  }
  return next;
}
