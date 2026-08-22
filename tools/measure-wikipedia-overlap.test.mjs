/**
 * ТЕСТ УБОРКИ БРОШЕННЫХ `*.tmp-<pid>` из кэша прибора сверки с Википедией.
 *
 * 🔴 ПОВОД. Запись в кэш атомарна — во временный файл рядом, затем `rename` (так лечились
 * двенадцать записей из нулевых байтов, `bugs/165`). У атомарности есть осадок: процесс,
 * убитый МЕЖДУ записью и переименованием, оставляет `<ключ>.json.tmp-<pid>` навсегда, и
 * убирать его было некому.
 *
 * 🔴🔴 ГЛАВНЫЙ ТЕСТ ЗДЕСЬ — НЕ «МУСОР УБРАН», А «ЖИВОЕ НЕ ТРОНУТО» (класс `EXP-0131`: гасим
 * только своё и адресно). Прибор параллелится по языкам через один каталог кэша, поэтому в
 * момент уборки у соседа посреди записи законно лежит его собственный живой `tmp-<pid>`.
 * Уборка по маске снесла бы его на середине записи, и сосед упал бы с `ENOENT` при `rename`.
 * Проверка «мусор убран» одна была бы ЗЕЛЁНОЙ и на такой уборке — она не различает эти два
 * поведения вовсе. Различает их только пара, и поэтому оба случая стоят вместе.
 *
 * Живость процесса ВПРЫСКИВАЕТСЯ, а не берётся у системы: тест обязан быть детерминированным,
 * а настоящие pid'ы умирают и переиспользуются между прогонами. Отдельным случаем проверяется,
 * что боевой `pidAlive` вообще умеет отвечать — иначе впрыснутая заглушка проверяла бы саму
 * себя (контроль прибора, `EXP-0082`).
 *
 * ⚠️ Прибор ПОДКЛЮЧАЕТСЯ здесь напрямую, и это законно: у него стоит предохранитель
 * «запустили или подключили» (`runAsScript`), а рабочая часть спрятана за `if (!runAsScript)`.
 * Импорт отдаёт только ядро — сети и файлов он не касается.
 *
 * Прогон: node --test tools/measure-wikipedia-overlap.test.mjs   (или `npm run test:tools`)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { sweepAbandonedTemps, pidAlive, isInsideQuotes, quotedSpans } from './measure-wikipedia-overlap.mjs';

/** Свежий каталог на случай — уборка удаляет файлы, и делить каталог между случаями нельзя. */
function каталог() {
  return mkdtempSync(join(tmpdir(), 'ndim-sweep-'));
}

const МЁРТВЫЙ = 424242;
const ЖИВОЙ = 111111;
/** Впрыснутая живость: «жив» — ровно один названный pid, и никто больше. */
const живость = (pid) => pid === ЖИВОЙ;

test('брошенный временный файл мёртвого процесса убирается', () => {
  const dir = каталог();
  try {
    const мусор = join(dir, `abc.json.tmp-${МЁРТВЫЙ}`);
    writeFileSync(мусор, '{}', 'utf8');

    const { swept, kept } = sweepAbandonedTemps(dir, { alive: живость });

    assert.deepEqual(swept, [`abc.json.tmp-${МЁРТВЫЙ}`], 'убран именно он');
    assert.deepEqual(kept, [], 'ничего лишнего не оставлено');
    assert.equal(existsSync(мусор), false, 'файла на диске больше нет');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('🔴 живой tmp параллельного процесса НЕ убит (EXP-0131)', () => {
  const dir = каталог();
  try {
    const чужой = join(dir, `xyz.json.tmp-${ЖИВОЙ}`);
    const мусор = join(dir, `abc.json.tmp-${МЁРТВЫЙ}`);
    writeFileSync(чужой, 'сосед пишет прямо сейчас', 'utf8');
    writeFileSync(мусор, '{}', 'utf8');

    const { swept, kept } = sweepAbandonedTemps(dir, { alive: живость });

    assert.equal(existsSync(чужой), true, 'файл живого соседа остался на диске');
    assert.deepEqual(kept, [`xyz.json.tmp-${ЖИВОЙ}`], 'и он назван оставленным');
    assert.deepEqual(swept, [`abc.json.tmp-${МЁРТВЫЙ}`], 'а мусор всё равно убран');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('годные записи кэша уборка не трогает вовсе', () => {
  const dir = каталог();
  try {
    // Имена настоящей формы: `<язык>-<sha256>.json`, плюс подозрительно похожее на временное.
    writeFileSync(join(dir, 'ru-deadbeef.json'), '{}', 'utf8');
    writeFileSync(join(dir, 'en-deadbeef.json'), '{}', 'utf8');
    // Ловушка: «tmp» в имени есть, суффикса `.tmp-<цифры>` — нет. Убирать его нельзя.
    writeFileSync(join(dir, 'ru-tmp-notapid.json'), '{}', 'utf8');

    const { swept, kept } = sweepAbandonedTemps(dir, { alive: живость });

    assert.deepEqual(swept, [], 'ни одна годная запись не убрана');
    assert.deepEqual(kept, [], 'и ни одна не сочтена временной');
    assert.equal(readdirSync(dir).length, 3, 'все три файла на месте');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('несуществующий каталог — не ошибка, а «убирать нечего»', () => {
  const { swept, kept } = sweepAbandonedTemps(join(tmpdir(), 'ndim-sweep-нет-такого-каталога'));
  assert.deepEqual(swept, []);
  assert.deepEqual(kept, []);
});

test('контроль прибора: боевой pidAlive отвечает, а не всегда «да»', () => {
  // Свой процесс заведомо жив — иначе тест бы не исполнялся.
  assert.equal(pidAlive(process.pid), true, 'собственный процесс опознан живым');
  /*
   * Заведомо мёртвый pid. Без этой половины заглушка `() => true` прошла бы контроль:
   * «жив» на всё — это ответ, который ничего не проверяет (тот же капкан, что в `EXP-0082`).
   * Номер выбран из верхней части диапазона и в норме никем не занят; если он ВСЁ ЖЕ занят,
   * случай честно пропускается, а не краснеет — иначе тест был бы лотереей.
   */
  const вряд_ли_живой = 4194303;
  const ответ = pidAlive(вряд_ли_живой);
  if (ответ === true) {
    console.log(`  ℹ️ pid ${вряд_ли_живой} на этой машине занят — половина случая пропущена`);
  } else {
    assert.equal(ответ, false, 'незанятый pid опознан мёртвым');
  }
});

/*
 * ═══ РЯД ВНУТРИ КАВЫЧЕК — ПАРНОСТЬ ПРЯМОЙ КАВЫЧКИ ═══
 *
 * 🔴 ПОВОД (замер, а не опасение). Признак «ряд лежит внутри кавычек» извиняет запись: цитату
 * рецензента и название книги переписывать нельзя. Признак был жадной регуляркой с порогом
 * длины ВНУТРИ — и на прямой кавычке, где открывающая и закрывающая один знак, порог ломал
 * разбивку на пары: короткое название («"Alpha Dog"») регулярка пропускала и склеивала пару
 * из его ЗАКРЫВАЮЩЕЙ кавычки с ОТКРЫВАЮЩЕЙ следующего названия. Проза между ними получала
 * индульгенцию. По заданию plans/70 (533 записи): извинялось 23, из них 19 ложно.
 *
 * 🔴🔴 ГЛАВНЫЙ СЛУЧАЙ ЗДЕСЬ — НЕ «ЦИТАТА ОПОЗНАНА», А «ПРОЗА МЕЖДУ ДВУМЯ НАЗВАНИЯМИ НЕ
 * ОПОЗНАНА ЦИТАТОЙ». Проверка «цитата опознана» одна была бы ЗЕЛЁНОЙ и на старой жадной
 * регулярке — она этих двух поведений не различает вовсе. Различает их только пара, поэтому
 * оба случая стоят рядом и порознь не имеют смысла.
 *
 * Тексты здесь — настоящие описания каталога, сокращённые до сути: выдуманный текст доказывал
 * бы выдуманный класс.
 */

test('проза МЕЖДУ двумя названиями в кавычках цитатой НЕ считается', () => {
  const описание =
    '"Alpha Dog" is a 2006 American crime drama film written and directed by Nick Cassavetes. ' +
    'The film is based on the true story of the kidnapping and murder of Nicholas Markowitz in 2000. ' +
    'It centers on Johnny Truelove, a young drug dealer in the "San Gabriel Valley".';
  const ряд = 'is based on the true story of the kidnapping and murder of nicholas markowitz in 2000';

  assert.equal(
    isInsideQuotes(ряд, описание),
    false,
    'заимствование между двумя названиями в кавычках извинено цитатой — ложная пара кавычек',
  );
});

test('настоящая цитата в прямых кавычках опознаётся', () => {
  const описание =
    'Critic Paul Bramhall called the film ' +
    '"A charmless affair devoid of any purpose or entertainment value", and audiences agreed.';
  const ряд = 'a charmless affair devoid of any purpose or entertainment value';

  assert.equal(isInsideQuotes(ряд, описание), true, 'цитата рецензента не опознана');
});

test('парные « » разбираются так же, как прямые кавычки', () => {
  const описание = 'Рецензент назвал ленту «обаятельной и совершенно бессмысленной затеей», и это осталось.';

  assert.equal(isInsideQuotes('обаятельной и совершенно бессмысленной затеей', описание), true);
  assert.equal(isInsideQuotes('Рецензент назвал ленту', описание), false);
});

test('непарная кавычка не извиняет весь остаток описания', () => {
  /*
   * Кавычка здесь ОДНА, и это нарочно: с парой кавычек случай был бы зелёным по НЕВЕРНОЙ
   * причине — короткое название отсеялось бы порогом длины, а отсечение хвоста не
   * проверялось бы вовсе. Поймано мутацией М2, которая на прежней фикстуре не краснела.
   */
  const описание =
    'The film "Wicked was released in 2024 and became the highest grossing Broadway adaptation ever made.';
  const хвост = 'was released in 2024 and became the highest grossing broadway adaptation ever made';

  assert.equal(
    isInsideQuotes(хвост, описание),
    false,
    'хвост после непарной кавычки объявлен цитатой — одна забытая кавычка извиняла бы всё',
  );
});

test('кусок короче порога цитатой не считается — это название, а не цитата', () => {
  const описание = 'The album "Thriller" changed the industry, and "Bad" followed it four years later.';

  assert.deepEqual(
    quotedSpans(описание).filter((s) => s.length < 20),
    [],
    'короткий кусок в кавычках попал в цитаты — названия перестали отсеиваться',
  );
});
