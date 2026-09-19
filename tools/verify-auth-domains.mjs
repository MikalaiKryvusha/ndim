/**
 * СТРАЖ РАЗРЕШЁННЫХ ДОМЕНОВ ВХОДА — со страниц каких адресов Firebase соглашается вести вход в наш проект.
 *
 * ПОВОД (`bugs/NEW_lost_domain_still_authorized_for_signin.md`): три месяца в списке стоял `ndim.app` —
 * домен, который проект ПОТЕРЯЛ 20 июня 2026 и который принадлежит другому человеку. Потеря домена записана
 * в журнал решений мастер-плана, а список в консоли Firebase не пересматривал никто: он живёт ВНЕ кода, и
 * ни один прибор его не читал. Владелец чужого домена мог поставить у себя страницу с нашим публичным
 * веб-конфигом и кнопкой «Войти через Google» — и получить токен нашего проекта на аккаунт человека.
 *
 * ЧТО ДЕЛАЕТ. Читает список у Firebase (`admin/v2/projects/<проект>/config`) и краснеет на КАЖДОМ домене,
 * которого нет в объявленном ниже составе, и на каждой объявленной строке, которой в бою НЕ ОКАЗАЛОСЬ.
 * Только читает: ни одной записи.
 *
 * ⛔ ГРАНИЦЫ, названные вслух:
 *   · прибор НЕ в `npm run guards`: ему нужны сеть и вход `gcloud` (ворота проекта работают без сети);
 *   · адреса возврата клиента OAuth он не проверяет — публичного API для них нет (проверено 2026-09-19:
 *     форумы Google, документация Identity Platform). Они правятся и читаются только в консоли;
 *   · «домен наш» он не доказывает — доказывает лишь «список равен объявленному составу». Потеря домена
 *     видна не ему, а человеку: строка состава несёт причину, и её читают глазами.
 *
 * Запуск:  node tools/verify-auth-domains.mjs            # бой
 *          node tools/verify-auth-domains.mjs --stage     # стейдж
 * Вход:    `gcloud auth print-access-token` (аккаунт владельца проекта).
 *
 * [TESTED: 2026-09-19 23:5x · прогон по бою 7/7 зелёных; мутанты адресно: строка убрана из состава → красный ровно
 *  этот домен, выдуманный домен в составе → красный «объявлен, а в бою нет»; контроль после возврата 0 провалов;
 *  отчёт `qa/reports/2026-09-19_google-signin.md` (серия 4)]
 */
import { execSync } from 'node:child_process';

const STAGE = process.argv.includes('--stage');
const PROJECT = STAGE ? 'ndim-stage' : 'ndim-space';

/**
 * ОБЪЯВЛЕННЫЙ СОСТАВ, причина у каждой строки — иначе через месяц страж судит пустоту.
 * Правится ВМЕСТЕ с настройкой в консоли, и только по слову владельца.
 */
const DECLARED = STAGE
  ? new Map([
      ['localhost', 'стенд Firebase по умолчанию'],
      ['127.0.0.1', 'стенд Firebase по умолчанию'],
      ['ndim-stage.firebaseapp.com', 'адрес стейджа Firebase'],
      ['ndim-stage.web.app', 'адрес стейджа Firebase'],
    ])
  : new Map([
      ['localhost', 'стенд Firebase по умолчанию'],
      ['127.0.0.1', 'стенд Firebase по умолчанию'],
      ['ndim-space.firebaseapp.com', 'служебный адрес проекта, он же прежний `authDomain`'],
      ['ndim-space.web.app', 'СТАРЫЙ адрес продукта — его знают 331 человек из 1.x'],
      ['ndimspace.app', 'ДОМ продукта и `authDomain` с 2026-09-19'],
      ['www.ndimspace.app', 'тот же дом с `www`'],
      ['ndim-space--landing-3jvzs4cd.web.app', 'канал предпросмотра Firebase нашего же сайта (мёртв; снятие — слово владельца)'],
    ]);

const token = execSync('gcloud auth print-access-token', { encoding: 'utf8' }).trim();
const response = await fetch(`https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT}/config`, {
  headers: { Authorization: `Bearer ${token}`, 'X-Goog-User-Project': PROJECT },
});
if (!response.ok) {
  console.error(`не удалось прочитать настройку проекта ${PROJECT}: ${response.status} ${await response.text()}`);
  process.exit(2);
}
const live = (await response.json()).authorizedDomains ?? [];

let failures = 0;
const say = (ok, line) => {
  if (!ok) failures += 1;
  console.log(`${ok ? '  ✅' : '  ❌'} ${line}`);
};

console.log(`разрешённые домены входа · проект ${PROJECT} · в списке ${live.length}\n`);
for (const domain of live) {
  const reason = DECLARED.get(domain);
  say(Boolean(reason), reason ? `${domain} — ${reason}` : `${domain} — ЧУЖОЙ или НЕОБЪЯВЛЕННЫЙ домен в списке входа`);
}
for (const [domain, reason] of DECLARED) {
  if (!live.includes(domain)) say(false, `${domain} объявлен составом, но в бою его НЕТ — ${reason}`);
}

console.log(`\nИТОГ: провалов ${failures}.`);
process.exitCode = failures === 0 ? 0 : 1;
