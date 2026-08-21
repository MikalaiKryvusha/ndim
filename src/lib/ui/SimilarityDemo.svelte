<script lang="ts">
  // Демо похожести на лендинге — «пощупать до аккаунта», слой 1 (ideas/10,
  // интервью №004 В1=A). Макет: design/onboarding-demo-mockups.html, V5 «Синтез»
  // (утверждён владельцем 2026-07-11): звёзды → карта пространства → карточки.
  //
  // Похожесть считает НАСТОЯЩЕЕ ядро (import ниже) — никаких копий формул.
  // Персонажи вымышленные: оценки реальных людей не покидают сервер синхронизации
  // (интервью №002, В4). Реальные точки появятся в гостевом режиме (plans/03, этап 2).
  // Ничего не сохраняется и не отправляется: состояние живёт в памяти страницы.
  import { onMount } from 'svelte';
  import { fade, slide } from 'svelte/transition';

  import { computeRelation, MAX_RATING } from '$lib/similarity/similarity';
  import { track } from '$lib/data/funnel';
  // Мост внутрь продукта — вычисляемая часть и отметка перехода (`plans/67`, Ш2–Ш5).
  import { barWidth, markBridgeCrossed, popupCorner, strongestPeer } from '$lib/ui/handhold';
  // Хронометраж появлений — общий канон движения продукта (bugs/05), не свой на этом экране.
  import { MOTION } from '$lib/ui/motion';
  // Правило владельца «графика не появляется на горячую» (bugs/69): лица персонажей
  // проявляются готовыми — и в кружках карточек, и на карте, и в оверлее.
  import { ready } from '$lib/ui/ready';

  // Тип языка — общий (`$lib/ui/format`), а не своя копия: копий этой строки в проекте было
  // четыре, и расходятся они молча (`plans/39` шаг 1).
  import type { Lang } from '$lib/ui/format';

  let { lang, appUrl }: { lang: Lang; appUrl: string } = $props();

  // ── Измерения демо: понятные, нечувствительные качества ──
  //    ТЕРМИН: «измерение», не «ось» — пространство состоит из измерений (канон 1.x,
  //    AGENT_GUIDE → «Словарь продукта»). «Ось» — наш рабочий жаргон, наружу не выходит.
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
      note: { ru: 'заполнила все 5 измерений', en: 'filled all 5 dimensions' },
      angle: -90,
      dims: { quiet: 8, travel: 6, sport: 3, books: 9, humor: 7 },
    },
    {
      id: 'max',
      name: { ru: 'Макс', en: 'Liam' },
      color: '#0ea578',
      note: { ru: 'заполнил только 3 измерения', en: 'filled only 3 dimensions' },
      angle: 25,
      dims: { travel: 9, sport: 8, humor: 6 },
    },
    {
      id: 'nastya',
      name: { ru: 'Настя', en: 'Mia' },
      color: '#d6544f',
      note: { ru: 'заполнила все 5 измерений', en: 'filled all 5 dimensions' },
      angle: 155,
      dims: { quiet: 2, travel: 3, sport: 9, books: 1, humor: 4 },
    },
  ];

  const t = {
    title: { ru: 'Попробуйте прямо здесь', en: 'Try it right here' },
    sub: {
      ru: 'Оцените себя по пяти измерениям — Ваша точка сдвинется, а соседи пересчитаются. Алгоритм настоящий, тот же, что в продукте.',
      en: 'Rate yourself on five dimensions — your point will move and the neighbors will recalculate. The algorithm is real, the same one the product runs.',
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
    /*
     * 🔴 КНОПКА МОСТА — «Смотреть больше», слова владельца из утверждённого V4 (шапка макета
     * `design/handhold-mockups.html`: «кнопка «Смотреть больше» … — Ваши слова и утверждённый
     * V4»), закреплены синтезом №043 В1. Она заняла место прежней «Создать своё пространство»,
     * а не встала рядом: обе ведут в одну дверь, и две кнопки в двадцати пикселях друг от друга
     * были бы дефектом, а не композицией. Прежняя формулировка вдобавок перестала быть правдой —
     * человек ничего не создаёт, его вносит внутрь сам интерактив (решение владельца №009 В3).
     */
    go: { ru: 'Смотреть больше', en: 'See more' },
    /*
     * ⚠️ ТЕКСТ НА ВЫЧИТКУ, НЕ КАНОН (оговорка 3 `plans/67`, замечание QA при суде сдачи).
     * Строка стоит в утверждённых макетах а1/а2/а4, и владелец выбрал вариант вместе с ней —
     * но перечень «Ваши слова» в шапке макета (строка 308) называет только поп-ап, кнопку и
     * дверь. То есть написал её агент, а не владелец. Снять эту пометку может ТОЛЬКО его слово;
     * страницу вычитки собирает Менеджер при закрытии фазы. EN — рабочий перевод, туда же.
     */
    goMsg: {
      ru: 'Пространство пересчитало Ваши связи.',
      en: 'NDim Space has recalculated your relations.',
    },
    // Поп-ап над самым похожим. Имя и процент подставляет РАСЧЁТ, здесь только связка слов.
    popLead: { ru: ' — Ваша самая сильная связь: ', en: ' — your strongest connection: ' },
    trust: {
      ru: 'Персонажи вымышленные. Ничего не сохраняется и не отправляется — всё считается прямо в Вашем браузере.',
      en: 'The characters are fictional. Nothing is saved or sent — everything is computed right in your browser.',
    },
    zoom: { ru: 'увеличить портрет', en: 'zoom the portrait' },
    close: { ru: 'Закрыть портрет', en: 'Close the portrait' },
  };

  // ── Аватарки (homeworks/05, иллюстрации владельца через ChatGPT):
  //    кроп лица — в кружках и на карте, полная иллюстрация — в оверлее по тапу ──
  const avatarFace = (id: string) => `/img/personas/${id}_face.png`;
  const avatarFull = (id: string) => `/img/personas/${id}.png`;

  /*
   * ── ЯРУС 2 ГОТОВНОСТИ ГРАФИКИ (`ideas/27` шаг 3б, план `plans/46`, рецепт `researches/36` §3) ──
   *
   * Полные иллюстрации персонажей весят ~1,2 МБ каждая и до этой правки ехали В МОМЕНТ ТАПА по
   * зуму — «на горячую», ровно то, что владелец запретил правилом готовности графики. Греем их
   * в HTTP-кэше В ФОНЕ, когда страница уже загрузилась и браузер простаивает.
   *
   * 🔴 Ссылки ставятся ТОЛЬКО скриптом и ТОЛЬКО после `load` (правило 1 `researches/36` §2): в
   * исходном HTML их быть не должно — иначе префетч соревнуется за канал с самой отрисовкой
   * лендинга, и Perf 100 уезжает. Стережёт `tools/verify-tier2-prefetch.mjs` с ОБЕИХ сторон:
   * «нет в сыром HTML» и «есть в живом `head`».
   *
   * Уважаем экономию трафика (`saveData`) и молчим при провале: префетч — подсказка браузеру,
   * а не опора. Зум умеет жить без кэша ровно как раньше.
   */
  const warmFullPersonas = () => {
    if ((navigator as { connection?: { saveData?: boolean } }).connection?.saveData === true) return;
    for (const p of PERSONAS) {
      const link = document.createElement('link');
      link.rel = 'prefetch';
      link.as = 'image';
      link.href = avatarFull(p.id);
      document.head.append(link);
    }
  };
  const idle = (cb: () => void) =>
    'requestIdleCallback' in window
      ? (window as unknown as { requestIdleCallback: (c: () => void) => void }).requestIdleCallback(cb)
      : setTimeout(cb, 2000);
  onMount(() => {
    if (document.readyState === 'complete') idle(warmFullPersonas);
    else window.addEventListener('load', () => idle(warmFullPersonas), { once: true });
  });

  // Какой персонаж увеличен по тапу (null — оверлей закрыт)
  let zoomed = $state<(typeof PERSONAS)[number] | null>(null);

  // Стартовые оценки — осмысленный «я», от которого интересно двигать звёзды
  let mine = $state<Record<string, number>>({ quiet: 7, travel: 5, sport: 4, books: 8, humor: 6 });

  /*
   * ПОТРОГАЛ ЛИ ЧЕЛОВЕК ДЕМО — от этого зависит, показаны ли поп-ап и кнопка моста.
   *
   * Композиция владельца (А1/А2/А4: «кнопка появляется после звёзд») и решение №009 В3: большой
   * кнопки входа гостем нет вовсе, человека вносит внутрь ЕГО СОБСТВЕННОЕ действие. Поэтому
   * дверь появляется как результат движения звёзд, а не стоит на странице заранее.
   *
   * ⚠️ Цена названа честно: до первого касания в демо-блоке двери внутрь нет. Она не потеряна —
   * витрина выше несёт [Создать аккаунт] и [Войти в пространство], и это ровно те кнопки, для
   * которых решение №009 В3 их и оставило.
   */
  let touched = $state(false);

  function rate(dimId: string, value: number) {
    // Повторный клик по текущей оценке сбрасывает измерение в 0 (как в макете)
    mine[dimId] = mine[dimId] === value ? 0 : value;
    touched = true;
    // Второй шаг воронки: человек ПОТРОГАЛ демо. Считается один раз за визит.
    void track('demo_touch');
  }

  // Связи со всеми персонажами; для карточек — отсортированы по похожести
  const relations = $derived.by(() =>
    PERSONAS.map((p) => ({ p, r: computeRelation(mine, p.dims) })),
  );
  const sorted = $derived.by(() =>
    [...relations].sort((a, b) => (b.r?.similarity ?? -1) - (a.r?.similarity ?? -1)),
  );

  // ── Карта пространства ──────────────────────────────────────────────────
  // Радиус узла = настоящая доля расстояния от диаметра общего пространства.
  // Шкала честная и линейная: пунктирный горизонт = 100 % (максимально далеко),
  // центр = 0 % (тот же человек). MIN_DIST — единственное отступление: это
  // сумма радиусов «меня» и узла, чтобы при высокой похожести лица не залезали
  // на центр. Ядро на демо-персонажах даёт долю 0…78 % — то есть после этой
  // правки узлы ходят почти по всему радиусу, а не по его трети, как раньше.
  const VIEW_W = 480;
  const VIEW_H = 450;
  const CX = VIEW_W / 2;
  const CY = 220;
  const NODE_R = 26; // радиус узла-лица (было 14.5 — владелец просил крупнее)
  const ME_R = 20;
  const MIN_DIST = ME_R + NODE_R; // 0 % расстояния → узел вплотную к «мне»
  const HORIZON = 185; // 100 % расстояния → пунктирный круг у самых краёв карты
  const SPAN = HORIZON - MIN_DIST; // на что растягивается доля 0…1
  const mapPoints = $derived.by(() =>
    relations.map(({ p, r }) => {
      const rate01 = r ? Math.min(1, r.distanceRateOfCommonSpaceDiameter / 100) : 1;
      const rad = (p.angle * Math.PI) / 180;
      const dist = MIN_DIST + rate01 * SPAN;
      const x = CX + Math.cos(rad) * dist;
      const y = CY + Math.sin(rad) * dist;
      const glow = (r?.similarity ?? 0) / 100;
      // Подпись — снаружи узла: вверх для верхней половины, вниз для нижней.
      // Зажимаем в границы карты: у горизонта подпись иначе уехала бы за край.
      const raw = y < CY ? y - (NODE_R + 12) : y + (NODE_R + 22);
      const labelY = Math.min(VIEW_H - 8, Math.max(18, raw));
      return { p, r, x, y, glow, labelY };
    }),
  );

  /*
   * ── МОСТ ВНУТРЬ ПРОДУКТА: всё, что он показывает, ВЫЧИСЛЯЕТСЯ ──────────────────────────
   *
   * Правило `plans/21`, повторённое в `plans/26` §1: поп-ап выводится из расчёта, а не из
   * сценария. Ни имени, ни процента, ни угла здесь нет литералом — они едут из `sorted`,
   * который посчитан НАСТОЯЩИМ ядром (`computeRelation` выше). Решения вынесены в
   * `$lib/ui/handhold`, потому что там их достаёт `node --test`, а компонент он не поднимает.
   */
  const ranked = $derived(
    sorted.map(({ p, r }) => ({ id: p.id, name: p.name[lang], similarity: r?.similarity ?? null })),
  );
  const strongest = $derived(strongestPeer(ranked));
  // Угол поп-апа — по фактическим точкам лиц: узлы ходят по всему радиусу вслед за оценками,
  // и назначенный угол однажды накрыл бы лицо (урок Ш3 `plans/65`).
  const popCorner = $derived(popupCorner(mapPoints, VIEW_W));

  /*
   * ПЕРЕХОД ПО МОСТУ — без записи в истории (решение Н4 `plans/67`, одобрено Менеджером).
   *
   * Лендинг выталкивает вошедшего человека обратно внутрь продукта (`bugs/08.1`, и это его
   * работа). Гость, нажавший «Назад» с первого экрана продукта, попал бы на лендинг и был бы
   * молча вытолкнут — отскок. Дверей было две: не оставлять записи истории ИЛИ перестать
   * выталкивать гостя. Вторая есть регрессия `bugs/08.1` и принадлежит эпику 21 — здесь она
   * нарушила бы собственные ворота фазы. Поэтому первая.
   *
   * 🔴 Разметка остаётся ССЫЛКОЙ `<a href>`: средний клик, «открыть в новой вкладке», доступность
   * и робот обязаны работать как у всякой ссылки. Перехватывается ровно обычный левый клик.
   *
   * Почему `location.replace`, а не `goto(…, { replaceState: true })`: дверь `?guest=1` заводит
   * СЕССИЮ и документ человека, и ей полагается чистый старт страницы, а не переиспользованное
   * состояние приложения. Тем же способом лендинг уводит вошедшего (см. `[lang=lang]/+page.svelte`) —
   * один приём на оба перехода, а не два похожих.
   *
   * Честная цена, названная в Н4: пришедшему на лендинг прямой ссылкой в новой вкладке «Назад»
   * после моста возвращаться некуда — история пуста. Это конец истории вкладки, а не отскок.
   */
  function crossBridge(event: MouseEvent) {
    if (event.defaultPrevented) return;
    if (event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    // Отметка для карточки-мостика на «Связях»: экран обязан знать, что человек пришёл ОТСЮДА.
    markBridgeCrossed();
    location.replace(appUrl);
  }
</script>

<section class="demo" aria-label={t.title[lang]}>
  <h2>{t.title[lang]}</h2>
  <p class="sub">{t.sub[lang]}</p>

  <!-- Мои измерения: звёзды 0…10 с цифрой (жест оценки из 1.x) -->
  <div class="panel axes-panel">
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

  <!-- Карта пространства: я в центре, персонажи на настоящих расстояниях.
       Узлы — лица (кроп), по тапу открывается полный портрет. -->
  <div class="panel map-panel">
    <!-- Поп-ап над самым похожим (Ш2 `plans/67`). Появляется ПОСЛЕ действия человека, а не по
         таймеру: он подводит итог тому, что человек сделал сам. Имя, процент и угол — из
         расчёта; `aria-live` объявляет итог тем, кто карту не видит. -->
    {#if touched && strongest !== null}
      <p
        class="pop"
        class:right={popCorner === 'right'}
        aria-live="polite"
        transition:fade={{ duration: MOTION.base }}>
        <b>{strongest.name}</b>{t.popLead[lang]}<b>{strongest.similarity}%</b>
      </p>
    {/if}
    <svg viewBox="0 0 {VIEW_W} {VIEW_H}" role="img" aria-label={t.mapNote[lang]}>
      <defs>
        <clipPath id="demo-face-clip"><circle cx="0" cy="0" r={NODE_R - 2.5} /></clipPath>
      </defs>
      <circle cx={CX} cy={CY} r={HORIZON} fill="none" stroke="var(--edge)" stroke-dasharray="3 5" />
      {#each mapPoints as pt}
        <line
          x1={CX} y1={CY} x2={pt.x} y2={pt.y}
          stroke="var(--accent)"
          stroke-opacity={Math.max(0.12, pt.glow)}
          stroke-width={1.5 + 4 * pt.glow} />
        <text class="tag" x={pt.x} y={pt.labelY}>{pt.p.name[lang]} · {pt.r ? pt.r.similarity + '%' : '—'}</text>
        <g
          class="node"
          transform="translate({pt.x} {pt.y})"
          role="button"
          tabindex="0"
          aria-label="{pt.p.name[lang]} — {t.zoom[lang]}"
          onclick={() => (zoomed = pt.p)}
          onkeydown={(e) => e.key === 'Enter' && (zoomed = pt.p)}>
          <g class="grow">
            <circle r={NODE_R} fill="var(--panel)" stroke={pt.p.color} stroke-width="3" />
            <image
              use:ready
              href={avatarFace(pt.p.id)}
              x={-(NODE_R - 2.5)} y={-(NODE_R - 2.5)}
              width={(NODE_R - 2.5) * 2} height={(NODE_R - 2.5) * 2}
              clip-path="url(#demo-face-clip)" />
          </g>
        </g>
      {/each}
      <circle cx={CX} cy={CY} r={ME_R} fill="var(--primary)" />
      <text class="initial" x={CX} y={CY + 5}>{t.me[lang]}</text>
    </svg>
    <p class="map-note">{t.mapNote[lang]}</p>
  </div>

  <!-- Карточки персонажей: ближе всех — выше (на десктопе — левее) -->
  <div class="personas">
  {#each sorted as { p, r }, idx (p.id)}
    <div class="panel persona">
      <div class="head">
        <button
          type="button"
          class="ava"
          style="--ring:{p.color}"
          aria-label="{p.name[lang]} — {t.zoom[lang]}"
          onclick={() => (zoomed = p)}>
          <img use:ready src={avatarFace(p.id)} alt={p.name[lang]} loading="lazy" />
        </button>
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
  </div>

  <!-- Итог-панель с барами похожести — НАД блоком с кнопкой (композиция владельца, половина
       А3; на «Связях» она НЕ повторяется). Звёзды — для ввода, бары — для просмотра: те же
       `sorted`, свёрнутые в одну строку на человека прямо перед дверью. -->
  <div class="panel summary">
    {#each ranked as row (row.id)}
      <div class="row">
        <span class="name">{row.name}</span>
        <span class="track"><i style="width:{barWidth(row.similarity)}%"></i></span>
        <span class="val">{row.similarity === null ? '—' : row.similarity + '%'}</span>
      </div>
    {/each}
  </div>

  {#if touched}
    <div class="go" transition:slide={{ duration: MOTION.base }}>
      <p class="msg">{t.goMsg[lang]}</p>
      <a class="gobtn" href={appUrl} onclick={crossBridge}>{t.go[lang]}</a>
    </div>
  {/if}
  <p class="trust">{t.trust[lang]}</p>

  <!-- Оверлей: полный портрет по тапу на аватар (закрывается кликом и Esc) -->
  {#if zoomed}
    <div
      class="overlay"
      role="button"
      tabindex="0"
      aria-label={t.close[lang]}
      onclick={() => (zoomed = null)}
      onkeydown={(e) => (e.key === 'Enter' || e.key === 'Escape') && (zoomed = null)}>
      <figure class="sheet" style="--ring:{zoomed.color}">
        <img use:ready src={avatarFull(zoomed.id)} alt={zoomed.name[lang]} />
        <figcaption>
          <b>{zoomed.name[lang]}</b>
          <span>{zoomed.note[lang]}</span>
        </figcaption>
      </figure>
    </div>
  {/if}
</section>

<svelte:window onkeydown={(e) => e.key === 'Escape' && (zoomed = null)} />

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
  @media (hover: hover) {
    .stars button:hover {
      transform: scale(1.25);
    }
  }
  .axis .val {
    font-family: var(--mono);
    font-size: 13px;
    font-weight: 600;
    color: var(--accent);
    min-width: 20px;
    text-align: right;
  }

  /* ── Карта: минимум отступов, максимум пространства (правка владельца) ── */
  .map-panel {
    padding: 8px 8px 10px;
    /* Система координат для поп-апа: он висит НАД картой, а не занимает своё место в потоке —
       иначе его появление сдвигало бы карту под пальцем человека. */
    position: relative;
  }

  /* ── Поп-ап над самым похожим (Ш2 `plans/67`, макет а4) ────────────────────────────────
     🔴 Угол выбирает расчёт (`popupCorner`), а не эта таблица стилей: лицо, накрытое
     подсказкой, — дефект вида, оплаченный на макетах (урок Ш3 `plans/65`).
     `pointer-events: none` обязателен — иначе подсказка отбирала бы нажатия у лиц под ней. */
  .pop {
    position: absolute;
    z-index: 2;
    top: 10px;
    left: 10px;
    max-width: 190px;
    margin: 0;
    padding: 7px 11px;
    border-radius: 11px;
    font-size: 12px;
    line-height: 1.4;
    color: var(--heading);
    background: var(--panel);
    border: 1px solid var(--accent);
    box-shadow: var(--card-shadow);
    pointer-events: none;
  }
  .pop.right {
    left: auto;
    right: 10px;
  }
  .pop b {
    color: var(--accent);
  }
  /* Хвостик смотрит внутрь карты — к тому, о чём говорит подсказка. */
  .pop::after {
    content: '';
    position: absolute;
    right: 22px;
    bottom: -6px;
    width: 10px;
    height: 10px;
    background: var(--panel);
    border-right: 1px solid var(--accent);
    border-bottom: 1px solid var(--accent);
    transform: rotate(45deg);
  }
  .pop.right::after {
    right: auto;
    left: 22px;
  }
  svg {
    display: block;
    width: 100%;
    height: auto;
  }
  svg .initial {
    fill: #fff;
    font-size: 14px;
    font-weight: 700;
    text-anchor: middle;
  }
  svg .tag {
    fill: var(--dim);
    font-size: 15px;
    text-anchor: middle;
  }
  .map-note {
    margin-top: 6px;
    text-align: center;
    font-size: 12px;
    color: var(--faint);
  }

  /* ── Узлы карты: лицо в кольце цвета персонажа, растёт под курсором ── */
  svg .node {
    cursor: pointer;
    outline: none;
  }
  svg .grow {
    transform-box: fill-box;
    transform-origin: center;
    transition: transform 0.18s;
  }
  /* Клавиатурный фокус защите не подлежит: он существует и на тач-устройстве
     (внешняя клавиатура, программа чтения с экрана). Под `@media (hover: hover)`
     уходит ТОЛЬКО ховер (ideas/21 п. 7). */
  svg .node:focus-visible .grow {
    transform: scale(1.6);
  }
  @media (hover: hover) {
    svg .node:hover .grow {
      transform: scale(1.6);
    }
  }
  /* Лицо в точке карты — та же готовность, что и в кружках карточек (bugs/69):
     место держит круг персонажа, лицо проявляется скачанным. */
  svg image {
    opacity: 0;
    transition: opacity var(--motion-base) var(--motion-ease);
  }
  svg image:global(.ok) { opacity: 1; }

  /* ── Карточки персонажей ── */
  .persona .head {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 8px;
  }
  /* Аватар-кнопка: кроп лица в кольце цвета персонажа; мягко пульсирует,
     под курсором вырастает, по тапу открывает полный портрет */
  .ava {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    flex: 0 0 40px;
    padding: 0;
    border: 2px solid var(--ring);
    background: var(--panel);
    overflow: hidden;
    cursor: pointer;
    position: relative;
    z-index: 1;
    animation: ava-pulse 3.2s ease-in-out infinite;
    transition: transform 0.18s;
  }
  .ava img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    /* Лицо проявляется ГОТОВЫМ (правило владельца о графике, bugs/69). Место держит сама
       кнопка-кружок с кольцом персонажа — раскладка не шевелится, пустого кадра нет. */
    opacity: 0;
    transition: opacity var(--motion-base) var(--motion-ease);
  }
  .ava img:global(.ok) { opacity: 1; }
  /* Клавиатурный фокус — вне защиты по ховеру (см. пояснение у карты выше). */
  .ava:focus-visible {
    animation: none;
    transform: scale(2.2);
    z-index: 3;
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.25);
  }
  @media (hover: hover) {
    .ava:hover {
      animation: none;
      transform: scale(2.2);
      z-index: 3;
      box-shadow: 0 6px 24px rgba(0, 0, 0, 0.25);
    }
  }
  @keyframes ava-pulse {
    0%,
    100% {
      transform: scale(1);
      box-shadow: 0 0 0 0 color-mix(in srgb, var(--ring) 45%, transparent);
    }
    50% {
      transform: scale(1.07);
      box-shadow: 0 0 0 5px color-mix(in srgb, var(--ring) 0%, transparent);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .ava {
      animation: none;
    }
    .ava:focus-visible {
      transform: none;
    }
    @media (hover: hover) {
      .ava:hover {
        transform: none;
      }
    }
    /* Разделив ховер и фокус, стало видно, что клавиатурный фокус на точке карты
       выпадал из «уменьшенного движения» и до этой правки. Дописано ради связности. */
    svg .node:focus-visible .grow {
      transform: none;
    }
    @media (hover: hover) {
      svg .node:hover .grow {
        transform: none;
      }
    }
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

  /* ── Итог-панель: те же `sorted`, свёрнутые в строку на человека (Ш3 `plans/67`) ── */
  .summary {
    padding: 4px 14px;
  }
  .summary .row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 0;
    border-bottom: 1px solid var(--edge-soft);
    font-size: 13px;
  }
  .summary .row:last-child {
    border-bottom: 0;
  }
  /* Имя человека НЕ обрезается (закон владельца 2026-08-14): колонка растёт, строка переносится. */
  .summary .name {
    flex: 0 0 84px;
    font-weight: 600;
    color: var(--heading);
  }
  .summary .track {
    flex: 1;
    height: 8px;
    border-radius: 99px;
    background: var(--edge-soft);
    overflow: hidden;
  }
  .summary .track i {
    display: block;
    height: 100%;
    border-radius: 99px;
    background: linear-gradient(90deg, var(--primary), var(--accent));
    transition: width 0.25s;
  }
  .summary .val {
    flex: 0 0 44px;
    text-align: right;
    font-family: var(--mono);
    font-weight: 700;
    color: var(--accent);
  }

  /* ── Блок с кнопкой моста: итог словами + дверь внутрь (Ш4 `plans/67`, макет А2) ────────
     Форма — карточка мягкого зова, та же, что у постоянной карточки гостя внутри продукта:
     один язык на обеих сторонах моста. */
  .go {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    margin-top: 16px;
    padding: 13px 15px;
    border-radius: 14px;
    background: color-mix(in srgb, var(--primary) 8%, var(--panel));
    border: 1px solid color-mix(in srgb, var(--primary) 45%, var(--edge));
  }
  .go .msg {
    flex: 1 1 200px;
    margin: 0;
    font-size: 13.5px;
    line-height: 1.45;
    color: var(--heading);
  }
  /*
   * ВОЛНЫ — дословное исполнение В3 владельца: кнопка «мягко пульсирует, светится и испускает
   * волны» (макет А2, закреплён синтезом №043 В1). Два кольца с разбегом в половину такта дают
   * непрерывный ход, а не мигание.
   */
  .gobtn {
    position: relative;
    flex: none;
    padding: 13px 22px;
    border-radius: 12px;
    text-decoration: none;
    background: var(--primary);
    color: var(--primary-ink);
    font-weight: 700;
    font-size: 14.5px;
    box-shadow:
      0 0 0 8px color-mix(in srgb, var(--primary) 16%, transparent),
      0 0 0 16px color-mix(in srgb, var(--primary) 8%, transparent);
    transition: filter 0.15s;
  }
  .gobtn::before,
  .gobtn::after {
    content: '';
    position: absolute;
    inset: -6px;
    border-radius: 16px;
    border: 2px solid var(--primary);
    opacity: 0;
    animation: bridge-wave 2.4s ease-out infinite;
  }
  .gobtn::after {
    animation-delay: 1.2s;
  }
  @keyframes bridge-wave {
    0% {
      transform: scale(0.92);
      opacity: 0.55;
    }
    100% {
      transform: scale(1.25);
      opacity: 0;
    }
  }
  @media (hover: hover) {
    .gobtn:hover {
      filter: brightness(1.1);
    }
  }
  /* Человек, попросивший систему не анимировать, волн не видит — кольца остаются, ход гаснет.
     Тот же уговор, что у пульса аватарок выше и у всего движения продукта (bugs/05). */
  @media (prefers-reduced-motion: reduce) {
    .gobtn::before,
    .gobtn::after {
      animation: none;
    }
  }
  .trust {
    margin-top: 10px;
    text-align: center;
    font-size: 12px;
    color: var(--faint);
  }

  /* ── Оверлей полного портрета ── */
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: grid;
    place-items: center;
    padding: 24px;
    border: none;
    background: color-mix(in srgb, var(--bg) 45%, rgba(4, 10, 20, 0.55));
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    /* 🖱 Палец, а не лупа (`bugs/151`, слово владельца 2026-08-18 об открытом фото). Здесь это
       БЛИЗНЕЦ правки в `Avatar.svelte`: тот же жест «открытый портрет закрывается нажатием»,
       и разный курсор на нём был бы разным языком в одном продукте. Остальные три курсора
       этого файла уже пальцы — лупа выбивалась одна. */
    cursor: pointer;
    animation: overlay-in 0.18s ease-out;
  }
  .sheet {
    margin: 0;
    max-width: min(84vw, 360px);
    background: var(--panel);
    border: 1px solid var(--edge);
    border-radius: 18px;
    padding: 12px;
    box-shadow: var(--card-shadow);
    animation: sheet-in 0.2s ease-out;
  }
  .sheet img {
    display: block;
    width: 100%;
    height: auto;
    border-radius: 12px;
    border: 2px solid var(--ring);
    /* Полный портрет тоже проявляется готовым (bugs/69): оверлей не мигает пустой рамкой. */
    opacity: 0;
    transition: opacity var(--motion-base) var(--motion-ease);
  }
  .sheet img:global(.ok) { opacity: 1; }
  .sheet figcaption {
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 10px 4px 2px;
  }
  .sheet b {
    color: var(--heading);
    font-size: 16px;
  }
  .sheet span {
    color: var(--faint);
    font-size: 12.5px;
  }
  @keyframes overlay-in {
    from {
      opacity: 0;
    }
  }
  @keyframes sheet-in {
    from {
      opacity: 0;
      transform: scale(0.92);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .overlay,
    .sheet {
      animation: none;
    }
  }

  /* ── Десктоп: демо расходится вширь (правка владельца 2026-07-11) ──
     Слева — звёзды и под ними карточки соседей, справа — большая карта во всю
     высоту обеих строк: двигаешь оценку и сразу видишь, как соседи перемещаются.
     Карточки уходят влево (а не в ряд под картой) намеренно: иначе под коротким
     блоком звёзд остаётся пустая колонка — ровно то, от чего мы уходим.
     На телефоне всё остаётся вертикальной лентой, как было. Оверлей портрета —
     position: fixed, из потока сетки выпадает и на раскладку не влияет. */
  @media (min-width: 760px) {
    .demo {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr);
      align-items: start;
      gap: 14px;
    }
    /* Итог-панель и блок с кнопкой идут во всю ширину и ПОСЛЕ обеих колонок: композиция
       владельца ставит панель НАД кнопкой, а кнопку — последним шагом демо. */
    h2,
    .sub,
    .summary,
    .go,
    .trust {
      grid-column: 1 / -1;
    }
    .sub {
      margin-bottom: 4px;
    }
    .panel {
      margin-bottom: 0;
    }
    .axes-panel {
      grid-column: 1;
    }
    /* Карта занимает вторую колонку и обе строки — звёзды и карточки соседей */
    .map-panel {
      grid-column: 2;
      grid-row: 3 / span 2;
    }
    .personas {
      grid-column: 1;
      display: grid;
      gap: 12px;
    }
  }
</style>
