/**
 * ЗАВЕДЕНИЕ КЛЮЧА INDEXNOW — генерирует ключ и кладёт файл в `static/`.
 *
 * Запуск:
 *   node tools/indexnow-key.mjs            # показать текущий ключ либо сказать, что его нет
 *   node tools/indexnow-key.mjs --create   # завести (откажет, если ключ уже есть)
 *
 * ⚠️ КЛЮЧ INDEXNOW — ПУБЛИЧНЫЙ ПО УСТРОЙСТВУ ПРОТОКОЛА, и это надо понимать, прежде чем пугаться
 * слова «ключ». Поисковик читает файл `https://ndimspace.app/<ключ>.txt` и по совпадению имени
 * файла с его содержимым убеждается, что адреса подаёт хозяин домена. Секретности здесь нет и не
 * предполагается: файл обязан быть доступен всему интернету. Поэтому он живёт в `static/`,
 * коммитится и уезжает выкатом — в отличие от сервисных ключей, которым место только в `.env`.
 *
 * 🔴 СМЕНА КЛЮЧА — НЕ БЕСПЛАТНАЯ ОПЕРАЦИЯ, и поэтому `--create` отказывает при существующем.
 * Пока новый файл не доехал до боя, поисковики отвечают на подачу 403 либо держат её в 202
 * «ключ проверяется». То есть смена ключа — это окно, в котором подача не работает вовсе.
 */
import { writeFileSync, existsSync, readdirSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { generateKey, validateKey, keyFileName } from './lib/indexnow.mjs';

const STATIC_DIR = 'static';

/** Все файлы `static/`, которые выглядят и ведут себя как ключ IndexNow. */
function existingKeys() {
	if (!existsSync(STATIC_DIR)) return [];
	return readdirSync(STATIC_DIR)
		.filter((name) => /^[a-zA-Z0-9-]{8,128}\.txt$/.test(name))
		.filter((name) => {
			const body = readFileSync(join(STATIC_DIR, name), 'utf8').trim();
			return body === name.replace(/\.txt$/, '');
		})
		.map((name) => name.replace(/\.txt$/, ''));
}

function main(argv) {
	const create = argv.includes('--create');
	const existing = existingKeys();

	if (existing.length > 0) {
		console.log(`КЛЮЧ INDEXNOW УЖЕ ЗАВЕДЁН: ${existing.join(', ')}`);
		console.log(`файл: static/${keyFileName(existing[0])}`);
		if (create) {
			console.error('\n🔴 ОТКАЗ: --create при существующем ключе.');
			console.error('   Смена ключа открывает окно, в котором подача не работает, пока новый');
			console.error('   файл не доехал до боя выкатом. Это решение владельца, не деталь реализации.');
			return 1;
		}
		return 0;
	}

	if (!create) {
		console.log('Ключа IndexNow нет. Завести: node tools/indexnow-key.mjs --create');
		return 0;
	}

	const key = generateKey();
	const problems = validateKey(key);
	if (problems.length > 0) throw new Error(`сгенерирован негодный ключ: ${problems.join('; ')}`);

	mkdirSync(STATIC_DIR, { recursive: true });
	const file = join(STATIC_DIR, keyFileName(key));
	// Содержимое файла — САМ КЛЮЧ, без перевода строки в конце: так велит протокол.
	writeFileSync(file, key, 'utf8');
	console.log(`✅ ключ заведён: ${key}`);
	console.log(`   файл: ${file}`);
	console.log('\n⏭ Он начнёт работать только после выката (дверь Менеджера, npm run deploy):');
	console.log(`   https://ndimspace.app/${keyFileName(key)}`);
	return 0;
}

try {
	process.exit(main(process.argv.slice(2)));
} catch (error) {
	console.error(`🔴 ${error.message}`);
	process.exit(1);
}
