/**
 * СТРАЖ «SVELTE СЪЕЛ ПРОБЕЛ» — блок разметки, чьё содержимое начинается пробелом, склеивает слова.
 *
 * Два случая одного класса на одном экране (`src/routes/profile/+page.svelte`):
 *   1. год слипался с названием у `rated-name` — лечение неразрывным пробелом (комментарий там же);
 *   2. 2026-09-25: `{t.account.doneBody[lang]}{#if ratedCount > 0} {t.account.doneKept[lang]}{/if}` — Svelte срезал
 *      ведущий пробел в `{#if}`, и карточка говорила «Аккаунт создан.Ваши оценки…» (кадр прогона
 *      `qa/reports/2026-09-25_newcomer-welcome-truth.md`). Проверки по двум подстрокам текста были зелёными.
 * Суд карточки новичка: «*урок в EXPERIENCE или страж (предпочти страж, если дёшево)*» — дёшево: чтение исходников.
 *
 * Что судится: открывающий тег блока `{#if …}` · `{:else if …}` · `{:else}` · `{#each …}` · `{#key …}`, за которым В ТОЙ ЖЕ
 * строке стоит обычный пробел и затем содержимое. Пробел, который должен дожить до экрана, ставится внутри выражения
 * (`{x ? ` ${y}` : ''}`) или неразрывным `&nbsp;`. Тег читается со счётом фигурных скобок: деструктуризация
 * `{#each list as { a, b } (a.id)}` — один тег, а не два (регулярка по `[^}]*` ошибалась ровно здесь).
 *
 * ⚠️ Граница: судится только начало БЛОКА. Пробел на границе ЭЛЕМЕНТА (случай 1) страж не видит — там лечение
 * неразрывным пробелом уже стоит, а общего правила «пробел у тега элемента» у Svelte нет: внутри текста он живёт.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const OPENERS = ['{#if ', '{:else if ', '{:else}', '{#each ', '{#key '];

/** Места, где тег блока в той же строке сразу продолжен обычным пробелом и содержимым: «строка: текст строки». */
export function blockLeadingSpaces(source: string): number[] {
  const hits: number[] = [];
  for (let i = 0; i < source.length; i++) {
    if (source[i] !== '{' || !OPENERS.some((o) => source.startsWith(o, i))) continue;
    let depth = 0;
    let end = -1;
    for (let j = i; j < source.length; j++) {
      if (source[j] === '{') depth += 1;
      else if (source[j] === '}') {
        depth -= 1;
        if (depth === 0) { end = j; break; }
      } else if (source[j] === '\n' && depth > 0 && j - i > 400) break; // незакрытый тег — не блок разметки
    }
    if (end < 0) continue;
    const after = source.slice(end + 1, end + 3);
    if (after[0] === ' ' && after[1] !== undefined && !/\s/.test(after[1])) {
      hits.push(source.slice(0, end).split('\n').length);
    }
  }
  return hits;
}

test('🔑 КОНТРОЛЬ: ведущий пробел в {#if} ловится — ровно форма дефекта карточки 2026-09-25', () => {
  assert.deepEqual(blockLeadingSpaces('<p>{a}{#if n > 0} {b}{/if}</p>'), [1]);
  assert.deepEqual(blockLeadingSpaces('<p>{a}{:else} текст{/if}</p>'), [1]);
});

test('контроль: деструктуризация в {#each} — один тег; перенос строки и пробел внутри выражения — не дефект', () => {
  assert.deepEqual(blockLeadingSpaces('{#each ranked as { persona: p, r } (p.id)}\n  <li>{p}</li>\n{/each}'), []);
  assert.deepEqual(blockLeadingSpaces('<p>{a}{n > 0 ? ` ${b}` : \'\'}</p>'), []);
  assert.deepEqual(blockLeadingSpaces('{#if x}\n  <b>текст</b>\n{/if}'), []);
  assert.deepEqual(blockLeadingSpaces('{#if x}<span>&nbsp;({y})</span>{/if}'), []);
});

test('🔴 во всех .svelte проекта ни один блок не начинается обычным пробелом перед содержимым', () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const full = join(dir, name);
      return statSync(full).isDirectory() ? walk(full) : [full];
    });
  const found: string[] = [];
  for (const file of walk('src').filter((f) => f.endsWith('.svelte'))) {
    const src = readFileSync(file, 'utf8');
    for (const line of blockLeadingSpaces(src)) found.push(`${file}:${line}: ${src.split('\n')[line - 1].trim().slice(0, 120)}`);
  }
  assert.deepEqual(found, [], `пробел в начале блока Svelte срежет — поставьте его внутрь выражения или &nbsp;:\n${found.join('\n')}`);
});
