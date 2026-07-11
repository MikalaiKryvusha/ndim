<script lang="ts">
  // Демо похожести на лендинге — «пощупать до аккаунта», слой 1 (ideas/10,
  // интервью №004 В1=A). Макет: design/onboarding-demo-mockups.html, V5 «Синтез»
  // (утверждён владельцем 2026-07-11): звёзды → карта пространства → карточки.
  //
  // Похожесть считает НАСТОЯЩЕЕ ядро (import ниже) — никаких копий формул.
  // Персонажи вымышленные: оценки реальных людей не покидают вычислитель
  // (интервью №002, В4). Реальные точки появятся в гостевом режиме (plans/03, этап 2).
  // Ничего не сохраняется и не отправляется: состояние живёт в памяти страницы.
  import { computeRelation, MAX_RATING } from '$lib/similarity/similarity';

  type Lang = 'ru' | 'en';
  let { lang, appUrl }: { lang: Lang; appUrl: string } = $props();

  // ── Оси демо: понятные, нечувствительные качества ──
  const AXES = [
    { id: 'quiet', name: { ru: 'Люблю тишину', en: 'Quiet time' } },
    { id: 'travel', name: { ru: 'Путешествия', en: 'Travel' } },
    { id: 'sport', name: { ru: 'Спорт', en: 'Sports' } },
    { id: 'books', name: { ru: 'Книги', en: 'Books' } },
    { id: 'humor', name: { ru: 'Чувство юмора', en: 'Sense of humor' } },
  ] as const;

  // ── Вымышленные персонажи. Имена — популярные: RU и США (решение владельца).
  //    Аватарки-иллюстрации приедут с homeworks/05; пока — кружок с буквой. ──
  const PERSONAS = [
    {
      id: 'alice',
      name: { ru: 'Алиса', en: 'Emma' },
      color: '#7c5cff',
      note: { ru: 'заполнила все 5 осей', en: 'filled all 5 axes' },
      angle: -90,
      dims: { quiet: 8, travel: 6, sport: 3, books: 9, humor: 7 },
    },
    {
      id: 'max',
      name: { ru: 'Макс', en: 'Liam' },
      color: '#0ea578',
      note: { ru: 'заполнил только 3 оси', en: 'filled only 3 axes' },
      angle: 25,
      dims: { travel: 9, sport: 8, humor: 6 },
    },
    {
      id: 'nastya',
      name: { ru: 'Настя', en: 'Mia' },
      color: '#d6544f',
      note: { ru: 'заполнила все 5 осей', en: 'filled all 5 axes' },
      angle: 155,
      dims: { quiet: 2, travel: 3, sport: 9, books: 1, humor: 4 },
    },
  ];

  const t = {
    title: { ru: 'Попробуйте прямо здесь', en: 'Try it right here' },
    sub: {
      ru: 'Оцените себя по пяти осям — Ваша точка сдвинется, а соседи пересчитаются. Алгоритм настоящий, тот же, что в продукте.',
      en: 'Rate yourself on five axes — your point will move and the neighbors will recalculate. The algorithm is real, the same one the product runs.',
    },
    mapNote: {
      ru: 'Расстояния настоящие. Чем ярче линия — тем сильнее связь.',
      en: 'The distances are real. The brighter the line, the stronger the connection.',
    },
    me: { ru: 'Я', en: 'Me' },
    closest: { ru: ' · ближе всех', en: ' · closest' },
    similarity: { ru: 'похожесть', en: 'similarity' },
    proximity: { ru: 'близость', en: 'proximity' },
    commonality: { ru: 'общность', en: 'commonality' },
    cta: { ru: 'Создать своё пространство', en: 'Create your space' },
    trust: {
      ru: 'Персонажи вымышленные. Ничего не сохраняется и не отправляется — всё считается прямо в Вашем браузере.',
      en: 'The characters are fictional. Nothing is saved or sent — everything is computed right in your browser.',
    },
  };

  // Стартовые оценки — осмысленный «я», от которого интересно двигать звёзды
  let mine = $state<Record<string, number>>({ quiet: 7, travel: 5, sport: 4, books: 8, humor: 6 });

  function rate(axisId: string, value: number) {
    // Повторный клик по текущей оценке сбрасывает ось в 0 (как в макете)
    mine[axisId] = mine[axisId] === value ? 0 : value;
  }

  // Связи со всеми персонажами; для карточек — отсортированы по похожести
  const relations = $derived.by(() =>
    PERSONAS.map((p) => ({ p, r: computeRelation(mine, p.dims) })),
  );
  const sorted = $derived.by(() =>
    [...relations].sort((a, b) => (b.r?.similarity ?? -1) - (a.r?.similarity ?? -1)),
  );

  // ── Мини-карта: радиус = настоящая доля расстояния от диаметра общего пространства ──
  const CX = 260;
  const CY = 150;
  const MAX_R = 118;
  const mapPoints = $derived.by(() =>
    relations.map(({ p, r }) => {
      const rate01 = r ? Math.min(1, r.distanceRateOfCommonSpaceDiameter / 100) : 1;
      const rad = (p.angle * Math.PI) / 180;
      const dist = rate01 * MAX_R + 26;
      const x = CX + Math.cos(rad) * dist;
      const y = CY + Math.sin(rad) * dist;
      const glow = (r?.similarity ?? 0) / 100;
      return { p, r, x, y, glow, labelY: y < CY ? y - 22 : y + 30 };
    }),
  );
</script>

<section class="demo" aria-label={t.title[lang]}>
  <h2>{t.title[lang]}</h2>
  <p class="sub">{t.sub[lang]}</p>

  <!-- Мои оси: звёзды 0…10 с цифрой (жест оценки из 1.x) -->
  <div class="panel">
    {#each AXES as axis}
      <div class="axis">
        <span class="name">{axis.name[lang]}</span>
        <div class="stars" role="group" aria-label={axis.name[lang]}>
          {#each Array.from({ length: MAX_RATING }, (_, i) => i + 1) as k}
            <button
              type="button"
              class:on={k <= mine[axis.id]}
              aria-label="{axis.name[lang]}: {k}"
              onclick={() => rate(axis.id, k)}>★</button>
          {/each}
        </div>
        <span class="val">{mine[axis.id]}</span>
      </div>
    {/each}
  </div>

  <!-- Карта пространства: я в центре, персонажи на настоящих расстояниях -->
  <div class="panel">
    <svg viewBox="0 0 520 300" role="img" aria-label={t.mapNote[lang]}>
      <circle cx={CX} cy={CY} r={MAX_R + 14} fill="none" stroke="var(--edge)" stroke-dasharray="3 5" />
      {#each mapPoints as pt}
        <line
          x1={CX} y1={CY} x2={pt.x} y2={pt.y}
          stroke="var(--accent)"
          stroke-opacity={Math.max(0.12, pt.glow)}
          stroke-width={1 + 3 * pt.glow} />
        <circle cx={pt.x} cy={pt.y} r="13" fill={pt.p.color} />
        <text class="initial" x={pt.x} y={pt.y + 4}>{pt.p.name[lang][0]}</text>
        <text class="tag" x={pt.x} y={pt.labelY}>{pt.p.name[lang]} · {pt.r ? pt.r.similarity + '%' : '—'}</text>
      {/each}
      <circle cx={CX} cy={CY} r="15" fill="var(--primary)" />
      <text class="initial" x={CX} y={CY + 4}>{t.me[lang]}</text>
    </svg>
    <p class="map-note">{t.mapNote[lang]}</p>
  </div>

  <!-- Карточки персонажей: ближе всех — выше -->
  {#each sorted as { p, r }, idx (p.id)}
    <div class="panel persona">
      <div class="head">
        <div class="ava" style="background:{p.color}">{p.name[lang][0]}</div>
        <div class="titles">
          <div class="who">{p.name[lang]}{idx === 0 ? t.closest[lang] : ''}</div>
          <div class="meta">{p.note[lang]}</div>
        </div>
        <div class="big">{r ? r.similarity + '%' : '—'}</div>
      </div>
      {#each [
        { label: t.similarity[lang], pct: r?.similarity ?? 0, hero: true },
        { label: t.proximity[lang], pct: r?.proximity ?? 0, hero: false },
        { label: t.commonality[lang], pct: r?.commonality ?? 0, hero: false },
      ] as row}
        <div class="bar" class:hero={row.hero}>
          <span class="lbl">{row.label}</span>
          <div class="track"><div class="fill" style="width:{Math.max(0, row.pct)}%"></div></div>
          <span class="pct">{row.pct}%</span>
        </div>
      {/each}
    </div>
  {/each}

  <div class="cta"><a href={appUrl}>{t.cta[lang]} →</a></div>
  <p class="trust">{t.trust[lang]}</p>
</section>

<style>
  .demo {
    margin-top: 22px;
  }
  h2 {
    text-align: center;
    font-size: 22px;
    font-weight: 800;
    letter-spacing: -0.01em;
    color: var(--heading);
  }
  .sub {
    margin: 8px 0 16px;
    text-align: center;
    font-size: 14px;
    line-height: 1.6;
    color: var(--dim);
  }

  .panel {
    background: var(--panel);
    border: 1px solid var(--edge);
    border-radius: 14px;
    padding: 16px 18px;
    margin-bottom: 12px;
    backdrop-filter: blur(var(--panel-blur));
    -webkit-backdrop-filter: blur(var(--panel-blur));
    box-shadow: var(--card-shadow);
    transition: background 0.3s, border-color 0.3s;
  }

  /* ── Звёзды ── */
  .axis {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 0;
    flex-wrap: wrap;
  }
  .axis .name {
    flex: 0 0 112px;
    font-size: 13.5px;
    color: var(--text);
  }
  .stars {
    display: flex;
    gap: 1px;
  }
  .stars button {
    font-size: 16px;
    line-height: 1;
    cursor: pointer;
    border: none;
    background: none;
    color: var(--edge);
    padding: 2px 1px;
    transition: color 0.1s, transform 0.1s;
  }
  .stars button.on {
    color: var(--star, #e8a516);
  }
  .stars button:hover {
    transform: scale(1.25);
  }
  .axis .val {
    font-family: var(--mono);
    font-size: 13px;
    font-weight: 600;
    color: var(--accent);
    min-width: 20px;
    text-align: right;
  }

  /* ── Карта ── */
  svg {
    display: block;
    width: 100%;
    height: auto;
  }
  svg .initial {
    fill: #fff;
    font-size: 11px;
    font-weight: 700;
    text-anchor: middle;
  }
  svg .tag {
    fill: var(--dim);
    font-size: 12px;
    text-anchor: middle;
  }
  .map-note {
    margin-top: 6px;
    text-align: center;
    font-size: 12px;
    color: var(--faint);
  }

  /* ── Карточки персонажей ── */
  .persona .head {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 8px;
  }
  .ava {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    flex: 0 0 34px;
    display: grid;
    place-items: center;
    font-weight: 700;
    color: #fff;
    font-size: 15px;
  }
  .who {
    font-weight: 600;
    color: var(--heading);
    font-size: 15px;
  }
  .meta {
    font-size: 12px;
    color: var(--faint);
  }
  .big {
    margin-left: auto;
    font-family: var(--mono);
    font-size: 21px;
    font-weight: 700;
    color: var(--accent);
  }

  .bar {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 5px 0;
  }
  .bar .lbl {
    flex: 0 0 84px;
    font-size: 12px;
    color: var(--dim);
  }
  .bar .track {
    flex: 1;
    height: 8px;
    border-radius: 99px;
    background: var(--edge-soft);
    overflow: hidden;
  }
  .bar .fill {
    height: 100%;
    border-radius: 99px;
    background: var(--primary);
    transition: width 0.25s;
  }
  .bar.hero .fill {
    background: linear-gradient(90deg, var(--primary), var(--accent));
  }
  .bar .pct {
    font-family: var(--mono);
    font-size: 12px;
    font-weight: 600;
    color: var(--heading);
    min-width: 40px;
    text-align: right;
  }

  /* ── CTA и честность ── */
  .cta {
    text-align: center;
    margin-top: 16px;
  }
  .cta a {
    display: inline-block;
    padding: 13px 24px;
    border-radius: 10px;
    text-decoration: none;
    background: var(--primary);
    color: var(--primary-ink);
    font-weight: 600;
    font-size: 15px;
    box-shadow: 0 0 22px color-mix(in srgb, var(--primary) 35%, transparent);
    transition: filter 0.15s;
  }
  .cta a:hover {
    filter: brightness(1.1);
  }
  .trust {
    margin-top: 10px;
    text-align: center;
    font-size: 12px;
    color: var(--faint);
  }
</style>
