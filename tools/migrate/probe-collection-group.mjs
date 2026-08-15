/**
 * ЗОНД НЕИЗВЕСТНОЙ КОЛЛЕКЦИИ — спутник отпечатка базы (`db-fingerprint.mjs`).
 *
 * Отпечаток отвечает «есть данные, о которых проект не знает»; этот зонд отвечает «какие именно и
 * где». Разделены намеренно: отпечаток обязан быть быстрым и запускаться часто, а разбирательство
 * случается редко.
 *
 * 🔴 ПДн: печатаются ТОЛЬКО пути-шаблоны, число документов и ИМЕНА полей. Ни одного значения —
 * репозиторий публичный, а утечка ПДн здесь уже случалась (`bugs/01`).
 *
 * Запуск: node tools/migrate/probe-collection-group.mjs <имя> [--project ndim-space] [--database "(default)"]
 */
import { readFileSync } from 'node:fs';

import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const arg = (name, fallback) => {
	const i = process.argv.indexOf(name);
	return i === -1 ? fallback : process.argv[i + 1];
};

const GROUP = process.argv[2];
if (!GROUP || GROUP.startsWith('--')) {
	console.error('Укажи имя коллекции: node tools/migrate/probe-collection-group.mjs privat');
	process.exit(2);
}

const PROJECT_ID = arg('--project', 'ndim-space');
const DATABASE_ID = arg('--database', '(default)');

initializeApp({
	credential: cert(JSON.parse(readFileSync('sync-server/secrets/sa.json', 'utf8'))),
	projectId: PROJECT_ID,
});

const db = getFirestore(DATABASE_ID);
const found = await db.collectionGroup(GROUP).get();

console.log(`\n═══ ЗОНД «${GROUP}» · ${PROJECT_ID} / ${DATABASE_ID} ═══`);
console.log(`документов: ${found.size}\n`);

const paths = new Map();
const fields = new Map();
const sizes = [];

for (const doc of found.docs) {
	const template = doc.ref.path
		.split('/')
		.map((part, i) => (i % 2 === 0 ? part : '*'))
		.join('/');
	paths.set(template, (paths.get(template) ?? 0) + 1);
	const data = doc.data();
	sizes.push(Object.keys(data).length);
	for (const key of Object.keys(data)) fields.set(key, (fields.get(key) ?? 0) + 1);
}

console.log('ГДЕ ЛЕЖИТ (шаблоны путей):');
for (const [template, n] of [...paths].sort()) console.log(`  ${template.padEnd(42, '.')} ${n}`);

console.log('\nПОЛЯ (имена, без значений):');
for (const [field, n] of [...fields].sort((a, b) => b[1] - a[1]))
	console.log(`  ${field.padEnd(42, '.')} у ${n} документов`);

// ФОРМА значений — тип, пустота и длина, но НИКОГДА само значение. Этим отличается
// «мёртвая заглушка» от «настоящих данных, о которых 2.0 не знает»: первую видно по нулевым
// длинам, и без этой проверки вердикт был бы догадкой (`PHILOSOPHY.md` — наблюдение вместо
// угадывания).
const shape = new Map();
for (const doc of found.docs) {
	for (const [key, value] of Object.entries(doc.data())) {
		if (!shape.has(key)) shape.set(key, { types: new Map(), empty: 0, lengths: [] });
		const s = shape.get(key);
		const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
		s.types.set(type, (s.types.get(type) ?? 0) + 1);
		const text = typeof value === 'string' ? value : JSON.stringify(value ?? '');
		if (!text || text.length === 0 || text === '""' || text === '{}' || text === '[]') s.empty += 1;
		s.lengths.push(text.length);
	}
}
console.log('\nФОРМА значений (тип · сколько ПУСТЫХ · длина от…до):');
for (const [field, s] of shape) {
	const types = [...s.types].map(([t, n]) => `${t}×${n}`).join(' ');
	console.log(
		`  ${field.padEnd(24, '.')} ${types.padEnd(16)} пустых ${String(s.empty).padStart(4)} · длина ${Math.min(...s.lengths)}…${Math.max(...s.lengths)}`,
	);
}

if (sizes.length > 0) {
	console.log(`\nполей в документе: от ${Math.min(...sizes)} до ${Math.max(...sizes)}`);
}
if (found.size > 0) {
	console.log(`\nпервый путь целиком: ${found.docs[0].ref.path}`);
}
