<!--
  ПУБЛИЧНАЯ СТРАНИЦА ИЗМЕРЕНИЯ — макет **V2 «Досье»**, утверждён владельцем
  (интервью №023, В1 = Г; макеты — `design/dimension-page-mockups.html`).

  Форма: сверху карточка объекта (оценка, вид, год, автор, оригинальное название, теги),
  описание под ней, дверь в продукт в конце. Модель Кинопоиска: данные считываются мгновенно.
  ⚠️ Названная цена выбора, которую приняли осознанно: карточка отодвигает описание вниз, а
  описание и есть то единственное, ради чего эти страницы существуют для поиска.

  🔄 ПРАВИЛО СОСЕДСТВА ОБНОВЛЕНО 2026-08-14 (интервью №025, В7 = А). Блок «Похожие по каталогу»
  ПО КЛАССИФИКАЦИИ разрешён и построен (`plans/48` шаг 4). Что НЕ изменилось: соседство по
  МАТЕМАТИКЕ ПОХОЖЕСТИ — «до лучших времён» (`plans/37`, `researches/32`), цифр метрик похожести
  и порядка близости не раскрываем нигде, формулировка «Рядом в Пространстве» запрещена.

  🔴 Чего здесь НЕТ и что нельзя «дочинить»:
    · изображений произведения — авторское право (интервью №020);
    · любых данных человека — на публичной странице людей нет (интервью №022).

  Правило показа оценок решено в `$lib/content/dims-rating.ts` — ОДНО на приложение и на эту
  страницу, потому что владелец сказал «одно правило внутри и снаружи» (интервью №022).
-->
<script lang="ts">
  import type { DimView } from '$lib/content/dim-view';
  import { LANGS } from '$lib/content/langs';
  import { CATALOG_COPY } from '$lib/content/catalog-copy';
  // Шапка публичной страницы — одна на все публичные поверхности (`PublicBar.svelte`).
  import PublicBar from '$lib/ui/PublicBar.svelte';
  /*
   * ⚠️ Модуль темы (`theme.svelte.ts`) здесь НЕ импортируется, и это не забывчивость.
   * Страница объявлена `csr = false`: клиентский бандл не исполняется, реактивное состояние
   * мертво по построению. Тему на этой странице переключает инлайн-скрипт `app.html`, а
   * значок — стили по атрибуту `data-theme`. Позовёшь модуль — получишь кнопку, которая
   * выглядит рабочей и не работает (эта ошибка здесь уже была).
   */
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
      /*
       * 🔴 БЫЛО «В оригинале» — и это НЕПРАВДА (`bugs/116`, слово владельца 2026-08-03:
       * «Матрица ТОЧНО не называлась в оригинале русским именем, это нонсенс фрод»).
       *
       * Поле содержит название на ДРУГОМ языке, а не на языке оригинала произведения. Какой
       * язык оригинала у каждого из 5111 объектов, мы не знаем и следить за этим не будем —
       * владелец назвал это прямо. Подпись теперь говорит ровно то, что есть: язык названия.
       * Это честно при любом происхождении объекта и не требует ни одного нового поля.
       */
      otherTitle: 'На английском',
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
      /*
       * 🔴 ЗДЕСЬ СТОЯЛ ЖАРГОН, ЗАПРЕЩЁННЫЙ СЛОВАРЁМ (`bugs/115`): «человек — это точка, а такие
       * объекты — ОСИ вокруг неё». Слово «ось» канон помещает в колонку «никогда не пишем» с
       * пояснением «наружу, к человеку, он выходить не должен НИКОГДА», — а оно уехало на все
       * 10 222 страницы. Теперь это стережёт `tools/verify-product-vocabulary.mjs`.
       *
       * 🔑 И ВТОРАЯ ПОЛОВИНА ДЕФЕКТА была тяжелее первой: текст описывал УСТРОЙСТВО, а не пользу.
       * Человек пришёл из поиска за фильмом, а ему объясняли геометрию.
       *
       * Новый текст даёт ДВА повода остаться, оба — словами владельца (2026-08-03):
       *   · рейтинг сам по себе: «метрика того, насколько сообществу нравится объект культуры…
       *     хочешь найти хороший фильм на вечер — приходи в NDim Space посмотреть рейтинги»;
       *   · люди: «найти людей, кто думает, как Вы».
       * Первый работает ДО всякой регистрации — это и есть повод прийти, которого у каталога
       * не было вовсе.
       *
       * ⛔ Конкурентов не называем (принцип 9 `MASTER_PLAN`, подтверждено владельцем).
       * ⛔ Пошлый и негативный ключ запрещён (`researches/30`): знание о том, что негатив
       *    повышает клик, не является разрешением им пользоваться.
       */
      doorTitle: 'NDim Space ведёт свою систему рейтингов',
      doorText: (t: string) =>
        `NDim Space Rating показывает, насколько объект нравится сообществу, — ` +
        `ищете, что посмотреть или почитать сегодня, загляните к нам. ` +
        `А если оцените «${t}» и ещё несколько вещей, которые Вы любите, ` +
        `Пространство покажет Вам людей, которые думают так же.`,
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
      /** Зеркало русской половины: называем ЯЗЫК названия, а не выдумываем язык оригинала. */
      otherTitle: 'In Russian',
      tags: 'Tags',
      noVotes: 'No ratings yet',
      /** Имя бренда — одно на все языки (см. русскую половину). */
      ratingBrand: 'NDim Space Rating',
      voted: (n: number) => `rated by ${n} ${n === 1 ? 'person' : 'people'}`,
      /** Зеркало русской половины: тот же смысл, тот же порядок, без жаргона и без сравнений. */
      doorTitle: 'NDim Space runs its own rating system',
      doorText: (t: string) =>
        `NDim Space Rating shows how much the community likes something — ` +
        `looking for what to watch or read tonight, come and see. ` +
        `And if you rate “${t}” and a few more things you love, ` +
        `the Space will show you people who think the same way.`,
      /** Зеркало русской формулировки владельца: цель действия, а не само действие. */
      doorGo: 'Rate it to find people who think like you',
      foot:
        'NDim Space — an honest search for similar people by mathematical proximity. ' +
        'Free, no ads, no subscriptions.',
      otherLang: 'Читать по-русски',
    },
  } as const;

  const t = $derived(T[data.lang]);
  // Подпись блока соседей живёт вместе с остальными текстами каталога — одно место на хабы и
  // карточки, иначе «Похожие по каталогу» и заголовок хаба разъедутся при первой же правке.
  const cat = $derived(CATALOG_COPY[data.lang]);
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
  <!--
    СТРУКТУРИРОВАННАЯ РАЗМЕТКА ОБЪЕКТА (`plans/48` шаг 5, 2026-08-14).

    🔴 ЗДЕСЬ СТОЯЛО «JSON-LD сюда не ставится (`researches/26` §7: три из четырёх типов Google
    официально похоронил)» — и это было верно ровно для тех типов, которые §7 РАССМАТРИВАЛ:
    Organization, WebSite, BreadcrumbList, SearchAction, FAQPage, HowTo. Типы объектов культуры
    там не оценивались вовсе; дыру закрыл `researches/34` §5.6 по первоисточнику: Book, Movie,
    Game (VideoGame наследует) валидны, а рейтинги СООБЩЕСТВА об объектах культуры легальны —
    правило self-serving ограничивает только LocalBusiness/Organization (модель IMDb).

    Что именно ставится и какие ловушки обойдены (`inLanguage` не ставим — языка произведения мы
    не знаем, `bugs/116`) — в шапке `dim-jsonld.ts`. Условие показа рейтинга сюда не копируется:
    оно посчитано загрузчиком по общему правилу проекта.
  -->
  {@html `<script type="application/ld+json">${data.jsonLd}</script>`}
  <!-- Открытый граф — только то, что обзор признал живым. -->
  <meta property="og:type" content="article" />
  <meta property="og:title" content={data.title} />
  <meta property="og:description" content={data.meta} />
  <meta property="og:url" content={data.canonical} />
  <meta property="og:locale" content={data.lang === 'en' ? 'en_US' : 'ru_RU'} />
</svelte:head>

<!--
  ШАПКА ПУБЛИЧНОЙ СТРАНИЦЫ — общий компонент `PublicBar` (`plans/48` шаг 3).

  Здесь она жила дословной копией, второй такой копией был хаб «Тесты», а хабы каталога стали бы
  третьей и четвёртой. Правку владельца «кнопки в хедере квадратные» пришлось бы вносить в
  четыре места, а заметить пропущенное — глазами. Всё, что было записано об этой шапке
  (рельса нет сознательно · переключатель языка ссылкой · кнопка темы без клиентского JS ·
  «Войти» ведёт в `/profile`), переехало в шапку компонента дословно.
-->
<PublicBar lang={data.lang} otherLang={other} otherHref="/{other}/dimension/{data.slug}" />

<article class="dim">
  <!-- Ссылка вверх — в хаб своего вида (`plans/48` шаг 4). Она же обратный краулируемый путь:
       до неё карточка имела ровно одну входящую ссылку, языкового двойника. -->
  <p class="up"><a href={data.up.href}>← {data.up.title}</a></p>

  <header>
    <h1>{data.title}</h1>
    {#if data.otherTitle}<p class="orig">{data.otherTitle}</p>{/if}
  </header>

  <!-- ── КАРТОЧКА-ДОСЬЕ — сердце макета V2 ─────────────────────────────────── -->
  <section class="dossier">
    <p class="rate">
      {#if data.showStars}
        <!-- 🏷 Оценка названа СВОИМ ИМЕНЕМ — «NDim Space Rating» (слово владельца 2026-08-03:
             «наш фирменный бренд-рейтинг»). Без имени звёзды читаются как чей-то безымянный
             агрегат; с именем это ВЕЛИЧИНА ПРОДУКТА, и её можно узнать в другом месте сети. -->
        <span class="stars" aria-hidden="true">
          {#each Array(10) as _, i (i)}<i class:on={i < filled}>★</i>{/each}
        </span>
        <span class="val">{average}</span>
        <span class="meta">
          <span class="brandname">{t.ratingBrand}</span>
          {#if data.showRaterCount}<span class="votes">{t.voted(data.rates)}</span>{/if}
        </span>
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
      <!--
        🔴 СТРОКА «НА АНГЛИЙСКОМ / IN RUSSIAN» УБРАНА (слово владельца 2026-08-04: «это убрать!
        мы согласовали, что там будет поле названия в оригинале»).

        Она была временной заплатой поверх `bugs/116`: подпись «В оригинале» врала, и я заменил
        её на честную «язык названия». Но честная подпись не делает строку НУЖНОЙ — второе имя
        объекта и так стоит подзаголовком под заголовком, без подписи и без утверждений.
        Место в досье ждёт НАСТОЯЩЕГО оригинального названия (`ideas/33`, одобрена владельцем):
        его даст Wikidata (`P364`, `P1476`) тем же конвейером, что и остальное обогащение.

        ⚠️ Поле `otherTitle` НЕ удалено из модели: на нём держится подзаголовок под заголовком.
        Удалять его «заодно» нельзя — это разные места с разной судьбой.
      -->
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
    <!-- 🔴 Ведёт В ПРОДУКТ (`/profile`), а не на лендинг. Здесь стояло `href="/"` — тот же
         дефект, что был у «Войти» в шапке: главная кнопка страницы отправляла человека на
         витрину вместо двери, то есть добавляла лишний шаг ровно на пике интереса. Это боль
         `ideas/09`, ради снятия которой строился весь онбординг. -->
    <a class="go" href="/profile">{t.doorGo}</a>
  </section>

  <!--
    ПОХОЖИЕ ПО КАТАЛОГУ — блок разрешён владельцем ЯВНО и с названной границей (интервью №025,
    В7 = А): соседство ПО КЛАССИФИКАЦИИ, без математики похожести.

    🔴 Здесь нет и не может быть: ни одного числа похожести · ни намёка на силу связи (порядок
    нейтральный, по слагу — инвариант владельца покрывает и ПОРЯДОК близости) · ни слова «Рядом
    в Пространстве» (запрещено метапланом: это про людей, а не про каталог).

    ⚠️ Прежний комментарий в шапке этого файла утверждал, что блока соседства нет и не будет.
    Это было верно на 2026-08-03 и перестало быть верным 2026-08-14: владелец разрешил
    соседство по классификации, оставив запрет на соседство по похожести.
  -->
  {#if data.neighbours.length}
    <nav class="similar" aria-label={cat.similar}>
      <h2>{cat.similar}</h2>
      <ul>
        {#each data.neighbours as n (n.slug)}
          <li>
            <a href="/{data.lang}/dimension/{n.slug}">{n.title}</a>{#if n.year}<span class="y">{n.year}</span>{/if}
          </li>
        {/each}
      </ul>
    </nav>
  {/if}

  <!-- Ссылка «Читать по-…» отсюда УБРАНА (`bugs/114`, слово владельца): переключатель языка
       переехал в шапку, и двух дверей в одно место быть не должно. -->
  <p class="foot">{t.foot}</p>
</article>

<style>
  /* Стили шапки переехали в `PublicBar.svelte` вместе с самой шапкой (`plans/48` шаг 3):
     осиротевший селектор svelte-check ловит предупреждением — не глушить его, а убирать причину. */
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

  /*
   * СТРОКА ОЦЕНКИ — макет **V4 «Оценка вперёд»** с правкой владельца (2026-08-04):
   * «делаем V4, только огромную цифру среднего рейтинга переносим вправо от звёзд, а весь
   * блок со звёздами сдвигается в крайнее левое положение в шапке виджета».
   *
   * Порядок слева направо: ЗВЁЗДЫ (у самого края) → огромная средняя → имя рейтинга и счётчик
   * стопкой. Макеты и их сравнение — `design/rating-line-mockups.html`, кадры в
   * `test-results/rating-line-mockups/`.
   */
  .rate {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
    /* Высоту строки держит min-height, а не звёзды: без него карточки без голосов «прыгают»
       относительно оценённых (урок `bugs/15`). */
    min-height: 26px;
    margin: 0 0 0.75rem;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid var(--edge);
  }
  /*
   * ЗВЁЗДЫ КРУПНЫЕ и ПЕРВЫЕ — слово владельца: «главная ценная метрика измерения».
   * ⚠️ Здесь стояли ДВЕ декларации `font-size` подряд (1.6rem и 0.95rem), и вторая молча
   * съедала первую: правка «сделать звёзды крупными» не действовала вовсе. Классика — не
   * дописывай свойство в чужое правило, не дочитав его до конца.
   */
  .stars {
    display: flex;
    gap: 2px;
    font-size: 1.55rem;
    line-height: 1;
  }
  .stars i {
    font-style: normal;
    color: var(--edge);
  }
  .stars i.on {
    color: var(--star);
  }
  /* Огромная средняя — СПРАВА ОТ ЗВЁЗД (правка владельца). Она подтверждает звёзды числом,
     а не спорит с ними за начало строки. */
  .val {
    font-size: 2.3rem;
    font-weight: 800;
    line-height: 1;
    color: var(--heading);
  }
  /* Имя рейтинга и счётчик — стопкой, мелко: подпись к величине, а не сама величина. */
  .meta {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .brandname {
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--dim);
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
  /*
   * ГЛАВНАЯ КНОПКА СТРАНИЦЫ — по центру (слово владельца 2026-08-03: «эта кнопка должна быть
   * отцентрована, она самая главная — завлекает внутрь продукта, „продаёт" ценность гостю»).
   *
   * 🔑 Центрирование сделано `margin-inline: auto` при `width: fit-content`, а НЕ `text-align`
   * у родителя: текст блока обязан остаться выключенным влево (по нему читают), а по центру
   * встаёт только кнопка. `text-align: center` на `.door` растащил бы и заголовок, и абзац.
   */
  .go {
    display: block;
    width: fit-content;
    margin-inline: auto;
    margin-top: 1rem;
    padding: 0.7rem 1.4rem;
    border-radius: 999px;
    background: var(--primary);
    color: var(--primary-ink);
    font-weight: 600;
    font-size: 0.92rem;
    text-decoration: none;
  }

  /* Ссылка вверх — над заголовком, мелко: это навигация, а не часть имени объекта. */
  .up {
    margin: 0 0 0.5rem;
    font-size: 0.8rem;
  }
  .up a {
    color: var(--accent);
    text-decoration: none;
  }

  /* Блок соседей: список ссылок, без карточек и без единого числа. Год — единственная подпись,
     и он тут для узнавания («тот самый, 1999-го»), а не для ранжирования. */
  .similar {
    margin-top: 1.6rem;
    padding-top: 1rem;
    border-top: 1px solid var(--edge);
  }
  .similar h2 {
    margin: 0 0 0.6rem;
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--dim);
  }
  .similar ul {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 0.4rem;
  }
  /* Закон о названиях действует и здесь: имя соседа показывается целиком, строка растёт вниз. */
  .similar a {
    color: var(--accent);
    text-decoration: none;
    overflow-wrap: anywhere;
  }
  .similar .y {
    margin-left: 0.4rem;
    font-size: 0.8rem;
    color: var(--faint);
  }

  .foot {
    margin-top: 1.4rem;
    font-size: 0.8rem;
    line-height: 1.6;
    color: var(--faint);
  }

  @media (min-width: 1024px) {
    .similar ul {
      grid-template-columns: 1fr 1fr;
    }
  }
  /* Стиль `.lang` убран вместе со ссылкой «Читать по-…»: переключатель переехал в шапку
     (`bugs/114`). Осиротевший селектор svelte-check ловит предупреждением — не глушить его,
     а убирать причину. */
</style>
