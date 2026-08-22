/**
 * ЧТО ЛОЖИТСЯ В ДОКУМЕНТ ПРИ ОДОБРЕНИИ КАНДИДАТА — страж `bugs/173`.
 *
 * 🔴 ПОВОД. Кнопка [Одобрить] молча выбрасывала комментарий владельца: поле читал только
 * возврат. Владелец написал похвалу («*описание несёт принятие и реакцию сообщества — я сам
 * такое писал, и такое одобряю*»), нажал [Одобрить] — и текст не записался никуда. Нашёл он это
 * сам, проверяя, дошли ли его слова до агента; ни один прибор проекта потери не видел.
 *
 * ПОЧЕМУ ПРОВЕРКА ЖИВЁТ ЗДЕСЬ, А НЕ ТОЛЬКО В ЖИВОМ ПРОГОНЕ. Дефект был в ОДНОЙ строке того, что
 * пишется в документ, и увидеть его можно было лишь глазами в браузере — то есть только тогда,
 * когда кто-то пойдёт смотреть. Запись вынесена чистой функцией `approvedRecord`, и теперь её
 * судит юнит, который гоняет каждая роль перед каждой сдачей. Живой круг (эмулятор, оба прибора,
 * настоящая база) остаётся за `verify-candidate-return-loop` — это разные слои, и оба нужны.
 *
 * Мутация, которую файл обязан ронять: убрать из `approvedRecord` запись `ownerApprovalNote` —
 * краснеют «комментарий сохраняется» и «одобрение не затирает след возврата».
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { approvedRecord, type DimCandidate } from './admin-dims.ts';

/** Кандидат, уже побывавший на доработке: у него есть след возврата, и его трогать нельзя. */
const returnedOnce: DimCandidate = {
  id: 'wikidata-Q637290',
  title: { ru: 'Кобра', en: 'Cobra' },
  description: { ru: 'Описание.', en: 'Description.' },
  status: 'pending',
  agentNote: 'Мой комментарий владельцу.',
  ownerNote: 'Реестр.',
};

test('одобрение с комментарием СОХРАНЯЕТ его — то, чего не делала кнопка (bugs/173)', () => {
  const record = approvedRecord(returnedOnce, 'dim-123', 'Принятие и реакция сообщества — так и надо.');
  assert.equal(record.ownerApprovalNote, 'Принятие и реакция сообщества — так и надо.');
});

/**
 * Пункт 2 «Ожидания» бага, слово владельца: «*"реестр" — это старый комментарий, с которым она
 * возвращалась в работу. А сейчас я написал похвалу*». Два события — две строки истории.
 */
test('одобрение НЕ затирает след прошлого возврата — события разные, читаются оба', () => {
  const record = approvedRecord(returnedOnce, 'dim-123', 'Похвала.');
  assert.equal(record.ownerNote, 'Реестр.');
  assert.equal(record.ownerApprovalNote, 'Похвала.');
  assert.equal(record.agentNote, 'Мой комментарий владельцу.');
});

test('одобрение без слов законно: пустой комментарий не заводит поля вовсе', () => {
  for (const empty of ['', '   ', '\n\t ']) {
    const record = approvedRecord(returnedOnce, 'dim-123', empty);
    assert.equal(
      'ownerApprovalNote' in record,
      false,
      'пустая строка в базе выглядела бы как сказанное и ничего не значащее слово',
    );
  }
});

test('комментарий чистится по краям — лишние пробелы не становятся содержанием', () => {
  const record = approvedRecord(returnedOnce, 'dim-123', '  Хорошо.  ');
  assert.equal(record.ownerApprovalNote, 'Хорошо.');
});

/**
 * Служебные поля вычитки в тело документа не протекают: `id` — это ключ, а не поле, а прежний
 * статус обязан быть перезаписан решением, иначе одобренная карточка вернулась бы в очередь.
 */
test('решение записано, а служебные поля кандидата в тело не протекли', () => {
  const record = approvedRecord(returnedOnce, 'dim-123', 'Похвала.');
  assert.equal(record.status, 'approved');
  assert.equal(record.approvedDimId, 'dim-123');
  assert.equal('id' in record, false);
});

/** Совместимость назад: у старых карточек нет ни одного из полей комментария — и это норма. */
test('карточка без единого комментария одобряется как раньше', () => {
  const bare: DimCandidate = {
    id: 'wikidata-Q1',
    title: { ru: 'Без слов', en: 'No words' },
    description: { ru: '…', en: '…' },
    status: 'pending',
  };
  const record = approvedRecord(bare, 'dim-1', '');
  assert.deepEqual(record, {
    title: bare.title,
    description: bare.description,
    status: 'approved',
    approvedDimId: 'dim-1',
  });
});
