/**
 * Тесты чистой логики редактора измерения (`plans/44`, фаза 4 эпика `ideas/29`).
 *
 * ГЛАВНОЕ, ЧТО ЗДЕСЬ СТЕРЕЖЁТСЯ, — не форма записи, а ТРУД ЛЮДЕЙ: правка измерения не имеет
 * права обнулить сводку оценок. Этот класс дефектов правила Firestore НЕ ловят по построению —
 * ноль лежит внутри законных границ шкалы, — поэтому прибор для него один: эти тесты и страж фазы.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  EMPTY_DRAFT,
  docToDraft,
  draftToDoc,
  joinTags,
  newDimDoc,
  parseTags,
  preservedFrom,
  validateDraft,
  type DimDraft,
} from './dim-editor.ts';

/** Черновик заполненного измерения — «Одиссея» Нолана, тот самый повод владельца. */
const filled: DimDraft = {
  titleRu: 'Одиссея',
  titleEn: 'The Odyssey',
  descriptionRu: 'Фильм Кристофера Нолана по поэме Гомера.',
  descriptionEn: 'A film by Christopher Nolan after Homer.',
  typeRu: 'Фильм',
  typeEn: 'Film',
  authorRu: 'Кристофер Нолан',
  authorEn: 'Christopher Nolan',
  year: '2026',
  tags: 'кино, эпос, кино',
};

describe('Проверка черновика — зеркало границ правил, не строже их', () => {
  test('заполненный черновик проходит', () => {
    assert.deepEqual(validateDraft(filled), []);
  });

  test('пустое название обеих половин названо ДВУМЯ проблемами — форма подсветит оба поля', () => {
    const problems = validateDraft(EMPTY_DRAFT);
    assert.deepEqual(
      problems.map((p) => p.field),
      ['titleRu', 'titleEn'],
    );
  });

  test('название из одних пробелов пустым и является', () => {
    const problems = validateDraft({ ...filled, titleEn: '   ' });
    assert.deepEqual(
      problems.map((p) => p.field),
      ['titleEn'],
    );
  });

  test('🔑 прочие поля НЕ обязательны — иначе форма строже базы', () => {
    /*
     * Замер боевого каталога 2026-08-17: у одной записи `type` живёт лишь по-русски, у одной
     * `author` лишь по-английски, тегов нет у трёх, описание есть у всех. Требовать эти поля
     * значило бы запретить владельцу правку ровно тех записей — форма обязана быть НЕ строже
     * правил, иначе законная запись становится незаводимой.
     */
    const bare: DimDraft = { ...EMPTY_DRAFT, titleRu: 'Тишина', titleEn: 'Silence' };
    assert.deepEqual(validateDraft(bare), []);
  });
});

describe('Теги — разбор строки, как их набирают', () => {
  test('разделитель запятая, пробелы по краям снимаются, повтор схлопывается', () => {
    assert.deepEqual(parseTags('кино, эпос, кино'), ['кино', 'эпос']);
  });

  test('пустая строка и одни запятые дают пустой список, а не пустые теги', () => {
    assert.deepEqual(parseTags(''), []);
    assert.deepEqual(parseTags(' , ,, '), []);
  });

  test('порядок набора сохраняется — первый тег человек ставит главным', () => {
    assert.deepEqual(parseTags('эпос, кино, Гомер'), ['эпос', 'кино', 'Гомер']);
  });

  test('обратный ход возвращает строку, годную к повторному разбору', () => {
    const tags = parseTags(filled.tags);
    assert.deepEqual(parseTags(joinTags(tags)), tags);
  });
});

describe('Сборка документа каталога', () => {
  test('заполненный черновик даёт документ канона 1.x', () => {
    const doc = draftToDoc(filled);
    assert.deepEqual(doc.title, { ru: 'Одиссея', en: 'The Odyssey' });
    assert.deepEqual(doc.type, { ru: 'Фильм', en: 'Film' });
    assert.deepEqual(doc.author, { ru: 'Кристофер Нолан', en: 'Christopher Nolan' });
    assert.equal(doc.year, '2026');
    assert.deepEqual(doc.tags, ['кино', 'эпос']);
  });

  test('новое измерение рождается с нулевой сводкой оценок', () => {
    const doc = draftToDoc(filled);
    assert.equal(doc.stars, 0);
    assert.equal(doc.rates, 0);
    assert.equal(doc.rating, 0);
  });

  test('🔴🔴 ПРАВКА НЕ ОБНУЛЯЕТ СВОДКУ ОЦЕНОК — труд людей переживает переименование', () => {
    /*
     * Класс, который правила пропускают: ноль внутри границ шкалы, валидация промолчит.
     * Сценарий из жизни: владелец правит опечатку в названии — и у измерения исчезают
     * оценки, которые ставили живые люди, а считал их сервер синхронизации.
     */
    const doc = draftToDoc({ ...filled, titleRu: 'Одиссея (2026)' }, { stars: 84, rates: 12, rating: 7 });
    assert.equal(doc.stars, 84);
    assert.equal(doc.rates, 12);
    assert.equal(doc.rating, 7);
  });

  test('незаполненный год и пустые теги в документ не пишутся вовсе', () => {
    const doc = draftToDoc({ ...filled, year: '  ', tags: ' , ' });
    assert.equal('year' in doc, false);
    assert.equal('tags' in doc, false);
  });

  test('год остаётся СТРОКОЙ, включая диапазон', () => {
    // Замер: у восьми боевых записей год длиннее четырёх знаков — это диапазоны.
    const doc = draftToDoc({ ...filled, year: '1966–1969' });
    assert.equal(doc.year, '1966–1969');
    assert.equal(typeof doc.year, 'string');
  });

  test('половина без текста уезжает как null, а ключ остаётся на месте', () => {
    const doc = draftToDoc({ ...filled, typeEn: '' });
    assert.deepEqual(doc.type, { ru: 'Фильм', en: null });
  });

  test('незаполненное описание — пара из null, а не пропущенный ключ', () => {
    const doc = draftToDoc({ ...filled, descriptionRu: '', descriptionEn: '' });
    assert.deepEqual(doc.description, { ru: null, en: null });
  });

  test('🔒 сборка без названия — бросок, а не молчаливая запись невидимого измерения', () => {
    assert.throws(() => draftToDoc({ ...filled, titleEn: '' }), /название обязательно/);
    assert.throws(() => draftToDoc(EMPTY_DRAFT), /название обязательно/);
  });
});

describe('Круговой ход документ → черновик → документ', () => {
  test('правка, ничего не изменившая, документ не меняет', () => {
    const doc = draftToDoc(filled, { stars: 84, rates: 12, rating: 7 });
    const again = draftToDoc(docToDraft(doc), { stars: doc.stars, rates: doc.rates, rating: doc.rating });
    assert.deepEqual(again, doc);
  });

  test('документ с половинами null читается в черновик пустыми полями, а не строкой «null»', () => {
    const draft = docToDraft({
      title: { ru: 'Тишина', en: 'Silence' },
      description: { ru: null, en: null },
      type: { ru: null, en: 'Concept' },
    });
    assert.equal(draft.descriptionRu, '');
    assert.equal(draft.typeRu, '');
    assert.equal(draft.typeEn, 'Concept');
  });

  test('документ без необязательных полей вовсе читается пустым черновиком', () => {
    const draft = docToDraft({ title: { ru: 'Бег', en: 'Running' } });
    assert.equal(draft.year, '');
    assert.equal(draft.tags, '');
    assert.equal(draft.authorRu, '');
  });
});

/*
 * ТЕХНИЧЕСКИЕ ТЕГИ ПЕРЕЖИВАЮТ ПРАВКУ (`plans/58` шаг 1).
 *
 * Комната пишет измерение ПОЛНОЙ заменой документа, а тег одобрения ставит разметка каталога —
 * человек в форме его не видит и не вводит. Значит без явного переноса первая же правка стёрла бы
 * тег МОЛЧА: ни ошибки, ни следа, и правила такую потерю не увидят — поля просто не стало.
 * Это тот же класс, что и обнуление сводки оценок выше, и ловится он ровно так же — здесь.
 */
describe('Технические теги переживают правку', () => {
  test('правка сохраняет технические теги', () => {
    const doc = draftToDoc(filled, preservedFrom({ stars: 84, rates: 12, rating: 7, techTags: ['migrated'] }));
    assert.deepEqual(doc.techTags, ['migrated']);
  });

  test('у записи без тега поле не появляется — пустого облака в документе не заводим', () => {
    const doc = draftToDoc(filled, preservedFrom({ stars: 0, rates: 0, rating: 0 }));
    assert.equal('techTags' in doc, false);
  });

  test('набор «что переживает правку» собирается из документа целиком', () => {
    assert.deepEqual(preservedFrom({ stars: 84, rates: 12, rating: 7, techTags: ['needs-rewrite'] }), {
      stars: 84,
      rates: 12,
      rating: 7,
      techTags: ['needs-rewrite'],
    });
  });

  test('круговой ход правки тег не теряет', () => {
    const preserved = preservedFrom({ stars: 84, rates: 12, rating: 7, techTags: ['unchecked'] });
    const doc = draftToDoc(filled, preserved);
    const again = draftToDoc(docToDraft(doc), preservedFrom(doc));
    assert.deepEqual(again, doc);
    assert.deepEqual(again.techTags, ['unchecked']);
  });
});

/*
 * НОВОРОЖДЁННОЕ ИЗМЕРЕНИЕ НЕСЁТ ТЕГ «ОДОБРЕНО ВЛАДЕЛЬЦЕМ» (интервью №044 В4 = A).
 *
 * Проверка живёт здесь, а не только в правилах: правила стерегут, что дверь ПРОПУСКАЕТ такой
 * документ, но молчат о том, посылает ли его комната. Сними штамп — правила не заметят ничего,
 * а записи начнут рождаться без тега и копиться в корзине «без источника суждения» разовой
 * разметки (`plans/58`). Ловится это только отсюда.
 */
describe('Новорождённое измерение', () => {
  test('рождается с тегом owner-approved', () => {
    assert.deepEqual(newDimDoc(filled).techTags, ['owner-approved']);
  });

  test('🔒 тег при рождении РОВНО один — новая запись не объявляет себя принятой миграцией', () => {
    // Дверь правил открыта на один литерал; если комната начнёт слать больше, отказ придёт от
    // базы, то есть у владельца сломается создание измерений. Проверяем здесь, до базы.
    assert.equal(newDimDoc(filled).techTags?.length, 1);
  });

  test('всё прочее в новорождённом — ровно то, что даёт черновик', () => {
    const { techTags, ...остальное } = newDimDoc(filled);
    assert.deepEqual(остальное, draftToDoc(filled));
    assert.equal(остальное.stars, 0, 'сводка оценок у новой записи нулевая');
  });
});
