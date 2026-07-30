<script lang="ts">
  // Отрисовка блоков документа (`src/lib/content/docs.ts`): заголовки, абзацы, списки,
  // таблицы — и восстановленная графика руководства 1.x (bugs/55, выбор владельца V1
  // «Как было»): иллюстрации, шкала оценок со звездой/цифрой/цветным смайликом,
  // кнопки-образцы в текущем виде 2.0, ряд смайликов.
  //
  // Тексты — владельца, снятые дословно из 1.x. Разметка внутри них (**жирный**) — часть его
  // формулировок, поэтому она переводится в HTML, а не выбрасывается. Источник статический,
  // из репозитория; экранирование всё равно делает richText().
  //
  // Заголовки несут id (`sec-<номер блока>`) — по ним ходит плавающий пагинатор глав
  // (ChapterNav) на странице руководства.
  import Icon from '$lib/ui/Icon.svelte';
  import GradeFace from '$lib/ui/GradeFace.svelte';
  import { GRADE_FACES } from '$lib/ui/emojiscale';
  import { richText, type Lang } from '$lib/ui/format';
  import { ready } from '$lib/ui/ready';
  import type { DocBlock } from '$lib/content/docs';

  let { blocks, lang }: { blocks: readonly DocBlock[]; lang: Lang } = $props();

  // Правило владельца «графика не появляется на горячую» — общий приём проекта
  // (`$lib/ui/ready.ts`, bugs/69). Здесь он и родился (bugs/55), отсюда и вынесен.
</script>

<!-- Цветной смайлик оценки — общий компонент продукта (`GradeFace.svelte`, bugs/80):
     ту же шкалу показывает карточка «Измерений», и копии разметки здесь больше нет. -->
{#each blocks as block, index (index)}
  {#if block.type === 'h2'}
    <h2 id="sec-{index}">{block.text[lang]}</h2>
  {:else if block.type === 'h3'}
    <h3 id="sec-{index}">{block.text[lang]}</h3>
  {:else if block.type === 'p'}
    <p>{@html richText(block.text[lang])}</p>
  {:else if block.type === 'ul'}
    <ul>
      {#each block.items[lang] as item, itemIndex (itemIndex)}
        <li>
          {@html richText(item)}
          {#if block.images?.[itemIndex]}
            {@const art = block.images[itemIndex]}
            <!-- В 1.x иллюстрация стояла ВНУТРИ пункта, под его текстом (researches/12). -->
            <span class="art"><img use:ready src={art.src} width={art.w} height={art.h} alt="" loading="lazy" /></span>
          {/if}
        </li>
      {/each}
    </ul>
  {:else if block.type === 'img'}
    <span class="art" class:logo={block.kind === 'logo'}>
      <img use:ready src={block.src} width={block.w} height={block.h} alt={block.alt} loading={block.kind === 'logo' ? 'eager' : 'lazy'} />
    </span>
  {:else if block.type === 'scale'}
    <!-- Шкала 0…10 как в 1.x: звезда + цифра + цветной смайлик в колонке «Оценка».
         Звезда и цифра — языком текущей реализации («Измерения»): ★ токеном --star,
         нулевая гаснет в --faint (у нуля звёзд нет). -->
    <div class="scroll">
      <table class="grades">
        <thead>
          <tr><th>{block.head[lang][0]}</th><th>{block.head[lang][1]}</th></tr>
        </thead>
        <tbody>
          {#each block.descriptions[lang] as description, grade (grade)}
            <tr>
              <td>
                <span class="mark" class:zero={grade === 0}>
                  <i aria-hidden="true">★</i>
                  <b>{grade}</b>
                  <GradeFace {grade} size={18} />
                </span>
              </td>
              <td>{@html richText(description)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {:else if block.type === 'sample'}
    {#if block.kind === 'emojiscale'}
      <!-- Ряд из 11 смайликов — визуальный ключ шкалы (в 1.x стоял под звёздами). -->
      <span class="sample row">
        {#each GRADE_FACES as _, grade (grade)}
          <span class="cell">
            <GradeFace {grade} size={22} />
            <small>{grade}</small>
          </span>
        {/each}
      </span>
    {:else}
      <!-- Кнопка-образец: ровно тот вид, что у входов на экране «Измерения» (слово
           владельца: «кнопки — адаптировать к текущему виду нынешней реализации»).
           Образец не интерактивен — это картинка интерфейса, а не сам интерфейс. -->
      <span class="sample">
        <span class="ibtn" class:gold={block.kind === 'suggest'} aria-hidden="true">
          <Icon name={block.kind === 'suggest' ? 'bulb' : 'search'} size={40} />
        </span>
      </span>
    {/if}
  {:else if block.type === 'table'}
    <div class="scroll">
      <table>
        <thead>
          <tr>
            {#each block.head[lang] as cell, cellIndex (cellIndex)}<th>{cell}</th>{/each}
          </tr>
        </thead>
        <tbody>
          {#each block.rows[lang] as row, rowIndex (rowIndex)}
            <tr>
              {#each row as cell, cellIndex (cellIndex)}<td>{@html richText(cell)}</td>{/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
{/each}

<style>
  h2 {
    font-size: 16px; font-weight: 700; color: var(--heading);
    margin: 22px 0 8px; padding-top: 12px; border-top: 1px solid var(--edge-soft);
  }
  h2:first-child { margin-top: 0; padding-top: 0; border-top: 0; }
  h3 { font-size: 14.5px; font-weight: 700; color: var(--heading); margin: 16px 0 6px; }
  /* Якорная прокрутка (пагинатор глав): заголовок не должен нырять под прибитую шапку. */
  h2, h3 { scroll-margin-top: calc(var(--bar-h, 56px) + 10px); }
  p { margin: 10px 0; }
  ul { margin: 10px 0 10px 18px; }
  li { margin: 8px 0; }
  p :global(b), li :global(b) { color: var(--heading); }

  /* ── Иллюстрации 1.x: по центру, высота — канон 1.x (researches/12). ──
     Атрибуты w/h резервируют место (height:auto держит пропорцию — ничего не прыгает),
     а видимой картинка становится ГОТОВОЙ: проявление через ok (правило владельца
     «графика не доезжает на горячую»). */
  .art { display: flex; justify-content: center; margin: 12px 0; }
  .art img {
    /* width:auto перебивает атрибут ширины (иначе ужатая max-height даёт «банку» с полями
       по бокам, и подложка красит пустоту); резерв места жив — браузер держит пропорцию
       по атрибутам w/h через встроенный aspect-ratio-мэппинг. */
    width: auto; height: auto; max-width: 100%; max-height: clamp(180px, 40vw, 300px);
    opacity: 0; transition: opacity var(--motion-base) var(--motion-ease);
  }
  .art img:global(.ok) { opacity: 1; }
  .art.logo { margin: 4px 0 14px; }
  .art.logo img { max-height: clamp(60px, 16vw, 100px); }

  /* В тёмной теме иллюстрация стоит на СВЕТЛОЙ карточке (выбор владельца, bugs/55):
     «белыми» картинки 1.x были из-за белого фона приложения — карточка возвращает им
     родную среду. Подложка не чисто белая, а «чуть-чуть в бирюзовую синеву» (слово
     владельца) — оттенок берётся от акцента самой тёмной темы (#3fd9ff). */
  :global(:root[data-theme='dark']) .art img {
    background: color-mix(in srgb, #ffffff 93%, var(--accent) 7%);
    border-radius: 14px;
    padding: 12px;
    box-shadow: var(--card-shadow);
  }

  /* ── Шкала оценок: звезда + цифра + смайлик (канон 1.x, вид звёзд — 2.0). ── */
  .grades .mark {
    display: inline-flex; flex-direction: column; align-items: center; gap: 2px;
    min-width: 34px;
  }
  .grades .mark i { font-style: normal; font-size: 17px; line-height: 1; color: var(--star); }
  .grades .mark b { font-family: var(--mono); font-size: 13px; color: var(--heading); }
  /* Ноль — как в оценке «Измерений»: звезда гаснет (bugs/54 контекст: у нуля звёзд нет). */
  .grades .mark.zero i { color: var(--faint); }

  /* ── Образцы интерфейса в тексте. ── */
  .sample { display: flex; justify-content: center; margin: 12px 0; }
  .sample.row { gap: 6px; flex-wrap: wrap; align-items: flex-end; }
  .sample .cell { display: inline-flex; flex-direction: column; align-items: center; gap: 2px; }
  .sample .cell small { font-size: 10.5px; color: var(--dim); font-family: var(--mono); }

  /* Кнопка-образец: ФОРМА и цвета — как у .ibtn на «Измерениях», но КРУПНО, как в 1.x
     (там образцы были 80×80 с иконкой 40 и радиусом 30 — «в руководстве я не стеснялся
     их увеличивать для наглядности», слово владельца). Лампочка — золото (токен --star). */
  .sample .ibtn {
    width: 80px; height: 80px; border-radius: 30px;
    display: inline-flex; align-items: center; justify-content: center;
    background: var(--panel); border: 1px solid color-mix(in srgb, var(--primary) 28%, var(--edge));
    color: var(--primary); line-height: 1;
  }
  .sample .ibtn.gold {
    color: var(--star);
    border-color: color-mix(in srgb, var(--star) 32%, var(--edge));
  }

  /* Широкую таблицу (шкала оценок) прокручиваем внутри неё самой: страница не должна
     разъезжаться по горизонтали на телефоне. */
  .scroll { overflow-x: auto; margin: 12px 0; }
  /* Таблица выглядит ТАБЛИЦЕЙ, как в 1.x (styles.css:2790: collapse, границы у КАЖДОЙ
     ячейки, зебра нечётных строк) — слово владельца: «в оригинальном NDim тут была
     таблица». Чёрные рамки 1.x переведены в токены темы. */
  table { border-collapse: collapse; width: 100%; font-size: 13.5px; }
  th, td { text-align: left; vertical-align: top; padding: 8px 10px; border: 1px solid var(--edge); }
  th { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--dim); }
  tbody tr:nth-child(odd) { background: var(--edge-soft); }
  table:not(.grades) td:first-child { font-family: var(--mono); font-weight: 700; color: var(--primary); width: 44px; }
  td :global(b) { color: var(--heading); }
</style>
