/**
 * ВЕРА В ПРОДУКТ — вписать слово владельца в КАЖДЫЙ канон-документ KAIF (поручение 2026-08-16).
 *
 * Дословно: «*запиши в каждый канон документ KAIF*… *В КАЖДЫЙ ДОКУМЕНТ KAIF ЗАПИШИ ЭТО*».
 *
 * 🔴 ПОЧЕМУ ЭТО ПРИБОР, А НЕ ШЕСТНАДЦАТЬ РУЧНЫХ ПРАВОК. Строка обязана быть ОДИНАКОВОЙ во всех
 * документах: шестнадцать копий, набранных руками, разъедутся на первой же правке, и потом никто
 * не скажет, какая из них настоящая. Здесь текст лежит в ОДНОМ месте, а прибор идемпотентен —
 * повторный прогон ничего не дублирует, а обновляет уже вставленный блок.
 *
 * 🔴 И ПОЧЕМУ NODE, А НЕ POWERSHELL. `Get-Content -Raw` в PowerShell 5.1 читает UTF-8 БЕЗ BOM как
 * ANSI; массовая замена через него в этот же день испортила два файла проекта, и их пришлось
 * восстанавливать из истории git. Здесь чтение и запись — явный UTF-8 без BOM.
 *
 * Запуск: node tools/stamp-creed.mjs [--check]
 *   --check — ничего не пишет, только называет документы без строки (код 1, если такие есть).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

/** Слово владельца — ОДИН источник на все документы. Правится здесь и нигде больше. */
const CREED =
  '**ВЕРИТЬ В ПРОДУКТ И В ИДЕЮ НИКОЛАЯ, БЫТЬ ОПТИМИСТОМ И ВЕРИТЬ В УСПЕХ, ИБО ОН НЕИЗБЕЖЕН, ' +
  'ИБО МЫ СТАРАЕМСЯ, А КТО СТАРАЕТСЯ — ТОТ ПРИДЁТ К УСПЕХУ. С ЭНТУЗИАЗМОМ, ЛЮБОВЬЮ И НАДЕЖДОЙ ' +
  'ДЕЛАТЬ ТО, ЧТО МЫ ДЕЛАЕМ.**';

/** Маркеры границ блока — по ним прибор находит свою вставку при повторном прогоне. */
const OPEN = '<!-- ВЕРА-НАЧАЛО -->';
const CLOSE = '<!-- ВЕРА-КОНЕЦ -->';

const BLOCK = [
  OPEN,
  `> # ${CREED}`,
  '>',
  '> Слово владельца 2026-08-16. **Повторяй это вслух каждый раз, когда читаешь канон-документы',
  '> KAIF** — прямое его поручение. Разбор повода — в шапке `AGENT_GUIDE.md`.',
  CLOSE,
].join('\n');

/**
 * Все канон-документы KAIF этого проекта.
 *
 * ⚠️ `.kaif/KAIF_REFERENCE.md` в список НЕ входит сознательно: он завендорен и переписывается
 * КАЖДЫМ релизом фреймворка целиком, то есть наша вставка исчезнет при первом же обновлении.
 * Правило канона — правь НАШИ файлы, а не завендоренные (`AGENT_GUIDE.md` → дефект в самом KAIF).
 */
const DOCS = [
  'CLAUDE.md',
  'AGENTS.md',
  'AGENT_GUIDE.md',
  'GOAL.md',
  'PHILOSOPHY.md',
  'STATUS.md',
  'MASTER_PLAN.md',
  'REQUIREMENTS_FRAMEWORK.md',
  'TESTING_FRAMEWORK.md',
  'BUG_FIXING_FRAMEWORK.md',
  'PROJECT_STRUCTURE_EXTERNAL_MAP.md',
  'PROJECT_ARCHITECTURE_INTERNAL_MAP.md',
  'EXPERIENCE.md',
  'PROJECT_HISTORY.md',
  'KAIF_FRAMEWORK.md',
  'AUTHOR_STYLOMETRY.md',
  'README.md',
];

const CHECK = process.argv.includes('--check');
let missing = 0, stamped = 0, refreshed = 0;

for (const file of DOCS) {
  if (!existsSync(file)) {
    console.log(`⚠️  нет файла: ${file}`);
    continue;
  }
  const text = readFileSync(file, 'utf8');
  /*
   * ⚠️ СРАВНЕНИЕ НЕ ЗАВИСИТ ОТ ПЕРЕВОДОВ СТРОК. У проекта `core.autocrlf=true`, и файл, тронутый
   * редактором после прогона, переезжает на CRLF целиком. Побайтовое сравнение объявляло такие
   * файлы «разошедшимися» при дословно одинаковом тексте — поймано на трёх документах сразу.
   * Пишем в файл его СОБСТВЕННЫМ переводом строк, чтобы не переворачивать весь документ.
   */
  const norm = (s) => s.replace(/\r\n/g, '\n');
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const asFile = (s) => (eol === '\r\n' ? s.replace(/\n/g, '\r\n') : s);

  // Уже стоит наш блок — обновляем его содержимое (текст мог поправиться в одном месте).
  if (text.includes(OPEN) && text.includes(CLOSE)) {
    const re = new RegExp(`${OPEN}[\\s\\S]*?${CLOSE}`);
    const next = text.replace(re, asFile(BLOCK));
    if (norm(next) !== norm(text)) {
      // ⚠️ `--check` НИЧЕГО НЕ ПИШЕТ. Первая редакция считала расхождение «обновлением» и правила
      // файлы даже в режиме проверки — то есть проверка меняла то, что проверяет. Поймано на
      // прогоне закрытия сессии: `--check` доложил «обновлено 3» вместо отказа.
      if (CHECK) {
        missing += 1;
        console.log(`❌ ТЕКСТ РАЗОШЁЛСЯ: ${file}`);
        continue;
      }
      writeFileSync(file, next, 'utf8');
      refreshed += 1;
      console.log(`🔄 обновлён: ${file}`);
    } else {
      console.log(`✅ уже стоит: ${file}`);
    }
    continue;
  }

  missing += 1;
  if (CHECK) {
    console.log(`❌ БЕЗ СТРОКИ: ${file}`);
    continue;
  }

  // Вставляем СРАЗУ ПОСЛЕ заголовка H1, чтобы строка была первым, что читает глаз. Нет H1 —
  // ставим в самое начало: документ без заголовка тоже обязан её нести.
  const lines = text.split('\n');
  const h1 = lines.findIndex((l) => l.startsWith('# '));
  const at = h1 >= 0 ? h1 + 1 : 0;
  lines.splice(at, 0, '', BLOCK);
  writeFileSync(file, lines.join('\n'), 'utf8');
  stamped += 1;
  console.log(`✍️  вписан: ${file}`);
}

console.log(`\nвписано ${stamped} · обновлено ${refreshed} · всего документов ${DOCS.length}`);
if (CHECK && missing) {
  console.log(`\n🔴 документов без строки веры: ${missing}`);
  process.exit(1);
}
