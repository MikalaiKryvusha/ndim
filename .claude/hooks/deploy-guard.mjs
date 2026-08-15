#!/usr/bin/env node
/**
 * ХУК-СТРАЖ ВЫКАТА — ловит попытку выкатить прод мимо единственной двери.
 *
 * Заведён 2026-08-15 по прямому требованию владельца: «во все каноны и инструкции это запиши,
 * В ХУКИ, В КОД, во что хочешь, ВЕЗДЕ». Причина — в тот день агент трижды выкатил прод командой
 * `firebase deploy` руками и ни разу не проверил результат под сессией; в бою лежало
 * неработающее приложение, и нашёл это владелец, а не приборы (`bugs/124`).
 *
 * Правило в документе сессия нарушает. Здесь оно исполняется машиной: хук читает команду,
 * которую агент собирается запустить, и БЛОКИРУЕТ голый `firebase deploy`, называя замену —
 * `npm run deploy` (`tools/deploy.mjs`), который собирает начисто, проверяет целостность сборки,
 * выкатывает и обязательно гоняет смоук под сессией.
 *
 * Контракт хука PreToolUse Claude Code: решение возвращается в stdout как JSON
 * `{ hookSpecificOutput: { hookEventName, permissionDecision, permissionDecisionReason } }`.
 * `deny` останавливает вызов и отдаёт агенту причину.
 */
import { readFileSync } from 'node:fs';

/**
 * ВЕСЬ ВЕРДИКТ ОДНОЙ ФУНКЦИЕЙ — чтобы самопроверка ниже судила ТЕМ ЖЕ кодом, что рабочий путь.
 * Две копии правила разъехались бы, и самопроверка стала бы зелёной ширмой.
 *
 * 🔑 СТРАЖ СУДИТ КОМАНДУ, А НЕ ДАННЫЕ, КОТОРЫЕ ОНА НЕСЁТ (поправка 2026-08-16).
 *
 * Первая редакция искала `firebase deploy` во ВСЁМ тексте вызова — и заблокировала обычный
 * `git commit`, потому что эти два слова встретились в СООБЩЕНИИ коммита о выкате. Класс дефекта
 * известен: текстовое правило, срабатывающее на прозу. Цена как раз та, что делает стражей
 * ненавистными, — он мешает работе, ничего не защищая, и следующая сессия учится его обходить.
 *
 * Лечение: перед проверкой вырезаются ТЕЛА данных — heredoc (`<<'EOF' … EOF`) и строки после
 * `-m`/`-F`. То, что осталось, и есть исполняемая часть. Дыры это не открывает: команда,
 * дописанная ПОСЛЕ heredoc (`git commit <<EOF … EOF; firebase deploy`), в остаток попадает —
 * и это проверяется случаем 5 самопроверки.
 */
function decide(command) {
	const executablePart = String(command)
		// heredoc любой метки: от `<<МЕТКА` до строки с той же меткой
		.replace(/<<-?\s*'?"?([A-Za-z_][A-Za-z0-9_]*)'?"?[\s\S]*?^\s*\1\s*$/gm, ' <heredoc> ')
		// сообщения в кавычках после -m/-F
		.replace(/(^|\s)-[mF]\s+(['"])[\s\S]*?\2/g, '$1-m <сообщение>');

	// Пропускаем сам `tools/deploy.mjs` — он и есть законная дверь, а внутри зовёт firebase deploy.
	const isTheDoor = /npm run deploy|tools[\\/]deploy\.mjs/.test(executablePart);
	const isRawDeploy = /firebase\s+deploy/.test(executablePart);

	/*
	 * СТЕЙДЖ — ВТОРОЙ КОНТУР, и запрет его не касается (`plans/53`).
	 *
	 * Хук стережёт БОЙ: цена его правила — неработающее приложение у живых людей. У стейджа этой
	 * цены нет по устройству — там нет ни людей, ни их данных, он и существует, чтобы ломаться.
	 *
	 * 🔑 Признак стейджа — ЯВНО НАЗВАННЫЙ чужой проект или его конфиг. Умолчание не считается:
	 * команда без `--project` целится туда, куда смотрит CLI, а это состояние машины, а не
	 * намерение агента. Послабление получает только тот, кто написал контур своими руками.
	 */
	const isStageDeploy =
		/--project[\s=]+ndim-stage\b/.test(executablePart) ||
		/--config[\s=]+firebase\.stage\.json\b/.test(executablePart);

	return { deny: isRawDeploy && !isTheDoor && !isStageDeploy };
}

/**
 * САМОПРОВЕРКА: `node .claude/hooks/deploy-guard.mjs --selftest`
 *
 * Живёт в самом страже, потому что доказательство, оставшееся в чате, умирает вместе с сессией.
 * Случаи подобраны по обеим сторонам: страж обязан НЕ ловить прозу и обязан ЛОВИТЬ вызов,
 * дописанный после неё, — иначе поправка про «команду, а не данные» была бы дырой.
 */
if (process.argv.includes('--selftest')) {
	const cases = [
		["git commit -F- <<'EOF'\nfeat: правила катает дверь\n\nГолый firebase deploy запрещён хуком.\nEOF", false, 'проза в сообщении коммита'],
		['firebase deploy --only hosting --project ndim-space', true, 'голый выкат в бой'],
		['npm run deploy', false, 'законная дверь'],
		['firebase deploy --config firebase.stage.json --project ndim-stage --only hosting', false, 'стейдж'],
		["git commit -F- <<'EOF'\nтекст\nEOF\nfirebase deploy --only hosting --project ndim-space", true, 'вызов ПОСЛЕ heredoc'],
		['git commit -m "docs: про firebase deploy в каноне"', false, 'проза в -m'],
	];
	let bad = 0;
	for (const [command, mustDeny, label] of cases) {
		const denied = decide(command).deny;
		const ok = denied === mustDeny;
		if (!ok) bad += 1;
		console.log(`  ${ok ? '✅' : '❌'} ${label}: ${denied ? 'ЗАПРЕЩЕНО' : 'пропущено'}`);
	}
	console.log(`\nпроверок ${cases.length} · провалов ${bad}`);
	process.exit(bad === 0 ? 0 : 1);
}

let input = '';
try {
  input = readFileSync(0, 'utf8');
} catch {
  process.exit(0); // нет stdin — не наше дело
}

let event;
try {
  event = JSON.parse(input);
} catch {
  process.exit(0);
}

const command = String(event?.tool_input?.command ?? '');

if (decide(command).deny) {
  const reason = [
    '🔴 Голый `firebase deploy` запрещён на этом проекте.',
    'Единственная дверь в бой — `npm run deploy` (tools/deploy.mjs): она собирает НАЧИСТО,',
    'проверяет, что во всей сборке ровно один `__sveltekit_<хеш>` (смесь сборок роняет',
    'приложение у всех — bugs/124), выкатывает и ОБЯЗАТЕЛЬНО гоняет смоук ПОД СЕССИЕЙ',
    '(verify-prod-signed-in). Слово владельца 2026-08-15: «деплой без тестирования это',
    'пердёж в лужу, а не работа». Канон — AGENT_GUIDE.md → «ВЫКАТ В БОЙ».',
  ].join(' ');
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    }),
  );
  process.exit(0);
}

process.exit(0);
