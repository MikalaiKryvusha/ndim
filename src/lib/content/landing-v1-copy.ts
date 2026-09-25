/**
 * ТЕКСТЫ НОВОЙ V1 ГЛАВНОЙ — `/`, `/ru`, `/en` (`plans/106` шаг Д2; эпик `plans/104`, фаза 2).
 *
 * 🔴 РУССКИЙ — ДОСЛОВНО ИЗ УТВЕРЖДЁННОГО МАКЕТА `design/new-landing-v1.html`, кроме строк, помеченных
 * `[AI]` ниже. Структура — №096 В5 «*сама структура нравится, утверждаю*»; заголовок, подзаголовок и
 * строка выдачи — вариант А (№096 В15); 12 вопросов и ответов — №096 В16 = А. Правка любой строки идёт
 * ЧЕРЕЗ ВЫЧИТКУ ВЛАДЕЛЬЦА, а не здесь.
 *
 * `[AI]` НОВЫЕ СТРОКИ RU (написаны по портрету `AUTHOR_STYLOMETRY.md`, поправлены независимой проверкой §7Б
 *   2026-09-25 — «практики» по слову каталога вместо «увлечения», противоречие ответов FAQ снято; на вычитке в
 *   интервью №097):
 *   · `demo.how` — демо стало десятью фильмами, сериалами и практиками (№096 В14); прежняя строка
 *     называла «пять фильмов и сериалов»;
 *   · строка Макса — прежняя называла «три из пяти»;
 *   · ответ FAQ «Как работает тест на совместимость?» — прежний называл «пять фильмов и сериалов».
 * `[AI]` ВЕСЬ АНГЛИЙСКИЙ — написан агентом от смысла (канон «Витрина», п. 1), на вычитке в №097 до боя.
 *
 * Слова «вымышленные» на странице нет нигде — слово владельца к герою V3.
 * [NOT-TESTED]
 */
import type { Lang } from './langs';
import type { PersonaId } from './landing-demo';

export type Bi = Readonly<Record<Lang, string>>;

export const landingV1 = {
  meta: {
    title: { ru: 'Знакомства по интересам — Пространство NDim Space', en: 'Meet people who share your interests — NDim Space' },
    desc: {
      ru: 'Знакомства по интересам и тест на совместимость. Оцените любимые фильмы, сериалы, книги и игры, и Пространство NDim Space найдёт Вам людей, похожих на Вас.',
      en: 'Meet people who share your interests and take the compatibility test. Rate the films, TV series, books and games you love, and NDim Space will find people like you.',
    },
  },
  top: {
    signin: { ru: 'Войти', en: 'Sign in' },
  },
  hero: {
    kicker: { ru: 'Знакомства нового измерения', en: 'Meeting people in a new dimension' },
    h1Lead: { ru: 'Знакомства по интересам в ', en: 'Meet people who share your interests in ' },
    h1Accent: { ru: 'Пространстве NDim Space', en: 'NDim Space' },
    lede: {
      ru: 'Оцените Ваши любимые фильмы, сериалы, книги и игры, и Пространство NDim Space найдёт Вам людей, похожих на Вас. Знакомиться, находить друзей и общаться по интересам в Пространстве NDim Space — бесплатно.',
      en: 'Rate your favourite films, TV series, books and games, and NDim Space will find people like you. Meeting people, making friends and talking about shared interests in NDim Space is free.',
    },
    down: { ru: 'Пройти тест на совместимость ↓', en: 'Take the compatibility test ↓' },
  },
  demo: {
    h2Lead: { ru: 'Тест на совместимость с ', en: 'Compatibility test with ' },
    h2Accent: { ru: 'Максом, Алисой и Настей', en: 'Liam, Emma and Mia' },
    /** `[AI]` новая строка — на вычитке (№097). */
    how: {
      ru: 'Тест на совместимость проходится без регистрации: оцените звёздами фильмы, сериалы и практики, которые Вы знаете, и Пространство NDim Space покажет, кто из Макса, Алисы и Насти думает так же, как и Вы. Практики — это то, чем люди занимаются: настольные игры, чтение, велоспорт и медитация. По Вашим оценкам Пространство NDim Space находит Вам друзей по интересам и людей для новых знакомств и общения.',
      en: 'Use the stars to rate the films, TV series and practices you know, and NDim Space will show you which of Liam, Emma and Mia thinks the same way you do. Practices are things people do: board gaming, reading, cycling and meditation.',
    },
    me: { ru: 'Я', en: 'Me' },
    popLead: { ru: ' — Ваша самая сильная связь: ', en: ' is your strongest connection: ' },
    bridge: { ru: 'Смотреть больше', en: 'See more' },
    mapLabel: {
      ru: 'Карта Пространства: Вы в центре, Макс, Алиса и Настя на настоящих расстояниях',
      en: 'Map of the Space: you in the centre, Liam, Emma and Mia at their real distances',
    },
  },
  results: {
    h2: { ru: 'Ваша Похожесть с Максом, Алисой и Настей', en: 'Your Similarity with Liam, Emma and Mia' },
    sub: {
      ru: 'Похожесть показывает, насколько Вы похожи с другим человеком. В Связях Пространство NDim Space показывает людей с наибольшей Похожестью на Вас.',
      en: 'Similarity shows how alike you and another person are. In Relations, NDim Space shows the people with the highest Similarity to you.',
    },
    loves: { ru: 'Любит: ', en: 'Loves: ' },
    storyBrand: { ru: 'Пространство NDim Space', en: 'NDim Space' },
    storyLead: { ru: 'Моя самая сильная связь — ', en: 'My strongest connection is ' },
    storySim: { ru: ': Похожесть ', en: ': Similarity ' },
    storyCaption: { ru: 'Карточка для сторис', en: 'Story card' },
  },
  /** Строки характера персонажей. `[AI]` строка Макса новая — на вычитке (№097). */
  persona: {
    alice: { ru: 'Алиса любит фантастику и истории о волшебстве.', en: 'Emma loves science fiction and stories about magic.' },
    max: {
      ru: 'Макс оценил пять из десяти фильмов, сериалов и практик: «Матрицу», «Интерстеллар», «Игру Престолов», настольные игры и велоспорт.',
      en: 'Liam rated five of the ten films, TV series and practices: “The Matrix”, “Interstellar”, “Game of Thrones”, board gaming and cycling.',
    },
    nastya: { ru: 'Настя любит сериалы и истории о большой любви.', en: 'Mia loves TV series and great love stories.' },
  } satisfies Record<PersonaId, Bi>,
  howto: {
    kicker: { ru: 'Как найти своих людей', en: 'How to find your people' },
    h2Accent: { ru: 'Пространство NDim Space', en: 'NDim Space' },
    h2Tail: {
      ru: ' находит людей, похожих на Вас, по Вашим любимым фильмам, сериалам, книгам и играм',
      en: ' finds people who are like you through your favourite films, series, books and games',
    },
    lede: {
      ru: 'Здесь Вы найдёте людей, действительно похожих на Вас. Забудьте о бесконечных свайпах — мы подберём тех, с кем у Вас настоящая совместимость.',
      en: 'Here you will find people who are genuinely like you. Forget endless swiping — we find the people you are truly compatible with.',
    },
    steps: [
      {
        ru: 'Люди оценивают объекты человеческой культуры — фильмы, сериалы, книги, игры.',
        en: 'People rate works of human culture — films, series, books, games.',
      },
      {
        ru: 'Пространство NDim Space считает Похожесть между людьми по их оценкам.',
        en: 'NDim Space works out the Similarity between people from their ratings.',
      },
      {
        ru: 'В Связях Вы видите людей с наибольшей Похожестью на Вас.',
        en: 'In Relations you see the people with the highest Similarity to you.',
      },
    ] satisfies Bi[],
    screens: {
      dims: { ru: 'Измерения', en: 'Dimensions' },
      space: { ru: 'Пространство', en: 'Space' },
      relations: { ru: 'Связи', en: 'Relations' },
    },
    nav: [
      { ru: 'Профиль', en: 'Profile' },
      { ru: 'Связи', en: 'Relations' },
      { ru: 'Пространство', en: 'Space' },
      { ru: 'Измерения', en: 'Dimensions' },
      { ru: 'Меню', en: 'Menu' },
    ] satisfies Bi[],
    system: { ru: 'системный персонаж', en: 'system character' },
    commonality: { ru: 'Общность', en: 'Commonality' },
    proximity: { ru: 'Близость', en: 'Proximity' },
    similarity: { ru: 'Похожесть', en: 'Similarity' },
  },
  nums: {
    title: { ru: 'Пространство NDim Space в числах', en: 'NDim Space in numbers' },
    dims: { ru: 'объектов человеческой культуры', en: 'works of human culture' },
    ratings: { ru: 'оценок поставлено', en: 'ratings given' },
    people: { ru: 'человек в Пространстве', en: 'people in the Space' },
    relations: { ru: 'связей рассчитано', en: 'relations computed' },
  },
  faqTitle: { ru: 'Вопросы и ответы', en: 'Questions and answers' },
  final: {
    h2: {
      ru: 'В Пространстве NDim Space Вы найдёте людей, действительно похожих на Вас.',
      en: 'In NDim Space you will find people who are genuinely like you.',
    },
    go: { ru: 'Оцените, чтобы найти людей, кто думает, как Вы', en: 'Rate the things you love to find people who think like you' },
  },
  foot: {
    line: {
      ru: 'Пространство NDim Space · открытая платформа, сделанная с заботой о людях',
      en: 'NDim Space · an open platform built with care for people',
    },
    links: {
      compatibility: { ru: 'Тест на совместимость', en: 'Compatibility test' },
      personality: { ru: 'Тест личности', en: 'Personality test' },
      love: { ru: 'Калькулятор любви', en: 'Love calculator' },
      catalog: { ru: 'Каталог', en: 'Catalog' },
      manual: { ru: 'Руководство', en: 'User guide' },
      about: { ru: 'О проекте', en: 'About' },
      author: { ru: 'Об авторе', en: 'About the author' },
      terms: { ru: 'Условия', en: 'Terms' },
      privacy: { ru: 'Политика', en: 'Privacy' },
    },
  },
} as const;

/**
 * 12 ВОПРОСОВ И ОТВЕТОВ В ТРЁХ ГРУППАХ — №096 В16 = А, как в макете.
 * `[AI]` ответ «Как работает тест на совместимость?» поправлен под десять объектов демо — на вычитке (№097).
 * Разметки FAQPage нет намеренно (`researches/26` §13): раздел пишется для людей и для ИИ-ответов.
 */
export const landingFaq: ReadonlyArray<{ group: Bi; items: ReadonlyArray<{ q: Bi; a: Bi }> }> = [
  {
    group: { ru: 'Пространство NDim Space и знакомства', en: 'NDim Space and meeting people' },
    items: [
      {
        q: { ru: 'Что такое Пространство NDim Space?', en: 'What is NDim Space?' },
        a: {
          ru: 'В Пространстве NDim Space Вы найдёте людей, действительно похожих на Вас. Люди оценивают объекты человеческой культуры — фильмы, сериалы, книги, игры. Пространство NDim Space считает Похожесть между людьми по их оценкам.',
          en: 'In NDim Space you will find people who are genuinely like you. People rate works of human culture — films, series, books, games. NDim Space works out the Similarity between people from their ratings.',
        },
      },
      {
        q: { ru: 'Как найти людей, похожих на меня?', en: 'How do I find people who are like me?' },
        a: {
          ru: 'Оцените фильмы, сериалы, книги и игры, которые Вы любите, и откройте Связи. В Связях Пространство NDim Space показывает людей с наибольшей Похожестью на Вас. Оценивайте больше фильмов, сериалов, книг и игр, которые Вы любите: каждая новая оценка уточняет Вашу Похожесть с другими людьми.',
          en: 'Rate the films, series, books and games you love, and open Relations. In Relations, NDim Space shows the people with the highest Similarity to you. Rate more of the films, series, books and games you love: every new rating makes your Similarity with other people more precise.',
        },
      },
      {
        q: { ru: 'Как найти друзей по интересам?', en: 'How do I find friends with shared interests?' },
        a: {
          ru: 'Пространство NDim Space находит друзей по интересам по Похожести. Похожесть между Вами и другим человеком Пространство NDim Space считает по Вашим оценкам фильмов, сериалов, книг и игр. Связи показывают людей, чьи оценки ближе всего к Вашим оценкам.',
          en: 'NDim Space finds friends with shared interests through Similarity. NDim Space works out the Similarity between you and another person from your ratings of films, series, books and games. Relations show the people whose ratings are closest to your ratings.',
        },
      },
      {
        q: { ru: 'Что видно в карточке человека в Связях?', en: "What do I see on a person's card in Relations?" },
        a: {
          ru: 'В карточке человека в Связях видны Похожесть с Вами и то, что человек открыл в своём профиле: имя, фото, пол, дату рождения и текст «О себе».',
          en: "A person's card in Relations shows their Similarity with you and what the person has made visible in their profile: name, photo, gender, date of birth and the “About me” text.",
        },
      },
    ],
  },
  {
    group: { ru: 'Тест на совместимость и Похожесть', en: 'The compatibility test and Similarity' },
    items: [
      {
        q: { ru: 'Как работает тест на совместимость?', en: 'How does the compatibility test work?' },
        a: {
          ru: 'В тесте на совместимость Пространство NDim Space сравнивает Ваши оценки фильмов, сериалов, книг, игр и практик с оценками других людей и считает по этим оценкам Похожесть. На главной странице Вы проходите тест на совместимость без регистрации: оцениваете звёздами фильмы, сериалы и практики, которые Вы знаете, и сразу видите, кто из Макса, Алисы и Насти думает так же, как и Вы. Внутри Пространства NDim Space Ваши оценки сравниваются с оценками людей Пространства NDim Space, и в Связях Вы находите друзей по интересам и людей для новых знакомств.',
          en: "The compatibility test compares your ratings with other people's ratings of the films, TV series, books, games and practices you have both rated, and NDim Space works out your Similarity from those ratings. On the home page you rate ten films, TV series and practices with stars and straight away see your Similarity with Liam, Emma and Mia: which of Liam, Emma and Mia thinks the same way you do.",
        },
      },
      {
        q: { ru: 'Как пройти тест на совместимость с другом?', en: 'How do I take the compatibility test with a friend?' },
        a: {
          ru: 'Откройте тест на совместимость для двоих в разделе «Тесты», оцените звёздами 12 вещей — фильмы, сериалы, игры и привычки — и отправьте другу личную ссылку. Друг оценит эти 12 вещей, Вы и друг нажмёте «Сравнить ответы», и Пространство NDim Space покажет, в чём Вы с другом совпадаете.',
          en: 'Open the compatibility test for two in the “Tests” section, rate 12 things with stars — films, series, games and habits — and send your friend your personal link. Your friend rates the same 12 things, you both press “Compare answers”, and NDim Space shows where you and your friend match.',
        },
      },
      {
        q: { ru: 'Как считается Похожесть?', en: 'How is Similarity calculated?' },
        a: {
          ru: 'Похожесть — это близость, умноженная на общность. Близость — насколько одинаково Вы и другой человек оценили общие вещи. Общность — насколько широко Ваши описания пересекаются.',
          en: 'Similarity is proximity multiplied by commonality. Proximity is how similarly you and another person rated the things you share. Commonality is how widely your descriptions overlap.',
        },
      },
    ],
  },
  {
    group: { ru: 'Бесплатно, данные и аккаунт', en: 'Free, your data and your account' },
    items: [
      {
        q: { ru: 'Сколько стоит Пространство NDim Space?', en: 'How much does NDim Space cost?' },
        a: {
          ru: 'Пространство NDim Space работает бесплатно для всех людей по всему Миру.',
          en: 'NDim Space is free for everyone all over the world.',
        },
      },
      {
        q: { ru: 'Нужна ли регистрация?', en: 'Do I need to sign up?' },
        a: {
          ru: 'Пространством NDim Space Вы пользуетесь гостем без регистрации: тест на совместимость проходится прямо на главной странице. Гостевой аккаунт живёт 7 дней с момента создания. Аккаунт, привязанный к Google или к Вашей почте, сохраняет Ваши оценки и Связи на любом устройстве.',
          en: 'You can use NDim Space as a guest without signing up: you take the compatibility test right on the home page. A guest account lasts 7 days from the moment it is created. An account linked to Google or to your email keeps your ratings and Relations on any device.',
        },
      },
      {
        q: { ru: 'Кто видит мои оценки?', en: 'Who sees my ratings?' },
        a: {
          ru: 'Ваши оценки видны Вам в Вашем профиле. В тесте на совместимость для двоих друг видит Ваши оценки тех вещей теста, которые оценили и Вы, и друг. В Связях другие люди видят Похожесть с Вами, и Ваша оценка входит в NDim Space Rating фильма, сериала, книги или игры вместе с оценками других людей.',
          en: 'Your ratings are visible to you in your profile. In the compatibility test for two, your friend sees your ratings of the test items that both you and your friend rated. In Relations other people see their Similarity with you, and your rating goes into the NDim Space Rating of the film, series, book or game together with the ratings of other people.',
        },
      },
      {
        q: { ru: 'Как удалить аккаунт?', en: 'How do I delete my account?' },
        a: {
          ru: 'Аккаунт и все его данные удаляются на странице «Удалить аккаунт»: войдите через Google или по ссылке из письма на Вашу почту и подтвердите удаление. Гостевой аккаунт удаляется вместе со всеми данными автоматически через 7 дней с момента создания.',
          en: 'An account and all its data are deleted on the “Delete account” page: sign in with Google or with the link from the email sent to you, and confirm the deletion. A guest account is deleted with all its data automatically 7 days after it is created.',
        },
      },
      {
        q: { ru: 'Где работает Пространство NDim Space?', en: 'Where does NDim Space work?' },
        a: {
          ru: 'Пространство NDim Space работает в браузере на телефоне и на компьютере, на русском и английском языках. Откройте ndimspace.app в любом браузере и войдите в аккаунт: Ваши оценки и Связи будут на каждом устройстве.',
          en: 'NDim Space works in the browser on your phone and your computer, in Russian and English. Open ndimspace.app in any browser and sign in to your account: your ratings and Relations will be on every device.',
        },
      },
    ],
  },
];
