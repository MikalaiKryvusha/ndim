/**
 * СЧЁТ ПРИХОДА НА ГЛАВНУЮ — ОДНА ИНЛАЙН-СТРОКА, БЕЗ SDK И БЕЗ FIRESTORE.
 *
 * ЗАЧЕМ. `bugs/NEW_funnel_blind_on_v5_root.md`: после переезда корня на главную V5 (`plans/81`)
 * пришедший на `ndimspace.app/` не считался никем — увод на `/ru` снят, а счёт жил там. Решение
 * владельца, интервью **№078 В1 = Г**, дословно: «*только аналитикой постхог, мы свою БД
 * фаерстор не грузим запросами*». То есть на корне НЕТ шага своей воронки (`track()` и
 * Firestore не трогаются), а есть ровно одно событие в PostHog.
 *
 * ПОЧЕМУ СТРОКА, А НЕ SDK. Главная — единственная страница продукта без единого файла кода
 * (`csr = false`, замер №078: 5 запросов, 39 КБ, кода 0). SDK PostHog въехал бы на неё чанком
 * аналитики и потребовал бы гидрации; строка отправляет то же событие тем же публичным API
 * (`POSTHOG_CAPTURE_URL`) и весит около полутора килобайт. Это не «упрощённая копия» — это тот же
 * контракт, что у `capture()`, только в форме, которую страница без кода может нести:
 *   · **контур** — по той же таблице хостов (`contourHostMap()`), на стенде молчит;
 *   · **метка прибора** — тот же ключ `PROBE_MARK`; наши прогоны людьми не считаются;
 *   · **маркер сессии** — вошедший и гость не считаются (их уводит внутрь дверь корня, а
 *     `landing_view` на лендинге тоже считается только тем, у кого сессии нет — `bugs/08.1`);
 *   · **дверь письма** — адрес с `mode=signIn&oobCode` уводится в `/profile` до всего и не
 *     считается: это не приход, а возврат по ссылке из письма;
 *   · 🆕 **роботы не считаются** — ТЕМ ЖЕ признаком, что у SDK (`isLikelyBot` из
 *     `@posthog/browser-common`): `navigator.webdriver` · user agent из списка
 *     `DEFAULT_BLOCKED_UA_STRS` пакета `@posthog/core` (77 строк, импорт — не копия) ·
 *     `navigator.userAgentData.brands` по тому же списку. Найдено 2026-09-12 прогулкой по
 *     стейджу: SDK честно отбраковал мой headless-прибор («HeadlessChrome» в brands), а строка
 *     корня считала его человеком — значит считала бы и Googlebot с исполнением JS, и критерий
 *     «сопоставимо с кликами Search Console» разъехался бы на краулерах;
 *   · **имя события** — `landing_view` из белого списка `ANALYTICS_EVENTS`; свойства — `env`
 *     плюс служебные `$`-поля PostHog, которые SDK ставит сам (`$current_url` без query —
 *     `oobCode` из адреса письма наружу не уходит, и предмету оценки здесь взяться неоткуда);
 *   · **личных профилей не заводим** — `$process_person_profile: false`, как `person_profiles:
 *     'never'` у SDK; `distinct_id` случайный на визит, нигде не хранится и ни с кем не клеится.
 *
 * ПОЧЕМУ ОТДЕЛЬНЫЙ МОДУЛЬ, А НЕ `analytics.ts`. Список роботов импортируется из `@posthog/core`
 * статически. `analytics.ts` — лёгкий чанк, который грузится динамически на всех экранах
 * (`EXP-0028`), и статический импорт утяжелил бы его; этот модуль импортирует ТОЛЬКО корень
 * (`src/routes/+page.svelte`), а корень собирается на сервере (`csr = false`) — в клиентский
 * бандл он не едет вовсе. Константы контура, ключа и адреса берутся из `analytics.ts`, второго
 * списка хостов здесь не рождается.
 *
 * ⚠️ Названная граница: событие корня НЕ ставит метку `claimStep` своей воронки. Человек, ушедший
 * с главной на `/ru`, даст второе `landing_view` уже от SDK — с другим `$pathname`. Ставить метку
 * значило бы гасить и Firestore-счёт на `/ru`, а владелец велел главной Firestore не трогать.
 * Ряды различимы по `$lib` и `$pathname`; сводить их — вопрос аналитики, а не продукта.
 *
 * ⚠️ И вторая: блокировщики режут `posthog.com` целиком — так же, как SDK на лендинге. Эталоном
 * сверки по-прежнему остаётся Search Console (клики на `/` за сутки, критерий `plans/74` Ф1 Ш1).
 *
 * Юниты гоняют строку в стенде-заглушке (`analytics.test.ts`); e2e и живой прибор приходят
 * ЧЕЛОВЕКОМ (обычный user agent, без `webdriver`, без `userAgentData`) и роботом как контроль.
 */

import { DEFAULT_BLOCKED_UA_STRS } from '@posthog/core';

import { contourHostMap, POSTHOG_CAPTURE_URL, POSTHOG_TOKEN } from './analytics.ts';
import { PROBE_MARK } from './funnel.ts';

/**
 * Имя «библиотеки» в событии главной — так PostHog отличает приход, посчитанный инлайн-строкой
 * корня, от прихода, посчитанного SDK на языковом лендинге (`$lib` у SDK — `web`).
 */
export const ROOT_LANDING_VIEW_LIB = 'ndim-root-inline';

/**
 * Маркер сессии в `localStorage` — тот же, что ставит `data/session.ts` (`SESSION_MARK`) и
 * читают `app.html` и дверь письма на корне. Литерал, а не импорт: `session.ts` статически
 * тянет SDK Firebase, а корню он не нужен. Пара «истина ↔ зеркало» стережётся юнитом, который
 * читает `session.ts` исходным текстом.
 */
export const SESSION_MARK_MIRROR = 'ndim-session';

/** Признаки робота — список SDK как есть, в нижнем регистре (так его и сравнивает `isBlockedUA`). */
export const BOT_SIGNS: readonly string[] = DEFAULT_BLOCKED_UA_STRS.map((s) => s.toLowerCase());

/** Собирает инлайн-строку счёта из констант модулей; подстановка на сборке, зеркал нет. */
export function rootLandingViewScript(): string {
  const hosts = JSON.stringify(contourHostMap());
  const bots = JSON.stringify(BOT_SIGNS);
  const body = [
    '(function(){try{',
    // Дверь письма — тот же разбор, что у `EMAIL_DOOR` корня: точный, а не подстрокой.
    "var p=new URLSearchParams(location.search);if(p.get('mode')==='signIn'&&p.has('oobCode'))return;",
    `if(localStorage.getItem(${JSON.stringify(SESSION_MARK_MIRROR)}))return;`,
    `if(sessionStorage.getItem(${JSON.stringify(PROBE_MARK)})!==null)return;`,
    // Робот — тем же признаком, что у SDK: webdriver · user agent · brands.
    `var n=navigator,B=${bots};if(n.webdriver)return;`,
    "var u=String(n.userAgent||'').toLowerCase();for(var i=0;i<B.length;i++)if(u.indexOf(B[i])!==-1)return;",
    "var br=(n.userAgentData&&n.userAgentData.brands)||[];for(var j=0;j<br.length;j++){var b=String(br[j]&&br[j].brand||'').toLowerCase();for(var k=0;k<B.length;k++)if(b.indexOf(B[k])!==-1)return;}",
    `var env=(${hosts})[location.hostname];if(!env)return;`,
    "var id=(typeof crypto!=='undefined'&&crypto.randomUUID)?crypto.randomUUID():String(Date.now())+'-'+Math.random().toString(16).slice(2);",
    `var d={api_key:${JSON.stringify(POSTHOG_TOKEN)},event:'landing_view',distinct_id:id,properties:{env:env,$process_person_profile:false,$lib:${JSON.stringify(ROOT_LANDING_VIEW_LIB)},$current_url:location.origin+location.pathname,$host:location.hostname,$pathname:location.pathname}};`,
    `fetch(${JSON.stringify(POSTHOG_CAPTURE_URL)},{method:'POST',keepalive:true,headers:{'Content-Type':'text/plain'},body:JSON.stringify(d)}).catch(function(){});`,
    '}catch(e){}})();',
  ];
  return body.join('\n');
}
