#!/usr/bin/env node
/**
 * review-gate.mjs — ГЕЙТ ОТПРАВКИ. Отвечает ровно на один вопрос: можно ли ЭТО отправлять.
 *
 * Инвариант I4 регламента (`owner-reviews`), дословно:
 *   «The gate stands on the SEND side, fail-closed. The sending tool itself reads the decision,
 *    requires `approved` for THIS artifact, re-checks the hash — and refuses non-zero even under
 *    an explicit `--apply` when the decision is missing, `rejected`, or the text drifted.
 *    Any doubt = refusal. A request never self-approves by timeout.»
 *
 * Без этого гейта страница вычитки — украшение: владелец кликает, а агент отправляет что хочет.
 * Гейт делает одобрение МЕХАНИЧЕСКИМ.
 *
 * Проверка живёт не здесь, а в `lib/review-core.mjs` (`checkApproval`) — и её же зовёт отправщик.
 * Две копии проверки разошлись бы молча: это те самые грабли №1, из-за которых в поле гейт
 * отказывал всегда при двух зелёных самотестах.
 *
 *   node tools/review-gate.mjs check <документ.md> <артефакт>
 *   node tools/review-gate.mjs list  <документ.md>
 *
 * Выход: 0 — можно отправлять; 1 — ОТКАЗ (с причиной); 2 — ошибка вызова.
 */

import { existsSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ROOT, artifactsOf, checkApproval, bodyHash } from './lib/review-core.mjs';

function main() {
	const [cmd, doc, id] = process.argv.slice(2);
	if (!cmd || !doc) {
		console.error('Использование: node tools/review-gate.mjs check|list <документ.md> [артефакт]');
		return 2;
	}
	const docPath = resolve(ROOT, doc);

	if (cmd === 'list') {
		if (!existsSync(docPath)) {
			console.error(`Нет документа: ${doc}`);
			return 2;
		}
		const arts = artifactsOf(docPath);
		if (!arts.length) {
			console.log('В документе не объявлено ни одного артефакта на отправку.');
			return 0;
		}
		for (const a of arts) {
			const v = checkApproval(docPath, a.id);
			const hash = a.absolute && existsSync(a.absolute) ? bodyHash(a.absolute).slice(0, 16) : '—';
			console.log(`${v.ok ? '✅' : '⛔'} ${a.id} → ${a.target ?? '—'}  [${hash}…]  ${v.reason}`);
		}
		return 0;
	}

	if (cmd !== 'check') {
		console.error(`Неизвестная команда: ${cmd}`);
		return 2;
	}
	if (!id) {
		console.error('Не назван артефакт. Гейт не одобряет «всё сразу» — только поимённо.');
		return 2;
	}

	const v = checkApproval(docPath, id);
	if (v.ok) {
		console.log(`✅ МОЖНО: ${id} — одобрил ${v.by} (${v.at})`);
		console.log(`   тело: ${relative(ROOT, v.artifact.absolute)}`);
		console.log(`   sha256: ${v.sha256}`);
		return 0;
	}
	console.error(`⛔ ОТКАЗ: ${id} — ${v.reason}`);
	if (v.approved) {
		console.error(`   одобрено было: ${v.approved}`);
		console.error(`   сейчас в файле: ${v.current}`);
	}
	return 1;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
	process.exit(main());
}
