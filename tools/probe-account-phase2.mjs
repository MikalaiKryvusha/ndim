/**
 * ПРИБОР ЗАМЕРА (не страж) — эпик «Управление аккаунтом», фаза 2, часть Б (plans/16).
 *
 * Отвечает на три вопроса, которых НЕТ ни на одной странице документации Firebase:
 *   Б1. Что делает sendPasswordResetEmail для аккаунта БЕЗ провайдера password?
 *   Б2. Рождается ли код RECOVER_EMAIL (отмена смены почты) после verifyBeforeUpdateEmail?
 *   Б3. Требует ли verifyBeforeUpdateEmail недавнего входа?
 *
 * Каждый вопрос замеряется ДВАЖДЫ: при выключенной защите от перечисления почт (EEP) и при
 * включённой — потому что 2026-08-01 разведка показала, что в БОЮ она ВКЛЮЧЕНА
 * (emailPrivacyConfig.enableImprovedEmailPrivacy = true).
 *
 * ⚠️ ЭМУЛЯТОР — ИНДИКАЦИЯ, А НЕ ДОКАЗАТЕЛЬСТВО. Он не применяет запрет EEP в setAccountInfo и
 * не шлёт писем. Всё, что касается EEP и текстов писем, закрывается только боем (researches/24 §1.8).
 *
 * Запуск: firebase emulators:exec --only auth --project demo-ndim-dev "node <этот файл>"
 */

import { initializeApp, deleteApp } from 'firebase/app';
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  sendPasswordResetEmail,
  sendSignInLinkToEmail,
  signInWithEmailLink,
  signOut,
  verifyBeforeUpdateEmail,
} from 'firebase/auth';

const PROJECT = 'demo-ndim-dev';
const HOST = '127.0.0.1:9099';
const OOB = `http://${HOST}/emulator/v1/projects/${PROJECT}/oobCodes`;
const CONFIG = `http://${HOST}/emulator/v1/projects/${PROJECT}/config`;
const ADMIN_CONFIG = `http://${HOST}/identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT}/config`;
const LINK_SETTINGS = { url: 'http://localhost:5173/profile', handleCodeInApp: true };

let seq = 0;
const uniq = (tag) => `${tag}-${Date.now()}-${++seq}@ndim.test`;

async function codes() {
  const r = await fetch(OOB);
  return (await r.json()).oobCodes ?? [];
}

/** Коды, появившиеся ПОСЛЕ отсечки: эмулятор копит их и не чистит сам. */
async function newCodes(since) {
  const all = await codes();
  return all.slice(since);
}

/** Включение/выключение EEP на эмуляторе — тропа из исходников firebase-tools (недокументированная). */
async function setEEP(on) {
  const r = await fetch(`${ADMIN_CONFIG}?updateMask=emailPrivacyConfig.enableImprovedEmailPrivacy`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ emailPrivacyConfig: { enableImprovedEmailPrivacy: on } }),
  });
  const body = await r.json().catch(() => ({}));
  const actual = body?.emailPrivacyConfig?.enableImprovedEmailPrivacy;
  return { http: r.status, applied: actual === on, actual };
}

async function readEEP() {
  const r = await fetch(ADMIN_CONFIG, { headers: { Authorization: 'Bearer owner' } });
  const body = await r.json().catch(() => ({}));
  return body?.emailPrivacyConfig?.enableImprovedEmailPrivacy;
}

/** Заводит человека БЕЗ пароля — вход только по ссылке на почту (случай 2.0). */
async function makeLinkOnlyUser(auth, email) {
  const before = (await codes()).length;
  await sendSignInLinkToEmail(auth, email, LINK_SETTINGS);
  const fresh = await newCodes(before);
  const link = fresh.find((c) => c.email === email && c.requestType === 'EMAIL_SIGNIN');
  if (!link) throw new Error(`не пришёл код EMAIL_SIGNIN для ${email}`);
  const cred = await signInWithEmailLink(auth, email, link.oobLink);
  return cred.user;
}

function providers(user) {
  return user.providerData.map((p) => p.providerId).join(',') || '(пусто)';
}

async function run(label, fn) {
  try {
    const out = await fn();
    console.log(`  ${label}: ${out}`);
  } catch (e) {
    console.log(`  ${label}: ОШИБКА ${e?.code ?? ''} ${e?.message ?? e}`);
  }
}

async function block(eep) {
  console.log(`\n${'═'.repeat(78)}\nEEP = ${eep ? 'ВКЛЮЧЕНА (как в бою)' : 'выключена'}\n${'═'.repeat(78)}`);
  const applied = await setEEP(eep);
  const now = await readEEP();
  console.log(`  переключение: HTTP ${applied.http}, флаг после записи = ${JSON.stringify(now)}`);
  if (now !== eep) {
    console.log('  ⚠️ ФЛАГ НЕ ПРИМЕНИЛСЯ — результаты ниже относятся к состоянию', JSON.stringify(now));
  }

  const app = initializeApp({ apiKey: 'demo', projectId: PROJECT }, `probe-${eep}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${HOST}`, { disableWarnings: true });

  // ── Б1. Сброс пароля для человека БЕЗ пароля ──────────────────────────────
  console.log('\nБ1. sendPasswordResetEmail для аккаунта БЕЗ провайдера password');
  const linkEmail = uniq('linkonly');
  await run('заведён человек только со ссылкой', async () => {
    const u = await makeLinkOnlyUser(auth, linkEmail);
    return `uid=${u.uid.slice(0, 8)}… провайдеры: ${providers(u)}`;
  });
  await run('вызов sendPasswordResetEmail', async () => {
    const before = (await codes()).length;
    await sendPasswordResetEmail(auth, linkEmail);
    const fresh = (await newCodes(before)).filter((c) => c.email === linkEmail);
    return fresh.length
      ? `promise ok, КОД РОДИЛСЯ: ${fresh.map((c) => c.requestType).join(',')}`
      : 'promise ok, но КОДА НЕТ (письмо не ушло бы)';
  });

  // Контроль прибора: у человека С паролем код обязан родиться, иначе замер выше ничего не значит.
  console.log('\nБ1-контроль. То же для аккаунта С паролем (иначе замер выше недоказателен)');
  const pwdEmail = uniq('withpwd');
  await run('заведён человек с паролем', async () => {
    const cred = await createUserWithEmailAndPassword(auth, pwdEmail, 'ndim-probe-123');
    return `провайдеры: ${providers(cred.user)}`;
  });
  await run('вызов sendPasswordResetEmail', async () => {
    const before = (await codes()).length;
    await sendPasswordResetEmail(auth, pwdEmail);
    const fresh = (await newCodes(before)).filter((c) => c.email === pwdEmail);
    return fresh.length ? `КОД РОДИЛСЯ: ${fresh.map((c) => c.requestType).join(',')}` : 'КОДА НЕТ';
  });

  // ── Б2. Отмена смены почты ────────────────────────────────────────────────
  console.log('\nБ2. verifyBeforeUpdateEmail → рождается ли RECOVER_EMAIL (ссылка отмены)');
  const oldEmail = uniq('change-from');
  const newEmail = uniq('change-to');
  let changed = null;
  await run('заведён человек только со ссылкой', async () => {
    changed = await makeLinkOnlyUser(auth, oldEmail);
    return `провайдеры: ${providers(changed)}`;
  });
  let changeLink = null;
  await run('вызов verifyBeforeUpdateEmail', async () => {
    const before = (await codes()).length;
    await verifyBeforeUpdateEmail(changed, newEmail, LINK_SETTINGS);
    const fresh = await newCodes(before);
    changeLink = fresh.find((c) => c.requestType === 'VERIFY_AND_CHANGE_EMAIL');
    return fresh.length
      ? fresh.map((c) => `${c.requestType}→${c.email}`).join(' | ')
      : 'ни одного кода';
  });
  await run('переход по ссылке (почта реально меняется)', async () => {
    if (!changeLink) return 'пропущено — ссылки не было';
    const before = (await codes()).length;
    const r = await fetch(changeLink.oobLink, { redirect: 'manual' });
    const after = await newCodes(before);
    const recover = after.filter((c) => c.requestType === 'RECOVER_EMAIL');
    await changed.reload();
    return `HTTP ${r.status} · почта стала ${changed.email === newEmail ? 'НОВОЙ' : `«${changed.email}»`} · ` +
      (recover.length ? `RECOVER_EMAIL РОДИЛСЯ (${recover.length})` : '🔴 RECOVER_EMAIL НЕ РОДИЛСЯ');
  });

  // ── Б3. Нужен ли свежий вход ──────────────────────────────────────────────
  console.log('\nБ3. Требует ли verifyBeforeUpdateEmail недавнего входа');
  await run('вызов при заведомо живой сессии', async () => {
    const u = await makeLinkOnlyUser(auth, uniq('recent'));
    await verifyBeforeUpdateEmail(u, uniq('recent-new'), LINK_SETTINGS);
    return 'прошёл (сессия свежая — это ожидаемо, вопрос не закрыт)';
  });
  console.log('  ⚠️ ЗАСТАРЕВШУЮ сессию эмулятор не воспроизводит: состарить токен нечем.');
  console.log('     Вопрос закрывается только боем — экран обязан уметь ловить auth/requires-recent-login.');

  await signOut(auth).catch(() => {});
  await deleteApp(app);
}

console.log('ПРИБОР: эпик «Управление аккаунтом», фаза 2, часть Б.');
console.log('Эмулятор Auth:', HOST, '· проект:', PROJECT);
const cfg = await fetch(CONFIG).then((r) => r.json()).catch(() => ({}));
console.log('Документированный конфиг эмулятора:', JSON.stringify(cfg));

await block(false);
await block(true);

console.log(`\n${'═'.repeat(78)}\nЗамер окончен. Эмулятор ≠ бой: EEP и тексты писем проверяются только в бою.`);
