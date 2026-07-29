/**
 * Готовность графики — общий приём для всего проекта (bugs/69).
 *
 * Глобальное правило владельца (волна 13, `AGENT_GUIDE.md` → «Дизайн» → «Готовность графики»):
 *
 *   «НИГДЕ ИКОНКИ НА ГОРЯЧУЮ НЕ ПОЯВЛЯЮТСЯ!! Карточки и документы рендерятся за раз целиком,
 *    когда картинка ГОТОВА»
 *
 * Место под картинку резервируется атрибутами `width`/`height` (раскладка не прыгает), сама
 * картинка стоит прозрачной, а видимой становится ГОТОВОЙ: действие вешает класс `ok`, по
 * которому стиль компонента проявляет её. Прозрачность задаётся именно СТИЛЕМ, а не строкой
 * кода: стиль действует с первого кадра, включая пререндеренный HTML до гидрации, — иначе
 * картинка успела бы мигнуть до того, как действие её спрячет.
 *
 * Приём был написан для руководства (bugs/55, `DocBlocks.svelte`) и вынесен сюда, когда по
 * правилу пошёл обход всего проекта: приём — один, копий быть не должно.
 *
 * Разметка-спутник (обязательна, иначе картинка останется невидимой):
 *   <img use:ready src=… width=… height=… />
 *   .art img { opacity: 0; transition: opacity var(--motion-base) var(--motion-ease); }
 *   .art img:global(.ok) { opacity: 1; }
 */

/** Элементы, к которым применимо действие: HTML-картинка и SVG-картинка. */
type Graphic = HTMLImageElement | SVGImageElement;

export function ready(node: Graphic) {
  const reveal = () => node.classList.add('ok');

  // Пререндер + гидрация: к моменту действия картинка из кэша может быть уже загружена —
  // тогда событие `load` не сыграет никогда (класс EXP-0049).
  if (node instanceof HTMLImageElement && node.complete && node.naturalWidth > 0) {
    reveal();
    return;
  }

  node.addEventListener('load', reveal, { once: true });
  // Не доехала (нет файла, нет сети) — всё равно проявляем: иначе `alt` останется невидимым,
  // и человек не узнает, что на этом месте вообще что-то было.
  node.addEventListener('error', reveal, { once: true });

  // SVG-картинка: тот же капкан, но выхода через `complete` у неё НЕТ — этого свойства
  // не существует у `SVGImageElement`, и до `ideas/21` (п. 11) ветка выше её не спасала.
  // На пререндеренной странице она проигрывала ГАРАНТИРОВАННО: разметка приезжает готовым
  // HTML, браузер начинает грузить картинку при разборе, `load` проходит задолго до
  // гидрации — и три лица персонажей на карте лендинга оставались прозрачными НАВСЕГДА
  // (замер: `hasOk: false`, `opacity: 0` у всех трёх, при том что те же файлы в соседних
  // HTML-картинках были загружены — `naturalWidth: 320`).
  //
  // Спрашиваем не элемент, а КЭШ БРАУЗЕРА — отдельной служебной картинкой на тот же адрес.
  // Кэш общий, поэтому у уже загруженной `complete` истинно сразу; если нет — служебная
  // картинка догрузится вместе с настоящей и разбудит нас своим событием. Сети это не
  // стоит ничего: второй запрос на тот же URL браузер обслуживает из кэша или подклеивает
  // к уже летящему.
  let probe: HTMLImageElement | null = null;
  if (!(node instanceof HTMLImageElement)) {
    const href = node.getAttribute('href') ?? node.getAttribute('xlink:href');
    if (href) {
      probe = new Image();
      probe.addEventListener('load', reveal, { once: true });
      probe.addEventListener('error', reveal, { once: true });
      probe.src = href;
      if (probe.complete) reveal();
    }
  }

  return {
    destroy() {
      node.removeEventListener('load', reveal);
      node.removeEventListener('error', reveal);
      if (probe) {
        probe.removeEventListener('load', reveal);
        probe.removeEventListener('error', reveal);
      }
    },
  };
}
