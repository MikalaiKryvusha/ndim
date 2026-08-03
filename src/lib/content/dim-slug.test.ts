/**
 * ВОРОТА ШАГА 1 ФАЗЫ 5 (`plans/36`): «генератор слагов покрыт тестом на детерминизм и на
 * коллизии (две записи с одним названием дают два разных стабильных адреса)».
 *
 * Почему это ворота, а не «неплохо бы». Адрес публичной страницы — единственное, что нельзя
 * переделать задним числом: его запоминает поисковик, его копируют люди. Слаг, «поехавший»
 * между двумя сборками, означает 5111 битых адресов и потерю всей проделанной работы —
 * тот же класс беды, что мигающие адреса, которых мы избежали в интервью №021.
 *
 * Отдельно проверяется РЕАЛЬНЫЙ срез каталога, а не только придуманные строки: живые названия
 * измерений содержат то, чего не придумаешь за столом (кавычки-ёлочки, двоеточия, цифры, эмодзи,
 * смешанные языки).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { slugify, TAIL_LENGTH } from './dim-slug.ts';
import slice from './dims-slice.json' with { type: 'json' };

/** Адрес обязан состоять только из того, что переживает копирование в мессенджер и почту. */
const URL_SAFE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// ── ДЕТЕРМИНИЗМ ────────────────────────────────────────────────────────────────────────────

test('один и тот же документ даёт один и тот же адрес — сколько ни зови', () => {
  const first = slugify('Battlefield 3', 'ucvGE98oQqLmN3xZ');

  for (let i = 0; i < 100; i += 1) {
    assert.equal(slugify('Battlefield 3', 'ucvGE98oQqLmN3xZ'), first);
  }
});

test('адрес не зависит от порядка обхода каталога — сборка не меняет его местом записи', () => {
  const dims = slice as readonly { id: string; title: { ru: string; en: string } }[];
  const direct = dims.map((d) => slugify(d.title.en || d.title.ru, d.id));
  const reversed = [...dims].reverse().map((d) => slugify(d.title.en || d.title.ru, d.id));

  assert.deepEqual(reversed.reverse(), direct);
});

test('примеры из плана 36 воспроизводятся дословно', () => {
  // `plans/36`, шаг 1: «Идеальный незнакомец» → idealnyy-neznakomets, «Battlefield 3» → battlefield-3.
  assert.match(slugify('Идеальный незнакомец', 'AbCdEfGh1234'), /^idealnyy-neznakomets-abcdefgh$/);
  assert.match(slugify('Battlefield 3', 'ucvGE98oQqLm'), /^battlefield-3-ucvge98o$/);
});

// ── КОЛЛИЗИИ ───────────────────────────────────────────────────────────────────────────────

test('две записи с ОДНИМ названием дают два РАЗНЫХ адреса', () => {
  // В каталоге есть одноимённые произведения разных лет — это не гипотеза, а свойство культуры:
  // «Дюна» 1984 и «Дюна» 2021 существуют обе.
  const a = slugify('Дюна', 'aaaaaaaaXXXX');
  const b = slugify('Дюна', 'bbbbbbbbYYYY');

  assert.notEqual(a, b);
  assert.equal(a, 'dyuna-aaaaaaaa');
  assert.equal(b, 'dyuna-bbbbbbbb');
});

test('и эти два адреса СТАБИЛЬНЫ: повтор даёт то же самое', () => {
  assert.equal(slugify('Дюна', 'aaaaaaaaXXXX'), slugify('Дюна', 'aaaaaaaaXXXX'));
  assert.equal(slugify('Дюна', 'bbbbbbbbYYYY'), slugify('Дюна', 'bbbbbbbbYYYY'));
});

test('на РЕАЛЬНОМ срезе каталога коллизий ноль', () => {
  const dims = slice as readonly { id: string; title: { ru: string; en: string } }[];
  const seen = new Map<string, string>();

  for (const d of dims) {
    const slug = slugify(d.title.en || d.title.ru, d.id);
    assert.equal(
      seen.has(slug),
      false,
      `коллизия «${slug}»: ${seen.get(slug)} и ${d.id} — одна страница молча съела другую`,
    );
    seen.set(slug, d.id);
  }

  assert.equal(seen.size, dims.length);
});

// ── ФОРМА АДРЕСА ───────────────────────────────────────────────────────────────────────────

test('на реальном срезе каждый адрес безопасен для URL', () => {
  const dims = slice as readonly { id: string; title: { ru: string; en: string } }[];

  for (const d of dims) {
    const slug = slugify(d.title.en || d.title.ru, d.id);
    assert.match(slug, URL_SAFE, `адрес «${slug}» придётся кодировать процентами — это не адрес`);
    assert.equal(slug, encodeURIComponent(slug), `адрес «${slug}» меняется при кодировании`);
  }
});

test('кириллица транслитерируется, а не выпадает', () => {
  assert.equal(slugify('Мастер и Маргарита', 'zzzzzzzz'), 'master-i-margarita-zzzzzzzz');
  assert.equal(slugify('Ёжик в тумане', 'zzzzzzzz'), 'ezhik-v-tumane-zzzzzzzz');
  assert.equal(slugify('Щелкунчик', 'zzzzzzzz'), 'schelkunchik-zzzzzzzz');
});

test('знаки препинания и кавычки-ёлочки не оставляют двойных разделителей', () => {
  assert.equal(slugify('«Титаник»: 3D — версия!', 'zzzzzzzz'), 'titanik-3d-versiya-zzzzzzzz');
  assert.equal(slugify('  пробелы   вокруг  ', 'zzzzzzzz'), 'probely-vokrug-zzzzzzzz');
});

test('название, состоящее ТОЛЬКО из непереводимого, всё равно даёт адрес', () => {
  // Мягкий знак транслитерируется в пустоту, эмодзи выпадает — читаемой части не остаётся.
  // Страница обязана существовать всё равно: правило владельца — адрес есть у ВСЕХ 5111.
  assert.equal(slugify('ь', 'qwertyui'), 'qwertyui');
  assert.equal(slugify('🎬', 'qwertyui'), 'qwertyui');
  assert.equal(slugify('', 'qwertyui'), 'qwertyui');
  assert.equal(slugify(null, 'qwertyui'), 'qwertyui');
  assert.equal(slugify(undefined, 'qwertyui'), 'qwertyui');
});

test('длинное название обрезается, но хвост идентификатора остаётся ВСЕГДА', () => {
  const long = 'Очень длинное название произведения которое не помещается в разумный адрес совсем';
  const slug = slugify(long, 'tailtail');

  assert.match(slug, URL_SAFE);
  assert.equal(slug.endsWith('-tailtail'), true, 'без хвоста адрес перестаёт быть уникальным');
});

test('обрезка, попавшая ТОЧНО на разделитель, не рождает двойного дефиса', () => {
  // 🔴 Случай построен, а не выдуман: длина читаемой части — 60 знаков, и здесь 60-й знак это
  // ровно пробел между словами. Без обрезки хвостового дефиса адрес стал бы «…ffff--tailtail».
  // Первая редакция этого теста брала произвольную длинную фразу и мутацию НЕ ловила —
  // разрез просто не попадал на пробел (`TESTING_FRAMEWORK`: зелёный тест без мутации ничего
  // не доказывает).
  const title = 'aaaaaaaaaa bbbbbbbbbb cccccccccc dddddddddd eeeeeeeeee ffff gg';
  assert.equal(title[59], ' ', 'случай построен неверно — 60-й знак обязан быть разделителем');

  const slug = slugify(title, 'tailtail');

  assert.doesNotMatch(slug, /--/, 'обрезка оставила дефис — получился двойной разделитель');
  assert.match(slug, URL_SAFE);
  assert.equal(slug, 'aaaaaaaaaa-bbbbbbbbbb-cccccccccc-dddddddddd-eeeeeeeeee-ffff-tailtail');
});

test('хвост берётся из идентификатора и приводится к нижнему регистру', () => {
  const slug = slugify('Test', 'AbCdEfGhIjKl');

  assert.equal(slug, `test-${'AbCdEfGh'.toLowerCase()}`);
  assert.equal(slug.slice(-TAIL_LENGTH), 'abcdefgh');
});
