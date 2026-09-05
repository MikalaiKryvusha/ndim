/**
 * landing-copy.ts — ТЕКСТЫ ВОРОТ. Оба языка, один источник.
 *
 * Почему модуль, а не объект `t` внутри `+page.svelte` (`plans/29` §4, `plans/21` фаза 2):
 * эпик `plans/24` переносит лендинг на адреса языков, и инлайновые литералы пришлось бы
 * переписывать второй раз. Плюс тексты витрины — предмет вычитки владельца, и им нужен адрес,
 * который можно назвать в интервью, а не «строка 153 компонента».
 *
 * 🔴 ЧТО ЗДЕСЬ МОЖНО И ЧЕГО НЕЛЬЗЯ.
 * Каждая строка ниже прошла вычитку владельца: русская — `plans/29` (принята 2026-08-15,
 * вердикт В9 = А), английская — `plans/51` (принята в тот же день, В4 = А). Правка текста витрины
 * мимо вычитки — нарушение канона проекта, а не улучшение. Меняешь строку — неси её владельцу.
 *
 * 🔑 АНГЛИЙСКАЯ ПОЛОВИНА — ИСХОДНИК, А НЕ ПЕРЕВОД (`AUTHOR_STYLOMETRY.md`, правило АП27).
 * Строки НЕ обязаны совпадать с русскими дословно; совпадать обязаны ОБЕЩАНИЯ. Русская фраза,
 * переложенная английскими словами, читается калькой, и словарь этого не лечит.
 *
 * Словарь витрины стережёт `tools/verify-product-vocabulary.mjs`: на лице продукта запрещены
 * «сервер синхронизации» и «калькулятор» — сервер синхронизации называется сервером синхронизации.
 */

import type { Lang } from '$lib/content/langs';

/** Строка на двух языках. */
export type Bi = Record<Lang, string>;

/**
 * ЖИВЫЕ ТЕКСТЫ — то, что стоит на витрине сегодня.
 *
 * ⚠️ Композицию эти строки НЕ меняют: они занимают ровно те места, что и раньше. Новые блоки
 * (якорь, вторая строка первого экрана, блок живых метрик, три отличия, текст доверия)
 * ждут фазы 4 эпика `plans/21` и лежат отдельно — `gateCopyPhase4`.
 */
export const landingCopy = {
	metaTitle: {
		ru: 'NDim Space — Знакомства нового измерения',
		// 🔄 Было «New Dimension Friendships». Решение владельца `plans/51` В2 = Б: по-английски
		// `Friendships` обещает именно ДРУЖБУ, тогда как русское «знакомства» шире и включает
		// романтическое, — английская витрина сужала обещание против русской. `Connections`
		// покрывает и то и другое и уже используется у нас для «связей».
		en: 'NDim Space — New Dimension Connections',
	},
	metaDesc: {
		ru: 'Здесь Вы найдёте людей, действительно похожих на Вас. Забудьте о бесконечных свайпах — Пространство NDim подберёт тех, с кем у Вас настоящая совместимость.',
		en: 'Here you will find people who are genuinely like you. Forget endless swiping — NDim Space finds those you are truly compatible with.',
	},
	eyebrow: { ru: 'Знакомства нового измерения', en: 'New Dimension Connections' },
	title: { ru: 'Добро пожаловать в Пространство NDim', en: 'Welcome to the NDim Space' },
	/*
	 * ПОДЗАГОЛОВОК — строка владельца из 1.x, и она остаётся ДОСЛОВНО.
	 *
	 * История, чтобы её не «починили» третий раз: агент дважды предлагал её заменить (первый раз
	 * на «5 111 измерений ждут Ваших звёзд», второй — переписав по портрету голоса). Оба раза
	 * владелец вернул свою. Его слово 2026-08-02: «оставляем».
	 *
	 * ⚠️ Цена названа в `plans/29` §3а и принята владельцем сознательно: «настоящая совместимость»
	 * — обещание об ИСХОДЕ отношений, и подпереть его нечем. Это НЕ недосмотр.
	 *
	 * 🔑 Английская половина — не перевод этой строки, а её пара. Две правки языка (`plans/51`):
	 * `really like you` в разговорном английском читается как «ты мне очень нравишься» — ровно
	 * наоборот смыслу, поэтому `genuinely`; `forget about` звучит как «забей на это», поэтому
	 * просто `forget`.
	 */
	sub: {
		ru: 'Здесь Вы найдёте людей, действительно похожих на Вас. Забудьте о бесконечных свайпах — мы подберём тех, с кем у Вас настоящая совместимость.',
		en: 'Here you will find people who are genuinely like you. Forget endless swiping — we find those you are truly compatible with.',
	},
	/*
	 * КНОПКИ — НЕ ТРОНУТЫ СОЗНАТЕЛЬНО, и вот почему (`plans/51`, разбор вёрстки 2026-08-15).
	 *
	 * Вычитанный текст витрины даёт им «Найти людей по душе» / `Find your people` с микротекстом
	 * «гостем, без аккаунта». Но СЕГОДНЯ обе кнопки ведут в `APP_URL`, то есть в стену входа, —
	 * и такая подпись пообещала бы гостевой вход, которого кнопка не даёт. Это `bugs/07` в чистом
	 * виде: витрина говорит то, чего продукт не делает.
	 *
	 * 🔴 И второе, важнее первого: решение владельца №009 В3 (2026-08-01) гласит, что вход
	 * анонимом ВООБЩЕ НЕ НАЗЫВАЕТСЯ КНОПКОЙ — «человек играет с интерактивом, и интерактив сам
	 * вносит его внутрь». Смена подписи здесь столкнула бы два его решения, а такие столкновения
	 * агент не разводит молча.
	 *
	 * Обе строки живут готовыми в `gateCopyPhase4.cta` и приезжают вместе с мостом (эпик
	 * `plans/23`) в фазе 4, где решается и форма двери.
	 */
	create: { ru: 'Создать Аккаунт', en: 'Create Account' },
	login: { ru: 'Войти в Аккаунт', en: 'Log In' },
	statsLabel: { ru: 'Пространство NDim в числах', en: 'NDim Space in numbers' },
	statDims: { ru: 'измерений', en: 'dimensions' },
	statRatings: { ru: 'оценок', en: 'ratings' },
	statRelations: { ru: 'связей рассчитано', en: 'relations computed' },
	statPeople: { ru: 'человек', en: 'people' },
	joined: {
		ru: 'Станьте одним из первых, кого здесь найдут',
		en: 'Be among the first to be found here',
	},
	foot: {
		ru: 'Пространство NDim · открытая платформа, сделанная с заботой о людях',
		en: 'NDim Space · an open platform built with care for people',
	},
	catalogTitle: { ru: 'Что оценивают в Пространстве', en: 'What people rate in the Space' },
	catalogLine: {
		ru: 'Рейтинги, собранные из оценок людей. Смотреть можно без аккаунта.',
		en: 'Ratings built from what people voted. You can look without an account.',
	},
	catalogAll: { ru: 'Весь каталог', en: 'The whole catalog' },
	/** Подпись переключателя темы: показываем, КУДА переключит нажатие. */
	themeLabel: {
		light: { ru: 'тёмная', en: 'dark' },
		dark: { ru: 'светлая', en: 'light' },
	},
} satisfies Record<string, Bi | Record<string, Bi>>;

/** Три «фичи» первого экрана. ⚠️ Их судьба — открытый вопрос `plans/21` («остаются или уходят»). */
export const landingFeatures = [
	{
		tag: { ru: '01 · NDim ID', en: '01 · NDim ID' },
		h2: { ru: 'Ваш уникальный многомерный профиль', en: 'Your unique multi-dimensional profile' },
		p: {
			ru: 'Заполните измерения, отражающие Вашу личность, — и позвольте алгоритму найти тех, кто разделяет Ваши ценности и интересы.',
			en: 'Fill in the dimensions that reflect your personality, and let the algorithm find those who share your values and interests.',
		},
	},
	{
		tag: { ru: '02 · Настоящие связи', en: '02 · Real Connections' },
		h2: {
			ru: 'Люди, с которыми у Вас настоящая совместимость',
			en: 'People with whom you are truly compatible',
		},
		/*
		 * 🔴 ОБЕ СТРОКИ БЛОКА СТОЯТ СЛОВОМ ВЛАДЕЛЬЦА (интервью №071, 2026-09-05), не «чинить»:
		 *   · заголовок «настоящая совместимость» — «ЭТО НЕ ОБЕЩАНИЕ, а сильная рекламная фраза.
		 *     Не путай, что такое обещание, а что сильное заявление» (В2 = В);
		 *   · «Начните общение…» при отсутствии переписки в продукте — «Не нужно новые строки.
		 *     А нужно двигаться в сторону создания MVP месенджера» (В1 = В): разрыв закрывается
		 *     ПРОДУКТОМ (`ideas/47`), а не текстом. Дизайнерская замена строки (`bugs/107`) снята.
		 */
		p: {
			ru: 'Мы бережно анализируем Ваш профиль и находим самых похожих на Вас людей. Начните общение с теми, кто действительно Вам подходит.',
			en: 'We carefully analyze your profile and find the people most similar to you. Start communicating with those who are really right for you.',
		},
	},
	{
		tag: { ru: '03 · С заботой', en: '03 · With Care' },
		h2: { ru: 'Ваш внутренний мир под защитой', en: 'Your inner world is protected' },
		p: {
			ru: 'Ваши оценки остаются только Вашими. Другие видят лишь то, насколько вы близки, — не то, из чего эта близость сложилась.',
			en: 'Your ratings stay yours alone. Others see only how close you are — not what that closeness is made of.',
		},
	},
] satisfies Array<Record<string, Bi>>;

/**
 * ТЕКСТЫ, ПРИНЯТЫЕ ВЛАДЕЛЬЦЕМ И ЖДУЩИЕ ВЁРСТКИ — фаза 4 эпика `plans/21`.
 *
 * 🔴 Это НЕ черновики и НЕ идеи. Каждая строка вычитана и принята: русская — `plans/29` (В9 = А),
 * английская — `plans/51` (В4 = А). Они лежат здесь, а не в документе, ровно по той причине, по
 * которой заведён модуль: чтобы фаза 4 верстала УТВЕРЖДЁННОЕ, а не переписывала заново.
 *
 * Отдельным экспортом, чтобы не ехать в бандл лендинга, пока их никто не рендерит.
 *
 * ⚠️ Числа блока метрик приезжают ЖИВЫМИ из `space/stats` (решение №010 Р7: «делаем живую
 * настоящую цифру»); здесь только подписи. Литералов чисел тут нет и быть не должно — это
 * `bugs/07`.
 */
export const gateCopyPhase4 = {
	/** Якорь витрины. Слово владельца 2026-08-15; `supercomputer` подтверждён `plans/51` В3 = А. */
	anchor: {
		ru: 'Пространство NDim — точный, честный и быстрый беспристрастный суперкомпьютер в мире отношений: он считает, с кем у Вас больше всего общего, и показывает каждое число расчёта.',
		en: 'NDim Space is a precise, honest, fast and impartial supercomputer for relationships: it works out who you have the most in common with, and shows you every number behind the answer.',
	},
	/** Вторая строка первого экрана — удар по живой боли без единого слова о чужих продуктах. */
	painLine: {
		ru: 'Здесь Вас не разглядывают по фотографии — здесь считают, сколько у Вас с человеком общего.',
		en: 'No one here sizes you up by your photo. Here we count how much you and another person actually share.',
	},
	/** Кнопки. Приезжают ВМЕСТЕ с мостом эпика `plans/23` — см. оговорку у `landingCopy.create`. */
	cta: {
		primary: { ru: 'Найти людей по душе', en: 'Find your people' },
		primaryHint: { ru: 'гостем, без аккаунта', en: 'as a guest — no account needed' },
		secondary: { ru: 'Войти', en: 'Sign in' },
	},
	/**
	 * БЛОК ЖИВЫХ МЕТРИК — заказ владельца 02.08: «отдельный привлекательный, с зелёным окрасом…
	 * с буллет-списком ключевых живых метрик Пространства. И ТЕРМИНЫ РАСКРЫВАТЬ».
	 * Ни одного голого термина: не «измерения», а то, чем они являются человеку.
	 */
	metrics: {
		title: { ru: 'Пространство NDim работает прямо сейчас', en: 'The NDim Space is running right now' },
		dims: {
			ru: 'уникальных объектов культуры — фильмы, книги, сериалы, игры, музыка, привычки и занятия. По ним человек описывает себя, и по ним же Пространство находит ему похожих.',
			en: 'unique works of culture — films, books, series, games, music, habits and pastimes. People describe themselves through them, and the Space uses that description to find people like you.',
		},
		ratings: {
			ru: 'оценок поставлено людьми — каждая от 0 до 10 звёзд. Это и есть описание человека: не анкета о себе, а то, как он относится к вещам, которые любит.',
			en: 'ratings given by people — zero to ten stars each. That is what a description is here: not a questionnaire about yourself, but how you feel about the things you love.',
		},
		relations: {
			ru: 'связей рассчитано — для каждого человека посчитано, насколько он близок каждому другому. Расчёт идёт непрерывно и обновляется, пока Вы живёте своей жизнью.',
			en: 'connections computed — for every person, how close they are to everyone else. The counting never stops, and it keeps going while you get on with your life.',
		},
		people: {
			ru: 'человек уже описали себя — и каждый новый проверяется на схожесть с Вами в первую очередь.',
			en: 'people have described themselves — and every new arrival is checked against you first.',
		},
		/*
		 * 🔴 АКТИВНЫЕ ЗА НЕДЕЛЮ — решение владельца `plans/29` В6: «показываем только активных в
		 * неделю. Активных в месяц не показываем».
		 *
		 * Хвост, названный вслух и НЕ решённый текстом: сегодня это число НОЛЬ. Как выглядит
		 * строка при нуле — показывать «0», прятать одну эту строку до первого живого человека
		 * или писать словом — решают макеты фазы 3. Это форма, а не принцип.
		 */
		activeWeek: {
			ru: 'человек заходили за последнюю неделю — Пространство живёт и считает прямо сейчас.',
			en: 'people came by this week — the Space is alive and computing right now.',
		},
	},
	/** Обещание под первым экраном. «Пока Вы живёте своей жизнью» — слова владельца, №010 Р1. */
	promise: {
		ru: 'Вы ставите звёзды тому, что знаете и любите: фильмам, книгам, сериалам, играм, занятиям — от нуля до десяти. Из этих оценок складывается Ваше описание, и дальше работает Пространство NDim. Оно сравнивает Ваше описание с описаниями других людей и проверяет каждого нового человека на схожесть с Вами — пока Вы живёте своей жизнью.',
		en: "You give stars to what you know and love — films, books, series, games, the things you do — from zero to ten. Those stars become your description, and from there the NDim Space takes over. It compares your description with everyone else's and checks every new arrival against you, while you get on with your life.",
	},
	promiseTail: {
		ru: 'Вам не нужно ничего искать самому. Пространство ищет за Вас и показывает, что нашло.',
		en: 'You never have to go looking. The Space looks for you, and shows you what it found.',
	},
	/*
	 * ТРИ ОТЛИЧИЯ — заменяют три «фичи». Каждое подпёрто кодом, ни одно не о конкурентах.
	 *
	 * 🔴 ЧЕТВЁРТОЕ ОТЛИЧИЕ УДАЛЕНО ЦЕЛИКОМ 2026-08-28 18:1x +03:00 ПО СЛОВУ ВЛАДЕЛЬЦА
	 * (интервью №056, оба языка). Дословно: «Удалить нахуй весь этот текст. Он не моим голосом
	 * написан и со мной не согласован. Он не соответствует моей стилометрии».
	 * Это было первое отличие — блок о рекламе, счётчиках и составе наших суточных чисел.
	 * Его текст здесь НЕ цитируется: слово владельца — удалить, и пересказ в комментарии
	 * держал бы удалённое живым. Дословная редакция лежит в истории git и в интервью №056.
	 *
	 * ⛔ НА ЕГО МЕСТО НИЧЕГО НЕ ПИШЕТСЯ. Новый текст лица продукта может быть только голосом
	 * владельца; его слова на замену нет. Отличий стало три, и это законное состояние, а не
	 * пробел, ждущий заполнения агентом.
	 *
	 * 📌 Для будущей сессии, чтобы не восстановила «как было»: текст этого блока НИКОГДА не
	 * показывался людям — весь `gateCopyPhase4` ждёт фазы 4 и не импортируется (замер по
	 * собранному сайту 2026-08-28: 0 вхождений при контроле-положительном на живых строках).
	 * Удалённая редакция сохранена историей git и интервью №056.
	 */
	differences: [
		{
			h: { ru: 'Здесь нечего купить', en: 'There is nothing to buy' },
			p: {
				ru: 'Пространство NDim работает бесплатно для всех людей по всему Миру, без покупок и подписок: все возможности одинаковы для всех, и место повыше в чужом списке не продаётся.',
				en: "NDim Space is free for everyone, everywhere, with no purchases and no subscriptions. Every feature is the same for everyone, and a higher place in someone's list is not for sale.",
			},
		},
		{
			h: { ru: 'Одинаково в обе стороны', en: 'The same in both directions' },
			p: {
				ru: 'Похожесть симметрична: насколько Вы похожи на человека, ровно настолько же он похож на Вас — одно число на двоих. В расчёт не входит ни Ваш пол, ни то, сколько времени Вы здесь провели, — только измерения, которые Вы заполнили, и звёзды, которые Вы им поставили.',
				en: 'Similarity is symmetrical: however similar you are to someone, they are exactly that similar to you — one number for the two of you. Your gender does not enter the calculation, and neither does how long you have been here. Only what you described, and the stars you gave it.',
			},
		},
		{
			/*
			 * 🔴 ПОСЛЕДНЯЯ ФРАЗА — СТРОКА ВЛАДЕЛЬЦА ИЗ РУКОВОДСТВА 1.x, вернул он сам
			 * (`plans/29` В10 = Б). Агент снимал её дважды и дважды был неправ.
			 * Порядок частей НЕ переставлять: механика идёт ПЕРЕД отрицанием — сначала что мы
			 * делаем, потом чего не делаем.
			 */
			h: { ru: 'Только объективная математика', en: 'Objective mathematics only' },
			p: {
				ru: 'Похожесть — это близость, умноженная на общность. Близость — насколько одинаково Вы и другой человек оценили одни и те же вещи. Общность — насколько широко Ваши описания пересекаются. Пространство NDim не использует субъективизм человеческого взгляда и непредсказуемость систем искусственного интеллекта.',
				en: 'Similarity is proximity multiplied by commonality. Proximity is how alike you and another person rated the same things. Commonality is how widely your two descriptions overlap. NDim Space does not use the subjectivity of the human eye, nor the unpredictability of artificial intelligence systems.',
			},
		},
	],
	/**
	 * Текст доверия. Опора — `researches/25` §9.2 (JAMA 2023, n = 3 539): возможность удалить
	 * данные это самая сильная измеренная гарантия доверия после самого согласия.
	 */
	trust: {
		ru: 'Уйти можно в один клик: страница удаления открыта всегда, и мы стираем Ваши данные раньше, чем саму учётную запись, — а если что-то не удалилось, честно скажем, что именно осталось. Ни писем в поддержку, ни уговоров остаться. Ваши оценки не видит никто, кроме Вас: другие видят лишь то, насколько вы близки, — не то, из чего эта близость сложилась.',
		en: 'Leaving takes one click: the deletion page is always open, and we erase your data before we erase the account itself — and if something did not delete, we will tell you plainly what is left. No support emails, no talking you out of it. Nobody sees your ratings but you. Others see only how close you are — never what that closeness is made of.',
	},
	/*
	 * ПОДПИСЬ К ИНТЕРАКТИВУ.
	 *
	 * 🔴 Старая подпись обещала «ничего не сохраняется и не отправляется — всё считается прямо в
	 * Вашем браузере». Решение владельца №010 Р6 заводит Макса, Алису и Настю РЕАЛЬНЫМИ записями
	 * в базе, поэтому три из четырёх утверждений старой подписи перестают быть правдой. Строка
	 * переписана ЗАРАНЕЕ (`GOAL.md` принцип 8), а не под выкат.
	 *
	 * ⚠️ Цена названа честно: «всё считается в Вашем браузере» было сильным доводом доверия, и
	 * замены ему нет. Довод доверия теперь несёт `trust`, где он подпёрт замером.
	 */
	demoCaption: {
		ru: 'Поставьте звёзды пяти вещам — и соседи тут же подойдут ближе или отойдут: расстояния на карте настоящие. Здесь их пять, чтобы Вы увидели, как это устроено; в Пространстве NDim — 5 111. Считает то же самое ядро, что работает внутри. Люди на карте — системные персонажи, они живут в Пространстве и помечены в нём честно.',
		en: 'Give stars to five things, and the neighbours move closer or further away: the distances on the map are real. There are five here so you can see how it works; the NDim Space has 5,111. The same core does the counting as inside. The people on the map are system characters — they live in the Space, and they are marked as such honestly.',
	},
} satisfies Record<string, unknown>;
