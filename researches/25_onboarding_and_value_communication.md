# Исследование 25 — Вход без регистрации и донесение ценности: обзор индустрии

**Снято:** 2026-08-01 · **Заказано:** интервью №009 («Что я сделаю, когда получу ответы», п. 1 —
«обзор индустрии: как устроены онбординг и первый экран у продуктов, решивших ту же задачу») ·
**Обслуживает:** `interviews/interview_009_frictionless_entry.md` (вопросы В1, В2, В3, В4, В6),
`plans/03` этап 5, боль `ideas/09`

> Ступень 1 лестницы `/plan-epic` для эпика «вход человека в NDim». Каждое утверждение — с URL
> первоисточника и дословной цитатой на языке оригинала. **Живой справочник — не помечается DONE.**
>
> 🔴 **Главное правило этого документа: я НЕ ставлю числа, которых не видел на странице.** Там, где
> замера нет, написано «замера не нашёл» — и это тоже ответ. Там, где страница не открылась или
> лежит за пейволлом, так и написано. Значительная часть работы над этим документом ушла не на
> сбор цифр, а на **отбраковку** цифр, которые кочуют по блогам без первоисточника (§14).

---

## §0. Что уже сказано в `researches/10` и здесь НЕ повторяется

`researches/10_onboarding_friction.md` (2026-07-11) закрыл диагностическую часть. Чтобы этот
документ не был его пересказом, вот граница.

| Тема | Где живёт | Здесь |
|---|---|---|
| Три разрыва боли 1.x (доверие / ценность / «нечего пощупать») и их имена в литературе | `researches/10` §1 | не повторяю |
| Паттерн «lazy registration / gradual engagement» как идея | `researches/10` §2.2 | не повторяю **идею**; здесь — её **замеры** и её **цена** |
| Примеры Duolingo / GOAT / Zocdoc / TED пересказом Appcues | `researches/10` §2.2 | здесь — те же и другие продукты, но **по официальным источникам** и с точным ответом «в какой момент просят аккаунт» |
| Микрокопия доверия, соц-доказательство, соц-логин | `researches/10` §2.3 | здесь — **что из этого реально замерено**, и обратная находка (§9.3) |
| Механика Firebase Anonymous Auth | `researches/10` §2.4 | здесь — **цена** этой механики: одно устройство, невосстановимость, ePrivacy (§13) |
| Уникальные козыри NDim (ядро в браузере, AGPL, «не берём денег») | `researches/10` §3 | не повторяю |

**Чего в `researches/10` нет вовсе — и ради чего написан этот документ:**

1. Первоисточник единственного публичного замера отложенной регистрации (Duolingo) — и то, что
   этот замер устроен **не так**, как мы собрались делать (§2, §6).
2. Количественный тест онбординг-туров: 70 человек, NN/g — прямая проверка варианта Б вопроса В1 (§8).
3. Замеры внимания: сколько секунд и сколько слов у нас есть на первом экране (§7).
4. Обратная сторона медали: **стена регистрации, поставленная в правильном месте, работает** и не
   роняет трафик — измерено у издателей (§4).
5. Академическая база «вложенного труда»: IKEA-эффект и endowed progress — и точка, в которой она
   превращается в тёмный паттерн, запрещённый нам `GOAL.md` (§11).
6. Регуляторная рамка тёмных паттернов (DSA), которая называет своими именами два приёма, стоящих
   в наших вариантах ответов (§12).
7. Цена гостевого входа: одно устройство, невосстановимость, абуз (§13).
8. Список чисел, которыми **нельзя** пользоваться (§14).

---

## §1. Как читать пометки

- **ФАКТ** — наблюдаемое устройство продукта или текст норматива. Проверяется открытием страницы.
- **ЗАМЕР** — число из источника, который его получил или прямо на него ссылается. Всегда указано,
  кто мерил и на какой выборке.
- **МНЕНИЕ** — рекомендация практика или организации без числа. Ценно (NN/g — сильнейшая
  экспертиза в отрасли), но это не доказательство.
- 🔴 — место, где интуиция обманывает, и я это проверил.
- ⚠️ — оговорка, без которой цитату нельзя применять.

---

## §2. Единственный публичный замер отложенной регистрации — Duolingo

Это самый цитируемый кейс в отрасли, и почти все пересказы искажают его. Я нашёл первоисточник —
интервью Джины Готтхильф (Gina Gotthilf), вице-президента по росту Duolingo, изданию First Round
Review.

**ЗАМЕР.** Перенос экрана регистрации назад по флоу:

> «Simply moving the sign-up screen back a few steps led to about a 20% increase in DAUs.»
> — [review.firstround.com/the-tenets-of-a-b-testing-from-duolingos-master-growth-hacker](https://review.firstround.com/the-tenets-of-a-b-testing-from-duolingos-master-growth-hacker/)

⚠️ Метрика — **DAU**, а не «конверсия в аккаунт». Это важно: Duolingo меряет не то, что мерим мы.

**ФАКТ.** Что Duolingo построил вместо стены — не «просьбу по делу», а **лестницу из мягких стен и
одной жёсткой**:

> «optional pages that ask users to sign up, but allow them to keep going by hitting "Later"»
> «We have three of those soft walls now. Finally, there's a hard wall, after several lessons, that
> basically says if you want to move forward, you have to sign up.»
> — там же

🔴 **Самая важная строка всего документа**, и она противоречит нашему рекомендованному В4=А:

> «without those soft walls priming a sign-up as they're ignored, those hard walls perform
> significantly worse.»
> — там же

То есть у Duolingo измерено: **повторяющаяся необязательная просьба готовит человека** к моменту,
когда просьба станет обязательной. Убери мягкие просьбы — обязательная сработает заметно хуже.
Это прямой аргумент против «просим ровно один раз, по делу» и в пользу «просим несколько раз мягко,
и человек всегда может сказать "позже"».

**ЗАМЕР.** Довесок от оптимизации самих стен:

> «an 8.2% increase in DAUs» — там же (о последующей доводке мягких и жёсткой стен)

**ФАКТ + МНЕНИЕ.** Формулировка кнопки отказа тоже проверялась:

> «There was a big red button at the bottom of the screen that said "Discard my progress"… swapping
> that design for a subtle button that simply read "Later" moved the needle.»
> — там же

⚠️ «Moved the needle» — без числа. Направление названо, величина нет.

**Что это значит для нас.** У нас сегодня кнопка называется **«позже»** (`plans/03` этап 2) — это
совпадает с найденным лучшим вариантом Duolingo. А вот «Discard my progress» — ровно тот тип текста,
который у них проиграл: он называет цену отказа, а не действие.

---

## §3. Стена входа: что говорит NN/g

NN/g даёт **мнения**, а не замеры, но это мнения, стоящие на многолетних юзабилити-тестах, и они
единодушны.

**МНЕНИЕ.** Определение и общий вердикт:

> «Login walls are pages that ask the user to log in or register before proceeding.»
> «Users are utterly vexed to have to enter information before they get a taste of what is in store
> for them.»
> — [nngroup.com/articles/login-walls](https://www.nngroup.com/articles/login-walls/) (Raluca Budiu, 2014)

**ФАКТ (реплика испытуемого).** Голос человека из их исследования:

> «Another thing that gets me is registering on a thousand different websites. It annoys me to no
> end, because you're going there for very basic information, so what's the point?»
> — там же

**МНЕНИЕ.** Асимметрия «цена известна, ценность нет» — это буквально диагноз нашего лендинга:

> пользователи «have little idea of what the value of using your site or app is, but they do know
> that the cost of filling in a form is quite high»
> — там же

**МНЕНИЕ.** Когда стена оправдана:

> «Applications that are highly personal (such as email or banking apps) are justified in raising
> login walls for potential intruders.»
> — там же

**МНЕНИЕ.** Принцип взаимности — просить ПОСЛЕ того, как помог:

> «Postponing the password creation until after the purchase has been completed takes advantage of
> the reciprocity principle: once you've helped users smoothly complete their transaction, they may
> be grateful for a pleasant experience and willing to create an account.»
> — там же

**МНЕНИЕ.** Чеклист регистрации:

> «Login or registration should be optional and as many features as possible should be available
> without logging in.»
> «Always provide guest checkout as an escape hatch.»
> «Explain the benefits of registration. What do people get by creating an account?»
> «Ask only for the minimum amount of information in the registration form. Ideally, email and
> password should be enough.»
> — [nngroup.com/articles/checklist-registration-login](https://www.nngroup.com/articles/checklist-registration-login/) (2017)

**МНЕНИЕ.** Отдельная статья про принудительную регистрацию:

> «Forcing registration causes lost sales. Some users will leave the site, others will struggle with
> registration.»
> «The higher the interaction cost, the fewer people will complete a process.»
> — [nngroup.com/articles/optional-registration](https://www.nngroup.com/articles/optional-registration/) (Amy Schade, 2015)

**МНЕНИЕ (2025, свежее).** Метафора доверия как счёта, с которого можно уйти в минус:

> «Every extra field increases the chance they'll give up.»
> «Every question is a withdrawal, and if you ask too many — or ones that feel unnecessary or
> intrusive — you risk overdrafting trust and losing the user altogether.»
> «If you are unable to provide a good reason for collecting a piece of information, then this
> question shouldn't be included in the first place.»
> — [nngroup.com/articles/eas-framework-simplify-forms](https://www.nngroup.com/articles/eas-framework-simplify-forms/) (2025)

### 3.1 Единственный настоящий ЗАМЕР этого раздела — Baymard

**ЗАМЕР.** Опрос 1 026 взрослых жителей США, покупавших онлайн за последние 3 месяца:

> «The site wanted me to create an account» — **18%**
> (в том же списке: «Extra costs too high (shipping, tax, fees)» — 40%; «I didn't trust the site
> with my credit card information» — 19%; «Too long / complicated checkout process» — 17%)
> — [baymard.com/lists/cart-abandonment-rate](https://baymard.com/lists/cart-abandonment-rate)

> «18% of participants reported abandoning an order because they did not want to create an account.»
> «62% of sites fail to make "Guest Checkout" the most prominent option.»
> — [baymard.com/blog/current-state-of-checkout-ux](https://baymard.com/blog/current-state-of-checkout-ux) (13.11.2024)

**ЗАМЕР.** Сколько сайтов ошибаются с моментом просьбы:

> «Yet 42% of sites ask users to create an account at the beginning of checkout or before users have
> placed their order»
> «Saving account creation for the confirmation step keeps users focused on completing checkout»
> — [baymard.com/blog/delayed-account-creation](https://baymard.com/blog/delayed-account-creation)

**ФАКТ (реплики испытуемых Baymard).** Полезны как готовые формулировки страха:

> «This is annoying… I don't want to just stop what I'm doing to go create an account, verify my
> email, then come back here.»
> «It's asking me to create a password, which I honestly just — I don't love that. I'm just gonna
> leave that blank and see what happens.»
> — там же

**ЗАМЕР (другой, более крупный — и его чаще всего перевирают).** На отдельной странице Baymard
приводит второе число из своего количественного исследования 2022 года:

> «Baymard's quantitative study on reasons for checkout abandonment shows that 24% of US internet
> shoppers have abandoned one or more shopping carts during the past quarter due solely to forced
> account creation (4,384 respondents, US adults, 2022).»
> — [baymard.com/blog/make-guest-checkout-prominent](https://baymard.com/blog/make-guest-checkout-prominent)

🔴 **18% и 24% — не противоречие, а разные вопросы.** 18% — доля тех, кто назвал требование аккаунта
причиной отказа от **последней** брошенной корзины (n=1026). 24% — доля тех, кто **хотя бы раз за
квартал** бросил корзину именно из-за этого (n=4384). Сторонние блоги цитируют это же исследование
как 26%, 25% и 19%. **Ни одно из этих трёх на страницах Baymard не подтверждается.**

⚠️ Baymard прячет количественную часть за премиум-подпиской (`/premium/quant-insights/`). Публично
видны итоговые проценты, но не методика.

🔴 **И самое важное про наш собственный экран.** Федеральная торговая комиссия США в своей
таксономии тёмных паттернов перечисляет **принуждение к регистрации отдельным пунктом**:

> «Forced Registration or Enrollment — Making users create an account or share their information to
> complete a task. Example: "Create an account to continue with your purchase"»
> — FTC Staff Report «Bringing Dark Patterns to Light» (14.09.2022), Appendix A,
> [ftc.gov/system/files/…/Dark Patterns Report 9.14.2022 - FINAL.pdf](https://www.ftc.gov/system/files/ftc_gov/pdf/P214800%20Dark%20Patterns%20Report%209.14.2022%20-%20FINAL.pdf)
> *(ftc.gov отдаёт 403 на автозапрос; PDF скачан браузерным заголовком и извлечён в текст)*

То есть экран `/profile` в его сегодняшнем виде — «Войдите в Пространство» с гостевой дверью
мелкой ссылкой под ним — попадает **в опубликованный перечень тёмных паттернов регулятора**. Не как
нарушение (мы ничего не продаём и никого не обманываем), но как **названный поимённо приём**. Для
проекта, чей `GOAL.md` строится на добре, это не юридический, а репутационный аргумент, и он
сильнее юридического.

---

## §4. Обратная сторона: стена, поставленная в правильном месте, РАБОТАЕТ

Это раздел, которого нет в `researches/10`, и он честно портит простую картину «стена = зло».

**ЗАМЕР.** Кейс регионального издателя, отслеженный аналитической фирмой Mather Economics 12 месяцев
после запуска стены регистрации (февраль 2022):

> «After one year, the registration wall increased known users by 5.8X»
> «subscriptions grew by 60%, largely attributable to the registration wall»
> «Monthly page views were not impacted»
> «The percent of known users online grew from 1% to 4%»
> «the registration wall was shown on a reader's second article attempt, offering one additional free
> article in exchange for registration»
> «30% of users hit the registration wall with 3.14% registering per month»
> — [mathereconomics.com/an-inside-look-on-how-registration-walls-impact-subscriber-growth](https://www.mathereconomics.com/an-inside-look-on-how-registration-walls-impact-subscriber-growth/)

⚠️ Важная оговорка самого источника: эффект пришёл не сразу —

> «there was a lag-time of three months before the registration wall yielded measurable subscriber
> growth»
> — там же

**ЗАМЕР (вторичный, самоотчёт издателя).** Сравнение стены с обычной формой подписки на рассылку:

> «Over a 30-day test period, Salem Reporter ran both signup methods simultaneously… The registration
> wall generated **16 times more signups** than the newsletter form.»
> «20% of those free registered readers eventually converted to paid subscribers.»
> — [leakypaywall.com/registration-wall-vs-newsletter-signup](https://leakypaywall.com/registration-wall-vs-newsletter-signup/)

⚠️ Это цифры самого издателя в блоге поставщика ПО для платного доступа, без независимой проверки.
Беру как иллюстрацию направления, не как доказательство величины.

🔴 **Вывод раздела, который стоит взять в интервью.** «Стена» и «место стены» — разные вещи. У
издателя стена стоит **после того, как человек прочитал первую статью**, то есть после доставленной
ценности — и не роняет трафик. То, что было в 1.x NDim и осталось в 2.0 на `/profile`, — стена
**до** доставленной ценности. Мы боремся не со стеной как таковой, а с её местом.

---

## §5. Кто пускает без аккаунта — инвентарь по официальным источникам

`researches/10` перечислил примеры пересказом чужого блога. Здесь — те же и другие продукты, но по
их **собственной справке**, и с точным ответом на вопрос В4: **в какой момент они просят аккаунт.**

⚠️ Три домена (`openai.com`, `help.openai.com`, `canva.com`) режут автоматический запрос и отдают
403. Их страницы получены прямым запросом с браузерным заголовком (HTTP 200) — текст подлинный, но
метод не наш штатный. Помечено у каждой цитаты.

### 5.1 Сводная таблица

| Продукт | Что можно без аккаунта | Чем вызывается просьба |
|---|---|---|
| **Figma / FigJam** | смотреть по ссылке; в FigJam — **полноценно редактировать** | **временем**: сессия живёт 24 часа |
| **Canva** | смотреть, презентовать и **полноценно редактировать** дизайн по ссылке | **действием**: скачать / опубликовать / скопировать / распечатать / **прокомментировать** |
| **Excalidraw** | весь редактор, экспорт, соредактирование, автосохранение в браузер | **масштабом хранения**: вторая сцена и облако |
| **tldraw** | рисовать; гости по ссылке соредактируют | **владением результатом**: список файлов, облако, приватность |
| **Photopea** | **всё**, включая офлайн | просьбы нет вообще |
| **Notion** | читать опубликованную страницу, переключать представления БД | **действием**: комментарий или правка |
| **Google Docs/Slides** | смотреть **и редактировать**, если владелец так открыл | Google не документирует ни одного барьера внутри файла |
| **Duolingo** | весь онбординг и уроки | **сохранением полученного**: «to save your progress» |
| **ChatGPT** | полноценный диалог, **одна беседа за раз**, только текущая сессия | **действием**: сохранить, вторая беседа, история, шаринг, голос |
| **Grammarly** | начать проверку текста | **посреди уже начатого действия**: «Sign up to keep going» |
| **remove.bg** | удалить фон, получить превью ≤ 0,25 Мп | **качеством результата**: полное разрешение = 1 кредит |
| **Speechify** | озвучить текст и скачать аудио | **переносимостью между устройствами** |
| **Spotify** 🔴 | по официальным документам — **ничего** | аккаунт как турникет, шаг 2 из 3 |

### 5.2 Цитаты

**Figma / FigJam — ФАКТ, барьер по времени:**

> «visitors to join your FigJam file without having to create an account… every Open session ends
> after 24 hours»
> — [figma.com/blog/introducing-open-sessions](https://www.figma.com/blog/introducing-open-sessions/)

> «Join as a visitor without needing to create a Figma account.» «Visitors can edit and interact with
> your file.» «Once an open session has ended, the file will be locked to people outside your team…»
> — [help.figma.com/…/Invite-visitors-to-an-open-session](https://help.figma.com/hc/en-us/articles/4410786053911-Invite-visitors-to-an-open-session)

**Canva — ФАКТ, барьер по типу действия:**

> «Canva lets you collaborate with anyone right away. You can share a link that lets anyone edit your
> design, no sign-in required.»
> «Add, edit, or resolve a comment. They need to sign up or log in to Canva to do this.» /
> «Make a copy of the design.» / «Print the design.» / «Publish or download the design.»
> — [canva.com/help/collaborate-with-anyone](https://www.canva.com/help/collaborate-with-anyone/) *(403 на автозапрос, читано браузерным заголовком)*

> «If you see guest users (with animal pictures and names) in your design, it's because you gave edit
> access to anyone with the design link. This lets people make changes without signing up or logging
> in to Canva.»
> — [canva.com/help/share-via-link-or-email](https://www.canva.com/help/share-via-link-or-email/) *(там же)*

**Excalidraw — ФАКТ, самое прямое заявление в отрасли:**

> «Excalidraw is free to use and no account is needed. Just visit excalidraw.com and start drawing.»
> «On Excalidraw.com, your drawing is stored locally in LocalStorage on your device.»
> — [plus.excalidraw.com/how-to-start](https://plus.excalidraw.com/how-to-start)

Бесплатный уровень: «Free forever», «Full editor functions», **«1 infinite scene»**, «Unlimited
collaborators» — [plus.excalidraw.com/pricing](https://plus.excalidraw.com/pricing). То есть платят
не за функции, а за **вторую сцену и облако**.

**tldraw — ФАКТ:**

> «You can still use the app without logging in but if you do create an account, you'll get more
> control over your files and how they're shared.» «You can invite guests as editors or viewers with
> just a link (they won't need to log in to collaborate)…»
> — [tldraw.dev/blog/whats-new-2025](https://tldraw.dev/blog/whats-new-2025)

**Photopea — ФАКТ, крайняя точка шкалы:**

> «The Photopea editor can be used by anyone for any purpose, for free.» «Files, which you open in
> Photopea, are never sent anywhere, they never leave your device.»
> — [photopea.com/privacy.html](https://www.photopea.com/privacy.html)

**Notion — ФАКТ, барьер ровно на двух действиях:**

> «Anyone on the web with link… even if they aren't part of your workspace or aren't a Notion user.
> Note that page visitors will need to be logged into Notion if they want to comment on or edit your
> page.»
> — [notion.com/help/sharing-and-permissions](https://www.notion.com/help/sharing-and-permissions)

**Google Docs — ФАКТ:**

> «Anyone with the link: Anyone who has the link can use your file, without signing in to their Google
> Account.»
> «People who aren't signed in to a Google Account show up as anonymous animals in your file.»
> — [support.google.com/docs/answer/2494822](https://support.google.com/docs/answer/2494822?hl=en&co=GENIE.Platform%3DDesktop)

**Duolingo — ФАКТ:**

> «Don't forget to create a profile to save your progress! This will also allow you to access your
> account on other devices.»
> — [blog.duolingo.com/duolingo-101-how-to-learn-a-language-on-duolingo](https://blog.duolingo.com/duolingo-101-how-to-learn-a-language-on-duolingo/)

🔴 **Честная дыра.** Официального утверждения самого Duolingo «первый урок доступен ДО регистрации»
я не нашёл — только формулировку «профиль создаётся, чтобы сохранить прогресс». Знаменитая схема
известна из интервью (§2) и сторонних разборов. **Проверяется прибором за две минуты**: приватное
окно, `duolingo.com`. Стоит проверить перед тем, как ссылаться на неё в макетах.

**ChatGPT — ФАКТ, ближайший к нам по форме («одна сессия, ничего не сохраняется»):**

> «Starting today, you can use ChatGPT instantly, without needing to sign-up… There are many benefits
> to creating an account including the ability to save and review your chat history, share chats, and
> unlock additional features like voice conversations and custom instructions.»
> — [openai.com/index/start-using-chatgpt-instantly](https://openai.com/index/start-using-chatgpt-instantly/), 01.04.2024 *(403 на автозапрос, читано браузерным заголовком; фраза независимо подтверждена индексом поиска)*

> «Chats can only be saved by logging in or creating an account.» «While logged out, you can only have
> one conversation at a time.» «Chats will remain accessible only for the current session on the same
> browser.»
> — [help.openai.com/…/the-chatgpt-home-page](https://help.openai.com/en/articles/9125172-the-chatgpt-home-page) *(там же)*

**Grammarly — ФАКТ, самый агрессивный из найденных:** просьба врезается **в середину уже начатого
человеком действия**:

> «Sign up to keep going — It's fast and free. Finish checking your text and create an account to
> get: Tone and clarity insights; Tips on how to engage readers…»
> — [grammarly.com/grammar-check](https://www.grammarly.com/grammar-check)

**remove.bg — ФАКТ, барьер по качеству результата:**

> «Removing the background from 1 image requires 1 credit if you want to download it in high
> resolution. Preview images are free…» «Preview is an image of up to 0.25 megapixels»
> — [remove.bg/help/a/what-are-image-credits](https://www.remove.bg/help/a/what-are-image-credits)

**Spotify — ФАКТ, контрпример:**

> «Get the app… Create your account… Start playing»
> — [support.spotify.com/us/article/getting-started](https://support.spotify.com/us/article/getting-started/)

🔴 Ходячее «Spotify без входа даёт 30-секундные превью» **официального источника не имеет** — только
ветки форума. Не пользуйтесь.

### 5.3 🔴 Что видно из инвентаря — и что это меняет в вопросе В4

**Ни один из тринадцати изученных продуктов не просит аккаунт по счётчику действий и ни один — по
таймеру сессии.** Единственные найденные таймеры (24 часа у FigJam, 7 дней у гостей Google Drive) —
это срок гостевого доступа, а не механика просьбы.

Барьер везде привязан к **типу действия**, и линия проходит ровно по одному из трёх мест:

1. **Вынести результат наружу** — Canva, remove.bg.
2. **Сохранить полученную ценность между сессиями или устройствами** — Duolingo, ChatGPT, tldraw,
   Excalidraw, Speechify.
3. **Оставить след от своего имени** — Canva и Notion требуют вход именно на **комментарий**,
   разрешая при этом анонимную правку.

Третья линия — самая интересная и самая близкая к NDim. **Идентичность просят там, где она
объективно нужна: под высказыванием, а не под работой.** У нас это ровно граница В5: гость может
заполнять свои измерения (работа), но не может быть видимым и не может дружить (высказывание о себе
перед другими). Наша граница совпадает с отраслевой не случайно — она из той же логики.

⚠️ **И противоречие внутри доказательств.** Инвентарь (действие, не счётчик) поддерживает наш В4=А.
Единственный публичный **замер** (Duolingo, §2) устроен наоборот — по прогрессу, и его авторы прямо
говорят, что повторяемость мягких просьб и есть источник эффекта. Инвентарь показывает, **как
принято**; замер показывает, **что измерено**. Это разные вещи, и они здесь не совпадают.

### 5.4 Классика, которую нельзя не назвать — «кнопка на 300 миллионов»

**ЗАМЕР (с крупной оговоркой).** Джаред Спул: на сайте крупного ритейлера кнопку `Register` в
чекауте заменили на `Continue` с подписью «You do not need to create an account to make purchases on
our site»:

> «The number of customers purchasing went up by 45%. The extra purchases resulted in an extra $15
> million the first month. For the first year, the site saw an additional $300,000,000.»
> — [articles.centercentre.com/three_hund_million_button](https://articles.centercentre.com/three_hund_million_button/)

🔴 **Это НЕ контролируемый A/B-тест**, и сам Спул это признаёт:

> «A little math and we could calculate out the amount of revenue being abandoned in the carts by all
> the people who couldn't authenticate. That's where the $300,000,000/year number came from.»
> — [archive.uie.com/brainsparks/2011/10/17/the-back-story-for-the-300-million-button](https://archive.uie.com/brainsparks/2011/10/17/the-back-story-for-the-300-million-button/)

То есть $300 млн — **расчёт по брошенным корзинам**, а не измеренная дельта. Цитируйте историю ради
формулировки на кнопке, а не ради суммы.

---

## §6. Момент просьбы: по делу, по счётчику или по таймеру

Это вопрос В4, и здесь доказательства **расходятся**. Ниже — всё, что нашёл, честно по обе стороны.

### 6.1 За «по делу» (просим в момент, когда человек упёрся)

**ЗАМЕР.** Самый прямой замер «просьбы в момент желания», который мне попался, — не про регистрацию,
а про системные разрешения iOS; механика та же (просьба, которую можно отклонить навсегда).
Brenden Mulligan, соцприложение Cluster:

> «The first version of Cluster took this approach, and only about 30-40% of users accepted.»
> «When educating the user about Cluster before asking for notifications access, acceptance increased
> from less than 40% to 66%.»
> «Asking users for photos access after they tapped a camera and "Choose Photos" increased the
> acceptance rate from 67% to 89%.»
> «Over time, we've learned to ask our users for permission when, and only when, we absolutely need it»
> — [medium.com/launch-kit/the-right-way-to-ask-users-for-ios-permissions](https://medium.com/launch-kit/the-right-way-to-ask-users-for-ios-permissions-96fa4eb54f2c) (2014)

⚠️ Это самоотчёт одной команды об одном продукте, без методики и размера выборки. Направление
сильное (67% → 89% на просьбе после нажатия «выбрать фото»), величина — не проверяемая.

**МНЕНИЕ (NN/g).** Принцип взаимности — просить после того, как помог (цитата в §3).

### 6.2 Против «только по делу» — и это доказательство сильнее

**ЗАМЕР (Duolingo, §2).** Три мягких стены **по прогрессу** (после уроков), затем жёсткая. И прямое
наблюдение: без мягких стен жёсткая работает «significantly worse». То есть у самой известной
компании этого жанра просьба привязана **к счётчику пройденного, а не к упёршемуся желанию**, и
именно повторяемость даёт эффект.

**ЗАМЕР (издатели, §4).** Стена по счётчику статей («на второй статье»), измеренный рост
идентифицированных читателей в 5,8 раза без потери трафика.

### 6.3 Голос против «правильного момента» вообще

**МНЕНИЕ (важное, но без чисел).** Джон Иган, работавший в команде уведомлений Pinterest, публично
оспаривает всю практику «подготовительных» просьб:

> «Every single one of these experiments showed a drop in engagement metrics across the board when
> compared to just popping up the system prompt.»
> «when it comes to push notifications, users make up their mind based on the category your app is
> in and there is little you can do to sway it.»
> — [jwegan.com/growth-hacking/push-permission-prompts](https://jwegan.com/growth-hacking/push-permission-prompts/)

🔴 **Ни одного числа в статье нет** — я проверил специально. Это свидетельство практика, не замер.
Но оно полезно как напоминание: «правильный момент» — гипотеза, которую надо мерить, а не аксиома.

### 6.4 Что из этого следует

**Замера, который сравнил бы «просьба по действию» против «просьба по счётчику» на одном продукте,
я не нашёл.** Есть замер в пользу первой (Cluster, разрешения) и замер в пользу второй (Duolingo,
регистрация). Ближе к нашей задаче — второй: он про регистрацию, а не про разрешения.

---

## §7. Донесение ценности: сколько у нас секунд и сколько слов прочтут

### 7.1 Сколько секунд

**ЗАМЕР.** Анализ данных Microsoft Research (Chao Liu и коллеги): 205 873 страницы, свыше 2 млрд
измерений времени пребывания:

> «Users often leave Web pages in 10–20 seconds, but pages with a clear value proposition can hold
> people's attention for much longer.»
> «To gain several minutes of user attention, you must clearly communicate your value proposition
> within 10 seconds.»
> «The average page visit lasts a little less than a minute.»
> «99% of web pages have a negative aging effect» (время на странице распределено по Вейбуллу —
> чем дольше человек остался, тем меньше вероятность, что он уйдёт в следующую секунду)
> — [nngroup.com/articles/how-long-do-users-stay-on-web-pages](https://www.nngroup.com/articles/how-long-do-users-stay-on-web-pages/)

**ЗАМЕР (академический).** Визуальное впечатление формируется до чтения:

> «Visual appeal can be assessed within 50 ms, suggesting that web designers have about 50 ms to make
> a good first impression.»
> — Lindgaard, Fernandes, Dudek, Brown (2006), *Behaviour & Information Technology* 25(2), 115–126,
> [tandfonline.com/doi/abs/10.1080/01449290500330448](https://www.tandfonline.com/doi/abs/10.1080/01449290500330448)

⚠️ Статья за пейволлом — цитирую по аннотации издателя и по реферативным описаниям. Дизайн трёх
экспериментов (500 мс / 50 мс, повторные оценки привлекательности) описан в аннотации.

🔴 **Популярное «у вас 3–5 секунд, чтобы зацепить» первоисточника не имеет.** Замеренные величины —
**50 мс** на визуальное впечатление и **10 секунд** на понятое обещание. Пользуйтесь ими.

### 7.2 Сколько слов

**ЗАМЕР.** Анализ 45 237 просмотров страниц (данные Harald Weinreich и коллег, 25 инструментованных
браузеров):

> «On the average Web page, users have time to read at most 28% of the words during an average visit;
> 20% is more likely.»
> «only 4.4 seconds more for each additional 100 words»
> «on an average visit, users read half the information only on those pages with 111 words or less»
> — [nngroup.com/articles/how-little-do-users-read](https://www.nngroup.com/articles/how-little-do-users-read/)

### 7.3 Что человек делает раньше — читает или пробует

**ФАКТ (классика HCI, 1987).** «Парадокс активного пользователя» Кэрролла и Россон:

> «Users never read manuals but start using the software immediately. They are motivated to get
> started and to get their immediate task done: they don't care about the system as such and don't
> want to spend time up front on getting established, set up, or going through learning packages.»
> — [nngroup.com/articles/paradox-of-the-active-user](https://www.nngroup.com/articles/paradox-of-the-active-user/)
> (первоисточник — исследования IBM User Interface Institute начала 1980-х, публикация Carroll &
> Rosson, 1987)

**МНЕНИЕ.** Что должно быть на первом экране:

> «Communicate Who You Are and What You Do»
> «Your homepage should communicate your unique value proposition clearly, usually through a
> descriptive tagline.»
> «Treat your homepage as an elevator pitch to prospective customers, quickly and clearly conveying
> what your organization does.»
> «Reveal Content Through Examples»
> — [nngroup.com/articles/homepage-design-principles](https://www.nngroup.com/articles/homepage-design-principles/)

🔴 **«Пишите про выгоды, а не про свойства» (benefit vs feature) — замера я не нашёл.** Поиск даёт
только агентские блоги, ссылающиеся друг на друга. Это ремесленная эвристика с очень длинной
традицией, но доказательной базы под ней я предъявить не могу. Помечайте как **мнение**.

---

## §8. Онбординг-туры внутри продукта: единственный количественный тест — против них

Это прямая проверка **варианта Б вопроса В1**.

**ЗАМЕР 🔴 (главный в разделе).** Количественный юзабилити-тест NN/g, 70 участников, 4 мобильных
приложения с онбордингом-«колодой карточек»:

> «We conducted a quantitative usability test with 70 users and 4 mobile apps that used
> deck-of-cards tutorials as a means to onboard users.»
> «Group A always engaged with the tutorial. Group B always skipped the tutorial. In total, we had 70
> participants, 35 in each group.»
> «Task success across the four apps tested was 91% for the those who read the tutorial (n=35) and
> 94% for those who skipped the tutorial (n=35). This difference was not statistically significant
> (p=0.443).»
> «Group A, who read the tutorials (n=35), had an average SEQ of 4.92 while group B, who skipped
> tutorials (n=35), had an average SEQ of 5.49. This difference was statistically significant
> (p=0.047).»
> «Group A, who read the tutorials had a mean task-completion time of 93.49 seconds, while group B,
> who skipped tutorials had a mean task-completion time of 85.17 seconds. This difference was not
> statistically significant (p > 0.1).»
> — [nngroup.com/articles/mobile-tutorials](https://www.nngroup.com/articles/mobile-tutorials/)

Расшифровка: тур **не улучшил** ни успешность, ни скорость — и **статистически значимо ухудшил**
субъективную оценку лёгкости (SEQ — Single Ease Question). Люди, прочитавшие тур, считали продукт
**сложнее**.

> «Tutorials take time and effort to design and develop, and those would be better spent on making
> the UI easy to use and thus alleviating the need for a tutorial in the first place.»
> — там же

**МНЕНИЕ (NN/g, общий вердикт).**

> «Onboarding instructions that users must digest before they start using an app or other product
> require attention and effort and thus reduce usability. They should be avoided as much as possible.»
> — [nngroup.com/videos/onboarding-skip-it-when-possible](https://www.nngroup.com/videos/onboarding-skip-it-when-possible/)

> «they don't result in better task performance»; «we find that users frequently skip them»;
> «The tutorial shows information **out of context**, and users would have to memorize it.»
> — [nngroup.com/articles/onboarding-tutorials](https://www.nngroup.com/articles/onboarding-tutorials/)

**МНЕНИЕ.** Про подсказки-указатели поверх интерфейса (coach marks):

> «our short-term memory cannot retain very much information, and that information fades in about 20
> seconds»
> «Bombarding users with frequent hint screens causes them to dismiss hints more quickly»
> «Presenting hints one-by-one, at the right moment, makes it a lot easier for users to understand
> and learn»
> — [nngroup.com/articles/mobile-instructional-overlay](https://www.nngroup.com/articles/mobile-instructional-overlay/)

### 8.1 ⚠️ Но у NN/g есть исключение, и оно про нас

**МНЕНИЕ.** Таксономия и оговорки:

> «There are three frequently encountered components in mobile onboarding flows: feature promotion,
> customization, and instructions.»
> «Avoid feature-promotion onboarding at first launch.»
> «Instructional onboarding should not be used to supplement poor design.»
> «There are only a few situations when onboarding screens can be useful in a mobile app»
> «we recommend professionals avoid creating app onboarding whenever possible and instead spend your
> resources making the UI more usable.»
> — [nngroup.com/articles/mobile-app-onboarding](https://www.nngroup.com/articles/mobile-app-onboarding/)

Те «немногие ситуации», по их же тексту: когда нужна информация от человека, когда функциональность
сильно персонализируется, и когда **парадигма взаимодействия действительно новая**. Отдельно они
признают исключение для новой парадигмы:

> walkthroughs were «useful for onboarding new users to a novel interaction paradigm like AR»
> — [nngroup.com/articles/onboarding-tutorials](https://www.nngroup.com/articles/onboarding-tutorials/)

🔴 **Это важно для NDim.** «Человек — точка в многомерном пространстве, похожесть = Близость ×
Общность» — не привычная парадигма вроде ленты или свайпов. Формально мы попадаем в исключение NN/g.
Но: экраны `ob1`…`ob4` в 1.x были именно «feature promotion» — тем самым типом, который NN/g велит
не делать на первом запуске. То есть провал 1.x объясняется **не тем, что там был онбординг, а тем,
что там был онбординг неправильного типа**.

### 8.2 Чем NN/g предлагает заменить тур

**МНЕНИЕ.** Пустые состояния как носитель обучения:

> «Communicate system status to the user»
> «Help users discover unused features and increase learnability of the application»
> «Provide direct pathways for getting started with key tasks»
> «In-context help can often be applied right away and is thus more memorable — users have little
> time to establish associations between lengthy onboarding content and the actual interface.»
> — [nngroup.com/articles/empty-state-interface-design](https://www.nngroup.com/articles/empty-state-interface-design/)

**МНЕНИЕ.** Прогрессивное раскрытие:

> «Initially, show users only a few of the most important options. Offer a larger set of specialized
> options upon request.»
> «Progressive disclosure thus improves 3 of usability's 5 components: learnability, efficiency of
> use, and error rate.»
> — [nngroup.com/articles/progressive-disclosure](https://www.nngroup.com/articles/progressive-disclosure/)

⚠️ Числовых данных под «улучшает 3 из 5 компонентов» на странице нет — это обобщение Нильсена.

---

## §9. Доверие: чего люди боятся и что измеримо помогает

### 9.1 Масштаб страха (замеры на больших выборках)

**ЗАМЕР.** Pew Research Center, 2019, n = 4 272:

> «Roughly eight-in-ten or more U.S. adults say they have very little or no control over the data
> that government (84%) or companies (81%) collect about them.»
> «81% of Americans think the potential risks of data collection by companies about them outweigh the
> benefits»
> «79% of Americans say they are not too or not at all confident that companies will admit mistakes
> and take responsibility if they misuse or compromise personal information»
> — [pewresearch.org/internet/2019/11/15/americans-and-privacy…](https://www.pewresearch.org/internet/2019/11/15/americans-and-privacy-concerned-confused-and-feeling-lack-of-control-over-their-personal-information/)

**ЗАМЕР.** Pew, 2023, n = 5 101:

> «81% say the information companies collect will be used in ways that people are not comfortable with»
> «More than half of Americans (56%) say they always, almost always or often click "agree" without
> reading privacy policies»
> «a majority (61%) are skeptical anything they do will make much difference»
> — [pewresearch.org/short-reads/2023/10/18/key-findings-about-americans-and-data-privacy](https://www.pewresearch.org/short-reads/2023/10/18/key-findings-about-americans-and-data-privacy/)

> «67% say they understand little to nothing about what companies are doing with their personal data,
> up from 59%.»
> — [pewresearch.org/internet/2023/10/18/how-americans-view-data-privacy](https://www.pewresearch.org/internet/2023/10/18/how-americans-view-data-privacy/)

**ЗАМЕР.** Cisco Consumer Privacy Survey 2024 (пресс-страница; сам PDF отдал 403):

> «51 percent of "Privacy Actives" have switched companies due to concerns over data privacy practices.»
> «75 percent of the respondents won't buy from companies they don't trust with their data.»
> — [newsroom.cisco.com/…/how-safe-is-our-data-consumers-want-to-know](https://newsroom.cisco.com/c/r/newsroom/en/us/a/y2024/m10/how-safe-is-our-data-consumers-want-to-know.html)

**ЗАМЕР.** Eurostat, данные 2025 (официальная статистика ЕС):

> «76.9% of EU internet users protected their data online by taking steps to manage access to their
> personal data» (73.2% в 2023); «58.8%» выбрали «not to allow their personal data to be used for
> advertising»; «37.6% read the privacy policy statements before sharing their personal data»
> — [ec.europa.eu/eurostat/…/ddn-20260128-1](https://ec.europa.eu/eurostat/web/products-eurostat-news/w/ddn-20260128-1)

⚠️ Свежий Special Eurobarometer 487a (2019) открыть не удалось — PDF не распарсился, пресс-релиз
отдал пустую оболочку. Числа оттуда не привожу.

### 9.2 Что измеримо снимает страх

**ЗАМЕР 🔴 (лучший в разделе).** Рандомизированный опросный эксперимент, 3 539 взрослых США,
*JAMA Network Open* 2023;6(3):e231305 — насколько разные гарантии сдвигают готовность делиться
данными (шкала 1–5):

> согласие (consent) — «difference, 0.32; 95% CI, 0.29-0.35; P < .001»;
> **возможность удалить данные** — «difference, 0.16; 95% CI, 0.13-0.18; P < .001»;
> надзор — 0.13; прозрачность — 0.08
> — [pmc.ncbi.nlm.nih.gov/articles/PMC9982693](https://pmc.ncbi.nlm.nih.gov/articles/PMC9982693/)

Расшифровка: после самого согласия **сильнее всего работает обещание «данные можно удалить»** —
сильнее, чем прозрачность и чем внешний надзор.

**ЗАМЕР (подтверждение на другой выборке, 2026).** Виньеточный эксперимент, n = 354:

> «Controls enabling deletion of disclosures had the largest positive impact: these offerings
> outperformed technically sophisticated controls such as local-only processing and model training
> opt-outs»
> «trust remains fragile, and participants often doubted S&P controls would function as promised»
> — [arxiv.org/abs/2607.06371](https://arxiv.org/abs/2607.06371)

**ЗАМЕР (полевой эксперимент, академический).** Заявление о приватности работает, «значок доверия» — нет:

> «the existence of a privacy statement induced more subjects to disclose their personal information
> but that of a privacy seal did not»
> — Hui, Teo, Lee (2007), *MIS Quarterly* 31(1), [aisel.aisnet.org/misq/vol31/iss1/4](https://aisel.aisnet.org/misq/vol31/iss1/4/)

🔴 **Что это значит для NDim.** У нас уже есть ровно та вещь, которая измеримо работает лучше всего:
**страница удаления аккаунта** (`/delete-account` — единственный, кроме корня, адрес в нашем
sitemap). Сегодня она спрятана как юридическая формальность. По доказательствам это **аргумент
доверия на пороге**, а не сноска в подвале: «Уйти можно в один клик, и данные исчезнут» — сильнее,
чем «мы прозрачны» и сильнее, чем любой значок.

### 9.3 🔴 Контринтуитивная находка: разговор о приватности может УМЕНЬШИТЬ доверие

**ЗАМЕР (академический).** Четыре эксперимента, *Journal of Consumer Research* 2011:

> «Our central thesis, and a central finding of all four experiments, is that disclosure of private
> information is responsive to environmental cues that bear little connection, or are even inversely
> related, to objective hazards. We address underlying processes and rule out alternative explanations
> by eliciting subjective judgments of the sensitivity of inquiries (experiment 3) and by showing that
> the effect of cues diminishes if privacy concern is activated at the outset of the experiment
> (experiment 4).»
> — John, Acquisti, Loewenstein (2011), «Strangers on a Plane: Context-Dependent Willingness to
> Divulge Sensitive Information», *JCR* 37(5), 858–873,
> [econpapers.repec.org/article/oupjconrs/doi_3a10.1086_2f656423.htm](https://econpapers.repec.org/article/oupjconrs/doi_3a10.1086_2f656423.htm)

Ключевое: **как только тема приватности поднята, готовность делиться падает.** Сигналы среды,
формально не связанные с реальным риском, влияют на раскрытие больше, чем сам риск.

**ЗАМЕР (слабый, но в ту же сторону).** Четыре A/B-теста микрокопии у формы (Michael Aagaard,
ContentVerve) — против варианта БЕЗ текста о приватности:

| Текст под формой | Результат |
|---|---|
| «100% privacy – we will never spam you» | **−18,70%** |
| «100% privacy. We keep all your personal information secret» | без значимой разницы |
| «We guarantee 100% privacy. Your information will not be shared.» | **+19,47%** |
| «We guarantee 100% privacy. We will never spam you!» | без значимой разницы |

— первоисточник (contentverve.com) мёртв; цитирую по републикации
[duncanjonesnz.com/michael-aagaard-how-your-privacy-policy-affects-sign-ups…](https://www.duncanjonesnz.com/michael-aagaard-how-your-privacy-policy-affects-sign-ups-surprising-data-from-4-different-a-b-tests/).
⚠️ Выборка и мощность неизвестны, автора проверить нельзя. **Это гипотеза, не факт.**

Смысл гипотезы совпадает с академической находкой: **слово «спам» само вызывает тревогу**.
Работает утверждение о том, что мы СДЕЛАЕМ («не передадим»), а не отрицание того, чего не будем
(«не будем спамить»).

**Практический вывод для наших текстов:** обещание должно быть коротким, позитивным и проверяемым —
и его не надо повторять. Целая полоса «мы заботимся о вашей приватности» на первом экране по этим
доказательствам скорее навредит.

### 9.4 Пароли и беспарольный вход

**ЗАМЕР.** NN/g, 2023:

> «83% of users use a biometric method of authentication at least occasionally» (95% ДИ 73–87%)
> «Passwords are annoying. They are hard to create, hard to type, and hard to remember.»
> — [nngroup.com/articles/passwordless-accounts](https://www.nngroup.com/articles/passwordless-accounts/)

> «Typing passwords is painful enough; typing them twice is twice as painful.»
> — [nngroup.com/articles/checklist-registration-login](https://www.nngroup.com/articles/checklist-registration-login/)

🔴 **Замера «сколько конверсии добавляет отсутствие пароля» я не нашёл.** Наше решение В2=А+ из
интервью №004 (без паролей вообще) опирается на качественные аргументы, а не на число. Это нормально,
но пусть будет названо.

### 9.5 Фальшивая почта

**ЗАМЕР с порочной выборкой.** Опрос Postcoder, январь 2018, n = 200 (UK+IE) — **только среди тех,
кто уже давал фейковый или одноразовый адрес**:

> «82% saying they had used a DEA while filling out a form online»
> «73% of respondents identified their reason for not submitting their own email as part of a form
> was a dislike for receiving marketing communication»
> «57% of our respondents submit fake or disposable email addresses because they don't trust the
> company they're submitting to»
> «69% of our respondents said they would be more likely to give their real email address if they
> were able to make their preferences for marketing communication clear at the point of signing up.»
> — [postcoder.com/blog/stopping-sign-ups-with-fake-email-addresses](https://postcoder.com/blog/stopping-sign-ups-with-fake-email-addresses)

🔴 **82% НЕ означает «82% людей врут в формах».** Выборка — уже соврашие. **Популяционного замера
доли фальшивых адресов я не нашёл.** Полезное здесь одно: мотив №1 — страх рассылки.

### 9.6 Нормативная рамка форм — GOV.UK

**ФАКТ (норматив).**

> «Only add a question if you know that you need the information to deliver the service, why you need
> the information, what you'll do with it…»
> «A question protocol forces you (and your organisation) to question why you're asking users for each
> item of information.»
> «Start by splitting the form across multiple pages with each page containing just one thing»
> — [gov.uk/service-manual/design/form-structure](https://www.gov.uk/service-manual/design/form-structure)

> «You should make sure you know why you're asking every question and only ask users for information
> you really need.»
> «Asking just one question per question page helps users understand what you're asking them to do,
> and focus on the specific question and its answer.»
> «On every question page you should: make sure it's clear to users why you're asking each question»
> — [design-system.service.gov.uk/patterns/question-pages](https://design-system.service.gov.uk/patterns/question-pages/)

🔴 **Честность GDS, которую стоит перенять.** Автор паттерна «одна вещь на страницу» в комментариях
к своей же статье пишет:

> «I wish we had some easy-to-share quant data on this as well, but I'm not aware of any.»
> — Tim Paul, [designnotes.blog.gov.uk/2015/07/03/one-thing-per-page](https://designnotes.blog.gov.uk/2015/07/03/one-thing-per-page/)

То есть даже у государственного стандарта Великобритании под этим паттерном **нет количественного
замера** — только наблюдения («low-confidence users find them easier to use») и удобство обработки
ошибок и ветвлений.

**ФАКТ.** Что GDS всё же измерил — отсутствие вреда от снятия индикатора прогресса:

> «A number of GOV.UK services have removed this style of progress indicator without any negative
> effects. Read a blog post about how the Carer's Allowance team removed a 12-step progress indicator
> with no effect on completion rates or times.»
> — [design-system.service.gov.uk/patterns/question-pages](https://design-system.service.gov.uk/patterns/question-pages/)

---

## §10. Интерактивное демо: что известно и чего не известно

**ЗАМЕР (вендорский, но с раскрытой методикой).** Navattic, «State of the Interactive Product Demo
2025»: 28 000+ демо на их платформе, опрос 280 их пользователей, скан 5 000 B2B-сайтов.

> Топ-1%: «84.4% Interactive demo engagement rate», «61.6% Interactive demo completion rate»
> Топ-10%: «70.6%» / «43.5%» · Топ-25%: «50.1%» / «28.9%»
> — [navattic.com/report/state-of-the-interactive-product-demo-2025](https://www.navattic.com/report/state-of-the-interactive-product-demo-2025)

⚠️ Цифры прироста конверсии в том же отчёте — **самоотчёты клиентов Navattic**, а не измерение
самого Navattic («12% increase in our product activation rate», «+42% trial activations»,
«25-35% higher»). Это отзывы, а не эксперимент.

🔴 **Замера «интерактивное демо против текстового объяснения на одном лендинге» я не нашёл.**
Ни у NN/g, ни в академии, ни в публичных кейсах. Вариант В2=А («трогает первым») опирается на:
(а) парадокс активного пользователя (§7.3), (б) факт, что 72–80% слов всё равно не прочтут (§7.2),
(в) косвенный замер Duolingo (урок раньше регистрации). **Прямого доказательства нет.**

---

## §11. Психология вложенного труда — и где она становится тёмным паттерном

Это фундамент варианта «человек не захочет потерять сделанное».

**ЗАМЕР (академический).** IKEA-эффект — Norton, Mochon, Ariely, *Journal of Consumer Psychology*
22(3), 2012:

> «In four studies in which consumers assembled IKEA boxes, folded origami, and built sets of Legos,
> we demonstrate and investigate boundary conditions for the IKEA effect — the increase in valuation
> of self-made products.»
> «labor leads to love only when labor results in successful completion of tasks; when participants
> built and then destroyed their creations, or failed to complete them, the IKEA effect dissipated.»
> — [myscp.onlinelibrary.wiley.com/doi/abs/10.1016/j.jcps.2011.08.002](https://myscp.onlinelibrary.wiley.com/doi/abs/10.1016/j.jcps.2011.08.002)

🔴 **Оговорка, которая меняет проектирование:** эффект возникает **только при ЗАВЕРШЁННОЙ работе**.
Незавершённое человек не начинает ценить. Значит гостю нужен **видимый завершённый результат**
(«Ваше Пространство собрано: 7 измерений, ближайший человек — 84%»), а не «заполните ещё 20
измерений». Пока результат не завершён, терять человеку нечего.

**ЗАМЕР (академический).** Endowed progress effect — Nunes & Drèze, *Journal of Consumer Research*
32(4), 2006, 504–512:

> «This research documents a phenomenon we call the endowed progress effect, whereby people provided
> with artificial advancement toward a goal exhibit greater persistence toward reaching the goal. By
> converting a task requiring eight steps into a task requiring 10 steps but with two steps already
> complete, the task is reframed as one that has been undertaken and incomplete rather than not yet
> begun. This increases the likelihood of task completion and decreases completion time.»
> — [academic.oup.com/jcr/article-abstract/32/4/504/1796900](https://academic.oup.com/jcr/article-abstract/32/4/504/1796900) (аннотация открыта, полный текст платный — €14)

⚠️ Широко цитируемые числа полевого эксперимента (мойка машин: карту завершили **19%** с пустой
картой против **34%** с картой на 10 отметок, где 2 уже проставлены) в открытой аннотации **не
приведены** — они из полного текста, который за пейволлом. Я их не подтвердил лично; они
единообразно воспроизводятся во вторичных источниках, например
[coglode.com/nuggets/endowed-progress-effect](https://www.coglode.com/nuggets/endowed-progress-effect).

🔴 **И вот граница, которую нам нельзя переходить.** Endowed progress — это буквально **искусственно
подаренный прогресс**, то есть «фейковый прогресс» из списка антипаттернов вашего задания. Самый
хорошо измеренный мотиватор в этой области — приём, который `GOAL.md` нам запрещает. Честный вывод:
**прогресс у нас должен быть настоящим.** «Ваше Пространство заполнено на 3 из 7 измерений» — факт.
«Мы уже подарили вам 2 шага» — манипуляция, даже если она работает.

---

## §12. Антипаттерны: что запрещено нам по `GOAL.md` и что названо регуляторами

`GOAL.md` отвергает механики удержания как таковые. Этот раздел показывает, что по многим из них
проект и отрасль сходятся: приёмы, которые нам нельзя по совести, регуляторы уже назвали поимённо,
а один из самых популярных — измеренно **не работает** даже как манипуляция.

### 12.1 Что называет регулятор США

**ФАКТ.** Определение и происхождение термина:

> «Coined in 2010 by user design specialist Harry Brignull, the term "dark patterns" has been used to
> describe design practices that trick or manipulate users into making choices they would not
> otherwise have made and that may cause harm.»
> — FTC Staff Report «Bringing Dark Patterns to Light», 14.09.2022,
> [ftc.gov/system/files/…/Dark Patterns Report](https://www.ftc.gov/system/files/ftc_gov/pdf/P214800%20Dark%20Patterns%20Report%209.14.2022%20-%20FINAL.pdf)
> *(403 на автозапрос; PDF скачан браузерным заголовком)*

**ФАКТ.** Из Appendix A того же отчёта — три пункта, лежащие прямо на нашей дороге:

> «Nagging — Asking repeatedly and disruptively if a user wants to take an action OR Making a request
> that doesn't let the user permanently decline — and then repeatedly prompting them with the request.
> Example: asking users to provide their data or turn on cookies then repeatedly presenting the
> choices as "Yes" or "Not Now" instead of "Yes" or "No"»

> «Forced Registration or Enrollment — Making users create an account or share their information to
> complete a task.»

> «Baseless Countdown Timer — Creating pressure to buy immediately by showing a fake countdown clock
> that just goes away or resets when it times out.»

🔴 **Определение Nagging бьёт по нашему В4 напрямую.** Тёмным паттерном названа не сама повторяющаяся
просьба, а **просьба, от которой нельзя отказаться навсегда** — и приём «Да» / «Не сейчас» вместо
«Да» / «Нет». Это ровно та формулировка кнопки, которая у нас стоит («позже», `plans/03` этап 2) и
которую у Duolingo измеренно нашли лучшей («Later»). Отраслевая эффективность и регуляторное
определение здесь **прямо конфликтуют**.

Из этого следует конкретное требование к дизайну: у гостя должна быть возможность **отказаться
насовсем**, а не только «позже». Одна тихая карточка, которую можно закрыть навсегда, — не наггинг.
Три мягкие стены Duolingo с кнопкой «позже», которая всегда возвращается, — по букве определения
FTC наггинг и есть.

### 12.2 Что называет право ЕС

**ФАКТ (прямая норма).** Digital Services Act, ст. 25(1):

> «Providers of online platforms shall not design, organise or operate their online interfaces in a
> way that deceives or manipulates the recipients of their service or in a way that otherwise
> materially distorts or impairs the ability of the recipients of their service to make free and
> informed decisions.»
> — [Регламент (ЕС) 2022/2065](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32022R2065)

**ФАКТ.** Ст. 25(3) — именной перечень практик:

> «(a) giving more prominence to certain choices when asking the recipient of the service for a
> decision; (b) repeatedly requesting that the recipient of the service make a choice where that
> choice has already been made, especially by presenting pop-ups that interfere with the user
> experience; (c) making the procedure for terminating a service more difficult than subscribing to it.»
> — там же

⚠️ **Пункт (a) стоит прочитать дважды перед ответом на В3.** Наш рекомендованный вариант — «главная
кнопка "Попробовать", вход мелкой ссылкой рядом» — это буквально «giving more prominence to certain
choices». Норма запрещает не всякую иерархию, а ту, что «deceives or manipulates» или «materially
distorts» свободу решения (ст. 25(1) — рамка для всего перечня). Честная иерархия «главное действие
крупно, второстепенное рядом и findable» под запрет не подпадает. **Но граница проходит по
находимости входа**: если возвращающийся человек не может найти «Войти» — иерархия перестаёт быть
подсказкой и становится искажением. Это проверяемый критерий для макетов, а не вкусовщина.

**ФАКТ.** Recital 67 DSA, самое подробное описание:

> «Dark patterns on online interfaces of online platforms are practices that materially distort or
> impair, either on purpose or in effect, the ability of recipients of the service to make autonomous
> and informed choices or decisions.»
> «It should also include repeatedly requesting a recipient of the service to make a choice where such
> a choice has already been made, making the procedure of cancelling a service significantly more
> cumbersome than signing up to it…»
> — там же

### 12.3 Насколько это распространено — замеры

**ЗАМЕР.** Проверка сети CPC под руководством Еврокомиссии, 2023:

> «This check covered 399 online shops of retail traders… The investigation showed that 148 sites
> contained at least one of these three dark patterns.» — «42 websites used fake countdown timers»;
> «54 websites directed consumers towards certain choices»; «70 websites were found to be hiding
> important information»
> — пресс-релиз EC [IP/23/418](https://ec.europa.eu/commission/presscorner/api/documents?reference=IP/23/418&language=en)

**ЗАМЕР.** Digital Fairness Fitness Check, SWD(2024) 230 final, 03.10.2024:

> «The Commission's 2022 dark patterns study showed that 97% of the most popular websites and apps
> used by EU consumers deployed at least one dark pattern, with the most common ones involving hiding
> information, creating false hierarchies in choice architectures, repeatedly making the same request,
> difficult cancellations and forced registrations.»
> — [SWD(2024) 230 final](https://www.parlament.gv.at/dokument/XXVII/EU/198771/imfname_11414925.pdf)

**ЗАМЕР 🔴 — самый ценный для нас в этом разделе.** Поведенческий эксперимент Еврокомиссии, 7 430
человек в шести странах ЕС, и отдельный эксперимент именно про **принуждение к действию**:

> «when exposed to dark patterns the probability of making a choice that was inconsistent with the
> consumers' preferences increased — the average figure rising to 51% for vulnerable consumers and
> 47% for average consumers.»

> «consumers that were exposed to a personalised "forced action" dark pattern reported higher levels
> of frustration and feeling of being manipulated, compared to the control group… Additionally, they
> showed a lower understanding of the information that was presented, perceived information on the
> website to be less transparent and the websites to be less trustworthy.»
> — там же

🔴 **Вот измеренная связь между вашим разрывом А и вашим разрывом Б.** Принуждение к действию не
просто раздражает: оно **ухудшает понимание того, что человеку показали**, и роняет воспринимаемую
надёжность сайта. То есть стена входа на `/profile` не только отпугивает — она делает **хуже
восприятие всего остального объяснения**. Это ровно та петля, в которую попал 1.x: онбординг «не
доносил ценность» отчасти потому, что заканчивался требованием.

**ЗАМЕР.** Отдельно — про «легко войти, трудно выйти»:

> «In the public consultation, 69% of consumers found it technically difficult to cancel their
> contracts… In the representative consumer survey, 40% considered that the design of the website/app
> made cancelling the subscription very difficult.»
> «After indicating their choice or declining a choice offered, 42% received messages that made them
> doubt their decision, e.g. asking questions like "are you really sure you do not want a discount?".»
> — там же

**ФАКТ (правовая квалификация confirmshaming):**

> «creating obstacles to contract termination or switching by means of confirmshaming is potentially
> aggressive»
> — там же

⚠️ **Digital Fairness Act — законопроекта пока нет.** SWD(2024) 230 — это Fitness Check
(оценка), а не регламент. Любая «цитата из DFA» сегодня была бы выдумкой.

### 12.4 🔴 Главная находка раздела: искусственный дефицит НЕ РАБОТАЕТ

**ЗАМЕР (лучший экспериментальный источник по теме).** Luguri & Strahilevitz, *Journal of Legal
Analysis* 13(1), 2021 — два онлайн-эксперимента с реальным предложением платной услуги:

> «Only 11.3 percent of respondents accepted the program when they were allowed to accept or decline
> the program on the first screen.»
> «Now 25.8 percent of participants accepted the data protection program, which corresponds to a 228
> percent increase compared to the control group condition.» *(мягкие тёмные паттерны)*
> «41.9 percent of the sample accepting the program» — «a 371 percent increase» *(агрессивные)*
> — [academic.oup.com/jla/article/13/1/43/6180579](https://academic.oup.com/jla/article/13/1/43/6180579)

Разбивка по приёмам во втором исследовании:

> «Collapsing across form condition, 14.8 percent of participants in the content control condition
> accepted. The hidden information condition doubled acceptance rates, with 30.1 percent… The
> confirmshaming and social proof conditions also significantly increased acceptance rates, but to a
> more modest degree. **The scarcity condition, on the other hand, did not have any significant
> impact on acceptance rates.**»
> «Hidden information, trick question, and obstruction strategies were particularly likely to
> manipulate consumers successfully… while still others such as "must act now" messages did not make
> consumers more likely to purchase a costly service.»
> — там же

И цена агрессии, измеренная прямо:

> «Only nine participants dropped out in the mild condition, while sixty-five dropped out at some
> point during the aggressive condition.»
> «whereas aggressive dark patterns generated a powerful backlash among consumers, mild dark patterns
> did not»
> «Less educated subjects were significantly more susceptible to mild dark patterns than their
> well-educated counterparts.»
> — там же

**Что это значит.** Искусственный дефицит и «действуй сейчас» — приёмы, которые нам запрещены по
`GOAL.md` — вдобавок **измеренно бесполезны**. Отказ от них не стоит нам ничего. А агрессивные
приёмы, которые «работают», покупают согласие ценой **семикратного оттока**. Это редкий случай,
когда совесть и арифметика дают один ответ.

⚠️ И честная оговорка о том, что здесь неудобно: **confirmshaming и социальное доказательство в этом
эксперименте согласие значимо повышали.** «Живой счётчик людей» на нашем лендинге — это социальное
доказательство. Оно не тёмный паттерн, **пока число правдиво** (ср. `bugs/07`: выдуманные «2 184
человека» при 331 в базе — вот это уже было им).

### 12.5 Перехват ухода (exit-intent) — вариант В4=В

Ваша собственная оценка в интервью («это тёмный паттерн; предлагаю отвергнуть») подтверждается — но
не так, как ожидалось.

🔴 **Независимого замера пользы exit-intent-попапов не существует.** Единственные числа — от
производителей попапов, и один из них это прямо признаёт:

> «It cannot tell you that exit intent converts better or worse than an immediate fire, because
> almost no one runs the head-to-head test that would answer it.» «In our sample of 500 popup
> campaigns, only 10 used exit intent at all»
> — [popupsmart.com/blog/do-exit-intent-popups-work](https://popupsmart.com/blog/do-exit-intent-popups-work)

> «The average popup CVR in 2026 is 4.82%» · «exit-intent popups at 3.94%» *(методика: только
> email-попапы, CVR = собранные адреса / показы)*
> — [wisepops.com/blog/popup-stats](https://wisepops.com/blog/popup-stats)

**МНЕНИЕ (NN/g):**

> «From conducting decades of user research, we know that people dislike popups and modals.»
> — [nngroup.com/articles/popups](https://www.nngroup.com/articles/popups/)

**ФАКТ (санкция поисковика — прямой удар по нашему главному приоритету):**

> «Intrusive interstitials and dialogs are page elements that obstruct users' view of the content,
> usually for promotional purposes.» «Don't obscure the entire page with interstitials.» «Intrusive
> dialogs and interstitials make it hard for Google and other search engines to understand your
> content, which may lead to poor search performance.»
> — [developers.google.com/search/docs/appearance/avoid-intrusive-interstitials](https://developers.google.com/search/docs/appearance/avoid-intrusive-interstitials)

Для проекта, у которого главная боль — отсутствие индексации (`GOAL.md`), этого одного достаточно:
перехват ухода бьёт по SEO.

**ЗАМЕР (качественный, слабый).** Единственное исследование confirmshaming при уходе, которое нашлось:

> «we found that confirmshaming during unsubscription processes is an ineffective strategy. A
> majority of users perceive the companies that employ it in a negative fashion and regard them as
> unprofessional and desperate. This implicates that confirmshaming in unsubscription processes is a
> loss-loss situation for both users and companies and should not be used.»
> «all except one participant claimed that the confirmshaming affected their perception of the
> company in a negative way.»
> — бакалаврская работа, Jönköping University, 2020,
> [diva-portal.org/smash/get/diva2:1438076/FULLTEXT01.pdf](https://www.diva-portal.org/smash/get/diva2:1438076/FULLTEXT01.pdf)

⚠️ 15 участников, качественное исследование, авторы сами предупреждают, что результат не переносится
на популяцию.

### 12.6 Что сходится во всех трёх режимах сразу

Единственный приём, названный поимённо **и** FTC, **и** DSA, **и** законом США о подписках:
асимметрия «легко войти — трудно выйти».

> «Roadblocks to Cancellation — Making it easy to sign up but hard to cancel…» — FTC, Appendix A
> «(c) making the procedure for terminating a service more difficult than subscribing to it» — DSA ст. 25(3)
> «provides simple mechanisms for a consumer to stop recurring charges…» — ROSCA,
> [15 U.S.C. § 8403](https://www.law.cornell.edu/uscode/text/15/8403)

⚠️ Правило FTC «click-to-cancel» (2024) **отменено** Апелляционным судом 8-го округа в 2025 году по
процедурным основаниям:

> «Concluding that the Commission failed to follow procedural requirements… we grant the petitions for
> review and vacate the Rule.»
> — Custom Communications, Inc. v. FTC, No. 24-3137,
> [ecf.ca8.uscourts.gov/opndir/25/07/243137P.pdf](https://ecf.ca8.uscourts.gov/opndir/25/07/243137P.pdf)

ROSCA и §5 FTC Act продолжают действовать — требование простого выхода никуда не делось.

🔴 **Практический вывод для NDim:** удаление аккаунта обязано быть **не сложнее** создания. У нас
`/delete-account` уже есть, и §9.2 показал, что это вдобавок **сильнейший измеренный аргумент
доверия**. Требование трёх независимых источников и лучшее доказательство доверия указывают на одну
и ту же страницу — и сегодня она спрятана.

### 12.7 «Фейковый прогресс» — честная оговорка о статусе

🔴 **«Фейковый прогресс» НЕ является признанным тёмным паттерном по первоисточникам.** Его нет ни в
таксономии FTC (Appendix A), ни в перечне Brignull
([deceptive.design/types](https://www.deceptive.design/types)), ни в пяти категориях Gray et al.
Ближайшее у FTC — «False Hierarchy», и это про другое.

Это приём из психологии мотивации (§11), который становится тёмным ровно в той точке, где прогресс
перестаёт быть правдой. Для нас граница простая и проверяемая: **число на индикаторе должно
соответствовать состоянию данных.** «3 измерения из 7» — факт. «Мы начислили вам 2 шага вперёд» —
манипуляция.

### 12.8 Академическая таксономия — словарь, которым стоит пользоваться

**ФАКТ.** Gray, Kou, Battles, Hoggatt, Toombs, CHI 2018 — корпус из 118 артефактов, пять категорий:

> «We define nagging as a minor redirection of expected functionality that may persist over one or
> more interactions.»
> «We define obstruction as impeding a task flow, making an interaction more difficult than it
> inherently needs to be with the intent to dissuade an action.»
> «We define sneaking as an attempt to hide, disguise, or delay the divulging of information that has
> relevance to the user.»
> «We define interface interference as any manipulation of the user interface that privileges specific
> actions over others…»
> «We define forced action as any situation in which users are required to perform a specific action
> to access (or continue to access) specific functionality.»
> — [par.nsf.gov/servlets/purl/10057203](https://par.nsf.gov/servlets/purl/10057203)

**ЗАМЕР.** Mathur et al., 2019 — масштаб явления в e-commerce:

> «Analyzing ~53K product pages from ~11K shopping websites, we discover 1,818 dark pattern instances,
> together representing 15 types and 7 broader categories… We also uncover 22 third-party entities
> that offer dark patterns as a turnkey solution.»
> — [arxiv.org/abs/1907.07032](https://arxiv.org/abs/1907.07032)

---

## §13. Цена гостевого входа, о которой не пишут в блогах

`researches/10` §2.4 описал **механику** Firebase Anonymous Auth. Здесь — её **цена**, названная
самим Firebase.

**ФАКТ (официальная документация).**

> «The user ID of this new anonymous user is created on the Firebase server and is not connected to
> any identifying properties of the user or their device.»
> 🔴 «Anonymous accounts don't let users have the same account on multiple devices, and anonymous
> accounts are unrecoverable if the user ever gets signed out.»
> «When an anonymous user is more than thirty days old, it will be removed from the authentication
> system.»
> «Anonymous user tokens can be issued through the Firebase REST API. A malicious actor can generate
> an anonymous user token, and then use it to access resources constrained by an anonymous user token.»
> «Instead, implement AppCheck for attestation.»
> — [firebase.blog/posts/2023/07/best-practices-for-anonymous-authentication](https://firebase.blog/posts/2023/07/best-practices-for-anonymous-authentication/)

**Что из этого следует для нашего эпика:**

| Цена | Следствие для проектирования |
|---|---|
| Гость живёт в одном браузере | Человек, открывший ссылку на телефоне, а потом на ноутбуке, — **два разных гостя**. Труд не переносится |
| Гость невосстановим при выходе из сессии | Чистка cookies, режим инкогнито, «забыть сайт» — труд исчез без следа. Обещать «мы сохраним» гостю **нельзя** |
| 30 дней и удаление | Это уже реализовано у нас (`cleanupStaleGuests`, `plans/03` этап 2). Тихая карточка обязана называть срок честно |
| Токен дёргается через REST | Чем шире гостевая дверь, тем дешевле накрутить нашу же воронку `space/funnel`. App Check — не «потом», а часть открытия двери |

⚠️ **Правовая рамка — открытый вопрос, а не факт.** Анонимный вход создаёт идентификатор в хранилище
браузера ещё до того, как человек что-либо ввёл. Директива ePrivacy (2002/58/EC), ст. 5(3) требует
согласия на хранение информации в оконечном оборудовании, кроме случаев «строгой необходимости» для
явно запрошенной услуги; EDPB выпустил Guidelines 2/2023 о техническом охвате этой статьи (приняты
07.10.2024). 🔴 **Дословную формулировку ни статьи, ни руководства вытащить автоматическим запросом
не удалось** (EUR-Lex вернул пустую страницу, PDF EDPB не распарсился) — поэтому я не привожу цитат
и не утверждаю, чем именно это для нас оборачивается. Фиксирую как **вопрос к проверке юристом или
живым чтением документа**, а не как установленный факт. Практическое смягчение очевидно и дёшево:
анонимный вход создаётся **только по нажатию человека** на «Попробовать» — тогда это «явно
запрошенная услуга», а не фоновая слежка.

---

## §14. Числа, которыми пользоваться НЕЛЬЗЯ

Отдельный раздел, потому что при подготовке этого обзора львиная доля выдачи — блоги, ссылающиеся
друг на друга. Ниже — числа, которые вы встретите в любой статье про онбординг и у которых
**первоисточника нет**. Если увидите их в чьём-то (в том числе моём) предложении — требуйте ссылку.

| Число, которое кочует | Что с ним не так |
|---|---|
| «Сокращение полей с 11 до 4 даёт +120% конверсии» | Ходит десятками копий, первоисточник не назван ни в одной из проверенных |
| «Каждое лишнее поле формы = −10% конверсии» | То же; в `researches/10` живёт как «~5–7% на поле» [вендорская цифра] — цифры даже не совпадают между собой |
| «86% пользователей бросают из-за длинных форм» | Источник не назван |
| «Аха-момент за 5 минут даёт +40% удержания на 30-й день» | Встречается в блогах 2026 года без ссылки на исследование |
| «Пользователи, дошедшие до аха-момента за 3 дня, на 90% чаще становятся активными» | То же |
| «26% бросают чекаут из-за требования аккаунта» | На страницах Baymard подтверждается **18%**, не 26% (§3.1) |
| «Guest checkout даёт +20…45% конверсии» | На страницах Baymard не нашёл; только перепечатки |
| «У вас 3–5 секунд, чтобы зацепить» | Замеренные величины — 50 мс (Lindgaard) и 10 секунд (NN/g), см. §7.1 |
| «Смена "your" на "my" в кнопке дала +90%» | ContentVerve; сайт мёртв, методика непроверяема |
| «Кнопка на $300 миллионов» | Не A/B-тест. Спул сам пишет: сумма — **расчёт по брошенным корзинам**, а не измеренная дельта (§5.4) |
| «Убрали стену регистрации → +350% регистраций / +107% лифт» | Агентские подборки, пересказывающие друг друга; прослеживаемого первоисточника нет |
| «Spotify без входа даёт 30-секундные превью» | Официального источника нет — только ветки форума (§5.2) |
| «€7,9 млрд ущерба из-за подписочных тёмных паттернов» | В первоисточнике это **общий** пост-редресс ущерб потребителей ЕС от онлайн-проблем за 2023 г., не привязанный к тёмным паттернам |
| «Правило FTC click-to-cancel действует» | **Отменено** 8-м апелляционным округом в 2025 г. по процедурным основаниям (§12.6). ROSCA действует |
| «Duolingo официально сообщил про +20% DAU» | Число произнесла VP of Growth в интервью First Round Review 2017. **Блог Duolingo его никогда не публиковал** |
| «Конверсия анонимного гостя в аккаунт — X%» | 🔴 **Публичного бенчмарка не существует.** Всё, что выдаёт поиск, — вендорские страницы про «идентификацию анонимных посетителей» |
| «Замер входа без аккаунта в социальной сети / сервисе знакомств» | 🔴 **Не существует вовсе.** Ни одного первоисточника с измеренным эффектом в нашем домене. Duolingo — про обучение, издатели — про новости, Baymard — про магазины |

🔴 Последняя строка важнее прочих: **числа, с которым можно сравнить нашу будущую воронку, в
индустрии нет.** Наш собственный `space/funnel` (`plans/03` этап 4) — единственный источник правды,
который у нас будет. Это аргумент включить его на проде раньше, а не позже.

---

## §15. Что это значит для вопросов интервью №009

Здесь я честно раскладываю, что доказательства говорят по каждому вопросу — **включая те места, где
они говорят против моей же рекомендации.** Ни один из выводов ниже не заменяет Ваш ответ: это
доказательная база под ним, а не решение за Вас.

Сводка одной таблицей:

| Вопрос | Мой вариант в интервью | Что говорят доказательства |
|---|---|---|
| **В1** — где объясняют ценность | А (только лендинг) | ⚠️ **частично против**: «внутри сразу работа» без опор — отдельный измеренный риск. Доказательства ближе к В, но не к «двум наборам текстов» |
| **В2** — трогает или читает | А (трогает) | ⚠️ **скорее за В, чем за А**: одна строка обязана быть, это норматив NN/g. Прямого замера «демо против текста» нет ни у кого |
| **В3** — «Попробовать» главной кнопкой | А | ✅ **самый подкреплённый ответ из пяти**. Возражений не нашёл, кроме требования к находимости входа |
| **В4** — момент просьбы | А (по делу, не по счётчику) | 🔴 **прямо против единственного публичного замера в отрасли**. Инвентарь продуктов — за А, измерение — за счётчик |
| **В6** — обещание первым экраном | А (Ваша формулировка 1.x) | ✅ за А по нормативу и по Вашему авторству; ❌ **замера ни под один из трёх вариантов нет** |

---

### В1. Где человеку объясняют ценность

**За вариант А (только лендинг):**

- Прямая рекомендация NN/g: «we recommend professionals avoid creating app onboarding whenever
  possible and instead spend your resources making the UI more usable» (§8.1).
- Единственный количественный тест туров — против них: 70 человек, тур **не улучшил** ни успешность
  (91% против 94%), ни скорость, и **значимо ухудшил** оценку лёгкости (4,92 против 5,49, p=0,047).
  Люди, прочитавшие тур, считали продукт **сложнее** (§8).
- Замеренное окно внимания (10 секунд, §7.1) меряется именно на веб-странице — на лендинге.

**🔴 Против варианта А — и это надо сказать прямо:**

1. **NN/g сам делает исключение, и мы в него попадаем.** «There are only a few situations when
   onboarding screens can be useful in a mobile app» — среди них **действительно новая парадигма
   взаимодействия**. «Человек — точка в многомерном пространстве, похожесть = Близость × Общность» —
   это не лента и не свайпы. Формально мы в исключении (§8.1).
2. **Провал 1.x доказывает не то, что кажется.** Экраны `ob1`…`ob4` были «feature promotion» — тот
   самый тип, который NN/g запрещает на первом запуске отдельной строкой («Avoid feature-promotion
   onboarding at first launch»). То есть 1.x провалился **не потому, что там был онбординг, а потому
   что там был онбординг запрещённого типа**. Аргумент интервью «это ровно схема 1.x, и она дала
   трение» доказательно слабее, чем выглядит.
3. **«Внутри сразу работа» — это свой собственный измеренный риск.** NN/g про пустые экраны:
   «Completely empty spaces create confusion and decrease user confidence, missing opportunities for
   increasing the usability and learnability of the application» (§8.2). Гость, вошедший в пустое
   Пространство без единого измерения, попадает ровно в это.

**Что доказательства предлагают вместо чистого А.** NN/g даёт готовую замену туру, и это **не второй
набор текстов**: пустые состояния и контекстная помощь. «In-context help can often be applied right
away and is thus more memorable» (§8.2). Форма получается такая: **лендинг несёт обещание и
доказательство; внутри нет ни одного экрана-объяснения, но каждый пустой контейнер сам говорит, что
здесь будет и с чего начать.**

Это ближе к варианту **В** («лендинг обещает, приложение показывает первый шаг»), чем к А — но без
той цены, которой я В в интервью пугал: пустое состояние не дублирует тексты лендинга, оно называет
одно действие. Цена «вдвое больше текстов, которые обязаны не противоречить» здесь не возникает.

**Чего доказательств НЕТ:** ни одного замера, сравнивающего «объяснение на лендинге» против
«объяснение внутри» на одном продукте. Всё выше — перенос из смежных исследований.

---

### В2. Что человек делает первым — трогает или читает

**За вариант А (трогает):**

- Парадокс активного пользователя, классика HCI с 1987 года: «Users never read manuals but start
  using the software immediately» (§7.3).
- Люди физически не прочитают текст: «at most 28% of the words during an average visit; 20% is more
  likely» (§7.2).
- Косвенный, но самый близкий замер: Duolingo дал урок раньше регистрации и получил +20% DAU (§2).

**⚠️ Против чистого А:**

1. **Норматив NN/g требует явного утверждения, а не только демо.** Принцип 2 из пяти: «Communicate
   Who You Are and What You Do»; «Your homepage should communicate your unique value proposition
   clearly, usually through a descriptive tagline»; «Treat your homepage as an elevator pitch»
   (§7.3). Формулировка «объяснение идёт ПОД демо, для тех, кому захотелось понять» этому
   нормативу не удовлетворяет.
2. **Принцип 3 у них же — «Reveal Content Through Examples».** То есть NN/g предписывает **и то, и
   другое сразу**: строку-обещание и живой пример. Это ровно вариант **В** («читает одну строку и
   трогает»), а не А.
3. **50 миллисекунд** (§7.1). Впечатление формируется до того, как человек прочитал или тронул.
   Значит демо обязано **выглядеть правильно с первого кадра** — это, кстати, наше собственное
   правило готовности графики (`AGENT_GUIDE.md`, волна 13), и здесь оно получает внешнее
   подтверждение.

🔴 **Замера «интерактивное демо против текстового объяснения на одном лендинге» не существует.**
Я искал специально: ни у NN/g, ни в академии, ни в публичных кейсах. Числа Navattic (§10) — про
демо в B2B-продажах, и приросты там **самоотчёты клиентов вендора**, а не эксперимент.

**Вывод честно:** доказательства поддерживают «трогать раньше, чем читать много», но **не**
поддерживают «не объяснять вовсе до касания». Между А и В доказательная база стоит ближе к В.

---

### В3. Чем становится кнопка «войти» на лендинге

**Это самый подкреплённый ответ из пяти. За вариант А:**

- Baymard прямо меряет цену ошибки: **62% сайтов не делают гостевой путь самым заметным**, и это
  названо дефектом; 18% бросают из-за требования аккаунта; 24% бросали хотя бы раз за квартал
  «solely due to forced account creation» (§3.1).
- FTC вносит принуждение к регистрации в перечень тёмных паттернов отдельной строкой: «Forced
  Registration or Enrollment» (§3.1). Наш сегодняшний `/profile` попадает под это описание.
- NN/g: «Login or registration should be optional and as many features as possible should be
  available without logging in»; «Always provide guest checkout as an escape hatch» (§3).
- Эксперимент ЕК (n=7430): принуждение к действию не только раздражает, но и **роняет понимание
  показанного и воспринимаемую надёжность сайта** (§12.3). Это измеренная связь между стеной и
  Вашим разрывом А.
- Инвентарь §5: одиннадцать продуктов из тринадцати пускают внутрь без формы.

**⚠️ Единственное возражение, и оно превращается в проверяемый критерий для макетов.** DSA ст. 25(3)
называет практику «giving more prominence to certain choices when asking the recipient of the service
for a decision» (§12.2). Честная иерархия под запрет не подпадает — запрещено то, что «materially
distorts» свободу решения. **Но граница проходит по находимости входа для возвращающегося человека.**
Из этого следует конкретное требование к четырём макетам: вход обязан находиться с первого взгляда,
а не с третьего. Ваши 331 человек из 1.x — не абстракция.

**Чего доказательств НЕТ:** контролируемого A/B «главная кнопка "Попробовать" против двух равных
кнопок» я не нашёл. История про «кнопку на 300 миллионов» (§5.4) — **не A/B-тест**, а расчёт по
брошенным корзинам, и автор это сам признаёт. Ссылаться на неё можно ради формулировки надписи, но
не ради суммы.

---

### В4. В какой момент мы просим гостя стать полноценным

**🔴 Здесь доказательства прямо против моей рекомендации, и это главное, что даёт этот обзор.**

**За вариант А (по делу):**

- Инвентарь §5: **ни один из тринадцати изученных продуктов не просит по счётчику действий и ни
  один — по таймеру сессии.** Барьер везде по типу действия.
- Единственный замер «просьбы в момент желания»: 67% → 89% согласия, когда разрешение на фото
  спрашивают после нажатия «выбрать фото» (Cluster, §6.1). ⚠️ Самоотчёт одной команды, без методики.
- NN/g, принцип взаимности: просить после того, как помог (§3).
- FTC: наггинг определён как просьба, **от которой нельзя отказаться навсегда** (§12.1). «Тихая
  карточка, которая висит всегда и не мигает» этому определению не противоречит — при условии, что
  её можно закрыть насовсем.

**🔴 Против варианта А — доказательство сильнее, чем всё, что за него:**

1. **Единственный публичный замер в нашей предметной области устроен наоборот.** Duolingo просит
   **по прогрессу**: три мягкие стены после уроков, затем жёсткая. +20% DAU от переноса регистрации,
   +8,2% от доводки самих стен (§2).
2. **И у них измерено, что дело именно в повторяемости:** «without those soft walls priming a
   sign-up as they're ignored, those hard walls perform significantly worse». То есть просьба,
   которую проигнорировали, **не пропадает зря — она готовит следующую**. Формулировка «просим один
   раз, по делу» этот эффект теряет целиком.
3. **У издателей стена по счётчику измерена в поле и не убила трафик:** «на второй статье» → рост
   идентифицированных читателей в 5,8 раза, подписки +60%, «Monthly page views were not impacted»
   (§4).
4. **Цена варианта А, названная в самом интервью, подтверждается документацией Firebase и хуже, чем
   я написал.** Не только «потеряет труд через 30 дней»: гость привязан **к одному браузеру** и
   **невосстановим при выходе из сессии** — «Anonymous accounts don't let users have the same account
   on multiple devices, and anonymous accounts are unrecoverable if the user ever gets signed out»
   (§13). Человек, который просто заполняет измерения и никуда не упирается, теряет труд **при
   первой же чистке cookies или при переходе на телефон**, а не через месяц.
5. **IKEA-эффект работает только на ЗАВЕРШЁННОЙ работе:** «labor leads to love only when labor
   results in successful completion of tasks; when participants… failed to complete them, the IKEA
   effect dissipated» (§11). Пока у гостя нет **завершённого видимого результата**, ему нечего терять
   — и просьба «сохраните труд» ни на что не опирается.

**Что из этого следует практически (это не ответ за Вас, а материал для варианта Г):**

- Просьба должна быть привязана не к счётчику оценок и не к таймеру, а к **завершённому результату**:
  «Ваше Пространство собрано — 7 измерений, ближайший человек 84%». Это одновременно (а) момент, где
  IKEA-эффект вообще существует, (б) не выдуманное число из варианта Б, (в) не наггинг, если
  отказаться можно навсегда.
- Аргумент против варианта Б в интервью («число придётся выдумать») **держится хуже, чем я
  написал**: Duolingo своё число тоже выдумал, а потом измерил. Настоящее препятствие у нас другое —
  **воронка `space/funnel` на проде выключена** (`plans/03` этап 4, «осознанный no-op»). Пока она
  молчит, любой порог остаётся выдумкой навсегда. Это аргумент включить её раньше макетов.
- 🔴 **Публичного бенчмарка «конверсия анонимного гостя в аккаунт» не существует** (§14). Сравнивать
  будет не с чем — только со своей же вчерашней цифрой.

**За отклонение варианта В (перехват ухода) — доказательств больше, чем нужно (§12.5):**
независимого замера пользы exit-intent **нет вообще** (вендор попапов сам это признаёт); NN/g:
«people dislike popups and modals»; и — решающее для нашего проекта — Google прямо предупреждает,
что назойливые интерстишалы «may lead to poor search performance». Для проекта, чья главная боль —
индексация, этого достаточно без всякой этики.

---

### В6. Какое обещание стоит первым экраном

**За вариант А («Найдите людей, действительно похожих на Вас»):**

- Норматив NN/g: обещание обязано быть коротким утверждением о том, кто мы и что делаем —
  «descriptive tagline», «elevator pitch» (§7.3). Формулировка из `researches/05` OB1 этому
  соответствует: она называет **результат**, а не устройство.
- Замеренное окно: 10 секунд на понятое обещание, 50 мс на визуальное впечатление (§7.1).
- Ограничение по объёму, которое стоит взять в работу буквально: «on an average visit, users read
  half the information only on those pages with **111 words or less**» (§7.2). Первый экран должен
  укладываться в этот порядок величины.

**⚠️ Против варианта В («Здесь Вас находят не по фото») есть довод из исследования, а не из вкуса.**
«Strangers on a Plane» (JCR 2011): как только тема угрозы или приватности поднята, готовность
раскрываться **падает**; сигналы среды влияют на раскрытие сильнее, чем реальный риск (§9.3).
Обещание через отрицание чужой боли поднимает тему угрозы **в первую секунду знакомства** — ровно
там, где мы просим человека начать про себя рассказывать. Это не запрет, но это измеренный риск,
которого у вариантов А и Б нет.

**🔴 Чего доказательств НЕТ — и это надо сказать вслух:**

1. **Замера «выгода против свойства» (benefit vs feature) я не нашёл** (§7.3). Поиск даёт только
   агентские блоги, ссылающиеся друг на друга. Это уважаемая ремесленная традиция, но доказательной
   базы под ней предъявить не могу.
2. **Никакого способа выбрать между А, Б и В по доказательствам не существует.** Ни одно
   исследование не отвечает на вопрос, какое из трёх обещаний сработает на русскоязычном человеке,
   пришедшем с рекламы. Это решается **только** A/B на нашей собственной воронке — то есть опять
   упирается в `space/funnel` на проде.
3. Единственное, что доказательства говорят про **текст доверия** рядом с обещанием: он должен быть
   коротким, утвердительным и о том, что мы СДЕЛАЕМ, а не о том, чего не будем. «Не будем спамить»
   в единственном найденном A/B дало **−18,7%**, «не передадим ваши данные» — **+19,5%** (§9.3,
   ⚠️ первоисточник мёртв, это гипотеза). И полосы «мы заботимся о вашей приватности» на первом
   экране лучше не делать вовсе.

---

### Бонусом — В5 (граница гостя), хотя вопроса ко мне не было

Инвентарь §5.3 неожиданно подтверждает Ваше решение В3=А из интервью №004. Canva и Notion разрешают
анонимную **правку**, но требуют вход на **комментарий**. То есть индустрия проводит границу там же,
где провели её Вы: **идентичность нужна под высказыванием, а не под работой.** Гость NDim заполняет
свои измерения (работа) и не может быть видимым другим (высказывание о себе перед людьми). Это не
случайное совпадение, а одна и та же логика.

---

### Три вещи, которые я бы сделал до макетов

Не решения — предложения, вытекающие прямо из доказательств:

1. **Включить `space/funnel` на проде.** Публичного бенчмарка нет (§14), значит единственная правда
   про нас — наша собственная. Пока воронка молчит, любой ответ на В4 и В6 останется вкусом, а не
   выбором.
2. **Поднять `/delete-account` из подвала.** Возможность удалить данные — измеренно второй по силе
   фактор доверия после согласия (n=3539, §9.2), а «легко войти, трудно выйти» — единственный приём,
   осуждённый и FTC, и DSA, и ROSCA сразу (§12.6). У нас эта страница уже есть; она работает не там,
   где могла бы.
3. **Проверить прибором две вещи, которые я не смог подтвердить документами:** (а) правда ли
   Duolingo даёт первый урок до регистрации — приватное окно, две минуты (§5.2); (б) как выглядит
   первый экран `/profile` глазами человека, который никогда здесь не был. Второе — прямо по
   `EXPERIENCE.md` EXP-0086: гостевые ветки интерфейса однажды уже никто не видел живьём.

---

## §16. Главные источники

**Замеры (числа с методикой):**
- Duolingo, отложенная регистрация: [First Round Review](https://review.firstround.com/the-tenets-of-a-b-testing-from-duolingos-master-growth-hacker/)
- Онбординг-туры, 70 участников: [NN/g, Mobile Tutorials](https://www.nngroup.com/articles/mobile-tutorials/)
- Время на странице, 2 млрд измерений: [NN/g / Microsoft Research](https://www.nngroup.com/articles/how-long-do-users-stay-on-web-pages/)
- Сколько слов читают, 45 237 просмотров: [NN/g](https://www.nngroup.com/articles/how-little-do-users-read/)
- Отказ из-за требования аккаунта, n=1026: [Baymard](https://baymard.com/lists/cart-abandonment-rate)
- Стена регистрации у издателя, 12 месяцев: [Mather Economics](https://www.mathereconomics.com/an-inside-look-on-how-registration-walls-impact-subscriber-growth/)
- «Можно удалить данные» как фактор доверия, n=3539: [JAMA Netw Open 2023](https://pmc.ncbi.nlm.nih.gov/articles/PMC9982693/)
- Заявление о приватности vs значок доверия: [MIS Quarterly 2007](https://aisel.aisnet.org/misq/vol31/iss1/4/)
- Страх приватности, n=4272 / n=5101: [Pew 2019](https://www.pewresearch.org/internet/2019/11/15/americans-and-privacy-concerned-confused-and-feeling-lack-of-control-over-their-personal-information/) · [Pew 2023](https://www.pewresearch.org/short-reads/2023/10/18/key-findings-about-americans-and-data-privacy/)

**Академическая база:**
- [Lindgaard et al. 2006, 50 мс](https://www.tandfonline.com/doi/abs/10.1080/01449290500330448) ·
  [John, Acquisti, Loewenstein 2011, приватность и контекст](https://econpapers.repec.org/article/oupjconrs/doi_3a10.1086_2f656423.htm) ·
  [Norton, Mochon, Ariely 2012, IKEA-эффект](https://myscp.onlinelibrary.wiley.com/doi/abs/10.1016/j.jcps.2011.08.002) ·
  [Nunes & Drèze 2006, endowed progress](https://academic.oup.com/jcr/article-abstract/32/4/504/1796900) ·
  Carroll & Rosson 1987, парадокс активного пользователя (через [NN/g](https://www.nngroup.com/articles/paradox-of-the-active-user/))

- Тёмные паттерны, эксперимент: [Luguri & Strahilevitz, *Journal of Legal Analysis* 13(1), 2021](https://academic.oup.com/jla/article/13/1/43/6180579) ·
  масштаб: [Mathur et al. 2019](https://arxiv.org/abs/1907.07032) ·
  таксономия: [Gray et al., CHI 2018](https://par.nsf.gov/servlets/purl/10057203)

**Нормативы и стандарты:**
- [GOV.UK Service Manual: form structure](https://www.gov.uk/service-manual/design/form-structure) ·
  [GOV.UK Design System: question pages](https://design-system.service.gov.uk/patterns/question-pages/)
- [Firebase: anonymous auth best practices](https://firebase.blog/posts/2023/07/best-practices-for-anonymous-authentication/)
- [FTC: Bringing Dark Patterns to Light (2022)](https://www.ftc.gov/system/files/ftc_gov/pdf/P214800%20Dark%20Patterns%20Report%209.14.2022%20-%20FINAL.pdf) ·
  [Регламент (ЕС) 2022/2065 (DSA), ст. 25](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32022R2065) ·
  [Digital Fairness Fitness Check, SWD(2024) 230](https://www.parlament.gv.at/dokument/XXVII/EU/198771/imfname_11414925.pdf) ·
  [ROSCA, 15 U.S.C. § 8403](https://www.law.cornell.edu/uscode/text/15/8403) ·
  [deceptive.design/types (Brignull)](https://www.deceptive.design/types) ·
  [Google Search: avoid intrusive interstitials](https://developers.google.com/search/docs/appearance/avoid-intrusive-interstitials)

**Справка продуктов (кто пускает без аккаунта):**
- [Figma: open sessions](https://help.figma.com/hc/en-us/articles/4410786053911-Invite-visitors-to-an-open-session) ·
  [Canva: collaborate with anyone](https://www.canva.com/help/collaborate-with-anyone/) ·
  [Excalidraw: how to start](https://plus.excalidraw.com/how-to-start) ·
  [tldraw: what's new](https://tldraw.dev/blog/whats-new-2025) ·
  [Photopea: privacy](https://www.photopea.com/privacy.html) ·
  [Notion: sharing and permissions](https://www.notion.com/help/sharing-and-permissions) ·
  [Google Docs: share files](https://support.google.com/docs/answer/2494822) ·
  [OpenAI: start using ChatGPT instantly](https://openai.com/index/start-using-chatgpt-instantly/) ·
  [help.openai.com: the ChatGPT home page](https://help.openai.com/en/articles/9125172-the-chatgpt-home-page)

**Экспертиза (мнения NN/g):**
- [Login Walls](https://www.nngroup.com/articles/login-walls/) ·
  [Checklist for Registration and Login](https://www.nngroup.com/articles/checklist-registration-login/) ·
  [Don't Force Users to Register](https://www.nngroup.com/articles/optional-registration/) ·
  [Mobile-App Onboarding](https://www.nngroup.com/articles/mobile-app-onboarding/) ·
  [Onboarding Tutorials vs. Contextual Help](https://www.nngroup.com/articles/onboarding-tutorials/) ·
  [Instructional Overlays and Coach Marks](https://www.nngroup.com/articles/mobile-instructional-overlay/) ·
  [Empty States](https://www.nngroup.com/articles/empty-state-interface-design/) ·
  [Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/) ·
  [Homepage Design: 5 Principles](https://www.nngroup.com/articles/homepage-design-principles/) ·
  [Passwordless Accounts](https://www.nngroup.com/articles/passwordless-accounts/) ·
  [EAS Framework for Forms](https://www.nngroup.com/articles/eas-framework-simplify-forms/)
