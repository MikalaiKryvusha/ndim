# Исследование 03 — Математическое ядро 1.x: исходник и матрица соответствия

> **Зачем этот документ.** Старый код удалён из проекта (живёт в приватном `MikalaiKryvusha/ndim-old`).
> Но ядро похожести — единственное, ради чего NDim Space существует, и в фазе 2 оно переносится в
> чистый TypeScript-модуль. Переписывать его «по прозе» опасно: легко разойтись в деталях. Поэтому
> исходник зафиксирован здесь дословно.
>
> Плюс здесь **матрица соответствия** `a…t` — без неё существующие документы `relations` в боевом
> Firestore невозможно расшифровать при миграции (`researches/02`).
>
> Снято 2026-07-10 из `storage/admin/adminFunctions.js`. **Живой справочник — не помечается DONE.**

---

## Матрица соответствия (обфускация полей `relations`)

Ядро сохраняло метрики под однобуквенными именами. В боевой базе поля называются именно так.
**Буквы `j` нет** — она пропущена в оригинале.

| Поле | Настоящее имя | Что означает |
|------|---------------|--------------|
| `a` | `combined_space_size` | размерность объединённого пространства (общие + уникальные оси обоих) |
| `b` | `common_space_size` | число общих осей, `|K|` |
| `c` | `guest_space_size` | сколько осей заполнил гость |
| `d` | `distance_stars` | евклидово расстояние в общем пространстве |
| `e` | `guest.owner_uid` | uid гостя |
| `f` | `guest.owner_email` | email гостя |
| `g` | `proximity` | **близость**, 0…100 |
| `h` | `commonality` | **общность** (коэффициент Дайса), 0…100 |
| `i` | `similarity` | **ПОХОЖЕСТЬ** = близость × общность, 0…100 |
| `k` | `guest_space_size_rate_of_owner` | отношение размеров пространств гостя и владельца |
| `l` | `guest_space_diametr` | диаметр пространства гостя |
| `m` | `owner_space_diametr` | диаметр пространства владельца |
| `n` | `guest_space_diametr_rate_of_owner` | отношение диаметров |
| `o` | `common_space_size_rate_of_owner` | доля общего пространства от пространства владельца |
| `p` | `common_space_size_rate_of_guest` | доля общего пространства от пространства гостя |
| `q` | `common_space_diametr` | диаметр общего пространства |
| `r` | `common_space_diametr_rate_of_owner` | отношение диаметров: общее / владельца |
| `s` | `common_space_diametr_rate_of_guest` | отношение диаметров: общее / гостя |
| `t` | `distance_rate_of_common_space_diametr` | расстояние в % от диаметра общего пространства |

> ⚠️ `e` и `f` — **персональные данные гостя** (uid и email), лежащие в документе `relations`
> владельца. В новой модели email гостя туда попадать не должен: для отображения карточки достаточно
> `uid`. Учесть при проектировании 2.0 (`researches/02`, пункт 5).

---

## Исходник `calculateRelation` (дословно, 1.x)

```js
// admin function: расчет связи между двумя пользователями
export function calculateRelation(ndimId_owner, ndimId_guest) {
  var relation_data = {};
  const owner_dims = ndimId_owner.user_dims;
  const guest_dims = ndimId_guest.user_dims;

  // Создаем набор ключей по гостю для быстрого поиска
  const keys_set_guest = new Set(Object.keys(guest_dims));

  // Создаем массивы для общих ключей, и для уникальных ключей овнера и гостя
  var common_keys = [];
  var unique_keys_owner = [];
  var unique_keys_guest = Object.keys(guest_dims); // гостю сразу все его ключи

  // Проходим по всем ключам овнера для их классификации
  Object.keys(owner_dims).forEach(key => {
    if (keys_set_guest.has(key)) {
      common_keys.push(key);
      unique_keys_guest = unique_keys_guest.filter(k => k !== key);
    } else {
      unique_keys_owner.push(key);
    }
  });

  var distance_stars = 0;
  // расчёты только если есть общее пространство
  if (common_keys.length > 0) {

    common_keys.forEach((common_key) => {
      var delta = (owner_dims[common_key]) - (guest_dims[common_key]);
      distance_stars = distance_stars + Math.pow(delta, 2);
    })
    distance_stars = Math.pow(distance_stars, 0.5);

    var common_space_size = common_keys.length;

    // диаметр общего пространства = диагональ K-мерного куба со стороной 10
    var common_space_diameter = (Math.pow(common_space_size, 0.5)) * 10;

    // близость с повышенной чувствительностью вблизи (показатель 0.7)
    // старая линейная версия: 1 - distance_stars / common_space_diameter
    var proximity = 1 - Math.pow((distance_stars / common_space_diameter), 0.7);

    var guest_unique_space_size = unique_keys_guest.length;
    var owner_unique_space_size = unique_keys_owner.length;
    var guest_space_size = guest_unique_space_size + common_space_size;
    var owner_space_size = owner_unique_space_size + common_space_size;
    var combined_space_size = common_space_size + unique_keys_owner.length + guest_unique_space_size;

    // общность по Дайсу
    var commonality = ((2 * common_space_size) / (guest_space_size + owner_space_size));

    // ПОХОЖЕСТЬ
    var similarity = commonality * proximity;

    // производные метрики пространства
    var guest_space_size_rate_of_owner        = round2(guest_space_size / owner_space_size);
    var guest_space_diametr                   = round1(Math.pow(guest_space_size, 0.5) * 10);
    var owner_space_diametr                   = round1(Math.pow(owner_space_size, 0.5) * 10);
    var guest_space_diametr_rate_of_owner     = round2(guest_space_diametr / owner_space_diametr);
    var common_space_size_rate_of_owner       = round2(common_space_size / owner_space_size);
    var common_space_size_rate_of_guest       = round2(common_space_size / guest_space_size);
    var common_space_diametr                  = round1(Math.pow(common_space_size, 0.5) * 10);
    var common_space_diametr_rate_of_owner    = round2(common_space_diametr / owner_space_diametr);
    var common_space_diametr_rate_of_guest    = round2(common_space_diametr / guest_space_diametr);
    var distance_rate_of_common_space_diametr = Math.round((distance_stars / common_space_diametr) * 100);

    distance_stars = round2(distance_stars);
    proximity   = Math.round(proximity * 100);
    commonality = Math.round(commonality * 100);
    similarity  = Math.round(similarity * 100);

    // → далее поля пишутся в relation_data под именами a…t (матрица выше)

  } else {
    // нет общего пространства — связи между пользователями нет
    relation_data = null;
  }

  return relation_data;
}

// диаметр всего пространства NDim
export function calculateSpaceDiameter(all_dims_amount) {
  return round1(Math.pow(all_dims_amount, 0.5) * 10);
}
```

`round1` / `round2` — в оригинале записаны развёрнуто как
`Math.round((x + Number.EPSILON) * 10) / 10` и `Math.round((x + Number.EPSILON) * 100) / 100`.
`Number.EPSILON` добавлен, чтобы `0.145` округлялось вверх, а не вниз из-за представления double.

## `calculateRatings` — рейтинг оси

```js
// для каждой оси: stars = сумма оценок, rates = число оценивших
all_dims_list[dim_id]["rating"] =
  Math.round(((all_dims_list[dim_id]["stars"] / all_dims_list[dim_id]["rates"]) + Number.EPSILON) * 10) / 10;
```

---

## Что перенести в 2.0, а что исправить

**Перенести без изменений** (это и есть идея):
- `proximity = 1 − (d / D)^0.7`, где `D = √|K| · 10`
- `commonality = 2|K| / (|owner| + |guest|)` (Дайс)
- `similarity = proximity × commonality`
- «нет общих осей → связи нет» (не додумывать отсутствующие координаты)

**Исправить:**
- вернуть метрикам настоящие имена (убрать `a…t`);
- не класть `owner_email` гостя в чужой документ;
- вынести округление в именованные функции, а магическую `0.7` — в именованную константу с
  комментарием о том, зачем она (повышенная чувствительность вблизи);
- покрыть тестами инварианты: тождество → 100, `d = D` → 0, `|K| = 0` → `null`,
  `similarity = proximity × commonality`.

## Источник

Приватный репозиторий `MikalaiKryvusha/ndim-old`, файл `storage/admin/adminFunctions.js`.
Восстановить: `gh repo clone MikalaiKryvusha/ndim-old` либо
`git clone .private/ndim-1.x-history.bundle <куда>`.
