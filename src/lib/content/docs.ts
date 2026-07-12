/**
 * СГЕНЕРИРОВАННЫЙ ФАЙЛ. Не правьте его руками: перезаписывается командой
 *   node tools/extract-docs.mjs
 *
 * Продуктовые тексты владельца, снятые дословно из версии 1.x (researches/06, researches/07):
 * условия использования, политика конфиденциальности, отказ от ответственности, история версий
 * и вневременные разделы руководства пользователя (манифест, идея, терминология, шкала оценок).
 *
 * Чего здесь НЕТ: разделы руководства 1.x про экраны («Дом», «Связи», «Меню», работа с
 * измерениями) — они описывают интерфейс, которого в 2.0 не существует. Их адаптация — задача
 * с участием владельца, а не механический перенос.
 *
 * ⚠️ Правовые тексты будут ДОПОЛНЕНЫ по ideas/12 (личная ответственность автора контента):
 * это место, куда придут новые пункты, — и придут они со словом владельца.
 */

export interface DocText {
  readonly ru: string;
  readonly en: string;
}

export type DocBlock =
  | { readonly type: 'h2' | 'h3' | 'p'; readonly text: DocText }
  | { readonly type: 'ul'; readonly items: { readonly ru: readonly string[]; readonly en: readonly string[] } }
  | {
      readonly type: 'table';
      readonly head: { readonly ru: readonly string[]; readonly en: readonly string[] };
      readonly rows: { readonly ru: readonly string[][]; readonly en: readonly string[][] };
    };

export interface Doc {
  readonly slug: string;
  readonly title: DocText;
  readonly blocks: readonly DocBlock[];
}

export const DOCS: Readonly<Record<string, Doc>> = {
  "terms": {
    "slug": "terms",
    "title": {
      "ru": "Условия использования",
      "en": "Terms of Use"
    },
    "blocks": [
      {
        "type": "h2",
        "text": {
          "ru": "1. Общие положения",
          "en": "General provisions"
        }
      },
      {
        "type": "p",
        "text": {
          "ru": "1.1. Данный документ (далее — Условия) регулирует использование системы \"Пространство NDim\" (англ. \"NDim Space\") (далее — Система) Пользователем (далее — Пользователь) и определяется в одностороннем порядке автором системы Николаем Викторовичем Кривушей (далее — Автор).",
          "en": "1.1. This document (hereinafter referred to as the Terms) regulates the use of the \"NDim Space\" (rus. \"Пространство NDim\") system (hereinafter referred to as the System) by the User (hereinafter referred to as the User) and is determined unilaterally by the author of the system, Mikalai Viktaravich Kryvusha (hereinafter referred to as the Author)."
        }
      },
      {
        "type": "p",
        "text": {
          "ru": "1.2. Пользователь, регистрируясь в Системе, принимает настоящие Условия в полном объёме, обязуется их соблюдать и подтверждает своё полное согласие с положениями настоящих Условий. Факт согласия Пользователя с Условиями фиксируется в документе учётной записи Пользователя флагом \"agreement\": true (\"согласие\": истина).",
          "en": "1.2. By registering in the System, the User accepts these Terms in full, undertakes to comply with them and confirms his/her full agreement with the provisions of these Terms. The fact of the User's consent to the Policy is recorded in the User's account document by the flag \"agreement\": true."
        }
      },
      {
        "type": "p",
        "text": {
          "ru": "1.3. Пользователь, регистрируясь в Системе, также принимает полном объёме и обязуется соблюдать документы: \"Политика конфиденциальности\" (далее — Политика) и \"Отказ от ответственности\". Факт согласия Пользователя с Политикой и Отказом от ответственности фиксируется в документе учётной записи Пользователя флагом \"agreement\": true (\"согласие\": истина).",
          "en": "1.3. The User, by registering in the System, also accepts in full and undertakes to comply with the documents: \"Privacy Policy\" (hereinafter referred to as the Policy) and \"Disclaimer\". The fact of the User's consent to the Policy and Disclaimer is recorded in the User account document by the flag \"agreement\": true."
        }
      },
      {
        "type": "p",
        "text": {
          "ru": "1.4. Система предоставляется в пользование по принципу \"как есть\", без каких-либо гарантий: стабильности и отказоустойчивости системы, целостности и конфиденциальности личных данных Пользователя, целостности и работоспособности оборудования Пользователя, целостности и сохранности здоровья (как физического, так и ментального) Пользователя.",
          "en": "1.4. The system is provided for use on an \"as is\" basis, without any guarantees: stability and fault tolerance of the system, integrity and confidentiality of the user's personal data, integrity and operability of the user's equipment, integrity and safety of the user's health, both physical and mental."
        }
      },
      {
        "type": "p",
        "text": {
          "ru": "1.6. Все авторские права на все встречающиеся в системе объекты интеллектуальной собственности принадлежат их законным правообладателям. Автор системы не предоставляет Пользователю никаких личных прав на любые объекты интеллектуальной собственности, присуствующие в Системе, включая личные данные учётной записи Пользователя. Автор системы не претендует на владение никакими объектами интеллектуальной собственности, присуствующими в Системе.",
          "en": "1.6. All copyrights to all intellectual property objects present in the system belong to their legal owners. The author of the system does not grant the User any personal rights to any intellectual property objects present in the System, including personal data of the User's account. The author of the system does not claim ownership of any intellectual property objects present in the System."
        }
      },
      {
        "type": "p",
        "text": {
          "ru": "1.7. Автор системы обладает полным правом интеллектуальной собственности над программным кодом Системы, элементами графического интерфейса Системы, структурой и данными баз данных и настроек сервисов Google Firebase проекта Системы за исключением тех объектов интеллектуальной собственности сервисов Google Firebase и встречающихся в системе объектов интеллектуальной собственности, на которых у Автора нет права собственности.",
          "en": "1.7. The Author of the System has full intellectual property rights over the program code of the System, elements of the graphical interface of the System, the structure and data of the databases and settings of the Google Firebase services of the System project, with the exception of those objects of intellectual property of the Google Firebase services and objects of intellectual property found in the system to which the Author does not have ownership rights."
        }
      },
      {
        "type": "p",
        "text": {
          "ru": "1.8. Система работает на базе сервисов Google Firebase: Firestore, Hosting, Storage, Authentication. Автор полностью перекладывает ответственность за целостность данных и работоспособность Системы на сервис Google Firebase.",
          "en": "1.8. The system operates on the basis of Google Firebase services: Firestore, Hosting, Storage, Authentication. The Author fully transfers responsibility for the integrity of the data and the operability of the System to the Google Firebase service."
        }
      },
      {
        "type": "h2",
        "text": {
          "ru": "2. Права и обязанности Пользователя",
          "en": "User rights and obligations"
        }
      },
      {
        "type": "p",
        "text": {
          "ru": "2.1. Пользователь принимает на себя полную ответственность за использование Системы.",
          "en": "2.1. The User assumes full responsibility for the use of the System."
        }
      },
      {
        "type": "p",
        "text": {
          "ru": "2.2. Пользователь обязуется не предъявлять автору Системы никаких претензий (юридических, финансовых, административных или иных) в связи с использованием Системы.",
          "en": "2.2. The User undertakes not to make any claims (legal, financial, administrative or other) to the author of the System in connection with the use of the System."
        }
      },
      {
        "type": "p",
        "text": {
          "ru": "2.3. Пользователь принимает на себя полную ответственность за:",
          "en": "2.3. The User assumes full responsibility for:"
        }
      },
      {
        "type": "ul",
        "items": {
          "ru": [
            "Своё здоровье при использовании Системы;",
            "Целостность своего оборудования;",
            "Сохранность своих данных (возможную их утерю, передачу их третьим лицам, изменение или удаление автором системы)."
          ],
          "en": [
            "Your health when using the System;",
            "Integrity of your equipment;",
            "Safety of your data (possible loss, transfer to third parties, modification or deletion by the author of the system)."
          ]
        }
      },
      {
        "type": "p",
        "text": {
          "ru": "2.4. Пользователь обязуется не:",
          "en": "2.4. The User undertakes not to:"
        }
      },
      {
        "type": "ul",
        "items": {
          "ru": [
            "Вредить работоспособности Системы, взламывать или портить Систему;",
            "Изменять, копировать или использовать программный код Системы без разрешения;",
            "Использовать Систему в мошеннических, коммерческих или вредоносных целях;",
            "Вмешиваться в пользовательский опыт других пользователей;",
            "Использовать личные данные других пользователей без их согласия."
          ],
          "en": [
            "Harm the functionality of the System, hack or damage the System;",
            "Change, copy or use the program code of the System without permission;",
            "Use the System for fraudulent, commercial or malicious purposes;",
            "Interfere with the user experience of other users;",
            "Use the personal data of other users without their consent."
          ]
        }
      },
      {
        "type": "p",
        "text": {
          "ru": "2.5. Пользователь может использовать Систему в личных целях исключительно во благо себя и сообщества.",
          "en": "2.5. The User may use the System for personal purposes solely for the benefit of himself and the community."
        }
      },
      {
        "type": "p",
        "text": {
          "ru": "2.6. Пользователь обязуется не причинять вреда (физического, морального, юридического, финансового или иного) Системе, Автору и другим пользователям Системы.",
          "en": "2.6. The User undertakes not to cause harm (physical, moral, legal, financial or other) to the System, the Author and other users of the System."
        }
      },
      {
        "type": "p",
        "text": {
          "ru": "2.7. Пользователь принимает на себя полную ответственность за данные, переданные в систему (Email, Пароль, личные данные учётной записи, личный документ NDim ID и все другие личные данные), и за любой возможный вред, который эти данные могут причинить Системе, Автору, другим пользователям Системы и третьим лицам.",
          "en": "2.7. The User assumes full responsibility for the data transferred to the system (Email, Password, personal account data, personal NDim ID document and all other personal data) and for any possible harm that this data may cause to the System, the Author, other users of the System and third parties."
        }
      },
      {
        "type": "p",
        "text": {
          "ru": "2.8. Принимая данные Условия пользователь обязуется добросовестно соблюдать их в полном объёме. Пользователь также обязуется добросоветсно соблюдать в полном объёме положения документов: \"Политика конфиденциальности\" и \"Отказ от ответственности\".",
          "en": "2.8. By accepting these Terms, the user undertakes to comply with them in good faith and in full. The user also undertakes to comply in good faith and in full with the provisions of the documents: \"Privacy Policy\" and \"Disclaimer\"."
        }
      },
      {
        "type": "p",
        "text": {
          "ru": "2.9. Даже после удаления аккаунта пользователь остаётся обязан соблюдать настоящие Условия использования а также положения документов: \"Политика конфиденциальности\" и \"Отказ от ответственности\".",
          "en": "2.9. Even after deleting an account, the user remains obliged to comply with these Terms of Use as well as the provisions of the documents: \"Privacy Policy\" and \"Disclaimer\"."
        }
      },
      {
        "type": "h2",
        "text": {
          "ru": "3. Права и обязанности автора Системы",
          "en": "Author's rights and obligations"
        }
      },
      {
        "type": "p",
        "text": {
          "ru": "3.1. Автор Системы оставляет за собой полное право:",
          "en": "3.1. The Author of the System reserves the full right:"
        }
      },
      {
        "type": "ul",
        "items": {
          "ru": [
            "Вносить любые изменения в программный код Системы;",
            "Редактировать и удалять любые данные в базах данных Системы;",
            "Иметь полный доступ к пользовательским данным;",
            "Полностью отключать или удалять Систему без объяснения причин."
          ],
          "en": [
            "Make any changes to the program code of the System;",
            "Edit and delete any data in the System databases;",
            "Have full access to user data;",
            "Completely disable or delete the System without explanation."
          ]
        }
      },
      {
        "type": "p",
        "text": {
          "ru": "3.2. Пользователь соглашается, что автор имеет право на все вышеперечисленные действия в одностороннем порядке без предупреждения пользователя.",
          "en": "3.2. The user agrees that the author has the right to all of the above actions unilaterally without warning the user."
        }
      },
      {
        "type": "p",
        "text": {
          "ru": "3.3. Аавтор не имеет доступа к паролям от учётных записей пользователей. Пароли остаются скрыты и защищены от кого бы то ни было.",
          "en": "3.3. The author does not have access to user account passwords. Passwords remain hidden and protected from anyone."
        }
      },
      {
        "type": "p",
        "text": {
          "ru": "3.4. Аавтор обязуется относиться и обращаться с уважением с пользователями Системы, с их учётными записями и личными данными, с Системой и с сервисами Google Firebase для обеспечения доверительной доброжетельной атмосферы в Системе базирующейся на приниципах взаимного уважения, доверия, помощи, поддержки и любви.",
          "en": "3.4. The Author undertakes to treat and deal with respect with the users of the System, with their accounts and personal data, with the System and with Google Firebase services in order to ensure a trusting and friendly atmosphere in the System based on the principles of mutual respect, trust, assistance, support and love."
        }
      },
      {
        "type": "p",
        "text": {
          "ru": "3.5. Управляя системой, развивая её и поддерживая в работоспособном состоянии Автор ставит своей целью обеспечение позитивного пользовательского опыта каждого пользователя Системы, развитие и поддержку взаимного уважения, доверия, помощи, поддержки и любви между пользователями Системы, Автором и всем Человечеством.",
          "en": "3.5. By managing the system, developing it and maintaining it in working condition, the Author aims to ensure a positive user experience for each user of the System, the development and support of mutual respect, trust, help, support and love between the users of the System, the Author and all of Humanity."
        }
      },
      {
        "type": "h2",
        "text": {
          "ru": "4. Безопасность и отказ от ответственности",
          "en": "Security and liability"
        }
      },
      {
        "type": "p",
        "text": {
          "ru": "4.1. Система может содержать ошибки, баги и уязвимости, за последствия (сбои, потери данных, ущерб оборудованию, ущерб здоровью и другие последствия) возникновения которых при использовании Системы пользователем Автор не несёт ответственности.",
          "en": "4.1. The System may contain errors, bugs and vulnerabilities, for the consequences (failures, data loss, damage to equipment, damage to health and other consequences) of which the user uses the System, the Author is not responsible."
        }
      },
      {
        "type": "p",
        "text": {
          "ru": "4.2. Автор не предоставляет никаких гарантий работоспособности и безотказности Системы.",
          "en": "4.2. The Author does not provide any guarantees of the operability and reliability of the System."
        }
      },
      {
        "type": "p",
        "text": {
          "ru": "4.3. Пользователь принимает на себя все возможные риски, связанные с использованием Системы.",
          "en": "4.3. The User assumes all possible risks associated with the use of the System."
        }
      },
      {
        "type": "p",
        "text": {
          "ru": "4.4. Автор не несёт ответственности за работоспособность сервисов Google Firebase, на которых основана Система.",
          "en": "4.4. The Author is not responsible for the functionality of the Google Firebase services on which the System is based."
        }
      },
      {
        "type": "h2",
        "text": {
          "ru": "5. Изменение Условий, Политики и Отказа от ответственности",
          "en": "Changes to Terms, Policy and Disclaimers"
        }
      },
      {
        "type": "p",
        "text": {
          "ru": "5.1. Автор оставляет за собой право изменять положения Условий, Политики и Отказа от ответственности в любое время в любом объёме без уведомления пользователей.",
          "en": "5.1. The author reserves the right to change the provisions of the Terms, Policy and Disclaimer at any time to any extent without notifying users."
        }
      },
      {
        "type": "p",
        "text": {
          "ru": "5.2. Продолжение использования Системы после внесения изменений в Условия, Политику или Отказ от ответственности означает автоматическое согласие пользователя с новой редакцией Условий, Политики и Отказа от ответственности.",
          "en": "5.2. Continued use of the System after changes have been made to the Terms, Policy or Disclaimer shall constitute the user's automatic consent to the new version of the Terms, Policy and Disclaimer."
        }
      },
      {
        "type": "h2",
        "text": {
          "ru": "6. Заключительные положения",
          "en": "Conclusion"
        }
      },
      {
        "type": "p",
        "text": {
          "ru": "6.1. Принимая данные Условия, пользователь также соглашается с Отказом от ответственности и Политикой конфиденциальности, изложенными в отдельных документах.",
          "en": "6.1. By accepting these Terms, the user also agrees to the Disclaimer and Privacy Policy set out in separate documents."
        }
      },
      {
        "type": "p",
        "text": {
          "ru": "6.2. Несоблюдение пользователем положений Условий, Политики и Отказа от ответственности может привести к блокировке или удалению учётной записи пользователя без возможности восстановления.",
          "en": "6.2. Failure by the User to comply with the provisions of the Terms, Policy and Disclaimer may result in the blocking or deletion of the user's account without the possibility of recovery."
        }
      },
      {
        "type": "p",
        "text": {
          "ru": "Дата последнего обновления Условий: 3 Марта 2025 г.",
          "en": "Date of last Terms update: 3 March 2025."
        }
      }
    ]
  },
  "privacy": {
    "slug": "privacy",
    "title": {
      "ru": "Политика конфиденциальности",
      "en": "Privacy Policy"
    },
    "blocks": [
      {
        "type": "h2",
        "text": {
          "ru": "1. Общие положения",
          "en": "General provisions"
        }
      },
      {
        "type": "p",
        "text": {
          "ru": "1.1. Данный документ (далее — Политика) регулирует использование системы \"Пространство NDim\" (англ. \"NDim Space\") (далее — Система) Пользователем (далее — Пользователь) и определяется в одностороннем порядке автором системы Николаем Викторовичем Кривушей (далее — Автор).",
          "en": "1.1. This document (hereinafter referred to as the Policy) regulates the use of the \"NDim Space\" (rus. \"Пространство NDim\") system (hereinafter referred to as the System) by the User (hereinafter referred to as the User) and is determined unilaterally by the author of the system, Mikalai Viktaravich Kryvusha (hereinafter referred to as the Author)."
        }
      },
      {
        "type": "p",
        "text": {
          "ru": "1.2. Пользователь, регистрируясь в Системе, принимает настоящую Политику в полном объёме, обязуется её соблюдать и подтверждает своё полное согласие с положениями настоящей Политики. Факт согласия Пользователя с Политикой фиксируется в документе учётной записи Пользователя флагом \"agreement\": true (\"согласие\": истина).",
          "en": "1.2. By registering in the System, the User accepts this Policy in full, undertakes to comply with it and confirms his/her full agreement with the provisions of this Policy. The fact of the User's consent to the Policy is recorded in the User's account document by the flag \"agreement\": true."
        }
      },
      {
        "type": "p",
        "text": {
          "ru": "1.3. Система работает на базе сервисов Google Firebase: Firestore, Hosting, Storage, Authentication. Автор полностью перекладывает ответственность за целостность и конфиденциальность пользовательских данных и работоспособность Системы на сервис Google Firebase.",
          "en": "1.3. The system operates on the basis of Google Firebase services: Firestore, Hosting, Storage, Authentication. The author fully transfers responsibility for the integrity and confidentiality of user data and the operability of the System to the Google Firebase service."
        }
      },
      {
        "type": "h2",
        "text": {
          "ru": "2. Политика в отношении пользовательских данных",
          "en": "Policy in relation to user data"
        }
      },
      {
        "type": "p",
        "text": {
          "ru": "2.1. Автор Системы не несёт ответственности за конфиденциальность, целостность и сохранность пользовательских данных.",
          "en": "2.1. The Author of the System is not responsible for the confidentiality, integrity and safety of user data."
        }
      },
      {
        "type": "p",
        "text": {
          "ru": "2.2. При необходимости пользовательские данные могут быть переданы третьим лицам, изменены или удалены автором системы без уведомления Пользователя. Необходимость таких действий определяется автором системы в одностороннем порядке.",
          "en": "2.2. If necessary, user data may be transferred to third parties, changed or deleted by the author of the system without notifying users. The necessity of such actions is determined by the author of the system unilaterally."
        }
      },
      {
        "type": "p",
        "text": {
          "ru": "2.3. Адрес электронной почты (Email) Пользователя может быть виден всем Пользователям Системы. Email адреса в Системе являются публичной общедоступной информацией. Для регистрации в Системе используйте Email адрес, которым Вы готовы поделиться публично.",
          "en": "2.3. The User's Email address may be visible to all Users of the System. Email addresses in the System are publicly accessible information. To register in the System, use an Email address that you are willing to share publicly."
        }
      },
      {
        "type": "p",
        "text": {
          "ru": "2.4. Автор системы обязуется относится к учётной записи Пользователя и к его личным данным с уважением и бережностью, заботясь о том, чтобы данные и учётная запись оставались в целостности, сохранности и скрыты от третьих лиц.",
          "en": "2.4. The author of the system undertakes to treat the User's account and his personal data with respect and care, ensuring that the data and account remain intact, safe and hidden from third parties."
        }
      },
      {
        "type": "p",
        "text": {
          "ru": "2.5. Автор Системы не гарантирует работоспособность и безотказность сервисов Google Firebase (на базе которых работает система, и в которых хранятся учётные записи и данные пользователей) и не несёт ответственность за них.",
          "en": "2.5. The Author of the System does not guarantee the functionality and reliability of Google Firebase services (on the basis of which the system operates, and in which user accounts and data are stored) and is not responsible for them."
        }
      },
      {
        "type": "h2",
        "text": {
          "ru": "3. Права и обязанности Пользователя в отношении личных данных",
          "en": "User rights and obligations in relation to personal data"
        }
      },
      {
        "type": "p",
        "text": {
          "ru": "3.1. Пользователь принимает на себя полную ответственность за конфиденциальность и сохранность своих личных данных (включая пароли, адреса электронной почты, личные данные, личный документ NDim ID и все другие личные данные) при использовании Системы.",
          "en": "3.1. The User assumes full responsibility for the confidentiality and security of their personal data (including passwords, email addresses, personal data, personal NDim ID document and all other personal data) when using the System."
        }
      },
      {
        "type": "p",
        "text": {
          "ru": "3.2. Пользователь обязуется хранить в секрете и никому не раскрывать пароль от личной учётной записи.",
          "en": "3.2. The User undertakes to keep secret and not disclose to anyone the password for the personal account."
        }
      },
      {
        "type": "p",
        "text": {
          "ru": "3.3. Пользователь обязуется не предпринимать попыток взлома Системы, попыток несанкциорированного получения данных учётных записей других пользователей Системы, попыток входа в личную учётную запись других пользователей Системы.",
          "en": "3.3. The User undertakes not to attempt to hack the System or to attempt unauthorized acquisition of account data of other users of the System, attempts to log into the personal account of other users of the System."
        }
      },
      {
        "type": "p",
        "text": {
          "ru": "3.4. Пользователь обязуется в случае преднамеренного или намеренного взлома Системы, несанкциорированного получения данных учётных записей других пользователей Системы незамедлительно сообщить об данном факте Автору Системы.",
          "en": "3.4. The User undertakes to immediately notify the Author of the System of this fact in the event of intentional or deliberate hacking of the System or unauthorized acquisition of account data of other users of the System."
        }
      },
      {
        "type": "h2",
        "text": {
          "ru": "4. Заключительные положения",
          "en": "Conclusion"
        }
      },
      {
        "type": "p",
        "text": {
          "ru": "4.1. Пользователь использует Систему на свой страх и риск, и принимает на себя полную ответственность за свои действия в отношении Системы и своих личных данных.",
          "en": "4.1. The User uses the System at his own risk and assumes full responsibility for his actions in relation to the System and his personal data."
        }
      },
      {
        "type": "p",
        "text": {
          "ru": "Дата последнего обновления Политики: 3 Марта 2025 г.",
          "en": "Date of last Policy update: 3 March 2025."
        }
      }
    ]
  },
  "disclaimer": {
    "slug": "disclaimer",
    "title": {
      "ru": "Отказ от ответственности",
      "en": "Disclaimer"
    },
    "blocks": [
      {
        "type": "h2",
        "text": {
          "ru": "1. Общие положения",
          "en": "General provisions"
        }
      },
      {
        "type": "p",
        "text": {
          "ru": "1.1. Данный документ (далее — Отказ от ответственности) регулирует использование системы \"Пространство NDim\" (англ. \"NDim Space\") (далее — Система) Пользователем (далее — Пользователь) и определяется в одностороннем порядке автором системы Николаем Викторовичем Кривушей (далее — Автор).",
          "en": "1.1. This document (hereinafter referred to as the Disclaimer) regulates the use of the \"NDim Space\" (rus. \"Пространство NDim\") system (hereinafter referred to as the System) by the User (hereinafter referred to as the User) and is determined unilaterally by the author of the system, Mikalai Viktaravich Kryvusha (hereinafter referred to as the Author)."
        }
      },
      {
        "type": "p",
        "text": {
          "ru": "1.2. Пользователь, регистрируясь в Системе, принимает настоящий Отказ от ответственности в полном объёме, обязуется его соблюдать и подтверждает своё полное согласие с положениями настоящего Отказа от ответственности. Факт согласия Пользователя с Отказом от ответственности фиксируется в документе учётной записи Пользователя флагом \"agreement\": true (\"согласие\": истина).",
          "en": "1.2. By registering in the System, the User accepts this Disclaimer in full, undertakes to comply with it and confirms his/her full agreement with the provisions of this Disclaimer. The fact of the User's agreement with the Disclaimer is recorded in the User's account document by the flag \"agreement\": true."
        }
      },
      {
        "type": "p",
        "text": {
          "ru": "1.3. Система работает на базе сервисов Google Firebase: Firestore, Hosting, Storage, Authentication. Автор полностью перекладывает ответственность за целостность и конфиденциальность пользовательских данных и работоспособность Системы на сервис Google Firebase.",
          "en": "1.3. The system operates on the basis of Google Firebase services: Firestore, Hosting, Storage, Authentication. The author fully transfers responsibility for the integrity and confidentiality of user data and the operability of the System to the Google Firebase service."
        }
      },
      {
        "type": "h2",
        "text": {
          "ru": "2. Отказ от ответственности за возможный ущерб",
          "en": "Disclaimer for potential damage"
        }
      },
      {
        "type": "p",
        "text": {
          "ru": "2.1. Пользуясь Системой Пользователь принимает всю ответственность и все потенциальные риски на себя.",
          "en": "*(отсутствует в оригинале — в EN-блоке пункта 2.1 продублирован русский текст: «2.1. Пользуясь Системой Пользователь принимает всю ответственность и все потенциальные риски на себя.»)*"
        }
      },
      {
        "type": "p",
        "text": {
          "ru": "2.2. Автор не несёт ответственности за:",
          "en": "2.2. The Author does not assume any responsibility for:"
        }
      },
      {
        "type": "ul",
        "items": {
          "ru": [
            "Целостность и сохранность данных пользователя;",
            "Доступность и работоспособность системы;",
            "Целостность, сохранность и работоспособность оборудования Пользователя;",
            "Целостность и сохранность любой формы здоровья Пользователя (физического, ментального, психического, эмоционального и другого);",
            "Результаты использования Системы Пользователем;",
            "Личные данные и действия других пользователей и потенциальный вред, который они могут нанести Пользователю, Системе, Автору или третьим лицам."
          ],
          "en": [
            "Integrity and safety of user data;",
            "Availability and operability of the system;",
            "Integrity, safety and operability of the User's equipment;",
            "Integrity and safety of any form of health of the User (physical, mental, psychological, emotional and other);",
            "Results of the User's use of the System;",
            "Personal data and actions of other users and the potential harm they may cause to the User, the System, the Author or third parties."
          ]
        }
      },
      {
        "type": "h2",
        "text": {
          "ru": "3. Отказ от ответственности за возможное нарушение авторских прав",
          "en": "Disclaimer for potential infringement of copyright"
        }
      },
      {
        "type": "p",
        "text": {
          "ru": "3.1. Автор не претендует на наличие авторских прав на те объекты интеллектуальной собственности (программный код, изображения, тексты, названия, логотипы, и т.д.), у которых есть свои законные правообладатели.",
          "en": "3.1. The author does not claim copyright on those objects of intellectual property (program code, images, texts, names, logos, etc.) that have their own legal owners."
        }
      },
      {
        "type": "p",
        "text": {
          "ru": "3.2. При возникновении факта нарушения Автором чьих-либо авторских прав, автор приносит свои глубочайшие извенения и обязуется устранить нарушение по мере возможности при обращении к Автору законного правообладателя тего или иного объекта собственности, косательно которого возникло нарушение.",
          "en": "3.2. If the Author violates someone's copyright, the Author offers his deepest apologies and undertakes to eliminate the violation as far as possible by contacting the Author with the legal owner of the property in respect of which the violation occurred."
        }
      },
      {
        "type": "p",
        "text": {
          "ru": "Дата последнего обновления Отказа от ответственности: 3 Марта 2025 г.",
          "en": "Date of last Disclaimer update: 3 March 2025."
        }
      }
    ]
  },
  "history": {
    "slug": "history",
    "title": {
      "ru": "История версий",
      "en": "Version history"
    },
    "blocks": [
      {
        "type": "h2",
        "text": {
          "ru": "История версий",
          "en": "Version history"
        }
      },
      {
        "type": "h3",
        "text": {
          "ru": "Версия 1.5 от 13.05.2026",
          "en": "Version 1.5 from 05/13/2026"
        }
      },
      {
        "type": "ul",
        "items": {
          "ru": [
            "Переезд на дефолтный домен Firebase."
          ],
          "en": [
            "Moving to the default Firebase domain."
          ]
        }
      },
      {
        "type": "h3",
        "text": {
          "ru": "Версия 1.4 от 04.06.2025",
          "en": "Version 1.4 from 06/04/2025"
        }
      },
      {
        "type": "ul",
        "items": {
          "ru": [
            "Добавлены аватары пользователей.",
            "Оптимизация и исправление дефектов.",
            "Пополнение базы данных измерениями."
          ],
          "en": [
            "Added users avatars.",
            "Optimization and bug fixing.",
            "Filling the database with dimensions."
          ]
        }
      },
      {
        "type": "h3",
        "text": {
          "ru": "Версия 1.3.1 от 30.05.2025",
          "en": "Version 1.3.1 from 05/30/2025"
        }
      },
      {
        "type": "ul",
        "items": {
          "ru": [
            "Хотфикс флоу сброса пароля и смены Email. Спасибо Кире за помощь ❤️",
            "Улучшено отображение единиц измерения. Теперь они принимают правильную форму согласно числу.",
            "Добавлена карточка измерения на страницу сообщения об ошибке.",
            "Оптимизация и исправление дефектов.",
            "Пополнение базы данных измерениями."
          ],
          "en": [
            "Hotfixes for the password reset and Email change flows. Thanks Kira for the help ❤️",
            "Improved display of units of measurement. Now they take the correct form according to the number.",
            "Added a dimension card on the error reporting page.",
            "Optimization and bug fixing.",
            "Filling the database with dimensions."
          ]
        }
      },
      {
        "type": "h3",
        "text": {
          "ru": "Версия 1.3 от 28.05.2025",
          "en": "Version 1.3 from 05/28/2025"
        }
      },
      {
        "type": "ul",
        "items": {
          "ru": [
            "UI/UX улучшения во флоу онбординга.",
            "UI/UX улучшения во флоу регистрации и авторизации.",
            "Добавлен модальный диалог для новых пользователей о важности заполнения NDim ID профиля.",
            "Добавлена аналитика рекламной атрибуции.",
            "Оптимизация и исправление дефектов.",
            "Пополнение базы данных измерениями."
          ],
          "en": [
            "UI/UX improvements in the onboarding flow.",
            "UI/UX improvements in the registration and authorization flows.",
            "Added a modal dialog for new users about the importance of filling in the NDim ID profile.",
            "Added advertising attribution analytics.",
            "Optimization and bug fixing.",
            "Filling the database with dimensions."
          ]
        }
      },
      {
        "type": "h3",
        "text": {
          "ru": "Версия 1.2 от 20.05.2025",
          "en": "Version 1.2 from 05/20/2025"
        }
      },
      {
        "type": "ul",
        "items": {
          "ru": [
            "Добавлен флоу онбординга.",
            "Добавлена форма сообщения об ошибке описания измерения.",
            "Пополнение базы данных измерениями."
          ],
          "en": [
            "Added onboarding flow.",
            "Added form for reporting a dimension description misstake.",
            "Filling the database with dimensions."
          ]
        }
      },
      {
        "type": "h3",
        "text": {
          "ru": "Версия 1.1 от 13.05.2025",
          "en": "Version 1.1 from 05/13/2025"
        }
      },
      {
        "type": "ul",
        "items": {
          "ru": [
            "Добавлено Руководство пользователя на страницу приветствия.",
            "Отображение псевдонимов и имён пользователей в карточках связей.",
            "Оптимизация алгоритма хранения измерений в базе данных. Спасибо Виктору за помощь ❤️",
            "Пополнение базы данных измерениями."
          ],
          "en": [
            "Added User Manual on the Welcome page.",
            "Displaying nicknames and user names in relation cards.",
            "Optimization of the algorithm for storing dimensions in the database. Thanks Viktar for the help ❤️",
            "Filling the database with dimensions."
          ]
        }
      },
      {
        "type": "h3",
        "text": {
          "ru": "Версия 1.0 от 05.05.2025",
          "en": "Version 1.0 from 05/05/2025"
        }
      },
      {
        "type": "ul",
        "items": {
          "ru": [
            "Публичный релиз.",
            "Статусы последнего и текущего онлайна в карточках связи.",
            "Улучшение алгоритма поиска измерений.",
            "Оптимизация и исправление дефектов.",
            "Пополнение базы данных измерениями."
          ],
          "en": [
            "Public release.",
            "Last and current online statuses in connection cards.",
            "Improving the dimensions search algorithm.",
            "Optimization and bug fixing.",
            "Filling the database with dimensions."
          ]
        }
      },
      {
        "type": "h3",
        "text": {
          "ru": "Версия 0.8 от 26.04.2025",
          "en": "Version 0.8 from 04/26/2025"
        }
      },
      {
        "type": "ul",
        "items": {
          "ru": [
            "Добавлен рейтинг измерений.",
            "Добавлены инструкции по установке PWA приложения на Apple устройства.",
            "Оптимизация и исправление дефектов.",
            "Пополнение базы данных измерениями."
          ],
          "en": [
            "Added rating of dimensions.",
            "Added instructions for installing the PWA application on Apple devices.",
            "Optimization and bug fixing.",
            "Filling the database with dimensions."
          ]
        }
      },
      {
        "type": "h3",
        "text": {
          "ru": "Версия 0.7 от 19.04.2025",
          "en": "Version 0.7 from 04/19/2025"
        }
      },
      {
        "type": "ul",
        "items": {
          "ru": [
            "Добавлена кнопка установки PWA приложения на устройство.",
            "Добавлен поиск дополнительной информации об измерениях в сети Интернет.",
            "Добавлена форма предложения новых измерений.",
            "Добавлены подсказки с объяснением основных метрик связей (появляется при наведении курсора или тапе по метрике).",
            "Исправление дефектов.",
            "Пополнение базы данных измерениями."
          ],
          "en": [
            "Added button to install the PWA app on the device.",
            "Added search for additional information about dimensions in the Internet.",
            "Added form for suggesting new dimensions.",
            "Added hints with an explanation of the main metrics of relations (appear when hovering or tapping on the metric).",
            "Bugs fixing.",
            "Filling the database with dimensions."
          ]
        }
      },
      {
        "type": "h3",
        "text": {
          "ru": "Версия 0.6 от 29.03.2025",
          "en": "Version 0.6 from 03/29/2025"
        }
      },
      {
        "type": "ul",
        "items": {
          "ru": [
            "Удаление дубликатов измерений.",
            "Исправление дефектов.",
            "Пополнение базы данных измерениями."
          ],
          "en": [
            "Removing duplicates of dimensions.",
            "Bugs fixing.",
            "Filling the database with dimensions."
          ]
        }
      },
      {
        "type": "h3",
        "text": {
          "ru": "Версия 0.5 от 20.03.2025",
          "en": "Version 0.5 from 03/20/2025"
        }
      },
      {
        "type": "ul",
        "items": {
          "ru": [
            "Улучшение алгоритма поиска измерений.",
            "Теги \"Новое\" для новых измерений.",
            "Пополнение базы данных измерениями."
          ],
          "en": [
            "Improving the dimensions search algorithm.",
            "Tags \"New\" for new dimensions.",
            "Filling the database with dimensions."
          ]
        }
      },
      {
        "type": "h3",
        "text": {
          "ru": "Версия 0.4 от 03.03.2025",
          "en": "Version 0.4 from 03/03/2025"
        }
      },
      {
        "type": "ul",
        "items": {
          "ru": [
            "Улучшение алгоритма поиска измерений.",
            "Улучшения и исправления графического интерфейса.",
            "Пополнение базы данных измерениями."
          ],
          "en": [
            "Improving the dimensions search algorithm.",
            "Improvements and bug fixes in the graphical interface.",
            "Filling the database with dimensions."
          ]
        }
      },
      {
        "type": "h3",
        "text": {
          "ru": "Версия 0.3 от 28.02.2025",
          "en": "Version 0.3 from 02/28/2025"
        }
      },
      {
        "type": "ul",
        "items": {
          "ru": [
            "Аналитика.",
            "Подготовка бета версии для бета-тестирования.",
            "Исправление дефектов.",
            "Пополнение базы данных измерениями."
          ],
          "en": [
            "Analytics.",
            "Preparing a beta version for beta-testing.",
            "Bugs fixing.",
            "Filling the database with dimensions."
          ]
        }
      },
      {
        "type": "h3",
        "text": {
          "ru": "Версия 0.2 от 26.02.2025",
          "en": "Version 0.2 from 02/26/2025"
        }
      },
      {
        "type": "ul",
        "items": {
          "ru": [
            "Завершение разработки всего базового функционала.",
            "Пополнение базы данных измерениями."
          ],
          "en": [
            "Completion of development of all basic functionality.",
            "Filling the database with dimensions."
          ]
        }
      },
      {
        "type": "h3",
        "text": {
          "ru": "Версия 0.1 от 19.02.2025",
          "en": "Version 0.1 from 02/19/2025"
        }
      },
      {
        "type": "ul",
        "items": {
          "ru": [
            "Завершение активной фазы разработки базовых функционала и интерфейса.",
            "Заполнение базы данных основными измерениями.",
            "Тестирование во время разработки."
          ],
          "en": [
            "Completion of the active phase of development of basic functionality and interface.",
            "Filling the database with basic dimensions.",
            "Testing during development."
          ]
        }
      }
    ]
  },
  "manual": {
    "slug": "manual",
    "title": {
      "ru": "Руководство пользователя",
      "en": "User Manual"
    },
    "blocks": [
      {
        "type": "h2",
        "text": {
          "ru": "Манифест",
          "en": "Manifest"
        }
      },
      {
        "type": "ul",
        "items": {
          "ru": [
            "Система \"Пространство NDim\" работает бесплатно, и она доступна для всего Человечества везде, где работает Интернет и сервисы Google Firebase;",
            "Пространство NDim предназначено для поиска похожих друг на друга людей по их внутреннему миру, психике, характеру, мировоззрению;",
            "Целями Пространства NDim являются: объединение и сплочение людей по интересам, убеждениям, формам мышления, мировоззрению; распространение на Земле взаимных любви, дружбы, поддержки; построение более дружного, здорового и гармоничного общества;",
            "Пространство NDim созданно и работает по принципу \"для себя и друзей\". Автор пользуется пространством для знакомства с интересными людьми по духу, для поиска родственных душ;",
            "Пространство NDim построено на принципах взаимных любви, уважения, доброжелательности, дружбы, поддержки, благодарности, доверия, честности, точности;",
            "Пространство NDim нацелено на увеличение в мире добра, здоровья, света и любви;",
            "Пространство NDim противостоит лжи, обману, ненависти, вражде, грубости, несправедливости, наглости, глупости, корысти, алчности, невежеству;",
            "Когда Мир, благодаря Пространству NDim, станет более добрым и приятным местом для жизни, тогда можно считать, что Пространство NDim успешно выполнило свою работу."
          ],
          "en": [
            "The NDim Space system works free of charge and it is available to all of Humanity wherever the Internet and Google Firebase services operate;",
            "The NDim Space is designed to find people who are similar to each other in their inner world, psyche, character, and worldview;",
            "The goals of the NDim Space are: unification and consolidation of people by interests, beliefs, forms of thinking, worldview, interests; spreading on Earth mutual love, friendship, support; building a more united, healthy and harmonious society;",
            "The NDim space was created and operates on the principle of \"for yourself and friends\". The Author uses the space to meet interesting people \"in spirit\", to find kindred spirits;",
            "The NDim Space is built on and follows the principles of mutual love, respect, goodwill, friendship, support, gratitude, faith, honesty, accuracy;",
            "The NDim Space aims to increase goodness, health, light and love in the world;",
            "The NDim Space opposes lies, deceit, hatred, hostility, rudeness, injustice, impudence, stupidity, self-interest, greed;",
            "If the world, by virtue of NDim Space, becomes a kinder and more pleasant place to live, then NDim Space has successfully done its job."
          ]
        }
      },
      {
        "type": "h2",
        "text": {
          "ru": "Идея",
          "en": "Idea"
        }
      },
      {
        "type": "p",
        "text": {
          "ru": "Пространство NDim выполняет поиск похожих друг на друга людей при помощи безукоризненной точности и неумолимой строгости математики. Оно одинаково непредвзято по отношению ко всем своим пользователям, невзирая на их пол, расу, цвет кожи, вероисповедание, мировоззрение, убеждения и так далее. Оно не использует субъективизм человеческого взгляда и непредсказуемость систем искусственного интеллекта. Только объективная математика. Единственный субъективный фактор, который присутствует в результатах работы Пространства NDim — это субъективная оценка человека при заполнении им своего NDim ID-профиля.",
          "en": "The NDim space searches for similar people using the impeccable precision and unforgiving rigor of mathematics. It is equally impartial towards all its users, regardless of their gender, race, skin color, religion, worldview, beliefs, etc. It does not use the subjectivity of the human view or the unpredictability of artificial intelligence systems. Only objective mathematics. The only subjective factor that is present in the results of the NDim Space is a person's subjective assessment when filling out their NDim ID-profile."
        }
      },
      {
        "type": "p",
        "text": {
          "ru": "Для понимания идеи, положенной в основу работы Пространства NDim, можно провести следующий мысленный эксперимент. Берём две монеты и измеряем их объективные характеристики: вес, диаметр, толщину, твёрдость материала, химический состав материала. Если окажется, что совокупности измеренных параметров обеих монет очень похожи, то можно с высокой степенью вероятности утверждать, что, если мы бросим одну из монет на керамический пол, то звук, который она издаст, будет похож на звук, который могла бы издать другая монета при падении с такой же силой на тот же пол. То есть, сходство больших совокупностей параметров объектов может предсказывать корреляции с неизмеренными или неучтёнными параметрами этих объектов. Иными словами, если люди похожи по взглядам, интересам и отношениям, то велика вероятность, что они схожи не только в этом, но и в своем образе мышления, внутреннем мироустройстве — в том, какими они являются как мыслящие личности.",
          "en": "To understand the idea behind the NDim Space, we can conduct the following thought experiment. We take two coins and measure their objective characteristics: weight, diameter, thickness, hardness of the material, chemical composition of the material. If it turns out that the sets of measured parameters of both coins are very similar, then we can say with a high degree of probability that if we throw one of the coins onto a ceramic floor, the sound it makes will be similar to the sound that another coin could make if it fell with the same force onto the same floor. That is, the similarity of large sets of parameters of objects can predict correlations with unmeasured or unaccounted for parameters of these objects. In other words, if people are similar in their views, interests, and relationships, then there is a high probability that they are similar not only in this, but also in their way of thinking, their inner world order — in what they are as thinking individuals."
        }
      },
      {
        "type": "p",
        "text": {
          "ru": "Пространство NDim предоставляет инструментарий для описания человека через совокупность его субъективных взглядов и отношений к различным объектам культуры: фильмам, книгам, сериалам, видеоиграм, практикам и так далее. Такие взгляды и отношения в Пространстве NDim называются «измерениями». Пользователь сам составляет своё самоописание, заполняя измерениями анкету, которая в Пространстве NDim называется NDim ID-профилем. Пользователь заполняет свой NDim ID своими субъективными оценками тех или иных объектов культуры, на свой вкус и усмотрение. У каждого пользователя получается своя уникальная совокупность субъективных оценок — свой уникальный NDim ID. Пространство NDim регулярно выполняет математические расчёты, сравнивая все NDim ID пользователей, и каждому из них предоставляет уникальный список наиболее похожих пользователей.",
          "en": "The NDim space provides a toolkit for describing a person through the totality of his subjective views and attitudes towards various cultural objects: films, books, TV series, video games, practices, and so on. Such views and relationships in the NDim Space are called \"dimensions\". The user himself creates his own self-description by filling out a questionnaire with dimensions, which in the NDim Space is called an NDim ID-profile. The user fills out his NDim ID with his subjective assessments of certain cultural objects, according to his taste and discretion. Each user gets his own unique set of subjective assessments — his own unique NDim ID. The NDim Space regularly performs mathematical calculations, comparing all users' NDim IDs, and provides each of them with a unique list of the most similar users."
        }
      },
      {
        "type": "h2",
        "text": {
          "ru": "Терминология",
          "en": "Terminology"
        }
      },
      {
        "type": "p",
        "text": {
          "ru": "Следующая терминология используется в Пространстве NDim:",
          "en": "The following terminology is used in the NDim Space:"
        }
      },
      {
        "type": "ul",
        "items": {
          "ru": [
            "**Измерение** — единица описания личности человека в Пространстве NDim. Cовокупность измерений однозначно описывает личность человека и используется Пространством NDim в операциях сравнения людей между собой с целью поиска похожих друг на друга людей. Измерения представлены различными объектами человеческой культуры: фильмы, книги, телесериалы, видеоигры, практики и так далее. Пользователь может наполнять свой NDim ID профиль измерениями по своему усмотрению, выставляя измерениям оценки по шкале от 0 (нуля) до 10 (десяти).",
            "**NDim ID** — личный документ (профиль) пользователя, в котором хранятся оценки по измерениям, которыми пользователь себя описал. Данные документы пользователей используются Пространством NDim для расчёта похожести пользователей друг на друга.",
            "**Связь** — отношение в Пространстве NDim между двумя пользователями, отображающая в условных процентных единицах меры Общности, Близости и Похожести между двумя пользователями.",
            "**Общность** — мера, измеряемая в условных процентных единицах и отображающая степень того, насколько индивидуальные субъективные самоописания двух пользователей (заданные пользователями в профилях NDim ID) схожи по составу. Иными словами — это то, насколько два пользователя разделяют одни и те же интересы (объекты культуры) и имеют их в своих профилях NDim ID. Чем выше этот показатель, тем выше вероятность того, что Вы и другой человек интересуетесь похожими вещами.",
            "**Близость** — мера, измеряемая в условных процентных единицах и отображающая степень того, насколько индивидуальные субъективные самоописания двух пользователей (заданные пользователями в профилях NDim ID) похожи друг на друга по оценкам, которые пользователи выставили измерениям. Иными словами — это то, насколько два пользователя похожи в своих вкусах и оценках одних и тех же объектов культуры, насколько эти люди \"мыслят и рассуждают\" похожим образом. Чем выше этот показатель, тем выше вероятность того, что Вы и другой человек мыслите одинаково и любите одни и те же вещи.",
            "**Похожесть** — мера, измеряемая в условных процентных единицах и отображающая произведение Общности и Близости между собой. Иными словами — это итоговый интегральный показатель того, насколько два пользователя похожи друг на друга на основании их Общности и Близости. Чем выше этот показатель, тем выше вероятность того, что Вы и другой человек одновременно похожи друг на друга и по составу интересов (\"Какие вещи интересны\") и тем, как Вы мыслите, смотрите на мир и относитесь к тем или иным вещам (\"Насколько интересно и как оцениваю\"). Именно по этому показателю Пространство NDim подыскивает каждому пользователю индивидуальный топ-250 наиболее похожих людей.",
            "**Пространство** — совокупность (набор) некоторых измерений. Обладает размерностью и диаметром. В пространстве объекты (люди) могут находиться в разных местах относительно друг друга, что описывается расстоянием.",
            "**Общее пространство** — пересечение пространств (пересечение множеств) двух пользователей. Это пространство, которое состоит из общих Вам и другому пользователю измерений (которые есть одновременно и Вашем NDim ID и в NDim ID другого пользователя). Пространство NDim может рассчитать связь (похожесть) между пользователями только в том случае, если их общее пространство содержит как минимум одно измерение. Если у двух пользователей нет общих измерений, связь между ними не вычисляется.",
            "**Звёзды** — единицы измерения размеров пространств в рамках Пространства NDim. В звёздах пользователь оценивает измерения, помещаемые в свой NDim ID.",
            "**Размерность** — параметр отображающий количество измерений в данном пространстве.",
            "**Диаметр** — единица измеряемая в звёздах и отображающая максимально возможное расстояние между двумя объектами в данном пространстве. Например, если Вы выставите трём измерениям максимальные оценки в 10 звёзд, а кто-то другой в точно таком же пространстве выставит этим же трём измерениям минимальные оценки в ноль звёзд, то расстояние между этим человеком и Вами будет максимально по всем трём измерениям пространства и будет равно диаметру пространства. Чем больше диаметр пространства какого-либо человека, тем шире кругозор этого человека.",
            "**Расстояние** — единица измеряемая в звёздах и отображающая итоговую интегральную разницу в оценках измерений между двумя пользователями. Иными словами — это то, насколько Вы и другой человек мыслите по-разному и по-разному оцениваете одни и те же вещи. Чем больше расстояние между двумя людьми, тем эти люди сильнее отличаются друг от друга по образу мышления, взглядам на мир и оценкам одних и тех же вещей."
          ],
          "en": [
            "**Dimension** — is a unit of description of a person's personality in the NDim Space. A set of dimensions uniquely describes a person's personality and is used by the NDim Space in operations of comparing people with each other in order to find people who are similar to each other. Dimensions are represented by various objects of human culture: films, books, TV series, video games, practices, and so on. The user can fill their NDim ID profile with dimensions at their own discretion, rating the dimensions on a scale from 0 (zero) to 10 (ten).",
            "**NDim ID** — is a personal document (profile) of a user, which stores assessments of the dimensions by which the user describes themselves. These user documents are used by the NDim Space to calculate the similarity of users to each other.",
            "**Relation** — is a relationship in the NDim Space between two users, displaying in conventional percentage units the measures of Commonality, Proximity and Similarity between two users.",
            "**Commonality** — is a measure, measured in conventional percentage units, that reflects the degree to which the individual subjective self-descriptions of two users (specified by users in NDim ID profiles) are similar in composition. In other words, this is the extent to which two users share the same interests (cultural objects) and have them in their NDim ID profiles. The higher this indicator, the higher the probability that you and the other person are interested in similar things.",
            "**Proximity** — is a measure, measured in conventional percentage units, that reflects the degree to which individual subjective self-descriptions of two users (specified by users in NDim ID profiles) are similar to each other based on the ratings that users have given to the dimensions. In other words, this is how similar two users are in their tastes and ratings of the same cultural objects, how similarly these people think and reason. The higher this indicator, the higher the probability that you and the other person think alike and like the same things.",
            "**Similarity** — is a measure, measured in conventional percentage units, and reflects the product of Commonality and Proximity. In other words, it is the final integral indicator of how similar two users are to each other based on their Commonality and Proximity. The higher this indicator, the higher the probability that you and the other person are similar to each other both in terms of interests (\"Which things are interesting to me\") and in terms of how you think, look at the world and relate to certain things (\"How interesting and how I evaluate\"). It is by this indicator that the NDim Space searches for each user an individual top-250 most similar people.",
            "**Space** — is a set (collection) of some dimensions. It has a dimension and a diameter. In space, objects (people) can be in different places relative to each other, which is described by distance.",
            "**Common space** — the intersection of spaces (intersection of sets) of two users. This is a space that consists of dimensions common to you and another user (dimensions which are both in your NDim ID and in the NDim ID of another user). The NDim Space can calculate the relation (similarity) between users only if their common space contains at least one dimension. If there are no common dimensions, then no relation is calculated for such users.",
            "**Stars** — are units of measurement for the dimensions of spaces within the NDim Space. The user provides ratings to the dimensions placed in their NDim ID in stars.",
            "**Dimension** — is a unit that represents the number of dimensions in a given space. *(так в оригинале: «Размерность» переведена тем же словом Dimension, что и «Измерение»)*",
            "**Diameter** — is a unit measured in stars and representing the maximum possible distance between two objects in a given space. For example, if you give three dimensions the maximum rating of 10 stars, and someone else in exactly the same space gives the same three dimensions the minimum rating of zero stars, then the distance between this person and you will be the maximum in all three dimensions of space and will be equal to the diameter of the space. The greater the diameter of a person's space, the broader their horizons.",
            "**Distance** — is a unit measured in stars and displays the final integral difference in the measurement estimates between two users. In other words, it is how differently you and the other person think and evaluate the same things differently. The greater the distance between two people, the more these people differ from each other in their way of thinking, views on the world, and estimates of the same things."
          ]
        }
      },
      {
        "type": "h2",
        "text": {
          "ru": "Звёзды, или Как выставлять оценки измерениям",
          "en": "Stars or How to Rate Dimensions"
        }
      },
      {
        "type": "p",
        "text": {
          "ru": "Измерения представляют собой те или иные объекты человеческой культуры: фильмы, книги, телесериалы, практики и так далее. Все эти объекты культуры могут иметь в сознании и подсознании человека ту или иную эмоциональную окраску, с которой человек относится к этим вещам. Именно **Ваша субъективная эмоциональная реакция** в полярных терминах **\"нравится - вызывает отвращение\"**, **\"люблю - ненавижу\"**, **\"одобряю - презираю\"**, **\"хочу видеть это каждый день - хочу стереть это из своей памяти\"** должна приниматься Вами во внимание во время выставления Вами оценок измерениям. Вы не должны оценивать объекты культуры по их общепризнанным в обществе достижениям, или по качеству их технического и культурного исполнения, или по оценкам других людей, экспертного сообщества или кого бы то ни было ещё. **Важна именно Ваша субъективная эмоциональная оценка.** Это может быть общепризнанный шедевр, но Вам он не нравится — стоит поставить низкую оценку согласно тому, как Вы чувствуете \"внутри Вашей души\". Или это может быть что-то всеобще презираемое и жёстко критикуемое, но Вам это нравится — стоит поставить высокую оценку по Вашему ощущению. Также стоит иметь в виду, что Ваша оценка должна опираться именно на **эмоции**, а не на рационализм. Важно, чтобы Вы оценивали объекты культуры по тому, насколько они Вам **нравятся** или **не нравятся**, а не по тому, насколько эти объекты культуры технически (или как бы то ни было ещё) качественно или величественно сделаны.",
          "en": "Dimensions are various objects of human culture: films, books, TV series, practices, etc. All these objects of culture can have one or another emotional coloring in the consciousness and subconscious of a person, with which a person relates to these things. It is **Your subjective emotional reaction** in polar terms **\"like - disgust\"**, **\"love - hate\"**, **\"approve - despise\"**, **\"want to see this every day - want to erase this from my memory\"** that should be taken into account by you when you give your rates to dimensions. You should not rate cultural objects by their generally recognized achievements in society, or by the quality of their technical and cultural performance, or by the rates of other people, the expert community, or anyone else. **It is your subjective emotional assessment that is important.** It may be a universally recognized masterpiece, but you do not like it — you should give it a low rating according to how you feel \"inside your soul\". Or it may be something universally despised and harshly criticized, but you like it — you should give it a high rating according to your feeling. It is also worth keeping in mind that your rate should be based on **emotions**, not rationalism. It is important that you evaluate cultural objects according to how much you **like** or **dislike** them, and not according to how technically (or sometlike else) high-quality or majestically these cultural objects are made."
        }
      },
      {
        "type": "h2",
        "text": {
          "ru": "Шкала оценок 0–10",
          "en": "The 0–10 grade scale"
        }
      },
      {
        "type": "p",
        "text": {
          "ru": "В Пространстве NDim существует 11 возможных оценок измерений от 0 (нуля) до 10 (десяти):",
          "en": "In NDim Space there are 11 possible grades for dimensions from 0 (zero) to 10 (ten):"
        }
      },
      {
        "type": "table",
        "head": {
          "ru": [
            "Оценка",
            "Описание"
          ],
          "en": [
            "Grade",
            "Description"
          ]
        },
        "rows": {
          "ru": [
            [
              "0",
              "**Абсолютная безусловная ненависть.** Вам это не просто не нравится, Вы ненавидите это всей своей душой, оно — Ваш враг. Вы хотели бы, чтобы этого никогда не сущестовало в мире и чтобы вы никогда этого не знали. Вызывает в Вас очень сильные негативные эмоции отвращения и ненависти. Вы видите в этом одни сплошные минусы и негативные стороны, и ни одного плюса, и ни одного положительного момента."
            ],
            [
              "1",
              "**Отвращение.** Вам очень сильно это не нравится, Вы это глубоко презираете. Вы хотели бы, чтобы ни Вы, ни кто бы то ни было другой никогда этого не видел. Вызывает в Вас сильные негативные эмоции отвращения и ненависти. Вы видите в этом огромное количество минусов и негативных сторон, Вы можете через силу назвать один или два позитивных момента, и не более."
            ],
            [
              "2",
              "**Глубокая неприязнь.** Вам сильно это не нравится, Вы это глубоко презираете. Вы жалеете, что когда-то с этим столкнулись, и Ваша жизнь была бы лучше без этого знакомства. Вызывает в Вас глубокие негативные эмоции отвращения и негодования. Вы видите в этом очень много минусов и негативных сторон, хотя Вы можете назвать несколько позитивных моментов."
            ],
            [
              "3",
              "**Неприязнь.** Вам это не нравится, Вы смотрите на это с недоумением. Вы думаете, что потраченное на это время можно было бы потратить значительно лучше на что-нибудь другое. Вызывает в Вас негативные эмоции негодования и недоумения. Вы видите в этом много минусов и негативных сторон, Вы можете назвать несколько позитивных моментов, но минусов значительно больше."
            ],
            [
              "4",
              "**Лёгкая неприязнь.** Вам это кажется странным и нелепым, Вы смотрите на это с сомнением. Вы думаете, что это могло бы быть лучше, но оно выглядит не очень хорошо. Вызывает в Вас лёгкие негативные эмоции недоумения. Вы видите в этом много минусов и негативных сторон, но Вы также можете выделить некоторое количество позитивных моментов и плюсов."
            ],
            [
              "5",
              "**Нейтрально.** Вам это кажется \"никаким\", ни хорошим, ни плохим, Вы смотрите на это со смешенными чувствами. Вы думаете, что оно такое, какое есть, со своими достоинствами и недостатками. Не вызывает в Вас ни восторга, ни разочарования. Вы видите в этом как минусы, так и плюсы. Негативные стороны уравновешены позитивными моментами."
            ],
            [
              "6",
              "**Лёгкая симпатия.** Вам это кажется приятным, Вы смотрите на это с лёгким умилением. Вы думаете, что это могло бы быть хуже, но оно выглядит вполне хорошо. Вызывает в Вас лёгкие позитивные эмоции радости. Вы видите в этом значительное количество плюсов, хотя и негативных моментов тоже хватает."
            ],
            [
              "7",
              "**Симпатия.** Вам это нравится, Вы смотрите на это с умилением. Вы думаете, что затраченного времени не жалко, и время точно потрачено не зря. Вызывает в Вас позитивные эмоции радости и уважения. Вы видите в этом много плюсов и положительных сторон, Вы можете назвать несколько негативных моментов, но плюсов значительно больше."
            ],
            [
              "8",
              "**Глубокая симпатия.** Вам это сильно нравится, Вы этим восторгаетесь. Вы рады, что когда-то с этим столкнулись, и Ваша жизнь стала благодаря этому лучше. Вызывает в Вас глубокие позитивные эмоции радости и уважения. Вы видите в этом очень много плюсов и положительных сторон, хотя Вы можете назвать несколько негативных моментов."
            ],
            [
              "9",
              "**Обожание.** Вам это очень сильно нравится, Вы этим глубоко восторгаетесь. Вы хотели бы видеть это часто, и хотели бы чтобы все люди это увидели. Вызывает в Вас сильные позитивные эмоции радости и уважения. Вы видите в этом огромное количество плюсов и положительных сторон, Вы можете назвать лишь один или два негативных момента, и не более."
            ],
            [
              "10",
              "**Абсолютная безусловная любовь.** Вам это не просто нравится, Вы любите это всей своей душой, это одна из лучших вещей, которые случались с Вами в жизни. Вы всегда готовы к этому возвращаться, да хоть каждый день, и Вы бесконечно рады, что это является частью Вашей жизни. Вызывает в Вас очень сильные позитивные эмоции радости и уважения. Вы видите в этом одни сплошные плюсы и положительные стороны, и ни одного минуса, и ни одного негативного момента."
            ]
          ],
          "en": [
            [
              "0",
              "**Absolute unconditional hatred.** You don't just dislike it, you hate it with all your soul, it is your enemy. You wish it never existed in the world and that you never knew about it. It evokes very strong negative emotions of disgust and hatred in you. You see in this only minuses and negative sides, and not a single plus, and not a single positive moment."
            ],
            [
              "1",
              "**Disgust.** You really don't like it, you despise it deeply. You wish that neither you nor anyone else ever saw it. It evokes strong negative emotions of disgust and hatred in you. You see a huge number of minuses and negative aspects in this, you can barely name one or two positive moments, and no more."
            ],
            [
              "2",
              "**Deep dislike.** You strongly dislike it, you deeply despise it. You regret that you ever encountered it, and your life would be better without this acquaintance. It causes in you deep negative emotions of disgust and indignation. You see a lot of downsides and negative aspects to this, although you can name a few positive aspects."
            ],
            [
              "3",
              "**Dislike.** You don't like it, you look at it with bewilderment. You think that the time spent on it could have been spent much better on something else. It causes negative emotions of indignation and bewilderment in you. You see many downsides and negative aspects in this, you can name several positive aspects, but there are significantly more downsides."
            ],
            [
              "4",
              "**Mild dislike.** It seems strange and ridiculous to you, you look at it with doubt. You think it could be better, but the way it is doesn't look very good. It causes mild negative emotions of bewilderment in you. You see many minuses and negative sides in it, but you can also highlight a number of positive moments and pluses."
            ],
            [
              "5",
              "**Neutral.** It seems \"nothing\" to you, neither good nor bad, you look at it with mixed feelings. You think that it is what it is, with its advantages and disadvantages. It does not cause you either delight or disappointment. You see both minuses and pluses in it. The negative aspects are balanced by positive moments."
            ],
            [
              "6",
              "**Mild sympathy.** You find it pleasant, you look at it with slight affection. You think that it could be worse, but it looks quite good. It evokes in you light positive emotions of joy. You see a significant number of advantages in this, although there are also enough negative aspects."
            ],
            [
              "7",
              "**Sympathy.** You like it, you look at it with affection. You think that the time spent is not a pity, and the time was definitely not wasted. It evokes positive emotions of joy and respect in you. You see many advantages and positive sides in this, you can name several negative points, but there are significantly more advantages."
            ],
            [
              "8",
              "**Deep sympathy.** You really like it, you admire it. You are glad that you once encountered it, and your life became better thanks to it. It evokes in you deep positive emotions of joy and respect. You see in it a lot of pluses and positive sides, although you can name several negative points."
            ],
            [
              "9",
              "**Adoration.** You like it very much, you are deeply delighted by it. You would like to see it often, and you would like all people to see it. It evokes in you strong positive emotions of joy and respect. You see in it a huge number of advantages and positive sides, you can name only one or two negative moments, and no more."
            ],
            [
              "10",
              "**Absolute unconditional love.** You don't just like it, you love it with all your soul, it's one of the best things that have ever happened to you in life. You are always ready to return to it, even every day, and you are infinitely glad that it is a part of your life. It evokes very strong positive emotions of joy and respect in you. You see in it only solid pluses and positive sides, and not a single minus, and not a single negative moment."
            ]
          ]
        }
      },
      {
        "type": "h2",
        "text": {
          "ru": "Мысленные эксперименты",
          "en": "Thought experiments"
        }
      },
      {
        "type": "p",
        "text": {
          "ru": "При выставлении оценок полезно производить в уме следующие мысленные эксперименты:",
          "en": "When giving ratings, it is useful to perform the following thought experiments in your mind:"
        }
      },
      {
        "type": "ul",
        "items": {
          "ru": [
            "Представьте, что Вы попали на необитаемый остров. Вы в безопасности, и Ваша жизнь обеспечена ресурсами, но из развлечений (объектов культуры) у Вас с собой только тот, который Вы сейчас оцениваете, и никаких других развлечений на этом острове больше нет. Вы обречены проводить годы на этом острове, имея в своём распоряжении только данный объект культуры. С этой картиной в голове попробуйте дать оценку по 11-балльной шкале Вашей удовлетворённости тем обстоятельством, что именно этот объект культуры будет с Вами на этом пустынном острове. По этой шкале 10 (десять) баллов означают, что Вы безмерно рады, что этот объект культуры здесь с Вами, и готовы проводить с ним свой каждый день. А 0 (ноль) баллов означает, что Вы бесконечно разочарованы тем, что этот объект культуры здесь с Вами, и понимаете, что он Вам абсолютно неинтересен, и Вы к нему не притронетесь.",
            "Представьте, что Вы находитесь на борту самолёта в очень длительном перелёте. Попробуйте оценить, с какой вероятностью по 11-и бальной шкале Вы бы хотели, чтобы именно этот сейчас оцениваемый Вами объект культуры был с Вами во время этого длительного скучного перелёта. По этой шкале 10 (десять) баллов означают, что Вы безмерно рады, что этот объект культуры здесь с Вами, и с огромным удовольствием будете им наслаждаться во время перелёта. А 0 (ноль) баллов означают, что Вы бесконечно разочарованы тем, что этот объект культуры здесь с Вами, и понимаете, что он Вам абсолютно неинтересен, Вы к нему не притронетесь, а будете весь полёт грустно смотреть в иллюминатор.",
            "Представьте, что Вам довелось оказаться в больнице, и Вы вынуждены провести следующий месяц лёжа в больничной палате, проходя длительную процедуру выздоровления. Вообразите, что у Вас под рукой с собой оказался только данный оцениваемый Вами объект культуры, и Вы понимаете, что это Ваше единственное развлечение на ближайщий месяц. Оцените по 11-и бальной шкале насколько Вы рады тому факту, что именно этот объект культуры здесь с Вами и Вы сможете коротать время в его компании. 10 (десять) баллов означают, что вы безмерно рады, что этот объект культуры здесь с Вами, и Вы сможете им наслаждаться каждый день каждую минуту. А 0 (ноль) баллов означают, что Вы бесконечно разочарованы тем, что этот объект культуры здесь с Вами, и понимаете, что он Вам абсолютно неинтересен, Вы к нему не притронетесь, а будете весь месяц скучать и смотреть в окно."
          ],
          "en": [
            "Imagine that you have landed on a desert island. You are safe and your life is provided with resources, but the only entertainment (cultural objects) you have with you is the one that you are currently evaluating, and there are no other entertainments on this island. You are doomed to spend years on this island, having at your disposal only this cultural object. With this picture in your head, try to rate on an 11-point scale your satisfaction with the fact that this cultural object will be with you on this deserted island. On this scale, 10 (ten) points mean that you are immensely happy that this cultural object is here with you, and are ready to spend your every day with it. And 0 (zero) points mean that you are infinitely disappointed that this cultural object is here with you, and you understand that it is absolutely uninteresting to you, and you will not touch it.",
            "Imagine that you are on board an airplane on a very long flight. Try to estimate with what probability on an 11-point scale you would like this particular cultural object that you are currently evaluating to be with you during this long boring flight. On this scale 10 (ten) points mean that you are immensely glad that this cultural object is here with you, and you will enjoy it with great pleasure during the flight. And 0 (zero) points mean that you are infinitely disappointed that this cultural object is here with you, and you understand that it is absolutely uninteresting to you, you will not touch it, but will sadly look out the window the entire flight.",
            "Imagine that you happen to be in a hospital and you are forced to spend the next month lying in a hospital ward, undergoing a long recovery procedure. Imagine that you only have this cultural object that you are evaluating with you, and you understand that this is your only entertainment for the next month. Rate on an 11-point scale how happy you are that this cultural object is here with you and that you will be able to while away the time in its company. 10 (ten) points mean that you are immensely happy that this cultural object is here with you, and you will be able to enjoy it every minute of every day. And 0 (zero) points mean that you are infinitely disappointed that this cultural object is here with you, and you understand that you are absolutely not interested in it, You will not touch it, but will be bored and staring out the window for the whole month."
          ]
        }
      },
      {
        "type": "h2",
        "text": {
          "ru": "Шкала смайликов",
          "en": "The emoji scale"
        }
      },
      {
        "type": "p",
        "text": {
          "ru": "При выставлении оценок удобно ориентироваться на шкалу из цветных смайликов, расположенной под звёздами в карточке измерения:",
          "en": "When giving ratings, it is convenient to use the scale of color emojis located under the stars on the dimension card as a guide:"
        }
      },
      {
        "type": "p",
        "text": {
          "ru": "В центре этой шкалы расположен нейтральный жёлтый смайлик, что соответствует звезде со значением 5 (пять) баллов. Это отражает Ваше безразличное нейтральное отношение к оцениваемому объекту культуры, то есть, он Вас не радует, но и не огорчает. В направлении влево от нейтрального смайлика (в направлении от звезды 5 (пять) балллов к звезде 0 (ноль) баллов) цвет смайликов становится всё более насыщенным красным и выражение их лица всё боллее грустное — это соответствует увеличению Вашего негативного отрицательного отношения к данному объекту культуры. В направлении вправо от нейтрального смайлика (в направлении от звезды 5 (пять) балллов к звезде 10 (десять) баллов) цвет смайликов становится всё более насыщенным зелёным и выражение их лица всё боллее радостное — это соответствует увеличению Вашего позитивного положительного отношения к данному объекту культуры.",
          "en": "In the center of this scale there is a neutral yellow emoji, which corresponds to a star with a value of 5 points. This reflects your indifferent neutral attitude towards the assessed cultural object, that is, it does not make you happy, but does not upset you either. To the left of the neutral emoji (from the star of 5 (five) points to the star of 0 (zero) points) the color of the emojis becomes increasingly saturated red and their facial expressions become increasingly sad — this corresponds to an increase in your negative attitude towards this cultural object. To the right of the neutral emoji (from the star of 5 (five) points to the star of 10 (ten) points) the color of the emojis becomes increasingly saturated green and their facial expressions become increasingly joyful — this corresponds to an increase in your positive attitude towards this cultural object."
        }
      },
      {
        "type": "h2",
        "text": {
          "ru": "Оценивайте «на свежую память»",
          "en": "Rate \"for fresh memory\""
        }
      },
      {
        "type": "p",
        "text": {
          "ru": "Чтобы наиболее точно описать себя в Пространстве NDim при помощи измерений, старайтесь давать оценки тем объектам культуры, с которыми вы взаимодействовали недавно, например, если сегодня вы посмотрели фильм, то \"на свежую память\" и находясь под впечатлением от этого фильма оцените его сегодня же, добавив измерение по этому фильму в Ваш NDim ID. Так вы повышаете точность своих оценок и, соответственно, повышаете точность, с которой Пространство NDim находит похожих на Вас людей.",
          "en": "To describe yourself in the NDim Space most accurately using dimensions, try to rate those cultural objects with which you have interacted recently, for example, if you watched a film today, then \"for fresh memory\" and being under the impression of this film, rate it today by adding a dimension for this film to your NDim ID. This way you increase the accuracy of your evaluations and, accordingly, increase the accuracy with which the NDim Space finds people similar to you."
        }
      },
      {
        "type": "h2",
        "text": {
          "ru": "Полезный совет",
          "en": "Helpful tip"
        }
      },
      {
        "type": "p",
        "text": {
          "ru": "**Полезный совет:** Как правило, люди лучше всего запоминат те вещи, которые им очень нравятся. Из этого следует, что люди склонны чаще добавлять в свои NDim ID измерения по тем объектам культуры, которые им наиболее нравятся, соответственно, выставляя таким измерениям более высокие оценки в диапазоне от 7 (семи) до 10 (десяти) звёзд. Пространство NDim расчитывает связи между пользователями на основании **общего пространства** пользователей. Чтобы повысить шансы того, что ваше NDim ID пространство будет иметь пересечение с пространствами других пользователей, рекомендуется чаще добавлять в Ваш NDim ID измерения по тем объектам культуры, которые Вам нравятся больше всего и которые Вы считаете наиболее важными для Вас. Такая стратегия заполнения Вашего NDim ID также повышает шансы того, что Пространство NDim будет находить для Вас похожих людей, с которыми Вас объединяют позитивные эмоции: симпатия, любовь, радость, восторг, уважение, интерес и так далее.",
          "en": "**Helpful tip:** As a rule, people remember things best when they really like them. It follows that people tend to add more dimensions to their NDim IDs for the cultural objects they like most, accordingly, giving such dimensions higher ratings in the range from 7 (seven) to 10 (ten) stars. The NDim Space calculates relations between users based on the users **common space**. To increase the chances that your NDim ID space will overlap with other users' spaces, it is recommended to add more often to your NDim ID dimensions for those cultural objects which ones do you like the most and which you consider the most important to you. This strategy of filling your NDim ID also increases the chances that the NDim Space will find similar to you people, with whom you share positive emotions: sympathy, love, joy, delight, awe, interest, etc."
        }
      }
    ]
  }
} as const;
