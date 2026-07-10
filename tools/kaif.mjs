#!/usr/bin/env node
// kaif.mjs — бэкенд npm-хендлов kaif:*.
//
// Разделение ответственности (KISS): механическое делает скрипт, суждение — агент.
//   version / check  — чистая механика, выполняется здесь.
//   update / fork / switch-origin / remove — требуют трёхстороннего мёрджа, подтверждений
//   и решений владельца. Скрипт не имитирует эту работу, а направляет к нужному скиллу KAIF.

import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const MARKER = '.kaif/kaif.json';

const readMarker = () => {
  if (!existsSync(MARKER)) {
    console.error(`✖ ${MARKER} не найден — KAIF здесь не развёрнут (или маркер потерян).`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(MARKER, 'utf8'));
};

/** Скиллы делают то, что нельзя делать вслепую: мёрдж, подтверждения, необратимые действия. */
const delegateToSkill = (skill, why) => {
  const m = readMarker();
  console.log(`Эту операцию выполняет скилл KAIF, а не скрипт.\n`);
  console.log(`  Причина: ${why}\n`);
  console.log(`  Запусти в агенте:  /${skill}\n`);
  console.log(`Текущее развёртывание: KAIF v${m.version} · tracking: ${m.tracking}` +
    (m.origin ? ` · origin: ${m.origin}` : ''));
};

const commands = {
  version() {
    const m = readMarker();
    console.log(`KAIF v${m.version}  (релиз ${m.released})`);
    console.log(`  развёрнут:   ${m.deployed ?? '—'}`);
    console.log(`  отслеживание: ${m.tracking}${m.origin ? ` → ${m.origin}` : ''}`);
    console.log(`  сфера:       ${m.sphere}`);
    console.log(`  агент:       ${m.agent}`);
    console.log(`  язык:        ${m.language ?? '—'}`);
    console.log(`\nПроверить, есть ли новее: /kaif-version  ·  сверить ядро: node tools/02-kaif-fetch.mjs`);
  },

  check() {
    // Валидатор — отдельный скрипт, чтобы его можно было гонять и вне npm.
    const r = spawnSync(process.execPath, ['tools/03-kaif-verify.mjs'], { stdio: 'inherit' });
    process.exit(r.status ?? 1);
  },

  update: () => delegateToSkill('kaif-update',
    'нужен аккуратный трёхсторонний мёрдж: доработки этого проекта нельзя потерять при обновлении'),

  fork: () => delegateToSkill('kaif-fork',
    'создаётся новый GitHub-репозиторий — внешнее действие, требующее подтверждения владельца'),

  'switch-origin': () => delegateToSkill('kaif-switch-origin',
    'смена родословной фреймворка — решение владельца, плюс бережная миграция'),

  remove: () => delegateToSkill('kaif-remove',
    'удаление разрушительно; режим (частичное/полное) владелец обязан назвать явно'),

  'remove-all': () => delegateToSkill('kaif-remove',
    'полное удаление разрушительно; скилл обязан переспросить владельца прежде, чем стирать артефакты'),
};

const cmd = process.argv[2];
if (!cmd || !commands[cmd]) {
  console.error(`Использование: node tools/kaif.mjs <${Object.keys(commands).join('|')}>`);
  process.exit(1);
}
commands[cmd]();
