<script lang="ts">
  /**
   * НОВАЯ V1 ГЛАВНОЙ — `/`, `/ru`, `/en` (`plans/106`; эпик `plans/104`, фаза 2; `plans/102`, фаза 5).
   *
   * Макет — `design/new-landing-v1.html`, сборка владельца 2026-09-25: «*сама структура нравится,
   * утверждаю*» (№096 В5); новый лендинг становится главной (№096 В6 = Б). Линия пути человека из
   * ролика: знакомство с Максом, Алисой и Настей → тест на совместимость → результат и карточка для
   * сторис → как устроено Пространство → числа, вопросы, призыв.
   *
   * 🔴 ЗВЁЗДЫ ТЕСТА — НАСТОЯЩИЕ ОЦЕНКИ. Объекты теста — измерения каталога (`landing-demo.ts`), и по
   * «Смотреть больше» они уезжают в NDim ID гостя (№096 В8 = А: «*нужны честные изменения, которые
   * реально внутри продукта будут*»). Поэтому тест стартует ПУСТЫМ: горит только то, что человек
   * поставил сам (`plans/106`, развилка «стартовое состояние»).
   *
   * Похожесть, карта, проценты карточек и карточка для сторис выводятся из одной записи оценок
   * ядром похожести (`compat-demo.ts`) — литералов «80 %» в разметке нет.
   * [NOT-TESTED]
   */
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';

  import { DEMO_ITEMS, DEMO_PERSONAS, personaCard, personaFace, type DemoItem, type PersonaId } from '$lib/content/landing-demo';
  import { landingFaq, landingV1 as t } from '$lib/content/landing-v1-copy';
  import { kindLabel } from '$lib/content/dim-kind';
  import { catalogPath } from '$lib/content/catalog-hub';
  import {
    applyStar,
    carryRatings,
    EARLY_TAP_SCRIPT,
    rankedRelations,
    ratingsToCarry,
    replayQueue,
    type DemoRatings,
  } from '$lib/ui/compat-demo';
  import { markBridgeCrossed, popupCorner, strongestPeer } from '$lib/ui/handhold';
  import { saveTestRating } from '$lib/data/test-engine';
  import { landingTrackOptions, track, type AnalyticsEntry } from '$lib/data/funnel';
  import { endBoot, hasSession } from '$lib/data/session';
  import { landingDims, landingPeople, landingRatings, landingRelations } from '$lib/data/metrics';
  import { num, votesUnit, type Lang } from '$lib/ui/format';
  import { theme, toggleTheme } from '$lib/ui/theme.svelte';
  import { MOTION } from '$lib/ui/motion';
  import { ready } from '$lib/ui/ready';
  import Brand from '$lib/ui/Brand.svelte';
  import Icon from '$lib/ui/Icon.svelte';

  let { lang, entry }: { lang: Lang; entry: Extract<AnalyticsEntry, 'root' | 'landing'> } = $props();

  /** Вход в продукт для своих — экран входа; гостя вносит внутрь тест (№009 В3). */
  const APP_URL = '/profile';
  /**
   * Мост теста: место входа гостя — слово двери (`plans/105` Б2): `root` на `/`, `landing` на `/ru`, `/en`.
   * Адреса записаны буквально: юнит `funnel.test.ts` сверяет каждую дверь в гостя с союзом мест входа.
   */
  const GUEST_DOOR = {
    root: '/profile?guest=root',
    landing: '/profile?guest=landing',
  } as const;
  const guestUrl = $derived(GUEST_DOOR[entry]);
  /** Куда уходят шаги воронки этой страницы: на корне — только PostHog (№078 В1 = Г, `funnel.ts`). */
  const COUNT = $derived(landingTrackOptions(entry));

  // ── Оценки человека в тесте. Пусто на старте: горит только поставленное им самим. ──
  let mine = $state<DemoRatings>({});
  let touched = $state(false);

  function rate(id: string, value: number) {
    mine = applyStar(mine, id, value);
    if (!touched) {
      touched = true;
      // Второй шаг воронки: человек ПОТРОГАЛ тест. Считается один раз за визит.
      void track('demo_touch', {}, COUNT);
    }
  }

  const ranked = $derived(rankedRelations(mine));
  const relOf = (id: PersonaId) => ranked.find((x) => x.persona.id === id)?.r ?? null;
  const strongest = $derived(
    strongestPeer(ranked.map(({ persona, r }) => ({ id: persona.id, name: persona.name[lang], similarity: r?.similarity ?? null }))),
  );
  const strongestPersona = $derived(DEMO_PERSONAS.find((p) => p.id === strongest?.id) ?? null);

  // ── Карта Пространства: «Я» в центре, три лица на настоящих долях расстояния (макет, mapSvg). ──
  // Высота холста выше макетной: тест стартует пустым, все лица стоят на горизонте, и в макетных
  // 420 лицо Алисы наверху срезалось краем (кадр 2026-09-25, `plans/106` Д10).
  const MAP = {
    full: { w: 480, h: 460, min: 58, span: 150 },
    compact: { w: 340, h: 340, min: 66, span: 84 },
  } as const;
  function points(kind: keyof typeof MAP) {
    const g = MAP[kind];
    const cx = g.w / 2;
    const cy = g.h / 2 + 12;
    return {
      g,
      cx,
      cy,
      nodes: DEMO_PERSONAS.map((p) => {
        const r = relOf(p.id);
        const rate01 = r ? Math.min(1, r.distanceRateOfCommonSpaceDiameter / 100) : 1;
        const d = g.min + rate01 * g.span;
        const a = (p.angle * Math.PI) / 180;
        return { p, r, x: cx + d * Math.cos(a), y: cy + d * Math.sin(a), glow: (r?.similarity ?? 0) / 100 };
      }),
    };
  }
  const mapFull = $derived(points('full'));
  const mapCompact = $derived(points('compact'));
  const popSide = $derived(popupCorner(mapFull.nodes, mapFull.g.w));

  const item = (id: string): DemoItem => DEMO_ITEMS.find((d) => d.id === id) as DemoItem;
  /** Кавычки языка: ёлочки в русском, “лапки” в английском (кадр EN 2026-09-25 показал ёлочки — дефект). */
  const quoted = (text: string) => (lang === 'ru' ? `«${text}»` : `“${text}”`);
  /** Название объекта: работы — в кавычках языка, практики — просто словом. */
  const named = (d: DemoItem) => (d.kind === 'practice' ? d.title[lang] : quoted(d.title[lang]));
  /** Процент: в русском — через неразрывный пробел («80 %»), в английском — слитно («80%»). */
  const pct = (v: number | null | undefined) => (v === null || v === undefined ? '—' : lang === 'ru' ? `${v} %` : `${v}%`);

  // ── Мост внутрь: оценки теста уезжают в NDim ID гостя, затем переход без записи в истории ──
  let busy = $state(false);
  async function crossBridge(event: MouseEvent) {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (busy) return;
    busy = true;
    // Первая оценка рождает гостя с местом входа этой двери; профиль по адресу увидит живую сессию
    // и второго `guest_start` не пошлёт. Без оценок гостя заведёт сам профиль — как прежний мост.
    const saved = await carryRatings(ratingsToCarry(mine), (id, value) => saveTestRating(lang, id, value, entry));
    markBridgeCrossed(saved);
    location.replace(guestUrl);
  }

  onMount(() => {
    // Касания, сделанные до гидратации, — проигрываем теми же жестами (`plans/106` Д6).
    const w = window as unknown as { __ndimDemoQ?: Array<[string, number]>; __ndimDemoLive?: boolean };
    w.__ndimDemoLive = true;
    const queue = w.__ndimDemoQ ?? [];
    if (queue.length > 0) {
      mine = replayQueue(mine, queue);
      queue.length = 0;
      touched = true;
      void track('demo_touch', {}, COUNT);
    }

    // Ссылка из письма пришла на главную — уводим в профиль с кодом (боевой урок 2026-07-12).
    const query = new URLSearchParams(location.search);
    if (query.get('mode') === 'signIn' && query.has('oobCode')) {
      location.replace(`${APP_URL}${location.search}${location.hash}`);
      return;
    }
    // Лендинг только для новых (№010 Р8): вошедший и гость уходят домой под щитом (bugs/08.1, bugs/40).
    void hasSession().then((inside) => {
      if (inside) {
        location.replace(APP_URL);
        return;
      }
      endBoot();
      // Первый шаг воронки. Ничего персонального не пишет и ничего не ждёт.
      void track('landing_view', {}, COUNT);
    });
  });

  const numbers = $derived([
    { v: landingDims(), l: t.nums.dims[lang] },
    { v: landingRatings(), l: t.nums.ratings[lang] },
    { v: landingPeople(), l: t.nums.people[lang] },
    { v: landingRelations(), l: t.nums.relations[lang] },
  ]);
  const footLinks = $derived([
    { href: `/${lang}/test/compatibility`, label: t.foot.links.compatibility[lang] },
    { href: `/${lang}/test/personality`, label: t.foot.links.personality[lang] },
    { href: `/${lang}/test/love`, label: t.foot.links.love[lang] },
    { href: catalogPath(lang), label: t.foot.links.catalog[lang] },
    { href: `/${lang}/menu/manual`, label: t.foot.links.manual[lang] },
    { href: `/${lang}/menu/about`, label: t.foot.links.about[lang] },
    { href: `/${lang}/menu/author`, label: t.foot.links.author[lang] },
    { href: `/${lang}/menu/terms`, label: t.foot.links.terms[lang] },
    { href: `/${lang}/menu/privacy`, label: t.foot.links.privacy[lang] },
  ]);
  const heroOrder: PersonaId[] = ['max', 'alice', 'nastya'];
  const persona = (id: PersonaId) => DEMO_PERSONAS.find((p) => p.id === id)!;
</script>

<svelte:head>
  <!-- Ярус 1 готовности графики: портреты героя — первый экран, едут прелоадом (`AGENT_GUIDE.md`). -->
  {#each heroOrder as id (id)}
    <link rel="preload" as="image" href={personaCard(id)} />
  {/each}
</svelte:head>

<div class="land">
  <header class="top">
    <a class="brand" href={entry === 'root' ? '/' : `/${lang}`} aria-label="NDim Space"><Brand size={30} /><span>NDim Space</span></a>
    <span class="sp"></span>
    <nav class="langs" aria-label={t.top.lang[lang]}>
      <a class="pill" class:on={lang === 'ru'} href="/ru" hreflang="ru" lang="ru">RU</a>
      <a class="pill" class:on={lang === 'en'} href="/en" hreflang="en" lang="en">EN</a>
    </nav>
    <button type="button" class="pill theme" onclick={toggleTheme} aria-label={theme() === 'dark' ? t.top.themeLight[lang] : t.top.themeDark[lang]}>
      <Icon name={theme() === 'dark' ? 'sun' : 'moon'} size={13} />
    </button>
    <a class="signin" href={APP_URL}>{t.top.signin[lang]}</a>
  </header>

  <main class="wrap">
    <!-- 1. Знакомство: Макс, Алиса и Настя и их любимое (герой V3) -->
    <section class="hero">
      <div class="head">
        <p class="kicker">{t.hero.kicker[lang]}</p>
        <h1>{t.hero.h1Lead[lang]}<span class="accent">{t.hero.h1Accent[lang]}</span></h1>
        <p class="lede">{t.hero.lede[lang]}</p>
        <a class="down" href="#demo">{t.hero.down[lang]}</a>
      </div>
      <div class="trio">
        {#each heroOrder as id, i (id)}
          {@const p = persona(id)}
          <figure class="port" class:mid={i === 1}>
            <img use:ready src={personaCard(id)} alt={p.name[lang]} width="480" height="640" />
            <span class="bub" style="animation-delay:{i * 0.6}s">{named(item(p.favorite))} <b>★&nbsp;10</b></span>
            <figcaption class="nm">{p.name[lang]}, {p.age}</figcaption>
          </figure>
        {/each}
      </div>
    </section>

    <!-- 2. Тест на совместимость: звёзды, карта, мост внутрь -->
    <h2 class="demo-h" id="demo">{t.demo.h2Lead[lang]}<span class="accent">{t.demo.h2Accent[lang]}</span></h2>
    <section class="ndemo" aria-labelledby="demo">
      <div class="card play">
        <p class="how">{t.demo.how[lang]}</p>
        <div class="rows" id="compat-rows">
          {#each DEMO_ITEMS as d (d.id)}
            <div class="srow" data-dim={d.id}>
              <div class="t">
                <span class="kind">{kindLabel(d.kind, lang)}</span>{named(d)}{#if d.year}<span class="yr">&nbsp;({d.year})</span>{/if}
              </div>
              <div class="line">
                <div class="stars" role="group" aria-label={d.title[lang]}>
                  {#each Array.from({ length: 10 }, (_, i) => i + 1) as k (k)}
                    <button
                      type="button"
                      data-star={k}
                      class:on={k <= (mine[d.id] ?? 0)}
                      aria-label="{d.title[lang]}: {k}"
                      onclick={() => rate(d.id, k)}>★</button>
                  {/each}
                </div>
                <span class="val" data-val>{mine[d.id] ?? ''}</span>
              </div>
            </div>
          {/each}
        </div>
        <!-- Ранний тап: касание до гидратации красится сразу и не теряется (`plans/106` Д6). -->
        {@html `<script>${EARLY_TAP_SCRIPT}</script>`}
      </div>
      <div class="card mapcard">
        <div class="mapbox">
          {#if touched && strongest}
            <p class="popup" class:right={popSide === 'right'} aria-live="polite" transition:fade={{ duration: MOTION.base }}>
              <b>{strongest.name}</b>{t.demo.popLead[lang]}<b>{pct(strongest.similarity)}</b>
            </p>
          {/if}
          {@render map(mapFull, false)}
        </div>
        <div class="go">
          <a class="bridge" class:busy href={guestUrl} onclick={crossBridge} aria-busy={busy}>{t.demo.bridge[lang]}</a>
        </div>
      </div>
    </section>

    <!-- 3. Результат: карточки персонажей и карточка для сторис — живые от звёзд -->
    <section class="sec nres">
      <h2 class="center">{t.results.h2[lang]}</h2>
      <p class="sec-sub">{t.results.sub[lang]}</p>
      <div class="nres-grid">
        <div class="who3">
          {#each ranked as { persona: p, r } (p.id)}
            <article class="card pc">
              <div class="top3">
                <img use:ready src={personaFace(p.id)} alt="" width="64" height="64" />
                <div><b>{p.name[lang]}</b>, {p.age}</div>
                <span class="sim">{pct(r?.similarity)}</span>
              </div>
              <p class="ln">{t.persona[p.id][lang]}</p>
              <p class="loves">{t.results.loves[lang]}{p.loves.map((id) => named(item(id))).join(' · ')}</p>
            </article>
          {/each}
        </div>
        <div class="storybox">
          <div class="story">
            <div class="s1">{t.results.storyBrand[lang]}</div>
            {#if strongest && strongestPersona}
              <div class="s2" in:fade={{ duration: MOTION.base }}>
                {t.results.storyLead[lang]}{strongest.name}{t.results.storySim[lang]}<b>{pct(strongest.similarity)}</b>
              </div>
              <img use:ready src={personaFace(strongestPersona.id)} alt="" width="76" height="76" style="border-color:{strongestPersona.color}" />
            {:else}
              <div class="s2 wait">{t.results.storyLead[lang]}…</div>
              <span class="face-wait" aria-hidden="true"></span>
            {/if}
            <div class="s3">ndimspace.app</div>
          </div>
          <p class="muted">{t.results.storyCaption[lang]}</p>
        </div>
      </div>
    </section>

    <!-- 4. Как устроено Пространство: три экрана продукта рядом, без наложения -->
    <section class="sec">
      <div class="howto">
        <p class="kicker">{t.howto.kicker[lang]}</p>
        <h2><span class="accent">{t.howto.h2Accent[lang]}</span>{t.howto.h2Tail[lang]}</h2>
        <p class="lede">{t.howto.lede[lang]}</p>
      </div>
      <div class="fan5">
        <figure class="ph">
          <div class="phone"><div class="scr">
            {@render phoneTop(t.howto.screens.dims[lang])}
            {#each DEMO_ITEMS.slice(0, 3) as d (d.id)}
              <div class="dimc">
                <span class="badge">{kindLabel(d.kind, lang).toUpperCase()}</span>
                <div class="nm">{named(d)}{#if d.year}<span>&nbsp;({d.year})</span>{/if}</div>
                <div class="nd"><b>{d.rating.toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-US')}</b>NDim Space Rating · {d.votes} {votesUnit(d.votes, lang)}</div>
                <div class="sc">
                  {#each Array.from({ length: 11 }, (_, i) => i) as i (i)}
                    <span class:on={i > 0 && i <= (mine[d.id] ?? 0)}>★<small>{i}</small></span>
                  {/each}
                </div>
              </div>
            {/each}
            {@render phoneNav(3)}
          </div></div>
          <figcaption><span class="no">1</span>{t.howto.steps[0][lang]}</figcaption>
        </figure>
        <figure class="ph">
          <div class="phone"><div class="scr">
            {@render phoneTop(t.howto.screens.space[lang])}
            <div class="mapbox small">{@render map(mapCompact, true)}</div>
            {@render phoneNav(2)}
          </div></div>
          <figcaption><span class="no">2</span>{t.howto.steps[1][lang]}</figcaption>
        </figure>
        <figure class="ph">
          <div class="phone"><div class="scr">
            {@render phoneTop(t.howto.screens.relations[lang])}
            {#each ranked as { persona: p, r } (p.id)}
              <div class="rel">
                <div class="who"><img use:ready src={personaFace(p.id)} alt="" width="34" height="34" /><b>{p.name[lang]}</b><span class="sys">{t.howto.system[lang]}</span></div>
                <div class="m3">
                  {#each [{ k: t.howto.commonality[lang], v: r?.commonality }, { k: t.howto.proximity[lang], v: r?.proximity }, { k: t.howto.similarity[lang], v: r?.similarity }] as m (m.k)}
                    <div><div class="k">{m.k}</div><div class="v">{pct(m.v)}</div><div class="bar2"><i style="width:{Math.max(0, Math.min(100, m.v ?? 0))}%"></i></div></div>
                  {/each}
                </div>
              </div>
            {/each}
            {@render phoneNav(1)}
          </div></div>
          <figcaption><span class="no">3</span>{t.howto.steps[2][lang]}</figcaption>
        </figure>
      </div>
    </section>

    <!-- 5. Числа, вопросы, призыв -->
    <section class="sec">
      <div class="card">
        <p class="nums-title">{t.nums.title[lang]}</p>
        <ul class="nums">
          {#each numbers as n (n.l)}
            <li><b>{num(n.v, lang)}</b><span>{n.l}</span></li>
          {/each}
        </ul>
      </div>
    </section>

    <section class="sec">
      <h2 class="center">{t.faqTitle[lang]}</h2>
      <div class="faq">
        {#each landingFaq as g, gi (g.group.ru)}
          <h3 class="faq-g">{g.group[lang]}</h3>
          {#each g.items as x, qi (x.q.ru)}
            <details open={gi === 0 && qi === 0}>
              <summary>{x.q[lang]}</summary>
              <p>{x.a[lang]}</p>
            </details>
          {/each}
        {/each}
      </div>
    </section>

    <section class="sec">
      <div class="final">
        <h2>{t.final.h2[lang]}</h2>
        <a class="bridge" href="#demo">{t.final.go[lang]}</a>
      </div>
    </section>
  </main>

  <footer class="foot">
    <nav class="links">
      {#each footLinks as l (l.href)}
        <a href={l.href}>{l.label}</a>
      {/each}
    </nav>
    <p>{t.foot.line[lang]}</p>
  </footer>
</div>

{#snippet map(m: ReturnType<typeof points>, compact: boolean)}
  <svg class="map" viewBox="0 0 {m.g.w} {m.g.h}" role="img" aria-label={t.demo.mapLabel[lang]}>
    <defs><clipPath id="face-clip-{compact ? 'c' : 'f'}"><circle cx="0" cy="0" r="26" /></clipPath></defs>
    <circle class="ring" cx={m.cx} cy={m.cy} r={m.g.min + m.g.span} />
    {#each m.nodes as n (n.p.id)}
      <line
        class="link"
        x1={m.cx}
        y1={m.cy}
        x2={n.x.toFixed(1)}
        y2={n.y.toFixed(1)}
        stroke-opacity={Math.max(0.14, n.glow).toFixed(2)}
        stroke-width={(1.5 + 4 * n.glow).toFixed(1)} />
      <g class="face" transform="translate({n.x.toFixed(1)},{n.y.toFixed(1)})">
        <circle class="halo" r="29" stroke={n.p.color} />
        <image use:ready href={personaFace(n.p.id)} x="-26" y="-26" width="52" height="52" clip-path="url(#face-clip-{compact ? 'c' : 'f'})" preserveAspectRatio="xMidYMid slice" />
        <text class="lbl" y="46" text-anchor="middle">{n.p.name[lang]} · {pct(n.r?.similarity)}</text>
      </g>
    {/each}
    <circle class="me" cx={m.cx} cy={m.cy} r="21" />
    <text class="me-t" x={m.cx} y={m.cy + 5} text-anchor="middle">{t.demo.me[lang]}</text>
  </svg>
{/snippet}

{#snippet phoneTop(title: string)}
  <div class="notch"></div>
  <div class="bar"><Brand size={20} />NDim Space</div>
  <div class="ttl">{title}</div>
{/snippet}

{#snippet phoneNav(on: number)}
  <div class="nav">
    {#each t.howto.nav as n, i (n.ru)}
      <span class:on={i === on}>{n[lang]}</span>
    {/each}
  </div>
{/snippet}

<style>
  /* Токены макета, которых нет в теме продукта (`+layout.svelte`), — здесь и только для этой страницы. */
  .land {
    --star-off: #cfdbe8;
    --plate: #0b1420;
    --hero-wash: radial-gradient(ellipse at 50% 20%, rgba(20, 103, 214, 0.1), transparent 62%);
    min-height: 100vh;
    background: var(--bg);
    background-image: var(--hero-wash);
    color: var(--text);
    font-size: 15px;
    line-height: 1.55;
  }
  :global(:root[data-theme='dark']) .land {
    --star-off: #2a3b55;
    --hero-wash: radial-gradient(ellipse at 50% 18%, rgba(31, 168, 201, 0.18), transparent 62%);
  }

  .wrap { max-width: 1240px; margin: 0 auto; padding: 0 18px; }
  .sec { padding: 34px 0; }
  .center { text-align: center; }
  .kicker { margin: 0; font-size: 11.5px; letter-spacing: 0.16em; text-transform: uppercase; font-weight: 700; color: var(--primary); }
  :global(:root[data-theme='dark']) .kicker, :global(:root[data-theme='dark']) .accent { color: var(--accent); }
  .accent { color: var(--primary); }
  h1 { color: var(--heading); font-size: 29px; line-height: 1.15; font-weight: 800; letter-spacing: -0.01em; margin: 8px 0 10px; }
  h2 { color: var(--heading); font-size: 22px; line-height: 1.2; font-weight: 800; margin: 6px 0 10px; }
  .lede { font-size: 15.5px; margin: 0; }
  .muted { color: var(--dim); font-size: 12.5px; margin: 8px 0 0; }
  .card { background: var(--panel-solid); border: 1px solid var(--edge); border-radius: 18px; box-shadow: var(--card-shadow); }
  :global(:root[data-theme='dark']) .card { background: var(--panel); backdrop-filter: blur(10px); }

  /* Шапка: знак и имя, язык, тема, тихий вход для своих (№009 В2: «чтобы те, кто пришёл логиниться, не искали») */
  .top { display: flex; align-items: center; gap: 6px; padding: 14px; max-width: 1240px; margin: 0 auto; }
  .brand { display: flex; align-items: center; gap: 9px; font-weight: 800; color: var(--heading); font-size: 16px; white-space: nowrap; text-decoration: none; }
  .sp { flex: 1; }
  .langs { display: flex; gap: 6px; }
  .pill { font: inherit; font-size: 12px; padding: 5px 8px; border: 1px solid var(--edge); border-radius: 99px; color: var(--dim); background: var(--panel-solid); text-decoration: none; cursor: pointer; display: inline-flex; align-items: center; }
  .pill.on { color: var(--primary); border-color: var(--primary); font-weight: 700; }
  .signin { font-size: 14px; font-weight: 700; color: var(--primary); text-decoration: none; padding: 7px 12px; border: 1px solid var(--edge); border-radius: 10px; background: var(--panel-solid); }
  :global(:root[data-theme='dark']) .signin { color: var(--accent); }

  /* 1. Герой: три портрета 3:4, средний выше, у каждого пузырь «что я люблю» с настоящей оценкой */
  .hero { display: grid; gap: 16px; padding-top: 6px; }
  .down { display: inline-block; margin-top: 14px; font-weight: 800; color: var(--primary); text-decoration: none; border-bottom: 2px solid currentColor; }
  :global(:root[data-theme='dark']) .down { color: var(--accent); }
  .trio { display: flex; gap: 8px; justify-content: center; align-items: flex-end; padding-top: 34px; margin: 0; }
  .port { position: relative; width: 31%; aspect-ratio: 3 / 4; margin: 0; }
  .port.mid { width: 35%; transform: translateY(-14px); }
  .port img { width: 100%; height: 100%; object-fit: cover; object-position: 50% 18%; border-radius: 18px; box-shadow: var(--card-shadow); display: block; opacity: 0; transition: opacity var(--motion-base) var(--motion-ease); }
  .port img:global(.ok) { opacity: 1; }
  .nm { position: absolute; left: 8px; bottom: 8px; background: rgba(11, 20, 32, 0.78); color: #fff; font-weight: 800; font-size: 12.5px; padding: 3px 8px; border-radius: 9px; }
  .bub { position: absolute; left: 50%; top: -26px; transform: translateX(-50%); z-index: 3; white-space: nowrap; font-size: 11.5px; font-weight: 700; background: var(--panel-solid); color: var(--heading); border: 1px solid var(--edge); border-radius: 12px; padding: 4px 8px; box-shadow: var(--card-shadow); animation: bob 3s ease-in-out infinite; }
  .bub b { color: var(--star); }
  @keyframes bob { 50% { transform: translateX(-50%) translateY(-3px); } }

  /* 2. Тест на совместимость */
  .demo-h { text-align: center; margin: 34px 0 0; scroll-margin-top: 16px; }
  .ndemo { display: grid; gap: 14px; padding-top: 22px; }
  .play { padding: 10px 6px; }
  .how { color: var(--dim); font-size: 12.5px; margin: 0; padding: 2px 12px 6px; }
  .rows { display: flex; flex-direction: column; }
  .srow { padding: 7px 12px; }
  .srow + .srow { border-top: 1px solid var(--edge-soft); }
  .srow .t { color: var(--heading); font-weight: 700; font-size: 14.5px; line-height: 1.25; }
  .srow .yr { color: var(--dim); font-weight: 500; }
  .srow .kind { font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--dim); font-weight: 700; margin-right: 6px; }
  .line { display: flex; align-items: center; gap: 8px; margin-top: 3px; }
  .stars { display: flex; gap: 2px; }
  .stars button { font-size: 21px; line-height: 1; background: none; border: 0; cursor: pointer; color: var(--star-off); padding: 0 1px; transition: transform 0.12s, color 0.12s; }
  .stars button:global(.on) { color: var(--star); }
  @media (hover: hover) { .stars button:hover { transform: scale(1.18); } }
  .val { min-width: 22px; text-align: right; font-weight: 800; color: var(--primary); font-variant-numeric: tabular-nums; }
  :global(:root[data-theme='dark']) .val { color: var(--accent); }
  .mapcard { padding: 14px 10px 18px; text-align: center; display: flex; flex-direction: column; justify-content: center; }
  /* Телефон: карта НАД списком (закон №009 В2 «карта связей … прямо перед глазами, и звёзды»). Строк стало
     десять (№096 В14), и под списком карта уходила за экран от первой же звезды. `[AI]`, кадр — владельцу. */
  .mapcard { order: -1; }
  .mapbox { position: relative; }
  .mapbox .map { max-height: 330px; }
  .popup { position: absolute; left: 50%; transform: translateX(-50%); top: 4px; z-index: 2; margin: 0; background: var(--heading); color: var(--bg); font-size: 13px; line-height: 1.3; padding: 8px 12px; border-radius: 12px; box-shadow: var(--card-shadow); width: max-content; max-width: 88%; text-align: center; pointer-events: none; animation: pop 2.8s ease-in-out infinite; }
  .popup b { color: #ffd166; }
  :global(:root[data-theme='dark']) .popup b { color: #1467d6; }
  @keyframes pop { 0%, 100% { transform: translateX(-50%) translateY(0); } 50% { transform: translateX(-50%) translateY(-3px); } }
  .go { margin-top: 6px; }

  /* Карта Пространства — настоящие доли расстояния, лица проявляются готовыми (bugs/69) */
  .map { width: 100%; height: auto; display: block; }
  .map .ring { fill: none; stroke: var(--edge); stroke-dasharray: 3 6; }
  .map .link { stroke: var(--primary); stroke-linecap: round; transition: all 0.5s cubic-bezier(0.33, 1, 0.68, 1); }
  :global(:root[data-theme='dark']) .map .link { stroke: var(--accent); }
  .map .me { fill: var(--primary); }
  .map .me-t { fill: #fff; font: 700 13px system-ui, sans-serif; }
  .map .lbl { fill: var(--heading); font: 700 13px system-ui, sans-serif; }
  .map .face { transition: transform 0.5s cubic-bezier(0.33, 1, 0.68, 1); }
  .map .halo { fill: var(--panel-solid); stroke-width: 3; }
  .map image { opacity: 0; transition: opacity var(--motion-base) var(--motion-ease); }
  .map image:global(.ok) { opacity: 1; }

  /* Кнопка моста: «Смотреть больше» мягко пульсирует и испускает волны (№009 В3) */
  .bridge { position: relative; display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 13px 26px; border-radius: 14px; background: var(--primary); color: #fff; font-weight: 800; font-size: 15.5px; text-decoration: none; isolation: isolate; }
  .bridge::before, .bridge::after { content: ''; position: absolute; inset: 0; border-radius: 14px; border: 2px solid var(--primary); z-index: -1; animation: wave 2.4s ease-out infinite; }
  .bridge::after { animation-delay: 1.2s; }
  .bridge.busy { filter: brightness(0.92); cursor: progress; }
  @keyframes wave { 0% { transform: scale(1); opacity: 0.7; } 100% { transform: scale(1.35, 1.6); opacity: 0; } }

  /* 3. Результат */
  .sec-sub { text-align: center; color: var(--dim); font-size: 14.5px; margin: -2px auto 0; max-width: 720px; }
  .nres-grid { display: grid; gap: 18px; margin-top: 14px; }
  .who3 { display: grid; gap: 12px; }
  .pc { padding: 14px; }
  .top3 { display: flex; gap: 12px; align-items: center; color: var(--text); }
  .top3 img { width: 64px; height: 64px; border-radius: 16px; object-fit: cover; opacity: 0; transition: opacity var(--motion-base) var(--motion-ease); }
  .top3 img:global(.ok) { opacity: 1; }
  .top3 b { color: var(--heading); font-size: 17px; }
  .sim { font-size: 22px; font-weight: 800; color: var(--primary); margin-left: auto; white-space: nowrap; }
  .ln { font-size: 13.5px; margin: 8px 0 0; }
  .loves { font-size: 12.5px; color: var(--dim); margin: 6px 0 0; }
  .storybox { text-align: center; }
  .story { width: 210px; height: 373px; margin: 0 auto; border-radius: 22px; padding: 22px 18px; background: linear-gradient(160deg, #0b1f3d, #0a1426 55%, #0b2c3a); color: #eaf4ff; display: flex; flex-direction: column; justify-content: space-between; align-items: center; box-shadow: 0 24px 60px rgba(12, 19, 32, 0.35); }
  .story .s1 { font-size: 12px; opacity: 0.8; }
  .story .s2 { font-size: 21px; font-weight: 800; line-height: 1.2; }
  .story .s2 b { color: #ffd166; font-size: 44px; display: block; }
  .story .s2.wait { opacity: 0.5; }
  .story img { width: 76px; height: 76px; border-radius: 50%; object-fit: cover; border: 3px solid #7c5cff; opacity: 0; transition: opacity var(--motion-base) var(--motion-ease); }
  .story img:global(.ok) { opacity: 1; }
  .face-wait { width: 76px; height: 76px; border-radius: 50%; border: 3px dashed rgba(234, 244, 255, 0.35); }
  .story .s3 { font-size: 11px; opacity: 0.8; }

  /* 4. Как устроено: три экрана продукта в рамках телефона */
  .howto { text-align: center; }
  .howto .lede { margin: 0 auto; max-width: 720px; }
  .fan5 { display: flex; gap: 16px; justify-content: flex-start; align-items: flex-start; padding: 24px 48px 8px; margin: 0 -18px; overflow-x: auto; scroll-snap-type: x mandatory; scrollbar-width: none; }
  .ph { flex: 0 0 auto; width: 258px; display: flex; flex-direction: column; align-items: center; gap: 16px; margin: 0; scroll-snap-align: center; }
  .ph figcaption { text-align: center; font-size: 14.5px; color: var(--text); display: flex; flex-direction: column; align-items: center; gap: 8px; }
  .no { width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; background: var(--primary); color: #fff; font-weight: 800; }
  .phone { width: 240px; border-radius: 34px; padding: 9px; background: #0c1320; box-shadow: 0 24px 60px rgba(12, 19, 32, 0.28); }
  .scr { border-radius: 26px; overflow: hidden; background: var(--bg); height: 480px; position: relative; }
  .notch { width: 84px; height: 20px; border-radius: 0 0 14px 14px; background: #0c1320; margin: 0 auto 6px; }
  .bar { display: flex; align-items: center; gap: 7px; padding: 4px 12px 8px; font-weight: 800; color: var(--heading); font-size: 13px; border-bottom: 1px solid var(--edge); }
  .ttl { font-weight: 800; color: var(--heading); font-size: 17px; padding: 10px 12px 6px; }
  .nav { position: absolute; bottom: 0; left: 0; right: 0; display: flex; justify-content: space-around; padding: 7px 4px 9px; border-top: 1px solid var(--edge); background: var(--panel-solid); font-size: 9.5px; color: var(--dim); }
  .nav .on { color: var(--primary); font-weight: 700; }
  .mapbox.small { padding: 22px 6px 0; }
  .dimc { background: var(--panel-solid); border: 1px solid var(--edge); border-radius: 14px; padding: 10px 11px; margin: 0 10px 8px; }
  .badge { display: inline-block; font-size: 9px; font-weight: 800; letter-spacing: 0.08em; padding: 3px 7px; border-radius: 7px; background: rgba(20, 103, 214, 0.1); color: var(--primary); }
  .dimc .nm { color: var(--heading); font-weight: 800; font-size: 15px; margin: 5px 0 3px; }
  .dimc .nm span { color: var(--dim); font-weight: 500; }
  .nd { font-size: 11.5px; color: var(--dim); }
  .nd b { color: var(--up); font-size: 15px; margin-right: 4px; }
  .sc { display: grid; grid-template-columns: repeat(11, 1fr); margin-top: 6px; text-align: center; font-size: 12px; color: var(--star-off); }
  .sc span { display: flex; flex-direction: column; line-height: 1.1; }
  .sc span.on { color: var(--star); }
  .sc small { font-size: 8.5px; color: var(--dim); }
  .rel { background: var(--panel-solid); border: 1px solid var(--edge); border-radius: 14px; padding: 10px; margin: 0 10px 8px; }
  .rel .who { display: flex; align-items: center; gap: 8px; }
  .rel .who img { width: 34px; height: 34px; border-radius: 50%; object-fit: cover; opacity: 0; transition: opacity var(--motion-base) var(--motion-ease); }
  .rel .who img:global(.ok) { opacity: 1; }
  .rel .who b { color: var(--heading); font-size: 14px; }
  .sys { font-size: 9px; padding: 2px 6px; border-radius: 99px; background: var(--edge-soft); color: var(--dim); font-weight: 700; letter-spacing: 0.03em; }
  .m3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-top: 8px; text-align: center; }
  .m3 .k { font-size: 9.5px; color: var(--dim); }
  .m3 .v { font-size: 15px; font-weight: 800; color: var(--primary); }
  .bar2 { height: 4px; border-radius: 4px; background: var(--edge-soft); overflow: hidden; margin-top: 3px; }
  .bar2 i { display: block; height: 100%; background: linear-gradient(90deg, var(--primary), #1fa8c9); border-radius: 4px; transition: width 0.5s cubic-bezier(0.33, 1, 0.68, 1); }

  /* 5. Живые числа Пространства (снимок боя, `landing-metric.ts`) */
  .nums-title { font-size: 12px; font-weight: 700; color: var(--up); letter-spacing: 0.08em; text-transform: uppercase; display: flex; align-items: center; gap: 7px; padding: 14px 16px 0; margin: 0; }
  .nums-title::before { content: ''; width: 8px; height: 8px; border-radius: 50%; background: var(--up); box-shadow: 0 0 0 4px rgba(14, 165, 120, 0.18); animation: beat 2s infinite; }
  @keyframes beat { 50% { box-shadow: 0 0 0 7px rgba(14, 165, 120, 0.06); } }
  .nums { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px 10px; padding: 16px; margin: 0; list-style: none; }
  .nums b { display: block; font-size: 26px; font-weight: 800; color: var(--heading); font-variant-numeric: tabular-nums; }
  .nums span { font-size: 12.5px; color: var(--dim); line-height: 1.3; }

  /* Вопросы и ответы (без разметки FAQPage — researches/26 §13) */
  .faq { max-width: 760px; margin: 0 auto; }
  .faq-g { font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--primary); margin: 26px 0 2px; }
  :global(:root[data-theme='dark']) .faq-g { color: var(--accent); }
  .faq details { border-bottom: 1px solid var(--edge); padding: 14px 2px; }
  .faq summary { cursor: pointer; color: var(--heading); font-weight: 700; list-style: none; display: flex; justify-content: space-between; gap: 12px; }
  .faq summary::-webkit-details-marker { display: none; }
  .faq summary::after { content: '+'; color: var(--dim); font-size: 20px; line-height: 1; }
  .faq details[open] summary::after { content: '−'; }
  .faq details p { margin: 8px 0 0; font-size: 14.5px; }

  /* Финальный призыв и подвал */
  .final { text-align: center; padding: 34px 20px; border-radius: 22px; background: var(--plate); color: #dce9f7; overflow: hidden; }
  .final h2 { color: #fff; }
  .final .bridge { margin-top: 16px; }
  .foot { padding: 22px 18px 28px; border-top: 1px solid var(--edge); font-size: 13px; color: var(--dim); max-width: 1240px; margin: 0 auto; }
  .foot .links { display: flex; flex-wrap: wrap; gap: 8px 16px; margin-bottom: 10px; }
  .foot a { color: var(--text); text-decoration: none; }
  .foot p { margin: 0; }

  /* ── Десктоп: герой и тест в две колонки, экраны рядом без наложения (макет, 1440) ── */
  @media (min-width: 900px) {
    .wrap { padding: 0 56px; }
    .top { padding: 18px 56px; gap: 10px; }
    .pill { padding: 5px 9px; }
    .sec { padding: 56px 0; }
    h1 { font-size: 46px; }
    h2 { font-size: 32px; }
    .lede { font-size: 18px; max-width: 640px; }
    .hero { grid-template-columns: 1fr 1.05fr; gap: 36px; align-items: center; padding-top: 24px; }
    .trio { gap: 16px; }
    .bub { font-size: 13.5px; padding: 6px 10px; top: -30px; }
    .nm { font-size: 15px; }
    .demo-h { margin-top: 56px; }
    .ndemo { grid-template-columns: 1fr 1fr; gap: 32px; align-items: stretch; padding-top: 48px; }
    .mapcard { order: 0; }
    .mapbox .map { max-height: none; }
    .nres { padding-bottom: 0; }
    .nres-grid { grid-template-columns: 1fr 250px; gap: 32px; align-items: center; }
    .fan5 { justify-content: center; gap: 30px; padding: 30px 0 6px; margin: 0; overflow: visible; }
    .ph:nth-child(1) .phone { transform: rotate(-3deg); }
    .ph:nth-child(2) { margin-top: -16px; }
    .ph:nth-child(3) .phone { transform: rotate(3deg); }
    .nums { grid-template-columns: repeat(4, 1fr); padding: 22px 28px; }
    .nums b { font-size: 34px; }
    .foot { padding: 26px 56px 34px; }
  }

  @media (prefers-reduced-motion: reduce) {
    .bub, .popup, .bridge::before, .bridge::after, .nums-title::before { animation: none; }
  }
</style>
