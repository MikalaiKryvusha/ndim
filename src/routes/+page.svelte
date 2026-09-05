<script lang="ts">
  /*
   * ГЛАВНАЯ С СОДЕРЖАНИЕМ — корень `ndimspace.app/`. Макет **V5**, собранный ВЛАДЕЛЬЦЕМ
   * 2026-09-05 из двух показанных ему вариантов (`design/root-minilanding-mockups.html`,
   * интервью №060). Его слова дословно:
   *
   *   «*берем верх от V4, под карточкой "Пространство NDim сейчас · The NDim Space right now"
   *   помещаем одну мультиязычную карточку из v3…  Далее низ от v4*»
   *   «*Вот это нужно было в виджет поднять*» — и перечислил блок целиком: имя · «Русский» ·
   *   строка о Пространстве · три шага.
   *
   * ── ЧТО ЗДЕСЬ БЫЛО ДО ЭТОГО И ПОЧЕМУ УШЛО ────────────────────────────────────────────────
   * Корень был РАСПОЗНАВАТЕЛЕМ ЯЗЫКА под `noindex` (`plans/39` шаг 2, №010 Р5): смотрел память
   * и браузер и уводил `location.replace()` на `/ru` или `/en`. Решение отменено САМИМ
   * ВЛАДЕЛЬЦЕМ — №058 В1 = А: «корень становится главной с содержанием, одной ступенью».
   * Пока увод жив, человек с включённым JS не увидел бы этой страницы ни кадра, и она
   * существовала бы только для роботов. Поэтому увода нет, `noindex` снят, `<noscript>` с двумя
   * ссылками не нужен: ссылки языка теперь видит каждый.
   *
   * ── 🔴 ЕДИНСТВЕННЫЙ КОНТРАКТ, КОТОРЫЙ ОСТАЁТСЯ И ОСТАЁТСЯ ПЕРВЫМ ──────────────────────────
   * ССЫЛКИ ИЗ ПИСЕМ ВХОДЯТ ЧЕРЕЗ КОРЕНЬ. Action URL писем Firebase указывает на корень домена
   * (наследие 1.x). Поймано боевым выкатом 2026-07-12: человек, ткнув ссылку из письма, обязан
   * попасть в `/profile` с НЕТРОНУТЫМ query (`mode=signIn&oobCode=…`). Проверка идёт до всего
   * остального и до всякого JS приложения — инлайн-скриптом.
   *
   * ⚠️ Ветка языка из этого скрипта УБРАНА. Значит корень перестал быть второй узаконенной
   * копией чтения `ndim-lang`; ожидание `tools/verify-lang-module.mjs` правится тем же
   * коммитом — иначе страж остался бы зелёным, охраняя порядок, которого больше нет.
   */
  import { SITE_ORIGIN } from '$lib/site';
  import { LANGS, X_DEFAULT } from '$lib/content/langs';
  import { catalogPath } from '$lib/content/catalog-hub';
  import { siteJsonLd } from '$lib/content/dim-jsonld';
  import { num } from '$lib/ui/format';
  import Brand from '$lib/ui/Brand.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import type { StripCard } from './+page.server';

  let { data }: { data: { strip: StripCard[]; dims: number; ratings: number; people: number; relations: number } } = $props();

  const canonicalUrl = `${SITE_ORIGIN}/`;
  const siteLd = JSON.stringify(siteJsonLd(SITE_ORIGIN)).replace(/</g, '\\u003c');

  /*
   * ⚠️ ЧТО ЗАПРЕЩЕНО ТРОГАТЬ В ЭТИХ СТРОКАХ, и почему это стоит здесь, а не в чужом документе:
   *  · двуязычная пара НЕ пишется одной строкой через «·» — она разносится на две (его слово
   *    2026-09-05: «такие строки мультиязычные принудительно разноси на две строки»);
   *  · сноска-провенанс («Снимок от…», «Названия взяты из среза каталога…») на лице продукта
   *    не пишется вовсе — его слово о ней: «это нахуй»;
   *  · оправданий нет ни одного: «Смотреть можно без аккаунта» он назвал противозаконным по
   *    своей стилометрии. Стережёт `tools/guard-product-copy.mjs`.
   */
  const T = {
    langLabel: { ru: 'Язык страницы', en: 'Site language' },
    now: { ru: 'Пространство NDim сейчас', en: 'The NDim Space right now' },
    dims: { ru: 'объектов человеческой культуры', en: 'objects of human culture' },
    ratings: { ru: 'оценок поставлено', en: 'ratings cast' },
    people: { ru: 'человек в Пространстве', en: 'people in the Space' },
    relations: { ru: 'связей рассчитано', en: 'relations computed' },
    name: { ru: 'Пространство NDim', en: 'NDim Space' },
    lede: {
      ru: 'В Пространстве NDim Вы найдёте людей, действительно похожих на Вас.',
      en: 'In the NDim Space you will find people who are genuinely like you.',
    },
    steps: {
      ru: [
        'Люди оценивают объекты человеческой культуры — фильмы, сериалы, книги, игры.',
        'Пространство NDim считает Похожесть между людьми по их оценкам.',
        'В Связях Вы видите людей с наибольшей Похожестью на Вас.',
      ],
      en: [
        'People rate objects of human culture — films, series, books, games.',
        'The NDim Space computes Similarity between people from their ratings.',
        'In Relations you see the people with the highest Similarity to you.',
      ],
    },
    catHead: { ru: 'Что оценивают в Пространстве', en: 'What people rate in the Space' },
    catLede: { ru: 'Рейтинги, собранные из оценок людей.', en: 'Ratings built from what people voted.' },
    catAll: { ru: 'Весь каталог', en: 'The whole catalog' },
    // Кнопка — его слово дословно, с принудительным переносом перед «без регистрации».
    ctaRu: ['Войти в Пространство NDim Space гостем', 'без регистрации'],
    ctaEn: ['Enter NDim Space as a guest', 'without signing up'],
    quiet: { ru: 'Войти в Аккаунт', en: 'Log In' },
    metaTitle: 'NDim Space — Пространство NDim',
    metaDesc:
      'Оцените фильмы, книги, музыку и всё, что Вы любите, и Пространство NDim Space найдёт Вам людей, которые думают так же, как и Вы.',
  } as const;

  // `<\/script>` — иначе парсер закрыл бы блок компонента на этой строке.
  const EMAIL_DOOR = `<script>
(function () {
	try {
		var q = location.search, h = location.hash;
		// Точный разбор, а не подстрокой: параметр встречается и в чужих адресах.
		var p = new URLSearchParams(q);
		if (p.get('mode') === 'signIn' && p.has('oobCode')) {
			location.replace('/profile' + q + h);
		}
	} catch (e) { /* сломался разбор — человек просто остаётся на главной */ }
})();
<\/script>`;
</script>

<svelte:head>
  <title>{T.metaTitle}</title>
  <link rel="canonical" href={canonicalUrl} />
  <!-- Двусторонний hreflang с самоссылкой (researches/26 §4.1). `x-default` на английский —
       решение владельца (интервью №010, Р5), агент его не отменяет. -->
  {#each LANGS as l (l)}
    <link rel="alternate" hreflang={l} href={`${SITE_ORIGIN}/${l}`} />
  {/each}
  <link rel="alternate" hreflang="x-default" href={`${SITE_ORIGIN}/${X_DEFAULT}`} />
  <meta name="description" content={T.metaDesc} />
  <meta property="og:title" content={T.metaTitle} />
  <meta property="og:description" content={T.metaDesc} />
  <meta property="og:type" content="website" />
  <meta property="og:url" content={canonicalUrl} />
  {@html `<script type="application/ld+json">${siteLd}</script>`}
  {@html EMAIL_DOOR}
</svelte:head>

<!-- Фон-поле: та же сеть узлов, что на лендинге и на экране входа. Декорация целиком. -->
<div class="field" aria-hidden="true">
  <svg viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice">
    <g class="links">
      <line x1="120" y1="180" x2="320" y2="120" /><line x1="320" y1="120" x2="470" y2="260" />
      <line x1="1180" y1="140" x2="1330" y2="240" /><line x1="1040" y1="90" x2="1180" y2="140" />
      <line x1="180" y1="640" x2="360" y2="740" /><line x1="1240" y1="660" x2="1100" y2="780" />
      <line x1="90" y1="420" x2="230" y2="470" /><line x1="1350" y1="430" x2="1230" y2="500" />
    </g>
    <g class="nodes">
      <circle cx="120" cy="180" r="3.5" /><circle cx="320" cy="120" r="5" />
      <circle cx="470" cy="260" r="3" /><circle cx="1180" cy="140" r="4.5" />
      <circle cx="1330" cy="240" r="3" /><circle cx="1040" cy="90" r="2.5" />
      <circle cx="180" cy="640" r="4" /><circle cx="360" cy="740" r="3" />
      <circle cx="1240" cy="660" r="4.5" /><circle cx="1100" cy="780" r="3" />
      <circle cx="90" cy="420" r="3" /><circle cx="230" cy="470" r="4" />
      <circle cx="1350" cy="430" r="3.5" /><circle cx="1230" cy="500" r="2.5" />
    </g>
  </svg>
</div>

<main class="door">
  <!-- ЯРЛЫК ЯЗЫКА — подписанный, с автонимами прямыми ссылками (researches/59: список ссылок,
       а не селект; порог селекта наступает примерно после двадцати языков). Кнопка темы живёт
       инлайн-скриптом `app.html` по идентификатору `theme-toggle`: бандла тут нет. -->
  <div class="langbar">
    <span class="lb">{T.langLabel.ru}<span class="en">{T.langLabel.en}</span></span>
    <span class="autos">
      <a href="/ru">Русский</a><a href="/en">English</a>
    </span>
    <button type="button" id="theme-toggle" class="theme" aria-label="Тема · Theme">
      <span class="i-sun"><Icon name="sun" size={16} /></span>
      <span class="i-moon"><Icon name="moon" size={16} /></span>
    </button>
  </div>

  <span class="mark"><Brand size={60} /></span>
  <h1 class="word">NDim Space</h1>

  <!-- ВИТРИНА — состояние Пространства первым содержанием (верх V4). Числа приезжают
       ПРЕРЕНДЕРОМ из снимка: `bugs/81`, строка обязана быть в первом кадре. -->
  <section class="showcase" aria-label="{T.now.ru} · {T.now.en}">
    <div class="sl">{T.now.ru}<span class="en">{T.now.en}</span></div>
    <div class="facts">
      <div class="fact"><div class="n">{num(data.dims, 'ru')}</div><div class="l">{T.dims.ru}<span class="en">{T.dims.en}</span></div></div>
      <div class="fact"><div class="n">{num(data.ratings, 'ru')}</div><div class="l">{T.ratings.ru}<span class="en">{T.ratings.en}</span></div></div>
      <div class="fact"><div class="n">{num(data.people, 'ru')}</div><div class="l">{T.people.ru}<span class="en">{T.people.en}</span></div></div>
      <div class="fact"><div class="n">{num(data.relations, 'ru')}</div><div class="l">{T.relations.ru}<span class="en">{T.relations.en}</span></div></div>
    </div>
  </section>

  <!-- КАРТОЧКА ИЗ V3, СВЕДЁННАЯ В ОДНУ МУЛЬТИЯЗЫЧНУЮ. Владелец назвал её содержимое сам:
       имя · автоним языка · строка о Пространстве · три шага. Одна карточка, внутри две речи. -->
  <section class="pitch">
    <div class="half">
      <h2 class="h">{T.name.ru}</h2>
      <a class="auto" href="/ru">Русский</a>
      <p class="t">{T.lede.ru}</p>
      <ol class="steps">
        {#each T.steps.ru as шаг, i (i)}<li><b>{i + 1}.</b> {шаг}</li>{/each}
      </ol>
    </div>
    <div class="half en">
      <h2 class="h">{T.name.en}</h2>
      <a class="auto" href="/en">English</a>
      <p class="t">{T.lede.en}</p>
      <ol class="steps">
        {#each T.steps.en as step, i (i)}<li><b>{i + 1}.</b> {step}</li>{/each}
      </ol>
    </div>
  </section>

  <!-- ПОЛОСА ЖИВОГО КАТАЛОГА — настоящие объекты прямыми ссылками на свои карточки, ПО ДВЕ
       ссылки на объект: дверь язык за человека не выбирает, и обе языковые версии карточки
       достижимы от корня одним кликом. Отбор — первый объект хаба, правило `catalog-hub`. -->
  <section class="cat">
    <h2 class="cat-h">{T.catHead.ru}<span class="en">{T.catHead.en}</span></h2>
    <p class="cat-l">{T.catLede.ru}<span class="en">{T.catLede.en}</span></p>
    <ul class="cat-list">
      {#each data.strip as карточка (карточка.slug)}
        <li>
          <a class="ct" href={карточка.hrefRu}>{карточка.titleRu}</a>
          <a class="ce" href={карточка.hrefEn}>{карточка.titleEn}</a>
          <span class="cm">{карточка.kindRu} · {карточка.kindEn}{карточка.year ? ` · ${карточка.year}` : ''}</span>
        </li>
      {/each}
    </ul>
    <p class="cat-all">
      <a href={catalogPath('ru')}>{T.catAll.ru}</a><span class="en"><a href={catalogPath('en')}>{T.catAll.en}</a></span>
    </p>
  </section>

  <!-- БОЛЬШАЯ КНОПКА — дорога в дело ДО аккаунта. Адрес `/profile?guest=1` уже существует и
       уже проверен: третьего входа не заводим. Каждая строка своя и не переносится — владелец
       велел уместить русский текст ровно в две строки. -->
  <a class="cta" href="/profile?guest=1">
    <span class="r">{#each T.ctaRu as строка, i (i)}<span class="ln">{строка}</span>{/each}</span>
    <span class="e">{#each T.ctaEn as line, i (i)}<span class="ln">{line}</span>{/each}</span>
  </a>
  <p class="quiet"><a href="/profile">{T.quiet.ru}<span class="en">{T.quiet.en}</span></a></p>
</main>

<style>
  /* Двуязычная пара — ВСЕГДА две строки, английская под русской и приглушённо.
     Слово владельца 2026-09-05: «такие строки мультиязычные принудительно разноси на две
     строки». Один класс на всю страницу, чтобы правило нельзя было забыть в новом месте. */
  .en { display: block; color: var(--muted); font-weight: inherit; }

  .field { position: fixed; inset: 0; pointer-events: none; opacity: 0.8; z-index: 0; }
  .field svg { width: 100%; height: 100%; display: block; }
  .field .links line { stroke: var(--edge, #d8d4cc); stroke-width: 1; opacity: 0.55; }
  .field .nodes circle { fill: var(--primary, #1467d6); opacity: 0.25; }

  .door {
    position: relative; z-index: 1;
    max-width: 1080px; margin: 0 auto;
    padding: 20px 18px calc(40px + env(safe-area-inset-bottom));
    text-align: center;
  }

  .langbar {
    display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
    padding-bottom: 14px; border-bottom: 1px solid var(--edge, #e6e2da);
    text-align: left;
  }
  .lb { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; font-weight: 700; color: var(--muted); }
  .lb .en { margin-top: 2px; }
  .autos { display: flex; gap: 12px; }
  .autos a { color: var(--primary); font-weight: 700; text-decoration: none; font-size: 14px; }
  .theme {
    margin-left: auto; display: inline-flex; align-items: center; justify-content: center;
    width: 34px; height: 34px; border-radius: 9px; cursor: pointer;
    border: 1px solid var(--edge, #e6e2da); background: transparent; color: inherit;
  }
  /* Оба значка лежат в разметке всегда; лишний прячут СТИЛИ по `data-theme` — обработчика
     Svelte здесь нет и быть не может (`csr = false`), это приём `PublicBar`. */
  .i-moon { display: none; }
  :global(html[data-theme='dark']) .i-sun { display: none; }
  :global(html[data-theme='dark']) .i-moon { display: inline-flex; }

  .mark { display: inline-block; margin-top: 24px; }
  .word { font-size: 34px; font-weight: 800; letter-spacing: -0.02em; margin: 10px 0 0; }

  .showcase {
    margin-top: 22px; padding: 22px 18px 18px; text-align: center;
    background: var(--panel, #fff); border: 1px solid var(--edge, #e6e2da);
    border-radius: 18px;
  }
  .sl { font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; font-weight: 700; color: var(--muted); margin-bottom: 16px; }
  .sl .en { margin-top: 3px; }
  .facts { display: grid; grid-template-columns: repeat(2, 1fr); gap: 18px 10px; }
  .fact .n { font-size: 30px; font-weight: 800; letter-spacing: -0.02em; }
  .fact .l { font-size: 12.5px; color: var(--muted); margin-top: 3px; line-height: 1.35; }
  .fact .l .en { font-size: 12px; }

  /* Одна карточка, внутри две речи: на широком экране рядом, на телефоне друг под другом. */
  .pitch {
    display: flex; gap: 26px; text-align: left;
    margin-top: 18px; padding: 20px;
    background: var(--panel, #fff); border: 1px solid var(--edge, #e6e2da);
    border-radius: 18px;
  }
  .pitch .half { flex: 1; }
  .pitch .half.en { color: var(--muted); }
  .pitch .h { font-size: 20px; font-weight: 800; margin: 0; }
  .pitch .auto { display: inline-block; margin-top: 5px; font-size: 13px; color: var(--primary); font-weight: 700; text-decoration: none; }
  .pitch .t { margin: 12px 0 0; font-size: 15px; line-height: 1.6; }
  .pitch .steps { margin: 12px 0 0; padding: 0; list-style: none; font-size: 13.5px; line-height: 1.6; }
  .pitch .steps li { margin-bottom: 6px; }
  .pitch .steps b { color: var(--heading, inherit); }

  .cat { margin-top: 22px; padding-top: 20px; border-top: 1px solid var(--edge, #e6e2da); }
  .cat-h { font-size: 17px; font-weight: 800; margin: 0; }
  .cat-h .en { font-size: 14px; margin-top: 3px; }
  .cat-l { margin: 8px 0 0; font-size: 13.5px; color: var(--muted); }
  .cat-list { list-style: none; margin: 14px 0 0; padding: 0; display: grid; grid-template-columns: 1fr; gap: 10px; text-align: left; }
  .cat-list li { padding: 11px 13px; border: 1px solid var(--edge, #e6e2da); border-radius: 12px; background: var(--panel, #fff); }
  .ct { display: block; color: var(--primary); font-weight: 700; text-decoration: none; font-size: 14.5px; }
  .ce { display: block; color: var(--muted); text-decoration: none; font-size: 13px; margin-top: 1px; }
  .cm { display: block; font-size: 11.5px; color: var(--muted); margin-top: 4px; }
  .cat-all { margin: 14px 0 0; font-size: 14px; font-weight: 600; }
  .cat-all a { color: var(--primary); text-decoration: none; }
  .cat-all .en { font-size: 13px; margin-top: 3px; }

  .cta {
    display: block; margin-top: 22px; padding: 15px 18px;
    background: var(--primary, #1467d6); color: #fff;
    border-radius: 14px; text-decoration: none; text-align: center;
  }
  .cta .r { display: block; font-size: 15px; font-weight: 800; letter-spacing: -0.01em; }
  .cta .e { display: block; font-size: 12px; font-weight: 600; opacity: 0.82; margin-top: 3px; }
  /* РОВНО ДВЕ СТРОКИ на любой ширине — его слово. Каждая строка своя и не переносится. */
  .cta .ln { display: block; white-space: nowrap; }

  .quiet { margin-top: 13px; font-size: 14px; }
  .quiet a { color: var(--primary); text-decoration: none; font-weight: 600; }
  .quiet .en { font-size: 13px; margin-top: 3px; }

  @media (min-width: 760px) {
    .door { padding: 26px 24px 56px; }
    .word { font-size: 44px; }
    .facts { grid-template-columns: repeat(4, 1fr); }
    .fact .n { font-size: 36px; }
    .cat-list { grid-template-columns: repeat(3, 1fr); }
    .cta .r { font-size: 18px; }
    .cta .e { font-size: 13.5px; }
  }

  @media (max-width: 759px) {
    /* На телефоне две речи идут друг под другом, английская — за разделителем. */
    .pitch { flex-direction: column; gap: 20px; }
    .pitch .half.en { border-top: 1px solid var(--edge, #e6e2da); padding-top: 18px; }
  }
</style>
