#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { checkBatch } from '../../tools/check-candidate-russian.mjs';

try {
  const event = JSON.parse(readFileSync(0, 'utf8') || '{}');
  const file = event.tool_input?.file_path ?? event.tool_input?.path ?? '';
  const normalized = String(file).replace(/\\/g, '/');
  if (!/\/candidates\/batches\/[^/]+\.json$/i.test(normalized) || !existsSync(file)) process.exit(0);
  const result = checkBatch(file);
  if (result.errors.length || result.notes.length) {
    const lines = [...result.errors.map((x) => `ОШИБКА ${x}`), ...result.notes.map((x) => `ПРОВЕРИТЬ ${x}`)];
    process.stdout.write(JSON.stringify({ hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext: `ru-candidate-text-check · ${file}\n${lines.slice(0, 12).join('\n')}\nПравила: candidates/RUSSIAN_STYLE.md. Перед выгрузкой исправь ошибки и прочитай грамматические подозрения.`,
    } }));
  }
  process.exit(0);
} catch {
  process.exit(0);
}
