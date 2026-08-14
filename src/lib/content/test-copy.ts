/**
 * ТЕКСТЫ СЕМЕЙСТВА СТРАНИЦ «ТЕСТ» — фаза 5 эпика 40 (`plans/42`, шаг 3, такт А).
 *
 * Состав утверждён владельцем (интервью №028, В1 = А · В4 = Б): хаб «Тесты» `/{lang}/tests`
 * плюс три обёртки — «Тест на совместимость», «Тест личности», «Калькулятор любви».
 * Каркас страниц — V5 «Зеркало + инструкция» (интервью №029, В2 = А).
 *
 * 🔴 СТАТУС ТЕКСТОВ: ЧЕРНОВИК ФОРМЫ (оба языка — перевод агента). Финальные тексты проходят
 * вычитку владельцем ДО выката в бой — его условие в №028 (три набора текстов на двух языках)
 * и общее правило текстов лица (`AUTHOR_STYLOMETRY.md`, чек-лист §7).
 *
 * Инварианты, которые эти тексты ОБЯЗАНЫ держать (researches/35 §5):
 *   · числа похожести и порядок близости не называются нигде (№018 В4, №023) — в примерах
 *     результата только СЧЁТ СОВПАДЕНИЙ-ФАКТОВ (№028 В3 = А) и сами факты;
 *   · «навсегда» не пишем; обращение — «Вы» (правила текста продукта);
 *   · термин не бросается голым: «измерение» на витрине объясняется через «настоящие вещи —
 *     фильмы, игры, привычки» (правка владельца 2026-08-02);
 *   · гостевая анкета живёт 7 дней — это называется прямо, без страха потери как мотива.
 *
 * Пример результата («Вы и Аня», «12 совпадений») — ИЛЛЮСТРАЦИЯ ФОРМЫ, подписанная на странице
 * словом «пример»: имена вымышлены, числа не утверждают ничего о продукте.
 */

import type { Lang } from '$lib/content/langs';

/** Адресные слаги трёх обёрток — источник для маршрута, sitemap и хаба. Один список на всех. */
export const TEST_SLUGS = ['compatibility', 'personality', 'love'] as const;
export type TestSlug = (typeof TEST_SLUGS)[number];

type L<T> = Record<Lang, T>;

export interface TestStep { lead: string; rest: string }
export interface TestFaq { q: string; a: string }
export interface TestFact { icon: string; text: string }

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
  /** Мост-паспорт. */
  keepTitle: string;
  keepBody: string;
  keepCta: string;
  keepGhost: string;
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
  compatibility: {
    ru: {
      badge: 'Для двоих',
      // H1 — «Тест на совместимость», «тест для двоих» в подзаголовке (интервью №028, В2 = А).
      h1: 'Тест на совместимость',
      sub: 'Тест для двоих — по-настоящему: без выдуманных процентов. Вы оба оцениваете одни и те же вещи, а совпадения говорят сами за себя.',
      facts: ['без регистрации', '12 вещей · ~3 минуты', 'бесплатно'],
      steps: [
        { lead: 'Оцените 12 вещей', rest: 'звёздами — «правильных ответов» нет.' },
        { lead: 'Отправьте ссылку второму', rest: '— он проходит те же 12.' },
        { lead: 'Смотрите совпадения', rest: '— факты, не случайный процент.' },
      ],
      mirrorTitle: 'Ваша анкета растёт',
      mirrorEmpty: 'Поставьте первую оценку — здесь появятся первые факты о Вас.',
      inviteTitle: 'Позовите второго',
      inviteBody: 'Пройдите свою половину теста — и здесь появится личная ссылка для второго.',
      inviteNote: 'Результат увидите только вы двое: ссылка личная, в поиске её нет.',
      resultTitle: 'Каким будет результат',
      resultCaption: 'Вы и Аня · пример результата',
      resultRows: [
        { icon: '⭐', text: 'Вы оба поставили 10 — Warcraft III' },
        { icon: '🤝', text: 'Вы рядом в «Пацанах» и «Особом мнении»' },
        { icon: '💬', text: '«Катание на лыжах» вы видите по-разному — будет о чём поговорить' },
      ],
      resultFoot: 'Никаких процентов: только то, что можно проверить.',
      keepTitle: 'Это не разовый тест',
      keepBody: 'Каждая Ваша оценка уже собирается в анкету — Ваш NDim ID. Она живёт и растёт вместе с Вами, а Пространство ищет по ней людей, которые совпадают с Вами по-настоящему. Гостевая анкета хранится 7 дней.',
      keepCta: 'Сохранить мою анкету',
      keepGhost: 'Продолжить гостем',
      faq: [
        { q: 'Почему нет процента совместимости?', a: 'Проценты интернет-калькуляторов случайны. Мы показываем то, что можно проверить: ваши настоящие совпадения — по вещам, которые вы оба оценили.' },
        { q: 'Это бесплатно?', a: 'Да. Без рекламы, без подписок и без покупок.' },
        { q: 'Второй увидит все мои ответы?', a: 'Только по 12 вещам этого теста — вы оба на это соглашаетесь, начиная его. Остальная Ваша анкета видна так, как решите Вы.' },
      ],
      crossLinks: [
        { text: 'Узнать больше о себе — тест личности', slug: 'personality' },
        { text: 'Поиграть вдвоём — калькулятор любви', slug: 'love' },
      ],
      hubLine: 'Вы оба оцениваете одни и те же 12 вещей — совпадения говорят сами за себя.',
      hubCta: 'Пройти',
      metaTitle: 'Тест на совместимость для двоих — NDim Space',
      metaDesc: 'Честный тест на совместимость для двоих: вы оба оцениваете одни и те же фильмы, игры и привычки, а совпадения говорят сами за себя. Без регистрации и без выдуманных процентов.',
    },
    en: {
      badge: 'For two',
      h1: 'Compatibility test',
      sub: 'A test for two — for real: no made-up percentages. You both rate the same things, and the matches speak for themselves.',
      facts: ['no sign-up', '12 things · ~3 minutes', 'free'],
      steps: [
        { lead: 'Rate 12 things', rest: 'with stars — there are no “right answers”.' },
        { lead: 'Send the link to your partner', rest: '— they rate the same 12.' },
        { lead: 'See your matches', rest: '— facts, not a random percentage.' },
      ],
      mirrorTitle: 'Your profile is growing',
      mirrorEmpty: 'Give your first rating — the first facts about you will appear here.',
      inviteTitle: 'Invite the second person',
      inviteBody: 'Finish your half of the test — a personal link for the second person will appear here.',
      inviteNote: 'Only the two of you will see the result: the link is private and never appears in search.',
      resultTitle: 'What the result looks like',
      resultCaption: 'You and Anna · sample result',
      resultRows: [
        { icon: '⭐', text: 'You both gave a 10 — Warcraft III' },
        { icon: '🤝', text: 'You are close on “The Boys” and “Minority Report”' },
        { icon: '💬', text: 'You see “Skiing” differently — something to talk about' },
      ],
      resultFoot: 'No percentages: only things you can check.',
      keepTitle: 'This is not a one-time test',
      keepBody: 'Every rating you give is already building your profile — your NDim ID. It lives and grows with you, and NDim Space uses it to find people who truly match you. A guest profile is kept for 7 days.',
      keepCta: 'Save my profile',
      keepGhost: 'Continue as a guest',
      faq: [
        { q: 'Why is there no compatibility percentage?', a: 'Percentages in online calculators are random. We show what you can check: your real matches — on the things you both rated.' },
        { q: 'Is it free?', a: 'Yes. No ads, no subscriptions, no purchases.' },
        { q: 'Will the second person see all my answers?', a: 'Only on the 12 things of this test — you both agree to that by starting it. The rest of your profile is visible the way you decide.' },
      ],
      crossLinks: [
        { text: 'Learn more about yourself — the personality test', slug: 'personality' },
        { text: 'Play together — the love calculator', slug: 'love' },
      ],
      hubLine: 'You both rate the same 12 things — the matches speak for themselves.',
      hubCta: 'Take the test',
      metaTitle: 'Compatibility test for two — NDim Space',
      metaDesc: 'An honest compatibility test for two: you both rate the same movies, games and habits, and the matches speak for themselves. No sign-up and no made-up percentages.',
    },
  },

  personality: {
    ru: {
      badge: 'Для одного',
      h1: 'Тест личности',
      sub: 'Не готовый «тип личности», а живая анкета: факты о Вашем вкусе, которые растут с каждой оценкой.',
      facts: ['без регистрации', '12 вещей · ~3 минуты', 'бесплатно'],
      steps: [
        { lead: 'Оцените 12 вещей', rest: 'звёздами — настоящие фильмы, игры и привычки.' },
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
      metaDesc: 'Честный тест личности: вместо готового «типа» — живая анкета из Ваших настоящих ответов. Оцените знакомые фильмы, игры и привычки — без регистрации.',
    },
    en: {
      badge: 'For one',
      h1: 'Personality test',
      sub: 'Not a ready-made “personality type” — a living profile: facts about your taste that grow with every rating.',
      facts: ['no sign-up', '12 things · ~3 minutes', 'free'],
      steps: [
        { lead: 'Rate 12 things', rest: 'with stars — real movies, games and habits.' },
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
      metaDesc: 'An honest personality test: instead of a ready-made “type” — a living profile built from your real answers. Rate familiar movies, games and habits — no sign-up.',
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
