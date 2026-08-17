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
5111 наших измерений.

## Числа этой разведки

| Что | Число |
|---|---|
| Найдено новинок 2026 года с известностью ≥ 12 языковых разделов | **200** |
| Из них УЖЕ есть в нашем каталоге | 25 |
| 🆕 **Которых у нас НЕТ** | **175** |

⚠️ **Честные границы этой разведки, чтобы её не переоценили:**
- мера известности — число языковых разделов Википедии, а не касса и не хайп. Свежий релиз может
  быть на вершине сборов и иметь мало разделов: Википедия догоняет медленно;
- порог 12 разделов отсекает малоизвестное, но вместе с ним отсекает и **очень
  свежее** — то, о чём ещё не написали;
- ищутся пять видов (фильм, сериал, видеоигра, книга, альбом). Каталог NDim шире: в нём живут
  «Кошки», «Тишина», «Бег» — понятия, у которых мера известности читается иначе;
- «нет у нас» означает «нет совпадения по нормализованному названию». Объект, лежащий у нас под
  другим названием (перевод, подзаголовок), в этот список попадёт ложно — и это ровно то, что
  ловит вычитка владельцем.

## 🆕 Новинки, которых у нас нет — по убыванию известности

| # | Название (ru) | Title (en) | Вид | Год | Языковых разделов | Wikidata |
|---|---|---|---|---|---|---|
| 1 | Одиссея | The Odyssey | Фильм | 2026 | 61 | [`Q131547207`](https://www.wikidata.org/wiki/Q131547207) |
| 2 | Человек-паук: Новый день | Spider-Man: Brand New Day | Фильм | 2026 | 49 | [`Q113244935`](https://www.wikidata.org/wiki/Q113244935) |
| 3 | Проект «Конец света» | Project Hail Mary | Фильм | 2026 | 46 | [`Q107105860`](https://www.wikidata.org/wiki/Q107105860) |
| 4 | Майкл | Michael | Фильм | 2026 | 46 | [`Q116677364`](https://www.wikidata.org/wiki/Q116677364) |
| 5 | — | — | Видеоигра | 2026 | 46 | [`Q64826862`](https://www.wikidata.org/wiki/Q64826862) |
| 6 | Обсессия | Obsession | Фильм | 2026 | 45 | [`Q136163067`](https://www.wikidata.org/wiki/Q136163067) |
| 7 | Закулисье реальности | Backrooms | Фильм | 2026 | 40 | [`Q125131076`](https://www.wikidata.org/wiki/Q125131076) |
| 8 | Хамнет | Hamnet | Фильм | 2026 | 39 | [`Q122741016`](https://www.wikidata.org/wiki/Q122741016) |
| 9 | Сентиментальная ценность | Sentimental Value | Фильм | 2026 | 39 | [`Q130284179`](https://www.wikidata.org/wiki/Q130284179) |
| 10 | День разоблачения | Disclosure Day | Фильм | 2026 | 38 | [`Q126683577`](https://www.wikidata.org/wiki/Q126683577) |
| 11 | — | — | Видеоигра | 2026 | 38 | [`Q29300592`](https://www.wikidata.org/wiki/Q29300592) |
| 12 | Кобра | Cobra | Фильм | 2026 | 38 | [`Q637290`](https://www.wikidata.org/wiki/Q637290) |
| 13 | — | — | Видеоигра | 2026 | 37 | [`Q58045522`](https://www.wikidata.org/wiki/Q58045522) |
| 14 | Дьявол носит Prada 2 | The Devil Wears Prada 2 | Фильм | 2026 | 36 | [`Q134611972`](https://www.wikidata.org/wiki/Q134611972) |
| 15 | Марти Великолепный | Marty Supreme | Фильм | 2026 | 34 | [`Q130118681`](https://www.wikidata.org/wiki/Q130118681) |
| 16 | Мандалорец и Грогу | The Mandalorian and Grogu | Фильм | 2026 | 33 | [`Q124246549`](https://www.wikidata.org/wiki/Q124246549) |
| 17 | 28 лет спустя: Храм костей | 28 Years Later: The Bone Temple | Фильм | 2026 | 33 | [`Q129423731`](https://www.wikidata.org/wiki/Q129423731) |
| 18 | Простая случайность | It Was Just an Accident | Фильм | 2026 | 33 | [`Q133866932`](https://www.wikidata.org/wiki/Q133866932) |
| 19 | Властелины Вселенной | Masters of the Universe | Фильм | 2026 | 31 | [`Q112040381`](https://www.wikidata.org/wiki/Q112040381) |
| 20 | Крик 7 | Scream 7 | Фильм | 2026 | 31 | [`Q124758309`](https://www.wikidata.org/wiki/Q124758309) |
| 21 | Горничная | The Housemaid | Фильм | 2026 | 30 | [`Q131630491`](https://www.wikidata.org/wiki/Q131630491) |
| 22 | Господин Никто против Путина | Mr. Nobody Against Putin | Фильм | 2026 | 30 | [`Q131976228`](https://www.wikidata.org/wiki/Q131976228) |
| 23 | Невеста | The Bride! | Фильм | 2026 | 29 | [`Q124735657`](https://www.wikidata.org/wiki/Q124735657) |
| 24 | Вот это драма! | The Drama | Фильм | 2026 | 29 | [`Q130590402`](https://www.wikidata.org/wiki/Q130590402) |
| 25 | На помощь! | Send Help | Фильм | 2026 | 29 | [`Q132200341`](https://www.wikidata.org/wiki/Q132200341) |
| 26 | — | Hytale | Видеоигра | 2026 | 29 | [`Q60187866`](https://www.wikidata.org/wiki/Q60187866) |
| 27 | Нюрнберг | Nuremberg | Фильм | 2026 | 27 | [`Q124393313`](https://www.wikidata.org/wiki/Q124393313) |
| 28 | — | — | Видеоигра | 2026 | 27 | [`Q124983920`](https://www.wikidata.org/wiki/Q124983920) |
| 29 | Следствие ведут овечки | The Sheep Detectives | Фильм | 2026 | 27 | [`Q126405648`](https://www.wikidata.org/wiki/Q126405648) |
| 30 | Голос Хинд Раджаб | The Voice of Hind Rajab | Фильм | 2026 | 27 | [`Q135038882`](https://www.wikidata.org/wiki/Q135038882) |
| 31 | — | Stray | Видеоигра | 2026 | 27 | [`Q96247255`](https://www.wikidata.org/wiki/Q96247255) |
| 32 | Казнить нельзя помиловать | Mercy | Фильм | 2026 | 26 | [`Q124566659`](https://www.wikidata.org/wiki/Q124566659) |
| 33 | На краю Оук-стрит | The End of Oak Street | Фильм | 2026 | 26 | [`Q124804916`](https://www.wikidata.org/wiki/Q124804916) |
| 34 | Метод исключения | No Other Choice | Фильм | 2026 | 26 | [`Q129906152`](https://www.wikidata.org/wiki/Q129906152) |
| 35 | Фьорд | Fjord | Фильм | 2026 | 26 | [`Q137652478`](https://www.wikidata.org/wiki/Q137652478) |
| 36 | — | — | Альбом | 2026 | 26 | [`Q139373325`](https://www.wikidata.org/wiki/Q139373325) |
| 37 | Умри, моя любовь | Die My Love | Фильм | 2026 | 25 | [`Q117745793`](https://www.wikidata.org/wiki/Q117745793) |
| 38 | Новая волна (фильм, 2025) | Nouvelle Vague | Фильм | 2026 | 25 | [`Q125867250`](https://www.wikidata.org/wiki/Q125867250) |
| 39 | Никто не узнает | Nobody Knows | Фильм | 2026 | 25 | [`Q612298`](https://www.wikidata.org/wiki/Q612298) |
| 40 | Лакомый кусок | The Rip | Фильм | 2026 | 24 | [`Q131189949`](https://www.wikidata.org/wiki/Q131189949) |
| 41 | Зловещие мертвецы: Пекло | Evil Dead Burn | Фильм | 2026 | 24 | [`Q132731331`](https://www.wikidata.org/wiki/Q132731331) |
| 42 | — | — | Видеоигра | 2026 | 23 | [`Q117750031`](https://www.wikidata.org/wiki/Q117750031) |
| 43 | Ограбление в Лос-Анджелесе | Crime 101 | Фильм | 2026 | 23 | [`Q126394034`](https://www.wikidata.org/wiki/Q126394034) |
| 44 | — | — | Видеоигра | 2026 | 22 | [`Q102290641`](https://www.wikidata.org/wiki/Q102290641) |
| 45 | Отец, мать, сестра, брат | Father Mother Sister Brother | Фильм | 2026 | 22 | [`Q124364048`](https://www.wikidata.org/wiki/Q124364048) |
| 46 | Седло | Pillion | Фильм | 2026 | 22 | [`Q125975336`](https://www.wikidata.org/wiki/Q125975336) |
| 47 | Приглашение | The Invite | Фильм | 2026 | 22 | [`Q134083296`](https://www.wikidata.org/wiki/Q134083296) |
| 48 | Каратель: Последнее убийство | The Punisher: One Last Kill | Фильм | 2026 | 22 | [`Q135411818`](https://www.wikidata.org/wiki/Q135411818) |
| 49 | Octopath Traveler | Octopath Traveler | Видеоигра | 2026 | 22 | [`Q40887608`](https://www.wikidata.org/wiki/Q40887608) |
| 50 | Наследник | How to Make a Killing | Фильм | 2026 | 21 | [`Q126488898`](https://www.wikidata.org/wiki/Q126488898) |
| 51 | Военная машина | War Machine | Фильм | 2026 | 21 | [`Q130375767`](https://www.wikidata.org/wiki/Q130375767) |
| 52 | — | — | Видеоигра | 2026 | 21 | [`Q85979990`](https://www.wikidata.org/wiki/Q85979990) |
| 53 | — | — | Видеоигра | 2026 | 21 | [`Q96240015`](https://www.wikidata.org/wiki/Q96240015) |
| 54 | Я бы тебя пнула, если бы могла | If I Had Legs I'd Kick You | Фильм | 2026 | 20 | [`Q124450734`](https://www.wikidata.org/wiki/Q124450734) |
| 55 | Гренландия 2: Миграция | Greenland 2: Migration | Фильм | 2026 | 20 | [`Q124737605`](https://www.wikidata.org/wiki/Q124737605) |
| 56 | Мелодия их мечты | Song Sung Blue | Фильм | 2026 | 20 | [`Q130532687`](https://www.wikidata.org/wiki/Q130532687) |
| 57 | Завет Анны Ли | The Testament of Ann Lee | Фильм | 2026 | 20 | [`Q131441164`](https://www.wikidata.org/wiki/Q131441164) |
| 58 | Звук падения | Sound of Falling | Фильм | 2026 | 20 | [`Q133848181`](https://www.wikidata.org/wiki/Q133848181) |
| 59 | Я иду искать 2 | Ready or Not 2: Here I Come | Фильм | 2026 | 20 | [`Q134054683`](https://www.wikidata.org/wiki/Q134054683) |
| 60 | Выход 8 | Exit 8 | Фильм | 2026 | 20 | [`Q134480207`](https://www.wikidata.org/wiki/Q134480207) |
| 61 | Я ругаюсь | I Swear | Фильм | 2026 | 20 | [`Q135321335`](https://www.wikidata.org/wiki/Q135321335) |
| 62 | — | — | Видеоигра | 2026 | 20 | [`Q136148940`](https://www.wikidata.org/wiki/Q136148940) |
| 63 | Железное лёгкое | Iron Lung | Фильм | 2026 | 19 | [`Q117815027`](https://www.wikidata.org/wiki/Q117815027) |
| 64 | Грязные деньги | In the Grey | Фильм | 2026 | 19 | [`Q123172835`](https://www.wikidata.org/wiki/Q123172835) |
| 65 | Удачи, веселья, не сдохни | Good Luck, Have Fun, Don't Die | Фильм | 2026 | 19 | [`Q125843356`](https://www.wikidata.org/wiki/Q125843356) |
| 66 | Гений | The Mastermind | Фильм | 2026 | 19 | [`Q130569520`](https://www.wikidata.org/wiki/Q130569520) |
| 67 | — | — | Видеоигра | 2026 | 19 | [`Q131436199`](https://www.wikidata.org/wiki/Q131436199) |
| 68 | — | Melania | Фильм | 2026 | 19 | [`Q137441669`](https://www.wikidata.org/wiki/Q137441669) |
| 69 | You Seem Pretty Sad for a Girl So in Love | You Seem Pretty Sad for a Girl So in Love | Альбом | 2026 | 19 | [`Q138858381`](https://www.wikidata.org/wiki/Q138858381) |
| 70 | Возвращение в Сайлент Хилл | Return to Silent Hill | Фильм | 2026 | 18 | [`Q114771310`](https://www.wikidata.org/wiki/Q114771310) |
| 71 | История звука | The History of Sound | Фильм | 2026 | 18 | [`Q118765520`](https://www.wikidata.org/wiki/Q118765520) |
| 72 | Семья в аренду | Rental Family | Фильм | 2026 | 18 | [`Q124947229`](https://www.wikidata.org/wiki/Q124947229) |
| 73 | Кремлёвский волшебник | The Wizard of the Kremlin | Фильм | 2026 | 18 | [`Q126009194`](https://www.wikidata.org/wiki/Q126009194) |
| 74 | Прости, детка | Sorry, Baby | Фильм | 2026 | 18 | [`Q131450483`](https://www.wikidata.org/wiki/Q131450483) |
| 75 | Гражданин-мститель | Citizen Vigilante | Фильм | 2026 | 18 | [`Q132322742`](https://www.wikidata.org/wiki/Q132322742) |
| 76 | — | Tomodachi Life: Living the Dream | Видеоигра | 2026 | 18 | [`Q133567959`](https://www.wikidata.org/wiki/Q133567959) |
| 77 | Примат | Primate | Фильм | 2026 | 18 | [`Q133857446`](https://www.wikidata.org/wiki/Q133857446) |
| 78 | Petal | Petal | Альбом | 2026 | 18 | [`Q139581033`](https://www.wikidata.org/wiki/Q139581033) |
| 79 | — | — | Видеоигра | 2026 | 17 | [`Q108481438`](https://www.wikidata.org/wiki/Q108481438) |
| 80 | — | Reminders of Him | Фильм | 2026 | 17 | [`Q133886934`](https://www.wikidata.org/wiki/Q133886934) |
| 81 | Посторонний (фильм, 2025) | The Stranger | Фильм | 2026 | 17 | [`Q134280292`](https://www.wikidata.org/wiki/Q134280292) |
| 82 | Бумажный тигр | Paper Tiger | Фильм | 2026 | 17 | [`Q134708172`](https://www.wikidata.org/wiki/Q134708172) |
| 83 | Megadeth | Megadeth | Альбом | 2026 | 17 | [`Q136432587`](https://www.wikidata.org/wiki/Q136432587) |
| 84 | Они придут за тобой | They Will Kill You | Фильм | 2026 | 17 | [`Q136522037`](https://www.wikidata.org/wiki/Q136522037) |
| 85 | Metaphor: ReFantazio | Metaphor: ReFantazio | Видеоигра | 2026 | 16 | [`Q119362054`](https://www.wikidata.org/wiki/Q119362054) |
| 86 | Мать Мария | Mother Mary | Фильм | 2026 | 16 | [`Q120735817`](https://www.wikidata.org/wiki/Q120735817) |
| 87 | Мечты | Dreams | Фильм | 2026 | 16 | [`Q131109042`](https://www.wikidata.org/wiki/Q131109042) |
| 88 | Глазами пса | Good Boy | Фильм | 2026 | 16 | [`Q133427678`](https://www.wikidata.org/wiki/Q133427678) |
| 89 | Горькое Рождество | Bitter Christmas | Фильм | 2026 | 16 | [`Q134839394`](https://www.wikidata.org/wiki/Q134839394) |
| 90 | Отечество | Fatherland | Фильм | 2026 | 16 | [`Q135825188`](https://www.wikidata.org/wiki/Q135825188) |
| 91 | Минотавр | Minotaur | Фильм | 2026 | 16 | [`Q137612975`](https://www.wikidata.org/wiki/Q137612975) |
| 92 | Arirang | Arirang | Альбом | 2026 | 16 | [`Q137787331`](https://www.wikidata.org/wiki/Q137787331) |
| 93 | Внезапно (фильм) | All of a Sudden | Фильм | 2026 | 16 | [`Q137946980`](https://www.wikidata.org/wiki/Q137946980) |
| 94 | Assassin’s Creed Black Flag Resynced | — | Видеоигра | 2026 | 16 | [`Q138589086`](https://www.wikidata.org/wiki/Q138589086) |
| 95 | Молчаливый друг | Silent Friend | Фильм | 2026 | 15 | [`Q122827342`](https://www.wikidata.org/wiki/Q122827342) |
| 96 | Кодекс Данте | In the Hand of Dante | Фильм | 2026 | 15 | [`Q123113807`](https://www.wikidata.org/wiki/Q123113807) |
| 97 | Смерть Робин Гуда | The Death of Robin Hood | Фильм | 2026 | 15 | [`Q125960231`](https://www.wikidata.org/wiki/Q125960231) |
| 98 | Давление | Pressure | Фильм | 2026 | 15 | [`Q127698549`](https://www.wikidata.org/wiki/Q127698549) |
| 99 | — | People We Meet on Vacation | Фильм | 2026 | 15 | [`Q130581843`](https://www.wikidata.org/wiki/Q130581843) |
| 100 | Настройщик (фильм, 2025) | Tuner | Фильм | 2026 | 15 | [`Q130660452`](https://www.wikidata.org/wiki/Q130660452) |
| 101 | Bully | Bully | Альбом | 2026 | 15 | [`Q130702584`](https://www.wikidata.org/wiki/Q130702584) |
| 102 | Провод мертвеца | Dead Man's Wire | Фильм | 2026 | 15 | [`Q131760057`](https://www.wikidata.org/wiki/Q131760057) |
| 103 | — | Alpha | Фильм | 2026 | 15 | [`Q132192625`](https://www.wikidata.org/wiki/Q132192625) |
| 104 | Служебный роман | Office Romance | Фильм | 2026 | 15 | [`Q133627085`](https://www.wikidata.org/wiki/Q133627085) |
| 105 | Два прокурора | Two Prosecutors | Фильм | 2026 | 15 | [`Q133852989`](https://www.wikidata.org/wiki/Q133852989) |
| 106 | Национальное достояние | Kokuho | Фильм | 2026 | 15 | [`Q134906322`](https://www.wikidata.org/wiki/Q134906322) |
| 107 | Необычайно умные создания | Remarkably Bright Creatures | Фильм | 2026 | 15 | [`Q137203795`](https://www.wikidata.org/wiki/Q137203795) |
| 108 | Пассажир | Passenger | Фильм | 2026 | 15 | [`Q137708152`](https://www.wikidata.org/wiki/Q137708152) |
| 109 | — | Sniper Elite 5 | Видеоигра | 2026 | 15 | [`Q63464391`](https://www.wikidata.org/wiki/Q63464391) |
| 110 | — | — | Видеоигра | 2026 | 15 | [`Q96242717`](https://www.wikidata.org/wiki/Q96242717) |
| 111 | — | — | Видеоигра | 2026 | 14 | [`Q108479474`](https://www.wikidata.org/wiki/Q108479474) |
| 112 | Goat Simulator 3 | Goat Simulator 3 | Видеоигра | 2026 | 14 | [`Q112435648`](https://www.wikidata.org/wiki/Q112435648) |
| 113 | — | Hades II | Видеоигра | 2026 | 14 | [`Q115641620`](https://www.wikidata.org/wiki/Q115641620) |
| 114 | — | — | Видеоигра | 2026 | 14 | [`Q116547490`](https://www.wikidata.org/wiki/Q116547490) |
| 115 | Надежда | Hope | Фильм | 2026 | 14 | [`Q117429496`](https://www.wikidata.org/wiki/Q117429496) |
| 116 | Свет будущего | A Brighter Tomorrow | Фильм | 2026 | 14 | [`Q117597655`](https://www.wikidata.org/wiki/Q117597655) |
| 117 | — | — | Видеоигра | 2026 | 14 | [`Q124254764`](https://www.wikidata.org/wiki/Q124254764) |
| 118 | Три километра на краю света | Three Kilometres to the End of the World | Фильм | 2026 | 14 | [`Q125563790`](https://www.wikidata.org/wiki/Q125563790) |
| 119 | Последний дом | The Last House | Фильм | 2026 | 14 | [`Q129165193`](https://www.wikidata.org/wiki/Q129165193) |
| 120 | Майк, и Ник, и Ник, и Элис | Mike & Nick & Nick & Alice | Фильм | 2026 | 14 | [`Q130240838`](https://www.wikidata.org/wiki/Q130240838) |
| 121 | Дикая лошадь | Wild Horse Nine | Фильм | 2026 | 14 | [`Q133341572`](https://www.wikidata.org/wiki/Q133341572) |
| 122 | Хокум | Hokum | Фильм | 2026 | 14 | [`Q133397105`](https://www.wikidata.org/wiki/Q133397105) |
| 123 | — | — | Видеоигра | 2026 | 14 | [`Q134707677`](https://www.wikidata.org/wiki/Q134707677) |
| 124 | Великая арка | The Great Arch | Фильм | 2026 | 14 | [`Q134726473`](https://www.wikidata.org/wiki/Q134726473) |
| 125 | Только на одну ночь | One Night Only | Фильм | 2026 | 14 | [`Q135906833`](https://www.wikidata.org/wiki/Q135906833) |
| 126 | — | Pokémon Pokopia | Видеоигра | 2026 | 14 | [`Q136231470`](https://www.wikidata.org/wiki/Q136231470) |
| 127 | The Romantic | The Romantic | Альбом | 2026 | 14 | [`Q137723274`](https://www.wikidata.org/wiki/Q137723274) |
| 128 | — | Dhurandhar: The Revenge | Фильм | 2026 | 14 | [`Q137998501`](https://www.wikidata.org/wiki/Q137998501) |
| 129 | The Boys of Dungeon Lane | The Boys of Dungeon Lane | Альбом | 2026 | 14 | [`Q138801646`](https://www.wikidata.org/wiki/Q138801646) |
| 130 | Свет иллюзий | Maborosi | Фильм | 2026 | 14 | [`Q3273809`](https://www.wikidata.org/wiki/Q3273809) |
| 131 | Dave the Diver | Dave the Diver | Видеоигра | 2026 | 13 | [`Q114995908`](https://www.wikidata.org/wiki/Q114995908) |
| 132 | — | The Miracle Club | Фильм | 2026 | 13 | [`Q117004416`](https://www.wikidata.org/wiki/Q117004416) |
| 133 | Поймать монстра | Dust Bunny | Фильм | 2026 | 13 | [`Q121572303`](https://www.wikidata.org/wiki/Q121572303) |
| 134 | — | — | Видеоигра | 2026 | 13 | [`Q124464991`](https://www.wikidata.org/wiki/Q124464991) |
| 135 | Ограбить Лондон | Fuze | Фильм | 2026 | 13 | [`Q127324468`](https://www.wikidata.org/wiki/Q127324468) |
| 136 | Шары вверх | Balls Up | Фильм | 2026 | 13 | [`Q127688132`](https://www.wikidata.org/wiki/Q127688132) |
| 137 | — | Romería | Фильм | 2026 | 13 | [`Q128787358`](https://www.wikidata.org/wiki/Q128787358) |
| 138 | — | — | Видеоигра | 2026 | 13 | [`Q129440575`](https://www.wikidata.org/wiki/Q129440575) |
| 139 | — | The Little Sister | Фильм | 2026 | 13 | [`Q131139556`](https://www.wikidata.org/wiki/Q131139556) |
| 140 | Опасные отношения | Over Your Dead Body | Фильм | 2026 | 13 | [`Q131290710`](https://www.wikidata.org/wiki/Q131290710) |
| 141 | Кутюр | Couture | Фильм | 2026 | 13 | [`Q131414380`](https://www.wikidata.org/wiki/Q131414380) |
| 142 | — | The Love That Remains | Фильм | 2026 | 13 | [`Q131750758`](https://www.wikidata.org/wiki/Q131750758) |
| 143 | Частная жизнь (фильм, 2025) | A Private Life | Фильм | 2026 | 13 | [`Q132456674`](https://www.wikidata.org/wiki/Q132456674) |
| 144 | Амрум (фильм) | Amrum | Фильм | 2026 | 13 | [`Q133525486`](https://www.wikidata.org/wiki/Q133525486) |
| 145 | — | — | Видеоигра | 2026 | 13 | [`Q133882515`](https://www.wikidata.org/wiki/Q133882515) |
| 146 | — | The President's Cake | Фильм | 2026 | 13 | [`Q134285375`](https://www.wikidata.org/wiki/Q134285375) |
| 147 | Подростковый секс и смерть в лагере «Миазма» | Teenage Sex and Death at Camp Miasma | Фильм | 2026 | 13 | [`Q134434223`](https://www.wikidata.org/wiki/Q134434223) |
| 148 | Чёрный шар (фильм, 2026) | The Black Ball | Фильм | 2026 | 13 | [`Q134548431`](https://www.wikidata.org/wiki/Q134548431) |
| 149 | Мороженщик | Ice Cream Man | Фильм | 2026 | 13 | [`Q136773033`](https://www.wikidata.org/wiki/Q136773033) |
| 150 | Барашек в ящике | Sheep in the Box | Фильм | 2026 | 13 | [`Q137640905`](https://www.wikidata.org/wiki/Q137640905) |
| 151 | Foreign Tongues | Foreign Tongues | Альбом | 2026 | 13 | [`Q139556612`](https://www.wikidata.org/wiki/Q139556612) |
| 152 | Sayonara Wild Hearts | Sayonara Wild Hearts | Видеоигра | 2026 | 13 | [`Q76122450`](https://www.wikidata.org/wiki/Q76122450) |
| 153 | Amnesia: Rebirth | Amnesia: Rebirth | Видеоигра | 2026 | 13 | [`Q87190193`](https://www.wikidata.org/wiki/Q87190193) |
| 154 | — | — | Видеоигра | 2026 | 12 | [`Q110055360`](https://www.wikidata.org/wiki/Q110055360) |
| 155 | — | — | Видеоигра | 2026 | 12 | [`Q113957001`](https://www.wikidata.org/wiki/Q113957001) |
| 156 | Британик | Britannicus | Книга | 2026 | 12 | [`Q1196012`](https://www.wikidata.org/wiki/Q1196012) |
| 157 | Lasso | Stove | Альбом | 2026 | 12 | [`Q124401873`](https://www.wikidata.org/wiki/Q124401873) |
| 158 | Жертва обстоятельств | Sacrifice | Фильм | 2026 | 12 | [`Q125757803`](https://www.wikidata.org/wiki/Q125757803) |
| 159 | Хищный рывок | Thrash | Фильм | 2026 | 12 | [`Q130720030`](https://www.wikidata.org/wiki/Q130720030) |
| 160 | Нескромные | Splitsville | Фильм | 2026 | 12 | [`Q131004938`](https://www.wikidata.org/wiki/Q131004938) |
| 161 | — | Deaf | Фильм | 2026 | 12 | [`Q131462624`](https://www.wikidata.org/wiki/Q131462624) |
| 162 | Сначала дамы | Ladies First | Фильм | 2026 | 12 | [`Q131760054`](https://www.wikidata.org/wiki/Q131760054) |
| 163 | Ренуар | Renoir | Фильм | 2026 | 12 | [`Q133852834`](https://www.wikidata.org/wiki/Q133852834) |
| 164 | Энола Холмс 3 | Enola Holmes 3 | Фильм | 2026 | 12 | [`Q133876041`](https://www.wikidata.org/wiki/Q133876041) |
| 165 | Параллельные истории | Parallel Tales | Фильм | 2026 | 12 | [`Q134184074`](https://www.wikidata.org/wiki/Q134184074) |
| 166 | Благодать | La grazia | Фильм | 2026 | 12 | [`Q134542577`](https://www.wikidata.org/wiki/Q134542577) |
| 167 | — | — | Видеоигра | 2026 | 12 | [`Q135909032`](https://www.wikidata.org/wiki/Q135909032) |
| 168 | Мужчина, которого я люблю | The Man I Love | Фильм | 2026 | 12 | [`Q136410906`](https://www.wikidata.org/wiki/Q136410906) |
| 169 | — | Leviticus | Фильм | 2026 | 12 | [`Q137557964`](https://www.wikidata.org/wiki/Q137557964) |
| 170 | Kiss All the Time. Disco, Occasionally. | Kiss All the Time. Disco, Occasionally. | Альбом | 2026 | 12 | [`Q137789004`](https://www.wikidata.org/wiki/Q137789004) |
| 171 | Пасть дьявола | The Devil's Mouth | Фильм | 2026 | 12 | [`Q137926888`](https://www.wikidata.org/wiki/Q137926888) |
| 172 | — | — | Видеоигра | 2026 | 12 | [`Q139969024`](https://www.wikidata.org/wiki/Q139969024) |
| 173 | Shadow Tactics: Blades of the Shogun | Shadow Tactics: Blades of the Shogun | Видеоигра | 2026 | 12 | [`Q28032616`](https://www.wikidata.org/wiki/Q28032616) |
| 174 | Coffee Talk | Coffee Talk | Видеоигра | 2026 | 12 | [`Q85753234`](https://www.wikidata.org/wiki/Q85753234) |
| 175 | — | SnowRunner | Видеоигра | 2026 | 12 | [`Q88550122`](https://www.wikidata.org/wiki/Q88550122) |

## Что дальше

Владелец возьмёт **10 записей** отсюда, агент оформит их кандидатами, владелец вычитает и попробует
одобрить — сквозная проверка контура «агент предлагает → владелец судит» (фаза 6 эпика `ideas/29`).
⛔ Прибор в каталог НЕ ПИШЕТ ничего: инвариант В3 = А — агент никогда не заводит измерение без
вычитки владельцем.
