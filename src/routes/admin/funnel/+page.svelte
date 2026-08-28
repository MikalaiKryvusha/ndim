<script lang="ts">
  /*
   * ВОРОНКА — инструмент панели администратора (`plans/74` фаза 1 Ш4; закрывает `ideas/06`).
   *
   * ЗАЧЕМ ОНА СУЩЕСТВУЕТ, словами владельца (2026-08-28): «*Проект задыхается от нехватки
   * аналитики. Мы слепы и не видим, как ведут себя пользователи. Я вижу в Google Search Console
   * что пошли клики, но новых пользователей НОЛЬ — то есть, где-то сильное трение… И мы слепы
   * к этому!*»
   *
   * Числа воронки писались с 2026-08-01 и до аудита 2026-08-28 их не читал НИКТО: экрана не
   * было, а смотреть из консоли — не наблюдение (`bugs/202`, дефект 3). Двадцать пять дней ряда
   * пролежали в столе, и первое же чтение вскрыло разрыв конверсии, ради которого затеян весь
   * эпик. Этот экран существует, чтобы второго такого раза не было.
   *
   * ФОРМА — ВТОРОЙ ИНСТРУМЕНТ В УЖЕ УТВЕРЖДЁННОМ ДОМЕ ПАНЕЛИ, а не новое UI-решение. Слово
   * владельца (интервью №035): «*я хотел Панель Администратора — общую. И через нее открывается
   * панель, и там внутри разные инструменты администратора*», и в шапке дома прямо записано:
   * «Второй инструмент приезжает В ЭТОТ ЖЕ список». Поэтому четыре макета здесь не рисуются:
   * это следование форме, которую владелец уже утвердил, а не выбор за него.
   *
   * 🔴 ТРИ СОСТОЯНИЯ ПРАВ, как в доме панели и в комнате «Измерения» (`plans/33`): `unknown`
   * ждёт, `not-admin` уводится на главную, и только `admin` видит числа. Наивный редирект по
   * отсутствию ответа выбросил бы самого владельца, пока восстанавливается сессия.
   *
   * 🔴 ПРЕРЕНДЕР ПУСТ ПО ДАННЫМ. Глобальный `prerender = true` публикует оболочку статическим
   * HTML на публичном хосте — принятая цена решения В1 = Б. До вердикта о правах рисуется
   * только кольцо ожидания, а ряд не читается вовсе (стережёт `verify-admin-home`, п.4).
   *
   * 🔑 ЧЕГО ЭТОТ ЭКРАН НЕ ДЕЛАЕТ И ПОЧЕМУ. Он не строит графиков и не считает конверсий в
   * процентах. У нас единицы событий в сутки (`landing_view` ~6/день, `guest_start` ~3/день):
   * на таких числах кривая рисует дребезг, а процент от трёх — это не доля, а иллюзия точности.
   * Владелец получает СЫРЫЕ числа и сумму недели, и это честнее. Правило малых чисел —
   * динамика недель, а не дней — записано в `plans/74` фазой 2.
   */
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import AppBar from '$lib/ui/AppBar.svelte';
  import BottomNav from '$lib/ui/BottomNav.svelte';
  import Icon from '$lib/ui/Icon.svelte';
  import Loading from '$lib/ui/Loading.svelte';
  import SideRail from '$lib/ui/SideRail.svelte';
  import { adminVerdict, type AdminState } from '$lib/data/admin';
  import { FUNNEL_STEPS, readFunnelDays, sumDays, type FunnelDay, type FunnelStep } from '$lib/data/funnel';
  import { lang as currentLang } from '$lib/ui/lang.svelte';

  const lang = $derived(currentLang());

  /** Сколько суток показываем. Две недели: одна — сумма, вторая — с чем её сравнить. */
  const DAYS = 14;
  /** Сумма считается по свежей неделе — первые семь строк ряда. */
  const WEEK = 7;

  let rights = $state<AdminState>('unknown');
  let days = $state<readonly FunnelDay[]>([]);
  /*
   * Отказ чтения и пустой ряд — РАЗНЫЕ вещи, и показать первое как второе значит соврать
   * («каталог пуст» против «каталог не прочитался» — тот же урок в комнате «Измерения»).
   */
  let loadFailed = $state(false);
  let loading = $state(true);

  onMount(async () => {
    const verdict = await adminVerdict({ insist: true });
    if (verdict !== 'admin') {
      rights = 'not-admin';
      await goto('/', { replaceState: true });
      return;
    }
    rights = 'admin';
    try {
      days = await readFunnelDays(DAYS);
    } catch {
      loadFailed = true;
    }
    loading = false;
  });

  const week = $derived(sumDays(days.slice(0, WEEK)));
  const prevWeek = $derived(sumDays(days.slice(WEEK, DAYS)));

  /*
   * Подписи столбцов. Каждая называет ТО, ЧТО ИЗМЕРЕНО, а не то, что хотелось бы измерить, —
   * это прямое требование урока смены 6: «критерий из числа прибора обязан быть сверен с тем,
   * ЧТО прибор меряет».
   *
   * 🔴 Отдельно про `signin_wall_view`. Соблазн подписать его «упёрлись в стену из карточки»
   * велик — ради этого числа шаг и заводился (`bugs/200`). Но экран входа показывается и
   * человеку с истёкшей сессией, и просто зашедшему на `/profile` по закладке, а источник
   * перехода воронка не хранит и хранить не должна (в документе только числа, ничего
   * персонального). Поэтому подпись говорит ровно то, что считает счётчик.
   */
  const t = {
    title: { ru: 'Воронка', en: 'Funnel' },
    admin: { ru: 'админ', en: 'admin' },
    lede: {
      ru: 'Сколько людей прошло каждый шаг пути. Числа считает сам продукт, ничего персонального в них нет.',
      en: 'How many people passed each step. Counted by the product itself; nothing personal is stored.',
    },
    week: { ru: 'Неделя', en: 'This week' },
    prevWeek: { ru: 'Неделей раньше', en: 'Week before' },
    day: { ru: 'Сутки', en: 'Day' },
    empty: {
      ru: 'За эти сутки не записано ни одного шага.',
      en: 'No steps recorded for these days.',
    },
    failed: {
      ru: 'Ряд не прочитался. Это отказ чтения, а не пустая воронка — числа на месте, показать их сейчас нечем.',
      en: 'The series could not be read. This is a read failure, not an empty funnel.',
    },
    steps: {
      landing_view: { ru: 'Открыл лендинг', en: 'Landing opened' },
      demo_touch: { ru: 'Потрогал живой движок', en: 'Touched the live engine' },
      guest_start: { ru: 'Стал гостем', en: 'Became a guest' },
      account_created: { ru: 'Создал аккаунт', en: 'Account created' },
      door_click: { ru: 'Нажал дверь карточки', en: 'Card door clicked' },
      signin_wall_view: { ru: 'Увидел стену входа', en: 'Sign-in wall shown' },
    } satisfies Record<FunnelStep, { ru: string; en: string }>,
    /*
     * ⚠️ Обе сноски НЕ НАЗЫВАЮТ ДАТУ, и это решение. День шва — это день ВЫКАТА, а выкат
     * делает Менеджер после сдачи: дата, вписанная сюда сейчас, была бы догадкой о будущем.
     * Строка, обязанная совпадать с событием, которого ещё не было, — та самая пара, которая
     * разъезжается молча («пункт „ждём X“ обязан нести дешёвую проверку, случилось ли X»).
     * Обе формулировки верны в любой день; точная дата шва живёт в документе дефекта.
     */
    seam: {
      ru: 'Сутки считаются по часам владельца. Ранние дни ряда писались по UTC — у них граница суток на три часа раньше. Задним числом ряд не переписан намеренно.',
      en: 'Days are counted in the owner’s time zone. Early days of the series used UTC — their day boundary is three hours earlier. The series was deliberately not rewritten.',
    },
    probes: {
      ru: 'Наши прогоны в этих числах больше не считаются: приборы метят себя, и продукт их пропускает. Всплески прежних дней, совпавшие с выкатами, — это мы сами.',
      en: 'Our own probes are no longer counted: they mark themselves and the product skips them. Earlier spikes on deploy days were us.',
    },
  } as const;
</script>

<svelte:head>
  <title>NDim Space — {t.title[lang]}</title>
  <!-- Раздел не индексируется (В1 = Б) — как и дом панели, и личные экраны. -->
  <meta name="robots" content="noindex" />
</svelte:head>

{#if rights === 'admin'}
  <div class="screen">
    <SideRail active="menu" {lang} />
    <AppBar />

    <main class="body">
      <h1 class="screen-title">
        {t.title[lang]}
        <span class="badge"><Icon name="edit" size={13} />{t.admin[lang]}</span>
      </h1>
      <p class="lede">{t.lede[lang]}</p>

      {#if loading}
        <div class="hold"><Loading {lang} /></div>
      {:else if loadFailed}
        <p class="failed">{t.failed[lang]}</p>
      {:else}
        <!--
          Таблица широкая по построению: шесть шагов плюс сутки. На 390 пикселях она
          прокручивается ВНУТРИ своей рамки, а не растягивает страницу вбок.
          Названия шагов не переносятся многоточием — закон владельца о названиях.
        -->
        <div class="scroll">
          <table>
            <thead>
              <tr>
                <th class="day">{t.day[lang]}</th>
                {#each FUNNEL_STEPS as step (step)}
                  <th>{t.steps[step][lang]}</th>
                {/each}
              </tr>
            </thead>
            <tbody>
              <tr class="total">
                <th class="day">{t.week[lang]}</th>
                {#each FUNNEL_STEPS as step (step)}
                  <td>{week[step]}</td>
                {/each}
              </tr>
              <tr class="total prev">
                <th class="day">{t.prevWeek[lang]}</th>
                {#each FUNNEL_STEPS as step (step)}
                  <td>{prevWeek[step]}</td>
                {/each}
              </tr>
              {#each days as day (day.date)}
                <tr>
                  <th class="day">{day.date}</th>
                  {#each FUNNEL_STEPS as step (step)}
                    <!-- Ноль пишется НУЛЁМ, а не прочерком: «ноль» и «нет данных» здесь одно
                         и то же состояние, и притворяться, что это разные, нечестно. -->
                    <td class:zero={day[step] === 0}>{day[step]}</td>
                  {/each}
                </tr>
              {/each}
            </tbody>
          </table>
        </div>

        <p class="note">{t.probes[lang]}</p>
        <p class="note">{t.seam[lang]}</p>
      {/if}
    </main>

    <BottomNav active="menu" {lang} />
  </div>
{:else}
  <!-- `unknown`: нейтральное ожидание. Ровно это состояние уходит в пререндер. -->
  <div class="hold">
    <Loading {lang} />
  </div>
{/if}

<style>
  /*
   * 🔴 В АДМИНКЕ ПРИГЛУШЁННОГО ТЕКСТА НЕТ (`bugs/145`, слово владельца: «*админка — это рабочий
   * инструмент, я всё там должен видеть явно и чётко*»). Правило действует на весь раздел —
   * то же переопределение токенов, что в доме панели и в комнате «Измерения».
   */
  .screen {
    --dim: var(--text);
    --faint: var(--text);
  }

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
    gap: 10px;
    font-size: 22px;
    margin: 0 0 8px;
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
  .lede,
  .note,
  .failed {
    font-size: 14px;
    line-height: 1.45;
    margin: 0 0 12px;
  }
  .note {
    margin: 10px 0 0;
  }

  /* Широкая таблица прокручивается ВНУТРИ рамки — страница вбок не едет. */
  .scroll {
    overflow-x: auto;
    background: var(--panel);
    border: 1px solid var(--edge);
    border-radius: 14px;
    box-shadow: var(--card-shadow);
  }
  table {
    border-collapse: collapse;
    width: 100%;
    font-size: 14px;
  }
  th,
  td {
    padding: 9px 12px;
    text-align: right;
    /* Названия шагов не обрезаются и не переносятся многоточием (закон владельца). */
    white-space: nowrap;
  }
  thead th {
    font-weight: 600;
    color: var(--heading);
    border-bottom: 1px solid var(--edge);
    /* Заголовок держится на месте при прокрутке ряда — иначе числа теряют имена. */
    position: sticky;
    top: 0;
    background: var(--panel);
  }
  th.day {
    text-align: left;
    font-weight: 600;
    /* Число суток — моноширинно: столбец дат читается как столбец, а не как рваный край. */
    font-variant-numeric: tabular-nums;
  }
  td {
    font-variant-numeric: tabular-nums;
  }
  tbody tr:not(:last-child) td,
  tbody tr:not(:last-child) th {
    border-bottom: 1px solid var(--edge);
  }
  .total {
    font-weight: 600;
  }
  .total td {
    font-weight: 600;
  }
  .prev th,
  .prev td {
    /* Прошлая неделя — опора для сравнения, поэтому она отделена чертой, а не блёклостью:
       приглушённого текста в админке нет. */
    border-bottom: 2px solid var(--edge);
  }
  .zero {
    /* Ноль остаётся полностью читаемым — приглушать его правило раздела запрещает. */
    opacity: 1;
  }
  .hold {
    min-height: 40dvh;
    display: grid;
    place-items: center;
    padding: 24px;
  }
</style>
