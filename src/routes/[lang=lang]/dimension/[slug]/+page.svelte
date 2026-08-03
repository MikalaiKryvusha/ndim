<!--
  ПУБЛИЧНАЯ СТРАНИЦА ИЗМЕРЕНИЯ — макет **V2 «Досье»**, утверждён владельцем
  (интервью №023, В1 = Г; макеты — `design/dimension-page-mockups.html`).

  Форма: сверху карточка объекта (оценка, вид, год, автор, оригинальное название, теги),
  описание под ней, дверь в продукт в конце. Модель Кинопоиска: данные считываются мгновенно.
  ⚠️ Названная цена выбора, которую приняли осознанно: карточка отодвигает описание вниз, а
  описание и есть то единственное, ради чего эти страницы существуют для поиска.

  🔴 Чего здесь НЕТ и что нельзя «дочинить»:
    · блока соседства измерений — отклонён владельцем 2026-08-03 И по людям, И по тегам
      (`plans/37`, `researches/32`, `STATUS.md` → «Чего НЕ делать»);
    · изображений произведения — авторское право (интервью №020);
    · любых данных человека — на публичной странице людей нет (интервью №022).

  Правило показа оценок решено в `$lib/content/dims-rating.ts` — ОДНО на приложение и на эту
  страницу, потому что владелец сказал «одно правило внутри и снаружи» (интервью №022).
-->
<script lang="ts">
  import type { DimView } from '$lib/content/dim-view';
  import { LANGS, LANG_LABEL } from '$lib/content/langs';
  // Русская морфология — общая на проект (`bugs/15`-класс: своя копия склонения разъезжается).
  import { unitRu } from '$lib/ui/format';

  let { data }: { data: DimView } = $props();

  /**
   * Тексты обвязки. 🔴 Английский переведён АГЕНТОМ и ждёт вычитки владельца — прямое условие,
   * на котором он выбрал «оба языка сразу» (интервью №023, В2 = А): «обвязку я перевожу, и она
   * ждёт Вашей вычитки уже в бою». Правит их ВЛАДЕЛЕЦ, агент бренд не сочиняет.
   *
   * ⚠️ Термины на витрине голыми не бросаются (правка владельца 2026-08-02): не «5111
   * измерений», а «объектов человеческой культуры». Обращение — на «Вы».
   */
  const T = {
    ru: {
      kind: 'Вид',
      year: 'Год',
      author: 'Автор',
      original: 'В оригинале',
      tags: 'Теги',
      noVotes: 'Ещё без голосов',
      /**
       * 🏷 ФИРМЕННЫЙ ТЕРМИН (слово владельца 2026-08-03): «NDim Space Rating — наш фирменный
       * бренд-рейтинг». Не переводится ни на один язык: это ИМЯ, а не описание.
       */
      ratingBrand: 'NDim Space Rating',
      /**
       * «Оценено N людьми» — форма выбрана владельцем дословно. Она ещё и удобнее любой другой:
       * страдательный залог снимает согласование глагола («оценил 1 человек» против «оценили
       * 2 человека»), и остаётся склонять одно слово.
       */
      voted: (n: number) => `оценено ${n} ${unitRu(n, ['человеком', 'людьми', 'людьми'])}`,
      doorTitle: 'Это одна из координат, по которым люди описывают себя',
      doorText: (t: string) =>
        `В Пространстве NDim человек — это точка, а такие объекты — оси вокруг неё. ` +
        `Оцените «${t}» и ещё несколько вещей, которые Вы любите, — и увидите людей, ` +
        `у которых они отзываются так же.`,
      /**
       * Формулировка владельца дословно (2026-08-03). Он сам поправил себя с «Оцени» на
       * «Оцените» — обращение на «Вы» держится и в призыве к действию, а не только в прозе.
       *
       * 🔑 Чем она лучше прежней («Оценить и посмотреть, кто рядом»): называет НЕ действие, а
       * ЦЕЛЬ действия — найти людей, которые думают так же. «Кто рядом» описывало механику
       * (близость в пространстве), и человеку из поиска не говорило ничего.
       */
      doorGo: 'Оцените, чтобы найти людей, кто думает, как Вы',
      foot:
        'NDim Space — честный поиск похожих людей по математической близости. ' +
        'Бесплатно, без рекламы и без подписок.',
      otherLang: 'Читать по-английски',
    },
    en: {
      kind: 'Kind',
      year: 'Year',
      author: 'Author',
      original: 'Original title',
      tags: 'Tags',
      noVotes: 'No ratings yet',
      /** Имя бренда — одно на все языки (см. русскую половину). */
      ratingBrand: 'NDim Space Rating',
      voted: (n: number) => `rated by ${n} ${n === 1 ? 'person' : 'people'}`,
      doorTitle: 'This is one of the coordinates people describe themselves by',
      doorText: (t: string) =>
        `In NDim Space a person is a point, and objects like this are the axes around them. ` +
        `Rate “${t}” and a few more things you love — and you will see the people ` +
        `they resonate with in the same way.`,
      /** Зеркало русской формулировки владельца: цель действия, а не само действие. */
      doorGo: 'Rate it to find people who think like you',
      foot:
        'NDim Space — an honest search for similar people by mathematical proximity. ' +
        'Free, no ads, no subscriptions.',
      otherLang: 'Читать по-русски',
    },
  } as const;

  const t = $derived(T[data.lang]);
  const other = $derived(LANGS.find((l) => l !== data.lang) ?? data.lang);

  /** Звёзды рисуются от округлённой средней; шкала 0…10 — жест оценки из 1.x. */
  const filled = $derived(Math.round(data.rating));
  const average = $derived(data.rating.toFixed(1).replace('.', data.lang === 'ru' ? ',' : '.'));
</script>

<svelte:head>
  <title>{data.title} — NDim Space</title>
  <meta name="description" content={data.meta} />
  <link rel="canonical" href={data.canonical} />
  <!--
    Двусторонний `hreflang` с самоссылкой. У Google односторонняя разметка не «работает хуже» —
    она игнорируется ЦЕЛИКОМ («If two pages don't both point to each other, the tags will be
    ignored»), то есть выглядит как сделанная работа и не даёт ничего (`researches/26` §4.1).
  -->
  {#each data.alternates as alt (alt.hreflang)}
    <link rel="alternate" hreflang={alt.hreflang} href={alt.href} />
  {/each}
  <!-- Открытый граф — только то, что обзор признал живым; JSON-LD сюда не ставится
       (`researches/26` §7: три из четырёх типов Google официально похоронил). -->
  <meta property="og:type" content="article" />
  <meta property="og:title" content={data.title} />
  <meta property="og:description" content={data.meta} />
  <meta property="og:url" content={data.canonical} />
  <meta property="og:locale" content={data.lang === 'en' ? 'en_US' : 'ru_RU'} />
</svelte:head>

<!--
  ШАПКА ПУБЛИЧНОЙ СТРАНИЦЫ — знак, имя и одна дверь.

  🔴 РЕЛЬСА НАВИГАЦИИ ЗДЕСЬ СОЗНАТЕЛЬНО НЕТ, и это решение агента, а не недоделка. Публичные
  документы «Меню» носят полную оболочку приложения (`DocShell`), но их открывают ИЗНУТРИ, уже
  войдя. Эту страницу открывает незнакомец из поиска: все пять пунктов рельса ведут его за стену
  входа, то есть в пять тупиков вместо одной ясной двери.
  ⚠️ Решение дешёвое к откату (`AGENT_GUIDE` → «дёшево откатить — решай сам»): если владелец
  захочет рельс, он добавляется как в `DocShell`, одной строкой импорта.
-->
<header class="bar">
  <a class="brand" href="/">
    <span class="mark" aria-hidden="true"></span>
    <span>NDim Space</span>
  </a>
  <!--
    ПЕРЕКЛЮЧАТЕЛЬ ЯЗЫКА — ССЫЛКОЙ, а не кнопкой (`bugs/114`, решение владельца 2026-08-03:
    «вот эти кнопки убрать, появится переключатель в хедере»).

    🔴 Почему именно ССЫЛКА и почему сюда НЕ зовётся модуль языка. На публичных адресах источник
    истины — АДРЕС (правило `$lib/ui/lang.svelte.ts`). Кнопка на состоянии оставила бы человека
    на прежнем адресе с чужим содержанием; ссылка ведёт РОВНО туда, что уже объявлено в
    `hreflang` выше, — робот и человек начинают видеть одно и то же. Плюс она работает без единой
    строки скрипта, а страница каталога сознательно нулевая по JS.

    Подпись — самоназвание языка из общего списка (`LANG_LABEL`), тот же словарь, что в
    выпадашке приложения: два разных названия одного языка сбивали бы с толку.
  -->
  <a class="langsw" href="/{other}/dimension/{data.slug}" hreflang={other}>{LANG_LABEL[other]}</a>
  <a class="enter" href="/">{data.lang === 'en' ? 'Log in' : 'Войти'}</a>
</header>

<article class="dim">
  <header>
    <h1>{data.title}</h1>
    {#if data.original}<p class="orig">{data.original}</p>{/if}
  </header>

  <!-- ── КАРТОЧКА-ДОСЬЕ — сердце макета V2 ─────────────────────────────────── -->
  <section class="dossier">
    <p class="rate">
      {#if data.showStars}
        <!-- 🏷 Оценка названа СВОИМ ИМЕНЕМ — «NDim Space Rating» (слово владельца 2026-08-03:
             «наш фирменный бренд-рейтинг»). Без имени звёзды читаются как чей-то безымянный
             агрегат; с именем это ВЕЛИЧИНА ПРОДУКТА, и её можно узнать в другом месте сети. -->
        <span class="brandname">{t.ratingBrand}</span>
        <span class="stars" aria-hidden="true">
          {#each Array(10) as _, i (i)}<i class:on={i < filled}>★</i>{/each}
        </span>
        <span class="val">{average}</span>
        {#if data.showRaterCount}<span class="votes">{t.voted(data.rates)}</span>{/if}
      {:else}
        <!-- Ноль в поле оценки означает «не оценивали», а НЕ «оценили на ноль». Показать его
             звёздами было бы неправдой на двух третях страниц каталога — ради этого правило
             и существует (интервью №022, В1 = А). -->
        <span class="novotes">{t.noVotes}</span>
      {/if}
    </p>

    <dl>
      {#if data.kind}<dt>{t.kind}</dt><dd>{data.kind}</dd>{/if}
      {#if data.year}<dt>{t.year}</dt><dd>{data.year}</dd>{/if}
      {#if data.author}<dt>{t.author}</dt><dd>{data.author}</dd>{/if}
      {#if data.original}<dt>{t.original}</dt><dd>{data.original}</dd>{/if}
      {#if data.tags.length}
        <dt>{t.tags}</dt>
        <dd class="tags">{#each data.tags as tag (tag)}<span>{tag}</span>{/each}</dd>
      {/if}
    </dl>
  </section>

  <div class="desc">{data.description}</div>

  <!-- Дверь в продукт. Терминов голыми не бросаем: не «измерения», а «объекты». -->
  <section class="door">
    <h2>{t.doorTitle}</h2>
    <p>{t.doorText(data.title)}</p>
    <a class="go" href="/">{t.doorGo}</a>
  </section>

  <!-- Ссылка «Читать по-…» отсюда УБРАНА (`bugs/114`, слово владельца): переключатель языка
       переехал в шапку, и двух дверей в одно место быть не должно. -->
  <p class="foot">{t.foot}</p>
</article>

<style>
  /* Токены продукта — те же, что у всего сайта; обе темы работают без единой строки здесь. */
  .bar {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    min-height: 52px;
    padding: 0 1rem;
    background: var(--panel);
    border-bottom: 1px solid var(--edge);
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 700;
    color: var(--heading);
    text-decoration: none;
  }
  .mark {
    width: 24px;
    height: 24px;
    border-radius: 7px;
    /* Знак бренда — N-сеть; здесь его цветовая заливка, полноценный логотип живёт в шапке
       приложения. Форма знака канонична (лого 1.x) и цветом не заменяется. */
    background: linear-gradient(135deg, #1467d6, #3fd9ff);
    flex: none;
  }
  /* Переключатель языка (`bugs/114`). Вторичен по отношению к «Войти»: это смена вида страницы,
     а не действие с продуктом — поэтому контурная, а не залитая. `margin-left: auto` живёт
     ЗДЕСЬ, у первого элемента правой группы, иначе он оттолкнул бы только кнопку входа. */
  .langsw {
    margin-left: auto;
    padding: 0.4rem 0.7rem;
    border-radius: 999px;
    border: 1px solid var(--edge);
    color: var(--dim);
    font-weight: 600;
    font-size: 0.85rem;
    text-decoration: none;
  }
  .enter {
    padding: 0.4rem 0.9rem;
    border-radius: 999px;
    background: var(--primary);
    color: var(--primary-ink);
    font-weight: 600;
    font-size: 0.85rem;
    text-decoration: none;
  }

  .dim {
    max-width: 42rem;
    margin: 0 auto;
    padding: 1.5rem 1rem 3.5rem;
    color: var(--text);
  }

  h1 {
    margin: 0;
    font-size: clamp(1.5rem, 4.5vw, 2rem);
    line-height: 1.18;
    color: var(--heading);
  }
  .orig {
    margin: 0.35rem 0 0;
    font-size: 0.95rem;
    color: var(--faint);
  }

  .dossier {
    margin: 1.1rem 0 1.4rem;
    padding: 0.9rem 1rem;
    background: var(--panel);
    border: 1px solid var(--edge);
    border-radius: 14px;
    box-shadow: var(--card-shadow);
  }

  .rate {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    flex-wrap: wrap;
    /* Высоту строки держит min-height, а не звёзды: без него карточки без голосов «прыгают»
       относительно оценённых (урок `bugs/15`). */
    min-height: 26px;
    margin: 0 0 0.75rem;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid var(--edge);
  }
  .stars {
    display: flex;
    gap: 1px;
    font-size: 0.95rem;
  }
  .stars i {
    font-style: normal;
    color: var(--edge);
  }
  .stars i.on {
    color: var(--star);
  }
  .val {
    font-weight: 700;
    color: var(--heading);
  }
  .votes,
  .novotes {
    font-size: 0.85rem;
    color: var(--dim);
  }
  .novotes {
    font-style: italic;
  }

  dl {
    display: grid;
    grid-template-columns: minmax(5.5rem, auto) 1fr;
    gap: 0.4rem 0.9rem;
    margin: 0;
    font-size: 0.92rem;
  }
  dt {
    color: var(--faint);
  }
  dd {
    margin: 0;
    color: var(--text);
  }
  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }
  .tags span {
    padding: 0.1rem 0.5rem;
    border: 1px solid var(--edge);
    border-radius: 999px;
    font-size: 0.78rem;
    color: var(--dim);
  }

  .desc {
    margin: 1.2rem 0;
    line-height: 1.68;
    font-size: 1rem;
  }

  .door {
    margin-top: 1.6rem;
    padding: 1rem;
    background: var(--panel);
    border: 1px solid var(--edge);
    border-radius: 14px;
    box-shadow: var(--card-shadow);
  }
  .door h2 {
    margin: 0 0 0.4rem;
    font-size: 1rem;
    color: var(--heading);
  }
  .door p {
    margin: 0;
    font-size: 0.92rem;
    line-height: 1.6;
  }
  .go {
    display: inline-block;
    margin-top: 0.8rem;
    padding: 0.55rem 1.1rem;
    border-radius: 999px;
    background: var(--primary);
    color: var(--primary-ink);
    font-weight: 600;
    font-size: 0.92rem;
    text-decoration: none;
  }

  .foot {
    margin-top: 1.4rem;
    font-size: 0.8rem;
    line-height: 1.6;
    color: var(--faint);
  }
  /* Стиль `.lang` убран вместе со ссылкой «Читать по-…»: переключатель переехал в шапку
     (`bugs/114`). Осиротевший селектор svelte-check ловит предупреждением — не глушить его,
     а убирать причину. */
</style>
