# Исследование 23 — Загрузка и обработка фотографии в браузере без внешних библиотек

**Снято:** 2026-07-31 · **Заказано:** `plans/13` фаза 1 (обзор индустрии) · **Обслуживает:**
`bugs/44` (нельзя загрузить или сменить фото), фазу «Аватар» эпика `plans/15`

> Обзор индустрии по правилу владельца (2026-07-28): *«почти на всё в индустрии есть золотые
> стандарты и научные работы»*. Каждое утверждение опирается на страницу, которую агент реально
> открыл, с дословной цитатой. Признак халтуры — обзор без ссылок на первоисточники.

**Канон, который сужает выбор до одного пути:** в 2.0 **ноль внешних скриптов и CDN-библиотек**.
Cropper.js, FilePond, PhotoSwipe и heic2any (≈1,5 МБ wasm) исключены по построению — в 1.x они
были, и именно их отсутствие делает эту работу «изобретением» без обзора.

---

## §1. Ориентация EXIF — писать парсер НЕ НУЖНО

Классическая боль «фото с телефона легло набок» закрыта браузерами в 2020 году.

| Факт | Источник |
|---|---|
| CSS `image-orientation` по умолчанию `from-image`, доступно во всех браузерах **с апреля 2020** | [MDN image-orientation](https://developer.mozilla.org/en-US/docs/Web/CSS/image-orientation) — «from-image — Default initial value. The EXIF information contained in the image is used to rotate the image appropriately» + баннер Baseline «available across browsers since April 2020» |
| В Chrome разворот по EXIF стал умолчанием **с версии 81** | [browser-compat-data css/properties/image-orientation.json](https://raw.githubusercontent.com/mdn/browser-compat-data/main/css/properties/image-orientation.json) — `"chrome": {"version_added": "81"}` |
| Firefox начал разворачивать в **77** | [Bugzilla 1616411](https://bugzilla.mozilla.org/show_bug.cgi?id=1616411) «CSS decorative images should respect EXIF-orientation by default», RESOLVED FIXED, `target_milestone: mozilla77` |
| WebKit разворачивал всегда (свойства `image-orientation` там фактически не было — поведение равно `from-image`) | [Bugzilla 1616169, комментарий 0](https://bugzilla.mozilla.org/show_bug.cgi?id=1616169) — «In WebKit, where there is no `image-orientation` property (it's effectively always `from-image`), the image drawn to the canvas will honor the EXIF orientation» |
| `createImageBitmap` по умолчанию `imageOrientation = "from-image"`; в стандарте enum состоит **только** из `from-image` и `flipY` | [WHATWG HTML, ImageBitmapOptions](https://html.spec.whatwg.org/multipage/imagebitmap-and-animations.html) — `enum ImageOrientation { "from-image", "flipY" };` |

**Правило для нас:** `createImageBitmap(file)` **без опций**, размеры кропа брать из
`naturalWidth`/`naturalHeight` (они уже с учётом EXIF). Ни парсера, ни чтения APP1.

⚠️ **Две ловушки, на которых легко порезаться:**

1. **Не передавать `imageOrientation` явно.** Строка `'from-image'` понята только Chrome 112+,
   Firefox 111+, Safari 16+; значения `'none'` нет ни в одном браузере
   ([BCD createImageBitmap.json](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/_globals/createImageBitmap.json)).
   Непонятое значение enum по WebIDL — **не игнорирование, а `TypeError`**: промис отклонится.
   То есть `{imageOrientation:'from-image'}` в Safari 15 — падение, а не «не сработало».
2. **CSS вообще не влияет на пиксели в canvas.** `drawImage`/`createImageBitmap` не читают CSS ни
   при каких условиях — «отменить» разворот там нечем. Отдельно MDN предупреждает:
   `image-orientation: none` **не действует на кросс-доменные картинки** («does not override the
   orientation of non-secure-origin images as encoded by their EXIF information, due to security
   concerns»), а тикет CSSWG называется прямее —
   [«image-orientation:none violates same-origin policy»](https://github.com/w3c/csswg-drafts/issues/5165).

---

## §2. HEIC с iPhone — единственный формат, который придётся отклонять

| Факт | Источник |
|---|---|
| **Safari 17** добавил HEIC именно ради импорта и правки фото в браузере | [WebKit blog, Safari 17.0](https://webkit.org/blog/14205/news-from-wwdc23-webkit-features-in-safari-17-0/) — «developers can support importing and editing such photos right in the browser, without needing to convert them into another format» |
| Chrome, Edge, Firefox HEIC **не поддерживают** ни в одной версии | [caniuse HEIF](https://caniuse.com/heif) |
| Причина — контейнер HEIF/HEIC в конвейере картинок, а **не** отсутствие HEVC: Chrome с версии 107 декодирует HEVC-**видео** | caniuse (там же) + сверка скептиком |

Уточнение к «единственный браузер»: точнее — **единственный движок**. На iOS все браузеры обязаны
использовать WebKit, поэтому Chrome и Firefox на iOS 17+ HEIC тоже покажут.

🔴 **Анти-паттерн, который выглядит как решение:** добавить `image/heic` в `accept`, чтобы
iOS-пикер не блокировал файл. [Форум Apple, тред 743049](https://developer.apple.com/forums/thread/743049):
с `accept="image/*,image/heic"` **Safari 17+ конвертирует выбранные JPEG/PNG в `.heic`** — файл
приезжает как `tempImage….heic` с типом `image/heic`, и его не откроет уже Chrome-часть аудитории.
Держим `accept="image/*"` и ничего больше.

**И `accept` — не фильтр, а подсказка.** Спецификация HTML: *«accept — Hint for expected file type
in file upload controls»* ([HTML spec, input](https://html.spec.whatwg.org/dev/input.html)); MDN:
*«The accept attribute doesn't validate the types of the selected files»*. Сервера у нас нет —
значит настоящих барьера два: проверка в JS после выбора и **правила Storage**.

**Путь без библиотек:** попытаться декодировать, при отказе — честная фраза человеку по правилам
продукта («Вы», без жаргона). Формулировку утверждает владелец.

---

## §3. Память и лимиты canvas — здесь вкладка умирает молча

| Факт | Источник |
|---|---|
| Жёсткий потолок площади в исходниках WebKit: **8192×8192 на iOS**, 16384×16384 на десктопе; при превышении буфер **не создаётся**, в консоль пишется предупреждение | [WebKit/Source/WebCore/html/CanvasBase.cpp](https://raw.githubusercontent.com/WebKit/WebKit/main/Source/WebCore/html/CanvasBase.cpp) — `#if PLATFORM(IOS_FAMILY) return 8192 * 8192;` … `"Canvas area exceeds the maximum limit"` |
| Практический предел iOS — **4096×4096**; превышение делает canvas непригодным: **команды рисования просто не работают** | [MDN canvas](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/canvas) — «notably iOS devices limit the canvas size to only 4,096 x 4,096 pixels… Exceeding the maximum dimensions or area renders the canvas unusable — drawing commands will not work» |
| Замеры проекта canvas-size подтверждают 4096×4096 у Mobile Safari 9+ | [canvas-size/docs/index.md](https://raw.githubusercontent.com/jhildenbiddle/canvas-size/master/docs/index.md) |

🔴 **Самое опасное здесь — отказ БЕЗ исключения.** Код «отработал», ошибки нет, а человек видит
белый круг. Это ровно канон `TESTING_FRAMEWORK.md` «сгенерированному не доверяй»: после отрисовки
проверять **результат** (непустой blob), а не отсутствие ошибки.

**Приём против убитой вкладки** — декодировать сразу в нужный размер, полноразмерный битмап в
память не поднимать: `createImageBitmap(file, {resizeWidth, resizeHeight, resizeQuality:'high'})`
(WHATWG HTML; поддержка Chrome 54+, Safari 15+, Firefox 98+).

⚠️ **Умолчание `resizeQuality` — `'low'`** ([MDN createImageBitmap](https://developer.mozilla.org/en-US/docs/Web/API/Window/createImageBitmap)).
Без явного `'high'` уменьшение 4000→512 даст рваные края.
И **не строить качество на `ctx.imageSmoothingQuality`**: в Firefox его нет вовсе
([BCD CanvasRenderingContext2D.json](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/CanvasRenderingContext2D.json)).

**Гигиена памяти (иначе «баг вёрстки» после третьей примерки кропа):**
`ImageBitmap.close()` — *«disposes of all graphical resources»* ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/ImageBitmap/close));
`URL.revokeObjectURL` для превью. И **никакого `FileReader.readAsDataURL`**: base64 раздувает
12-мегабайтный снимок в ~16 МБ строки.

`OffscreenCanvas` (Baseline с марта 2023) отложен по бритве Оккама: `createImageBitmap` и так
декодирует вне главного потока, кодирование 512×512 занимает миллисекунды. Воркер — только если
замер покажет фриз.

---

## §4. 🔴 WebP из canvas: Safari не кодирует — самая дорогая находка

| Факт | Источник |
|---|---|
| `canvas.toBlob('image/webp')` **не поддержан Safari** — ни десктопным, ни iOS, вплоть до 26–27 | [caniuse toBlob webp](https://caniuse.com/mdn-api_htmlcanvaselement_toblob_type_parameter_webp) · [BCD HTMLCanvasElement.json](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/HTMLCanvasElement.json) — `"safari": { "version_added": false }` |
| Откат при неподдержанном типе — **молчаливый PNG** | [MDN toBlob](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob) — «if the given format is not supported, then the data will be exported as `image/png`» |
| AVIF из canvas не кодирует **ни один** браузер (в BCD только png, jpeg, webp) | BCD HTMLCanvasElement.json |

**Почему это дорого именно нам:** путь в Storage — `users/{uid}/avatar/avatar.webp`, наследие 1.x,
и менять его нельзя (там лежат фото 13 живых людей). На iPhone `toBlob('image/webp')` отдаст **PNG**,
и мы запишем PNG под именем `.webp`.

**Замер агента** `[TESTED: 2026-07-31 · headless Chromium, реальный портрет, центральный квадрат]`:

| Формат | 512×512 | 256×256 |
|---|---|---|
| WebP q=0.7 | **10,0 КБ** | — |
| WebP q=0.8 | **12,4 КБ** | 5,6 КБ |
| WebP q=0.9 | 18,9 КБ | — |
| JPEG q=0.85 | 24,3 КБ | — |
| PNG | **323 КБ** | — |

Совпадает с заявкой Google: *«WebP lossy images are 25-34% smaller than comparable JPEG images at
equivalent SSIM quality index»* ([developers.google.com/speed/webp](https://developers.google.com/speed/webp)).

🔴 **Обязательная строка кода:** после `toBlob` проверять `blob.type`. Без неё дефект «на айфоне
аватар весит 300 КБ» найдётся только в бою.

⚠️ **WebKit из Playwright ≠ Safari.** Сборка WebKit в Playwright в замере агента **выдала**
`image/webp`, а настоящий Safari, по caniuse и BCD, не умеет. Кодеки проверяются только на живом
устройстве — прибора у нас нет, это вопрос владельцу (§7).

---

## §5. Доступность: файловое поле, кроп, размеры целей

**Кнопка выбора файла.** Настоящий `<input type=file>` + `<label for>` + `opacity: 0` —
и **никогда** `display:none`/`visibility:hidden`: MDN прямо объясняет почему —
*«assistive technology interprets the latter two styles to mean the file input isn't interactive»*
([MDN input/file](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input/file)).
Кастомная `<button>` над скрытым input — прямая потеря клавиатуры и диктора.

**Атрибут `capture` не ставить**: на телефоне он уводит сразу в камеру и отнимает выбор «из
галереи». Без атрибута решает браузер (MDN, там же).

**Перетаскивание в кропе — вопрос соответствия, а не удобства:**

- **WCAG 2.2 SC 2.5.7 «Dragging Movements» (AA)**: *«All functionality that uses a dragging movement
  for operation can be achieved by a single pointer without dragging, unless dragging is essential»*
  ([W3C](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html)).
- **SC 2.5.1 «Pointer Gestures» (уровень A — строже!)** запрещает делать пинч единственным способом
  зума; канонический пример в самом стандарте — кнопки «+/−» рядом с картой
  ([W3C](https://www.w3.org/WAI/WCAG22/Understanding/pointer-gestures.html)).
- **SC 2.5.8 «Target Size (Minimum)» (AA)** — цель не меньше **24×24** CSS-пикселей
  ([W3C](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)).

⇒ Кроп обязан иметь **однопальцевую альтернативу**: кнопки зума и сдвига (или «клик — сюда центр»).
Это критерий, а не пожелание. Какая именно форма — вопрос макетов, не кода.

**Механика жеста без библиотек — три обработчика:**
`setPointerCapture()` перенаправляет события на элемент и даёт тянуть за его границами, снимается
сам на `pointerup` ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Element/setPointerCapture)) —
именно ради этого обычно тянут Cropper.js. Плюс `touch-action: none` **только на области кропа**,
иначе браузер заберёт панорамирование и пришлёт `pointercancel`
([MDN touch-action](https://developer.mozilla.org/en-US/docs/Web/CSS/touch-action)).

---

## §6. Выгрузка в Firebase Storage

| Вопрос | Ответ | Источник |
|---|---|---|
| `uploadBytes` или `uploadBytesResumable`? | Первый проще («The upload is not resumable»), второй даёт прогресс и **`cancel()`** | [firebase-js-sdk docs-devsite/storage.md](https://raw.githubusercontent.com/firebase/firebase-js-sdk/master/docs-devsite/storage.md) |
| Честна ли отмена? | `cancel()` возвращает «True if the cancel had an effect» — если файл уже долетел, интерфейс обязан показать НОВОЕ фото, а не соврать «отменено» | [storage.uploadtask.md](https://raw.githubusercontent.com/firebase/firebase-js-sdk/master/docs-devsite/storage.uploadtask.md) |
| Метаданные | `contentType` берём из **`blob.type`**, а не из имени файла; `cacheControl` задаётся явно | [Firebase file-metadata](https://firebase.google.com/docs/storage/web/file-metadata) |
| Настоящий барьер | `request.resource.size` и `request.resource.contentType.matches('image/.*')` в правилах | [Storage rules-conditions](https://firebase.google.com/docs/storage/security/rules-conditions) |

🔴 **Ловушка правил:** написать `matches('image/webp')` — значит отрезать загрузку с iPhone (§4).
Только `image/.*` плюс потолок размера, и потолок называет владелец (`bugs/04` шаг 4).

⚠️ **Кеш при фиксированном имени файла.** Путь один и тот же всегда, значит после замены браузер
может показывать старое фото. Наш `avatar.ts` качает через `getDownloadURL` + `fetch` → blob-URL —
то есть HTTP-заголовки нас касаются напрямую. Меняется ли download-token при перезаписи объекта —
**не проверено**, мерить на эмуляторе Storage.

---

## §7. Решения владельца — интервью №008, получены 2026-08-01

1. ✅ **В7 = А. На Safari пишем JPEG** под тем же именем `avatar.webp`, с честным
   `contentType: image/jpeg` (~24 КБ). Остальные браузеры — WebP (~12 КБ). Имя пути не меняется.
2. ✅ **В8 = «А + webp/jpeg».** Потолок **5 МБ**, тип — **только `image/webp` и `image/jpeg`**
   (уже, чем `image/.*`, который предлагал агент). Боевая строка правила — в `bugs/04`.
   🔴 Это делает правило **страховкой** пункта 1: сломается определение формата — PNG будет
   отвергнут правилом, а не записан тихо. Отказ честный, но текст его обязан быть человеческим.
3. ✅ **В9. iPhone откладывается**, приоритет — **Android и десктоп**. Дословно: *«на айфоне будем
   тестировать позже… в приоритете нормальные устройства — Андроид, Десктоп»*.
   ⚠️ **Цена названа явно:** ветка JPEG будет написана и покрыта проверкой `blob.type`, но выйдет
   с пометкой **`[NOT-TESTED]` на живом Safari**. Приёмка переносится, а не отменяется — три факта
   (§4, §2, §3) остаются нужны, просто позже.

**Осталось открытым (решается макетами или замером, не вопросом владельцу):**

- **Потолок стороны:** 256 / 512 / 1024. Круглое фото в виджете и «на весь экран» — разные
  требования к разрешению. Решается замером на утверждённом макете.
- **Форма однопальцевой альтернативы** перетаскиванию — композиция, то есть фаза макетов.
- **Текст отказа** при HEIC/битом файле — пишется по правилам текста продукта и показывается
  владельцу вместе с макетом.
- **Меняется ли download-token** при перезаписи объекта Storage — мерить на эмуляторе.

---

## §8. Анти-паттерны (что индустрия отвергла или чем платит)

- Подключить Cropper.js / FilePond / heic2any «на один раз» — запрещено каноном и не нужно: кроп на
  Pointer Events это ~60 строк.
- Свой парсер EXIF — работа, которую браузеры делают с 2020 года.
- `imageOrientation: 'none'` — такого значения в стандарте нет, а в новых движках это `TypeError`.
- Считать `accept` фильтром; добавлять в него `image/heic` (Safari 17+ начнёт конвертировать JPEG).
- Ставить `capture` у поля аватара.
- Загонять снимок в canvas в полном разрешении — на iOS canvas молча перестаёт рисовать.
- `FileReader.readAsDataURL` ради превью.
- Забыть `revokeObjectURL` и `ImageBitmap.close()`.
- Уменьшать 4000→256 одним `drawImage` с расчётом на `imageSmoothingQuality` (в Firefox его нет).
- `toBlob('image/webp')` без проверки `blob.type`.
- Считать Playwright WebKit эквивалентом Safari.
- Кастомная кнопка над `display:none` input.
- Кроп только пинчем и перетаскиванием — нарушение SC 2.5.1 (A) и 2.5.7 (AA).
- `contentType` по расширению имени, а не по `blob.type`.
- Ужесточение правил до `image/webp` — отрежет iPhone.
- Хранить фото в Firestore (документ ограничен ~1 МБ; фото живёт в Storage — `EXP-0043`).

## Ссылки

`plans/13` (заказчик обзора, фаза 1) · `plans/15` (метаплан эпика) · `bugs/44` · `bugs/04` ·
`EXP-0043` (фото живёт в Storage) · `EXP-0063` («нашёл конфиг» ≠ «нашёл причину») ·
`src/lib/data/avatar.ts` · `researches/12` §«Дом»
