# Разведка 2026-11-24 — десять массовых новинок вне прода и очереди Николая

> **Создан:** 2026-11-24 по прямому заказу владельца · **Метод:** свежий снимок прода + живая очередь `dim_candidates` + Wikidata + кассовые, продажные и зрительские источники · **Статус:** отобрано 10 карточек для партии 11

## Сверка отсутствия

- Локальные часы перед работой: `2026-11-24T17:13:47+03:00`.
- `node tools/fetch-dims-slice.mjs --all` → 5153 боевых измерения.
- Живая база `dim_candidates`: 78 документов — 35 `pending`, 43 `approved`, других статусов нет.
- `node tools/scout-wikidata-candidates.mjs --year 2026 --min-sitelinks 8 --limit 400` → 190 новинок, 155 вне локального каталога, 202 переиздания и 8 невышедших отсеяны. Полный список — `candidates/scouts/2026-11-24_popular_new_releases.md`.
- Ниже названные QID отсутствуют и в каталоге, и в очереди. Проверка названий шла по обеим языковым половинам с `normalizeForSearch`; проверка QID — по всем 78 документам очереди.

## Почему именно эти десять

| Объект | QID | Sitelinks | Наблюдаемый признак массовости | Источник |
|---|---|---:|---|---|
| Grand Theft Auto VI | Q23648408 | 79 | 32,5 млн предзаказов и $3,79 млрд за первые сутки; релиз 19 ноября 2026 | [Wikipedia — свод фактов и ссылки на отчёты](https://en.wikipedia.org/wiki/Grand_Theft_Auto_VI) · [Notebookcheck](https://www.notebookcheck.net/GTA-6-sold-nearly-25-million-copies-on-day-one-crushing-every-launch-record-in-sight.1455216.0.html) |
| Call of Duty: Modern Warfare 4 | Q139969024 | 21 | Релиз 23 октября; лидер недельных продаж Steam в ноябре | [Activision](https://www.callofduty.com/blog/2026/05/call-of-duty-modern-warfare-4-announcement) · [Steam](https://store.steampowered.com/charts/topsellers/US/2026-11-3) |
| Hytale | Q60187866 | 29 | Ранний доступ 13 января; более миллиона игроков и свыше 420 тысяч зрителей Twitch на старте | [Hytale](https://hytale.com/news/2025/11/hytale-early-access-january-13-2026) · [Wikipedia](https://en.wikipedia.org/wiki/Hytale) |
| Marvel’s Wolverine | Q108479474 | 18 | 2,4 млн копий к 4 ноября; лидер продаж США в сентябре | [PlayStation](https://www.playstation.com/en-us/games/marvels-wolverine/) · [Wikipedia](https://en.wikipedia.org/wiki/Marvel%27s_Wolverine) |
| Pokémon Pokopia | Q136231470 | 15 | 2,2 млн копий за четыре дня, более 5 млн к августу | [Nintendo](https://www.nintendo.co.jp/corporate/release/en/2026/260312.html) · [Game Developer](https://www.gamedeveloper.com/business/pokemon-pokopia-has-topped-5-million-sales-worldwide) |
| Голодные игры: Рассвет жатвы | Q126390739 | 29 | $119,3 млн в первый уикенд США; второй предпоказ года | [Wikipedia](https://en.wikipedia.org/wiki/The_Hunger_Games:_Sunrise_on_the_Reaping) · [Koimoi](https://www.koimoi.com/box-office/the-hunger-games-sunrise-on-the-reaping-north-america-box-office-scores-2026s-2nd-biggest-preview-haul-surpasses-michael-the-odyssey/) |
| Супер Марио: Галактическое кино | Q124806421 | 51 | $1,013 млрд мировых сборов | [Variety](https://variety.com/2026/film/news/box-office-super-mario-galaxy-movie-hits-1-billion-1236768837/) · [Box Office Mojo](https://www.boxofficemojo.com/title/tt28650488/) |
| История игрушек 5 | Q113641997 | 50 | $1,15 млрд мировых сборов; крупнейший старт Pixar | [Variety](https://variety.com/2026/film/box-office/toy-story-5-billion-dollar-box-office-1236818437/) · [Box Office Mojo](https://www.boxofficemojo.com/title/tt29355505/) |
| Его и её | Q130484454 | 13 | 104 млн просмотров за первое полугодие; первое место среди сериалов Netflix | [CJ ENM](https://www.cjenm.com/en/news/fifth-seasons-his-and-hers-ranks-1-in-global-views-for-netflix-in-1h-2026/) · [Quartz](https://qz.com/netflix-most-watched-shows-movies-2026) |
| Я найду тебя | Q134412018 | 11 | 120,8 млн просмотров за первые 91 день; вошёл в исторический топ Netflix | [Variety](https://variety.com/2026/tv/news/i-will-find-you-netflix-ratings-record-1236822866/) · [Screen Rant](https://screenrant.com/netflix-shows-2026-most-watched/) |

## Границы отбора

Это редакционный отбор десяти массовых объектов, а не утверждение о полном мировом топе. Wikidata измеряет распространённость энциклопедических статей, касса и продажи — коммерческий масштаб, отчёты Netflix — просмотры на одной платформе. Альбомы не взяты: действующая мастерская NDim пишет семь видов объектов, среди которых альбома нет. Сезоны старых сериалов, переиздания и объекты с первым выходом после 2026-11-24 исключены.

## Фактические источники для написания

Содержание, состав и приём сверены по прочитанным страницам Wikipedia и официальным страницам издателей; тексты партии пишутся заново. Имена, годы и авторство дополнительно разрешаются по QID через Wikidata API. Заимствование проверяется штатным `check-candidate-descriptions.mjs`, русский язык — локальными правилами NDim и новым независимым академическим стражем без стилометрического ядра.
