<!--
  ХАБ КАТАЛОГА — макет **V3 «Рейтинг»**, утверждён владельцем (интервью №030, В1 = В;
  макеты — `design/catalog-hub-mockups.html`, кадры — `test-results/catalog-hub-mockups/`).

  Форма: страница — «топ по версии NDim Space». Номер места · название · год и автор · звёзды ·
  оценка · «оценено N людьми». У хаба появляется собственная ценность, а не только ссылки.

  🔴 ЗАКОН ВЛАДЕЛЬЦА 2026-08-14, ИСПОЛНЕННЫЙ ЗДЕСЬ ВЁРСТКОЙ: «названия не должны обрезаться
  троеточием, всегда полностью влазят — это закон. если длинное — карточка растет по высоте».
  Поэтому: ни `text-overflow: ellipsis`, ни `-webkit-line-clamp` на названии, высота строки
  свободна, а номер и оценка выровнены ПО ВЕРХУ (`align-items: flex-start`) — иначе они уплыли
  бы на середину многострочного имени (`AGENT_GUIDE.md` → «Названия не обрезаются НИКОГДА»).

  🔴 Один компонент на ДВА маршрута — `/{lang}/catalog/{kind}` (первая страница) и
  `…/{kind}/{page}` (вторая и дальше). Маршрута два, потому что у первой страницы адрес без
  номера; разметка одна, потому что страница одна и та же.

  Чего здесь НЕТ и что нельзя «дочинить»:
    · ни одного числа похожести и ни одного порядка близости — инвариант владельца;
    · ни одного человека и ни одной чужой оценки — публичная поверхность (интервью №022);
    · ни обложек, ни кадров — авторское право (интервью №020).
-->
<script lang="ts">
  import PublicBar from '$lib/ui/PublicBar.svelte';
  import { ratingView } from '$lib/content/dims-rating';
  import { CATALOG_COPY } from '$lib/content/catalog-copy';
  import { num } from '$lib/ui/format';
  import type { HubPageView } from '$lib/content/catalog-view';

  let { data }: { data: HubPageView } = $props();

  const t = $derived(CATALOG_COPY[data.lang]);

  /** Звёзды рисуются от округлённой средней; шкала 0…10 — жест оценки из 1.x. */
  const filled = (rating: number) => Math.round(rating);
  const average = (rating: number) => rating.toFixed(1).replace('.', data.lang === 'ru' ? ',' : '.');
  /** Год и автор в одной строке; неизвестное поле пусто и разделитель за собой не тянет. */
  const meta = (year: string, author: string) => [year, author].filter(Boolean).join(' · ');
</script>

<PublicBar lang={data.lang} otherLang={data.otherLang} otherHref={data.otherHref} />

<article class="hub">
  <p class="up"><a href={data.upHref}>← {t.up}</a></p>
  <h1>{data.title}</h1>
  <p class="lede">{t.hubLede}</p>
  <p class="counts">
    <span><b>{num(data.total, data.lang)}</b> {t.ofTotal}</span>
    <span><b>{num(data.rated, data.lang)}</b> {t.ofRated}</span>
  </p>

  <!-- Полоса соседних хабов: каждый хаб зовёт остальные шесть. Текущий стоит в полосе, но
       ссылкой не является — ссылка на самого себя ничего не добавляет ни человеку, ни роботу. -->
  <nav class="siblings" aria-label={t.siblingsLabel}>
    {#each data.siblings as s (s.key)}
      {#if s.on}
        <span class="on" aria-current="page">{s.title}</span>
      {:else}
        <a href={s.href}>{s.title}</a>
      {/if}
    {/each}
  </nav>

  <p class="sub">{t.ratingBrand} · {t.pageOf(data.page, data.pages)}</p>

  <!-- Нумерованный список и семантически: это ранжирование, а не набор карточек. Нумерация
       сквозная по хабу (`start`), поэтому на второй странице места начинаются с 61. -->
  <ol class="rank" start={data.firstRank}>
    {#each data.cards as card, i (card.slug)}
      {@const rv = ratingView(card.rates)}
      <li>
        <a class="row" href={`/${data.lang}/dimension/${card.slug}`}>
          <span class="n">{data.firstRank + i}</span>
          <span class="nm">
            <b>{card.title}</b>
            {#if meta(card.year, card.author)}<span class="mt">{meta(card.year, card.author)}</span>{/if}
            {#if rv.showStars}
              <span class="stars" aria-hidden="true">
                {#each Array(10) as _, s (s)}<i class:on={s < filled(card.rating)}>★</i>{/each}
              </span>
            {/if}
          </span>
          <span class="sc">
            {#if rv.showStars}
              <span class="val">{average(card.rating)}</span>
              {#if rv.showRaterCount}<span class="votes">{t.voted(card.rates)}</span>{/if}
            {:else}
              <!-- Ноль в поле оценки означает «не оценивали», а НЕ «оценили на ноль». Показать
                   его звёздами было бы неправдой на двух третях каталога (интервью №022, В1 = А). -->
              <span class="novotes">{t.noVotes}</span>
            {/if}
          </span>
        </a>
      </li>
    {/each}
  </ol>

  <!-- ПАГИНАЦИЯ ПЕРЕЧИСЛЯЕТ ВСЕ НОМЕРА. Цепочка «дальше → дальше» уводит карточку последней
       страницы на 47 кликов; перечисленные номера держат любую карточку в трёх кликах от
       лендинга. `rel="next"/"prev"` сознательно НЕ ставятся: Google снял их поддержку в 2019-м,
       и это был бы мёртвый код, поставленный по привычке (`researches/26` §7.2 — тот же разбор,
       по которому не ставится `SearchAction`). -->
  <nav class="pager" aria-label={t.pagerLabel}>
    {#if data.prevHref}<a class="step" href={data.prevHref}>← {t.prev}</a>{/if}
    {#each data.pageLinks as p (p.page)}
      {#if p.on}
        <span class="on" aria-current="page">{p.page}</span>
      {:else}
        <a href={p.href}>{p.page}</a>
      {/if}
    {/each}
    {#if data.nextHref}<a class="step" href={data.nextHref}>{t.next} →</a>{/if}
  </nav>

  <p class="foot">{t.foot}</p>
</article>

<style>
  .hub {
    max-width: 48rem;
    margin: 0 auto;
    padding: 1.5rem 1rem 3.5rem;
    color: var(--text);
  }
  .up {
    margin: 0 0 0.5rem;
    font-size: 0.8rem;
  }
  .up a {
    color: var(--accent);
    text-decoration: none;
  }
  h1 {
    margin: 0;
    font-size: clamp(1.5rem, 4.5vw, 2rem);
    line-height: 1.18;
    color: var(--heading);
  }
  .lede {
    margin: 0.5rem 0 0;
    font-size: 0.95rem;
    line-height: 1.55;
    color: var(--dim);
  }
  /* Полоса чисел, а не число внутри фразы: так обходится русская морфология («2774 фильма»
     против «198 музыкальных исполнителей») без единой формы, придуманной агентом. */
  .counts {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem 1.1rem;
    margin: 0.7rem 0 0;
    font-size: 0.85rem;
    color: var(--dim);
  }
  .counts b {
    color: var(--heading);
    font-weight: 700;
  }

  .siblings {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    margin: 0.9rem 0 0;
  }
  .siblings a,
  .siblings .on {
    padding: 0.3rem 0.7rem;
    border-radius: 999px;
    border: 1px solid var(--edge);
    background: var(--panel);
    color: var(--dim);
    font-size: 0.78rem;
    text-decoration: none;
  }
  .siblings .on {
    background: var(--primary);
    border-color: transparent;
    color: var(--primary-ink);
    font-weight: 600;
  }

  /* Подпись величины — имя бренда, а не безымянный агрегат. */
  .sub {
    margin: 1.2rem 0 0.6rem;
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--dim);
  }

  .rank {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  /* 🔴 ЗАКОН О НАЗВАНИЯХ: выравнивание ПО ВЕРХУ. Длинное имя переносится на несколько строк, и
     карточка растёт по высоте; номер и оценка обязаны остаться на первой строке имени, а не
     уплыть на её середину. */
  .row {
    display: flex;
    align-items: flex-start;
    gap: 0.7rem;
    padding: 0.65rem 0.75rem;
    border: 1px solid var(--edge);
    border-radius: 12px;
    background: var(--panel);
    text-decoration: none;
    color: var(--text);
  }
  .n {
    flex: 0 0 auto;
    min-width: 1.9rem;
    font-size: 0.95rem;
    font-weight: 800;
    line-height: 1.35;
    color: var(--faint);
    text-align: center;
    /* Табличные цифры: столбец номеров не гуляет по ширине от «7» к «1247». */
    font-variant-numeric: tabular-nums;
  }
  .nm {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }
  /* Ни `text-overflow`, ни `line-clamp` — имя показывается целиком (закон владельца). */
  .nm b {
    font-size: 0.9rem;
    font-weight: 600;
    line-height: 1.35;
    color: var(--heading);
    overflow-wrap: anywhere;
  }
  .mt {
    font-size: 0.75rem;
    color: var(--faint);
  }
  .stars {
    display: flex;
    gap: 1px;
    font-size: 0.6rem;
    line-height: 1;
  }
  .stars i {
    font-style: normal;
    color: var(--edge);
  }
  .stars i.on {
    color: var(--star);
  }
  .sc {
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.1rem;
    text-align: right;
  }
  .val {
    font-size: 1.1rem;
    font-weight: 800;
    line-height: 1.2;
    color: var(--heading);
    font-variant-numeric: tabular-nums;
  }
  .votes,
  .novotes {
    font-size: 0.7rem;
    color: var(--dim);
  }
  .novotes {
    font-style: italic;
    color: var(--faint);
  }

  .pager {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.3rem;
    margin: 1.2rem 0 0;
  }
  .pager a,
  .pager .on {
    min-width: 1.9rem;
    padding: 0.3rem 0.45rem;
    border-radius: 8px;
    border: 1px solid var(--edge);
    background: var(--panel);
    color: var(--dim);
    font-size: 0.78rem;
    text-align: center;
    text-decoration: none;
    font-variant-numeric: tabular-nums;
  }
  .pager .on {
    background: var(--primary);
    border-color: transparent;
    color: var(--primary-ink);
    font-weight: 700;
  }
  .pager .step {
    font-weight: 600;
    color: var(--accent);
  }

  .foot {
    margin: 1.6rem 0 0;
    padding-top: 0.8rem;
    border-top: 1px solid var(--edge);
    font-size: 0.78rem;
    line-height: 1.55;
    color: var(--faint);
  }

  @media (min-width: 1024px) {
    .hub {
      max-width: 64rem;
      padding: 2rem 1.5rem 4rem;
    }
    .nm b {
      font-size: 0.98rem;
    }
    .val {
      font-size: 1.25rem;
    }
  }
</style>
