/**
 * ВАНИЛЬНЫЙ ОСТРОВ ДВЕРИ КАРТОЧКИ КАТАЛОГА — `plans/75` Ш1, пункт 2 разведки.
 *
 * ── ПОЧЕМУ ЭТОТ ФАЙЛ ВООБЩЕ СУЩЕСТВУЕТ ────────────────────────────────────────────────────
 * Карточки каталога объявлены `csr = false`: клиентского JS у них НЕТ, и это куплено замером
 * (минус 10 222 файла `__data.json` ≈ 41 МБ на релиз, страница без бандла фреймворка).
 * Включить гидрацию «чтобы заработали звёзды» — откат оплаченной оптимизации на всей
 * SEO-поверхности, и разведка плана запретила это красным пунктом №1.
 *
 * Поэтому дверь живёт островом: разметка приезжает пререндером, этот скрипт вешает обработчики,
 * а тяжёлый слой данных (Firebase, ~212 КБ gzip) грузится ОТДЕЛЬНЫМ чанком и только тому, кто
 * реально тронул звёзды. Человек, пришедший из поиска почитать про фильм, не платит ни байтом.
 *
 * ── ЧТО ЗДЕСЬ НЕЛЬЗЯ ДЕЛАТЬ ───────────────────────────────────────────────────────────────
 * ⛔ Никаких `import`/`export` — файл уезжает в страницу ОБЫЧНЫМ инлайн-скриптом. Динамический
 *    `import()` в обычном скрипте законен, и им одним всё и держится.
 * ⛔ Никакого текста лица продукта из головы: все слова приходят из `data`-атрибутов, которые
 *    ставит пререндер по эталону Д3 и словам владельца. Скрипт не сочиняет ни одной строки.
 * ⛔ Никакого закрывающего тега `script` в строках — файл вставляется в HTML как есть, и такая
 *    последовательность порвала бы страницу. Стережёт `doorIslandScript` в `island-core.ts`.
 *
 * ── ЗАПАСНАЯ ДВЕРЬ ────────────────────────────────────────────────────────────────────────
 * Обычная ссылка двери стоит в разметке ВИДИМОЙ, а прячет её класс `door-js`, который ставит
 * микроскрипт в `<head>` до первой отрисовки. Отсюда два честных исхода без единой лишней
 * копии разметки: JS выключен — класс не появился, человек видит сегодняшнюю дверь; этот
 * остров упал с ошибкой — `catch` снимает класс, и сегодняшняя дверь возвращается.
 * Дверь карточки не имеет права исчезнуть ни при какой поломке: она и есть смысл страницы.
 *
 * ── ПОЧЕМУ ОБЫЧНЫЙ JS, А НЕ TypeScript ────────────────────────────────────────────────────
 * Файл едет в страницу ИСХОДНИКОМ — компилировать его на этом пути нечем. Типы при этом не
 * потеряны: разметку описывают аннотации JSDoc, и `npm run typecheck` судит этот файл наравне
 * с остальными. Заголовок до метки ниже в страницу не уезжает — его срезает `island-core.ts`.
 */
/* ОСТРОВ */
(function () {
  var door = /** @type {HTMLElement} */ (document.querySelector('[data-door]'));
  if (!door) return;

  try {
    var stars = /** @type {HTMLElement[]} */ ([].slice.call(door.querySelectorAll('[data-star]')));
    var hint = /** @type {HTMLElement} */ (door.querySelector('[data-door-hint]'));
    var panel = /** @type {HTMLElement} */ (door.querySelector('[data-door-panel]'));
    var enter = /** @type {HTMLAnchorElement} */ (door.querySelector('[data-door-enter]'));
    if (stars.length === 0 || !panel || !enter) return;

    var lang = door.getAttribute('data-lang') || '';
    var dimId = door.getAttribute('data-dim') || '';
    var engineUrl = door.getAttribute('data-engine') || '';
    // Шаблон подписи оценки — из пререндера, оба языка. «{v}» подставляет отметку человека.
    var hintTemplate = hint ? hint.getAttribute('data-template') || '' : '';
    if (engineUrl === '' || dimId === '') return;

    /** @type {Promise<{ rateFromDoor: (l: string, d: string, v: number) => Promise<string> }> | null} */
    var engine = null;
    /** @type {Promise<unknown> | null} */
    var pending = null;

    /**
     * Рисует ряд под выбранную отметку. Правило — канон жеста экрана «Измерения»: золото до
     * отметки включительно, пик на самой отметке, а ноль это ОСОЗНАННАЯ оценка и потому серый,
     * а не золотой (`AGENT_GUIDE` → шкала 0…10 и ноль как законная оценка).
     *
     * @param {number} value отметка человека, 0…10
     */
    function paint(value) {
      for (var i = 0; i < stars.length; i++) {
        stars[i].classList.toggle('fill', i <= value && value !== 0);
        stars[i].classList.toggle('peak', value === i && value !== 0);
        stars[i].classList.toggle('zero', value === 0 && i === 0);
        stars[i].setAttribute('aria-pressed', value === i ? 'true' : 'false');
        var glyph = stars[i].querySelector('i');
        if (glyph) glyph.textContent = i <= value ? '★' : '☆';
      }
    }

    /** Грузим движок один раз на страницу и держим само обещание модуля. */
    function loadEngine() {
      if (engine === null) engine = import(engineUrl);
      return engine;
    }

    /**
     * Оценка человека. Порядок намеренный: сначала ОТКЛИК (краска и мостик), потом запись.
     * Жест обязан ощущаться мгновенным, а рождение гостя и первая запись в Firebase — это
     * секунды на телефоне.
     *
     * @param {number} value
     */
    function choose(value) {
      paint(value);
      if (hint && hintTemplate !== '') {
        hint.textContent = hintTemplate.replace('{v}', String(value));
        hint.hidden = false;
      }
      panel.hidden = false;

      /*
       * Записи выстраиваются в очередь, а не гоняются наперегонки: человек может передумать и
       * ткнуть другую отметку, пока первая ещё летит. Последняя в цепочке и есть его оценка.
       */
      var previous = pending;
      pending = (previous === null ? loadEngine() : previous.then(loadEngine))
        .then(function (module) {
          return module.rateFromDoor(lang, dimId, value);
        })
        .catch(function () {
          /*
           * Запись не удалась (сеть, App Check, правила). Дверь всё равно обязана открыться:
           * человек войдёт гостем по `?guest=1` и оценит внутри. Молча — потому что своих слов
           * об отказе у продукта нет, а сочинять их агент не вправе.
           */
        });
    }

    for (var s = 0; s < stars.length; s++) {
      (function (value, button) {
        button.addEventListener('click', function () {
          choose(value);
        });
      })(s, stars[s]);
    }

    /**
     * ГОНКА «КОСНУЛСЯ → СРАЗУ НАЖАЛ КНОПКУ» (пункт 5 разведки плана).
     *
     * Без ожидания оценка теряется на пороге: переход убивает страницу вместе с летящей
     * записью. Ждём обещание — но с потолком: дверь, которая может не открыться никогда, хуже
     * потерянной оценки. Вышло время — уходим, внутри человек оценит снова.
     */
    enter.addEventListener('click', function (event) {
      if (pending === null) return;
      event.preventDefault();
      var target = enter.href;
      var go = function () {
        location.href = target;
      };
      var timeout = new Promise(function (resolve) {
        setTimeout(resolve, 8000);
      });
      Promise.race([pending, timeout]).then(go, go);
    });
  } catch (e) {
    // Остров сломался — возвращаем сегодняшнюю дверь, чтобы страница не осталась без выхода.
    document.documentElement.classList.remove('door-js');
  }
})();
