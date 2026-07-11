# Домашка 05 — Аватарки трёх персонажей демо (ChatGPT)

> Задача для человека: художественная графика — не работа агента (канон `AGENT_GUIDE.md` →
> «Дизайн»). Нужны 3 привлекательные ИИ-аватарки для вымышленных персонажей демо-блока
> лендинга (`ideas/10`, макет V5 утверждён 2026-07-11).
> Заведена: 2026-07-11 · Промты готовы — копируй в ChatGPT как есть.

## ⏳ СТАТУС: ожидает владельца (~10 минут)

**Персонажи** (имена — решение владельца: популярные RU, в EN-версии — популярные США):

| Персонаж | RU / EN | Характер (из его оценок в демо) |
|----------|---------|----------------------------------|
| 1 | **Алиса / Emma** | спокойная, книжная, с юмором (тишина 8, книги 9, юмор 7) |
| 2 | **Макс / Liam** | активный путешественник-спортсмен (путешествия 9, спорт 8) |
| 3 | **Настя / Mia** | энергичная спортсменка, не до книг (спорт 9, тишина 2) |

## Как делать

1. Открой ChatGPT (с генерацией картинок) и вставь **сначала общий стиль, потом промт
   персонажа** — по одному на сообщение (иначе стиль поплывёт).
2. Попроси перегенерировать, если лицо не понравилось — это нормально.
3. Скачай PNG и сохрани в проект под точными именами:
   `static/img/personas/alice.png`, `static/img/personas/max.png`,
   `static/img/personas/nastya.png` (папку создай; агент потом сожмёт в webp и подключит).
4. Скажи агенту в чат: «аватарки готовы».

## Промт 1 — общий стиль (вставить один раз, перед персонажами)

```
You are generating a matching set of 3 avatar illustrations for a web app demo.
Shared style for ALL of them (keep it identical across images):
flat modern vector illustration, friendly and warm, head-and-shoulders portrait,
centered, facing slightly to the side, soft rounded shapes, minimal detail,
clean solid light-blue background (#eaf2fb), no text, no logos, square 1024x1024.
These are fictional characters, not real people. I will describe each character
in my next messages — generate one image per message.
```

## Промт 2 — Алиса / Emma

```
Character 1 of 3, same shared style. A calm, bookish young woman in her mid-20s,
gentle smile, cozy sweater, holding or near a small book, warm and approachable,
light purple accent color (#7c5cff) in her clothing.
```

## Промт 3 — Макс / Liam

```
Character 2 of 3, same shared style. An energetic young man in his mid-20s,
traveler and sportsman, friendly confident smile, light stubble, casual outdoor
jacket or backpack strap, green accent color (#0ea578) in his clothing.
```

## Промт 4 — Настя / Mia

```
Character 3 of 3, same shared style. A lively athletic young woman in her early 20s,
bright open smile, sporty look (ponytail, athletic top or windbreaker),
red-coral accent color (#d6544f) in her clothing.
```

## Почему цвета именно эти

Акцент в одежде = цвет персонажа в демо (кружок-аватар, точка на карте) — так иллюстрация
и интерфейс сшиваются в одно целое. Пока аватарок нет, в демо стоят цветные кружки с буквой —
всё работает, домашка не блокирует релиз.
