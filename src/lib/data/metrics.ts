/**
 * Публичная витрина лендинга: «С нами уже N человек» (bugs/07).
 *
 * Число пишет сервер синхронизации в `space/public_metrics` — РОВНО тот же счёт людей,
 * что на экране «Пространство» (`space/stats.people`): лендинг не имеет права хвастаться
 * другой цифрой. Документ читается БЕЗ авторизации — как это работало в 1.x
 * (`researches/05_onboarding_texts_1x.md`); в нём нет ничего, кроме агрегата.
 *
 * Динамический импорт Firebase — канон лендинга (см. `data/funnel.ts`): SDK не имеет
 * права попадать в его главный бандл (Lighthouse 100).
 *
 * Никогда не бросает: нет числа — лендинг просто не показывает строку. Выдуманное число
 * хуже отсутствующего: однажды здесь стоял литерал «2 184 человека» при 331 живом.
 */
export async function loadPublicPeople(): Promise<number | null> {
  try {
    const [{ db }, { doc, getDoc }] = await Promise.all([
      import('../firebase.ts'),
      import('firebase/firestore'),
    ]);
    const snapshot = await getDoc(doc(db(), 'space', 'public_metrics'));
    const people = (snapshot.data() as { people?: unknown } | undefined)?.people;
    return typeof people === 'number' && Number.isFinite(people) && people > 0 ? people : null;
  } catch {
    return null;
  }
}
