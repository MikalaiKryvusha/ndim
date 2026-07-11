# Исследование 06 — Продуктовые тексты NDim Space 1.x (about, tou, pp, disclaimer)

> **Зачем.** Продуктовые и юридические тексты 1.x написаны владельцем — это его голос и его
> формулировки (принципы, обещания, тон «на Вы»). Продукт переписывается с нуля, но тексты должны
> пережить переписывание: их переиспользуют в 2.0, а не сочиняют заново.
>
> Источник: архив `MikalaiKryvusha/ndim-old`, файлы `storage/public/about.html`,
> `storage/public/tou.html`, `storage/public/pp.html`, `storage/public/disclaimer.html`.
> Снято 2026-07-11. **Живой справочник — не помечается DONE.**
> Вместе с `researches/05` (онбординг) и `researches/07` (руководство пользователя, um.html)
> закрывает задачу ⑥ автономного пула из `STATUS.md` («Извлечь продуктовые тексты (ru/en)
> из архива ndim-old»).
>
> **ПДн:** контактных email-адресов и телефонов в этих файлах нет — плейсхолдеры не потребовались.
> Имена в благодарностях релиз-ноутов и ФИО автора в юридических документах — публичная атрибуция
> из опубликованных текстов 1.x, сохранены дословно.
>
> **Дословность:** тексты владельца сохранены как есть, включая орфографические ошибки оригинала
> (например «Аавтор», «извенения», «misstake») — см. «Заметки для 2.0» в конце.

---

## about.html — «О проекте»

В 1.x файл `about.html` содержит **только историю версий** (дерево раскрывающихся `<details>`).
Нарративное «о проекте» (манифест, идея, терминология) живёт в руководстве пользователя
`um.html` → см. `researches/07`. Оба языка присутствуют (клиентский свап `lang="ru"`/`lang="en"`).

### История версий / Version history

#### Версия 1.5 от 13.05.2026 / Version 1.5 from 05/13/2026

- **RU:** Переезд на дефолтный домен Firebase.
  **EN:** Moving to the default Firebase domain.

#### Версия 1.4 от 04.06.2025 / Version 1.4 from 06/04/2025

- **RU:** Добавлены аватары пользователей.
  **EN:** Added users avatars.
- **RU:** Оптимизация и исправление дефектов.
  **EN:** Optimization and bug fixing.
- **RU:** Пополнение базы данных измерениями.
  **EN:** Filling the database with dimensions.

#### Версия 1.3.1 от 30.05.2025 / Version 1.3.1 from 05/30/2025

- **RU:** Хотфикс флоу сброса пароля и смены Email. Спасибо Кире за помощь ❤️
  **EN:** Hotfixes for the password reset and Email change flows. Thanks Kira for the help ❤️
- **RU:** Улучшено отображение единиц измерения. Теперь они принимают правильную форму согласно числу.
  **EN:** Improved display of units of measurement. Now they take the correct form according to the number.
- **RU:** Добавлена карточка измерения на страницу сообщения об ошибке.
  **EN:** Added a dimension card on the error reporting page.
- **RU:** Оптимизация и исправление дефектов.
  **EN:** Optimization and bug fixing.
- **RU:** Пополнение базы данных измерениями.
  **EN:** Filling the database with dimensions.

#### Версия 1.3 от 28.05.2025 / Version 1.3 from 05/28/2025

- **RU:** UI/UX улучшения во флоу онбординга.
  **EN:** UI/UX improvements in the onboarding flow.
- **RU:** UI/UX улучшения во флоу регистрации и авторизации.
  **EN:** UI/UX improvements in the registration and authorization flows.
- **RU:** Добавлен модальный диалог для новых пользователей о важности заполнения NDim ID профиля.
  **EN:** Added a modal dialog for new users about the importance of filling in the NDim ID profile.
- **RU:** Добавлена аналитика рекламной атрибуции.
  **EN:** Added advertising attribution analytics.
- **RU:** Оптимизация и исправление дефектов.
  **EN:** Optimization and bug fixing.
- **RU:** Пополнение базы данных измерениями.
  **EN:** Filling the database with dimensions.

#### Версия 1.2 от 20.05.2025 / Version 1.2 from 05/20/2025

- **RU:** Добавлен флоу онбординга.
  **EN:** Added onboarding flow.
- **RU:** Добавлена форма сообщения об ошибке описания измерения.
  **EN:** Added form for reporting a dimension description misstake.
- **RU:** Пополнение базы данных измерениями.
  **EN:** Filling the database with dimensions.

#### Версия 1.1 от 13.05.2025 / Version 1.1 from 05/13/2025

- **RU:** Добавлено Руководство пользователя на страницу приветствия.
  **EN:** Added User Manual on the Welcome page.
- **RU:** Отображение псевдонимов и имён пользователей в карточках связей.
  **EN:** Displaying nicknames and user names in relation cards.
- **RU:** Оптимизация алгоритма хранения измерений в базе данных. Спасибо Виктору за помощь ❤️
  **EN:** Optimization of the algorithm for storing dimensions in the database. Thanks Viktar for the help ❤️
- **RU:** Пополнение базы данных измерениями.
  **EN:** Filling the database with dimensions.

#### Версия 1.0 от 05.05.2025 / Version 1.0 from 05/05/2025

- **RU:** Публичный релиз.
  **EN:** Public release.
- **RU:** Статусы последнего и текущего онлайна в карточках связи.
  **EN:** Last and current online statuses in connection cards.
- **RU:** Улучшение алгоритма поиска измерений.
  **EN:** Improving the dimensions search algorithm.
- **RU:** Оптимизация и исправление дефектов.
  **EN:** Optimization and bug fixing.
- **RU:** Пополнение базы данных измерениями.
  **EN:** Filling the database with dimensions.

#### Версия 0.8 от 26.04.2025 / Version 0.8 from 04/26/2025

- **RU:** Добавлен рейтинг измерений.
  **EN:** Added rating of dimensions.
- **RU:** Добавлены инструкции по установке PWA приложения на Apple устройства.
  **EN:** Added instructions for installing the PWA application on Apple devices.
- **RU:** Оптимизация и исправление дефектов.
  **EN:** Optimization and bug fixing.
- **RU:** Пополнение базы данных измерениями.
  **EN:** Filling the database with dimensions.

#### Версия 0.7 от 19.04.2025 / Version 0.7 from 04/19/2025

- **RU:** Добавлена кнопка установки PWA приложения на устройство.
  **EN:** Added button to install the PWA app on the device.
- **RU:** Добавлен поиск дополнительной информации об измерениях в сети Интернет.
  **EN:** Added search for additional information about dimensions in the Internet.
- **RU:** Добавлена форма предложения новых измерений.
  **EN:** Added form for suggesting new dimensions.
- **RU:** Добавлены подсказки с объяснением основных метрик связей (появляется при наведении курсора или тапе по метрике).
  **EN:** Added hints with an explanation of the main metrics of relations (appear when hovering or tapping on the metric).
- **RU:** Исправление дефектов.
  **EN:** Bugs fixing.
- **RU:** Пополнение базы данных измерениями.
  **EN:** Filling the database with dimensions.

#### Версия 0.6 от 29.03.2025 / Version 0.6 from 03/29/2025

- **RU:** Удаление дубликатов измерений.
  **EN:** Removing duplicates of dimensions.
- **RU:** Исправление дефектов.
  **EN:** Bugs fixing.
- **RU:** Пополнение базы данных измерениями.
  **EN:** Filling the database with dimensions.

#### Версия 0.5 от 20.03.2025 / Version 0.5 from 03/20/2025

- **RU:** Улучшение алгоритма поиска измерений.
  **EN:** Improving the dimensions search algorithm.
- **RU:** Теги "Новое" для новых измерений.
  **EN:** Tags "New" for new dimensions.
- **RU:** Пополнение базы данных измерениями.
  **EN:** Filling the database with dimensions.

#### Версия 0.4 от 03.03.2025 / Version 0.4 from 03/03/2025

- **RU:** Улучшение алгоритма поиска измерений.
  **EN:** Improving the dimensions search algorithm.
- **RU:** Улучшения и исправления графического интерфейса.
  **EN:** Improvements and bug fixes in the graphical interface.
- **RU:** Пополнение базы данных измерениями.
  **EN:** Filling the database with dimensions.

#### Версия 0.3 от 28.02.2025 / Version 0.3 from 02/28/2025

- **RU:** Аналитика.
  **EN:** Analytics.
- **RU:** Подготовка бета версии для бета-тестирования.
  **EN:** Preparing a beta version for beta-testing.
- **RU:** Исправление дефектов.
  **EN:** Bugs fixing.
- **RU:** Пополнение базы данных измерениями.
  **EN:** Filling the database with dimensions.

#### Версия 0.2 от 26.02.2025 / Version 0.2 from 02/26/2025

- **RU:** Завершение разработки всего базового функционала.
  **EN:** Completion of development of all basic functionality.
- **RU:** Пополнение базы данных измерениями.
  **EN:** Filling the database with dimensions.

#### Версия 0.1 от 19.02.2025 / Version 0.1 from 02/19/2025

- **RU:** Завершение активной фазы разработки базовых функционала и интерфейса.
  **EN:** Completion of the active phase of development of basic functionality and interface.
- **RU:** Заполнение базы данных основными измерениями.
  **EN:** Filling the database with basic dimensions.
- **RU:** Тестирование во время разработки.
  **EN:** Testing during development.

---

## tou.html — Условия использования / Terms of Use

Оба языка присутствуют. **Дефект оригинала:** пункта 1.5 нет — нумерация прыгает с 1.4 на 1.6.

### 1. Общие положения / General provisions

> **RU:** 1.1. Данный документ (далее — Условия) регулирует использование системы "Пространство NDim" (англ. "NDim Space") (далее — Система) Пользователем (далее — Пользователь) и определяется в одностороннем порядке автором системы Николаем Викторовичем Кривушей (далее — Автор).
>
> **EN:** 1.1. This document (hereinafter referred to as the Terms) regulates the use of the "NDim Space" (rus. "Пространство NDim") system (hereinafter referred to as the System) by the User (hereinafter referred to as the User) and is determined unilaterally by the author of the system, Mikalai Viktaravich Kryvusha (hereinafter referred to as the Author).

> **RU:** 1.2. Пользователь, регистрируясь в Системе, принимает настоящие Условия в полном объёме, обязуется их соблюдать и подтверждает своё полное согласие с положениями настоящих Условий. Факт согласия Пользователя с Условиями фиксируется в документе учётной записи Пользователя флагом "agreement": true ("согласие": истина).
>
> **EN:** 1.2. By registering in the System, the User accepts these Terms in full, undertakes to comply with them and confirms his/her full agreement with the provisions of these Terms. The fact of the User's consent to the Policy is recorded in the User's account document by the flag "agreement": true.

> **RU:** 1.3. Пользователь, регистрируясь в Системе, также принимает полном объёме и обязуется соблюдать документы: "Политика конфиденциальности" (далее — Политика) и "Отказ от ответственности". Факт согласия Пользователя с Политикой и Отказом от ответственности фиксируется в документе учётной записи Пользователя флагом "agreement": true ("согласие": истина).
>
> **EN:** 1.3. The User, by registering in the System, also accepts in full and undertakes to comply with the documents: "Privacy Policy" (hereinafter referred to as the Policy) and "Disclaimer". The fact of the User's consent to the Policy and Disclaimer is recorded in the User account document by the flag "agreement": true.

> **RU:** 1.4. Система предоставляется в пользование по принципу "как есть", без каких-либо гарантий: стабильности и отказоустойчивости системы, целостности и конфиденциальности личных данных Пользователя, целостности и работоспособности оборудования Пользователя, целостности и сохранности здоровья (как физического, так и ментального) Пользователя.
>
> **EN:** 1.4. The system is provided for use on an "as is" basis, without any guarantees: stability and fault tolerance of the system, integrity and confidentiality of the user's personal data, integrity and operability of the user's equipment, integrity and safety of the user's health, both physical and mental.

> **RU:** 1.6. Все авторские права на все встречающиеся в системе объекты интеллектуальной собственности принадлежат их законным правообладателям. Автор системы не предоставляет Пользователю никаких личных прав на любые объекты интеллектуальной собственности, присуствующие в Системе, включая личные данные учётной записи Пользователя. Автор системы не претендует на владение никакими объектами интеллектуальной собственности, присуствующими в Системе.
>
> **EN:** 1.6. All copyrights to all intellectual property objects present in the system belong to their legal owners. The author of the system does not grant the User any personal rights to any intellectual property objects present in the System, including personal data of the User's account. The author of the system does not claim ownership of any intellectual property objects present in the System.

> **RU:** 1.7. Автор системы обладает полным правом интеллектуальной собственности над программным кодом Системы, элементами графического интерфейса Системы, структурой и данными баз данных и настроек сервисов Google Firebase проекта Системы за исключением тех объектов интеллектуальной собственности сервисов Google Firebase и встречающихся в системе объектов интеллектуальной собственности, на которых у Автора нет права собственности.
>
> **EN:** 1.7. The Author of the System has full intellectual property rights over the program code of the System, elements of the graphical interface of the System, the structure and data of the databases and settings of the Google Firebase services of the System project, with the exception of those objects of intellectual property of the Google Firebase services and objects of intellectual property found in the system to which the Author does not have ownership rights.

> **RU:** 1.8. Система работает на базе сервисов Google Firebase: Firestore, Hosting, Storage, Authentication. Автор полностью перекладывает ответственность за целостность данных и работоспособность Системы на сервис Google Firebase.
>
> **EN:** 1.8. The system operates on the basis of Google Firebase services: Firestore, Hosting, Storage, Authentication. The Author fully transfers responsibility for the integrity of the data and the operability of the System to the Google Firebase service.

### 2. Права и обязанности Пользователя / User rights and obligations

> **RU:** 2.1. Пользователь принимает на себя полную ответственность за использование Системы.
>
> **EN:** 2.1. The User assumes full responsibility for the use of the System.

> **RU:** 2.2. Пользователь обязуется не предъявлять автору Системы никаких претензий (юридических, финансовых, административных или иных) в связи с использованием Системы.
>
> **EN:** 2.2. The User undertakes not to make any claims (legal, financial, administrative or other) to the author of the System in connection with the use of the System.

> **RU:** 2.3. Пользователь принимает на себя полную ответственность за:
>
> **EN:** 2.3. The User assumes full responsibility for:

**RU:**
- Своё здоровье при использовании Системы;
- Целостность своего оборудования;
- Сохранность своих данных (возможную их утерю, передачу их третьим лицам, изменение или удаление автором системы).

**EN:**
- Your health when using the System;
- Integrity of your equipment;
- Safety of your data (possible loss, transfer to third parties, modification or deletion by the author of the system).

> **RU:** 2.4. Пользователь обязуется не:
>
> **EN:** 2.4. The User undertakes not to:

**RU:**
- Вредить работоспособности Системы, взламывать или портить Систему;
- Изменять, копировать или использовать программный код Системы без разрешения;
- Использовать Систему в мошеннических, коммерческих или вредоносных целях;
- Вмешиваться в пользовательский опыт других пользователей;
- Использовать личные данные других пользователей без их согласия.

**EN:**
- Harm the functionality of the System, hack or damage the System;
- Change, copy or use the program code of the System without permission;
- Use the System for fraudulent, commercial or malicious purposes;
- Interfere with the user experience of other users;
- Use the personal data of other users without their consent.

> **RU:** 2.5. Пользователь может использовать Систему в личных целях исключительно во благо себя и сообщества.
>
> **EN:** 2.5. The User may use the System for personal purposes solely for the benefit of himself and the community.

> **RU:** 2.6. Пользователь обязуется не причинять вреда (физического, морального, юридического, финансового или иного) Системе, Автору и другим пользователям Системы.
>
> **EN:** 2.6. The User undertakes not to cause harm (physical, moral, legal, financial or other) to the System, the Author and other users of the System.

> **RU:** 2.7. Пользователь принимает на себя полную ответственность за данные, переданные в систему (Email, Пароль, личные данные учётной записи, личный документ NDim ID и все другие личные данные), и за любой возможный вред, который эти данные могут причинить Системе, Автору, другим пользователям Системы и третьим лицам.
>
> **EN:** 2.7. The User assumes full responsibility for the data transferred to the system (Email, Password, personal account data, personal NDim ID document and all other personal data) and for any possible harm that this data may cause to the System, the Author, other users of the System and third parties.

> **RU:** 2.8. Принимая данные Условия пользователь обязуется добросовестно соблюдать их в полном объёме. Пользователь также обязуется добросоветсно соблюдать в полном объёме положения документов: "Политика конфиденциальности" и "Отказ от ответственности".
>
> **EN:** 2.8. By accepting these Terms, the user undertakes to comply with them in good faith and in full. The user also undertakes to comply in good faith and in full with the provisions of the documents: "Privacy Policy" and "Disclaimer".

> **RU:** 2.9. Даже после удаления аккаунта пользователь остаётся обязан соблюдать настоящие Условия использования а также положения документов: "Политика конфиденциальности" и "Отказ от ответственности".
>
> **EN:** 2.9. Even after deleting an account, the user remains obliged to comply with these Terms of Use as well as the provisions of the documents: "Privacy Policy" and "Disclaimer".

### 3. Права и обязанности автора Системы / Author's rights and obligations

> **RU:** 3.1. Автор Системы оставляет за собой полное право:
>
> **EN:** 3.1. The Author of the System reserves the full right:

**RU:**
- Вносить любые изменения в программный код Системы;
- Редактировать и удалять любые данные в базах данных Системы;
- Иметь полный доступ к пользовательским данным;
- Полностью отключать или удалять Систему без объяснения причин.

**EN:**
- Make any changes to the program code of the System;
- Edit and delete any data in the System databases;
- Have full access to user data;
- Completely disable or delete the System without explanation.

> **RU:** 3.2. Пользователь соглашается, что автор имеет право на все вышеперечисленные действия в одностороннем порядке без предупреждения пользователя.
>
> **EN:** 3.2. The user agrees that the author has the right to all of the above actions unilaterally without warning the user.

> **RU:** 3.3. Аавтор не имеет доступа к паролям от учётных записей пользователей. Пароли остаются скрыты и защищены от кого бы то ни было.
>
> **EN:** 3.3. The author does not have access to user account passwords. Passwords remain hidden and protected from anyone.

> **RU:** 3.4. Аавтор обязуется относиться и обращаться с уважением с пользователями Системы, с их учётными записями и личными данными, с Системой и с сервисами Google Firebase для обеспечения доверительной доброжетельной атмосферы в Системе базирующейся на приниципах взаимного уважения, доверия, помощи, поддержки и любви.
>
> **EN:** 3.4. The Author undertakes to treat and deal with respect with the users of the System, with their accounts and personal data, with the System and with Google Firebase services in order to ensure a trusting and friendly atmosphere in the System based on the principles of mutual respect, trust, assistance, support and love.

> **RU:** 3.5. Управляя системой, развивая её и поддерживая в работоспособном состоянии Автор ставит своей целью обеспечение позитивного пользовательского опыта каждого пользователя Системы, развитие и поддержку взаимного уважения, доверия, помощи, поддержки и любви между пользователями Системы, Автором и всем Человечеством.
>
> **EN:** 3.5. By managing the system, developing it and maintaining it in working condition, the Author aims to ensure a positive user experience for each user of the System, the development and support of mutual respect, trust, help, support and love between the users of the System, the Author and all of Humanity.

### 4. Безопасность и отказ от ответственности / Security and liability

> **RU:** 4.1. Система может содержать ошибки, баги и уязвимости, за последствия (сбои, потери данных, ущерб оборудованию, ущерб здоровью и другие последствия) возникновения которых при использовании Системы пользователем Автор не несёт ответственности.
>
> **EN:** 4.1. The System may contain errors, bugs and vulnerabilities, for the consequences (failures, data loss, damage to equipment, damage to health and other consequences) of which the user uses the System, the Author is not responsible.

> **RU:** 4.2. Автор не предоставляет никаких гарантий работоспособности и безотказности Системы.
>
> **EN:** 4.2. The Author does not provide any guarantees of the operability and reliability of the System.

> **RU:** 4.3. Пользователь принимает на себя все возможные риски, связанные с использованием Системы.
>
> **EN:** 4.3. The User assumes all possible risks associated with the use of the System.

> **RU:** 4.4. Автор не несёт ответственности за работоспособность сервисов Google Firebase, на которых основана Система.
>
> **EN:** 4.4. The Author is not responsible for the functionality of the Google Firebase services on which the System is based.

### 5. Изменение Условий, Политики и Отказа от ответственности / Changes to Terms, Policy and Disclaimers

> **RU:** 5.1. Автор оставляет за собой право изменять положения Условий, Политики и Отказа от ответственности в любое время в любом объёме без уведомления пользователей.
>
> **EN:** 5.1. The author reserves the right to change the provisions of the Terms, Policy and Disclaimer at any time to any extent without notifying users.

> **RU:** 5.2. Продолжение использования Системы после внесения изменений в Условия, Политику или Отказ от ответственности означает автоматическое согласие пользователя с новой редакцией Условий, Политики и Отказа от ответственности.
>
> **EN:** 5.2. Continued use of the System after changes have been made to the Terms, Policy or Disclaimer shall constitute the user's automatic consent to the new version of the Terms, Policy and Disclaimer.

### 6. Заключительные положения / Conclusion

> **RU:** 6.1. Принимая данные Условия, пользователь также соглашается с Отказом от ответственности и Политикой конфиденциальности, изложенными в отдельных документах.
>
> **EN:** 6.1. By accepting these Terms, the user also agrees to the Disclaimer and Privacy Policy set out in separate documents.

> **RU:** 6.2. Несоблюдение пользователем положений Условий, Политики и Отказа от ответственности может привести к блокировке или удалению учётной записи пользователя без возможности восстановления.
>
> **EN:** 6.2. Failure by the User to comply with the provisions of the Terms, Policy and Disclaimer may result in the blocking or deletion of the user's account without the possibility of recovery.

> **RU:** Дата последнего обновления Условий: 3 Марта 2025 г.
>
> **EN:** Date of last Terms update: 3 March 2025.

---

## pp.html — Политика конфиденциальности / Privacy Policy

Оба языка присутствуют. **Дефект вёрстки оригинала:** разделы 4 и блок с датой вложены внутрь
`<div class="paragraph">` раздела 3 (на контент не влияет).

### 1. Общие положения / General provisions

> **RU:** 1.1. Данный документ (далее — Политика) регулирует использование системы "Пространство NDim" (англ. "NDim Space") (далее — Система) Пользователем (далее — Пользователь) и определяется в одностороннем порядке автором системы Николаем Викторовичем Кривушей (далее — Автор).
>
> **EN:** 1.1. This document (hereinafter referred to as the Policy) regulates the use of the "NDim Space" (rus. "Пространство NDim") system (hereinafter referred to as the System) by the User (hereinafter referred to as the User) and is determined unilaterally by the author of the system, Mikalai Viktaravich Kryvusha (hereinafter referred to as the Author).

> **RU:** 1.2. Пользователь, регистрируясь в Системе, принимает настоящую Политику в полном объёме, обязуется её соблюдать и подтверждает своё полное согласие с положениями настоящей Политики. Факт согласия Пользователя с Политикой фиксируется в документе учётной записи Пользователя флагом "agreement": true ("согласие": истина).
>
> **EN:** 1.2. By registering in the System, the User accepts this Policy in full, undertakes to comply with it and confirms his/her full agreement with the provisions of this Policy. The fact of the User's consent to the Policy is recorded in the User's account document by the flag "agreement": true.

> **RU:** 1.3. Система работает на базе сервисов Google Firebase: Firestore, Hosting, Storage, Authentication. Автор полностью перекладывает ответственность за целостность и конфиденциальность пользовательских данных и работоспособность Системы на сервис Google Firebase.
>
> **EN:** 1.3. The system operates on the basis of Google Firebase services: Firestore, Hosting, Storage, Authentication. The author fully transfers responsibility for the integrity and confidentiality of user data and the operability of the System to the Google Firebase service.

### 2. Политика в отношении пользовательских данных / Policy in relation to user data

> **RU:** 2.1. Автор Системы не несёт ответственности за конфиденциальность, целостность и сохранность пользовательских данных.
>
> **EN:** 2.1. The Author of the System is not responsible for the confidentiality, integrity and safety of user data.

> **RU:** 2.2. При необходимости пользовательские данные могут быть переданы третьим лицам, изменены или удалены автором системы без уведомления Пользователя. Необходимость таких действий определяется автором системы в одностороннем порядке.
>
> **EN:** 2.2. If necessary, user data may be transferred to third parties, changed or deleted by the author of the system without notifying users. The necessity of such actions is determined by the author of the system unilaterally.

> **RU:** 2.3. Адрес электронной почты (Email) Пользователя может быть виден всем Пользователям Системы. Email адреса в Системе являются публичной общедоступной информацией. Для регистрации в Системе используйте Email адрес, которым Вы готовы поделиться публично.
>
> **EN:** 2.3. The User's Email address may be visible to all Users of the System. Email addresses in the System are publicly accessible information. To register in the System, use an Email address that you are willing to share publicly.

> **RU:** 2.4. Автор системы обязуется относится к учётной записи Пользователя и к его личным данным с уважением и бережностью, заботясь о том, чтобы данные и учётная запись оставались в целостности, сохранности и скрыты от третьих лиц.
>
> **EN:** 2.4. The author of the system undertakes to treat the User's account and his personal data with respect and care, ensuring that the data and account remain intact, safe and hidden from third parties.

> **RU:** 2.5. Автор Системы не гарантирует работоспособность и безотказность сервисов Google Firebase (на базе которых работает система, и в которых хранятся учётные записи и данные пользователей) и не несёт ответственность за них.
>
> **EN:** 2.5. The Author of the System does not guarantee the functionality and reliability of Google Firebase services (on the basis of which the system operates, and in which user accounts and data are stored) and is not responsible for them.

### 3. Права и обязанности Пользователя в отношении личных данных / User rights and obligations in relation to personal data

> **RU:** 3.1. Пользователь принимает на себя полную ответственность за конфиденциальность и сохранность своих личных данных (включая пароли, адреса электронной почты, личные данные, личный документ NDim ID и все другие личные данные) при использовании Системы.
>
> **EN:** 3.1. The User assumes full responsibility for the confidentiality and security of their personal data (including passwords, email addresses, personal data, personal NDim ID document and all other personal data) when using the System.

> **RU:** 3.2. Пользователь обязуется хранить в секрете и никому не раскрывать пароль от личной учётной записи.
>
> **EN:** 3.2. The User undertakes to keep secret and not disclose to anyone the password for the personal account.

> **RU:** 3.3. Пользователь обязуется не предпринимать попыток взлома Системы, попыток несанкциорированного получения данных учётных записей других пользователей Системы, попыток входа в личную учётную запись других пользователей Системы.
>
> **EN:** 3.3. The User undertakes not to attempt to hack the System or to attempt unauthorized acquisition of account data of other users of the System, attempts to log into the personal account of other users of the System.

> **RU:** 3.4. Пользователь обязуется в случае преднамеренного или намеренного взлома Системы, несанкциорированного получения данных учётных записей других пользователей Системы незамедлительно сообщить об данном факте Автору Системы.
>
> **EN:** 3.4. The User undertakes to immediately notify the Author of the System of this fact in the event of intentional or deliberate hacking of the System or unauthorized acquisition of account data of other users of the System.

### 4. Заключительные положения / Conclusion

> **RU:** 4.1. Пользователь использует Систему на свой страх и риск, и принимает на себя полную ответственность за свои действия в отношении Системы и своих личных данных.
>
> **EN:** 4.1. The User uses the System at his own risk and assumes full responsibility for his actions in relation to the System and his personal data.

> **RU:** Дата последнего обновления Политики: 3 Марта 2025 г.
>
> **EN:** Date of last Policy update: 3 March 2025.

---

## disclaimer.html — Отказ от ответственности / Disclaimer

Оба языка присутствуют, кроме пункта 2.1: **в EN-блоке оригинала продублирован русский текст**
(английский перевод пункта 2.1 отсутствует — дефект оригинала, отмечено ниже по месту).

### 1. Общие положения / General provisions

> **RU:** 1.1. Данный документ (далее — Отказ от ответственности) регулирует использование системы "Пространство NDim" (англ. "NDim Space") (далее — Система) Пользователем (далее — Пользователь) и определяется в одностороннем порядке автором системы Николаем Викторовичем Кривушей (далее — Автор).
>
> **EN:** 1.1. This document (hereinafter referred to as the Disclaimer) regulates the use of the "NDim Space" (rus. "Пространство NDim") system (hereinafter referred to as the System) by the User (hereinafter referred to as the User) and is determined unilaterally by the author of the system, Mikalai Viktaravich Kryvusha (hereinafter referred to as the Author).

> **RU:** 1.2. Пользователь, регистрируясь в Системе, принимает настоящий Отказ от ответственности в полном объёме, обязуется его соблюдать и подтверждает своё полное согласие с положениями настоящего Отказа от ответственности. Факт согласия Пользователя с Отказом от ответственности фиксируется в документе учётной записи Пользователя флагом "agreement": true ("согласие": истина).
>
> **EN:** 1.2. By registering in the System, the User accepts this Disclaimer in full, undertakes to comply with it and confirms his/her full agreement with the provisions of this Disclaimer. The fact of the User's agreement with the Disclaimer is recorded in the User's account document by the flag "agreement": true.

> **RU:** 1.3. Система работает на базе сервисов Google Firebase: Firestore, Hosting, Storage, Authentication. Автор полностью перекладывает ответственность за целостность и конфиденциальность пользовательских данных и работоспособность Системы на сервис Google Firebase.
>
> **EN:** 1.3. The system operates on the basis of Google Firebase services: Firestore, Hosting, Storage, Authentication. The author fully transfers responsibility for the integrity and confidentiality of user data and the operability of the System to the Google Firebase service.

### 2. Отказ от ответственности за возможный ущерб / Disclaimer for potential damage

> **RU:** 2.1. Пользуясь Системой Пользователь принимает всю ответственность и все потенциальные риски на себя.
>
> **EN:** *(отсутствует в оригинале — в EN-блоке пункта 2.1 продублирован русский текст: «2.1. Пользуясь Системой Пользователь принимает всю ответственность и все потенциальные риски на себя.»)*

> **RU:** 2.2. Автор не несёт ответственности за:
>
> **EN:** 2.2. The Author does not assume any responsibility for:

**RU:**
- Целостность и сохранность данных пользователя;
- Доступность и работоспособность системы;
- Целостность, сохранность и работоспособность оборудования Пользователя;
- Целостность и сохранность любой формы здоровья Пользователя (физического, ментального, психического, эмоционального и другого);
- Результаты использования Системы Пользователем;
- Личные данные и действия других пользователей и потенциальный вред, который они могут нанести Пользователю, Системе, Автору или третьим лицам.

**EN:**
- Integrity and safety of user data;
- Availability and operability of the system;
- Integrity, safety and operability of the User's equipment;
- Integrity and safety of any form of health of the User (physical, mental, psychological, emotional and other);
- Results of the User's use of the System;
- Personal data and actions of other users and the potential harm they may cause to the User, the System, the Author or third parties.

### 3. Отказ от ответственности за возможное нарушение авторских прав / Disclaimer for potential infringement of copyright

> **RU:** 3.1. Автор не претендует на наличие авторских прав на те объекты интеллектуальной собственности (программный код, изображения, тексты, названия, логотипы, и т.д.), у которых есть свои законные правообладатели.
>
> **EN:** 3.1. The author does not claim copyright on those objects of intellectual property (program code, images, texts, names, logos, etc.) that have their own legal owners.

> **RU:** 3.2. При возникновении факта нарушения Автором чьих-либо авторских прав, автор приносит свои глубочайшие извенения и обязуется устранить нарушение по мере возможности при обращении к Автору законного правообладателя тего или иного объекта собственности, косательно которого возникло нарушение.
>
> **EN:** 3.2. If the Author violates someone's copyright, the Author offers his deepest apologies and undertakes to eliminate the violation as far as possible by contacting the Author with the legal owner of the property in respect of which the violation occurred.

> **RU:** Дата последнего обновления Отказа от ответственности: 3 Марта 2025 г.
>
> **EN:** Date of last Disclaimer update: 3 March 2025.

---

## Заметки для 2.0

- **about.html — это не «о проекте», а релиз-ноуты.** Нарратив «что такое NDim» в 1.x жил в
  руководстве пользователя (`um.html`, разделы «Манифест» и «Идея» → `researches/07`). Для 2.0
  «о проекте» стоит собирать из манифеста, а историю версий вести отдельно.
- **Дефекты оригинала, сохранённые дословно** (при переиспользовании в 2.0 — исправить):
  - tou: нет пункта 1.5 (нумерация 1.4 → 1.6); 1.2 EN говорит "consent to the Policy" вместо
    "Terms" (копипаста); опечатки «Аавтор» (3.3, 3.4), «добросоветсно» (2.8),
    «доброжетельной», «приниципах» (3.4), «присуствующие» (1.6);
  - pp: «несанкциорированного» (3.3, 3.4), «обязуется относится» (2.4);
  - disclaimer: пункт 2.1 без английского перевода (RU-текст в обоих языковых блоках);
    опечатки «извенения», «тего или иного», «косательно» (3.2);
  - about: EN "misstake" (v1.2), "Thanks Viktar" (v1.1).
- **Все три юридических документа датированы 3 марта 2025** и написаны по одному шаблону:
  преамбула «определяется в одностороннем порядке автором», флаг `"agreement": true` в учётной
  записи, перенос ответственности на Google Firebase.
- **Email как публичная информация** (pp 2.3) — осознанное решение 1.x: связь между людьми шла
  через личную почту. Для 2.0 это решение стоит пересмотреть отдельно (см. также утечку
  `owner_email` в чужие `relations` — `researches/02`).
- Голос владельца в юридических текстах — не только юридический: пункты tou 3.4–3.5 про уважение,
  доверие, помощь, поддержку и любовь — прямое продолжение манифеста и `GOAL.md`.
