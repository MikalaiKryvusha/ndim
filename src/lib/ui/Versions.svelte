<script lang="ts">
  // Виджет «Версии» — ОДИН на два места, где версии живут по канону (bugs/66).
  //
  // В 1.x подвал версий рисовался одним куском кода сразу в два контейнера —
  // `version_container_menu` и `version_container_about` (ndim_old/…/app.js:5164-5165),
  // то есть в «Меню» и в «О системе». На экране «Пространство» версий не было вовсе:
  // тот экран про метрики Пространства, а не про номера сборок. Слово владельца
  // (волна 12): «со страницы Пространство убрать виджет Версии, перенести его в Settings».
  //
  // Что показываем — тоже слово владельца: «номера версий, номера сборок и по серверу и по
  // веб приложению, даты с временем сборок и по мобилке и по серверу». Ни одного нового
  // числа заводить не пришлось: вся проводка сделана в ideas/15, экрану не хватало одной
  // строки — даты сборки СЕРВЕРА.
  //
  // Чего компонент НЕ делает: не выдумывает. Сервер недоступен (человек не вошёл, или
  // сервер ещё ни разу не отчитался) — плашка честно говорит «неизвестно», а не рисует
  // прочерк вместо номера, который мы якобы знаем.
  import type { SyncServerDoc } from '$lib/model/stats';
  import { dateTime, versionLabel, type Lang } from '$lib/ui/format';

  let { server, lang }: { server: SyncServerDoc | null; lang: Lang } = $props();

  // Вшиты в бандл на сборке (vite define): соврать о них невозможно.
  const APP_VERSION = __APP_VERSION__;
  const APP_BUILD = __APP_BUILD__;
  const APP_BUILT_AT = __APP_BUILT_AT__;

  const t = {
    app: { ru: 'Приложение', en: 'Application' },
    syncServer: { ru: 'Сервер синхронизации', en: 'Sync server' },
    // Род разный: «Приложение собрано», но «Сервер собран». Проект уже считает русскую
    // морфологию частью качества (src/lib/ui/format.ts) — здесь она стоит двух строк.
    builtNeuter: { ru: 'Собрано', en: 'Built' },
    builtMasc: { ru: 'Собран', en: 'Built' },
    unknown: { ru: 'неизвестно', en: 'unknown' },
  } as const;
</script>

<div class="vers">
  <div class="ver">
    <span class="k">{t.app[lang]}</span>
    <b>{versionLabel(APP_VERSION, APP_BUILD)}</b>
    <span class="t">{t.builtNeuter[lang]} {dateTime(Date.parse(APP_BUILT_AT), lang)}</span>
  </div>

  <div class="ver">
    <span class="k">{t.syncServer[lang]}</span>
    <b>{server ? versionLabel(server.version, server.build) : t.unknown[lang]}</b>
    {#if server?.builtAt}
      <span class="t">{t.builtMasc[lang]} {dateTime(Date.parse(server.builtAt), lang)}</span>
    {/if}
  </div>
</div>

<style>
  /* Плашки — те же, что были у виджета на «Пространстве» (макет space V1, утверждён
     2026-07-12): виджет ПЕРЕЕХАЛ, а не был придуман заново. */
  .vers { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px; }
  .ver { padding: 10px 12px; border-radius: 10px; background: var(--edge-soft); border: 1px solid var(--edge); }
  .ver .k { display: block; font-size: 11.5px; color: var(--dim); }
  .ver b { display: block; margin-top: 3px; font-family: var(--mono); font-size: 15px; color: var(--heading); }
  .ver .t { display: block; margin-top: 2px; font-family: var(--mono); font-size: 11px; color: var(--faint); }
</style>
