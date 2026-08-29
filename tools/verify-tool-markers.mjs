/**
 * ПЕРЕПИСЬ ПРИБОРОВ ПО МАРКЕРУ В ШАПКЕ — файл говорит о себе сам, имя за него не решает.
 *
 * Запуск: node tools/verify-tool-markers.mjs · перепись: --census · самотест: --selftest
 * Ворота: npm run guards
 * Код возврата: 0 — перепись сходится · 1 — маркер и дерево разошлись.
 *
 * ═══ ЗАЧЕМ ОН СУЩЕСТВУЕТ ═══
 *
 * Смена 9 считала корпус приборов глобом `tools/verify-*.mjs` и ошиблась В ОБЕ СТОРОНЫ разом:
 *
 *   · глоб ВИДИТ лишнее: `verify-status-outlived.test.mjs` — юнит-тест, а не прибор;
 *   · глоб НЕ ВИДИТ своё: воротный `qa-journeys-lint.mjs` под `verify-*` не подходит вовсе.
 *
 * Ошибка вскрылась спором QA с Менеджером («приборов 82» против «80»), то есть ГЛАЗАМИ — а
 * глаза не масштабируются на 255 файлов. Пока классификация живёт в глобе, любой счёт корпуса
 * повторяет `EXP-0194` этажом выше: не «страж вне ворот», а «прибор вне переписи» — числится
 * там, где его нет, и отсутствует там, где он есть.
 *
 * ═══ ГДЕ ИМЯ — ЗАКОН, А ГДЕ ДОГАДКА (граница, ради которой прибор написан) ═══
 *
 * Не всякая классификация по имени порочна, и валить их в кучу было бы ровно той ошибкой, за
 * которую этот прибор ругает глоб. Различие одно и оно проверяемое:
 *
 *   · `*.test.mjs` — имя КОНСТИТУТИВНО: ровно этот глоб стоит в первой записи `guards.mjs`
 *     (`node --test tools/*.test.mjs`). Переименовал файл — он перестал быть юнитом ФАКТИЧЕСКИ,
 *     а не по мнению. Здесь имя не признак, а сам контракт;
 *   · `tools/lib/` — то же: каталог библиотек никто не запускает, его импортируют;
 *   · `verify-*` / `probe-*` / `measure-*` — имя ДОГАДКА. Ни один запускатель этих глобов не
 *     читает, они живут только в головах и в прозе. Догадка и ошиблась дважды.
 *
 * Поэтому перепись читает МАРКЕР В ШАПКЕ, а имя оставляет ровно там, где оно контракт.
 *
 * ═══ ПОЧЕМУ МАРКЕР — «Запуск:» И «Ворота:», А НЕ НОВОЕ ПОЛЕ ═══
 *
 * Соблазн был завести своё поле (`РОД: страж`). Замер до объявления (`EXP-0223`) его снял:
 * `Запуск:` УЖЕ лежит в шапках 168 файлов из 255, `Ворота:` — в трёх, и образец формы,
 * утверждённый QA (`verify-role-env-scope.mjs`), несёт обе строки. Новое поле означало бы 255
 * правок вместо полусотни и вторую норму рядом с живой — то есть будущий разъезд норм.
 * Взято то, что дерево уже говорит о себе само; ново здесь не поле, а ОБЯЗАТЕЛЬНОСТЬ и то,
 * что маркер теперь ЧИТАЮТ.
 *
 * Две строки — две независимые вещи, и путать их нельзя:
 *   `Запуск:` — «меня зовут командой» (я прибор, а не библиотека и не юнит);
 *   `Ворота:` — «я стою вот в этих воротах» ЛИБО «Ворота: нет — <причина>».
 *
 * ⚠️ И требования у них РАЗНЫЕ, намеренно. `Запуск:` обязателен у каждого корневого файла:
 * без него род неизвестен, и перепись возвращается к догадке по имени. `Ворота:` обязателен
 * только там, где ответ имеет цену, — у того, кто в воротах СТОИТ, и у того, кто это
 * ЗАЯВЛЯЕТ. Соблазн был потребовать «Ворота: нет — <причина>» со всех двухсот с лишним; он
 * отвергнут: двести строк обязательного «нет» — это шаблон, а шаблон, который все копируют,
 * перестают читать через месяц. Дыры это не оставляет, потому что обе стороны сверяются:
 * стоит и молчит — красный, заявил и не стоит — красный. Снять стража из состава ворот
 * незаметно нельзя ни в ту, ни в другую сторону.
 *
 * ═══ ГРАНИЦЫ, НАЗВАННЫЕ ЧЕСТНО ═══
 *
 * · Прибор СТАТИЧЕСКИЙ: он читает шапки и состав `guards.mjs`, ничего не запускает.
 * · Он не судит, ПРАВДУ ли говорит маркер о поведении файла (что «Запуск:» назвал верную
 *   команду). Он судит СОГЛАСОВАННОСТЬ маркера с тем, что о файле известно машинно: его место
 *   в дереве и его место в воротах. Ложь в тексте команды ловится прогоном, а не грепом.
 * · Ворота он знает ровно одни — состав `GUARDS` в `tools/guards.mjs`. Тяжёлые двери (выкат,
 *   стенд, эмуляторы) сюда не входят: у них свои списки, и объявлять их здесь значило бы
 *   заводить второй нормативный ответ на один вопрос.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const TOOLS = join(ROOT, 'tools');

/* ── ЧИСТЫЕ ФУНКЦИИ ВЕРДИКТА ───────────────────────────────────────────────────
 *
 * Всё, что судит, вынесено сюда и не касается файловой системы: самотест гоняет их на
 * синтетических случаях. Прибор без самотеста доказывает только сам себя.
 */

/**
 * Шапка файла — ВЕРХНИЙ комментарий, а не первые N строк.
 *
 * 🔑 Разница не косметическая. «Первые 80 строк» затянули бы в шапку начало кода, и строка
 * `Ворота:` из чужого комментария посреди файла зачлась бы как объявление. Маркер обязан
 * стоять там, где его читает человек, открывший файл, — в шапке.
 *
 * ⚠️ Форм шапки в дереве ДВЕ, и это замер, а не допущение: 21 файл начинается не с `/**`, а с
 * `#!/usr/bin/env node` и/или строк `//`. Требовать от них перехода на блочный комментарий
 * значило бы переписать два десятка чужих файлов ради формы — цена без выгоды. Обе формы
 * законны, разбор берёт ту, что стоит наверху; шебанг пропускается.
 */
export function headerOf(source) {
  const lines = source.split(/\r?\n/);
  let i = 0;
  if (lines[0]?.startsWith('#!')) i = 1;
  while (i < lines.length && lines[i].trim() === '') i += 1;

  if (lines[i]?.trimStart().startsWith('/*')) {
    const start = source.indexOf(lines[i]);
    const end = source.indexOf('*/', start);
    return end === -1 ? '' : source.slice(start, end);
  }
  if (lines[i]?.trimStart().startsWith('//')) {
    const block = [];
    while (i < lines.length && lines[i].trimStart().startsWith('//')) {
      block.push(lines[i]);
      i += 1;
    }
    return block.join('\n');
  }
  return '';
}

/**
 * Значение маркера в шапке: то, что стоит после `Запуск:` / `Ворота:`, либо `null`.
 *
 * ⚠️ ФОРМ ЗАПИСИ ДВЕ, И ОБЕ ЗАКОННЫ — это замер, а не уступка:
 *
 *     * Запуск: node tools/x.mjs · самотест: --selftest      ← значение в строке метки
 *     * Запуск:                                              ← метка голая,
 *     *   node tools/x.mjs            # обычный прогон          команды блоком ниже
 *     *   node tools/x.mjs --selftest # без файловой системы
 *
 * Вторая форма живёт у 44 приборов: у кого команд несколько, тот пишет их столбиком, и это
 * читается лучше однострочника. Требовать от них однострочник значило бы переписать сорок
 * четыре чужие шапки против конвенции самого дерева — ровно та ошибка ширины (`EXP-0223`),
 * которую этот прибор уже делал дважды за один заход.
 *
 * 🔴 НО РАЗБОР БЛОЧНОЙ ФОРМЫ ОБЯЗАН БЫТЬ НАМЕРЕННЫМ. Первая редакция получала её ответ
 * СЛУЧАЙНО — `\s*` в образце проглатывал перенос строки, и значение возвращалось вместе с
 * приставкой комментария: `«*   node tools/…»`. Ответ выглядел правдоподобно и потому не
 * выглядел дефектом. Здесь приставка снимается явно, а поиск не выходит за пределы шапки.
 */
export function markerValue(header, label) {
  const lines = header.split(/\r?\n/);
  const strip = (line) => line.replace(/^[^\S\r\n]*(?:\*|\/\/)[^\S\r\n]?/, '');
  for (let i = 0; i < lines.length; i += 1) {
    const hit = strip(lines[i]).match(new RegExp(`^${label}:[^\\S\\r\\n]*(.*)$`));
    if (hit === null) continue;
    if (hit[1].trim()) return hit[1].trim();
    for (let j = i + 1; j < lines.length; j += 1) {
      const next = strip(lines[j]).trim();
      if (next) return next;
    }
    return null;
  }
  return null;
}

/** Оба маркера разом. */
export function markersOf(source) {
  const header = headerOf(source);
  return { run: markerValue(header, 'Запуск'), gate: markerValue(header, 'Ворота') };
}

/**
 * Объявляет ли маркер `Ворота:` членство в воротах?
 *
 * «Ворота: нет — зовётся рукой» это ОТВЕТ, а не членство. Отличать надо по ПЕРВОМУ СЛОВУ, а не
 * по вхождению «нет» куда угодно: причина отказа сама может содержать это слово («сети нет,
 * стенда нет»), и такой признак покрасил бы исправное.
 *
 * ⚠️ Первая редакция была `/^нет\b/i` — и самотест уронил её сразу, на трёх случаях из
 * двадцати одного. `\b` в JS определена через ASCII: между кириллической «т» и пробелом
 * границы НЕ БЫВАЕТ, выражение не совпадает никогда. Это `bugs/193`, класс, ради которого в
 * воротах стоит `verify-cyrillic-word-boundary` — и я написал его заново внутри прибора о
 * слепоте классификации. Поэтому здесь границы слова нет вовсе: первое слово берётся
 * разрезанием, а не образцом.
 */
export function claimsGate(gateMarker) {
  if (gateMarker === null) return false;
  const first = gateMarker.trim().split(/[\s—–-]+/)[0].toLowerCase();
  return first !== 'нет';
}

/**
 * Род файла ПО ТОМУ, ЧТО КОНСТИТУТИВНО, — и только по нему.
 *
 * `юнит` и `библиотека` выводятся из места и имени законно: имя `*.test.mjs` есть сам глоб
 * запускателя, каталог `lib/` — каталог импортируемого. Всё остальное — `корневой`, то есть
 * «род неизвестен машине, обязан быть объявлен маркером».
 */
export function kindOf(relPath) {
  const posix = relPath.split(sep).join('/');
  if (posix.endsWith('.test.mjs')) return 'юнит';
  if (posix.startsWith('lib/') || posix.includes('/lib/')) return 'библиотека';
  return 'корневой';
}

/**
 * 🔴 ОТСРОЧКА — ПОИМЁННО, С ПРИЧИНОЙ И СО СРОКОМ ГОДНОСТИ.
 *
 * Один файл в воротах молчит о себе законно: `verify-role-env.mjs` СНИМАЕТСЯ из состава при
 * мерже порции А (решение эстафеты смены 10 — `verify-role-env-scope.mjs` строго его поглощает
 * и сверх того краснеет на неклассифицированном имени). Править шапку файла, которому осталось
 * жить до мержа, значит добыть один конфликт мержа и ноль защиты.
 *
 * ⚠️ Отсрочка не поблажка, потому что у неё есть смерть: как только названный файл уходит из
 * состава ворот, СТРОКА САМА СТАНОВИТСЯ НАРУШЕНИЕМ («отсрочка пережила свой повод»). Молчаливым
 * вечным исключением она стать не может по построению — ровно та же форма, что `SELF` и
 * `LIVE_BY_NAME` в `verify-probe-mark.mjs`.
 */
export const ОТСРОЧКА = new Map([
  [
    'verify-role-env.mjs',
    'снимается из состава ворот при мерже порции А (эстафета смены 10): verify-role-env-scope.mjs его поглощает',
  ],
]);

/**
 * Вердикт по одному файлу. Возвращает список нарушений (пустой — чисто).
 *
 * @param {{rel: string, kind: string, run: string|null, gate: string|null}} file
 * @param {Set<string>} gateFiles имена файлов, реально стоящих в составе `guards.mjs`
 * @param {Map<string,string>} deferred поимённые отсрочки молчания о воротах
 */
export function judgeFile(file, gateFiles, deferred = ОТСРОЧКА) {
  const faults = [];
  const name = file.rel.split(sep).join('/');
  const inGates = gateFiles.has(name.split('/').pop());

  if (file.kind === 'юнит') {
    /*
     * ⚠️ Первая редакция краснила ЛЮБОЙ «Запуск:» у юнита — и замер её опроверг (`EXP-0223`:
     * ширина правила меряется ДО объявления). Оба живых случая (`genre-depth.test.mjs`,
     * `tag-dims-approval.test.mjs`) пишут `node --test tools/…`, то есть честно называют
     * СВОЙ запускатель. Это не самозванство, а полезная строка.
     * Красным остаётся ровно самозванство: юнит, объявивший себя отдельным прибором.
     */
    if (file.run !== null && !/node\s+--test/.test(file.run)) {
      faults.push(`${name}: юнит-тест объявил себя ОТДЕЛЬНЫМ прибором («Запуск: ${file.run}») — его гоняет node --test глобом, своего пуска у него нет`);
    }
    return faults;
  }

  if (file.kind === 'библиотека') {
    if (file.run !== null) {
      faults.push(`${name}: библиотека объявила себя запускаемой («Запуск:») — либо она прибор и лежит не там, либо маркер лишний`);
    }
    return faults;
  }

  // Корневой файл: род машине неизвестен, «Запуск:» обязателен.
  if (file.run === null) {
    faults.push(`${name}: НЕТ маркера «Запуск:» в шапке — род файла не объявлен, перепись судит о нём догадкой по имени`);
  }

  // 🔴 Две стороны одного расхождения. Первая — EXP-0194 механически.
  if (claimsGate(file.gate) && !inGates) {
    faults.push(`${name}: маркер объявляет ворота («${file.gate}»), а в составе guards.mjs его НЕТ — страж вне ворот не защищает (EXP-0194)`);
  }
  if (inGates && file.gate !== null && !claimsGate(file.gate)) {
    faults.push(`${name}: стоит в составе guards.mjs, а маркер говорит «${file.gate}» — маркер врёт о своём же месте`);
  }
  if (inGates && file.gate === null && !deferred.has(name.split('/').pop())) {
    // Отдельным словом: молчание воротного файла опаснее молчания прочих.
    faults.push(`${name}: СТОИТ В ВОРОТАХ и молчит об этом — снятие его из состава прошло бы незаметно`);
  }

  return faults;
}

/**
 * Имена файлов, реально стоящих в составе ворот, — разбором `tools/guards.mjs`.
 *
 * Берётся ФАКТ из состава, а не список, переписанный сюда руками: переписанный список —
 * второй нормативный ответ на один вопрос, и он разъедется первым.
 */
export function gateFilesFrom(guardsSource) {
  const names = new Set();
  for (const hit of guardsSource.matchAll(/'tools\/([A-Za-z0-9._-]+\.mjs)'/g)) {
    if (!hit[1].includes('*')) names.add(hit[1]);
  }
  return names;
}

/**
 * 🔴 ОБЪЯВЛЕННЫЙ ПОТОЛОК НЕПОМЕЧЕННЫХ — храповик миграции.
 *
 * Пометить полсотни шапок одной правкой можно, но перепись обязана держаться и ПОТОМ. Поэтому
 * число непомеченных объявлено потолком: оно может УБЫВАТЬ свободно и не может расти. Новый
 * прибор без маркера краснеет сразу, а старый долг убывает порциями, не запирая ворота.
 *
 * Направление устаревания то же, что у `CORPUS_FLOOR` в `verify-probe-mark.mjs`, и по той же
 * причине: потолок устаревает только ВНИЗ (долг выплачен), и это делает его слабее, но никогда
 * ложно красным. Опустил долг — опусти потолок той же правкой, иначе храповик не щёлкает.
 *
 * Замер 2026-08-29 на `ndim_dev3` (5ad97ad): непомеченных 0 — долг выплачен целиком этой же
 * порцией, потолок стоит на нуле и работает как обычный запрет.
 */
export const UNMARKED_CEILING = 0;

/** Вердикт по числу непомеченных — отдельно от поимённых, потому что лечение у него другое. */
export function ceilingFaults(unmarked, ceiling = UNMARKED_CEILING) {
  if (unmarked > ceiling) {
    return [
      `НЕПОМЕЧЕННЫХ ${unmarked} при объявленном потолке ${ceiling} — долг вырос. ` +
        'Потолок опускается вместе с выплатой долга и не поднимается: новый прибор рождается с маркером',
    ];
  }
  return [];
}

/* ── САМОТЕСТ ──────────────────────────────────────────────────────────────────
 *
 * 🔴 ПРЕДОХРАНИТЕЛЬ «ЗАПУСТИЛИ ИЛИ ПОДКЛЮЧИЛИ» (`EXP-0193`): каждый случай несёт ОЖИДАЕМЫЙ
 * вердикт, и совпадение проверяется, а не печатается. Набор, неспособный покраснеть,
 * доказывает только сам себя.
 */
const GATES = new Set(['verify-a.mjs', 'verify-b.mjs']);
const SELFTEST_CASES = [
  {
    name: 'шапка — первый блочный комментарий, а не первые N строк',
    run: () => {
      const src = "/**\n * Ворота: npm run guards\n */\nconst x = 1;\n/** Ворота: враньё */\n";
      return markerValue(headerOf(src), 'Ворота') === 'npm run guards';
    },
  },
  {
    name: '🔑 КОНТРОЛЬ: строка «Ворота:» ПОСЛЕ шапки маркером не считается',
    run: () => {
      const src = "/**\n * Запуск: node tools/x.mjs\n */\n// Ворота: npm run guards\n";
      return markerValue(headerOf(src), 'Ворота') === null;
    },
  },
  {
    name: 'файла без верхнего комментария маркеров нет вовсе',
    run: () => headerOf('const x = 1;\n') === '' && markersOf('const x = 1;\n').run === null,
  },
  {
    name: '🔑 шапка формы `//` читается наравне с блочной (21 такой файл в дереве)',
    run: () => markersOf('#!/usr/bin/env node\n// Прибор X.\n// Запуск: node tools/x.mjs\nconst a = 1;\n').run === 'node tools/x.mjs',
  },
  {
    name: 'шебанг перед блочной шапкой не мешает разбору',
    run: () => markersOf('#!/usr/bin/env node\n/**\n * Ворота: npm run guards\n */\n').gate === 'npm run guards',
  },
  {
    name: '🔑 КОНТРОЛЬ: комментарий `//` НИЖЕ кода шапкой не считается',
    run: () => markersOf('const a = 1;\n// Запуск: node tools/x.mjs\n').run === null,
  },
  {
    name: '🔴 БЛОЧНАЯ ФОРМА: голая метка + команды столбиком — значение БЕЗ приставки комментария',
    run: () => markersOf('/**\n * Запуск:\n *   node tools/x.mjs   # обычный прогон\n */\n').run === 'node tools/x.mjs   # обычный прогон',
  },
  {
    name: 'КОНТРОЛЬ: значение на ТОЙ ЖЕ строке читается целиком, с хвостом после точки',
    run: () => markersOf('/**\n * Запуск: node tools/x.mjs · самотест: --selftest\n */\n').run === 'node tools/x.mjs · самотест: --selftest',
  },
  {
    name: '🔑 КОНТРОЛЬ: голая метка ПОСЛЕДНЕЙ строкой шапки — значения нет, за шапку не выходим',
    run: () => markersOf('/**\n * Прибор X.\n * Запуск:\n */\nconst cmd = "node tools/x.mjs";\n').run === null,
  },
  {
    name: '«Ворота: нет — причина» это ОТВЕТ, а не членство',
    run: () => claimsGate('нет — зовётся рукой при разборе инцидента') === false,
  },
  {
    name: '🔑 КОНТРОЛЬ: слово «нет» ВНУТРИ причины членства не отменяет',
    run: () => claimsGate('npm run guards (сети нет, стенда нет)') === true,
  },
  {
    name: 'род: имя *.test.mjs конститутивно — это юнит',
    run: () => kindOf('verify-status-outlived.test.mjs') === 'юнит',
  },
  {
    name: 'род: каталог lib/ конститутивен — это библиотека',
    run: () => kindOf(join('lib', 'probe-mark.mjs')) === 'библиотека',
  },
  {
    name: '🔴 род: verify-* САМ ПО СЕБЕ ничего не значит — файл корневой, маркер обязателен',
    run: () => kindOf('verify-icons.mjs') === 'корневой',
  },
  {
    name: '🔴 ГЛОБ ВИДИТ ЛИШНЕЕ: юнит объявил себя ОТДЕЛЬНЫМ прибором — красный',
    run: () => {
      const f = { rel: 'verify-x.test.mjs', kind: 'юнит', run: 'node tools/verify-x.test.mjs', gate: null };
      return judgeFile(f, GATES).length === 1;
    },
  },
  {
    name: '🔑 КОНТРОЛЬ: юнит, назвавший СВОЙ запускатель (node --test), — чисто, а не самозванец',
    run: () => {
      const f = { rel: 'verify-x.test.mjs', kind: 'юнит', run: 'node --test tools/verify-x.test.mjs', gate: null };
      return judgeFile(f, GATES).length === 0;
    },
  },
  {
    name: 'КОНТРОЛЬ: юнит без «Запуск:» — чисто, маркеров с него не требуют',
    run: () => judgeFile({ rel: 'verify-x.test.mjs', kind: 'юнит', run: null, gate: null }, GATES).length === 0,
  },
  {
    name: 'библиотека, объявившая себя запускаемой, — красная',
    run: () => judgeFile({ rel: join('lib', 'x.mjs'), kind: 'библиотека', run: 'node x', gate: null }, GATES).length === 1,
  },
  {
    name: 'корневой файл без «Запуск:» — красный (род не объявлен)',
    run: () => judgeFile({ rel: 'verify-c.mjs', kind: 'корневой', run: null, gate: null }, GATES).length === 1,
  },
  {
    name: '🔑 КОНТРОЛЬ: неворотный файл БЕЗ «Ворота:» — чисто (двести обязательных «нет» это шаблон)',
    run: () => judgeFile({ rel: 'verify-c.mjs', kind: 'корневой', run: 'node tools/verify-c.mjs', gate: null }, GATES).length === 0,
  },
  {
    name: '🔴 EXP-0194 МЕХАНИЧЕСКИ: маркер объявляет ворота, а в составе guards его нет — красный',
    run: () => {
      const f = { rel: 'verify-c.mjs', kind: 'корневой', run: 'node tools/verify-c.mjs', gate: 'npm run guards' };
      return judgeFile(f, GATES).some((s) => s.includes('EXP-0194'));
    },
  },
  {
    name: '🔴 ГЛОБ НЕ ВИДИТ СВОЁ: стоит в воротах, а маркер говорит «нет» — красный',
    run: () => {
      const f = { rel: 'verify-a.mjs', kind: 'корневой', run: 'node tools/verify-a.mjs', gate: 'нет — зовётся рукой' };
      return judgeFile(f, GATES).some((s) => s.includes('врёт о своём же месте'));
    },
  },
  {
    name: 'стоит в воротах и молчит — своё нарушение, отдельным словом',
    run: () => {
      const f = { rel: 'verify-a.mjs', kind: 'корневой', run: 'node tools/verify-a.mjs', gate: null };
      return judgeFile(f, GATES, new Map()).some((s) => s.includes('СТОИТ В ВОРОТАХ и молчит'));
    },
  },
  {
    name: '🔑 отсрочка ГАСИТ молчание названного файла — и только названного',
    run: () => {
      const f = { rel: 'verify-a.mjs', kind: 'корневой', run: 'node tools/verify-a.mjs', gate: null };
      const отсрочка = new Map([['verify-a.mjs', 'снимается при мерже']]);
      return judgeFile(f, GATES, отсрочка).length === 0;
    },
  },
  {
    name: '🔑 КОНТРОЛЬ: отсрочка на ЧУЖОЕ имя молчание не гасит',
    run: () => {
      const f = { rel: 'verify-b.mjs', kind: 'корневой', run: 'node tools/verify-b.mjs', gate: null };
      const отсрочка = new Map([['verify-a.mjs', 'снимается при мерже']]);
      return judgeFile(f, GATES, отсрочка).some((s) => s.includes('СТОИТ В ВОРОТАХ и молчит'));
    },
  },
  {
    name: '🔑 КОНТРОЛЬ: отсрочка НЕ гасит враньё — заявил ворота и не стоит в них — красный',
    run: () => {
      const f = { rel: 'verify-c.mjs', kind: 'корневой', run: 'node tools/verify-c.mjs', gate: 'npm run guards' };
      const отсрочка = new Map([['verify-c.mjs', 'снимается при мерже']]);
      return judgeFile(f, GATES, отсрочка).some((s) => s.includes('EXP-0194'));
    },
  },
  {
    name: 'КОНТРОЛЬ: воротный файл с честным маркером — чисто',
    run: () => {
      const f = { rel: 'verify-a.mjs', kind: 'корневой', run: 'node tools/verify-a.mjs', gate: 'npm run guards' };
      return judgeFile(f, GATES).length === 0;
    },
  },
  {
    name: 'КОНТРОЛЬ: неворотный файл с честным «Ворота: нет» — чисто',
    run: () => {
      const f = { rel: 'verify-c.mjs', kind: 'корневой', run: 'node tools/verify-c.mjs', gate: 'нет — разбор инцидента' };
      return judgeFile(f, GATES).length === 0;
    },
  },
  {
    name: 'состав ворот читается из guards.mjs, глоб в список не попадает',
    run: () => {
      const src = "argv: ['--test', 'tools/*.test.mjs'] argv: ['tools/verify-icons.mjs'] argv: ['tools/console-snapshot.mjs', '--check-age', '8']";
      const g = gateFilesFrom(src);
      return g.size === 2 && g.has('verify-icons.mjs') && g.has('console-snapshot.mjs');
    },
  },
  {
    name: '🔴 потолок непомеченных: рост долга — красный',
    run: () => ceilingFaults(1, 0).length === 1,
  },
  {
    name: 'КОНТРОЛЬ: долг на потолке — чисто',
    run: () => ceilingFaults(0, 0).length === 0,
  },
  {
    name: 'КОНТРОЛЬ: долг НИЖЕ потолка — чисто (выплата не требует правки прибора)',
    run: () => ceilingFaults(2, 5).length === 0,
  },
];

function selftest() {
  let failed = 0;
  for (const item of SELFTEST_CASES) {
    let ok = false;
    try {
      ok = item.run() === true;
    } catch {
      ok = false;
    }
    console.log(`${ok ? '  ✓' : '  ✗'} ${item.name}`);
    if (!ok) failed += 1;
  }
  console.log(
    failed === 0
      ? `\n✅ САМОТЕСТ ЧИСТ: случаев ${SELFTEST_CASES.length}, все ведут себя как объявлено.`
      : `\n❌ САМОТЕСТ КРАСНЫЙ: ${failed} из ${SELFTEST_CASES.length}.`,
  );
  process.exit(failed === 0 ? 0 : 1);
}

/* ── РАБОЧИЙ ПРОГОН ────────────────────────────────────────────────────────── */

/** Все `.mjs` под `tools/`, включая подкаталоги: перепись, которая не обходит всё, — не перепись. */
export function walkTools(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...walkTools(path));
    else if (name.endsWith('.mjs')) out.push(path);
  }
  return out;
}

function run(argv) {
  const census = argv.includes('--census');
  const gateFiles = gateFilesFrom(readFileSync(join(TOOLS, 'guards.mjs'), 'utf8'));

  const rows = [];
  for (const path of walkTools(TOOLS).sort()) {
    const source = readFileSync(path, 'utf8');
    const rel = relative(TOOLS, path);
    const { run: runMark, gate } = markersOf(source);
    rows.push({ rel, kind: kindOf(rel), run: runMark, gate });
  }

  const faults = [];
  for (const row of rows) faults.push(...judgeFile(row, gateFiles));

  const приборы = rows.filter((r) => r.kind === 'корневой' && r.run !== null);
  const юниты = rows.filter((r) => r.kind === 'юнит');
  const библиотеки = rows.filter((r) => r.kind === 'библиотека');
  const воротные = rows.filter((r) => claimsGate(r.gate));
  const непомеченные = rows.filter((r) => r.kind === 'корневой' && r.run === null);

  faults.push(...ceilingFaults(непомеченные.length));

  // 🔑 Срок годности отсрочки: повод ушёл — уходит и строка, иначе это вечное тихое исключение.
  for (const [name, why] of ОТСРОЧКА) {
    if (!gateFiles.has(name)) {
      faults.push(`ОТСРОЧКА ПЕРЕЖИЛА СВОЙ ПОВОД: ${name} больше не в составе guards.mjs (${why}) — сними строку из ОТСРОЧКА`);
    }
  }

  // 🔑 Контроль прибора: пустая перепись дала бы «расхождений 0» бессодержательно —
  // ровно тот зелёный, который не способен покраснеть (вопрос 3 лестницы трёх вопросов).
  if (rows.length === 0) faults.push('НЕ НАЙДЕНО НИ ОДНОГО .mjs под tools/ — признак сломан, прогон бессодержателен');
  if (gateFiles.size === 0) faults.push('НЕ РАЗОБРАН состав guards.mjs — ворота сверять нечем');

  console.log(
    `Перепись tools/: файлов ${rows.length} · приборов ${приборы.length} · ` +
      `юнитов ${юниты.length} · библиотек ${библиотеки.length} · ` +
      `объявили ворота ${воротные.length} (в составе guards ${gateFiles.size}) · непомеченных ${непомеченные.length}`,
  );

  if (census) {
    console.log('\n── ПРИБОРЫ, ОБЪЯВИВШИЕ ВОРОТА ──');
    for (const r of воротные) console.log(`   ${r.rel.split(sep).join('/')} → ${r.gate}`);
    if (непомеченные.length) {
      console.log('\n── БЕЗ МАРКЕРА «Запуск:» ──');
      for (const r of непомеченные) console.log(`   ${r.rel.split(sep).join('/')}`);
    }
  }

  if (faults.length === 0) {
    console.log(`✅ ПЕРЕПИСЬ СХОДИТСЯ: маркер и дерево говорят одно, воротных ${воротные.length} из ${gateFiles.size} состава.`);
    process.exit(0);
  }
  console.log(`\n❌ РАСХОЖДЕНИЙ: ${faults.length}`);
  for (const fault of faults) console.log(`   · ${fault}`);
  process.exit(1);
}

const запущенНапрямую =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
if (запущенНапрямую) {
  if (process.argv.includes('--selftest')) selftest();
  else run(process.argv.slice(2));
}
