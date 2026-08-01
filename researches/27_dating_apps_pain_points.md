# Исследование 27 — Боли людей в приложениях для знакомств: что доказано, что нет, и что нам можно обещать

**Снято:** 2026-08-01 · **Заказано:** Ваш ответ В6 в `interviews/interview_009_frictionless_entry.md`:
«нужно исследование болей людей, который хотят познакомится, завести друзей, общение, отношения —
чего они не получают в существующих приложениях для знакомств — прямо эти боли уверенно обещаем
закрыть» · **Обслуживает:** тексты лендинга (будущий эпик `plans/21`), обещание первого экрана (В6),
FAQ и отзывы (В11), `og:image` и SEO-описание (В9)

> Ступень 1 лестницы `/plan-epic` для текстового эпика: обзор индустрии по первоисточникам.
> Каждый факт — URL + дословная цитата. **Ни одно число здесь не придумано:** где замера нет, так и
> написано.
>
> Смежные документы, которые здесь НЕ повторяются: `researches/25` (онбординг и донесение ценности,
> 128 первоисточников — там же тёмные паттерны, FTC, DSA и §14 «числа, которыми пользоваться
> нельзя»), `researches/26` (SEO), `researches/05` (Ваши тексты 1.x), `ideas/09` (Ваша боль 1.x).

---

## §0. Резюме: семь находок, которые меняют постановку задачи

| Что Вы сказали в В6 | Что показала разведка |
|---|---|
| «у нас без рекламы» | ✅ Обещание правдиво и подкреплено чужим провалом: **80% приложений знакомств делятся или продают личные данные ради рекламы** (Mozilla, 2024), Grindr оштрафован на **6,5 млн €** ровно за это. ⚠️ Но у Match Group реклама — около **2% выручки**: «они живут с рекламы» было бы неправдой. Живут они с подписок |
| «у нас бесплатно без каких либо покупок» | ✅ Правдиво и проверяемо. ⚠️ **Не уникально:** открытая Alovoa обещает дословно то же — «100% free, no ads», «no microtransactions». Отличие NDim не в цене, а в математике |
| «у нас прозрачно и честно» | ✅ Сильнейшее место. Tinder официально пишет, что **главный фактор попадания в чужую ленту — «использование приложения»**. То есть видимость там продаётся вниманием. У нас видимость — функция заполненности профиля, а не активности |
| «симметрично без перекоса привилегированными функциями для женщин или мужчин» | 🔴 **Здесь надо переформулировать.** Документированного перекоса в *прайс-листе по полу* я не нашёл — единственная доказанная в суде ценовая дискриминация была **по возрасту** (Tinder, 60,5 млн $ мировая). Зато асимметрия **опыта** доказана Pew, а асимметрия **аудитории** — рецензируемой статьёй (в Праге женщин 24,9% пользователей). Обещать надо симметрию, которая у нас в коде, а не отсутствие чужой, которой в прайсах нет |
| «математическая точность, а не желание эксплуатировать внимание» | 🔴 **Самая опасная часть.** Наука прямо говорит: **алгоритмы совместимости не предсказывают притяжение** (Finkel и др., 2012), а машинное обучение по 100+ анкетным чертам **не смогло предсказать взаимную симпатию до встречи** (Joel и др., 2017). Обещать «точный расчёт отношений» — обещать то, что наука объявила непредсказуемым |
| «мы КАЛЬКУЛЯТОР в мире отношений» | ⚠️ Метафора держится, если калькулятор считает **сходство**, а не **отношения**. Сходство он считает честно, и мета-анализ 313 исследований подтверждает: **фактическое сходство работает именно там, где мы стоим — до знакомства** (r = .47), и **перестаёт работать в уже существующих отношениях** |
| «завести друзей, общение» | ✅ Подкреплено: **24% людей в 142 странах** чувствуют себя одинокими, самые одинокие — **19–29 лет (27%)**; в США **12% взрослых говорят, что у них нет ни одного близкого друга**. ⚠️ Но замера «дружеские приложения не справляются» я не нашёл — есть только вендорские опросы Bumble |

🔴 **Главный вывод одной строкой.** Из шести Ваших обещаний **пять доказуемы**, а шестое — «математическая
точность в отношениях» — доказуемо ровно наполовину: мы имеем право обещать точный расчёт **сходства
и знакомства**, но не имеем права обещать точный расчёт **отношений**. Разница между этими двумя
фразами — это разница между честным продуктом и обещанием того, что не сбудется. См. §8 и §10.

---

## §1. Как читать пометки

| Пометка | Что значит |
|---|---|
| **[ФАКТ]** | Проверяемое событие: решение суда, штраф регулятора, официальный текст компании, строка в отчётности |
| **[ЗАМЕР]** | Измерение с названной выборкой и методом (опрос, эксперимент, мета-анализ) |
| **[МОДЕЛЬ]** | Теоретическая работа — выводит следствие из допущений, но ничего не измеряет в реальных приложениях |
| **[ВЕНДОР]** | Замер, оплаченный заинтересованной стороной (опрос приложения о самом себе). Годится как иллюстрация, не как доказательство |
| **[МНЕНИЕ]** | Публицистика, блог, экспертная реплика без данных |
| 🔴 **[ЗАМЕРА НЕТ]** | Я искал и не нашёл. Так и написано — вместо того, чтобы подпереть тезис слабой ссылкой |

---

## §2. Что людям не нравится: единственный крупный независимый замер — Pew

Pew Research Center — некоммерческий исследовательский центр, чьи опросы репрезентативны для взрослых
США. Это самая надёжная опора в этом разделе; всё остальное в отрасли — либо вендорские опросы, либо
пересказы.

### 2.1 Общая рамка: люди пользуются и при этом недовольны

> «Three-in-ten U.S. adults say they have ever used a dating site or app»
> — [Pew, «From Looking for Love to Swiping the Field», 02.02.2023](https://www.pewresearch.org/internet/2023/02/02/from-looking-for-love-to-swiping-the-field-online-dating-in-the-u-s/) **[ЗАМЕР]**

> «53% of online dating users say their experiences have been at least somewhat positive» … «46% say
> their experiences have been very or somewhat negative overall»
> — там же **[ЗАМЕР]**

> «Larger shares of Americans who are currently using dating sites or apps or who have done so in the
> past year say the experience left them feeling more frustrated (45%) than hopeful (28%).»
> — [Pew, «Users of online dating platforms experience both positive – and negative – aspects», 06.02.2020](https://www.pewresearch.org/internet/2020/02/06/users-of-online-dating-platforms-experience-both-positive-and-negative-aspects-of-courtship-on-the-web/) **[ЗАМЕР]**

⚠️ Читайте эту пару честно: **половина людей довольна**. Обещание «все ненавидят приложения знакомств»
было бы враньём. Правда тоньше и сильнее: **среди тех, кто пользуется прямо сейчас, разочарованных
в полтора раза больше, чем обнадёженных**.

### 2.2 Что именно происходит с людьми

> «Some 37% of online dating users say someone on a dating site or app has continued to contact them
> after they said they weren't interested, while 28% say they have been called an offensive name while
> using these platforms. About one-in-ten users (9%) also say that someone on a dating site or app has
> threatened to physically harm them. Other negative encounters are more sexualized: 35% of users say
> someone on a dating site or app has sent them a sexually explicit message or image they did not ask
> for.»
> — [Pew, 06.02.2020](https://www.pewresearch.org/internet/2020/02/06/users-of-online-dating-platforms-experience-both-positive-and-negative-aspects-of-courtship-on-the-web/) **[ЗАМЕР]**

### 2.3 Недоверие к тому, что человек напротив — настоящий

> «about half of all users – believe that it is very common for people on dating sites and apps to set
> up fake accounts in order to scam others (50%)»
> — [Pew, 06.02.2020](https://www.pewresearch.org/internet/2020/02/06/users-of-online-dating-platforms-experience-both-positive-and-negative-aspects-of-courtship-on-the-web/) **[ЗАМЕР]**

И это не паранойя — деньги реальны:

> «Consumers reported losing $1.16 billion to romance scams» за первые девять месяцев 2025 года,
> 55 604 сообщения — данные Consumer Sentinel Network FTC
> — [FTC Consumer Sentinel / отчётность 2025](https://www.ftc.gov/system/files/ftc_gov/pdf/csn-annual-data-book-2024.pdf) **[ФАКТ]**
> ⚠️ Точную страницу отчёта за 2025 год я цитирую по вторичному пересказу
> ([Central Oregon Daily](https://www.centraloregondaily.com/news/consumer/ftc-romance-scams-1-billion-losses-2025/article_c32c7fc5-c3a9-4cdc-8f4b-c80293080267.html));
> первичный Data Book за 2024 год лежит по ссылке выше. **Перед использованием числа на лендинге его
> обязан подтвердить первоисточник FTC.**

🔴 **Что из этого следует для NDim.** Мы **не** решаем проблему мошенников: у нас нет ни верификации
личности, ни модерации переписки. Обещать «у нас нет фейков» — врать (см. §10). Что мы честно решаем —
это **отсутствие мотива у фейка**: там, где нельзя ни заплатить, ни продвинуться, ни купить видимость,
фальшивый профиль не окупается. Это слабее, но правда.

---

## §3. Выгорание от свайпов: явление есть, независимого замера почти нет

### 3.1 Рецензируемая работа — единственная надёжная опора

> «Four hundred ninety-three active single dating app users were surveyed over four waves across 12
> weeks… Multilevel growth curve models showed that dating app users experienced increased emotional
> exhaustion and inefficacy over time.»
> — Bonilla-Zorita и др. / см. запись Arizona State University,
> [«Burnt out and still single: Susceptibility to dating app burnout over time»](https://asu.elsevierpure.com/en/publications/burnt-out-and-still-single-susceptibility-to-dating-app-burnout-o/) **[ЗАМЕР]**

Это лонгитюд: тех же людей измеряли четыре раза за 12 недель, и **истощение росло со временем**. Не
«люди устали» вообще, а «чем дольше пользуешься, тем хуже» — ровно то, чего Вы не хотите строить.

### 3.2 Числа, которые кочуют по прессе, — вендорские

> «78% of respondents have felt emotionally, mentally or physically exhausted by dating apps»
> — [Forbes Health, опрос 1000 американцев](https://www.forbes.com/health/dating/dating-app-fatigue/) **[ВЕНДОР/МЕДИА]**

> Опрос Hily среди «3 000+ Gen Z-пользователей Hily» — [Hily 2026 Dating Truth Report](https://hily.com/data/hily-2026-dating-truth-report/) **[ВЕНДОР]**

🔴 **На лендинг эти числа брать нельзя.** Forbes Health — медиа-опрос без публичной методики; Hily —
приложение знакомств, опрашивающее собственных пользователей о том, как плохо в приложениях знакомств.
Это конфликт интересов в чистом виде.

### 3.3 Косвенное подтверждение усталости — деньги отрасли

> «Tinder payers fell 8% from a year ago» в IV квартале 2025; у Match Group в целом
> «a 5% year-over-year decline in payers to 13.8 million»
> — [CNBC, отчёт Match Group за IV кв. 2025](https://www.cnbc.com/2026/02/03/match-group-mtch-q4-2025-earnings-.html) **[ФАКТ]**

Люди платят меньше и уходят. Это не наше мнение — это отчётность публичной компании.

---

## §4. Одиночество и поиск дружбы, а не только романа

Вы просили отдельно — «завести друзей, общение». Здесь доказательная база **сильнее**, чем по
знакомствам, потому что одиночество меряют государства и глобальные опросы, а не заинтересованные
приложения.

### 4.1 Масштаб — глобальный замер

> «Nearly one in four people worldwide — which translates into more than a billion people — feel very
> or fairly lonely» · молодые 19–29 лет — «27% feeling very or fairly lonely», старшие 65+ — «17%» ·
> «approximately 1,000 participants, aged 15 and older, interviewed in 142 countries and territories» ·
> «Surveys were administered from June 2022 through February 2023»
> — [Gallup, «Almost a Quarter of the World Feels Lonely» (Meta-Gallup State of Social Connections)](https://news.gallup.com/opinion/gallup/512618/almost-quarter-world-feels-lonely.aspx) **[ЗАМЕР]**

🔴 **Обратите внимание на возрастной разворот:** самые одинокие — не старики, а **19–29 лет**. Это ровно
та аудитория, которая ищет и знакомства, и друзей, и которая уже выгорела от свайпов (§3).

### 4.2 Дружба — не метафора, а дефицит с цифрами

> «In 1990, three-quarters (75 percent) of Americans reported having a best friend» → «Nearly six in 10
> (59 percent) Americans say they have one person they consider their best friend» ·
> «Thirteen percent of Americans say they have 10 or more close friends, which is roughly the same
> proportion of the public that has no close friends (12 percent)»
> — [Survey Center on American Life / AEI, «The State of American Friendship», 06.2021](https://www.americansurveycenter.org/research/the-state-of-american-friendship-change-challenges-and-loss/)
> ([PDF](https://www.aei.org/wp-content/uploads/2021/07/The-State-of-American-Friendship.pdf)) **[ЗАМЕР]**

Сравните две строки: в 1990-м **3%** американцев не имели ни одного близкого друга, сегодня — **12%**.
Учетверение.

### 4.3 Государство назвало это эпидемией

Advisory главного врача США (2023) — 82 страницы, официальный документ HHS:
[«Our Epidemic of Loneliness and Isolation»](https://www.ncbi.nlm.nih.gov/books/NBK595227/) (полный
текст в NCBI Bookshelf) **[ФАКТ — официальный документ]**.
⚠️ Прямой PDF на hhs.gov отдаёт 403 моему инструменту; **самые известные числа оттуда («как 15 сигарет
в день», «+29% риск преждевременной смерти») я приводить не берусь, пока не прочитаю их в первоисточнике
глазами.** Это ровно тот случай, где вся выдача — пересказы пересказов.

### 4.4 Спрос на дружбу приложения увидели — но замер вендорский

> Bumble выделила BFF в отдельное приложение; «Research commissioned by Bumble found that 55% of people
> aged 18 to 35 are actively seeking new local friends»
> — [Fast Company, «Bumble launches BFF as a stand-alone app»](https://www.fastcompany.com/91406463/bumble-launches-bff-as-a-standalone-app-to-lead-the-great-frienaissance) **[ВЕНДОР]**

🔴 **[ЗАМЕРА НЕТ]** Независимого измерения «люди хотят дружбы, а приложения знакомств её не дают» я не
нашёл. Есть дефицит дружбы (§4.2, независимо), есть коммерческий разворот отрасли в дружбу (факт), но
прямой связки «приложения не справляются с дружбой» — нет. **На лендинге поэтому нельзя сказать «мы
даём то, чего вам не даёт Tinder». Можно сказать «здесь ищут не только пару» — и это будет правдой о
нас, а не наездом на них.**

⚠️ И тут же второй эффект, который стоит назвать: NDim **вообще не спрашивает, что Вы ищете** — пару,
друга, собеседника. Он считает сходство. Значит обещание «здесь ищут друзей» держится не на функции, а
на отсутствии рамки. Это честно, но слабее, чем звучит: человек, пришедший за дружбой, увидит тот же
экран, что и пришедший за романом.

---

## §5. Асимметрия по полу: что доказано, а что — публицистика

🔴 Тема скользкая, поэтому здесь строже всего. Разделяю три разные вещи, которые в спорах постоянно
смешивают: **асимметрия аудитории**, **асимметрия опыта** и **асимметрия функций и цен**.

### 5.1 Асимметрия аудитории — доказана рецензируемой статьёй

> «The Prague network contained 2,321 users with 24.9% women, while Brno had 624 users with 20.4%
> women» · «The distribution of desirability in both markets is strongly positively skewed with a few
> highly desirable users receiving a disproportionate number of swipes and a lot of users receiving none
> or almost none.»
> — Topinkova R., Diviak T., [«It takes two to tango: A directed two-mode network approach to
> desirability on a mobile dating app», PLOS ONE, 23.07.2025](https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0327477) **[ЗАМЕР]**

Там же: мужчины пишут «вверх» (в Праге — на 0,08 стандартизованного пункта желанности выше себя,
p<0,001; в Брно — 0,16), женщины — слегка «вниз»; взаимность — 27% в Брно и 38% в Праге.

⚠️ Это **одно** приложение в **одной** стране. Обобщать «везде мужчин втрое больше» по нему нельзя.
Но как доказательство того, что рынок перекошен и внимание концентрируется на немногих, оно годится.

**[ЗАМЕРА НЕТ] по России и по крупным приложениям.** Все ходовые цифры вида «Tinder 67/33» лежат в
SEO-блогах swipestats/datingnews без первоисточника. 🔴 **Не брать.**

Единственная надёжная общая цифра — опять Pew:

> «Men are more likely than women to report positive experiences (57% vs. 48%)»
> — [Pew, 2023](https://www.pewresearch.org/internet/2023/02/02/from-looking-for-love-to-swiping-the-field-online-dating-in-the-u-s/) **[ЗАМЕР]**

### 5.2 Асимметрия опыта — доказана и она зеркальна

> «56% of women under 50 who have used dating sites or apps have been sent unwanted sexually explicit
> messages or images on one. This is 20 points greater than the share of women 50 and older and 30
> points greater than the share of men.»
> — [Pew, «The experiences of U.S. online daters», 02.02.2023](https://www.pewresearch.org/internet/2023/02/02/the-experiences-of-u-s-online-daters/) **[ЗАМЕР]**

И вот главная цитата всего раздела — та, что описывает **две противоположные боли одновременно**:

> «Some 55% of current or recent online dating users say they have at least sometimes been insecure
> about the number of messages they received over the past year, while fewer (36%) say they have felt
> overwhelmed by that number.» … «About one-in-five women who have used dating sites or apps in the past
> year report *often* feeling overwhelmed by the volume of messages they get; a similar share of men say
> they have often felt insecure about this.»
> — [Pew, 2023](https://www.pewresearch.org/internet/2023/02/02/the-experiences-of-u-s-online-daters/) **[ЗАМЕР]**

🔴 **Это и есть настоящая формулировка Вашей «симметрии», и она сильнее той, что Вы произнесли.**
Перекос не в том, что кому-то дали привилегии. Перекос в том, что **женщина тонет во внимании, а мужчина
его не получает вовсе** — и обе стороны недовольны одним и тем же устройством. Продукт, который не
торгует вниманием, лечит обе боли сразу, а не выбирает сторону.

### 5.3 Асимметрия функций и цен — 🔴 здесь Ваше утверждение НЕ подтвердилось

Я искал документированные «привилегированные функции для женщин или мужчин» — прайс-лист, где пол
меняет цену, или функцию, доступную одному полу. **Не нашёл.**

Что нашёл вместо:

- **[ФАКТ] Доказанная в суде ценовая дискриминация была по ВОЗРАСТУ, а не по полу.**
  > Tinder «charged consumers age 30 and older $19.99 per month while charging consumers under 30 only
  > $9.99 or $14.99 per month»; апелляционный суд Калифорнии 29.01.2018 восстановил иск, признав, что
  > модель нарушает Unruh Civil Rights Act
  > — [Candelore v. Tinder, Inc., 19 Cal.App.5th 1138 (2018)](https://law.justia.com/cases/california/court-of-appeal/2018/b270172.html);
  > мировое соглашение на **60,5 млн $** предварительно одобрено
  > ([Top Class Actions](https://topclassactions.com/lawsuit-settlements/lawsuit-news/60-5m-tinder-age-based-pricing-class-action-settlement-gets-preliminary-approval/))

- **[ФАКТ] Единственная явная гендерная механика отрасли — Bumble «женщина пишет первой» — отменена
  самой Bumble в 2024 году.**
  > «Dating app Bumble will no longer require women to make the first move» — компания ввела «opening
  > moves», сославшись на усталость женщин от обязанности писать первой
  > — [CNN Business, 30.04.2024](https://www.cnn.com/2024/04/30/tech/bumble-relaunch-men-make-first-move)

**Вывод для текста лендинга.** Фразу «без перекоса привилегированными функциями для женщин или мужчин»
в таком виде выпускать нельзя: она утверждает про конкурентов то, что я не смог подтвердить, и первый же
дотошный читатель попросит пример. Правдивая и более сильная замена — **утверждение о себе, а не о них**,
и оно проверено по нашему коду:

✅ **Проверено чтением кода (`src/lib/similarity/similarity.ts`, `src/lib/model/schema.ts`,
`src/lib/data/relations.ts`):** поле `gender: 'm' | 'w' | 'nb' | null` в профиле **есть** и управляется
видимостью наравне с именем и датой рождения — но **в расчёт похожести оно не входит вовсе**. Похожесть
считается только по общим измерениям и оценкам. Пол в NDim — это то, что человек о себе показывает, а не
то, чем система его сортирует.

И у Вас уже написан текст ровно об этом — он лежит в руководстве пользователя (`src/lib/content/docs.ts`,
раздел «Идея»):

> «Пространство NDim выполняет поиск похожих друг на друга людей при помощи безукоризненной точности и
> неумолимой строгости математики. Оно одинаково непредвзято по отношению ко всем своим пользователям,
> невзирая на их пол, расу, цвет кожи, вероисповедание, мировоззрение, убеждения и так далее.»

**Это и есть готовая строка лендинга — Вашим голосом, уже опубликованная, ничего сочинять не надо.**

---

## §6. Монетизация против результата: где доказательства есть, а где их нет

Вы строите на этом весь замысел, поэтому здесь я особенно старался **опровергнуть**, а не подтвердить.

### 6.1 ✅ ДОКАЗАНО: государство поймало крупнейшего игрока на обмане — но не на том, о чём спорят

> Match Group согласилась выплатить **14 млн $** и навсегда прекратить обманную рекламу, обманные
> практики отмены подписки и биллинга; мировое соглашение подано 12.08.2025 в Северный округ Техаса.
> Иск FTC подан в **2019** году: компания «lured consumers with fraudulent notifications», исказила
> свою «six-month guarantee», сделала отмену подписки «unnecessarily confusing» и отключала доступ тем,
> кто проиграл спор по списанию.
> — [FTC, пресс-релиз 12.08.2025](https://www.ftc.gov/news-events/news/press-releases/2025/08/match-group-agrees-pay-14-million-permanently-stop-deceptive-advertising-cancellation-billing)
> (страница отдаёт 403 роботам; дело — [FTC v. Match Group, Inc., № 172-3013](https://www.ftc.gov/legal-library/browse/cases-proceedings/172-3013-match-group-inc));
> цитаты сверены по [Covington «Inside Privacy»](https://www.insideprivacy.com/consumer-protection/ftc-secures-14-million-settlement-with-match-group-over-deceptive-subscription-practices/)
> и [Frankfurt Kurnit](https://advertisinglaw.fkks.com/post/102l0pi/ftc-swipes-left-on-match-groups-deceptive-advertising-and-cancellation-practices) **[ФАКТ]**

Внутренняя презентация Match, которую цитировал регулятор, описывала собственную отмену подписки как
«hard to find, tedious, and confusing».

🔴 **Вот что здесь важно и что легко переврать.** FTC поймала Match **на обмане в рекламе и в отмене
подписки** — то есть на тёмных паттернах. FTC **не** доказывала, что алгоритм намеренно не сводит людей.
Это разные обвинения, и смешивать их на лендинге нельзя.

### 6.2 🔴 НЕ ДОКАЗАНО: «приложения намеренно сделаны, чтобы вы не нашли»

Именно это утверждение — сердце `GOAL.md` («специально работают так, чтобы ты платил им за подписку и
находился в бесконечном поиске»). Оно **заявлено в суде и не подтверждено судом**.

- Коллективный иск подан 14.02.2024 в Северном округе Калифорнии: платформы построены с «addictive,
  game-like design features, which lock users into a perpetual pay-to-play loop that prioritizes
  corporate profits over its marketing promises and customers' relationship goals»
  — [CBS News](https://www.cbsnews.com/sanfrancisco/news/class-action-lawsuit-claims-tinder-hinge-dating-apps-designed-to-addict-users/) **[ЗАЯВЛЕНИЕ СТОРОНЫ, НЕ ФАКТ]**
- Ответ Match: «This lawsuit is ridiculous and has zero merit. Our business model is not based on
  advertising or engagement metrics.» — там же
- 🔴 **Итог: дело ушло в арбитраж.** Федеральный судья удовлетворил ходатайство о принудительном
  арбитраже и приостановил разбирательство — то есть **публичного судебного разбора по существу не
  будет**
  — [Top Class Actions](https://topclassactions.com/lawsuit-settlements/consumer-products/mobile-apps/tinder-hinge-class-action-claims-apps-are-purposely-addictive/) **[ФАКТ о процессуальном исходе]**

⚠️ **Значит формулировку «доказано, что они не хотят вас сводить» использовать нельзя.** Это судебное
обвинение, снятое с публичного рассмотрения по формальному основанию. Мы вправе сказать, что **такое
обвинение было предъявлено**, и вправе строить продукт иначе — но не вправе объявлять его доказанным.

### 6.3 [МОДЕЛЬ] Теория говорит, что конфликт интересов реален

Экономические работы моделируют ровно этот конфликт: платформа заинтересована ускорять поиск, но не
улучшать качество совпадений; рекомендации, максимизирующие выручку, и рекомендации, максимизирующие
число удачных пар, расходятся.

- [«(Mis-)Matchmaker», job market paper, CERGE-EI](https://cz.cerge-ei.cz/pdf/events/papers/JMP_Mismatchmaker.pdf) **[МОДЕЛЬ]**
- [Gieselmann J., «Platform Investment Incentives: Dating and Fake Profiles», TSE](https://www.tse-fr.eu/sites/default/files/TSE/documents/conf/2021/doctoral_workshop/gieselmann.pdf) **[МОДЕЛЬ]**

🔴 Это **теория**, а не измерение реальных приложений. На лендинге такое годится как рассуждение, но не
как «исследования доказали».

### 6.4 ✅ ДОКАЗАНО: видимость там продаётся активностью — их собственными словами

Это, на мой взгляд, **лучшее доказательство Вашего тезиса во всём документе**, потому что оно исходит
не от критиков, а от самой компании:

> «We prioritize potential matches who are active, and active at the same time.» ·
> «The most important factor that can help our members improve their match potential on Tinder is . . .
> using the app.» · «Elo is old news at Tinder. It's an outdated measure and our cutting-edge technology
> no longer relies on it.» · «Today, we don't rely on Elo — we have a dynamic system that continuously
> factors in how members are engaging with others on Tinder through Likes, Nopes, and what's on members'
> profiles.»
> — Tinder, [«Powering Tinder® — The Method Behind Our Matching»](https://www.tinderpressroom.com/powering-tinder-r-the-method-behind-our-matching)
> (та же статья в справке: [help.tinder.com](https://www.help.tinder.com/hc/en-us/articles/7606685697037-Powering-Tinder-The-Method-Behind-Our-Matching)) **[ФАКТ — официальный текст компании]**

**Валюта видимости там — Ваше время в приложении.** Не сходство, не готовность к отношениям — присутствие.
Это официально, добровольно опубликовано и не оспаривается.

Наша противоположность проверяема: у нас видимость человека определяется его настройками видимости и
заполненностью NDim ID, а лента похожести пересчитывается сервером синхронизации по данным, а не по
времени в приложении.

### 6.5 ⚠️ Поправка к «они живут за счёт рекламы»

> «Indirect Revenue is revenue that is not received directly from end users of our services, a majority
> of which is advertising revenue.» При выручке III квартала 2025 года **914 млн $** прямая выручка
> составила **897 млн $** — то есть на всю непрямую (в основном рекламу) приходится порядка **2%**
> — [Match Group, отчёт за III кв. 2025](https://www.prnewswire.com/news-releases/match-group-announces-third-quarter-results-302604631.html) **[ФАКТ]**

🔴 **Следствие для текстов:** фраза «они зарабатывают на рекламе» про Match Group — **неправда**. Они
зарабатывают на подписках. Наше «у нас нет рекламы» остаётся правдой **о нас**, но перестаёт быть
контрастом **с ними**. Настоящий контраст — «у нас нет покупок», а не «у нас нет рекламы».

---

## §7. Данные, реклама и приватность: здесь контраст настоящий

### 7.1 [ЗАМЕР] Обзор Mozilla

> «Most dating apps (80%) share or sell your personal information and won't guarantee all users the
> right to delete their data.» · «22 popular online dating platforms» получили предупреждение
> *Privacy Not Included; «over 90%» проверенных приложений · «a privacy nosedive since their last review
> in 2021»
> — [Mozilla Foundation, 23.04.2024](https://www.mozillafoundation.org/en/blog/everything-but-your-mothers-maiden-name-mozilla-research-finds-majority-of-dating-apps-more-data-hungry-and-invasive-than-ever/) **[ЗАМЕР — экспертный аудит]**

Там же зафиксирован эпизод 2022 года: католическая группа получила данные пользователей Grindr, Scruff и
OkCupid через рекламную сеть и раскрыла личность священника.

### 7.2 [ФАКТ] Регулятор оштрафовал за это деньгами

> Норвежское управление по защите данных наложило штраф **65 млн крон (≈6,5 млн €)** на Grindr за
> передачу данных третьим лицам для поведенческой рекламы без законного основания. Передавались
> «GPS location, IP address, Advertising ID, age, gender and the fact that the user was on Grindr».
> Управление указало, что сам факт использования Grindr «strongly indicates they belong to a sexual
> minority» и относится к особой категории данных.
> — [Datatilsynet](https://www.datatilsynet.no/en/regulations-and-tools/regulations/avgjorelser-fra-datatilsynet/2021/gebyr-til-grindr/) ·
> [EDPB](https://www.edpb.europa.eu/news/national-news/2021/norwegian-dpa-imposes-fine-against-grindr-llc_en) ·
> [noyb](https://noyb.eu/en/ncc-noyb-gdpr-complaint-grindr-fined-eu-63-mio-over-illegal-data-sharing) **[ФАКТ]**
> Штраф устоял в норвежском суде — [PPC Land](https://ppc.land/norwegian-court-upholds-eu6-5m-grindr-fine-for-data-sharing-violations/)

🔴 **Второй эффект, который надо назвать вслух.** Если мы обещаем «мы не продаём Ваши данные», это
обещание становится юридически значимым заявлением, и его придётся держать **навсегда и без исключений**
— включая аналитику и любые сторонние скрипты на лендинге. См. §10.

⚠️ **И одна неприятная деталь, найденная в нашем собственном коде.** В опубликованной истории версий
(`src/lib/content/docs.ts`, «Версия 1.3 от 28.05.2025») стоит строка **«Добавлена аналитика рекламной
атрибуции»**. Речь о рекламе, *приводящей* людей к нам, а не о рекламе внутри — но лендинг с заголовком
«у нас нет рекламы» и наша же публичная история версий с этой строкой будут читаться как противоречие.
**Это надо либо снять, либо пояснить, до выхода лендинга.**

### 7.3 Регуляторный горизонт — в нашу пользу

Европейская комиссия готовит Digital Fairness Act против «dark patterns; addictive design of digital
products; unfair personalisation practices»; предложение ожидается в IV квартале 2026 года
— [Goodwin](https://www.goodwinlaw.com/en/insights/publications/2025/11/alerts-practices-antc-from-dark-patterns-to-fair-play) ·
[Европарламент, аналитическая записка](https://www.europarl.europa.eu/RegData/etudes/ATAG/2025/767191/EPRS_ATA(2025)767191_EN.pdf) **[ФАКТ — законопроект, не закон]**

⚠️ Число «7,9 млрд € ущерба от тёмных паттернов» гуляет и здесь. `researches/25` §14 уже забраковал его:
в первоисточнике это **общий** ущерб потребителей ЕС от онлайн-проблем, не привязанный к тёмным
паттернам. **Не использовать.**

---

## §8. Что работает вместо — и приговор науки нашему главному обещанию

Это самый важный раздел документа. Здесь наука отвечает на вопрос «а Ваш калькулятор вообще считает то,
что обещает».

### 8.1 🔴 Алгоритмы совместимости не имеют доказательств — это установлено 14 лет назад

> «there is little evidence that these algorithms can predict whether people are good matches or will
> have chemistry» · «browsing and comparing large numbers of profiles can lead individuals to commoditize
> potential partners and can reduce their willingness to commit» · «the superiority of these sites is not
> as evident»
> — Finkel E., Eastwick P., Karney B., Reis H., Sprecher S., «Online Dating: A Critical Analysis From
> the Perspective of Psychological Science», *Psychological Science in the Public Interest*, 2012 —
> [резюме APS](https://www.psychologicalscience.org/publications/journals/pspi/online-dating.html),
> [полный текст (PDF, Northwestern)](https://faculty.wcas.northwestern.edu/eli-finkel/documents/2012_FinkelEastwickKarneyReisSprecher_PSPI.pdf) **[ЗАМЕР — систематический обзор]**

Финкель в пересказе для прессы: «To date, there is no compelling evidence that any online dating matching
algorithm actually works»
— [ScienceDaily, 06.02.2012](https://www.sciencedaily.com/releases/2012/02/120206122632.htm)

### 8.2 🔴 И это проверили машинным обучением — результат тот же

> В двух исследованиях быстрых свиданий участники заполнили **более 100** самоотчётных шкал, затем
> встретились лицом к лицу на 4 минуты. «Random forests models predicted 4% to 18% of actor variance and
> 7% to 27% of partner variance; however, they were unable to predict relationship variance using any
> combination of traits and preferences reported before the dates, suggesting that compatibility elements
> of human mating are challenging to predict before two people meet.»
> — Joel S., Eastwick P., Finkel E., «Is Romantic Desire Predictable? Machine Learning Applied to Initial
> Romantic Attraction», *Psychological Science*, 2017 —
> [SAGE](https://journals.sagepub.com/doi/10.1177/0956797617714580),
> [PDF автора](http://pauleastwick.com/s/JoelEastwickFinkel2017PSci.pdf) **[ЗАМЕР — эксперимент]**

Перевод на человеческий: **можно предсказать, насколько человек в принципе влюбчив и насколько он в
принципе нравится другим. Нельзя предсказать, понравятся ли конкретные двое друг другу.** Именно это
последнее и продаёт вся отрасль — и именно этого мы обещать не можем.

### 8.3 🔴 И качество уже сложившихся отношений тоже не предсказывается по анкетам партнёра

> 11 196 пар, 2 413 показателей, 43 лонгитюдных исследования. «Actor-reported variables predicted two to
> four times more variance than partner-reported variables» · «Individual differences and partner reports
> showed no predictive effects beyond actor-reported relationship-specific variables alone» ·
> «Relationship-quality change proved largely unpredictable from self-report variables»
> — Joel S. и др., «Machine learning uncovers the most robust self-report predictors of relationship
> quality across 43 longitudinal couples studies», *PNAS*, 2020 —
> [PubMed](https://pubmed.ncbi.nlm.nih.gov/32719123/),
> [PNAS](https://www.pnas.org/doi/10.1073/pnas.1917036117) **[ЗАМЕР — мета-проект]**

То есть **черты партнёра почти ничего не добавляют** к предсказанию счастья в отношениях. Добавляет то,
что человек сам переживает внутри связи.

### 8.4 ✅ НО: сходство работает — ровно в той точке, где стоим мы

И вот оправдание всего замысла NDim, найденное там же, в науке:

> 460 размеров эффекта из 313 лабораторных и полевых исследований. «The associations between
> interpersonal attraction and both actual similarity (r = .47) and perceived similarity (r = .39) were
> significant and large.» · «Actual similarity was important in no-interaction and short-interaction
> studies, there was a significant reduction in the effect size of actual similarity beyond no-interaction
> studies, and the effect of actual similarity in existing relationships was not significant.»
> — Montoya R.M., Horton R.S., Kirchner J., «Is actual similarity necessary for attraction? A
> meta-analysis of actual and perceived similarity», *Journal of Social and Personal Relationships*,
> 25(6), 889–922 (2008) —
> [SAGE](https://journals.sagepub.com/doi/10.1177/0265407508096700) **[ЗАМЕР — мета-анализ]**

🔴 **Прочтите эти две строки вместе — в них весь честный NDim.**
**Фактическое сходство — сильный предиктор притяжения ДО взаимодействия (r = .47) и перестаёт работать
внутри уже сложившихся отношений.** NDim работает именно **до** знакомства: он решает, кого вообще стоит
встретить. Это ровно та зона, где сходство доказано.

**Значит правильное обещание звучит так:** мы точно считаем, **с кем у Вас общего больше всего** — и это
лучшая из известных науке отправных точек. Мы не считаем, что у Вас с этим человеком получится. Никто не
считает; проверено дважды машинным обучением.

### 8.5 Меньше выбора — больше удовлетворённости

> Онлайн-дейтеры, выбиравшие из **24** кандидатов, были менее довольны выбором, чем выбиравшие из **6**,
> и чаще меняли решение неделю спустя; хуже всех себя чувствовали те, у кого выбор был и большим, и
> обратимым
> — D'Angelo J., Toma C., «There Are Plenty of Fish in the Sea: The Effects of Choice Overload and
> Reversibility on Online Daters' Satisfaction With Selected Partners», *Media Psychology*, 20(1), 2017 —
> [Taylor & Francis](https://www.tandfonline.com/doi/abs/10.1080/15213269.2015.1121827) **[ЗАМЕР — эксперимент]**

**Это прямое научное оправдание короткого топа похожести вместо бесконечной ленты.** «Иллюзия огромного
выбора» из Вашего `GOAL.md` — не только этическая претензия, но и измеренный вред.

### 8.6 Что онлайн-знакомства всё-таки дают — и это надо признать

> Доля гетеросексуальных пар, познакомившихся онлайн, выросла с **22% (2009)** до **39% (2017)**; онлайн
> обогнал знакомство через друзей примерно в 2013 году
> — Rosenfeld M., Thomas R., Hausen S., «Disintermediating your friends: How online dating in the United
> States displaces other ways of meeting», *PNAS* 116(36), 2019 —
> [PNAS](https://www.pnas.org/doi/10.1073/pnas.1908630116),
> [PDF, Stanford](https://web.stanford.edu/~mrosenfe/Rosenfeld_et_al_Disintermediating_Friends.pdf) **[ЗАМЕР]**

⚠️ Честность требует это назвать: **онлайн-знакомства работают** — как канал доступа. Претензия к ним
не «они не сводят людей», а «они делают это дорого, утомительно и торгуя вниманием». Лендинг, который
объявит, что приложения знакомств не работают вовсе, будет опровергнут личным опытом каждого пятого
читателя.

### 8.7 🔴 [ЗАМЕРА НЕТ] «Медленные знакомства», «подбор по ценностям», «сообщества»

Я искал измеренные подтверждения, что медленные знакомства, подбор по ценностям или сообщества дают
лучший результат. **Не нашёл ни одного эксперимента.** Есть тренд-статьи, есть вендорские опросы, есть
теория. Замера нет. **На лендинге про «медленные знакомства работают лучше» писать нельзя.**

Ни одно приложение знакомств, насколько я нашёл, **не публикует проверяемую метрику успеха**. Даже
Hinge, чей бренд — «designed to be deleted», публичного аудируемого числа не даёт; в выдаче гуляют
взаимоисключающие «70%» и «10–20%» из блогов. 🔴 **Это одновременно и упрёк отрасли, и ловушка для нас:
если мы объявим свою метрику успеха, нам придётся её считать честно и публиковать.**

---

## §9. Как честные продукты говорят о себе, не обещая лишнего

### 9.1 Signal — эталон «без рекламы» без превосходных степеней

> «There are no ads, no affiliate marketers, and no creepy tracking in Signal.» ·
> «Signal is an independent nonprofit. We're not tied to any major tech companies, and we can never be
> acquired by one either.» · «Development is supported by grants and donations from people like you.»
> — [signal.org](https://signal.org/)

Приём, который стоит украсть: **они говорят, чего у них НЕТ, и сразу отвечают на вопрос «а на что вы
живёте»**. Без этого второго предложения первое вызывает подозрение — «бесплатно, значит я товар».
У нас ответ есть и он даже теплее: страница «Пожертвование» уже написана Вашим голосом и прямо говорит
«Пожертвование ни на что не влияет: все возможности Пространства одинаковы для всех»
(`src/routes/menu/donate/+page.svelte` — проверено чтением кода).

### 9.2 Alovoa — прямой прецедент в нашей же нише

> «100% free, no ads» · «This platform does not require you to pay any kind of fee, you are free to use
> all features without limitations.» · «We do not sell any of your information to anyone, that's a promise
> we will always keep.» · «Every line of code and every used library is free and open-source»
> — [alovoa.com](https://alovoa.com/?lang=en); список обещаний — [GitHub](https://github.com/Alovoa/alovoa)
> («no microtransactions», «no "pay super-likes", "pay to swipe", "pay to view profile" or "pay to start
> a chat"»)

🔴 **Вывод, который Вам, возможно, не понравится, но который лучше узнать сейчас.** Обещания «бесплатно,
без рекламы, без покупок, не продаём данные» — **уже заняты** и звучат почти дословно так же. Если
лендинг NDim построить на них, он будет неотличим от страницы, которая существует. **Уникально у нас
ровно одно: измерения, оценки и расчёт сходства.** Всё остальное — гигиена, а не отличие.

### 9.3 Что запрещает закон, если обещаем «бесплатно»

Руководство FTC о слове «free» (16 CFR Part 251) требует раскрывать все условия «clearly and
conspicuously at the outset of the offer»
— [FTC](https://www.ftc.gov/legal-library/browse/rules/guide-concerning-use-word-free-similar-representations),
[eCFR, 16 CFR 251](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-B/part-251) **[ФАКТ]**

Для нас это дёшево — у нас условий нет вовсе. Но есть одно, которое **придётся раскрыть рядом со словом
«бесплатно»**: Ваш ответ В5 — анонимные аккаунты старше семи дней удаляются. «Бесплатно и без потерь» и
«через 7 дней всё исчезнет» обязаны стоять на одном экране, а не на разных.

---

## §10. ⚠️ Что мы НЕ вправе обещать

Вы просили «уверенно обещаем закрыть». Моя работа — проследить, чтобы обещание осталось правдой. Ниже —
список того, что было бы враньём или тем, что мы не сможем удержать.

| Нельзя обещать | Почему |
|---|---|
| «Мы найдём Вам человека, с которым получатся отношения» | Joel и др. (2017): взаимная симпатия **не предсказывается** ни по каким анкетным чертам до встречи. Joel и др. (2020): черты партнёра почти не добавляют предсказания качества отношений. Это прямое противоречие науке |
| «Математически точный подбор партнёра» | Точен расчёт **сходства**. «Подбор партнёра» подразумевает предсказание исхода — см. строку выше. Формулировка «точность» допустима только рядом со словом «сходство» |
| «В отличие от них, мы правда хотим, чтобы Вы нашли» (как утверждение об их намерении) | Иск об «умышленно затягивающем» дизайне **ушёл в арбитраж без решения по существу** (§6.2). Утверждать чужой умысел как факт — юридический риск и неправда |
| «Они зарабатывают на рекламе» | У Match Group реклама ≈2% выручки (§6.5). Правда — «зарабатывают на покупках», и она не слабее |
| «Существующие приложения дают женщинам/мужчинам привилегированные функции» | Документированного примера я не нашёл (§5.3). Доказанная дискриминация была **по возрасту** |
| «У нас нет фейков и мошенников» | У нас нет ни верификации личности, ни модерации переписки. Мы можем обещать только **отсутствие выгоды** у фейка, а не его отсутствие |
| «Здесь Вы точно найдёте друзей» | Замера, что кто-либо (включая нас) закрывает дефицит дружбы, нет (§4.4). Обещать можно поиск похожих, а не социальный результат |
| «Навсегда бесплатно» | Прямой запрет `CLAUDE.md`/правил текста: слово «навсегда» в продукте не используется |
| «Медленные знакомства / подбор по ценностям работают лучше» | 🔴 Замера нет вовсе (§8.7) |
| «У нас нет рекламы» — без оговорки | Пока в нашей же опубликованной истории версий стоит «Добавлена аналитика рекламной атрибуции» (§7.2), это уязвимо. Сначала чиним документ, потом обещаем |
| Любые проценты успеха («X% находят пару») | Ни у кого в отрасли нет аудируемой метрики успеха, и у нас её тоже нет. Придумать её — стать тем, против кого мы выступаем |

🔴 **Отдельно — риск, которого нет ни в одном из Ваших вопросов.** Обещание «у нас всё иначе» создаёт
**ожидание результата**. Человек, который заполнил измерения и не нашёл никого (а в маленькой базе это
обычное дело), воспримет это как невыполненное обещание. Чем громче обещание на лендинге, тем больнее
пустой экран «Связей» на второй день. **Обещание и наполненность базы — сообщающиеся сосуды**, и это
надо решать текстом честного ожидания, а не тише обещать.

---

## §11. Обещания-кандидаты для лендинга

Черновики — **сырьё**, а не текст. Бренд сочиняете Вы; здесь показано, какая строка чем подкреплена и
что за ней реально стоит в продукте.

| Боль (источник) | Что NDim реально с этим делает | Черновик строки |
|---|---|---|
| Разочарование сильнее надежды: 45% против 28% (Pew 2020) | Короткий топ похожести вместо бесконечной ленты; нет механики удержания | «Не бесконечный поток лиц, а короткий список тех, с кем у Вас правда много общего» |
| Видимость покупается активностью — «The most important factor… is using the app» (Tinder, официально) | Похожесть считается по данным, не по времени в приложении; сервер пересчитывает без Вашего присутствия | «Вас находят по тому, кто Вы, а не по тому, сколько часов Вы здесь провели» |
| Обман в подписках и отмене: FTC, 14 млн $, август 2025 | Ни подписок, ни покупок, ни платных функций; пожертвование ни на что не влияет (проверено по коду) | «Здесь нечего купить. Всё, что есть, — у всех одинаковое» |
| 80% приложений делятся/продают данные ради рекламы (Mozilla 2024); штраф Grindr 6,5 млн € | Нет рекламы в продукте; управление видимостью каждого поля профиля отдельно | «Ваши данные не товар: рекламы нет, продавать некому» |
| Женщина тонет во внимании, мужчина его не получает (Pew 2023: ~1 из 5 женщин часто перегружена, столько же мужчин часто не получают сообщений) | Пол есть в профиле, но **не участвует в расчёте похожести** (проверено чтением `similarity.ts`, `schema.ts`) | «Математике всё равно, какого Вы пола: она считает, что у вас общего» |
| Выбор из 24 хуже, чем из 6 (D'Angelo & Toma 2017) | Топ похожести ограничен; нет ленты «ещё, ещё, ещё» | «Лучше десять точных, чем тысяча случайных» |
| Одиночество 24% в мире, пик у 19–29 лет (Gallup/Meta 2023); 12% американцев без единого близкого друга (AEI 2021) | Сходство не спрашивает, что Вы ищете, — пара, друг, собеседник | «Тут ищут не только пару. Общее — оно и для дружбы общее» |
| Алгоритмы совместимости не имеют доказательств (Finkel 2012), но фактическое сходство работает **до** знакомства, r = .47 (Montoya 2008) | Считаем сходство, а не предсказываем отношения | «Мы не обещаем предсказать любовь — этого не умеет никто. Мы точно считаем, с кем у Вас больше всего общего. Дальше — Ваше» |
| «Мы КАЛЬКУЛЯТОР» (Ваши слова В6) | Прозрачные величины: близость, общность, похожесть — считаются по общим измерениям | «Калькулятор, а не казино: одна формула, одинаковая для всех, и её видно» |
| Ваш собственный текст из руководства, уже опубликованный | — | «Оно одинаково непредвзято по отношению ко всем своим пользователям, невзирая на их пол, расу, цвет кожи, вероисповедание, мировоззрение, убеждения» |

⚠️ **Про строку «Здесь нечего купить»** — это самая сильная строка списка, потому что она проверяема за
десять секунд и её невозможно повторить конкуренту, не сломав его бизнес. Но она же требует, чтобы
страница «Пожертвование» была видна и объясняла, на что живёт проект (приём Signal, §9.1). Иначе
«бесплатно» читается как «вы — товар».

---

## §12. Числа, которыми пользоваться нельзя (пополнение к `researches/25` §14)

| Число | Что с ним не так |
|---|---|
| «78% испытали выгорание от приложений» (Forbes Health) | Медиа-опрос без публичной методики; кочует как научный факт |
| «80% Gen Z выгорели» (Hily) | Опрос приложения знакомств о приложениях знакомств |
| «Tinder 67% мужчин / 33% женщин», «Hinge 60/40» | SEO-блоги (swipestats, datingnews) без первоисточника. Единственная проверяемая цифра — 24,9% и 20,4% женщин в чешском приложении (PLOS ONE 2025), и она **не обобщается** |
| «70% пользователей Hinge находят связь» / «10–20%» | Взаимоисключающие цифры из блогов; аудируемой метрики успеха не публикует никто |
| «7,9 млрд € ущерба от тёмных паттернов» | Уже забраковано в `researches/25` §14: это общий ущерб от онлайн-проблем |
| «Одиночество = 15 сигарет в день», «+29% риск смерти» | Числа из advisory главного врача США; первоисточник у меня 403, **в первоисточнике не прочитаны**. До сверки — не использовать |
| «52% пользователей встречали мошенника» | В первоисточнике Pew я нашёл другую формулировку — «50% считают, что фейковые аккаунты для мошенничества очень распространены». Это про **мнение**, а не про личный опыт. Разница существенная |
| «1,16 млрд $ потерь от романтических мошенников за 2025» | Само число из данных FTC, но у меня оно пришло вторичным пересказом. **Требует сверки по странице FTC перед публикацией** |

---

## §13. Что осталось за владельцем

1. **Обещание про «точность»: как формулируем?** Наука разрешает «точно считаем сходство» и запрещает
   «точно подбираем партнёра» (§8). Метафора «калькулятор» выживает только в первом смысле. Какую
   формулировку Вы утверждаете?
2. **Строку про «перекос привилегированными функциями» убираем или заменяем?** Подтвердить её я не смог
   (§5.3). Предлагаю заменить утверждением о себе — Вашей же цитатой из руководства. Согласны?
3. **FAQ и отзывы (Ваш ответ В11).** Отзывы обязаны быть настоящими. У нас 331 человек из 1.x. Готовы ли
   Вы просить у них разрешение на публикацию отзыва? 🔴 Выдуманные отзывы — прямое нарушение правил FTC
   о рекламе и противоречие `GOAL.md`; агент их писать не будет.
4. **Что мы отвечаем человеку, который заполнил измерения и не нашёл никого?** Это второй эффект громкого
   обещания (§10). Нужен Ваш текст честного ожидания.
5. **Строку «Добавлена аналитика рекламной атрибуции» в истории версий** (§7.2) — оставляем, поясняем или
   снимаем?
6. **Обещаем ли мы «дружбу»?** Продукт не спрашивает, что человек ищет. Хотите ли Вы вводить такую рамку
   — или обещание звучит как «здесь ищут не только пару»?
7. **Публикуем ли мы свою метрику успеха?** Никто в отрасли этого не делает (§8.7). Это могло бы стать
   сильнейшим отличием — и обязательством считать честно.

---

## §14. Главные источники

**Независимые замеры**
- Pew Research Center, [«From Looking for Love to Swiping the Field» (2023)](https://www.pewresearch.org/internet/2023/02/02/from-looking-for-love-to-swiping-the-field-online-dating-in-the-u-s/) ·
  [«The experiences of U.S. online daters» (2023)](https://www.pewresearch.org/internet/2023/02/02/the-experiences-of-u-s-online-daters/) ·
  [«Users of online dating platforms…» (2020)](https://www.pewresearch.org/internet/2020/02/06/users-of-online-dating-platforms-experience-both-positive-and-negative-aspects-of-courtship-on-the-web/)
- Gallup/Meta, [«Almost a Quarter of the World Feels Lonely» (2023)](https://news.gallup.com/opinion/gallup/512618/almost-quarter-world-feels-lonely.aspx)
- Survey Center on American Life / AEI, [«The State of American Friendship» (2021)](https://www.americansurveycenter.org/research/the-state-of-american-friendship-change-challenges-and-loss/)
- Mozilla Foundation, [обзор приватности приложений знакомств (2024)](https://www.mozillafoundation.org/en/blog/everything-but-your-mothers-maiden-name-mozilla-research-finds-majority-of-dating-apps-more-data-hungry-and-invasive-than-ever/)

**Наука о совместимости**
- Finkel и др., [PSPI (2012)](https://www.psychologicalscience.org/publications/journals/pspi/online-dating.html)
- Joel, Eastwick, Finkel, [Psychological Science (2017)](https://journals.sagepub.com/doi/10.1177/0956797617714580)
- Joel и др., [PNAS (2020)](https://pubmed.ncbi.nlm.nih.gov/32719123/)
- Montoya, Horton, Kirchner, [JSPR (2008)](https://journals.sagepub.com/doi/10.1177/0265407508096700)
- D'Angelo, Toma, [Media Psychology (2017)](https://www.tandfonline.com/doi/abs/10.1080/15213269.2015.1121827)
- Rosenfeld, Thomas, Hausen, [PNAS (2019)](https://www.pnas.org/doi/10.1073/pnas.1908630116)
- Topinkova, Diviak, [PLOS ONE (2025)](https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0327477)

**Регуляторы и суды**
- FTC v. Match Group — [дело 172-3013](https://www.ftc.gov/legal-library/browse/cases-proceedings/172-3013-match-group-inc), мировое соглашение 08.2025
- [Candelore v. Tinder, Inc. (Cal. Ct. App. 2018)](https://law.justia.com/cases/california/court-of-appeal/2018/b270172.html)
- [Datatilsynet — штраф Grindr](https://www.datatilsynet.no/en/regulations-and-tools/regulations/avgjorelser-fra-datatilsynet/2021/gebyr-til-grindr/)
- [FTC, Guide Concerning Use of the Word «Free»](https://www.ftc.gov/legal-library/browse/rules/guide-concerning-use-word-free-similar-representations)

**Официальные тексты компаний**
- Tinder, [«Powering Tinder® — The Method Behind Our Matching»](https://www.tinderpressroom.com/powering-tinder-r-the-method-behind-our-matching)
- [Match Group, отчёт за III кв. 2025](https://www.prnewswire.com/news-releases/match-group-announces-third-quarter-results-302604631.html)
- [Signal](https://signal.org/) · [Alovoa](https://alovoa.com/?lang=en)

**Наши документы**
`interviews/interview_009_frictionless_entry.md` (В6 — заказ) · `researches/25` (онбординг, §14 —
запрещённые числа) · `researches/26` (SEO) · `researches/05` (тексты 1.x) · `ideas/09` (Ваша боль) ·
`GOAL.md` · код: `src/lib/similarity/similarity.ts`, `src/lib/model/schema.ts`,
`src/lib/content/docs.ts`, `src/routes/menu/donate/+page.svelte`
