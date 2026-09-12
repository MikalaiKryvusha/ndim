# Разведка 69 — Ссылка входа из письма, открытая в другом браузере: как это решают первоисточник, библиотеки авторизации и топы

<!-- ВЕРА-НАЧАЛО -->
> # **ВЕРИТЬ В ПРОДУКТ И В ИДЕЮ НИКОЛАЯ, БЫТЬ ОПТИМИСТОМ И ВЕРИТЬ В УСПЕХ, ИБО ОН НЕИЗБЕЖЕН, ИБО МЫ СТАРАЕМСЯ, А КТО СТАРАЕТСЯ — ТОТ ПРИДЁТ К УСПЕХУ. С ЭНТУЗИАЗМОМ, ЛЮБОВЬЮ И НАДЕЖДОЙ ДЕЛАТЬ ТО, ЧТО МЫ ДЕЛАЕМ.**
>
> Слово владельца 2026-08-16.
<!-- ВЕРА-КОНЕЦ -->

> **Создан:** 2026-09-12 23:55 +03:00 · **Родитель:** `bugs/233` (находка владельца в бою) ·
> интервью №082 В4 · **Статус:** ✅ разведка исполнена; дальше — четыре макета экрана и страница
> вопросов · **Исходящее:** решения владельца по форме экрана и по двум развилкам поведения.

## Зачем, одной строкой

Человек начал вход в одном браузере, а письмо открыл в другом. Владелец поставил цель — «*кросс
браузерный логин работал и был индемпотентен*». Разведка отвечает, **что на этом месте должен
делать продукт** и **какие слова стоят на этом экране у тех, кто решил задачу до нас**.

Все цитаты сняты 2026-09-12 `curl`-ом с живых страниц и исходников; адрес стоит у каждой.

---

## 1. Первоисточник: Firebase Authentication

Адрес: <https://firebase.google.com/docs/auth/web/email-link-auth>

**1.1. Почта обязательна, и это защита, а не каприз.** Раздел «Security concerns», дословно:

> «*To prevent a sign-in link from being used to sign in as an unintended user or on an unintended
> device, Firebase Auth requires the user's email address to be provided when completing the
> sign-in flow. For sign-in to succeed, this email address must match the address to which the
> sign-in link was originally sent.*»

> «*Do not pass the user’s email in the redirect URL parameters and re-use it as this may enable
> session injections.*»

**1.2. На другом устройстве почту СПРАШИВАЮТ.** Образец кода той же страницы:

> «*User opened the link on a different device. To prevent session fixation attacks, ask the user
> to provide the associated email again.*» — и следом `window.prompt('Please provide your email
> for confirmation')`.

**1.3. Привязка к уже существующему пользователю — другой случай, и для него правило обратное.**
Та же страница, после примеров `linkWithCredential` и повторной проверки личности:

> «*However, as the flow could end up on a different device where the original user was not logged
> in, this flow might not be completed. In that case, an error can be shown to the user to force
> them to open the link on the same device. Some state can be passed in the link to provide
> information on the type of operation and the user uid.*»

🔑 **У нас это ровно гость, сохраняющий результаты.** Его оценки живут в анонимной сессии ТОГО
браузера, где он оценивал; в другом браузере привязывать почту не к кому. Firebase велит сказать
человеку открыть ссылку там, где он начинал, и разрешает положить в ссылку **тип операции** — это
не почта и не личность, подделка такого признака не даёт ничьей сессии.

---

## 2. FirebaseUI — интерфейс, который Google сделал для этого же стека

Исходники v6.1.0: <https://github.com/firebase/firebaseui-web/tree/v6.1.0>

**2.1. Порядок действий на возврате по ссылке** (`javascript/widgets/handler/emaillinksignincallback.js`):

1. В ссылке едут служебные признаки `ui_sid` (сессия), `ui_sd` (только то же устройство),
   `ui_auid` (анонимный пользователь, которого надо поднять), `ui_pid` (провайдер) —
   `javascript/utils/actioncodeurlbuilder.js`, строки 207–213. **Почты в ссылке нет.** Сама почта
   лежит в хранилище браузера ЗАШИФРОВАННОЙ, ключ — идентификатор сессии из ссылки
   (`javascript/utils/storage.js`, `getEmailForSignIn`).
2. Если ссылка поднимает анонима (`ui_auid`), а браузер новый — страница **«новое устройство»**, без
   попытки войти.
3. Иначе **сначала проверяется сама ссылка** — `checkActionCode(oobCode)`. Мёртвая ссылка получает
   честный отказ сразу, и человек не набирает почту впустую.
4. Ссылка жива, почта известна — вход.
5. Ссылка жива, почты нет — **страница подтверждения почты**.
6. Аноним в этом браузере не тот, для которого выписана ссылка, — страница **«сеанс завершён»**.

**2.2. Тексты — дословно** (`soy/pages.soy`; русские — `translations/ru.xtb` и собранный `ru`):

| Страница | EN | RU (перевод Google) |
|---|---|---|
| Подтверждение почты — заголовок | «*Confirm email*» | «*Подтвердите адрес электронной почты*» |
| Подтверждение почты — текст | «*Confirm your email to complete sign in*» | «*Подтверждение адреса электронной почты перед входом в аккаунт*» |
| Новое устройство — заголовок | «*New device or browser detected*» | «*Зарегистрирован вход с нового устройства или браузера*» |
| Новое устройство — текст | «*Try opening the link using the same device or browser where you started the sign-in process.*» | «*Попробуйте открыть ссылку в браузере или на устройстве, которые вы использовали, чтобы начать процесс входа*» |
| Сеанс завершён — заголовок и текст | «*Session ended*» · «*The session associated with this sign-in request has either expired or was cleared.*» | «*Сеанс завершен*» · «*Время сеанса, связанного с этим запросом входа, истекло, или сеанс был завершен.*» |
| Почта не совпала | «*The email provided does not match the current sign-in session.*» (`soy/strings.soy`) | — |
| Идёт вход | «*Signing in...*» | «*Выполняется вход…*» |

**2.3. Смежный приём — «другой аккаунт».** Страница `emailMismatch` (`soy/pages.soy`, строка 1253)
для входа через провайдера: «*Continue with {$userEmail}?*» · «*You originally wanted to sign in
with {$pendingEmail}*». То есть Google на расхождении аккаунтов **спрашивает**, и спрашивает,
называя оба адреса.

---

## 3. Библиотеки авторизации — три противоположных решения

### 3.1. Clerk — вход завершается в ИСХОДНОЙ вкладке

Строки: <https://github.com/clerk/javascript/blob/main/packages/localizations/src/en-US.ts>

По умолчанию ссылка на другом устройстве лишь подтверждает вход, а продолжает его вкладка, где
вход начали: «*Signed in on other tab*» · «*Return to original tab to continue*» · «*You may close
this tab*».

Опция защиты — только то же устройство и браузер
(<https://clerk.com/docs/guides/secure/best-practices/protect-email-links>). Её довод дословно:
злоумышленник знает почту человека и просит ссылку, человек (или почтовый сканер) её открывает —
«*The malicious actor is able to gain access to the user's account because the email link has
been opened successfully.*» Цена названа там же: без защиты люди «*will be able to sign-in or
sign-up with email link across devices and browsers*». Экран при включённой защите: «*Verification
link is invalid for this device*» · «*To continue, open the verification link on the device and
browser from which you initiated the sign-in*».

⚠️ **Этот довод к Firebase не переносится.** У Clerk сессия рождается в исходной вкладке — ей и
опасна чужая ссылка. У Firebase сессия рождается ТАМ, ГДЕ ССЫЛКУ ОТКРЫЛИ, и опасность обратная
(§1.1): подсунуть человеку ссылку на чужой аккаунт. От неё и защищает вопрос о почте.

Про уже вошедшего человека (<https://github.com/clerk/javascript/blob/main/packages/shared/src/internal/clerk-js/warnings.ts>):
в режиме одной сессии экран входа не рисуется вовсе — «*Since a user is signed in and this
application only allows a single session, Clerk is redirecting to the `afterSignIn` URL instead.*»
То есть по умолчанию вошедший **остаётся собой молча**; несколько аккаунтов в одном браузере —
отдельный режим «*Multi-session*».

### 3.2. Okta — только тот же браузер, на чужом показывается код

<https://developer.okta.com/docs/guides/email-magic-links-overview/main/>:

> «*If either their browser or device is different, Okta disables the magic link. They must either
> return to the original browser to use the magic link or use the OTP instead.*»

Страница на чужом браузере (`okta-signin-widget`, `login.properties`): «*Your verification code*» ·
«*Enter this code on the sign-in page.*» · «*Request from:*» · «*If you didn’t request this code,
you can ignore this message. Your account is safe and can only be accessed with this code.*»

### 3.3. Auth0 и Supabase — только тот же браузер, иначе отказ

Auth0 (<https://auth0.com/docs/authenticate/passwordless/authentication-methods/email-magic-link>):

> «*When using Magic Links with Classic Login, both the initial request and its response must take
> place in the same browser or the transaction will fail. This is particularly relevant for iOS
> users, who cannot change their default web browser. For example, the user might make the initial
> request using the Chrome browser, but when the user opens the Magic Link in their email, iOS
> automatically opens it in Safari (the default browser). If this happens, the transaction will
> fail.*»

Supabase (<https://supabase.com/docs/guides/auth/sessions/pkce-flow>):

> «*The code verifier is created and stored locally when the Auth flow is first initiated. That
> means the code exchange must be initiated on the same browser and device where the flow was
> started.*»

🔑 **Auth0 сам называет, кого это бьёт:** телефон, где почтовое приложение открывает ссылку не в
том браузере, где начинали. Это не редкий случай, а обычный путь человека с телефона.

---

## 4. Топливо: что из этого вообще годится нам

- **Вход у нас — Firebase Auth в браузере, сервер синхронизации без входящих портов.** Приёмы,
  которым нужен свой серверный ответ (код Okta, опрос исходной вкладкой у Clerk), держатся на
  сервере авторизации, которого у нас нет и который мы не заводим. Не переносится.
- **Приток органический и с телефонов** (здоровый разрез `device` Search Console, 01.07–11.09:
  мобилка 25 кликов из 40 — `MASTER_PLAN.md`, ревизия 2026-09-12; числа устройств в
  `researches/67` сняты с негодного разреза и здесь не цитируются, `bugs/232_DONE`).
  Правило «только тот же браузер» ломает ровно этот путь (§3.3). Не переносится.
- **Firebase и FirebaseUI — наш собственный стек.** Их приём переносится целиком и без переделки:
  `completeLoginLink` уже принимает почту вторым доводом (`src/lib/data/account.ts`).

---

## 5. Лучшие решения — берём, с донором и доводом

1. **Нет почты в этом браузере — спросить её одним полем** (донор: Firebase §1.2, FirebaseUI §2.1
   п.5). Довод: единственный приём, который одновременно пускает человека в любом браузере и не
   даёт впустить его в чужой аккаунт.
2. **Сначала проверить ссылку, потом спрашивать почту** (донор: FirebaseUI §2.1 п.3,
   `checkActionCode`). Довод: человек с мёртвой ссылкой не набирает почту впустую и сразу получает
   правду — «запросите новую».
3. **Гость, сохраняющий результаты, получает свой отдельный исход** (донор: Firebase §1.3,
   FirebaseUI §2.1 п.2). Довод: его оценки живут только в том браузере; войти в другом значит
   молча оставить их позади. В ссылку кладётся **тип операции** — Firebase это разрешает прямо, и
   это не почта.
4. **Состояние в ссылке — да, почта в ссылке — нет** (донор: FirebaseUI §2.1 п.1). Довод: так
   исполнена цель владельца «ссылка самодостаточна» без той дыры, от которой предостерегает
   Firebase.
5. **На расхождении аккаунтов называть оба** (донор: FirebaseUI `emailMismatch` §2.3). Довод:
   человек видит, в каком аккаунте он сейчас и куда ведёт ссылка, и решает сам.

## 6. Худшие решения — НЕ берём, с причиной поимённо

1. **Auth0 Classic, Supabase PKCE, защита Clerk, Okta: «только тот же браузер».** Отказывает
   человеку с телефона, чьё почтовое приложение открывает ссылку в другом браузере (Auth0 сам
   приводит пример с iPhone). Прямо противоречит слову владельца «*кросс браузерный логин
   работал*».
2. **Почта в адресе ссылки** (гипотеза из №082 В4, буквально). Firebase запрещает: «*may enable
   session injections*». Плюс адрес ложится в историю браузера и в логи.
3. **`window.prompt` из образца Firebase.** Системное окно браузера вместо экрана продукта — не
   уровень бренда (`GOAL.md` → «ПЛАНКА БРЕНДА»).
4. **Тексты FirebaseUI по-русски:** «*Зарегистрирован вход с нового устройства или браузера*»,
   «*Время сеанса, связанного с этим запросом входа, истекло, или сеанс был завершен*». Язык
   системы о себе вместо следующего шага человека; первый звучит как тревога безопасности.
5. **Английское «*The email provided does not match the current sign-in session*».** Термин
   «sign-in session» человеку ничего не говорит; не сказано, что делать дальше.
6. **Наше собственное «Ссылка больше не действует» при живой ссылке** (`bugs/233`, снято
   2026-09-12 18:04). Ложный диагноз — худшее, что может сказать дверь входа.
7. **Молча оставить вошедшего человека, открывшего чужую ссылку** (режим одной сессии Clerk §3.1 —
   и наш нынешний промежуточный исход). Человек нажал ссылку, и не произошло ничего видимого.
   Годится как основа, но не молча — это предмет развилки владельца.

## 7. «Но ещё лучше» — где NDim может обойти доноров

1. **Уже вошедший тем же аккаунтом не видит ни поля, ни вопроса** — ссылка молча подтверждает,
   что он внутри. Вылечено и доказано 2026-09-12 (`bugs/233`, кадры «до/после»). У FirebaseUI этого
   исхода нет: его страница спросит почту и у того, кто уже вошёл.
2. **Поле почты — внутри той же утверждённой двери входа «Колонна»**, а не отдельной карточкой
   чужого вида: человек узнаёт экран, с которого начинал.
3. **Текст называет следующий шаг человека, а не состояние системы** — прямая противоположность
   худшим решениям 4 и 5.
4. **Гость узнаёт, где остались его оценки, до того как их потерять**, — у FirebaseUI на этом месте
   только «попробуйте открыть в другом браузере» и кнопка «Закрыть».

## 8. Что источником НЕ подтверждено — названо, чтобы не стало каноном молча

- **Экраны потребительских топов** (Medium, Slack, Notion, Linear и др.) на этом шаге в этом
  проходе **не сняты**: без их аккаунтов живой экран не открыть, а пересказ по памяти запрещён.
- **Синхронизация входа между вкладками одного браузера у Firebase** (исходная вкладка «Письмо
  отправлено» сама узнаёт о входе в соседней) — гипотеза, проверяется прогоном на стенде, в
  утверждения макетов не входит.
- **Какую долю людей бьёт случай «другой браузер»** — не мерено. Воронка PostHog событий такого
  исхода не пишет.

## 9. Что отсюда следует для макетов

- Экран вопроса о почте — **новое состояние двери «Колонна»** (`src/lib/ui/SigninScreen.svelte`);
  четыре варианта различаются МЕХАНИЗМОМ (что человек видит первым и какие дороги у него есть).
- **Отдельными вопросами, а не внутри макета:** гость, сохраняющий результаты, открыл письмо в
  другом браузере (§1.3); ссылка для одного аккаунта, а в браузере вошёл другой (§3.1, §2.3).
- Строка шага «Письмо отправлено» — «*Откройте письмо на этом устройстве…*» — существует как обход
  этого же дефекта; после лечения меняется и идёт на вычитку вместе с экраном.
