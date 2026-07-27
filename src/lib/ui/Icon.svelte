<script lang="ts">
  // Единственная точка, через которую в приложение попадают иконки (bugs/17).
  //
  // До неё по экранам были расставлены юникод-глифы и эмодзи (⌂ ◎ ✳ ★ ☰ ⚙ 🌐 📖 🔒 …).
  // Слово владельца: «в Settings полный ужас, иконки маленькие, невзрачные», «по всему
  // приложению переделай иконки». Беда глифа в том, что у него нет ни сетки, ни веса —
  // он рисуется шрифтом; а эмодзи вдобавок цветные и тему не слушают вовсе.
  //
  // Сам набор — в icons.ts (генерируется). Нав-иконки там обведены с АВТОРСКИХ png 1.x
  // и их форма менять нельзя, кнопочные — Bootstrap Icons, как и было в 1.x.
  //
  // Цвет иконка берёт от текста (currentColor), поэтому обе темы, состояние «активно»
  // и Ч/Б-инвариант работают сами, без вариантов файлов под тему.
  import { ICONS, type IconName } from './icons';

  let {
    name,
    size = 24,
    label,
  }: {
    name: IconName;
    size?: number;
    /** Задавать ТОЛЬКО когда иконка — единственное содержимое кнопки. Рядом с текстом
        иконка декоративна, и подпись для скринридера её дублировала бы. */
    label?: string;
  } = $props();
</script>

<svg
  class="ic"
  viewBox={ICONS[name].box}
  width={size}
  height={size}
  fill="currentColor"
  role={label ? 'img' : undefined}
  aria-label={label}
  aria-hidden={label ? undefined : 'true'}
  focusable="false"
>{@html ICONS[name].d}</svg>

<style>
  .ic {
    display: inline-block;
    vertical-align: middle;
    flex: none;
  }
</style>
