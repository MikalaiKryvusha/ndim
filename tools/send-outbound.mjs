#!/usr/bin/env node
/**
 * send-outbound.mjs — ОТПРАВЩИК исходящего, стоящий за гейтом одобрения.
 *
 * Зачем он существует. Регламент (`owner-reviews`, шаг 3): *«The send-side gate — makes approval
 * mechanical; without it the page is decoration»*. Гейт без единого настоящего потребителя —
 * тоже украшение, поэтому у контура есть реальная исходящая отправка.
 *
 * На этом проекте она ровно одна и названа каноном (`AGENT_GUIDE.md` → «Заметки от человека»):
 *   «Если найдёшь баги в сторонних библиотеках — заводи по ним тикеты через `gh` ОТ ИМЕНИ ЧЕЛОВЕКА.»
 * То есть агент публикует текст под именем владельца в чужом публичном репозитории. Это ровно тот
 * класс действий, который канон проекта требует подтверждать словом владельца, а не «стоячей
 * авторизацией на рутинные коммиты».
 *
 * Устройство (I4 — fail-closed):
 *   1) без `--apply` — сухой прогон: печатает, что и куда уйдёт, и не отправляет ничего;
 *   2) с `--apply` — СНАЧАЛА гейт (`checkApproval`), и только при «одобрено» вызывается `gh`;
 *   3) любое сомнение — отказ с ненулевым кодом. `--apply` ничего не «продавливает».
 *
 *   node tools/send-outbound.mjs <документ.md> <артефакт> [--apply]
 *
 * Метаблок документа-черновика (контракт имён регламента):
 *   ```yaml
 *   title: Тикет в svelte о ...
 *   kind: outbound
 *   artifacts:
 *     - {id: issue-1, target: "GitHub · sveltejs/svelte", format: github-issue, body_file: drafts/issue-1.md}
 *   ```
 * Тело — ССЫЛКА на файл, а не копия в документе: страница показывает те самые байты, что уйдут,
 * и хеш считается по ним же. Копипаста была бы второй истиной и ломала бы I3.
 *
 * Формат тела `github-issue`: первая строка — заголовок тикета, дальше пустая строка и тело.
 */

import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ROOT, checkApproval, readMd, parseMeta } from './lib/review-core.mjs';

/** Разбирает тело github-issue: заголовок = первая непустая строка, тело = остальное. */
function splitIssue(text) {
	const lines = text.replace(/\r\n?/g, '\n').split('\n');
	let i = 0;
	while (i < lines.length && !lines[i].trim()) i++;
	const title = lines[i].replace(/^#+\s*/, '').trim();
	return { title, body: lines.slice(i + 1).join('\n').trim() };
}

function main() {
	const args = process.argv.slice(2);
	const apply = args.includes('--apply');
	const [doc, id] = args.filter((a) => !a.startsWith('--'));
	if (!doc || !id) {
		console.error('Использование: node tools/send-outbound.mjs <документ.md> <артефакт> [--apply]');
		return 2;
	}
	const docPath = resolve(ROOT, doc);
	if (!existsSync(docPath)) {
		console.error(`Нет документа: ${doc}`);
		return 2;
	}

	// ── ГЕЙТ. Стоит ПЕРЕД любой отправкой и не обходится флагом.
	const v = checkApproval(docPath, id);
	if (!v.ok) {
		console.error(`⛔ ОТПРАВКА ОТКЛОНЕНА: ${v.reason}`);
		if (v.approved) {
			console.error(`   одобрено было: ${v.approved}`);
			console.error(`   сейчас в файле: ${v.current}`);
			console.error('   Покажите владельцу новую редакцию — прежнее одобрение аннулировано.');
		} else {
			console.error(`   Показать владельцу: node tools/review.mjs open ${doc}`);
		}
		return 1;
	}

	const art = v.artifact;
	const text = readFileSync(art.absolute, 'utf8');
	const meta = parseMeta(readMd(docPath));
	console.log(`Артефакт:  ${id}`);
	console.log(`Адресат:   ${art.target ?? '—'}`);
	console.log(`Формат:    ${art.format ?? 'text'}`);
	console.log(`Одобрил:   ${v.by} (${v.at})`);
	console.log(`Тело:      ${relative(ROOT, art.absolute)}  sha256 ${v.sha256.slice(0, 16)}…`);
	console.log(`Документ:  ${meta.title}`);

	if ((art.format ?? 'text') !== 'github-issue') {
		console.error(`\n⛔ Транспорт «${art.format}» не реализован. Реализован только github-issue.`);
		return 1;
	}
	const repo = (art.target ?? '').split('·').pop().trim();
	if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {
		console.error(`\n⛔ Из цели «${art.target}» не читается репозиторий вида владелец/имя.`);
		return 1;
	}
	const { title, body } = splitIssue(text);
	if (!title) {
		console.error('\n⛔ В теле нет заголовка (первая непустая строка).');
		return 1;
	}

	if (!apply) {
		console.log('\n── СУХОЙ ПРОГОН, ничего не отправлено ──');
		console.log(`gh issue create --repo ${repo} --title <заголовок> --body-file <тело>`);
		console.log(`заголовок: ${title}`);
		console.log(`тело: ${body.length} знаков`);
		console.log('\nОтправить по-настоящему: добавьте --apply');
		return 0;
	}

	// ⚠️ Текст едет ФАЙЛОМ (`--body-file`), а не аргументом: кириллица в аргументе командной
	// строки на Windows портится ещё до того, как её увидит программа (канон «Гигиена текста»).
	const r = spawnSync(
		'gh',
		['issue', 'create', '--repo', repo, '--title', title, '--body-file', art.absolute],
		{ stdio: 'inherit', shell: true },
	);
	if (r.status !== 0) {
		console.error(`\n⛔ gh вернул ${r.status} — тикет НЕ заведён.`);
		return 1;
	}
	console.log('\n✅ Отправлено.');
	return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
	process.exit(main());
}
