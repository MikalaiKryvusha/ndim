<script lang="ts">
  // «О системе» — текст из живого 1.x (design/reference-1x/app-12-о-проекте.png), дословно
  // (исправлена одна опечатка оригинала: «с Любовь» → «с Любовью»). EN — перевод агента.
  //
  // Под текстом — версии (приложение вшито в сборку, сервер сообщает о себе сам) и история
  // версий проекта, снятая дословно из 1.x (researches/06 → src/lib/content/docs.ts).
  import { onMount } from 'svelte';
  import DocBlocks from '$lib/ui/DocBlocks.svelte';
  import DocShell from '$lib/ui/DocShell.svelte';
  import Versions from '$lib/ui/Versions.svelte';
  import { DOCS, type DocBlock } from '$lib/content/docs';
  import { currentSession } from '$lib/data/profile';
  import { loadSyncServer } from '$lib/data/space';
  import type { SyncServerDoc } from '$lib/model/stats';

  let server = $state<SyncServerDoc | null>(null);

  onMount(async () => {
    // Версия сервера синхронизации лежит в `space/server`, а правила отдают этот документ
    // только вошедшим (включая гостя). Раньше здесь стояла проверка на localhost — из-за
    // неё в БОЮ версию сервера не видел никто и никогда. Теперь спрашиваем ровно тогда,
    // когда имеем право спросить; не дотянулись — виджет честно скажет «неизвестно».
    try {
      if ((await currentSession()) === null) return;
      server = await loadSyncServer();
    } catch {
      server = null;
    }
  });

  const title = { ru: 'О системе', en: 'About the system' } as const;

  /**
   * История версий — ВЛОЖЕННЫМИ раскрывашками, как в 1.x (bugs/30, кадр
   * design/reference-1x/app-17): внешняя «История версий», внутри каждая версия — своя.
   * Тексты не трогаем (docs.ts генерируется из researches/06) — группируем готовые блоки:
   * заголовок версии (h3) + всё до следующего заголовка.
   */
  const versionGroups = (() => {
    // Заголовочный вариант DocBlock (h2/h3/p — один вариант союза с полем text).
    type TextBlock = Extract<DocBlock, { text: unknown }>;
    const groups: { heading: TextBlock; body: DocBlock[] }[] = [];
    for (const block of DOCS.history.blocks) {
      if (block.type === 'h2') continue; // внешний заголовок даёт <summary> ниже
      if (block.type === 'h3') groups.push({ heading: block, body: [] });
      else groups.at(-1)?.body.push(block);
    }
    return groups;
  })();

  const t = {
    body: {
      ru: 'Проект «Пространство NDim» (англ. «NDim Space») создан 05.05.2025 в г. Минск, Беларусь. Сделано для всего Человечества с Любовью ❤️ с использованием большого количества кваса в процессе разработки.',
      en: 'The «NDim Space» project (rus. «Пространство NDim») was created on 05.05.2025 in Minsk, Belarus. Made for all of Humanity with Love ❤️ and with a great deal of kvass consumed along the way.',
    },
    versions: { ru: 'Версии', en: 'Versions' },
    history: { ru: 'История версий', en: 'Version history' },
  } as const;
</script>

<DocShell {title}>
  {#snippet children(lang)}
    <p>{t.body[lang]}</p>

    <!-- Тот же виджет-ОБЪЕКТ, что в «Меню» (bugs/66 + слово владельца 2026-07-27:
         «переиспользовать виджет как объект») — карточка и заголовок «Версии» живут
         внутри него; в 1.x подвал версий рисовался одним кодом в оба контейнера. -->
    <Versions {server} {lang} />

    <details class="history">
      <summary>{t.history[lang]}</summary>
      <!-- Каждая версия — своя раскрывашка (канон 1.x, bugs/30); свежая открыта сразу -->
      {#each versionGroups as group, index (index)}
        <details class="ver" open={index === 0}>
          <summary>{group.heading.text[lang]}</summary>
          <DocBlocks blocks={group.body} {lang} />
        </details>
      {/each}
    </details>
  {/snippet}
</DocShell>

<style>
  /* «История версий» — карточка по канону продукта (bugs/35, кадр app-17: в 1.x это
     выразительный контейнер, а не голый список). Рецепт карточки — как у виджетов
     «Связей»/«Пространства»: --panel + --edge + radius 14 + --card-shadow. */
  .history {
    margin-top: 22px; padding: 8px 14px;
    background: var(--panel); border: 1px solid var(--edge); border-radius: 14px;
    box-shadow: var(--card-shadow);
  }
  .history summary {
    cursor: pointer; font-size: 15px; font-weight: 700; color: var(--heading); padding: 8px 0;
  }
  .history[open] { padding-bottom: 12px; }
  /* Каждая версия — своя серая плашка-раскрывашка, как в 1.x (bugs/30 — вложенность,
     bugs/35 — видимый контейнер: белое-на-белом карточкой не читалось). */
  .ver {
    margin: 10px 0; border: 1px solid var(--edge); border-radius: 12px;
    padding: 4px 14px; background: var(--edge-soft);
  }
  .ver summary { cursor: pointer; font-size: 13.5px; font-weight: 700; color: var(--heading); padding: 8px 0; }
  .ver[open] { padding-bottom: 10px; }

  /* ── Анимация раскрытия (bugs/56, слово владельца: «„История версий“ открывается резко,
     без анимации — некрасиво») ──
     Раскрывашкой управляет БРАУЗЕР: он показывает и прячет содержимое `<details>` сам,
     и переход Svelte внутри просто не успевает сыграть. Поэтому здесь встроенный способ
     платформы, а не самодельная машинерия на состоянии: `::details-content` + разрешение
     интерполировать `auto` (`interpolate-size`). Разметка остаётся честными вложенными
     `<details>` — как в 1.x (bugs/30) и как её проверяют оснастки batch3/batch4.
     `@supports` — чтобы старый браузер просто не анимировал, а не сломался. */
  @supports (interpolate-size: allow-keywords) and selector(::details-content) {
    .history,
    .ver {
      interpolate-size: allow-keywords;
    }
    .history::details-content,
    .ver::details-content {
      block-size: 0;
      overflow: clip;
      opacity: 0;
      transition:
        block-size var(--motion-base) var(--motion-ease),
        opacity var(--motion-base) var(--motion-ease),
        content-visibility var(--motion-base) allow-discrete;
    }
    .history[open]::details-content,
    .ver[open]::details-content {
      block-size: auto;
      opacity: 1;
    }
  }

  /* Стрелка `<summary>` поворачивается вместе с раскрытием — движение начинается там,
     куда человек нажал, а не только внутри карточки. */
  .history summary,
  .ver summary {
    list-style: none;
    display: flex; align-items: center; gap: 8px;
  }
  .history summary::-webkit-details-marker,
  .ver summary::-webkit-details-marker { display: none; }
  .history summary::before,
  .ver summary::before {
    content: '';
    flex: none;
    width: 0; height: 0;
    border-left: 5px solid currentColor;
    border-top: 4px solid transparent;
    border-bottom: 4px solid transparent;
    color: var(--faint);
    transition: transform var(--motion-base) var(--motion-ease);
  }
  .history[open] > summary::before,
  .ver[open] > summary::before { transform: rotate(90deg); }
</style>
