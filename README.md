<div align="center">

# NDim Space

**Честный поиск похожих людей в многомерном пространстве самооценок.**

[Русский](#ru) · [English](#en)

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE)
[![Status](https://img.shields.io/badge/status-2.0%20в%20разработке-orange.svg)](STATUS.md)

</div>

---

<a name="ru"></a>

## 🇷🇺 Русский

### Что это

Индустрия знакомств устроена так, чтобы вы **искали**, а не находили. Подписка, бесконечная лента,
иллюзия огромного выбора — всё это зарабатывает на человеческой потребности в отношениях, но не
удовлетворяет её.

**NDim Space** устроен иначе. Он ищет людей, похожих на вас, — математически.

### Как это работает

Сообщество придумывает **измерения** — оси человеческих качеств: «люблю тишину», «рано встаю»,
«читаю на ночь». Вы отмечаете, где вы стоите на тех осях, которые вам близки, — от 0 до 10.
Так вы становитесь **точкой в собственном подпространстве измерений**.

Похожесть двух людей считается только по **общим осям**:

```
близость     = 1 − (расстояние между точками / диаметр общего пространства) ^ 0.7
общность     = 2 · |общие оси| / (|ваши оси| + |его оси|)        ← коэффициент Дайса
ПОХОЖЕСТЬ    = близость × общность
```

Два следствия этой формулы:

- **Совпасть по одной случайной оси недостаточно.** Общность накажет за узкое пересечение.
- **Близость и широта пересечения обязательны обе.** Ноль в любом множителе обнуляет результат.
  Это осознанный отказ от компромиссных «средних».

Платформа периодически находит для вас до 250 самых похожих людей. Похожесть — величина приватная:
её видите только вы.

### Принципы

- **Никакой монетизации внимания.** Ни подписки, ни платного «буста», ни механик удержания.
- **Успех — это когда вы нашли человека и ушли.** Не «провели в приложении 40 минут».
- **Оси придумывают люди, а не платформа.** Никто, кроме людей, не знает, чем люди отличаются.
- **Открытый код под AGPL-3.0.** Взять эту идею и сделать из неё закрытый платный сервис — нельзя.

### Статус

Проект переписывается заново. Версия 1.x — работающая, но кустарная реализация идеи, написанная
автором вручную, без опыта программирования, — свою задачу выполнила: доказала, что математика
работает. Версия 2.0 строится по-настоящему.

| Фаза | Статус |
|------|--------|
| Фундамент, решения, санация | ✅ |
| Ядро похожести: чистый модуль + тесты | 🔲 следующее |
| Фронтенд на SvelteKit + TypeScript | 🔲 |
| Бэкенд: фоновый вычислитель связей | 🔲 |
| Домен, индексация, публикация | 🔲 |

Подробности — в [`STATUS.md`](STATUS.md) и [`MASTER_PLAN.md`](MASTER_PLAN.md).
Видение автора — в [`GOAL.md`](GOAL.md).

### Как устроен репозиторий

Проект ведётся по фреймворку **[KAIF](KAIF_FRAMEWORK.md)**: память и дисциплина работы человека с
ИИ-агентом вынесены в файлы репозитория. Начните с [`AGENT_GUIDE.md`](AGENT_GUIDE.md) — это канон.

Версия 1.x целиком сохранена в приватном архиве. Её ключевое знание выжато сюда:
[модель данных](researches/02_firestore_data_model_1x.md) ·
[математическое ядро](researches/03_similarity_core_1x_source.md).

### Автор

Николай Кривуша (Mikalai Kryvusha, *KOT KRINIK*).

> Не нужно стараться заработать и разбогатеть. Нужно делать добро людям — и это добро вернётся,
> возможно в разных формах. Поэтому в первую очередь я просто делаю добро безвозмездно: лучшую в мире
> платформу для знакомств, чтобы люди знакомились и любили друг друга.

---

<a name="en"></a>

## 🇬🇧 English

### What this is

The dating industry is built so that you keep **searching**, not finding. Subscriptions, endless feeds,
the illusion of infinite choice — it monetises the human need for connection without satisfying it.

**NDim Space** works differently. It finds people similar to you — mathematically.

### How it works

The community invents **dimensions** — axes of human qualities: "I love silence", "I wake up early",
"I read at night". You mark where you stand on the axes that matter to you, from 0 to 10. You become a
**point in your own subspace of dimensions**.

Similarity between two people is computed **only over their shared axes**:

```
proximity   = 1 − (distance between points / diameter of the shared space) ^ 0.7
commonality = 2 · |shared axes| / (|your axes| + |their axes|)      ← Dice coefficient
SIMILARITY  = proximity × commonality
```

Two consequences:

- **Matching on one random axis is not enough.** Commonality punishes a narrow overlap.
- **Both closeness and breadth of overlap are required.** A zero in either factor zeroes the result.
  This is a deliberate refusal of compromise "averages".

The platform periodically finds up to 250 people most similar to you. Similarity is private: only you
see it.

### Principles

- **No attention monetisation.** No subscriptions, no paid boosts, no retention mechanics.
- **Success is when you find someone and leave.** Not "spent 40 minutes in the app".
- **Axes are invented by people, not by the platform.** Nobody but people knows how people differ.
- **Open source under AGPL-3.0.** Taking this idea and turning it into a closed paid service is not allowed.

### Status

The project is being rewritten. Version 1.x — a working but homemade implementation, written by the
author by hand with no programming experience — did its job: it proved the maths works. Version 2.0 is
being built properly. See [`STATUS.md`](STATUS.md) and [`MASTER_PLAN.md`](MASTER_PLAN.md).

### Author

Mikalai Kryvusha (*KOT KRINIK*).

> Don't try to get rich. Do good for people — and the good comes back, perhaps in different forms.
> So first of all I simply do good, for free: the world's best platform for people to meet, so that
> they meet and love each other.

---

<div align="center">

**License:** [GNU AGPL-3.0](LICENSE) · © 2026 Mikalai Kryvusha

</div>
