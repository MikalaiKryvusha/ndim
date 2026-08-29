/**
 * ПРОПУСК ДЛЯ НАШИХ ПРИБОРОВ — debug-токен App Check.
 *
 * ЗАЧЕМ ОН СУЩЕСТВУЕТ. Защита от роботов (App Check) в бою работает по делу: живых людей
 * пропускает, а headless-приборы двери выката принимает за роботов и отказывает им — обмен
 * токена reCAPTCHA v3 возвращает 403. Пострадали не люди, а ВОРОТА ДВЕРИ: смоук под сессией
 * краснеет на проверке «консоль чиста», и выкатить в бой становится нечем (`bugs/169`).
 * Debug-токен — документированный путь Firebase ровно для этого случая: приборы предъявляют
 * известную строку и проходят, живые люди по-прежнему проверяются reCAPTCHA.
 *
 * 🔴 РАЗРЕШЕНИЕ ВЛАДЕЛЬЦА. Интервью №046, В1 = Б, 2026-08-22: «**Б — Разрешаю**». Без этой
 * строки прибор не запускается: создание пропуска в боевой проект — не рутинное действие.
 *
 * ⛔ ЧЕГО ЭТОТ ПРИБОР НЕ ДЕЛАЕТ. Он не выключает App Check, не трогает ключ reCAPTCHA и не учит
 * дверь «не замечать» отказ. Ворота, которые молчат, красят зелёным непроверенное.
 *
 * 🔒 ГДЕ ЖИВЁТ ЗНАЧЕНИЕ. Только в `.env` (`NDIM_APP_CHECK_DEBUG_TOKEN`) — правило владельца
 * «никогда ключи в коде и других файлах не храним». Прибор ПЕЧАТАЕТ токен один раз, чтобы его
 * можно было положить в `.env`; в репозиторий он не попадает никогда.
 *
 * Запуск:
 *   node tools/app-check-debug-token.mjs list                 — что уже заведено (только читает)
 *   node tools/app-check-debug-token.mjs create "<имя>"       — завести пропуск
 */
import { GoogleAuth } from 'google-auth-library';
import { serviceAccount, PROJECT_OF } from './lib/credentials.mjs';

/** Боевое веб-приложение — то самое, чей обмен токена отдаёт 403 (`bugs/169`). */
const APP_ID = '1:1077558742259:web:0de996aa7f186d7d13bb86';
const CONTOUR = 'prod';
const API = 'https://firebaseappcheck.googleapis.com/v1';

/** Доступ берётся ключом сервисного аккаунта контура — контур назван в имени переменной. */
async function accessToken() {
  const credentials = serviceAccount(CONTOUR);
  const auth = new GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/firebase'],
  });
  const client = await auth.getClient();
  const { token } = await client.getAccessToken();
  if (!token) throw new Error('сервисный аккаунт не выдал токен доступа');
  return token;
}

async function call(path, init = {}) {
  const token = await accessToken();
  const res = await fetch(`${API}/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    // Отказ называем АДРЕСОМ и телом, а не голым кодом — урок `bugs/169`, второй дефект.
    throw new Error(`${res.status} ${res.statusText}\n  адрес: ${API}/${path}\n  ответ: ${text}`);
  }
  return text ? JSON.parse(text) : {};
}

const parent = `projects/${PROJECT_OF[CONTOUR]}/apps/${APP_ID}`;

const [command, name] = process.argv.slice(2);

if (command === 'list') {
  const out = await call(`${parent}/debugTokens`);
  const tokens = out.debugTokens ?? [];
  console.log(`Пропусков заведено: ${tokens.length}`);
  for (const t of tokens) {
    // Значение самого токена API обратно НЕ отдаёт — только имя. Это правильно.
    console.log(`  · ${t.displayName ?? '(без имени)'}  —  ${t.name}`);
  }
} else if (command === 'create') {
  if (!name) {
    console.error('Назовите пропуск: node tools/app-check-debug-token.mjs create "<имя>"');
    process.exit(1);
  }
  // 🔑 Значение придумываем МЫ: API отвечает 400 «debug_token.token field must be provided» —
  // сервер его не генерирует. Берём криптостойкий UUID, а не свою выдумку: догадка о формате
  // здесь стоила бы пропуска, который App Check не признает.
  const value = crypto.randomUUID();
  const out = await call(`${parent}/debugTokens`, {
    method: 'POST',
    body: JSON.stringify({ displayName: name, token: value }),
  });
  out.token ??= value;
  console.log(`✅ Пропуск заведён: ${out.displayName}`);
  console.log(`   имя ресурса: ${out.name}`);
  console.log('');
  console.log('🔑 ЗНАЧЕНИЕ (положить в .env, в git не коммитить):');
  console.log(`NDIM_APP_CHECK_DEBUG_TOKEN=${out.token}`);
  console.log('');
  console.log('⚠️ API отдаёт значение ТОЛЬКО в этом ответе. Потерялось — заводите новый пропуск.');
} else {
  console.error('Команды: list · create "<имя>"');
  process.exit(1);
}
