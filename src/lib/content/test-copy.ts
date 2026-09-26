/**
 * ТЕКСТЫ СЕМЕЙСТВА СТРАНИЦ «ТЕСТ» — фаза 5 эпика 40 (`plans/42`, шаг 3, такт А).
 *
 * Состав утверждён владельцем (интервью №028, В1 = А · В4 = Б): хаб «Тесты» `/{lang}/tests`
 * плюс три обёртки — «Тест на совместимость», «Тест личности», «Калькулятор любви».
 * Каркас страниц — V5 «Зеркало + инструкция» (интервью №029, В2 = А).
 *
 * ✅ СТАТУС ТЕКСТОВ: ПРИНЯТЫ ВЛАДЕЛЬЦЕМ БЕЗ ЛИЧНОЙ ВЫЧИТКИ (слово в чате 2026-08-14, при
 * AUTH выката: «текста принимаем без вычитки»; условие вслед: «текста должны быть
 * согласованы со стилометрией автора и с философией проекта»). Сверка агента 2026-08-14 по
 * `AUTHOR_STYLOMETRY.md` §7 (применимые к микрокопии слои): стоп-паттерны A2 — 0 · «навсегда»
 * и «похожесть» на лице — 0 (только в комментариях кода) · «процент» — только в отрицаниях
 * (это философия честности, не нарушение) · глиф тире един («—»), кавычки RU — только
 * «ёлочки» · слой E: обещание FAQ «только по 12 вещам» заменено честным «по вещам, которые
 * оценили вы оба» — в результат пары попадают все совпавшие оценки набора, их может быть
 * больше 12.
 *
 * Инварианты, которые эти тексты ОБЯЗАНЫ держать (researches/35 §5):
 *   · числа похожести и порядок близости не называются нигде (№018 В4, №023) — в примерах
 *     результата только СЧЁТ СОВПАДЕНИЙ-ФАКТОВ (№028 В3 = А) и сами факты;
 *   · «навсегда» не пишем; обращение — «Вы» (правила текста продукта);
 *   · термин не бросается голым: «измерение» на витрине объясняется через «настоящие вещи —
 *     фильмы, игры, привычки» (правка владельца 2026-08-02); с пулом №098 практик в наборе нет —
 *     тексты о наборе называют «фильмы, сериалы и игры», а виды пула сверяет `test-set.test.ts`;
 *   · гостевая анкета живёт 7 дней — это называется прямо, без страха потери как мотива.
 *
 * Пример результата («Вы и Аня», «12 совпадений») — ИЛЛЮСТРАЦИЯ ФОРМЫ, подписанная на странице
 * словом «пример»: имена вымышлены, числа не утверждают ничего о продукте.
 *
 * 🔄 2026-09-26: тексты «Теста на совместимость» заменены текстами макета V4 (интервью №098 В1 = Г) —
 * разбор отступлений от дословности стоит над ключом `compatibility`. Тексты «Теста личности» и
 * «Калькулятора любви» этой работой не тронуты.
 */

import type { Lang } from '$lib/content/langs';

/** Адресные слаги трёх обёрток — источник для маршрута, sitemap и хаба. Один список на всех. */
export const TEST_SLUGS = ['compatibility', 'personality', 'love'] as const;
export type TestSlug = (typeof TEST_SLUGS)[number];

type L<T> = Record<Lang, T>;

export interface TestStep { lead: string; rest: string }
export interface TestFaq { q: string; a: string }
export interface TestFact { icon: string; text: string }

/**
 * ТЕКСТ ПОД ДЕЛОМ — разделы страницы «Тест на совместимость» (макет V4, интервью №098 В1 = Г).
 * Блок раздела: абзац · нумерованные шаги (жирное начало + продолжение) · виды строк результата
 * (значок + жирное имя + продолжение). Абзац о пуле теста снят (интервью №100, В1 = В).
 */
export type GuideBlock =
  | { kind: 'p'; text: string }
  | { kind: 'ol'; items: TestStep[] }
  | { kind: 'kinds'; items: { icon: string; lead: string; rest: string }[] };
export interface GuideSection { h2: string; blocks: GuideBlock[] }

/** Блок «После теста — Друзья по интересам в Пространстве NDim Space» (макет V4). */
export interface AfterTest {
  kicker: string;
  title: string;
  body: string;
  /** Подпись над списком «вещь — N человек»: только счётчики, ни людей, ни их оценок (№002 В4). */
  ratedTitle: string;
  findCta: string;
  saveCta: string;
}

export interface TestCopy {
  /** Подпись жанра в карточке хаба: «Для двоих», «Для одного»… */
  badge: string;
  h1: string;
  sub: string;
  /** Строка фактов под подзаголовком: «без регистрации · 12 вещей · ~3 минуты». */
  facts: string[];
  /** Компактная полоса трёх шагов (каркас V5). */
  steps: TestStep[];
  /** Панель «Ваша анкета растёт» — заголовок и честное ПУСТОЕ стартовое состояние. */
  mirrorTitle: string;
  mirrorEmpty: string;
  /** Блок приглашения второго (для «личности» — приглашение сравниться). */
  inviteTitle: string;
  inviteBody: string;
  inviteNote: string;
  /** Пример результата. */
  resultTitle: string;
  resultCaption: string;
  resultCount?: { n: string; label: string; sub: string };
  resultRows: TestFact[];
  resultFoot: string;
  /** Мост-паспорт. У «Теста на совместимость» его место занимает блок `after` (V4). */
  keepTitle?: string;
  keepBody?: string;
  keepCta?: string;
  keepGhost?: string;
  /** Строки ссылки создателя пары; без них — общие строки страницы. */
  pairLinkReady?: string;
  pairWaiting?: string;
  /** V4 (№098 В1 = Г): блок «Друзья по интересам», текст под делом, заголовки вопросов и мостов. */
  after?: AfterTest;
  guide?: GuideSection[];
  faqTitle?: string;
  crossTitle?: string;
  faq: TestFaq[];
  /** Мосты между обёртками: подпись → слаг. */
  crossLinks: { text: string; slug: TestSlug }[];
  /** Карточка хаба. */
  hubLine: string;
  hubCta: string;
  metaTitle: string;
  metaDesc: string;
}

/** Обвязка карточки движка: подписи шкалы и пропуск. Сам ОБЪЕКТ карточки с такта Б живой —
 *  очередь строится на сборке из популярнейших объектов каталога (`test-set.ts`). */
export const CARD_CHROME: L<{ scale0: string; scale10: string; skip: string }> = {
  ru: {
    scale0: '0 — совсем не моё',
    scale10: '10 — это про меня',
    skip: 'Не знаю эту вещь — дальше',
  },
  en: {
    scale0: '0 — not my thing',
    scale10: '10 — that’s me',
    skip: 'I don’t know this one — next',
  },
};

/** Подпись Пространства внизу каждой страницы семейства. */
export const TEST_FOOT: L<string> = {
  ru: 'NDim Space — честный поиск похожих людей по математической близости. Бесплатно, без рекламы и без подписок.',
  en: 'NDim Space — honest search for similar people through mathematical closeness. Free, with no ads and no subscriptions.',
};

export const TESTS: Record<TestSlug, L<TestCopy>> = {
  /*
   * ═══ «ТЕСТ НА СОВМЕСТИМОСТЬ» — МАКЕТ V4 «От пары к людям Пространства» (интервью №098 В1 = Г) ═══
   *
   * Русские строки — ДОСЛОВНО из `design/compat-test-page-mockups.html` (вариант V4 = всё из V1 и ниже
   * блок «Друзья по интересам»): тексты прошли независимую проверку по портрету голоса владельца
   * (§7Б) и не переписываются. Отступления от дословности — ТОЛЬКО там, где новый набор теста (пул 20
   * и случайная дюжина, №098 В2) сделал бы строку неправдой, и каждое названо здесь:
   *   · подзаголовок и вопрос «с другом»: «фильмы, книги, сериалы и практики» → «фильмы, сериалы и
   *     игры» (в пуле нет ни книг, ни практик); из подзаголовка снята строка «Практики — это то, чем
   *     люди занимаются» (практик в наборе нет); вопрос «не знаю фильм или книгу» → «фильм или сериал»;
   *   · пример «по-разному»: «Гарри Поттер и Тайная комната · Роман, 1998» → «Гарри Поттер и
   *     философский камень · Фильм, 2001» (романа в пуле нет, фильм есть);
   *   · абзац о первых двенадцати вещах (список самых оценённых подряд, с «Сексом» и шестью «Гарри
   *     Поттерами») снят словом владельца — интервью №100, В1 = В («*тупорылые объяснения-оправдания*»);
   *   · `metaDesc` собран из строк V4 (в макете его нет; прежний нёс «Честный…» и «без выдуманных
   *     процентов» — форму оправдания, снятую словом владельца 2026-08-28).
   * Подпись страницы (`TEST_FOOT`) НЕ тронута сознательно: она общая с хабом тестов и с 10 222
   * страницами каталога — её замена идёт отдельной работой на все поверхности сразу.
   */
  compatibility: {
    ru: {
      badge: 'Для двоих',
      // H1 — «Тест на совместимость», «тест для двоих» в подзаголовке (интервью №028, В2 = А).
      h1: 'Тест на совместимость',
      sub: 'Тест для двоих: Вы и второй человек оцениваете 12 вещей одного набора — фильмы, сериалы и игры — звёздами от 0 до 10, каждый со своего телефона или компьютера. Результат называет вещи, в которых ваши оценки совпали.',
      facts: ['без регистрации', '12 вещей · ~3 минуты', 'бесплатно', 'отвечают оба'],
      steps: [
        { lead: 'Оцените 12 вещей', rest: 'звёздами от 0 до 10.' },
        { lead: 'Отправьте тест второму человеку', rest: '— второй человек оценивает вещи этого теста у себя.' },
        { lead: 'Смотрите совпадения', rest: '— вещи, в которых ваши оценки совпали.' },
      ],
      mirrorTitle: 'Ваша анкета растёт',
      mirrorEmpty: 'Поставьте первую оценку — здесь появятся первые факты о Вас.',
      inviteTitle: 'Отправьте тест второму человеку',
      inviteBody: 'Когда Вы оцените 12 вещей, здесь появится кнопка «Создать личную ссылку». Отправьте ссылку второму человеку: второй человек откроет ссылку со своего телефона или компьютера и оценит вещи этого теста.',
      inviteNote: 'Результат показывается только вам двоим — участникам пары: ссылка личная, и её получает тот, кому Вы её отправите.',
      pairLinkReady: 'Личная ссылка готова — отправьте её второму человеку:',
      pairWaiting: 'Как только второй человек пройдёт тест, здесь появится результат.',
      resultTitle: 'Пример результата теста на совместимость',
      resultCaption: 'Вы и Аня · пример результата',
      resultRows: [
        { icon: '⭐', text: 'Вы оба поставили 10 — Побег из Шоушенка · Фильм, 1994' },
        { icon: '⭐', text: 'Вы оба поставили 9 — Гладиатор · Фильм, 2000' },
        { icon: '⭐', text: 'Вы оба поставили 8 — Матрица · Фильм, 1999' },
        { icon: '🤝', text: 'Вы рядом в «Доктор Хаус · Телесериал, 2004»: 7 и 8' },
        { icon: '💬', text: '«Гарри Поттер и философский камень · Фильм, 2001» вы видите по-разному (8 и 2) — будет о чём поговорить' },
      ],
      resultFoot: 'Сравнили вещей: 12.',
      after: {
        kicker: 'После теста',
        title: 'Друзья по интересам в Пространстве NDim Space',
        body: 'Ваши оценки теста уже лежат в Вашем NDim ID — анкете, где собраны все вещи, которые Вы оценили, вместе с Вашими оценками. По этой анкете Пространство NDim Space ищет людей, чьи оценки похожи на Ваши, и собирает самых похожих людей в разделе «Связи». Каждая новая оценка вещи каталога ложится в Ваш NDim ID, и Пространство NDim Space ищет похожих людей по всем Вашим оценкам. Гостевая анкета хранится 7 дней с момента создания.',
        ratedTitle: 'Вещи этого теста уже оценили люди Пространства NDim Space:',
        findCta: 'Найти друзей по интересам',
        saveCta: 'Сохранить мою анкету',
      },
      guide: [
        {
          h2: 'Как пройти тест на совместимость для двоих',
          blocks: [
            { kind: 'p', text: 'Тест на совместимость для двоих в Пространстве NDim Space проходится в три шага. Каждый из двоих делает свою часть сам, со своего телефона или компьютера.' },
            {
              kind: 'ol',
              items: [
                { lead: 'Оцените 12 вещей', rest: 'звёздами от 0 до 10. Ноль значит «совсем не моё», десять — «это про меня». Вещь, которую Вы не знаете, пропустите кнопкой «Не знаю эту вещь — дальше»: тест покажет следующую.' },
                { lead: 'Отправьте тест второму человеку.', rest: 'Нажмите «Создать личную ссылку» и отправьте ссылку в мессенджере, в письме или там, где Вам удобно. Второй человек открывает ссылку со своего телефона или компьютера и оценивает вещи этого теста.' },
                { lead: 'Смотрите совпадения.', rest: 'Второй человек нажимает «Сравнить ответы» и сразу видит результат: совпадения, близкие оценки и вещи, которые вы видите по-разному. Вы видите результат, когда нажимаете «Проверить» под личной ссылкой или открываете свою личную ссылку.' },
              ],
            },
            { kind: 'p', text: 'Весь тест занимает около трёх минут. Оценки второго человека Вы видите после того, как оценили оба, — поэтому каждая оценка остаётся собственным ответом человека.' },
            { kind: 'p', text: 'Сравниться можно с несколькими людьми. Ваши оценки остаются в Вашей анкете. Чтобы сравниться со следующим человеком, откройте страницу теста заново и нажмите «Создать личную ссылку»: одна ссылка — одна пара.' },
            // Абзац о пуле теста снят словом владельца (интервью №100, В1 = В, 2026-09-26): «*этот текст
            // целиком - класс, который мне не нравится - тупорылые объяснения-оправдания*».
          ],
        },
        {
          h2: 'Что показывает результат теста на совместимость',
          blocks: [
            { kind: 'p', text: 'Результат теста на совместимость называет вещи. Каждая строка результата — одна вещь и две оценки: Ваша и оценка второго человека. Строки результата бывают трёх видов.' },
            {
              kind: 'kinds',
              items: [
                { icon: '⭐', lead: 'Совпадение', rest: '— вы оба оценили вещь одинаково. Пример: «Вы оба поставили 10 — Побег из Шоушенка · Фильм, 1994».' },
                { icon: '🤝', lead: 'Рядом', rest: '— ваши оценки отличаются на одну звезду. Пример: «Вы рядом в „Доктор Хаус · Телесериал, 2004“: 7 и 8».' },
                { icon: '💬', lead: 'По-разному', rest: '— ваши оценки расходятся на четыре звезды и больше. Пример: «„Гарри Поттер и философский камень · Фильм, 2001“ вы видите по-разному (8 и 2) — будет о чём поговорить».' },
              ],
            },
            { kind: 'p', text: 'Под строками стоит, сколько вещей оценили вы оба.' },
            { kind: 'p', text: 'Результат показывается только вам двоим — участникам пары. Кнопка «Удалить пару и ссылку» есть у обоих участников пары: кнопка удаляет пару и ссылку. Оценки в анкетах обоих при этом остаются.' },
          ],
        },
        {
          h2: 'На чём основан тест на совместимость пары',
          blocks: [
            { kind: 'p', text: 'Оценка вещи — это короткий ответ человека на вопрос: насколько эта вещь про меня? Фильм, книга, сериал, практика — каждая вещь несёт свой мир: свой юмор, своих героев, свой темп, свои ценности. Высокая оценка говорит: этот мир мне близок.' },
            { kind: 'p', text: 'Совпадения двух людей по многим вещам складываются в рисунок — общий юмор, общие любимые истории, общий взгляд на то, что важно. Такой рисунок и есть совместимость двух людей по вкусам.' },
            { kind: 'p', text: 'Расхождения работают на пару тоже. Вещь, которую вы видите по-разному, — готовая тема для разговора: почему «Матрица» у Вас на 10 и у второго человека на 3?' },
            { kind: 'p', text: 'По этому принципу Пространство NDim Space ищет похожих людей — по всем оценкам человека сразу. Каждая вещь каталога — Измерение Пространства, и оценка человека задаёт место человека на этом Измерении. Похожесть двух людей Пространство NDim Space считает из двух мер: Общности и Близости. Общность показывает, насколько совпадают интересы двоих людей: Пространство NDim Space делит число вещей, которые оценили оба человека, на среднее число вещей, которые оценил каждый из двоих. Близость показывает, насколько похожи оценки двоих людей по общим вещам. Общность, умноженная на Близость, и есть Похожесть. По Похожести Пространство NDim Space подбирает каждому человеку его Связи — самых похожих на него людей.' },
          ],
        },
        {
          h2: 'Тест на совместимость онлайн и бесплатно',
          blocks: [
            { kind: 'p', text: 'Тест на совместимость проходится онлайн, прямо на этой странице, со своего телефона или компьютера. Тест на совместимость бесплатный: оценки, личная ссылка и результат пары. Второй человек отвечает со своего телефона или компьютера — личная ссылка открывает тест прямо там.' },
            { kind: 'p', text: 'Тест проходится без регистрации: первая оценка сразу создаёт Вашу гостевую анкету. Гостевая анкета хранится 7 дней с момента создания. Кнопка «Сохранить мою анкету» сохраняет гостевую анкету за Вами: Вы входите в Пространство NDim Space через Google или по ссылке из письма на Вашу почту, и все оценки остаются с Вами.' },
            { kind: 'p', text: 'Ваша анкета называется NDim ID — это все вещи, которые Вы оценили, вместе с Вашими оценками. Каждая оценка теста уже лежит в Вашем NDim ID. По NDim ID Пространство NDim Space находит Вам людей с похожими оценками — Ваши Связи.' },
          ],
        },
      ],
      faqTitle: 'Частые вопросы о тесте на совместимость',
      faq: [
        { q: 'Тест на совместимость для двоих — отвечают оба?', a: 'Да, отвечают оба. Каждый из двоих оценивает вещи сам, со своего телефона или компьютера. Первый человек оценивает 12 вещей и отправляет личную ссылку, второй человек открывает ссылку и оценивает вещи этого теста. Результат строится по оценкам обоих.' },
        { q: 'Как пройти тест на совместимость пары онлайн?', a: 'Оцените 12 вещей на этой странице, нажмите «Создать личную ссылку» и отправьте ссылку второму человеку. Второй человек оценивает вещи этого теста у себя, нажимает «Сравнить ответы» и сразу видит результат. Вы видите результат, когда нажимаете «Проверить» под личной ссылкой или открываете свою личную ссылку.' },
        { q: 'Тест на совместимость — бесплатно?', a: 'Да. Тест на совместимость бесплатный: оценки, личная ссылка и результат пары.' },
        { q: 'Можно пройти тест на совместимость без регистрации?', a: 'Да. Первая оценка создаёт гостевую анкету, и тест проходится до результата. Гостевая анкета хранится 7 дней с момента создания. Кнопка «Сохранить мою анкету» сохраняет гостевую анкету за Вами.' },
        { q: 'Можно пройти тест на совместимость мужчине и женщине?', a: 'Да. Тест подходит мужчине и женщине, паре, двум друзьям, двум подругам — любым двоим. Вещи теста одинаковы для обоих, и результат показывает совпадения двух людей.' },
        { q: 'Можно пройти тест на совместимость с другом?', a: 'Да. Вы оцениваете 12 вещей и отправляете другу личную ссылку. Друг оценивает вещи этого теста у себя, и результат показывает, в каких фильмах, сериалах и играх ваши вкусы совпали.' },
        { q: 'Кто видит мои ответы в тесте на совместимость?', a: 'Результат показывается только вам двоим — участникам пары. Второй человек видит Ваши оценки в строках результата — по вещам этого теста, которые оценили вы оба, — после двух нажатий: Вы нажали «Создать личную ссылку», второй человек нажал «Сравнить ответы». Остальные оценки Вашего NDim ID видите только Вы.' },
        { q: 'Что делать, если я не знаю фильм или сериал из теста?', a: 'Нажмите «Не знаю эту вещь — дальше», и тест покажет следующую вещь. Результат сравнивает вещи, которые оценили вы оба.' },
        { q: 'Как найти друзей по интересам?', a: 'Сохраните свою анкету и продолжайте оценивать вещи каталога Пространства NDim Space — фильмы, книги, сериалы, игры и практики. Пространство NDim Space ищет людей с похожими оценками по всем Вашим оценкам и собирает самых похожих людей в разделе «Связи».' },
      ],
      crossTitle: 'Другие тесты Пространства NDim Space',
      crossLinks: [
        { text: 'Тест личности', slug: 'personality' },
        { text: 'Калькулятор любви', slug: 'love' },
      ],
      hubLine: 'Вы оба оцениваете одни и те же 12 вещей — совпадения говорят сами за себя.',
      hubCta: 'Пройти',
      metaTitle: 'Тест на совместимость для двоих — NDim Space',
      metaDesc: 'Тест на совместимость для двоих онлайн, бесплатно и без регистрации: Вы и второй человек оцениваете 12 вещей — фильмы, сериалы и игры — звёздами от 0 до 10. Результат называет вещи, в которых ваши оценки совпали.',
    },
    /*
     * [AI] EN — черновик на вычитку владельцу (интервью №100, В5 = В — английская страница отдельной
     * вычиткой; она — вопрос В2 интервью №101). Написан ОТ СМЫСЛА русских строк V4, а не калькой: те же
     * блоки и те же факты, английский порядок слов и английские кавычки. Термины — по словарю
     * продукта (NDim ID · Relations · Dimension · Similarity = Proximity × Commonality).
     */
    en: {
      badge: 'For two',
      h1: 'Compatibility test',
      sub: 'A test for two: you and the other person rate the same set of 12 things — movies, TV series and games — with stars from 0 to 10, each on your own phone or computer. The result names the things where your ratings matched.',
      facts: ['no sign-up', '12 things · ~3 minutes', 'free', 'you both answer'],
      steps: [
        { lead: 'Rate 12 things', rest: 'with stars from 0 to 10.' },
        { lead: 'Send the test to the other person', rest: '— they rate the things of this test on their own device.' },
        { lead: 'See your matches', rest: '— the things where your ratings matched.' },
      ],
      mirrorTitle: 'Your profile is growing',
      mirrorEmpty: 'Give your first rating — the first facts about you will appear here.',
      inviteTitle: 'Send the test to the other person',
      inviteBody: 'Once you have rated 12 things, a “Create a personal link” button appears here. Send the link to the other person: they open it on their own phone or computer and rate the things of this test.',
      inviteNote: 'Only the two of you see the result — the two people in the pair: the link is personal, and it goes to the person you send it to.',
      pairLinkReady: 'Your personal link is ready — send it to the other person:',
      pairWaiting: 'As soon as the other person finishes the test, the result appears here.',
      resultTitle: 'Sample compatibility test result',
      resultCaption: 'You and Anna · sample result',
      resultRows: [
        { icon: '⭐', text: 'You both gave 10 — The Shawshank Redemption · Movie, 1994' },
        { icon: '⭐', text: 'You both gave 9 — Gladiator · Movie, 2000' },
        { icon: '⭐', text: 'You both gave 8 — The Matrix · Movie, 1999' },
        { icon: '🤝', text: 'You are close on “House M.D. · TV series, 2004”: 7 and 8' },
        { icon: '💬', text: 'You see “Harry Potter and the Sorcerer’s Stone · Movie, 2001” differently (8 and 2) — something to talk about' },
      ],
      resultFoot: 'Things compared: 12.',
      after: {
        kicker: 'After the test',
        title: 'Friends with shared interests in NDim Space',
        body: 'Your test ratings are already in your NDim ID — the profile that holds every thing you have rated, together with your ratings. NDim Space uses this profile to look for people whose ratings are close to yours, and gathers the most similar people in the “Relations” section. Every new rating of a catalog thing goes into your NDim ID, and NDim Space looks for similar people across all of your ratings. A guest profile is kept for 7 days from the moment it is created.',
        ratedTitle: 'People in NDim Space have already rated the things of this test:',
        findCta: 'Find friends with shared interests',
        saveCta: 'Save my profile',
      },
      guide: [
        {
          h2: 'How to take the compatibility test for two',
          blocks: [
            { kind: 'p', text: 'The compatibility test for two in NDim Space takes three steps. Each of the two people does their own part, on their own phone or computer.' },
            {
              kind: 'ol',
              items: [
                { lead: 'Rate 12 things', rest: 'with stars from 0 to 10. Zero means “not my thing”, ten means “that’s me”. If you don’t know a thing, skip it with the “I don’t know this one — next” button: the test shows the next one.' },
                { lead: 'Send the test to the other person.', rest: 'Press “Create a personal link” and send the link in a messenger, by email or wherever suits you. The other person opens the link on their own phone or computer and rates the things of this test.' },
                { lead: 'See your matches.', rest: 'The other person presses “Compare answers” and sees the result right away: matches, close ratings and the things you see differently. You see the result when you press “Check” under your personal link or open your personal link.' },
              ],
            },
            { kind: 'p', text: 'The whole test takes about three minutes. You see the other person’s ratings once both of you have rated — so every rating stays each person’s own answer.' },
            { kind: 'p', text: 'You can compare with several people. Your ratings stay in your profile. To compare with the next person, open the test page again and press “Create a personal link”: one link — one pair.' },
          ],
        },
        {
          h2: 'What the compatibility test result shows',
          blocks: [
            { kind: 'p', text: 'The compatibility test result names things. Each line of the result is one thing and two ratings: yours and the other person’s. Result lines come in three kinds.' },
            {
              kind: 'kinds',
              items: [
                { icon: '⭐', lead: 'Match', rest: '— you both rated the thing the same. Example: “You both gave 10 — The Shawshank Redemption · Movie, 1994”.' },
                { icon: '🤝', lead: 'Close', rest: '— your ratings differ by one star. Example: “You are close on ‘House M.D. · TV series, 2004’: 7 and 8”.' },
                { icon: '💬', lead: 'Different', rest: '— your ratings are four or more stars apart. Example: “You see ‘Harry Potter and the Sorcerer’s Stone · Movie, 2001’ differently (8 and 2) — something to talk about”.' },
              ],
            },
            { kind: 'p', text: 'Below the lines is the number of things you both rated.' },
            { kind: 'p', text: 'Only the two of you see the result — the two people in the pair. Both people in the pair have a “Delete the pair and the link” button: it deletes the pair and the link. The ratings in both profiles stay.' },
          ],
        },
        {
          h2: 'What the couple compatibility test is based on',
          blocks: [
            { kind: 'p', text: 'Rating a thing is a person’s short answer to the question: how much is this thing me? A movie, a book, a series, a practice — each thing carries its own world: its own humour, its own heroes, its own pace, its own values. A high rating says: this world is close to me.' },
            { kind: 'p', text: 'When two people match on many things, the matches add up to a pattern — shared humour, shared favourite stories, a shared view of what matters. That pattern is the compatibility of two people’s tastes.' },
            { kind: 'p', text: 'Differences work for the pair too. A thing you see differently is a ready topic for a conversation: why is “The Matrix” a 10 for you and a 3 for the other person?' },
            { kind: 'p', text: 'NDim Space looks for similar people on the same principle — across all of a person’s ratings at once. Every thing in the catalog is a Dimension of the Space, and a person’s rating sets that person’s place on that Dimension. NDim Space calculates the Similarity of two people from two measures: Commonality and Proximity. Commonality shows how much the interests of two people overlap: NDim Space divides the number of things both people rated by the average number of things each of the two rated. Proximity shows how close the two people’s ratings are on the shared things. Commonality multiplied by Proximity is Similarity. By Similarity, NDim Space picks each person’s Relations — the people most similar to them.' },
          ],
        },
        {
          h2: 'Compatibility test online and free',
          blocks: [
            { kind: 'p', text: 'The compatibility test runs online, right on this page, on your own phone or computer. The compatibility test is free: the ratings, the personal link and the pair’s result. The other person answers on their own phone or computer — the personal link opens the test right there.' },
            { kind: 'p', text: 'The test needs no sign-up: your first rating creates your guest profile right away. A guest profile is kept for 7 days from the moment it is created. The “Save my profile” button keeps the guest profile as yours: you sign in to NDim Space with Google or with a link sent to your email, and all your ratings stay with you.' },
            { kind: 'p', text: 'Your profile is called NDim ID — every thing you have rated, together with your ratings. Every test rating is already in your NDim ID. By your NDim ID, NDim Space finds you people with similar ratings — your Relations.' },
          ],
        },
      ],
      faqTitle: 'Frequently asked questions about the compatibility test',
      faq: [
        { q: 'Compatibility test for two — do both people answer?', a: 'Yes, both people answer. Each of the two rates the things on their own phone or computer. The first person rates 12 things and sends a personal link; the second person opens the link and rates the things of this test. The result is built from both people’s ratings.' },
        { q: 'How do we take the couple compatibility test online?', a: 'Rate 12 things on this page, press “Create a personal link” and send the link to the other person. The other person rates the things of this test on their side, presses “Compare answers” and sees the result right away. You see the result when you press “Check” under your personal link or open your personal link.' },
        { q: 'Is the compatibility test free?', a: 'Yes. The compatibility test is free: the ratings, the personal link and the pair’s result.' },
        { q: 'Can I take the compatibility test without signing up?', a: 'Yes. Your first rating creates a guest profile, and the test runs all the way to the result. A guest profile is kept for 7 days from the moment it is created. The “Save my profile” button keeps the guest profile as yours.' },
        { q: 'Can a man and a woman take the compatibility test?', a: 'Yes. The test suits a man and a woman, a couple, two friends — any two people. The things of the test are the same for both, and the result shows where the two people match.' },
        { q: 'Can I take the compatibility test with a friend?', a: 'Yes. You rate 12 things and send your friend a personal link. Your friend rates the things of this test on their side, and the result shows in which movies, TV series and games your tastes matched.' },
        { q: 'Who sees my answers in the compatibility test?', a: 'Only the two of you see the result — the two people in the pair. The other person sees your ratings in the result lines — on the things of this test that you both rated — after two presses: you pressed “Create a personal link”, the other person pressed “Compare answers”. The rest of the ratings in your NDim ID are seen only by you.' },
        { q: 'What if I don’t know a movie or a series from the test?', a: 'Press “I don’t know this one — next”, and the test shows the next thing. The result compares the things you both rated.' },
        { q: 'How do I find friends with shared interests?', a: 'Save your profile and keep rating things in the NDim Space catalog — movies, books, TV series, games and practices. NDim Space looks for people with similar ratings across all of your ratings and gathers the most similar people in the “Relations” section.' },
      ],
      crossTitle: 'Other NDim Space tests',
      crossLinks: [
        { text: 'Personality test', slug: 'personality' },
        { text: 'Love calculator', slug: 'love' },
      ],
      hubLine: 'You both rate the same 12 things — the matches speak for themselves.',
      hubCta: 'Take the test',
      metaTitle: 'Compatibility test for two — NDim Space',
      metaDesc: 'A compatibility test for two, online, free and with no sign-up: you and the other person rate 12 things — movies, TV series and games — with stars from 0 to 10. The result names the things where your ratings matched.',
    },
  },

  personality: {
    ru: {
      badge: 'Для одного',
      h1: 'Тест личности',
      sub: 'Не готовый «тип личности», а живая анкета: факты о Вашем вкусе, которые растут с каждой оценкой.',
      facts: ['без регистрации', '12 вещей · ~3 минуты', 'бесплатно'],
      steps: [
        // [AI] 2026-09-26 (`b878d9b`): «привычки» → «сериалы» — в пуле №098 практик нет. «настоящие» снято по
        // вопросу владельца №100 В4 «*слово "настоящие" - это кейворд?*» — замер Вордстата: только «как найти
        // настоящих друзей / девушку / парня / любовь», о фильмах и играх слово не ищут. На вычитку владельцу.
        { lead: 'Оцените 12 вещей', rest: 'звёздами — фильмы, сериалы и игры.' },
        { lead: 'Смотрите, как собирается анкета', rest: '— факт за фактом, после каждой оценки.' },
        { lead: 'Сравнитесь с другом', rest: '— по личной ссылке, когда захотите.' },
      ],
      mirrorTitle: 'Ваша анкета растёт',
      mirrorEmpty: 'Поставьте первую оценку — здесь появятся первые факты о Вас.',
      inviteTitle: 'Сравниться с другом',
      inviteBody: 'После Ваших оценок здесь появится личная ссылка — отправьте её, и вы увидите совпадения.',
      inviteNote: 'Результат сравнения увидите только вы двое.',
      resultTitle: 'Каким будет результат',
      resultCaption: 'пример результата',
      resultRows: [
        { icon: '⭐', text: 'Ваша первая десятка — Warcraft III' },
        { icon: '🎬', text: 'Кино и сериалы Вы цените: «Пацаны» 8, «Особое мнение» 7' },
        { icon: '👥', text: 'Эти вещи вместе с Вами оценили ещё 9 человек Пространства' },
      ],
      resultFoot: 'Анкета живая: дозаполните её — и результат вырастет вместе с ней.',
      keepTitle: 'Это не разовый тест',
      keepBody: 'Каждая Ваша оценка уже собирается в анкету — Ваш NDim ID. Она живёт и растёт вместе с Вами, а Пространство ищет по ней людей, которые совпадают с Вами по-настоящему. Гостевая анкета хранится 7 дней.',
      keepCta: 'Сохранить мою анкету',
      keepGhost: 'Продолжить гостем',
      faq: [
        { q: 'Почему результат — не «тип личности»?', a: 'Готовые типы звучат приятно, но их нельзя проверить. Мы показываем проверяемое: Ваши настоящие ответы и то, как они совпадают с ответами других людей.' },
        { q: 'Мои ответы кто-нибудь увидит?', a: 'Оценки приватны: их не видит никто, кроме Вас. Люди в Пространстве видят итог математики — насколько вы похожи, — а не Ваши ответы.' },
        { q: 'Это бесплатно?', a: 'Да. Без рекламы, без подписок и без покупок.' },
      ],
      crossLinks: [
        { text: 'Проверить вас двоих — тест на совместимость', slug: 'compatibility' },
        { text: 'Поиграть вдвоём — калькулятор любви', slug: 'love' },
      ],
      hubLine: 'Живая анкета вместо готового «типа»: факты о Вашем вкусе, растущие с каждой оценкой.',
      hubCta: 'Пройти',
      metaTitle: 'Тест личности — NDim Space',
      // [AI] 2026-09-26 (`b878d9b`): «привычки» → «сериалы» — в пуле №098 практик нет; на вычитку владельцу.
      metaDesc: 'Честный тест личности: вместо готового «типа» — живая анкета из Ваших настоящих ответов. Оцените знакомые фильмы, сериалы и игры — без регистрации.',
    },
    en: {
      badge: 'For one',
      h1: 'Personality test',
      sub: 'Not a ready-made “personality type” — a living profile: facts about your taste that grow with every rating.',
      facts: ['no sign-up', '12 things · ~3 minutes', 'free'],
      steps: [
        // [AI] 2026-09-26 (`b878d9b`): «привычки» → «сериалы» — в пуле №098 практик нет; «real» снято вместе с
        // русским «настоящие» (№100 В4). На вычитку владельцу.
        { lead: 'Rate 12 things', rest: 'with stars — movies, series and games.' },
        { lead: 'Watch your profile take shape', rest: '— fact by fact, after every rating.' },
        { lead: 'Compare with a friend', rest: '— by a personal link, whenever you like.' },
      ],
      mirrorTitle: 'Your profile is growing',
      mirrorEmpty: 'Give your first rating — the first facts about you will appear here.',
      inviteTitle: 'Compare with a friend',
      inviteBody: 'After your ratings, a personal link will appear here — send it, and you will see your matches.',
      inviteNote: 'Only the two of you will see the comparison.',
      resultTitle: 'What the result looks like',
      resultCaption: 'sample result',
      resultRows: [
        { icon: '⭐', text: 'Your first 10 — Warcraft III' },
        { icon: '🎬', text: 'You value series and movies: “The Boys” 8, “Minority Report” 7' },
        { icon: '👥', text: '9 more people in NDim Space rated the same things' },
      ],
      resultFoot: 'The profile is alive: keep filling it in, and the result grows with it.',
      keepTitle: 'This is not a one-time test',
      keepBody: 'Every rating you give is already building your profile — your NDim ID. It lives and grows with you, and NDim Space uses it to find people who truly match you. A guest profile is kept for 7 days.',
      keepCta: 'Save my profile',
      keepGhost: 'Continue as a guest',
      faq: [
        { q: 'Why isn’t the result a “personality type”?', a: 'Ready-made types sound pleasant, but they can’t be checked. We show what can be: your real answers and how they match other people’s.' },
        { q: 'Will anyone see my answers?', a: 'Ratings are private: nobody sees them but you. People in NDim Space see the outcome of the math — how similar you are — never your answers.' },
        { q: 'Is it free?', a: 'Yes. No ads, no subscriptions, no purchases.' },
      ],
      crossLinks: [
        { text: 'Check the two of you — the compatibility test', slug: 'compatibility' },
        { text: 'Play together — the love calculator', slug: 'love' },
      ],
      hubLine: 'A living profile instead of a ready-made “type”: facts about your taste, growing with every rating.',
      hubCta: 'Take the test',
      metaTitle: 'Personality test — NDim Space',
      // [AI] 2026-09-26 (`b878d9b`): «привычки» → «сериалы» — в пуле №098 практик нет; на вычитку владельцу.
      metaDesc: 'An honest personality test: instead of a ready-made “type” — a living profile built from your real answers. Rate familiar movies, series and games — no sign-up.',
    },
  },

  love: {
    ru: {
      badge: 'Для пары · 2 минуты',
      h1: 'Калькулятор любви',
      sub: 'Считает не случайный процент, а настоящие совпадения: вы оба отмечаете, что любите, — а дальше говорят цифры, которым можно верить.',
      facts: ['7 вещей · ~2 минуты', 'без регистрации'],
      steps: [
        { lead: 'Отметьте 7 вещей', rest: '— только звёзды.' },
        { lead: 'Ссылку — половинке', rest: '— она проходит те же 7.' },
        { lead: 'Считаем совпадения', rest: '— настоящие, не выдуманные.' },
      ],
      mirrorTitle: 'Копятся искры',
      mirrorEmpty: 'Отметьте первую вещь — искры начнут копиться здесь.',
      inviteTitle: 'Позовите половинку',
      inviteBody: 'Отметьте свои 7 вещей — и здесь появится личная ссылка для второго.',
      inviteNote: 'Результат увидите только вы двое: ссылка личная, в поиске её нет.',
      resultTitle: 'Ваш результат',
      resultCaption: 'Вы и Максим · пример результата',
      // Форма результата — СЧЁТ совпадений-фактов (интервью №028, В3 = А): число есть,
      // но это счёт фактов, а не процент похожести.
      resultCount: { n: '12', label: 'совпадений', sub: 'из них 5 общих «десяток»' },
      resultRows: [
        { icon: '♥', text: 'Вы оба поставили 10 — «Дом Дракона»' },
        { icon: '♥', text: 'Оба выросли на Worms' },
        { icon: '♥', text: 'Оба слушаете Twenty One Pilots' },
      ],
      resultFoot: 'Счёт честный: мы считаем совпадения, а не выдумываем процент.',
      keepTitle: 'Это не разовый тест',
      keepBody: 'Каждая Ваша оценка уже собирается в анкету — Ваш NDim ID. Она живёт и растёт вместе с Вами. Гостевая анкета хранится 7 дней.',
      keepCta: 'Сохранить мою анкету',
      keepGhost: 'Продолжить гостем',
      faq: [
        { q: 'Где процент любви?', a: 'Проценты интернет-калькуляторов случайны — их не проверить. Наш счёт проверяется: столько-то настоящих совпадений по вещам, которые вы оба отметили.' },
        { q: 'Это бесплатно?', a: 'Да. Без рекламы, без подписок и без покупок.' },
      ],
      crossLinks: [
        { text: 'Хотите глубже? Пройдите тест на совместимость', slug: 'compatibility' },
        { text: 'Узнать больше о себе — тест личности', slug: 'personality' },
      ],
      hubLine: 'Считает настоящие совпадения, а не случайный процент.',
      hubCta: 'Посчитать',
      metaTitle: 'Калькулятор любви — NDim Space',
      metaDesc: 'Честный калькулятор любви: вы оба отмечаете, что любите, а он считает настоящие совпадения — без случайных процентов и без регистрации.',
    },
    en: {
      badge: 'For a couple · 2 minutes',
      h1: 'Love calculator',
      sub: 'It counts real matches, not a random percentage: you both mark what you love — and then the numbers speak for themselves.',
      facts: ['7 things · ~2 minutes', 'no sign-up'],
      steps: [
        { lead: 'Mark 7 things', rest: '— just stars.' },
        { lead: 'Send the link to your other half', rest: '— they mark the same 7.' },
        { lead: 'We count the matches', rest: '— real ones, not made up.' },
      ],
      mirrorTitle: 'Sparks are adding up',
      mirrorEmpty: 'Mark the first thing — the sparks will start adding up here.',
      inviteTitle: 'Invite your other half',
      inviteBody: 'Mark your 7 things — a personal link for the second person will appear here.',
      inviteNote: 'Only the two of you will see the result: the link is private and never appears in search.',
      resultTitle: 'Your result',
      resultCaption: 'You and Max · sample result',
      resultCount: { n: '12', label: 'matches', sub: 'including 5 shared “tens”' },
      resultRows: [
        { icon: '♥', text: 'You both gave a 10 — House of the Dragon' },
        { icon: '♥', text: 'You both grew up on Worms' },
        { icon: '♥', text: 'You both listen to Twenty One Pilots' },
      ],
      resultFoot: 'The count is honest: we count matches, we don’t invent a percentage.',
      keepTitle: 'This is not a one-time test',
      keepBody: 'Every rating you give is already building your profile — your NDim ID. It lives and grows with you. A guest profile is kept for 7 days.',
      keepCta: 'Save my profile',
      keepGhost: 'Continue as a guest',
      faq: [
        { q: 'Where is the love percentage?', a: 'Percentages in online calculators are random — there is no way to check them. Our count can be checked: this many real matches on the things you both marked.' },
        { q: 'Is it free?', a: 'Yes. No ads, no subscriptions, no purchases.' },
      ],
      crossLinks: [
        { text: 'Want to go deeper? Take the compatibility test', slug: 'compatibility' },
        { text: 'Learn more about yourself — the personality test', slug: 'personality' },
      ],
      hubLine: 'It counts real matches, not a random percentage.',
      hubCta: 'Count it',
      metaTitle: 'Love calculator — NDim Space',
      metaDesc: 'An honest love calculator: you both mark what you love, and it counts your real matches — no random percentages and no sign-up.',
    },
  },
};

/** Хаб «Тесты» — обзор семейства (интервью №028, В4 = Б: делается сразу). */
export const HUB: L<{
  h1: string;
  sub: string;
  oneLine: string;
  honesty: string;
  metaTitle: string;
  metaDesc: string;
}> = {
  ru: {
    h1: 'Тесты',
    sub: 'Все тесты Пространства работают поверх одной живой анкеты: пройдёте один — второй начнётся уже с середины.',
    oneLine: 'Одна анкета на все тесты: каждая оценка зачтётся в любом из них.',
    honesty: 'Без регистрации. Без выдуманных процентов. Бесплатно и без рекламы — как и всё Пространство.',
    metaTitle: 'Тесты — NDim Space',
    metaDesc: 'Тесты Пространства: тест на совместимость для двоих, тест личности и калькулятор любви — поверх одной живой анкеты, без регистрации и без выдуманных процентов.',
  },
  en: {
    h1: 'Tests',
    sub: 'All NDim Space tests run on top of one living profile: finish one, and the next starts halfway done.',
    oneLine: 'One profile for all tests: every rating counts in any of them.',
    honesty: 'No sign-up. No made-up percentages. Free and ad-free — like all of NDim Space.',
    metaTitle: 'Tests — NDim Space',
    metaDesc: 'NDim Space tests: a compatibility test for two, a personality test and a love calculator — on top of one living profile, with no sign-up and no made-up percentages.',
  },
};
