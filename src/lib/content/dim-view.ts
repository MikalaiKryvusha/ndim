/**
 * ЧТО ПОКАЗЫВАЕТ публичная страница измерения — тип общий для загрузчика и разметки.
 *
 * 🔴 ПОЧЕМУ ОТДЕЛЬНЫМ ФАЙЛОМ, А НЕ В `+page.ts`. Загрузчик страницы обязан быть СЕРВЕРНЫМ
 * (`+page.server.ts`): универсальный `load` исполняется и в браузере, поэтому Vite вшивает всё,
 * что он импортирует, в клиентский бандл — и каталог на 17 МБ уехал бы к каждому посетителю
 * (замерено: чанк узла вырос до **16,86 МБ**, `EXP-0136`). А разметке нужен ТИП, и импортировать
 * его из серверного модуля она не может. Отсюда третий файл, где живёт только контракт.
 */
import type { DimPage } from './dims-source.ts';
import type { RatingView } from './dims-rating.ts';
import type { Lang } from './langs.ts';

export interface DimView extends RatingView {
  readonly dim: DimPage;
  readonly lang: Lang;
  readonly title: string;
  readonly description: string;
  readonly kind: string;
  readonly author: string;
  /** Оригинальное название, если оно отличается от заголовка. Иначе пусто. */
  readonly original: string;
  /** Год; `-` в каталоге означает «неизвестен» — тогда пусто и элемент не показывается. */
  readonly year: string;
  readonly tags: readonly string[];
  /** Строка для выдачи: обрезана по слову, без хвоста-огрызка. */
  readonly meta: string;
  readonly canonical: string;
  /** Двусторонний `hreflang`: у Google односторонняя разметка игнорируется ЦЕЛИКОМ. */
  readonly alternates: readonly { hreflang: string; href: string }[];
}
