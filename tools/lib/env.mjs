/**
 * ЧТЕНИЕ `.env` — один загрузчик на все приборы проекта.
 *
 * Правило владельца 2026-08-15, дословно: «*ключи нужно вынести в .env, никогда ключи в коде и
 * других файлах не храним*». Отсюда: секреты живут ТОЛЬКО в `.env` (он вне git — `.gitignore`
 * строка 11), а приборы берут их оттуда.
 *
 * Почему свой загрузчик, а не зависимость: файл читается тремя строками, а лишний пакет в
 * приборах, которые ходят в боевую базу, — это лишняя цепочка поставки (Оккам).
 *
 * Почему не `node --env-file=.env`: он есть в Node 24, но потребовал бы менять КАЖДУЮ команду
 * запуска во всех документах и ритуалах. Загрузчик внутри прибора оставляет команды прежними.
 *
 * Переменные, УЖЕ заданные в окружении, не перезаписываются: явный `$env:X` в оболочке или
 * `-e X` у Docker обязан побеждать файл.
 */
import { existsSync, readFileSync } from 'node:fs';

let loaded = false;

/** Читает `.env` в `process.env`. Идемпотентно: повторные вызовы бесплатны. */
export function loadEnv(path = '.env') {
	if (loaded) return;
	loaded = true;
	if (!existsSync(path)) return;
	for (const rawLine of readFileSync(path, 'utf8').split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || line.startsWith('#')) continue;
		const eq = line.indexOf('=');
		if (eq === -1) continue;
		const key = line.slice(0, eq).trim();
		let value = line.slice(eq + 1).trim();
		// Кавычки вокруг значения — необязательны, но встречаются в чужих образцах.
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}
		if (!(key in process.env)) process.env[key] = value;
	}
}
