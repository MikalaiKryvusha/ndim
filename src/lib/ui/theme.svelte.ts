/**
 * Тема продукта — ЕДИНСТВЕННЫЙ источник истины.
 *
 * Была заведена по дефекту `bugs/53`: тему держали ТРИ экрана порознь — шапка
 * (`AppBar`), «Меню» и лендинг, у каждого свой `$state` и своя копия `setTheme`.
 * Пока переключатель был один, это сходило с рук; как только их стало два на экране,
 * они разошлись: владелец переключал тему в «Меню», а кнопка в шапке продолжала
 * показывать прежнюю — она читала `data-theme` один раз при монтировании и о
 * последующих сменах не узнавала.
 *
 * Лекарство — не наблюдатель за атрибутом в каждом экране, а общее состояние:
 * кто бы ни переключил тему, все потребители перерисовываются, потому что состояние
 * одно. Атрибут `data-theme` остаётся тем, чем и был — способом докрасить документ
 * (на него ключуются CSS-переменные) и передать выбор следующей загрузке.
 *
 * Начальное значение читается ИЗ ДОКУМЕНТА в момент инициализации модуля, а не в
 * `onMount`: инлайн-скрипт `app.html` проставляет `data-theme` до первой отрисовки,
 * поэтому на клиенте значение верное с первого кадра. В пререндере `document` нет —
 * там честный светлый дефолт, как и в разметке, которую пререндер порождает.
 */

export type Theme = 'light' | 'dark';

/** Ключ хранилища — тот же, что читает инлайн-скрипт `app.html`. Не переименовывать: у людей уже сохранён выбор. */
const STORAGE_KEY = 'ndim-theme';

/** Цвет системной строки браузера под тему; значения — из токенов тем. */
const THEME_COLOR: Record<Theme, string> = { light: '#f6f8fb', dark: '#060b14' };

function readFromDocument(): Theme {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

let current = $state<Theme>(readFromDocument());

/** Текущая тема. Читается в разметке — компонент перерисуется при смене. */
export function theme(): Theme {
  return current;
}

/** Применить тему: состояние + документ + сохранение выбора + цвет строки браузера. */
export function setTheme(next: Theme): void {
  current = next;
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', next);
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Приватный режим может запретить запись — тема всё равно применится на эту сессию.
  }
  // Раньше строку браузера красил ТОЛЬКО лендинг: смена темы из «Меню» оставляла её
  // от прошлой темы. Теперь это делает общий источник, то есть все точки сразу.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_COLOR[next]);
}

/** Переключить на противоположную. */
export function toggleTheme(): void {
  setTheme(current === 'dark' ? 'light' : 'dark');
}
