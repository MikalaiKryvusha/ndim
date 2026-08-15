<p align="center">
  <a href="https://ndimspace.app"><img src="static/favicon.svg" alt="NDim Space" width="120"></a>
</p>

# Пространство NDim — честный поиск похожих людей

<p align="center">
  <a href="#russian"><img src="https://img.shields.io/badge/Русский-C0392B?style=for-the-badge" alt="Русский"></a>
  &nbsp;
  <a href="#english"><img src="https://img.shields.io/badge/English-2C7BE5?style=for-the-badge" alt="English"></a>
</p>

[![Live](https://img.shields.io/badge/Сервис-ndimspace.app-1467D6.svg)](https://ndimspace.app)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](LICENSE)
[![Framework](https://img.shields.io/badge/Framework-KAIF%202.2-7F52FF.svg)](https://github.com/MikalaiKryvusha/KAIF)
[![Stack](https://img.shields.io/badge/Stack-SvelteKit%20%2B%20TypeScript-FF3E00.svg)](#7-самостоятельный-запуск-и-разработка)
[![Tests](https://img.shields.io/badge/Tests-404%20green-00C853.svg)](#7-самостоятельный-запуск-и-разработка)

---

<a id="russian"></a>

## Русский

[Read in English →](#english)

**Пространство NDim** — веб-сервис поиска похожих людей. Сервис определяет похожесть двух людей
математически — по их собственным оценкам в общих для двоих измерениях — и периодически составляет
для каждого человека список наиболее похожих на него людей.

Сервис доступен по адресу **[ndimspace.app](https://ndimspace.app)**. Установка не требуется;
возможна установка на телефон как приложения по правилам раздела 2.4.

Настоящий документ является руководством пользователя и справкой для разработчика.

---

## 1. Назначение

### 1.1. Основные положения

1. Исходным материалом являются самооценки человека по **измерениям** — осям человеческих качеств
   («люблю тишину», «рано встаю», «читаю на ночь»). Измерение общее для всех: оценивая себя, люди
   пользуются одной и той же осью. Предложить новое измерение может каждый.
2. Человек, оценивший себя хотя бы по одному измерению, становится **точкой в собственном
   подпространстве измерений**.
3. Результатом работы сервиса являются **Связи** — список из не более чем 250 наиболее похожих
   людей, составляемый для каждого человека в отдельности по правилам раздела 3.
4. Похожесть является приватной величиной: значение похожести видит только владелец списка.
5. Успехом использования сервиса считается ситуация, при которой человек нашёл человека и покинул
   сервис. Механики удержания внимания в сервисе не применяются.

### 1.2. Границы применения

1. Подписка, платные функции и реклама в сервисе отсутствуют и не планируются.
2. Лента активности, счётчики просмотров и прочие механики вовлечения не применяются.
3. Продажа или передача данных пользователей кому-либо не выполняется ни при каких условиях.
4. Личные сообщения между людьми в текущей версии не предусмотрены (раздел 8).

## 2. Начало работы

### 2.1. Основные положения

1. Знакомство с сервисом возможно без создания аккаунта: на главной странице размещено действующее
   демо расчёта похожести на вымышленных персонажах.
2. Полноценная работа возможна в двух состояниях: **гость** и **аккаунт**. Гостевой режим
   предназначен для пробы сервиса, аккаунт — для постоянного использования.
3. Пароль в сервисе не применяется. Вход выполняется через аккаунт Google либо по одноразовой
   ссылке, отправляемой на почту.

### 2.2. Гостевой режим

1. Гость создаётся одним нажатием, без ввода каких-либо данных.
2. Гость невидим другим людям: гость не появляется ни в чьих Связях и не может опубликовать о себе
   ничего. При этом гость получает собственный список Связей на общих основаниях.
3. Труд гостя сохраняется при создании аккаунта: оценки, поставленные гостем, переходят в аккаунт.
4. Данные гостя, не заходившего в сервис 30 дней, удаляются.

### 2.3. Аккаунт

1. Аккаунт создаётся из гостевого режима кнопкой «Сохранить мои результаты» либо входом через
   Google. Для входа в уже существующий аккаунт предназначена отдельная кнопка «У меня уже есть
   аккаунт».
2. Вход по почтовой ссылке заодно подтверждает почту. Подтверждённая почта является условием
   просмотра других людей.

### 2.4. Установка на телефон

1. Сервис устанавливается на телефон как приложение средствами браузера («Добавить на главный
   экран» / «Установить приложение»).
2. После установки сервис открывается с собственным значком и без адресной строки браузера.

## 3. Устройство Пространства

### 3.1. Основные положения

1. **Пространство** состоит из измерений и точек-людей. Каждый человек присутствует в Пространстве
   ровно одной точкой.
2. Профиль измерений человека называется **NDim ID**.
3. В Пространстве более пяти тысяч измерений. Полный каталог доступен на экране «Измерения», а
   с 2026-08-03 у каждого измерения есть и собственная открытая страница — на русском и английском
   (например, `ndimspace.app/ru/dimension/…`). Оценки на ней показываются по тому же правилу, что и
   внутри: нет голосов — нет звёзд.

### 3.2. Измерения

1. **Предложить** новое измерение может каждый: форма размещена на экране «Измерения», предложение
   рассматривается автором сервиса. В само Пространство измерение добавляется после рассмотрения.
2. Измерение является общим для всех: оценивая себя по измерению, человек использует ту же ось,
   что и остальные.

### 3.3. Оценки

1. Оценка выставляется звёздами от 0 до 10 и выражает положение человека на оси измерения.
2. Выставленная оценка сохраняется автоматически по завершении отсчёта; сохранение доступно и
   немедленно, кнопкой «Сохранить сейчас». Несохранённый выбор снимается повторным нажатием на ту
   же звезду.
3. Сохранённая оценка удаляется действием «Убрать мою оценку» в меню карточки измерения.
4. Оценки по измерениям не видит никто, кроме их владельца (раздел 5.1).

### 3.4. Похожесть

1. Похожесть двух людей вычисляется только по **общим** измерениям — тем, которые оценили оба:

   ```
   близость   = 1 − (расстояние между точками / диаметр общего пространства) ^ 0.7
   общность   = 2 · |общие измерения| / (|мои| + |его|)
   ПОХОЖЕСТЬ  = близость × общность
   ```

2. Согласно этой формуле, совпадения по одному случайному измерению недостаточно: общность
   наказывает узкое пересечение. Ноль в любом из двух множителей обнуляет похожесть — компромиссные
   «средние» не применяются.
3. При отсутствии общих измерений похожесть не определяется, и связь между людьми не создаётся.

### 3.5. Связи

1. Список Связей содержит не более 250 наиболее похожих людей, в порядке убывания похожести.
2. Для каждой связи отображаются три величины: похожесть, близость и общность.
3. Раскрытие связи показывает досье знакомства: свойства человека в границах его собственных
   настроек видимости (раздел 5.2) и параметры пространств обоих людей.

## 4. Экраны

### 4.1. Основные положения

1. Сервис состоит из пяти экранов: «Профиль», «Связи», «Пространство», «Измерения», «Меню».
2. Интерфейс существует в светлой и тёмной темах и на двух языках — русском и английском.
   Переключатели размещены на экране «Меню» и в шапке.
3. На экранах от 1024 пикселей ширины навигация размещается рельсом слева; на телефоне — панелью
   снизу.

### 4.2. «Профиль»

Экран владельца: NDim ID со статистикой, свойства профиля с настройкой видимости каждого свойства
в отдельности и окно **«Как меня видят»** — предпросмотр собственного профиля глазами других людей.

### 4.3. «Связи»

Список Связей по правилам раздела 3.5.

### 4.4. «Пространство»

Приборная панель Пространства: счётчики людей, измерений и оценок с трендами за неделю, события
суток, распределение похожести и состояние сервера синхронизации (раздел 6).

### 4.5. «Измерения»

Каталог измерений: лента для оценивания, вкладка «Мой NDim ID» с собственными оценками, поиск по
всему Пространству и форма предложения нового измерения.

### 4.6. «Меню»

Руководство пользователя, документы сервиса, переключатели темы и языка, обновление данных и выход.

## 5. Приватность и видимость

### 5.1. Оценки

Оценки по измерениям не видит никто, кроме их владельца: ни другие люди, ни друзья, ни
администратор. Оценки читает только сервер синхронизации — для расчёта похожести. Другим людям
доступен только итог — похожесть, без того, из чего она сложилась.

### 5.2. Видимость свойств профиля

1. Видимость настраивается по каждому свойству профиля в отдельности: **всем**, **друзьям**,
   выбранным **кругам** владельца либо **никому**.
2. Умолчанием видимости является «скрыть»: свойство без явной настройки не видит никто.

### 5.3. Круги и дружба

1. **Круг** — приватный список людей, который владелец составляет для управления видимостью.
   Люди не видят ни названия круга, ни его состава, ни факта своего попадания в круг. Владельцу
   доступно до 10 собственных кругов.
2. **Дружба** заключается только по взаимному согласию: запрос отправляет один, принять его может
   только адресат.

### 5.4. Счётчики без слежки

Сервис ведёт четыре суточных счётчика воронки онбординга — и больше ничего: ни идентификаторов,
ни почты, ни устройства. Сторонняя аналитика и трекеры не применяются.

## 6. Сервер синхронизации

1. Связи рассчитывает **сервер синхронизации** — фоновая служба без входящих соединений.
2. Изменённые оценки попадают в пересчёт в течение минут; в первые полчаса после первой оценки
   пересчёт выполняется незамедлительно, чтобы новый человек получил свой первый список Связей
   сразу.
3. Раз в сутки выполняется **полная синхронизация** — сверка связей всех людей Пространства.
4. Состояние сервера отображается на экране «Пространство». Состояние «Работает» выводится из
   сердцебиения сервера, а не объявляется.

## 7. Самостоятельный запуск и разработка

### 7.1. Основные положения

1. Исходные тексты сервиса опубликованы полностью и распространяются по лицензии GNU AGPL-3.0:
   создание закрытого платного сервиса на этой основе не допускается.
2. Для запуска требуется Node.js версии 24 или выше (TypeScript исполняется без сборки); для
   эмулятора Firestore дополнительно требуется Java.

### 7.2. Команды

```bash
npm install
npm run dev        # разработка: http://localhost:5173
npm run stand      # живой стенд: эмуляторы + тестовые данные + сервер синхронизации
npm test           # 192 юнит-теста: ядро похожести, модель данных, статистика, кэш
npm run test:rules # 97 тестов правил Firestore и Storage (проверяют ОТКАЗЫ)
npm run test:sync  # 43 теста сервера синхронизации, включая устойчивость к сбоям
npm run e2e        # 72 браузерные проверки (Playwright, продакшен-сборка)
npm run build      # статическая сборка: весь сайт пререндерится
```

Каждый набор тестов проверен мутациями: на намеренно сломанном коде набор падает. Сервер
синхронизации собирается в Docker (`npm run sync:image`, шапка `sync-server/Dockerfile`).

Документы разработки: живой статус — [`STATUS.md`](STATUS.md) · летопись проекта —
[`PROJECT_HISTORY.md`](PROJECT_HISTORY.md) · дорожная карта — [`MASTER_PLAN.md`](MASTER_PLAN.md) ·
видение автора — [`GOAL.md`](GOAL.md) · канон агента — [`AGENT_GUIDE.md`](AGENT_GUIDE.md).
Разработка ведётся тандемом «человек-визионер + ИИ-агент» по фреймворку
[KAIF](https://github.com/MikalaiKryvusha/KAIF) — здесь развёрнута версия **2.2 «Yolden KAIF»**
(с 2026-08-14; версия и история обновлений — в маркере `.kaif/kaif.json`, проверка —
`npm run kaif:version`).

## 8. Ограничения текущей версии

1. Личные сообщения между людьми не предусмотрены: для контакта предназначены свойства профиля,
   которые человек открыл сам (почта, соцсети).
2. История изменения оценок не хранится: у оценки существует только текущее значение.
3. Управление аккаунтом (смена почты, выгрузка и удаление данных) находится в разработке —
   соответствующая строка экрана «Меню» помечена «скоро».
4. Раскладка для планшетов не выверена; опорные ширины интерфейса — телефон и настольный экран.

## Технологии

SvelteKit + TypeScript (статический пререндер всего сайта) · Firebase Hosting, Auth, Firestore ·
сервер синхронизации — Node.js в Docker на компьютере автора, только исходящие соединения.
Математическое ядро — сто строк: [`researches/03`](researches/03_similarity_core_1x_source.md).
Версия 1.x, доказавшая идею, сохранена в приватном архиве; её знание выжато в
[`researches/02`](researches/02_firestore_data_model_1x.md) и
[`researches/03`](researches/03_similarity_core_1x_source.md).

## Автор

Николай Кривуша (Mikalai Kryvusha, *KOT KRINIK*).

> Не нужно стараться заработать и разбогатеть. Нужно делать добро людям — и это добро вернётся,
> возможно в разных формах. Поэтому в первую очередь я просто делаю добро безвозмездно: лучшую в
> мире платформу для знакомств, чтобы люди знакомились и любили друг друга.

---
---

<a id="english"></a>

## English

[Читать по-русски →](#russian)

**NDim Space** is a web service that finds people similar to you. Similarity between two people is
computed mathematically — from their own self-ratings over the dimensions both of them have rated —
and the service periodically builds, for every person, a list of the people most similar to them.

The service is available at **[ndimspace.app](https://ndimspace.app)**. No installation is
required; installing it on a phone as an app is described in section 2.4.

This document is the user manual and the developer's reference.

---

## 1. Purpose

### 1.1. General provisions

1. The source material is a person's self-ratings over **dimensions** — axes of human qualities
   ("I love silence", "I wake up early", "I read at night"). A dimension is shared by everyone:
   rating yourself, you use the same axis as everybody else. Anyone can propose a new one.
2. A person who has rated themselves on at least one dimension becomes a **point in their own
   subspace of dimensions**.
3. The result of the service is **Relations** — a list of at most 250 most similar people, built
   for every person individually under the rules of section 3.
4. Similarity is a private value: only the owner of the list sees it.
5. Successful use of the service is the situation where a person has found a person and left.
   Attention-retention mechanics are not employed.

### 1.2. Limits of application

1. Subscriptions, paid features and advertising are absent and not planned.
2. Activity feeds, view counters and other engagement mechanics are not employed.
3. Selling or transferring user data to anyone is not performed under any circumstances.
4. Direct messages between people are not provided in the current version (section 8).

## 2. Getting started

### 2.1. General provisions

1. The service can be explored without an account: the landing page carries a working similarity
   demo on fictional characters.
2. Full use is possible in two states: **guest** and **account**. The guest mode is meant for
   trying the service out; the account — for regular use.
3. Passwords are not used. Signing in is done with a Google account or with a one-time link sent
   by email.

### 2.2. Guest mode

1. A guest is created with a single tap, with no data entered.
2. A guest is invisible to other people: a guest appears in nobody's Relations and cannot publish
   anything about themselves. At the same time a guest receives their own Relations list on the
   common basis.
3. A guest's work is preserved on account creation: the ratings made as a guest carry over.
4. The data of a guest who has not visited the service for 30 days is deleted.

### 2.3. Account

1. An account is created from the guest mode with the "Save my results" button, or by signing in
   with Google. Signing in to an already existing account has its own button: "I already have an
   account".
2. Signing in by email link also confirms the email address. A confirmed email is the condition
   for viewing other people.

### 2.4. Installing on a phone

1. The service installs on a phone as an app by the browser's own means ("Add to Home screen" /
   "Install app").
2. Once installed, the service opens with its own icon and without the browser address bar.

## 3. How the Space works

### 3.1. General provisions

1. The **Space** consists of dimensions and people-points. Every person is present in the Space as
   exactly one point.
2. A person's profile of dimensions is called their **NDim ID**.
3. The Space holds more than five thousand dimensions. The full catalogue is available on the
   "Dimensions" screen, and since 2026-08-03 every dimension also has its own public page — in
   Russian and in English (for example, `ndimspace.app/en/dimension/…`). Ratings there follow the
   same rule as inside: no votes, no stars.

### 3.2. Dimensions

1. **Anyone can propose** a new dimension: the form is on the "Dimensions" screen, and proposals
   are reviewed by the author of the service before a dimension enters the catalogue.
2. A dimension is shared by everyone: rating yourself on a dimension, you use the same axis as
   everybody else.

### 3.3. Ratings

1. A rating is given with stars from 0 to 10 and expresses the person's position on the
   dimension's axis.
2. A rating is saved automatically when the countdown ends; immediate saving is available with the
   "Save now" button. An unsaved choice is removed by tapping the same star again.
3. A saved rating is removed with the "Remove my rating" action in the dimension card's menu.
4. Nobody but the owner sees the ratings (section 5.1).

### 3.4. Similarity

1. Similarity of two people is computed only over the **shared** dimensions — those rated by both:

   ```
   proximity   = 1 − (distance between points / diameter of the shared space) ^ 0.7
   commonality = 2 · |shared dimensions| / (|mine| + |theirs|)
   SIMILARITY  = proximity × commonality
   ```

2. Under this formula, matching on one random dimension is not enough: commonality punishes a
   narrow overlap. A zero in either factor zeroes the similarity — compromise "averages" are not
   used.
3. With no shared dimensions, similarity is undefined and no relation between the people is
   created.

### 3.5. Relations

1. The Relations list holds at most 250 most similar people, in decreasing order of similarity.
2. Three values are shown for every relation: similarity, proximity and commonality.
3. Expanding a relation shows an acquaintance dossier: the person's properties within the bounds
   of their own visibility settings (section 5.2) and the parameters of both people's spaces.

## 4. Screens

### 4.1. General provisions

1. The service consists of five screens: "Profile", "Relations", "Space", "Dimensions", "Menu".
2. The interface exists in a light and a dark theme and in two languages — Russian and English.
   The switches are on the "Menu" screen and in the header.
3. On screens 1024 pixels wide and up, navigation is a rail on the left; on phones — a bottom bar.

### 4.2. "Profile"

The owner's screen: the NDim ID with its statistics, the profile properties with per-property
visibility settings, and the **"How others see me"** window — a preview of one's own profile
through other people's eyes.

### 4.3. "Relations"

The Relations list under the rules of section 3.5.

### 4.4. "Space"

The Space dashboard: people, dimension and rating counters with weekly trends, the day's events,
the similarity distribution and the state of the sync server (section 6).

### 4.5. "Dimensions"

The dimension catalogue: a feed for rating, the "My NDim ID" tab with one's own ratings, search
across the whole Space and the new-dimension proposal form.

### 4.6. "Menu"

The user manual, the service documents, the theme and language switches, data refresh and sign-out.

## 5. Privacy and visibility

### 5.1. Ratings

Nobody sees a person's ratings except the person: not other people, not friends, not the
administrator. The ratings are read only by the sync server — to compute similarity. Other people
get only the outcome — the similarity value, never what it is made of.

### 5.2. Visibility of profile properties

1. Visibility is set per property: **everyone**, **friends**, selected **circles** of the owner,
   or **nobody**.
2. The visibility default is "hidden": a property with no explicit setting is seen by no one.

### 5.3. Circles and friendship

1. A **circle** is a private list of people the owner keeps to manage visibility. People see
   neither the circle's name, nor its membership, nor the fact of being put in one. An owner may
   keep up to 10 circles.
2. **Friendship** is mutual by construction: one person sends the request, and only the addressee
   can accept it.

### 5.4. Counters without tracking

The service keeps four daily onboarding-funnel counters — and nothing else: no identifiers, no
email, no device. Third-party analytics and trackers are not used.

## 6. The sync server

1. Relations are computed by the **sync server** — a background service with no inbound
   connections.
2. Changed ratings enter the recomputation within minutes; during the first half hour after the
   first rating the recomputation runs immediately, so a new person gets their first Relations
   list at once.
3. Once a day a **full synchronisation** runs — a reconciliation of the relations of everyone in
   the Space.
4. The server state is shown on the "Space" screen. The "Running" state is derived from the
   server's heartbeat, not declared.

## 7. Self-hosting and development

### 7.1. General provisions

1. The source is published in full under GNU AGPL-3.0: building a closed paid service on top of it
   is not permitted.
2. Running requires Node.js 24 or later (TypeScript runs without a build step); the Firestore
   emulator additionally requires Java.

### 7.2. Commands

```bash
npm install
npm run dev        # development: http://localhost:5173
npm run stand      # live stand: emulators + seed data + the sync server
npm test           # 192 unit tests: similarity core, data model, statistics, cache
npm run test:rules # 97 Firestore and Storage rules tests (asserting DENIALS)
npm run test:sync  # 43 sync-server tests, including failure resilience
npm run e2e        # 72 browser checks (Playwright, production build)
npm run build      # static build: the whole site is prerendered
```

Every test suite is verified by mutations: on deliberately broken code the suite fails. The sync
server builds into Docker (`npm run sync:image`, header of `sync-server/Dockerfile`).

Development documents: live status — [`STATUS.md`](STATUS.md) · the project chronicle —
[`PROJECT_HISTORY.md`](PROJECT_HISTORY.md) · roadmap — [`MASTER_PLAN.md`](MASTER_PLAN.md) ·
the author's vision — [`GOAL.md`](GOAL.md) · the agent canon — [`AGENT_GUIDE.md`](AGENT_GUIDE.md).
Development runs as a human-visionary + AI-agent tandem on the
[KAIF](https://github.com/MikalaiKryvusha/KAIF) framework — the version deployed here is
**2.2 "Yolden KAIF"** (since 2026-08-14; the version and update history live in the
`.kaif/kaif.json` marker, checked with `npm run kaif:version`).

## 8. Limitations of the current version

1. Direct messages between people are not provided: contact goes through the profile properties a
   person has opened themselves (email, social links).
2. Rating history is not kept: a rating has only its current value.
3. Account management (changing the email, exporting and deleting the data) is under development —
   the corresponding "Menu" row is marked "soon".
4. The tablet layout is not tuned; the reference widths are the phone and the desktop screen.

## Technology

SvelteKit + TypeScript (the whole site statically prerendered) · Firebase Hosting, Auth,
Firestore · the sync server — Node.js in Docker on the author's machine, outbound connections
only. The mathematical core is a hundred lines:
[`researches/03`](researches/03_similarity_core_1x_source.md). Version 1.x, which proved the idea,
is preserved in a private archive; its knowledge is distilled into
[`researches/02`](researches/02_firestore_data_model_1x.md) and
[`researches/03`](researches/03_similarity_core_1x_source.md).

## Author

Mikalai Kryvusha (*KOT KRINIK*).

> Don't try to get rich. Do good for people — and the good comes back, perhaps in different forms.
> So first of all I simply do good, for free: the world's best platform for people to meet, so
> that they meet and love each other.

---

<div align="center">

**License:** [GNU AGPL-3.0](LICENSE) · © 2026 Mikalai Kryvusha

</div>
