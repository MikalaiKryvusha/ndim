/**
 * Единственный вопрос лендинга к Firebase: есть ли у человека живая сессия (bugs/08.1).
 *
 * Вошедший человек лендинг не разглядывает — его дом внутри продукта, и корень (`/`)
 * обязан вести его туда. Гость — тоже «внутри»: у него живая сессия и несохранённый труд.
 *
 * Динамический импорт Firebase — канон лендинга (см. `data/funnel.ts`, EXP-0028): SDK не
 * имеет права попадать в его главный бандл (Lighthouse 100). `currentUser` сразу после
 * загрузки страницы ещё null (восстановление сессии асинхронное) — поэтому ждём первого
 * события `onAuthStateChanged`, а не читаем поле наугад.
 *
 * Никогда не бросает: не смогли спросить — считаем, что сессии нет, и показываем лендинг.
 */
export async function hasSession(): Promise<boolean> {
  try {
    const [{ devAuth }, { onAuthStateChanged }] = await Promise.all([
      import('../firebase.ts'),
      import('firebase/auth'),
    ]);
    return await new Promise<boolean>((resolve) => {
      const unsubscribe = onAuthStateChanged(devAuth(), (user) => {
        unsubscribe();
        resolve(user !== null);
      });
    });
  } catch {
    return false;
  }
}
