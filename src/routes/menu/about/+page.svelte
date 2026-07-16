<script lang="ts">
  // «О системе» — текст из живого 1.x (design/reference-1x/app-12-о-проекте.png), дословно
  // (исправлена одна опечатка оригинала: «с Любовь» → «с Любовью»). EN — перевод агента.
  //
  // Под текстом — версии (приложение вшито в сборку, сервер сообщает о себе сам) и история
  // версий проекта, снятая дословно из 1.x (researches/06 → src/lib/content/docs.ts).
  import { onMount } from 'svelte';
  import DocBlocks from '$lib/ui/DocBlocks.svelte';
  import DocShell from '$lib/ui/DocShell.svelte';
  import { DOCS, type DocBlock } from '$lib/content/docs';
  import { loadSyncServer } from '$lib/data/space';
  import type { SyncServerDoc } from '$lib/model/stats';
  import { dateOnly } from '$lib/ui/format';

  const APP_VERSION = __APP_VERSION__;
  const APP_BUILT_AT = __APP_BUILT_AT__;

  let server = $state<SyncServerDoc | null>(null);

  onMount(async () => {
    // Версия сервера синхронизации известна только там, где до него можно дотянуться.
    // Не дотянулись — просто не показываем строку, а не выдумываем номер.
    if (!['localhost', '127.0.0.1'].includes(location.hostname)) return;
    try {
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
      ru: 'Проект «Пространство NDim» (англ. «NDim Space») создан 05.05.2025 в г. Минск, Беларусь. Сделано для всего Человечества с Любовью ❤ с использованием большого количества кваса в процессе разработки.',
      en: 'The «NDim Space» project (rus. «Пространство NDim») was created on 05.05.2025 in Minsk, Belarus. Made for all of Humanity with Love ❤ and with a great deal of kvass consumed along the way.',
    },
    versions: { ru: 'Версии', en: 'Versions' },
    app: { ru: 'Приложение', en: 'Application' },
    syncServer: { ru: 'Сервер синхронизации', en: 'Sync server' },
    build: { ru: 'билд', en: 'build' },
    builtAt: { ru: 'Собран', en: 'Built' },
    history: { ru: 'История версий', en: 'Version history' },
  } as const;
</script>

<DocShell {title}>
  {#snippet children(lang)}
    <p>{t.body[lang]}</p>

    <h2>{t.versions[lang]}</h2>
    <dl class="vers">
      <dt>{t.app[lang]}</dt>
      <dd>{APP_VERSION}</dd>
      {#if server}
        <dt>{t.syncServer[lang]}</dt>
        <dd>{server.version} · {t.build[lang]} {server.build}</dd>
      {/if}
      <dt>{t.builtAt[lang]}</dt>
      <dd>{dateOnly(Date.parse(APP_BUILT_AT), lang)}</dd>
    </dl>

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
  h2 {
    font-size: 16px; font-weight: 700; color: var(--heading);
    margin: 24px 0 8px; padding-top: 12px; border-top: 1px solid var(--edge-soft);
  }
  .vers { display: grid; grid-template-columns: auto 1fr; gap: 4px 14px; font-size: 13.5px; }
  .vers dt { color: var(--dim); }
  .vers dd { font-family: var(--mono); color: var(--heading); font-weight: 600; }

  .history { margin-top: 22px; border-top: 1px solid var(--edge-soft); padding-top: 12px; }
  .history summary {
    cursor: pointer; font-size: 15px; font-weight: 700; color: var(--heading); padding: 6px 0;
  }
  /* Вложенная раскрывашка версии (канон 1.x): компактная плашка, список внутри. */
  .ver {
    margin: 8px 0; border: 1px solid var(--edge-soft); border-radius: 10px;
    padding: 4px 12px; background: var(--panel);
  }
  .ver summary { cursor: pointer; font-size: 13.5px; font-weight: 700; color: var(--heading); padding: 6px 0; }
  .ver[open] { padding-bottom: 8px; }
</style>
