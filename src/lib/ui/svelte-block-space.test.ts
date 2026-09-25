/**
 * СТРАЖ «SVELTE СЪЕЛ ПРОБЕЛ» — пробел на границе блока разметки склеивает слова.
 *
 * @guard svelte-block-space
 * THREAT:         пробел, стоящий у самой границы блока Svelte (`{#if …} текст`, `текст {/if}`), при компиляции
 *                 срезается, и на экране слова слипаются — «Аккаунт создан.Ваши оценки…» (2026-09-25, карточка
 *                 «Добро пожаловать», `qa/reports/2026-09-25_newcomer-welcome-truth.md`); проверки по подстрокам текста
 *                 такое не видят
 * PROVED-AGAINST: мутант «вернуть форму до лечения `{#if ratedCount > 0} {t.account.doneKept[lang]}{/if}`» в
 *                 `src/routes/profile/+page.svelte` — страж красный ровно на :1796 (dev-1 2026-09-25 22:33:31; судья
 *                 карточки повторил); синтетика ниже — каждый вид по отдельности: пробел, два пробела, таб, зеркальный
 *                 пробел перед `{/if}`, теги `{:then}` · `{:catch}` · `{#snippet}`, `}` в строке условия
 * GAP:            перенос строки + текст у границы блока Svelte 5 тоже срезает (судья: 5.56.4), но многострочный блок —
 *                 обычная вёрстка, и почти всегда содержимое начинается элементом — такой случай страж НЕ судит;
 *                 пробел на границе ЭЛЕМЕНТА (случай `rated-name` — год слипался с названием) не судит; судит исходник,
 *                 а не скомпилированный вывод
 * ON-REAL-PATH:   `npm test` в воротах сдачи и в team-ci — на каждом дереве перед заявкой
 *
 * Лечение, если страж краснеет: пробел, который должен дожить до экрана, ставится внутрь выражения
 * (`{x ? ` ${y}` : ''}`) или неразрывным `&nbsp;`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const OPENERS = ['{#if ', '{:else if ', '{:else}', '{#each ', '{#key ', '{#await ', '{:then', '{:catch', '{#snippet '];
const CLOSERS = ['{/if}', '{/each}', '{/key}', '{/await}', '{/snippet}', '{:else', '{:then', '{:catch'];

/** Конец тега, начатого на `{` в позиции `i`: счёт скобок, строки в кавычках пропускаются. `-1` — тег не закрыт. */
function tagEnd(source: string, i: number): number {
  let depth = 0;
  let quote = '';
  for (let j = i; j < source.length && j - i < 2000; j++) {
    const c = source[j];
    if (quote) {
      if (c === '\\') j += 1;
      else if (c === quote) quote = '';
      continue;
    }
    if (c === '"' || c === "'" || c === '`') quote = c;
    else if (c === '{') depth += 1;
    else if (c === '}' && --depth === 0) return j;
  }
  return -1;
}

const lineOf = (source: string, index: number) => source.slice(0, index).split('\n').length;

/** Строки, где у границы блока в той же строке стоит пробел или таб рядом с содержимым. */
export function blockEdgeSpaces(source: string): number[] {
  const hits = new Set<number>();
  for (let i = 0; i < source.length; i++) {
    if (source[i] !== '{') continue;
    if (OPENERS.some((o) => source.startsWith(o, i))) {
      const end = tagEnd(source, i);
      if (end >= 0 && /^[ \t]+\S/.test(source.slice(end + 1).split('\n')[0])) hits.add(lineOf(source, end));
    }
    if (CLOSERS.some((c) => source.startsWith(c, i))) {
      const before = source.slice(0, i).split('\n').at(-1) ?? '';
      if (/\S[ \t]+$/.test(before)) hits.add(lineOf(source, i));
    }
  }
  return [...hits].sort((a, b) => a - b);
}

test('🔑 КОНТРОЛЬ: ведущий пробел в {#if} ловится — ровно форма дефекта карточки 2026-09-25', () => {
  assert.deepEqual(blockEdgeSpaces('<p>{a}{#if n > 0} {b}{/if}</p>'), [1]);
  assert.deepEqual(blockEdgeSpaces('<p>{a}{:else} текст{/if}</p>'), [1]);
});

test('контроль судьи: два пробела, таб, зеркальный пробел перед {/if}, теги {:then} · {:catch} · {#snippet}, `}` в строке', () => {
  assert.deepEqual(blockEdgeSpaces('<p>{a}{#if x}  {b}{/if}</p>'), [1], 'два пробела');
  assert.deepEqual(blockEdgeSpaces('<p>{a}{#if x}\t{b}{/if}</p>'), [1], 'таб');
  assert.deepEqual(blockEdgeSpaces('<p>{#if x}{b} {/if}{a}</p>'), [1], 'зеркальный: пробел перед {/if}');
  assert.deepEqual(blockEdgeSpaces('{#await p}…{:then v} {v}{/await}'), [1], '{:then}');
  assert.deepEqual(blockEdgeSpaces('{#await p}{:catch e} {e}{/await}'), [1], '{:catch}');
  assert.deepEqual(blockEdgeSpaces('{#snippet row(x)} {x}{/snippet}'), [1], '{#snippet}');
  assert.deepEqual(blockEdgeSpaces("<p>{#if s === '}'} {b}{/if}</p>"), [1], '`}` в строке условия не сбивает счёт');
});

test('контроль: деструктуризация в {#each}, перенос строки, пробел внутри выражения и &nbsp; — не дефект', () => {
  assert.deepEqual(blockEdgeSpaces('{#each ranked as { persona: p, r } (p.id)}\n  <li>{p}</li>\n{/each}'), []);
  assert.deepEqual(blockEdgeSpaces('<p>{a}{n > 0 ? ` ${b}` : \'\'}</p>'), []);
  assert.deepEqual(blockEdgeSpaces('{#if x}\n  <b>текст</b>\n{/if}'), []);
  assert.deepEqual(blockEdgeSpaces('{#if x}<span>&nbsp;({y})</span>{/if}'), []);
  assert.deepEqual(blockEdgeSpaces('  {:else}\n    <p>т</p>'), []);
});

test('🔴 во всех .svelte проекта у границ блоков нет пробела рядом с содержимым', () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const full = join(dir, name);
      return statSync(full).isDirectory() ? walk(full) : [full];
    });
  const found: string[] = [];
  for (const file of walk('src').filter((f) => f.endsWith('.svelte'))) {
    const src = readFileSync(file, 'utf8');
    for (const line of blockEdgeSpaces(src)) found.push(`${file}:${line}: ${src.split('\n')[line - 1].trim().slice(0, 120)}`);
  }
  assert.deepEqual(found, [], `пробел у границы блока Svelte срежет — поставьте его внутрь выражения или &nbsp;:\n${found.join('\n')}`);
});
