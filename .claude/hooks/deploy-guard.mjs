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

// Пропускаем сам `tools/deploy.mjs` — он и есть законная дверь, а внутри зовёт firebase deploy.
const isTheDoor = /npm run deploy|tools[\\/]deploy\.mjs/.test(command);
const isRawDeploy = /firebase\s+deploy/.test(command);

if (isRawDeploy && !isTheDoor) {
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
