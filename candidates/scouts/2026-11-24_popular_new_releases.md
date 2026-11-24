# Разведка 2026: новинки культуры, которых в каталоге НЕТ

> **Создан:** 2026-08-17 · **Родитель:** заказ владельца в чате 2026-08-17 · **Статус:** разведка
> проведена машиной, список ниже · **Исходящее:** 10 записей уходят кандидатами на вычитку
> владельцу (его заказ: «протестируем контур целиком»).

## Что это и как получено

Заказ владельца дословно: «*проведи интернет разведку новинок популярных, которых у нас нет.
Собери их список названий, тип, год. Затем в следующем чате ты 10 из них оформишь кандидатами,
я вычитаю и попробую одобрить*».

**Источник — Wikidata**, решение владельца В2 = А (интервью №015). Прибор —
`tools/scout-wikidata-candidates.mjs`. Ни одна строка списка не взята из памяти модели: у каждой
записи есть `QID`, который разрешается по ссылке, и число известности — сколько языковых разделов
Википедии о ней написали (`wikibase:sitelinks`, принятая мера известности).

**Дедупликация — числом, а не на глаз** (требование фазы 5 `plans/30`): название нормализуется тем
же нормализатором, что у поиска в продукте (`model/feed.ts` → `normalizeForSearch`, он снимает
регистр, «ё», дефисы и римские цифры), и сверяется с обеими половинами названий всех
5153 наших измерений.

## Числа этой разведки

| Что | Число |
|---|---|
| Найдено новинок 2026 года с известностью ≥ 8 языковых разделов | **190** |
| Из них УЖЕ есть в нашем каталоге | 35 |
| 🆕 **Которых у нас НЕТ** | **155** |
| ⏭ Имя не разрешилось — **сверка не проводилась** | 0 |
| Имя добыто дозапросом (`mul` и заголовки разделов) | 37 |
| 🆕 Отсеяно МИНИМУМОМ ДАТ — переиздания, а не новинки | **202** |
| 🔴 Отсеяно НЕ ВЫШЕДШИХ на 2026-11-24 — класс 1 владельца | **8** |
| 🆕 Сериалов ДОБРАНО через даты сезонов | **12** |

⚠️ **Честные границы этой разведки, чтобы её не переоценили:**
- мера известности — число языковых разделов Википедии, а не касса и не хайп. Свежий релиз может
  быть на вершине сборов и иметь мало разделов: Википедия догоняет медленно;
- порог 8 разделов отсекает малоизвестное, но вместе с ним отсекает и **очень
  свежее** — то, о чём ещё не написали;
- ищутся пять видов (фильм, сериал, видеоигра, книга, альбом). Каталог NDim шире: в нём живут
  «Кошки», «Тишина», «Бег» — понятия, у которых мера известности читается иначе;
- «нет у нас» означает «нет совпадения по нормализованному названию». Объект, лежащий у нас под
  другим названием (перевод, подзаголовок), в этот список попадёт ложно — и это ровно то, что
  ловит вычитка владельцем;
- 🔑 **имя объекта добывается ЦЕПОЧКОЙ** — метка `ru`/`en` → мультиязычная `mul` → заголовок
  раздела Википедии, а не одной меткой. Названия, которые не переводятся (почти все видеоигры:
  Elden Ring, Hollow Knight, Stray), меток `ru`/`en` в Wikidata часто не имеют вовсе;
- 🔴 **строка без разрешимого имени НЕ считается новой** — она вынесена в отдельный раздел ниже.
  «Сверки не было» и «совпадений нет» — разные утверждения, и смешивать их прибор больше не может.

## 🆕 Новинки, которых у нас нет — по убыванию известности

| # | Название (ru) | Title (en) | Вид | Год | Языковых разделов | Wikidata |
|---|---|---|---|---|---|---|
| 1 | Диггер | Digger | Фильм | 2026 | 32 | [`Q129677718`](https://www.wikidata.org/wiki/Q129677718) |
| 2 | Голодные игры: Рассвет жатвы | The Hunger Games: Sunrise on the Reaping | Фильм | 2026 | 29 | [`Q126390739`](https://www.wikidata.org/wiki/Q126390739) |
| 3 | Клэйфейс | — | Фильм | 2026 | 29 | [`Q131460936`](https://www.wikidata.org/wiki/Q131460936) |
| 4 | — | Hytale | Видеоигра | 2026 | 29 | [`Q60187866`](https://www.wikidata.org/wiki/Q60187866) |
| 5 | Хитрый Койот | Coyote vs. Acme | Фильм | 2026 | 28 | [`Q106392679`](https://www.wikidata.org/wiki/Q106392679) |
| 6 | Confessions II | Confessions II | Альбом | 2026 | 27 | [`Q139373325`](https://www.wikidata.org/wiki/Q139373325) |
| 7 | Надежда | Hope | Фильм | 2026 | 26 | [`Q117429496`](https://www.wikidata.org/wiki/Q117429496) |
| 8 | Сердце зверя | Heart of the Beast | Фильм | 2026 | 26 | [`Q131900904`](https://www.wikidata.org/wiki/Q131900904) |
| 9 | Практическая магия 2 | Practical Magic 2 | Фильм | 2026 | 25 | [`Q131901398`](https://www.wikidata.org/wiki/Q131901398) |
| 10 | Зловещие мертвецы: Пекло | Evil Dead Burn | Фильм | 2026 | 25 | [`Q132731331`](https://www.wikidata.org/wiki/Q132731331) |
| 11 | Фонари | Lanterns | Сериал | 2026 | 24 | [`Q110556821`](https://www.wikidata.org/wiki/Q110556821) |
| 12 | Паук-Нуар | Spider-Noir | Сериал | 2026 | 24 | [`Q123956515`](https://www.wikidata.org/wiki/Q123956515) |
| 13 | Тайный дневник Верити | Verity | Фильм | 2026 | 24 | [`Q131523413`](https://www.wikidata.org/wiki/Q131523413) |
| 14 | Ограбление в Лос-Анджелесе | Crime 101 | Фильм | 2026 | 23 | [`Q126394034`](https://www.wikidata.org/wiki/Q126394034) |
| 15 | Наследник | How to Make a Killing | Фильм | 2026 | 23 | [`Q126488898`](https://www.wikidata.org/wiki/Q126488898) |
| 16 | Военная машина | — | Фильм | 2026 | 23 | [`Q130375767`](https://www.wikidata.org/wiki/Q130375767) |
| 17 | Собачьи звёзды | The Dog Stars | Фильм | 2026 | 23 | [`Q132256832`](https://www.wikidata.org/wiki/Q132256832) |
| 18 | Прайм-тайм | Primetime | Фильм | 2026 | 23 | [`Q133273688`](https://www.wikidata.org/wiki/Q133273688) |
| 19 | Petal | Petal | Альбом | 2026 | 22 | [`Q139581033`](https://www.wikidata.org/wiki/Q139581033) |
| 20 | Pragmata | Pragmata | Видеоигра | 2026 | 22 | [`Q96240015`](https://www.wikidata.org/wiki/Q96240015) |
| 21 | Железное лёгкое | Iron Lung | Фильм | 2026 | 21 | [`Q117815027`](https://www.wikidata.org/wiki/Q117815027) |
| 22 | Клара и Солнце | Klara and the Sun | Фильм | 2026 | 21 | [`Q124409386`](https://www.wikidata.org/wiki/Q124409386) |
| 23 | Forza Horizon 6 | Forza Horizon 6 | Видеоигра | 2026 | 21 | [`Q136148940`](https://www.wikidata.org/wiki/Q136148940) |
| 24 | Call of Duty: Modern Warfare 4 | Call of Duty: Modern Warfare 4 | Видеоигра | 2026 | 21 | [`Q139969024`](https://www.wikidata.org/wiki/Q139969024) |
| 25 | Возвращение в Сайлент Хилл | Return to Silent Hill | Фильм | 2026 | 20 | [`Q114771310`](https://www.wikidata.org/wiki/Q114771310) |
| 26 | Грязные деньги | In the Grey | Фильм | 2026 | 20 | [`Q123172835`](https://www.wikidata.org/wiki/Q123172835) |
| 27 | Гренландия 2: Миграция | Greenland 2: Migration | Фильм | 2026 | 20 | [`Q124737605`](https://www.wikidata.org/wiki/Q124737605) |
| 28 | Гражданин-мститель | Citizen Vigilante | Фильм | 2026 | 20 | [`Q132322742`](https://www.wikidata.org/wiki/Q132322742) |
| 29 | Бухта вдов | Widow's Bay | Сериал | 2026 | 20 | [`Q136498700`](https://www.wikidata.org/wiki/Q136498700) |
| 30 | Вне кампуса | Off Campus | Сериал | 2026 | 20 | [`Q138862091`](https://www.wikidata.org/wiki/Q138862091) |
| 31 | Мать Мария | Mother Mary | Фильм | 2026 | 19 | [`Q120735817`](https://www.wikidata.org/wiki/Q120735817) |
| 32 | Животные | Animals | Фильм | 2026 | 19 | [`Q124359083`](https://www.wikidata.org/wiki/Q124359083) |
| 33 | Давление | Pressure | Фильм | 2026 | 19 | [`Q127698549`](https://www.wikidata.org/wiki/Q127698549) |
| 34 | Подростковый секс и смерть в лагере «Миазма» | Teenage Sex and Death at Camp Miasma | Фильм | 2026 | 19 | [`Q134434223`](https://www.wikidata.org/wiki/Q134434223) |
| 35 | You Seem Pretty Sad for a Girl So in Love | You Seem Pretty Sad for a Girl So in Love | Альбом | 2026 | 19 | [`Q138858381`](https://www.wikidata.org/wiki/Q138858381) |
| 36 | — | Wolverine | Видеоигра | 2026 | 18 | [`Q108479474`](https://www.wikidata.org/wiki/Q108479474) |
| 37 | Мятеж | Mutiny | Фильм | 2026 | 18 | [`Q125878994`](https://www.wikidata.org/wiki/Q125878994) |
| 38 | Смерть Робин Гуда | — | Фильм | 2026 | 18 | [`Q125960231`](https://www.wikidata.org/wiki/Q125960231) |
| 39 | — | Tomodachi Life: Living the Dream | Видеоигра | 2026 | 18 | [`Q133567959`](https://www.wikidata.org/wiki/Q133567959) |
| 40 | Стюарт Блум не смог спасти вселенную | Stuart Fails to Save the Universe | Сериал | 2026 | 18 | [`Q138836131`](https://www.wikidata.org/wiki/Q138836131) |
| 41 | Её личный ад | Her Private Hell | Фильм | 2026 | 17 | [`Q134430061`](https://www.wikidata.org/wiki/Q134430061) |
| 42 | Megadeth | Megadeth | Альбом | 2026 | 17 | [`Q136432587`](https://www.wikidata.org/wiki/Q136432587) |
| 43 | Assassin’s Creed Black Flag Resynced | — | Видеоигра | 2026 | 17 | [`Q138589086`](https://www.wikidata.org/wiki/Q138589086) |
| 44 | Молодой Шерлок | Young Sherlock | Сериал | 2026 | 16 | [`Q126194054`](https://www.wikidata.org/wiki/Q126194054) |
| 45 | Жозефина | Josephine | Фильм | 2026 | 16 | [`Q128502486`](https://www.wikidata.org/wiki/Q128502486) |
| 46 | Последний дом | The Last House | Фильм | 2026 | 16 | [`Q129165193`](https://www.wikidata.org/wiki/Q129165193) |
| 47 | Майк, и Ник, и Ник, и Элис | Mike & Nick & Nick & Alice | Фильм | 2026 | 16 | [`Q130240838`](https://www.wikidata.org/wiki/Q130240838) |
| 48 | Отпуск на двоих | People We Meet on Vacation | Фильм | 2026 | 16 | [`Q130581843`](https://www.wikidata.org/wiki/Q130581843) |
| 49 | Служебный роман | Office Romance | Фильм | 2026 | 16 | [`Q133627085`](https://www.wikidata.org/wiki/Q133627085) |
| 50 | Браный услюдок | Bucking Fastard | Фильм | 2026 | 16 | [`Q133833410`](https://www.wikidata.org/wiki/Q133833410) |
| 51 | Arirang | Arirang | Альбом | 2026 | 16 | [`Q137787331`](https://www.wikidata.org/wiki/Q137787331) |
| 52 | Тёмная материя | Dark Matter | Сериал | 2026 | 15 | [`Q114554430`](https://www.wikidata.org/wiki/Q114554430) |
| 53 | Мэйдэй | Mayday | Фильм | 2026 | 15 | [`Q124743667`](https://www.wikidata.org/wiki/Q124743667) |
| 54 | Шары вверх | Balls Up | Фильм | 2026 | 15 | [`Q127688132`](https://www.wikidata.org/wiki/Q127688132) |
| 55 | Reanimal | Reanimal | Видеоигра | 2026 | 15 | [`Q129440575`](https://www.wikidata.org/wiki/Q129440575) |
| 56 | Мэдден | — | Фильм | 2026 | 15 | [`Q129913280`](https://www.wikidata.org/wiki/Q129913280) |
| 57 | Onimusha: Way of the Sword | Onimusha: Way of the Sword | Видеоигра | 2026 | 15 | [`Q131436104`](https://www.wikidata.org/wiki/Q131436104) |
| 58 | — | Pokémon Pokopia | Видеоигра | 2026 | 15 | [`Q136231470`](https://www.wikidata.org/wiki/Q136231470) |
| 59 | Subnautica 2 | Subnautica 2 | Видеоигра | 2026 | 14 | [`Q124464991`](https://www.wikidata.org/wiki/Q124464991) |
| 60 | Я хочу с тобой секса | I Want Your Sex | Фильм | 2026 | 14 | [`Q130646766`](https://www.wikidata.org/wiki/Q130646766) |
| 61 | Опасные отношения | Over Your Dead Body | Фильм | 2026 | 14 | [`Q131290710`](https://www.wikidata.org/wiki/Q131290710) |
| 62 | Галеристка | The Gallerist | Фильм | 2026 | 14 | [`Q131381634`](https://www.wikidata.org/wiki/Q131381634) |
| 63 | Сначала дамы | Ladies First | Фильм | 2026 | 14 | [`Q131760054`](https://www.wikidata.org/wiki/Q131760054) |
| 64 | Возлюбленный | The Beloved | Фильм | 2026 | 14 | [`Q132240260`](https://www.wikidata.org/wiki/Q132240260) |
| 65 | Nioh 3 | Nioh 3 | Видеоигра | 2026 | 14 | [`Q134707677`](https://www.wikidata.org/wiki/Q134707677) |
| 66 | The Romantic | The Romantic | Альбом | 2026 | 14 | [`Q137723274`](https://www.wikidata.org/wiki/Q137723274) |
| 67 | The Boys of Dungeon Lane | The Boys of Dungeon Lane | Альбом | 2026 | 14 | [`Q138801646`](https://www.wikidata.org/wiki/Q138801646) |
| 68 | Silent Hill: Townfall | Silent Hill: Townfall | Видеоигра | 2026 | 13 | [`Q114771189`](https://www.wikidata.org/wiki/Q114771189) |
| 69 | Пиноккио: Раскрепощённый | Pinocchio: Unstrung | Фильм | 2026 | 13 | [`Q124317046`](https://www.wikidata.org/wiki/Q124317046) |
| 70 | Хищный рывок | Thrash | Фильм | 2026 | 13 | [`Q130720030`](https://www.wikidata.org/wiki/Q130720030) |
| 71 | Тенцинг | Tenzing | Фильм | 2026 | 13 | [`Q134386482`](https://www.wikidata.org/wiki/Q134386482) |
| 72 | Lego Batman: Legacy of the Dark Knight | Lego Batman: Legacy of the Dark Knight | Видеоигра | 2026 | 13 | [`Q135909032`](https://www.wikidata.org/wiki/Q135909032) |
| 73 | — | Ace Combat 8: Wings of Theve | Видеоигра | 2026 | 13 | [`Q137363885`](https://www.wikidata.org/wiki/Q137363885) |
| 74 | Foreign Tongues | Foreign Tongues | Альбом | 2026 | 13 | [`Q139556612`](https://www.wikidata.org/wiki/Q139556612) |
| 75 | Bass Persuades | — | Альбом | 2026 | 13 | [`Q141249456`](https://www.wikidata.org/wiki/Q141249456) |
| 76 | Control Resonant | Control Resonant | Видеоигра | 2026 | 12 | [`Q116947317`](https://www.wikidata.org/wiki/Q116947317) |
| 77 | Зараза | Cold Storage | Фильм | 2026 | 12 | [`Q117805784`](https://www.wikidata.org/wiki/Q117805784) |
| 78 | Marathon | Marathon | Видеоигра | 2026 | 12 | [`Q118645622`](https://www.wikidata.org/wiki/Q118645622) |
| 79 | The Blood of Dawnwalker | The Blood of Dawnwalker | Видеоигра | 2026 | 12 | [`Q124296459`](https://www.wikidata.org/wiki/Q124296459) |
| 80 | У Марго проблемы с деньгами | Margo's Got Money Troubles | Сериал | 2026 | 12 | [`Q124468008`](https://www.wikidata.org/wiki/Q124468008) |
| 81 | Блеф | The Bluff | Фильм | 2026 | 12 | [`Q126391409`](https://www.wikidata.org/wiki/Q126391409) |
| 82 | — | Neverness to Everness | Видеоигра | 2026 | 12 | [`Q127507724`](https://www.wikidata.org/wiki/Q127507724) |
| 83 | Обрезка розовых кустов | Rosebush Pruning | Фильм | 2026 | 12 | [`Q130369934`](https://www.wikidata.org/wiki/Q130369934) |
| 84 | Натиск | Onslaught | Фильм | 2026 | 12 | [`Q131451703`](https://www.wikidata.org/wiki/Q131451703) |
| 85 | Kiss All the Time. Disco, Occasionally. | Kiss All the Time. Disco, Occasionally. | Альбом | 2026 | 12 | [`Q137789004`](https://www.wikidata.org/wiki/Q137789004) |
| 86 | — | Daughter from Hell | Альбом | 2026 | 12 | [`Q139753645`](https://www.wikidata.org/wiki/Q139753645) |
| 87 | — | Prima | Альбом | 2026 | 12 | [`Q141275299`](https://www.wikidata.org/wiki/Q141275299) |
| 88 | Это хит! | Power Ballad | Фильм | 2026 | 11 | [`Q126285100`](https://www.wikidata.org/wiki/Q126285100) |
| 89 | Зловещий свист | Whistle | Фильм | 2026 | 11 | [`Q126285101`](https://www.wikidata.org/wiki/Q126285101) |
| 90 | Вверх по волшебному дереву | The Magic Faraway Tree | Фильм | 2026 | 11 | [`Q126930033`](https://www.wikidata.org/wiki/Q126930033) |
| 91 | Heroes of Might and Magic: Olden Era | Heroes of Might and Magic: Olden Era | Видеоигра | 2026 | 11 | [`Q129583132`](https://www.wikidata.org/wiki/Q129583132) |
| 92 | Смертельно прекрасна | Pretty Lethal | Фильм | 2026 | 11 | [`Q129941081`](https://www.wikidata.org/wiki/Q129941081) |
| 93 | Humint (фильм, 2026) | Humint | Фильм | 2026 | 11 | [`Q131466792`](https://www.wikidata.org/wiki/Q131466792) |
| 94 | — | The Art of Sarah | Сериал | 2026 | 11 | [`Q131844525`](https://www.wikidata.org/wiki/Q131844525) |
| 95 | Matchbox. Фильм | Matchbox: The Movie | Фильм | 2026 | 11 | [`Q131872896`](https://www.wikidata.org/wiki/Q131872896) |
| 96 | Resonance: A Plague Tale Legacy | Resonance: A Plague Tale Legacy | Видеоигра | 2026 | 11 | [`Q134739548`](https://www.wikidata.org/wiki/Q134739548) |
| 97 | Splatoon Raiders | Splatoon Raiders | Видеоигра | 2026 | 11 | [`Q134822854`](https://www.wikidata.org/wiki/Q134822854) |
| 98 | Yoshi and the Mysterious Book | Yoshi and the Mysterious Book | Видеоигра | 2026 | 11 | [`Q136231548`](https://www.wikidata.org/wiki/Q136231548) |
| 99 | — | The Mountain | Альбом | 2026 | 11 | [`Q136231641`](https://www.wikidata.org/wiki/Q136231641) |
| 100 | God of War Sons of Sparta | God of War Sons of Sparta | Видеоигра | 2026 | 11 | [`Q138241917`](https://www.wikidata.org/wiki/Q138241917) |
| 101 | — | Wikigacha | Видеоигра | 2026 | 11 | [`Q138574242`](https://www.wikidata.org/wiki/Q138574242) |
| 102 | Star Fox | Star Fox | Видеоигра | 2026 | 11 | [`Q139683849`](https://www.wikidata.org/wiki/Q139683849) |
| 103 | Meccha Chameleon | Meccha Chameleon | Видеоигра | 2026 | 11 | [`Q140221884`](https://www.wikidata.org/wiki/Q140221884) |
| 104 | Врата серебряного ключа | Through the Gates of the Silver Key | Книга | 2026 | 11 | [`Q7798461`](https://www.wikidata.org/wiki/Q7798461) |
| 105 | Paralives | Paralives | Видеоигра | 2026 | 11 | [`Q98545425`](https://www.wikidata.org/wiki/Q98545425) |
| 106 | — | Arknights: Endfield | Видеоигра | 2026 | 10 | [`Q112049342`](https://www.wikidata.org/wiki/Q112049342) |
| 107 | Phantom Blade Zero | Phantom Blade Zero | Видеоигра | 2026 | 10 | [`Q118645482`](https://www.wikidata.org/wiki/Q118645482) |
| 108 | — | The Strangers – Chapter 3 | Фильм | 2026 | 10 | [`Q122396992`](https://www.wikidata.org/wiki/Q122396992) |
| 109 | Крушение рейса | Deep Water | Фильм | 2026 | 10 | [`Q124526427`](https://www.wikidata.org/wiki/Q124526427) |
| 110 | — | Pavane: For A Dead Princess | Фильм | 2026 | 10 | [`Q126957220`](https://www.wikidata.org/wiki/Q126957220) |
| 111 | — | Saros | Видеоигра | 2026 | 10 | [`Q132258586`](https://www.wikidata.org/wiki/Q132258586) |
| 112 | Владимир (телесериал) | Vladimir | Сериал | 2026 | 10 | [`Q135261486`](https://www.wikidata.org/wiki/Q135261486) |
| 113 | Castlevania: Belmont’s Curse | — | Видеоигра | 2026 | 10 | [`Q138242796`](https://www.wikidata.org/wiki/Q138242796) |
| 114 | Mewgenics | Mewgenics | Видеоигра | 2026 | 9 | [`Q116030507`](https://www.wikidata.org/wiki/Q116030507) |
| 115 | В мгновение ока (будущий фильм) | In the Blink of an Eye | Фильм | 2026 | 9 | [`Q117443229`](https://www.wikidata.org/wiki/Q117443229) |
| 116 | Gears of War: E-Day | Gears of War: E-Day | Видеоигра | 2026 | 9 | [`Q125341011`](https://www.wikidata.org/wiki/Q125341011) |
| 117 | Mouse: P.I. for Hire | Mouse: P.I. for Hire | Видеоигра | 2026 | 9 | [`Q125420041`](https://www.wikidata.org/wiki/Q125420041) |
| 118 | — | Mixtape | Видеоигра | 2026 | 9 | [`Q126477358`](https://www.wikidata.org/wiki/Q126477358) |
| 119 | Психопатка | Victorian Psycho | Фильм | 2026 | 9 | [`Q130751977`](https://www.wikidata.org/wiki/Q130751977) |
| 120 | — | I Love Boosters | Фильм | 2026 | 9 | [`Q131109043`](https://www.wikidata.org/wiki/Q131109043) |
| 121 | Соулм8йт | Soulm8te | Фильм | 2026 | 9 | [`Q131144615`](https://www.wikidata.org/wiki/Q131144615) |
| 122 | В поисках Эмили | Finding Emily | Фильм | 2026 | 9 | [`Q131737274`](https://www.wikidata.org/wiki/Q131737274) |
| 123 | Transport Fever 3 | Transport Fever 3 | Видеоигра | 2026 | 9 | [`Q134532075`](https://www.wikidata.org/wiki/Q134532075) |
| 124 | Beast of Reincarnation | Beast of Reincarnation | Видеоигра | 2026 | 9 | [`Q134739750`](https://www.wikidata.org/wiki/Q134739750) |
| 125 | — | Mario Tennis Fever | Видеоигра | 2026 | 9 | [`Q136231667`](https://www.wikidata.org/wiki/Q136231667) |
| 126 | Locket | Locket | Альбом | 2026 | 9 | [`Q136563160`](https://www.wikidata.org/wiki/Q136563160) |
| 127 | Empty Hands | Empty Hands | Альбом | 2026 | 9 | [`Q136771106`](https://www.wikidata.org/wiki/Q136771106) |
| 128 | Star Wars: Galactic Racer | Star Wars: Galactic Racer | Видеоигра | 2026 | 9 | [`Q137363888`](https://www.wikidata.org/wiki/Q137363888) |
| 129 | Highguard | Highguard | Видеоигра | 2026 | 9 | [`Q137363920`](https://www.wikidata.org/wiki/Q137363920) |
| 130 | Life Is Strange: Reunion | Life Is Strange: Reunion | Видеоигра | 2026 | 9 | [`Q137796923`](https://www.wikidata.org/wiki/Q137796923) |
| 131 | — | Long Long Road | Альбом | 2026 | 9 | [`Q138662978`](https://www.wikidata.org/wiki/Q138662978) |
| 132 | — | The Wow! Signal | Альбом | 2026 | 9 | [`Q138744261`](https://www.wikidata.org/wiki/Q138744261) |
| 133 | Sanctuary (альбом Evanescence) | Sanctuary | Альбом | 2026 | 9 | [`Q139553029`](https://www.wikidata.org/wiki/Q139553029) |
| 134 | SPLAT! | Splat! | Альбом | 2026 | 9 | [`Q139708521`](https://www.wikidata.org/wiki/Q139708521) |
| 135 | — | FIFA World Cup 2026 Official Album | Альбом | 2026 | 9 | [`Q139886481`](https://www.wikidata.org/wiki/Q139886481) |
| 136 | Grand Theft Auto VI: The Album | Grand Theft Auto VI: The Album | Альбом | 2026 | 9 | [`Q141489183`](https://www.wikidata.org/wiki/Q141489183) |
| 137 | Gothic Remake | Gothic Remake | Видеоигра | 2026 | 8 | [`Q102219949`](https://www.wikidata.org/wiki/Q102219949) |
| 138 | Ночной бизнес | The Get Out | Фильм | 2026 | 8 | [`Q126374606`](https://www.wikidata.org/wiki/Q126374606) |
| 139 | — | Border 2 | Фильм | 2026 | 8 | [`Q126734387`](https://www.wikidata.org/wiki/Q126734387) |
| 140 | У моря (фильм, 2025) | At the Sea | Фильм | 2026 | 8 | [`Q127163233`](https://www.wikidata.org/wiki/Q127163233) |
| 141 | На грани войны | The Brink of War | Фильм | 2026 | 8 | [`Q130537578`](https://www.wikidata.org/wiki/Q130537578) |
| 142 | Дитя ночи | Nightborn | Фильм | 2026 | 8 | [`Q131372717`](https://www.wikidata.org/wiki/Q131372717) |
| 143 | — | Mardaani 3 | Фильм | 2026 | 8 | [`Q131763755`](https://www.wikidata.org/wiki/Q131763755) |
| 144 | — | The Mongoose | Фильм | 2026 | 8 | [`Q132240256`](https://www.wikidata.org/wiki/Q132240256) |
| 145 | Джек Райан: Призрачная война | Jack Ryan: Ghost War | Фильм | 2026 | 8 | [`Q132264365`](https://www.wikidata.org/wiki/Q132264365) |
| 146 | Pokémon Champions | Pokémon Champions | Видеоигра | 2026 | 8 | [`Q132798308`](https://www.wikidata.org/wiki/Q132798308) |
| 147 | Styx: Blades of Greed | Styx: Blades of Greed | Видеоигра | 2026 | 8 | [`Q133100790`](https://www.wikidata.org/wiki/Q133100790) |
| 148 | Invincible VS | Invincible VS | Видеоигра | 2026 | 8 | [`Q134739918`](https://www.wikidata.org/wiki/Q134739918) |
| 149 | Fire Emblem: Fortune’s Weave | — | Видеоигра | 2026 | 8 | [`Q136231263`](https://www.wikidata.org/wiki/Q136231263) |
| 150 | Dirty Blonde | Dirty Blonde: The Visual Album | Альбом | 2026 | 8 | [`Q138298291`](https://www.wikidata.org/wiki/Q138298291) |
| 151 | — | Your Favorite Toy | Альбом | 2026 | 8 | [`Q138350082`](https://www.wikidata.org/wiki/Q138350082) |
| 152 | Worst Girl in America | Worst Girl in America | Альбом | 2026 | 8 | [`Q138641788`](https://www.wikidata.org/wiki/Q138641788) |
| 153 | — | Minecraft Dungeons II | Видеоигра | 2026 | 8 | [`Q138753472`](https://www.wikidata.org/wiki/Q138753472) |
| 154 | World of Warcraft: Forever | World of Warcraft: Forever | Видеоигра | 2026 | 8 | [`Q141440705`](https://www.wikidata.org/wiki/Q141440705) |
| 155 | — | Carnaval de Luz | Альбом | 2026 | 8 | [`Q141556262`](https://www.wikidata.org/wiki/Q141556262) |

## ⏭ Строки без разрешимого имени

Ни одной: у всех найденных объектов имя добылось. Пустой раздел — это ОТВЕТ, а не отсутствие
проверки.

## Что дальше

Владелец возьмёт **10 записей** отсюда, агент оформит их кандидатами, владелец вычитает и попробует
одобрить — сквозная проверка контура «агент предлагает → владелец судит» (фаза 6 эпика `ideas/29`).
⛔ Прибор в каталог НЕ ПИШЕТ ничего: инвариант В3 = А — агент никогда не заводит измерение без
вычитки владельцем.
