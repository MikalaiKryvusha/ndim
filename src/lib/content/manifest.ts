/**
 * Манифест Пространства NDim — текст, утверждённый владельцем (design/menu-mockups.html, V1;
 * источник — манифест руководства 1.x, researches/07 §1).
 *
 * Живёт отдельным модулем, потому что показывается в ДВУХ местах (bugs/38): виджетом на
 * десктопном «Меню» и полной страницей /menu/manifesto (мобильная ведёт туда кнопкой).
 * Правило текста: пишем о том, что ЕСТЬ, — о цели и ценностях, а не о том, чего нет.
 * Выделения <b> — часть авторской формулировки; текст статический, не пользовательский.
 */
export const MANIFEST = {
  title: {
    ru: 'Зачем существует Пространство NDim',
    en: 'Why NDim Space exists',
  },
  paragraphs: {
    ru: [
      'Пространство NDim ищет людей, <b>похожих друг на друга</b> — по внутреннему миру, характеру, взглядам. Не по анкете и не по фотографии: только по тому, как человек сам оценил важные для себя вещи. Считает это <b>строгая математика</b>, одинаково беспристрастная ко всем — независимо от пола, происхождения, веры и убеждений.',
      'Пространство создано, чтобы <b>объединять людей</b> — по интересам, убеждениям, образу мысли — и чтобы в мире становилось больше дружбы, поддержки и любви. Оно стоит на взаимном уважении, доброжелательности, честности и доверии.',
      'Пространство работает <b>бесплатно</b> и открыто для всех, где есть интернет.',
      'Когда мир, благодаря Пространству NDim, станет более добрым и приятным местом для жизни, — можно будет считать, что оно успешно выполнило свою работу.',
    ],
    en: [
      'NDim Space looks for people who are <b>similar to each other</b> — by their inner world, character and views. Not by a questionnaire and not by a photo: only by how a person rated the things that matter to them. This is computed by <b>rigorous mathematics</b>, equally impartial to everyone — regardless of gender, origin, faith or beliefs.',
      'The Space was created to <b>bring people together</b> — by interests, beliefs and ways of thinking — so that there is more friendship, support and love in the world. It stands on mutual respect, goodwill, honesty and trust.',
      'The Space works <b>free of charge</b> and is open to everyone who has the internet.',
      'When the world, thanks to NDim Space, becomes a kinder and more pleasant place to live — we can consider that it has done its job.',
    ],
  },
} as const;
