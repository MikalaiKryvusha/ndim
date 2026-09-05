/**
 * ДОСТАВКА ПАР СИНОНИМОВ В ТЕГИ ЗАПИСИ — чистая логика для `tools/fix-catalog-tag-pairs.mjs`.
 *
 * Слово владельца 2026-09-05 (интервью №061 В7 = В и чат): «*нужно писать role-playing game и RPG
 * одновременно, во все такие игры*» · «*ролевая игра и РПГ — ничего не ломает*». То есть у группы
 * ДВЕ пары: «ролевая игра» ↔ «role-playing game» и «РПГ» ↔ «RPG». Модель пар каталога — i-й
 * кириллический тег к i-му латинскому (`tag-conventions.mjs`, `tagPairsOf`), и две полные пары в
 * неё ложатся ровно. Агент сперва прочитал «RPG» как третий тег без русской половины и объявил,
 * что модель ломается, — это была его ошибка, не владельца: «РПГ» — обычное русское написание.
 *
 * Что делает `completePairs(tags, group)`:
 *   · если в тегах нет ни одного слова группы — возвращает теги как есть (запись не «такая игра»);
 *   · иначе снимает слова группы с их мест и ставит на место ПЕРВОГО из них цельный блок из всех
 *     пар группы в порядке «русский, английский» — так i-й кириллический остаётся напротив i-го
 *     латинского и до блока, и после него;
 *   · строчное написание («rpg») считается тем же тегом и уходит в канон «RPG» — единственное
 *     переписывание, и оно называется в журнале;
 *   · ни один тег вне группы не трогается, порядок остальных не меняется.
 */

/** Группы синонимов: пары [русский, английский], первая пара — основная. */
export const ГРУППЫ = {
  rpg: {
    имя: 'ролевая игра',
    пары: [
      ['ролевая игра', 'role-playing game'],
      ['РПГ', 'RPG'],
    ],
  },
};

const норм = (s) => String(s ?? '').trim().toLowerCase();

/** Все слова группы в нижнем регистре — для опознания, в том числе строчного «rpg». */
function словаГруппы(group) {
  return new Set(group.пары.flat().map(норм));
}

/**
 * @param {string[]} tags теги записи в физическом порядке
 * @param {{имя: string, пары: [string, string][]}} group группа синонимов
 * @returns {{ tags: string[], touched: boolean, added: string[], normalized: string[] }}
 */
export function completePairs(tags, group) {
  const исходные = Array.isArray(tags) ? tags.map((t) => String(t)) : [];
  const слова = словаГруппы(group);
  const якорь = исходные.findIndex((t) => слова.has(норм(t)));
  if (якорь < 0) return { tags: исходные, touched: false, added: [], normalized: [] };

  const блок = group.пары.flat();
  const канон = new Map(блок.map((t) => [норм(t), t]));
  const было = new Set();
  const normalized = [];
  const остаток = [];
  исходные.forEach((t, i) => {
    if (!слова.has(норм(t))) {
      остаток.push({ t, i });
      return;
    }
    const c = канон.get(норм(t));
    было.add(c);
    if (c !== t) normalized.push(`${t} → ${c}`);
  });
  const added = блок.filter((t) => !было.has(t));

  const result = [];
  let вставлен = false;
  for (const { t, i } of остаток) {
    if (!вставлен && i > якорь) {
      result.push(...блок);
      вставлен = true;
    }
    result.push(t);
  }
  if (!вставлен) result.push(...блок);

  const touched = added.length > 0 || normalized.length > 0 || result.join('') !== исходные.join('');
  return { tags: result, touched, added, normalized };
}
