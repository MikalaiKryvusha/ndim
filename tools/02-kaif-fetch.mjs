#!/usr/bin/env node
// 02-kaif-fetch.mjs — шаг 2 развёртывания: получить самоизвлекающееся ядро KAIF.md с origin
// и сверить его с локальной копией.
//
// Зачем: KAIF.md — единственный источник истины о том, что содержит версия фреймворка.
// Прежде чем распаковывать, убеждаемся, что распаковываем актуальную версию, а не ту,
// что случайно оказалась в папке.
//
// Использование:
//   node tools/02-kaif-fetch.mjs                # сверить локальный KAIF.md с origin
//   node tools/02-kaif-fetch.mjs --update       # подтянуть свежий KAIF.md, если origin новее
//   node tools/02-kaif-fetch.mjs --force        # перезаписать локальный KAIF.md версией origin
//
// Коды возврата: 0 — локальная копия актуальна (или обновлена); 3 — origin новее (нужен --update);
// 4 — сеть недоступна (работаем с локальной копией); 1 — ошибка.

import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const ORIGIN_RAW = 'https://raw.githubusercontent.com/MikalaiKryvusha/KAIF/main/KAIF.md';
const LOCAL = 'KAIF.md';

const args = process.argv.slice(2);
const UPDATE = args.includes('--update');
const FORCE = args.includes('--force');

const sha256 = (s) => createHash('sha256').update(s).digest('hex').slice(0, 12);

/** Версия ядра живёт в заголовке: «# KAIF — … · v1.4». Двузначный semver MAJOR.MINOR. */
const parseVersion = (text) => (text.match(/^#\s+KAIF\b.*?·\s*v(\d+\.\d+)/m) || [])[1] || null;

/** Сравнение двузначного semver: >0 если a новее b. */
const cmpVersion = (a, b) => {
  const [aMaj, aMin] = a.split('.').map(Number);
  const [bMaj, bMin] = b.split('.').map(Number);
  return aMaj - bMaj || aMin - bMin;
};

// --- локальная копия ---------------------------------------------------------
if (!existsSync(LOCAL)) {
  console.error(`✖ локальный ${LOCAL} не найден — положите ядро KAIF в корень проекта`);
  process.exit(1);
}
const localText = readFileSync(LOCAL, 'utf8');
const localVer = parseVersion(localText);
if (!localVer) { console.error(`✖ не удалось определить версию из ${LOCAL}`); process.exit(1); }
console.log(`локально:  KAIF v${localVer}  (sha256:${sha256(localText)}, ${localText.length} симв.)`);

// --- origin ------------------------------------------------------------------
let remoteText;
try {
  const res = await fetch(ORIGIN_RAW, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  remoteText = await res.text();
} catch (err) {
  console.warn(`⚠ origin недоступен (${err.message}) — продолжаем с локальной копией v${localVer}`);
  process.exit(4);
}

const remoteVer = parseVersion(remoteText);
if (!remoteVer) { console.error('✖ не удалось определить версию из origin — ответ не похож на ядро KAIF'); process.exit(1); }
console.log(`origin:    KAIF v${remoteVer}  (sha256:${sha256(remoteText)}, ${remoteText.length} симв.)`);

const diff = cmpVersion(remoteVer, localVer);
const identical = remoteText === localText;

if (identical) { console.log(`✅ локальная копия побайтово совпадает с origin (v${localVer})`); process.exit(0); }

if (diff > 0) {
  console.log(`⬆ origin новее: v${remoteVer} > v${localVer}`);
} else if (diff < 0) {
  console.log(`⬇ локальная копия новее origin (v${localVer} > v${remoteVer}) — origin не трогаем`);
} else {
  console.log(`≠ версии совпадают (v${localVer}), но содержимое отличается — origin правился без бампа версии`);
}

if (!(UPDATE && diff > 0) && !FORCE) {
  console.log(`\nЧтобы подтянуть origin: node tools/02-kaif-fetch.mjs ${diff > 0 ? '--update' : '--force'}`);
  process.exit(diff > 0 ? 3 : 0);
}

// Перед перезаписью — резервная копия: ядро одноразовое, потерять его нечем восстановить.
copyFileSync(LOCAL, `${LOCAL}.bak`);
writeFileSync(LOCAL, remoteText);
console.log(`✅ ${LOCAL} обновлён до v${remoteVer} (прежняя версия — ${LOCAL}.bak)`);
