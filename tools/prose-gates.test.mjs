/**
 * ЮНИТЫ ВОРОТ ПРОЗЫ — английская сторона (`tools/lib/prose-gates.mjs`, П5 `plans/70`).
 *
 * 🔴 ОБРАЗЦЫ ЗДЕСЬ АНГЛИЙСКИЕ, И ЭТО НЕ ВЫБОР УДОБСТВА, А ЗЕРКАЛО СВЕЖЕГО КАНОНА.
 * `AGENT_GUIDE.md` → «САМОТЕСТ РУССКОЙ ПРОВЕРКИ ИДЁТ НА РУССКОМ ОБРАЗЦЕ»: проверка языка X
 * обязана нести самотест на образцах языка X, иначе целый класс дефектов не ловится вовсе.
 * Здесь проверка английская — значит и образцы английские, взятые из НАСТОЯЩИХ карточек.
 *
 * 🔑 НИ ОДИН ОБРАЗЕЦ НЕ ВЫДУМАН. ⛔-строки взяты из состояния партий на коммите `dadd669` —
 * ровно тех карточек, которые владелец вернул замечаниями 2026-08-21; ✅-строки — из тех же
 * карточек после правки. Пары дословно совпадают с контрактом ворот мастерской (Дизайнер,
 * `58db9b1`, §2 и §3), а границы — с его же разделами «где правило НЕ действует».
 *
 * ЧЕТЫРЕ СЛОЯ ПРОВЕРКИ, и каждый ловит своё:
 *   1. ⛔-пары контракта — ворота ОБЯЗАНЫ краснеть;
 *   2. ✅-пары и границы — ворота ОБЯЗАНЫ молчать (ложный отказ дороже пропуска: он запрещает
 *      писать так, как пишет владелец);
 *   3. регрессия отклонённой редакции — строки живого каталога, на которых краснела короткая
 *      формулировка «be + причастие + by + деятель». Они стоят здесь навсегда: вернуть ту
 *      редакцию, не уронив этот файл, теперь нельзя;
 *   4. корпусный контроль — вся калибровка целиком, как утверждение. Ворота молчат на 389
 *      живых текстах владельца и краснеют на возвращённых карточках.
 *
 * Прогон: node --test tools/prose-gates.test.mjs   ·   npm run test:tools
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

import {
  splitPredicate, splitPredicateNotes, genreAttribution, splitSentences,
  proseProblems, proseNotes,
} from './lib/prose-gates.mjs';
import { sentenceCount } from './check-candidate-descriptions.mjs';
import { текстыПартии, предложенияКаталога } from './measure-prose-gates.mjs';

// ── 1. ⛔-ПАРЫ КОНТРАКТА: ворота обязаны краснеть ───────────────────────────────────────────

const РАСЩЕПЛЁННОЕ_НАРУШЕНИЕ = [
  'Production was carried out by Mattel Films, Escape Artists and Metro-Goldwyn-Mayer, with Todd Black credited as producer.',
  'Production was handled by Warner Bros. and The Cannon Group, with Menahem Golan credited as producer.',
  'The production was undertaken by Raimi Productions.',
  'The production was mounted by Working Title Films, Lord Miller Productions and Amazon MGM Studios.',
  'The production was carried by the companies Les Films Pelléas, Arte France Cinéma and Bidibul Productions.',
  'Todd Lieberman served as producer, and the production was carried out by CJ ENM Studios.',
];

test('расщеплённое сказуемое: каждая ⛔-строка контракта отвергается', () => {
  for (const s of РАСЩЕПЛЁННОЕ_НАРУШЕНИЕ) {
    assert.ok(splitPredicate(s).length >= 1, `не отвергнута ⛔-строка: «${s.slice(0, 60)}…»`);
  }
});

const ОТНЕСЕНИЕ_НАРУШЕНИЕ = [
  'A 2025 supernatural horror directed by Curry Barker. By genre the film belongs to supernatural horror, a strain in which the source of the threat lies outside rational explanation.',
  'A 1986 American film written by Sylvester Stallone. The picture is at once an action film, a thriller and a crime film.',
  'A 2024 feature written and directed by Kaouther Ben Hania. It is at once a drama and a documentary drama, since its source material consists of authentic recordings.',
  'An animated feature film dated 2026, directed by Kyle Balda and combining the traits of a mystery film, a comedy, a family picture and an adventure film.',
];

test('отнесение к жанру: каждая ⛔-строка контракта отвергается', () => {
  for (const s of ОТНЕСЕНИЕ_НАРУШЕНИЕ) {
    assert.ok(genreAttribution(s).length >= 1, `не отвергнута ⛔-строка: «${s.slice(0, 60)}…»`);
  }
});

test('отнесение: `combining the traits of` ловится и в ПЕРВОМ предложении', () => {
  // Безусловный оборот работу первого называния не делает никогда — замер дал 0 таких
  // вхождений во всех живых текстах владельца, поэтому положение в тексте роли не играет.
  const s = 'An animated feature film dated 2026, combining the traits of a mystery film and a comedy.';
  assert.equal(splitSentences(s).length, 1);
  assert.equal(genreAttribution(s).length, 1);
});

// ── 2. ✅-ПАРЫ И ГРАНИЦЫ: ворота обязаны молчать ────────────────────────────────────────────

const ЧИСТО = [
  // ✅-половины тех же пар контракта.
  'Mattel Films, Escape Artists and Metro-Goldwyn-Mayer produced, with Todd Black as producer.',
  'Warner Bros. and The Cannon Group produced it.',
  'Raimi Productions made the film, and the score is by Danny Elfman.',
  'CJ ENM Studios and Moho Film produced the film.',
  'A 2025 supernatural horror: Curry Barker wrote the screenplay, directed and cut it himself.',
  'An animated detective story for family viewing, 2026, directed by Kyle Balda.',
  // §2 граница 1 — безличный оборот БЕЗ деятеля: так пишет сам владелец.
  'In antiquity trade was carried on at markets such as the agoras of Greece and the forums of Rome.',
  'Modding is often carried out within communities of players.',
  // §2 граница 3 — омоним: «вывезли из страны», а не служебный оборот.
  'The accumulated footage was carried out of the country by a courier.',
  // §3 граница 2 — «belongs to» не о жанре вовсе.
  'A separate line belongs to Julia, Beckett childhood friend.',
  'Everything is shown strictly from their side, with the way of reasoning that belongs to sheep.',
];

test('чистые строки и границы контракта не вызывают ни одного отказа', () => {
  for (const s of ЧИСТО) {
    assert.deepEqual(proseProblems(s), [], `ложный отказ на чистой строке: «${s.slice(0, 70)}…»`);
  }
});

test('первое называние жанра — не отнесение', () => {
  // Жанр назван первым предложением и больше не повторяется: ровно то, что предписывает README.
  const s = 'A 2025 supernatural horror: Curry Barker wrote the screenplay. Bear works in a music shop and has long loved his colleague.';
  assert.deepEqual(genreAttribution(s), []);
});

test('голое `belongs to` без ТАВТОЛОГИИ не судится', () => {
  // Жанр в предложении есть, но раньше он назван не был — значит это называние, а не повтор.
  const s = 'Bear works in a music shop. The story belongs to horror in its second half.';
  assert.deepEqual(genreAttribution(s), []);
});

test('голое `belongs to` ПРИ тавтологии отвергается', () => {
  const s = 'A 2025 supernatural horror directed by Curry Barker. The film belongs to supernatural horror.';
  const h = genreAttribution(s);
  assert.equal(h.length, 1);
  assert.equal(h[0].жанр, 'horror');
});

// ── 3. РЕГРЕССИЯ ОТКЛОНЁННОЙ РЕДАКЦИИ ──────────────────────────────────────────────────────

/**
 * Строки живого каталога, на которых краснела короткая формулировка контракта
 * «be + причастие + by + НАЗВАННЫЙ деятель». Все девять — законная сюжетная проза владельца.
 * Файл не даст вернуть ту редакцию молча.
 */
const ЖИВАЯ_ПРОЗА_ВЛАДЕЛЬЦА = [
  'He is aided by American envoy George Washington Williams.',
  'From a young age, Frank was trained by Master Senzo Tanaka, becoming the only non-Asian disciple.',
  'Determined to return the child to his people, Manny and Sid are joined by Diego, a saber-toothed tiger.',
  'A unique aspect of the film is that the thoughts of baby Mikey are voiced by Bruce Willis.',
  'Road House premiered at South by Southwest and was released by Amazon MGM Studios via Prime Video.',
  'Princess Leia obtains the plans for the Death Star but is captured by Darth Vader.',
  'The team is trained by Master Wu, who teaches them the art of Spinjitzu.',
  'The main characters are voiced by Sergey Burunov and Garik Kharlamov.',
];

test('регрессия: отклонённая короткая формулировка не возвращается молча', () => {
  for (const s of ЖИВАЯ_ПРОЗА_ВЛАДЕЛЬЦА) {
    assert.deepEqual(splitPredicate(s), [], `ворота краснеют на прозе владельца: «${s.slice(0, 70)}…»`);
  }
});

// ── 4. РАЗБИВКА НА ПРЕДЛОЖЕНИЯ: пара «истина ↔ зеркало» ────────────────────────────────────

test('число кусков разбивки совпадает со счётом приёмки описаний', () => {
  // Два прибора считают одно и то же разными путями; разъехавшись, они молча дадут разный
  // вердикт на одном тексте. Словарь сокращений у них ОБЩИЙ — здесь проверяется, что и
  // правило его применения общее.
  const тексты = [
    'One. Two! Three? Four.',
    'Richard E. Grant plays the lead.',
    'The score is by J. K. Simmons and Paul W. S. Anderson.',
    'Warner Bros. produced it. Filming ran through 2024.',
    'A text without a final period',
    '',
  ];
  for (const t of тексты) {
    assert.equal(splitSentences(t).length, sentenceCount(t), `разошлись на «${t}»`);
  }
});

test('имя с инициалом не рвётся на предложения', () => {
  assert.deepEqual(splitSentences('Richard E. Grant plays the lead.'), ['Richard E. Grant plays the lead.']);
});

// ── 5. ЯЗЫК: русскую правку английским списком не судят ────────────────────────────────────

test('для не-английского языка ворота молчат, а не выдумывают вердикт', () => {
  const ru = 'Производство осуществлено компанией Amblin Entertainment. Картина принадлежит драматическому кинематографу.';
  assert.deepEqual(splitPredicate(ru, 'ru'), []);
  assert.deepEqual(genreAttribution(ru, 'ru'), []);
  assert.deepEqual(proseProblems(ru, 'ru'), []);
  assert.deepEqual(proseNotes(ru, 'ru'), []);
});

// ── 6. АРТЕФАКТНОЕ ПОДЛЕЖАЩЕЕ — ЗАМЕЧАНИЕ, А НЕ ОТКАЗ ──────────────────────────────────────

test('`the score was composed by` предъявляется замечанием и не краснеет', () => {
  const s = 'The score was composed by John Williams, whose work with Spielberg goes back to the 1970s.';
  assert.deepEqual(splitPredicate(s), [], 'артефактное подлежащее не должно быть отказом');
  assert.equal(splitPredicateNotes(s).length, 1);
  assert.deepEqual(proseProblems(s), []);
  assert.equal(proseNotes(s).length, 1);
});

// ── 7. КОРПУСНЫЙ КОНТРОЛЬ — калибровка целиком, как утверждение ────────────────────────────

const ПАРТИИ = [
  'candidates/batches/01_2026_films.json',
  'candidates/batches/02_2026_films_and_games.json',
  'candidates/batches/03_2026_films_and_games.json',
];
const отказовПо = (корпус) =>
  корпус.reduce((n, r) => n + splitPredicate(r.text).length + genreAttribution(r.text).length, 0);

test('корпус A — срез живого каталога: ни одного отказа', () => {
  const срез = JSON.parse(readFileSync('src/lib/content/dims-slice.json', 'utf8'))
    .filter((x) => x && x.description && x.description.en)
    .map((x) => ({ id: x.slug, text: x.description.en }));
  assert.ok(срез.length >= 50, `корпус усох до ${срез.length} — проверять нечем`);
  assert.equal(отказовПо(срез), 0);
});

test('корпус B — 309 настоящих предложений каталога: ни одного отказа', () => {
  const предл = предложенияКаталога(readFileSync('researches/34_en_boilerplate_candidates.md', 'utf8'));
  assert.ok(предл.length >= 300, `корпус усох до ${предл.length} — проверять нечем`);
  assert.equal(отказовПо(предл), 0);
});

test('корпус C — наши партии ПОСЛЕ правки: ни одного отказа', () => {
  const наши = ПАРТИИ.flatMap((f) => текстыПартии(readFileSync(f, 'utf8')));
  assert.equal(наши.length, 30);
  assert.equal(отказовПо(наши), 0);
});

test('корпус D — что владелец ВЕРНУЛ: ворота краснеют, и это их работа', () => {
  // Ноль здесь означал бы, что ворота не работают вовсе, — поэтому проверка стоит с обеих сторон.
  const вернул = ПАРТИИ.slice(1).flatMap((f) =>
    текстыПартии(execFileSync('git', ['show', `dadd669:${f}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })));
  assert.equal(вернул.length, 20, 'корпус D не собрался — это отказ проверяющего, а не зелёный');
  assert.equal(вернул.filter((r) => splitPredicate(r.text).length).length, 7);
  assert.equal(вернул.filter((r) => genreAttribution(r.text).length).length, 4);
});
