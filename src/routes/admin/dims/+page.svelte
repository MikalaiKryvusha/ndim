<script lang="ts">
  /*
   * КОМНАТА «ИЗМЕРЕНИЯ» — инструмент панели администратора (`plans/44`, фаза 4 эпика `ideas/29`).
   *
   * ЗАЧЕМ ОНА СУЩЕСТВУЕТ, словами владельца (2026-08-17): «*нужно как можно скорее делать админ
   * панель и менеджер измерений… чтобы мы новые хайповые объекты культуры быстро заливали в
   * пространство. Сегодня весь мир на хайпе от одисеи нолана — а мы такой кусок поисков пропускаем
   * мимо нас*». До этой комнаты завести измерение в 2.0 было НЕЛЬЗЯ ВОВСЕ: админского экрана нет,
   * а в 1.x форма была. То есть это возврат утраченного, а не новая фича.
   *
   * МАКЕТ УТВЕРЖДЁН — V1 «Стопка» (`plans/32`, выбор владельца 2026-08-02): каталог и создание
   * живут соседними вкладками, всё видно прокруткой, ничего не прячется. Новых макетов фаза не
   * рисует — это прямо сказано в `plans/44`.
   * ⛔ Вкладки «Очередь» в макете есть, а здесь её НЕТ: очередь кандидатов — фаза 6 эпика, и
   * показать её пустой значило бы обещать механизм, которого не существует.
   *
   * 🔴 ТРИ СОСТОЯНИЯ ПРАВ, как в доме панели (`plans/33`): `unknown` ждёт, `not-admin` уводится
   * на главную, и только `admin` видит комнату. Наивный редирект по отсутствию ответа выбросил бы
   * самого владельца, пока восстанавливается сессия.
   *
   * 🔴 ПРЕРЕНДЕР ПУСТ ПО ДАННЫМ. Глобальный `prerender = true` публикует оболочку статическим
   * HTML на публичном хосте — это принятая цена решения В1 = Б. Поэтому до вердикта о правах
   * рисуется только кольцо ожидания, а каталог не читается вовсе (стережёт `verify-admin-home`,
   * п.4: «в пререндеренном HTML раздела нет данных»).
   *
   * 🗑 УДАЛЕНИЕ ЕСТЬ, и его текст принадлежит владельцу: интервью №038, В1 = **B** (2026-08-17).
   * Шаг 4 плана помечал эту формулировку `STOP-ASK` («текст с последствиями»), поэтому агент её не
   * выдумывал — владелец выбрал вариант, прочитав все четыре и цену каждого. Подробности и разбор
   * моего снятого возражения — у `openDeleteConfirm` ниже.
   */
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import AppBar from '$lib/ui/AppBar.svelte';
  import BottomNav from '$lib/ui/BottomNav.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Loading from '$lib/ui/Loading.svelte';
  import SideRail from '$lib/ui/SideRail.svelte';
  import { adminVerdict, type AdminState } from '$lib/data/admin';
  import {
    approveCandidate,
    candidateToDraft,
    createDim,
    loadAdminCatalog,
    loadCandidateQueue,
    loadDimForEdit,
    rejectCandidate,
    rememberEdited,
    removeDim,
    updateDim,
    type AdminCatalog,
    type AdminDim,
    type AdminDimRow,
    type DimCandidate,
  } from '$lib/data/admin-dims';
  import { unitRu } from '$lib/ui/format';
  import {
    EMPTY_DRAFT,
    docToDraft,
    validateDraft,
    type DimDraft,
    type DraftProblem,
  } from '$lib/model/dim-editor';
  import { normalizeForSearch } from '$lib/model/feed';
  import { lang as currentLang } from '$lib/ui/lang.svelte';

  const lang = $derived(currentLang());

  let rights = $state<AdminState>('unknown');
  let catalog = $state<AdminCatalog | null>(null);
  let loadFailed = $state(false);

  /** Какая вкладка открыта. Форма правки — та же вкладка «Создать», с предзаполнением. */
  let tab = $state<'catalog' | 'form' | 'queue'>('catalog');
  let search = $state('');

  /*
   * ── ОЧЕРЕДЬ КАНДИДАТОВ (фаза 6 эпика `ideas/29`) ─────────────────────────────────────────
   *
   * Заказ владельца 2026-08-17: «*чтобы ИИ агент мог новые кандидаты измерений создавать Николаю
   * под вычитку, и чтобы николай быстрее их одобрял, и чтобы мы новые хайповые объекты культуры
   * быстро заливали в пространство*».
   *
   * 🔴 Кандидаты живут в СВОЕЙ коллекции `dim_candidates`, не в каталоге: лёжа в `dims/`, они
   * попали бы в индекс и на публичную страницу до всякого одобрения. Инвариант В3 = А держится
   * правилами, а не этим экраном.
   * 🔑 Одобрение рождает измерение ТЕМ ЖЕ путём, что ручная форма (`createDim`) — второго пути
   * записи в каталог не существует.
   */
  let queue = $state<readonly DimCandidate[] | null>(null);
  /** По какому кандидату идёт работа: чтобы кнопки гасли только у него, а не у всей очереди. */
  let judging = $state<string | null>(null);

  let draft = $state<DimDraft>({ ...EMPTY_DRAFT });
  /** Что правим. `null` — заводим новое. */
  let editing = $state<AdminDim | null>(null);
  let problems = $state<readonly DraftProblem[]>([]);
  let saving = $state(false);
  /** Итог последнего сохранения — человеку нужен ответ, а не тишина. */
  let saved = $state<{ ok: boolean; text: string } | null>(null);

  onMount(async () => {
    const verdict = await adminVerdict({ insist: true });
    if (verdict !== 'admin') {
      rights = 'not-admin';
      await goto('/', { replaceState: true });
      return;
    }
    rights = 'admin';
    await refresh();
  });

  async function refresh(): Promise<void> {
    try {
      catalog = await loadAdminCatalog();
      loadFailed = false;
    } catch {
      // Честный отказ вместо пустого списка: «каталог пуст» и «каталог не прочитался» — разные
      // вещи, и молча показать первое вместо второго значит соврать (правило трёх дверей).
      loadFailed = true;
    }
    // Очередь читается отдельным запросом по статусу и своим отказом каталог не роняет.
    try {
      queue = await loadCandidateQueue();
    } catch {
      queue = null;
    }
  }

  /** Одобрить кандидата как есть: рождается измерение, кандидат уходит из очереди. */
  async function approve(candidate: DimCandidate): Promise<void> {
    judging = candidate.id;
    saved = null;
    try {
      await approveCandidate(candidate, candidateToDraft(candidate));
      saved = {
        ok: true,
        text: `«${candidate.title.ru}» одобрено и заведено в каталог. В индексе появится после `
          + 'ближайшего цикла синхронизации, на публичной странице — после следующей сборки сайта.',
      };
      await refresh();
    } catch (error) {
      saved = {
        ok: false,
        text: `Не одобрено: ${error instanceof Error ? error.message : 'отказ базы'}`,
      };
    } finally {
      judging = null;
    }
  }

  /** Отклонить: кандидат уходит из очереди, в каталог не пишется НИЧЕГО. */
  async function reject(candidate: DimCandidate): Promise<void> {
    judging = candidate.id;
    saved = null;
    try {
      await rejectCandidate(candidate);
      saved = { ok: true, text: `«${candidate.title.ru}» отклонено. В каталог не записано ничего.` };
      await refresh();
    } catch (error) {
      saved = {
        ok: false,
        text: `Не отклонено: ${error instanceof Error ? error.message : 'отказ базы'}`,
      };
    } finally {
      judging = null;
    }
  }

  /**
   * Правка перед одобрением: кандидат уезжает в ту же форму, что и ручное создание.
   * ⚠️ После правки нажимается «Создать измерение» — то есть измерение рождается тем же путём,
   * а кандидат остаётся в очереди до отдельного решения. Это честнее, чем гадать за владельца,
   * считать ли правку одобрением.
   */
  function editBeforeApprove(candidate: DimCandidate): void {
    editing = null;
    draft = candidateToDraft(candidate);
    problems = [];
    saved = {
      ok: true,
      text: `Кандидат «${candidate.title.ru}» открыт на правку. Нажмите «Создать измерение», `
        + 'когда текст Вас устроит; сам кандидат останется в очереди.',
    };
    tab = 'form';
  }

  /**
   * Отбор по названию — по УЖЕ прочитанному списку, без единого запроса к базе.
   * Нормализация берётся из `model/feed.ts` — той же, что у поиска в продукте: вторая копия
   * правил нормализации разъехалась бы с первой на первом же дефисе.
   */
  const visible = $derived.by((): readonly AdminDimRow[] => {
    const rows = catalog?.rows ?? [];
    const needle = normalizeForSearch(search);
    if (needle === '') return rows;
    return rows.filter(
      (row) =>
        normalizeForSearch(row.ru).includes(needle) || normalizeForSearch(row.en).includes(needle),
    );
  });

  function startCreate(): void {
    editing = null;
    draft = { ...EMPTY_DRAFT };
    problems = [];
    saved = null;
    tab = 'form';
  }

  async function startEdit(id: string): Promise<void> {
    saved = null;
    problems = [];
    tab = 'form';
    // Точечное чтение — ровно один документ, и только когда карточку открыли на правку.
    const dim = await loadDimForEdit(id);
    if (dim === null) {
      saved = { ok: false, text: 'Измерение не прочиталось — обновите страницу.' };
      return;
    }
    editing = dim;
    draft = docToDraft(dim);
  }

  async function save(): Promise<void> {
    problems = validateDraft(draft);
    if (problems.length > 0) return;

    saving = true;
    saved = null;
    try {
      if (editing === null) {
        await createDim(draft);
        saved = {
          ok: true,
          // Честно называем и то, чего человек НЕ увидит сразу: страницы каталога статические,
          // они вмораживаются в HTML на сборке. Это норма по построению, а не дефект.
          text: 'Измерение заведено. В индексе каталога оно появится после ближайшего цикла '
            + 'синхронизации, на публичной странице — после следующей сборки сайта.',
        };
        draft = { ...EMPTY_DRAFT };
      } else {
        await updateDim(editing, draft);
        rememberEdited(editing, draft);
        saved = { ok: true, text: 'Правка записана. Оценки людей не тронуты.' };
      }
      await refresh();
    } catch (error) {
      saved = {
        ok: false,
        text: `Не записано: ${error instanceof Error ? error.message : 'отказ базы'}`,
      };
    } finally {
      saving = false;
    }
  }

  /*
   * ── УДАЛЕНИЕ ─────────────────────────────────────────────────────────────────────────────
   *
   * 🔴 ТЕКСТ ПОДТВЕРЖДЕНИЯ — РЕШЕНИЕ ВЛАДЕЛЬЦА (интервью №038, В1 = **B**, 2026-08-17).
   * Он выбрал короткое предупреждение без механики, прочитав все четыре варианта и названную
   * цену каждого. Дословно его вариант:
   *
   *   «Удалить измерение «Название»?»
   *   «Оценки N человек по этому измерению перестанут работать. Действие необратимо.»
   *   [Удалить измерение] · [Отменить]
   *
   * ⛔ Переписывать нельзя: это текст с последствиями, и он принадлежит ему.
   * 🔑 Я возражал против слова «необратимо» и БЫЛ НЕПРАВ: повторное создание записи с тем же
   * названием получает НОВЫЙ идентификатор, поэтому прежние оценки к нему уже не привяжутся —
   * отменить удаление действительно нечем. Возражение снято, слово его точнее моего.
   */
  let confirmingDelete = $state(false);
  let deleting = $state(false);
  /** Узел подтверждения — нужен, чтобы ПОКАЗАТЬ его человеку, а не только вставить в разметку. */
  let confirmNode = $state<HTMLElement | null>(null);

  /**
   * 🔴 ПОДТВЕРЖДЕНИЕ ОБЯЗАНО ПОПАСТЬ В ЭКРАН, а не просто появиться в разметке.
   *
   * Поймано КАДРОМ стража, а не проверкой: форма из десяти полей длиннее экрана, подтверждение
   * встаёт под кнопками — и на 900 точках высоты оно оказывалось ЗА нижней кромкой. Регулярки по
   * тексту при этом были зелёными: они судили DOM, а человек не видел ответа на своё нажатие и
   * решил бы, что кнопка не работает.
   *
   * Это ровно тот класс, о котором канон говорит: «у ВИДИМОГО дефекта приёмка ПИКСЕЛЬНАЯ, а не
   * габаритная» — и почему контрольный кадр обязателен (`EXP-0082`).
   */
  function openDeleteConfirm(): void {
    confirmingDelete = true;
    requestAnimationFrame(() => confirmNode?.scrollIntoView({ block: 'center' }));
  }

  /**
   * Первая фраза варианта B названа числом людей. У измерения без оценок она была бы неправдой
   * («оценки 0 человек перестанут работать» — ничего не перестанет), поэтому при нуле остаётся
   * только вторая фраза владельца. Это не второй текст, а пропуск утверждения, которое ложно.
   */
  const deleteWarning = $derived.by((): string => {
    const rates = editing?.rates ?? 0;
    const irreversible = 'Действие необратимо.';
    if (rates === 0) return irreversible;
    return `Оценки ${rates} ${unitRu(rates, ['человека', 'человек', 'человек'])} по этому измерению перестанут работать. ${irreversible}`;
  });

  async function confirmDelete(): Promise<void> {
    if (editing === null) return;
    deleting = true;
    saved = null;
    try {
      await removeDim(editing.id);
      confirmingDelete = false;
      editing = null;
      draft = { ...EMPTY_DRAFT };
      // Отбор снимается: иначе человек возвращается в каталог, где по старому запросу
      // «ничего не нашлось» — и это читается как «каталог опустел». Поймано на кадре стража.
      search = '';
      await refresh();
      tab = 'catalog';
    } catch (error) {
      saved = {
        ok: false,
        text: `Не удалено: ${error instanceof Error ? error.message : 'отказ базы'}`,
      };
    } finally {
      deleting = false;
    }
  }

  /** Подпись поля и подсказка. Тексты комнаты русские: админское лицо видит только владелец. */
  const t = {
    title: 'Панель администратора',
    room: 'Менеджер измерений',
    admin: 'админ',
    tabCatalog: 'Каталог',
    tabForm: 'Создать',
    search: 'Поиск по названию',
    nothing: 'Ничего не нашлось',
    failed: 'Каталог не прочитался. Обновите страницу.',
    awaiting: 'ждут попадания в индекс каталога',
    editing: 'Правка измерения',
    creating: 'Создать вручную',
    create: 'Создать измерение',
    update: 'Записать правку',
    cancel: 'Отменить правку',
  } as const;
</script>

<svelte:head>
  <title>NDim Space — {t.room}</title>
  <!-- Раздел не индексируется (В1 = Б) — как и дом панели, и личные экраны. -->
  <meta name="robots" content="noindex" />
</svelte:head>

{#if rights === 'admin'}
  <div class="screen">
    <SideRail active="menu" {lang} />
    <AppBar />

    <main class="body">
      <h1 class="screen-title">
        <a class="up" href="/admin">{t.title}</a>
        <span class="sep">·</span>
        {t.room}
        <span class="badge"><Icon name="edit" size={13} />{t.admin}</span>
      </h1>

      <!-- Вкладки V1: очередь, каталог и создание — соседние, ничего не спрятано. -->
      <div class="tabs">
        <!--
          Очередь стоит ПЕРВОЙ, когда в ней есть что судить: это то, ради чего владелец просил
          комнату («чтобы николай быстрее их одобрял»). Пустую очередь вперёд не выносим.
        -->
        <button class:on={tab === 'queue'} onclick={() => (tab = 'queue')}>
          Очередь
          {#if queue !== null && queue.length > 0}<span class="count">{queue.length}</span>{/if}
        </button>
        <button class:on={tab === 'catalog'} onclick={() => (tab = 'catalog')}>
          {t.tabCatalog}
          {#if catalog !== null}<span class="count">{catalog.rows.length}</span>{/if}
        </button>
        <button class:on={tab === 'form'} onclick={startCreate}>{t.tabForm}</button>
      </div>

      {#if tab === 'queue'}
        <section class="card">
          <div class="h">
            <span>Кандидаты на вычитку</span>
            {#if queue !== null}<span class="pill">{queue.length}</span>{/if}
          </div>

          {#if saved !== null}
            <p class="result" class:bad={!saved.ok}>{saved.text}</p>
          {/if}

          {#if queue === null}
            <Loading {lang} />
          {:else if queue.length === 0}
            <p class="warn">
              Очередь пуста. Агент положит сюда новых кандидатов — каждый с источником и числом
              языковых разделов Википедии, по которому видно известность объекта.
            </p>
          {:else}
            <ul class="queue">
              {#each queue as c (c.id)}
                <!--
                  🔴 КАРТОЧКА ОБЯЗАНА ПОКАЗЫВАТЬ, ЧТО ПРОВЕРИТЬ (требование метаплана и названный
                  отраслью главный риск таких очередей): источник с разрешимым идентификатором,
                  число известности, оба языка описания. Иначе пачка правдоподобных карточек
                  превращает вычитку в штамп «Одобрить».
                -->
                <li class="cand">
                  <div class="cand-head">
                    <span class="cand-kind">{c.type?.ru ?? 'Измерение'}</span>
                    <span class="cand-name">{c.title.ru}</span>
                    {#if c.year}<span class="ry">{c.year}</span>{/if}
                  </div>
                  <div class="cand-en">{c.title.en}</div>

                  {#if c.author?.ru}<div class="cand-line"><b>Автор:</b> {c.author.ru}</div>{/if}
                  <div class="cand-line"><b>Описание (ru):</b> {c.description.ru}</div>
                  <div class="cand-line"><b>Description (en):</b> {c.description.en}</div>
                  {#if c.tags && c.tags.length > 0}
                    <div class="cand-line"><b>Теги:</b> {c.tags.join(', ')}</div>
                  {/if}

                  <div class="cand-src">
                    {#if c.source}
                      <a href={`https://www.wikidata.org/wiki/${c.source.id}`} target="_blank" rel="noreferrer">
                        {c.source.registry} · {c.source.id}
                      </a>
                      <span class="pill">{c.source.sitelinks} языковых разделов Википедии</span>
                    {:else}
                      <span class="pill">источник не назван</span>
                    {/if}
                  </div>

                  {#if c.agentNote}
                    <div class="cand-note"><b>Замечание агента:</b> {c.agentNote}</div>
                  {/if}

                  <div class="acts">
                    <button class="ok" onclick={() => approve(c)} disabled={judging !== null}>
                      Одобрить
                    </button>
                    <button onclick={() => editBeforeApprove(c)} disabled={judging !== null}>
                      Правка перед одобрением
                    </button>
                    <button class="danger" onclick={() => reject(c)} disabled={judging !== null}>
                      Отклонить
                    </button>
                  </div>
                </li>
              {/each}
            </ul>
          {/if}
        </section>
      {/if}

      {#if tab === 'catalog'}
        <!-- Каталог -->
        <section class="card">
          {#if loadFailed}
            <p class="warn">{t.failed}</p>
          {:else if catalog === null}
            <Loading {lang} />
          {:else}
            <div class="h">
              {t.tabCatalog} · {catalog.rows.length} измерений
              {#if catalog.awaitingIndex > 0}
                <span class="pill">{catalog.awaitingIndex} {t.awaiting}</span>
              {/if}
            </div>

            <input class="field search" type="search" bind:value={search} placeholder={t.search} />

            {#if visible.length === 0}
              <p class="warn">{t.nothing}</p>
            {:else}
              <ul class="rows">
                <!--
                  Список — только то, что есть в индексе: название и год. Ни одного лишнего
                  чтения: полная карточка читается ТОЧЕЧНО, когда её открыли на правку.
                  Названия не обрезаются (закон владельца 2026-08-14) — строка растёт по высоте.
                -->
                {#each visible.slice(0, 200) as row (row.id)}
                  <li class="row">
                    <button class="rowbtn" onclick={() => startEdit(row.id)}>
                      <span class="rn">{row.ru || row.en}</span>
                      {#if row.en && row.ru}<span class="ren">{row.en}</span>{/if}
                      {#if row.year}<span class="ry">{row.year}</span>{/if}
                      {#if row.awaitingIndex}<span class="pill">не в индексе</span>{/if}
                    </button>
                  </li>
                {/each}
              </ul>
              {#if visible.length > 200}
                <p class="warn">Показаны первые 200 из {visible.length} — уточните поиск.</p>
              {/if}
            {/if}
          {/if}
        </section>
      {:else}
        <section class="card">
          <div class="h">{editing === null ? t.creating : t.editing}</div>

          {#if editing !== null}
            <p class="warn">
              Правится «{editing.title?.ru ?? editing.title?.en}».
              Оценки людей ({editing.rates}) правка не тронет.
            </p>
          {/if}

          <div class="form">
            <!--
              ДЕСЯТЬ ПОЛЕЙ ФОРМЫ 1.x — состав назван метапланом (`plans/30`, фаза 4) и снят с
              живого экрана 1.x (`researches/11` §3). Год — ОТДЕЛЬНОЕ поле, а не внутри
              названия: грязь данных 1.x, которую `researches/29` §2.5 велит не воспроизводить.
            -->
            <div class="two">
              <label>Название (ru) <input class="field" class:bad={problems.some((p) => p.field === 'titleRu')} bind:value={draft.titleRu} /></label>
              <label>Title (en) <input class="field" class:bad={problems.some((p) => p.field === 'titleEn')} bind:value={draft.titleEn} /></label>
            </div>
            <div class="two">
              <label>Тип (ru) <input class="field" bind:value={draft.typeRu} /></label>
              <label>Type (en) <input class="field" bind:value={draft.typeEn} /></label>
            </div>
            <div class="two">
              <label>Автор (ru) <input class="field" bind:value={draft.authorRu} /></label>
              <label>Author (en) <input class="field" bind:value={draft.authorEn} /></label>
            </div>
            <!-- Год строкой: у восьми боевых записей это диапазон («1966–1969»). Замер 2026-08-17. -->
            <label>Год <input class="field year" bind:value={draft.year} placeholder="2026 или 1966–1969" /></label>
            <label>Описание (ru) <textarea class="field" rows="4" bind:value={draft.descriptionRu}></textarea></label>
            <label>Description (en) <textarea class="field" rows="4" bind:value={draft.descriptionEn}></textarea></label>
            <!--
              Разделитель тегов — ЗАПЯТАЯ, и это замер, а не вкус: из 43 011 боевых тегов запятую
              не содержит НИ ОДИН, а точку с запятой — два. Подпись макета «через ;» испортила бы
              именно эти два тега.
            -->
            <label>Теги (через запятую) <input class="field" bind:value={draft.tags} /></label>

            {#if problems.length > 0}
              <ul class="problems">
                {#each problems as problem (problem.field)}
                  <li>{problem.message}</li>
                {/each}
              </ul>
            {/if}

            {#if saved !== null}
              <p class="result" class:bad={!saved.ok}>{saved.text}</p>
            {/if}

            <div class="acts">
              <button class="ok" onclick={save} disabled={saving}>
                <Icon name="edit" size={14} />
                {editing === null ? t.create : t.update}
              </button>
              {#if editing !== null}
                <button onclick={startCreate}>{t.cancel}</button>
                <!--
                  Удаление стоит ОТДЕЛЬНО от кнопок записи и не носит вида основного действия:
                  оно снимает труд людей, а не правит текст. Первый тап только открывает
                  подтверждение — одиночного нажатия не хватает.
                -->
                {#if !confirmingDelete}
                  <button class="danger" onclick={openDeleteConfirm}>
                    <Icon name="trash" size={14} />
                    Удалить измерение
                  </button>
                {/if}
              {/if}
            </div>

            {#if editing !== null && confirmingDelete}
              <!--
                ТЕКСТ ВЛАДЕЛЬЦА, вариант B интервью №038. Не переписывать.
                Подтверждение живёт в самой карточке, а не в браузерном `confirm`: системный
                диалог не слушает тему продукта и не проверяем стражем.
              -->
              <div class="confirm" bind:this={confirmNode}>
                <p class="confirm-head">
                  Удалить измерение «{editing.title?.ru ?? editing.title?.en}»?
                </p>
                <p class="confirm-body">{deleteWarning}</p>
                <div class="acts">
                  <button class="danger" onclick={confirmDelete} disabled={deleting}>
                    Удалить измерение
                  </button>
                  <button onclick={() => (confirmingDelete = false)} disabled={deleting}>
                    Отменить
                  </button>
                </div>
              </div>
            {/if}
          </div>
        </section>
      {/if}
    </main>

    <BottomNav active="menu" {lang} />
  </div>
{:else}
  <!-- `unknown`: ни комнаты, ни редиректа, пока прав не знаем. Это и уходит в пререндер. -->
  <div class="hold">
    <Loading {lang} />
  </div>
{/if}

<style>
  /* Оболочка — та же сетка, что у дома панели и экранов продукта. */
  .screen {
    min-height: 100dvh;
    display: grid;
    grid-template-rows: auto 1fr;
    grid-template-columns: 1fr;
  }
  @media (min-width: 1024px) {
    .screen {
      grid-template-columns: auto 1fr;
    }
  }
  .body {
    padding: 18px 16px 90px;
    max-width: 1200px;
    width: 100%;
    margin: 0 auto;
  }
  @media (min-width: 1024px) {
    .body {
      padding: 24px 28px 40px;
    }
  }
  .screen-title {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    font-size: 22px;
    margin: 0 0 14px;
  }
  .up {
    color: var(--dim);
    text-decoration: none;
    font-size: 16px;
  }
  .up:hover {
    color: var(--primary);
  }
  .sep {
    color: var(--faint);
  }
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 12px;
    font-weight: 600;
    color: var(--primary);
    border: 1px solid var(--primary);
    border-radius: 999px;
    padding: 2px 9px;
    text-transform: lowercase;
  }

  .tabs {
    display: flex;
    gap: 8px;
    margin: 0 0 12px;
  }
  .tabs button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font: inherit;
    font-size: 14px;
    font-weight: 600;
    color: var(--dim);
    background: var(--panel);
    border: 1px solid var(--edge);
    border-radius: 999px;
    padding: 7px 14px;
    cursor: pointer;
  }
  .tabs button.on {
    color: #fff;
    background: var(--primary);
    border-color: var(--primary);
  }
  .count {
    font-size: 12px;
    opacity: 0.85;
  }

  .card {
    display: grid;
    gap: 10px;
    padding: 14px;
    background: var(--panel);
    border: 1px solid var(--edge);
    border-radius: 14px;
    box-shadow: var(--card-shadow);
  }
  .h {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    font-size: 15px;
    font-weight: 600;
    color: var(--heading);
  }
  .pill {
    font-size: 11px;
    font-weight: 600;
    color: var(--faint);
    border: 1px solid var(--edge);
    border-radius: 999px;
    padding: 1px 8px;
  }
  .warn {
    margin: 0;
    font-size: 13px;
    line-height: 1.5;
    color: var(--dim);
  }

  .field {
    font: inherit;
    font-size: 14px;
    width: 100%;
    box-sizing: border-box;
    color: var(--text);
    background: var(--bg);
    border: 1px solid var(--edge);
    border-radius: 10px;
    padding: 8px 10px;
  }
  .field.bad {
    border-color: #d50000;
  }
  .search {
    margin: 2px 0 4px;
  }
  .year {
    max-width: 240px;
  }

  .rows {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 6px;
  }
  /* Строка каталога: название НЕ обрезается — растёт по высоте (закон владельца 2026-08-14). */
  .row {
    display: block;
  }
  .rowbtn {
    display: flex;
    align-items: flex-start;
    flex-wrap: wrap;
    gap: 8px;
    width: 100%;
    text-align: left;
    font: inherit;
    font-size: 14px;
    color: var(--text);
    background: transparent;
    border: 1px solid transparent;
    border-radius: 10px;
    padding: 8px 10px;
    cursor: pointer;
  }
  .rowbtn:hover {
    border-color: var(--edge);
    background: var(--bg);
  }
  .rn {
    font-weight: 600;
    color: var(--heading);
  }
  .ren {
    color: var(--dim);
  }
  .ry {
    color: var(--faint);
  }

  .form {
    display: grid;
    gap: 10px;
  }
  .form label {
    display: grid;
    gap: 4px;
    font-size: 12px;
    font-weight: 600;
    color: var(--dim);
  }
  .two {
    display: grid;
    gap: 10px;
  }
  @media (min-width: 720px) {
    .two {
      grid-template-columns: 1fr 1fr;
    }
  }
  .problems {
    margin: 0;
    padding-left: 18px;
    font-size: 13px;
    color: #d50000;
  }
  .result {
    margin: 0;
    font-size: 13px;
    line-height: 1.5;
    color: var(--heading);
  }
  .result.bad {
    color: #d50000;
  }
  .acts {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .acts button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font: inherit;
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
    background: var(--panel);
    border: 1px solid var(--edge);
    border-radius: 10px;
    padding: 9px 14px;
    cursor: pointer;
  }
  .acts button.ok {
    color: #fff;
    background: var(--primary);
    border-color: var(--primary);
  }
  .acts button:disabled {
    opacity: 0.6;
    cursor: default;
  }
  /* Удаление окрашено кромкой, а не заливкой: это не основное действие экрана. */
  .acts button.danger {
    color: #d50000;
    border-color: #d50000;
    background: var(--panel);
  }
  .confirm {
    display: grid;
    gap: 8px;
    padding: 12px 14px;
    border: 1px solid #d50000;
    border-radius: 12px;
    background: var(--bg);
  }
  .confirm-head {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    color: var(--heading);
  }
  .confirm-body {
    margin: 0;
    font-size: 13px;
    line-height: 1.5;
    color: var(--text);
  }

  /* ── Очередь кандидатов ─────────────────────────────────────────────────── */
  .queue {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 12px;
  }
  /* Карточка кандидата — та же форма, что у карточек продукта; названия не обрезаются. */
  .cand {
    display: grid;
    gap: 5px;
    padding: 12px 14px;
    background: var(--bg);
    border: 1px solid var(--edge);
    border-radius: 12px;
  }
  .cand-head {
    display: flex;
    align-items: flex-start;
    flex-wrap: wrap;
    gap: 8px;
  }
  .cand-kind {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--primary);
    align-self: center;
  }
  .cand-name {
    font-size: 16px;
    font-weight: 600;
    color: var(--heading);
  }
  .cand-en {
    font-size: 14px;
    color: var(--dim);
  }
  .cand-line {
    font-size: 13px;
    line-height: 1.5;
    color: var(--text);
  }
  .cand-line b,
  .cand-note b {
    color: var(--dim);
    font-weight: 600;
  }
  .cand-src {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 2px;
    font-size: 12px;
  }
  .cand-src a {
    color: var(--primary);
  }
  .cand-note {
    font-size: 13px;
    line-height: 1.5;
    color: var(--text);
    padding: 7px 10px;
    border-left: 3px solid var(--primary);
    background: var(--panel);
    border-radius: 0 8px 8px 0;
  }

  .hold {
    min-height: 100dvh;
    display: grid;
    place-items: center;
    padding: 24px;
  }
</style>
