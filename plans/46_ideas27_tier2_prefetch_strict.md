# План 46 — ярус 2 графики: фоновая догрузка полных персон лендинга (строгий план)

> **Создан:** 2026-08-14 (сессия 5) · **Родитель:** `ideas/27` шаг 3б · **Доказательная
> база:** `researches/36` (обзор индустрии; рецепт §3; замер кэша боя: `max-age=3600`+ETag) ·
> **Статус:** 🔲 не начат — в пуле `plans/45`, формат «для строгого исполнителя» ·
> **Исходящее:** —
>
> 📄 **Форма — для строгого исполнителя:** не выбирай и не улучшай; всё решённое названо,
> нерешённого в этом плане нет. Застрял → STOP-ASK, а не обход.

## Цель

Полноразмерные персоны лендинга (3 × ~1,2 МБ: `alice.png`, `max.png`, `nastya.png` в
`static/img/personas/`) начинают греться в HTTP-кэше В ФОНЕ после полной загрузки лендинга —
и зум по тапу открывается из кэша, а не «мегабайт на горячую». Perf 100 лендинга НЕ проседает.

## Инварианты (нарушение любого = провал задания)

- Ни одной префетч-ссылки в ИСХОДНОМ HTML (только вставка скриптом после `load` — правило 1
  `researches/36` §2).
- `navigator.connection?.saveData === true` → префетч не запускается вовсе.
- Провал префетча молчалив: зум работает как сегодня (префетч — подсказка, не опора).
- Perf лендинга после правки — без просадки (замер шага 4).

## Шаги

### Шаг 1 — Код

- [ ] Файл `src/lib/ui/SimilarityDemo.svelte` (в нём живут `PERSONAS` и `avatarFull`).
      В существующий `onMount` (или новым `onMount`, если удобнее) добавить:

```js
// Ярус 2 (ideas/27, researches/36): греем полноразмерные персоны в HTTP-кэше В ФОНЕ,
// чтобы зум не тянул мегабайт «на горячую». Только после полной загрузки страницы и в
// простое; уважаем экономию трафика; провал молчалив — зум умеет жить без кэша.
const warmFullPersonas = () => {
  if ((navigator as any).connection?.saveData === true) return;
  for (const p of PERSONAS) {
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.as = 'image';
    link.href = avatarFull(p.id);
    document.head.append(link);
  }
};
const idle = (cb: () => void) =>
  'requestIdleCallback' in window ? (window as any).requestIdleCallback(cb) : setTimeout(cb, 2000);
if (document.readyState === 'complete') idle(warmFullPersonas);
else window.addEventListener('load', () => idle(warmFullPersonas), { once: true });
```

- [ ] Ничего больше не менять: ни `use:ready`, ни `loading="lazy"` у кропов, ни зум.
      **Готово:** `npm run check` → 0 ошибок 0 предупреждений; `npm test` → 234 pass.

### Шаг 2 — Страж

- [ ] Новый файл `tools/verify-tier2-prefetch.mjs` по каркасу `tools/verify-bug81.mjs`
      (собранный сайт: `npm run build` уже сделан исполнителем + `npx vite preview --port 4173
      --strictPort`; 🔴 `--strictPort` обязателен — без него preview молча уезжает на 4174 и
      страж судит чужой сервер). Проверки:
      1. В СЫРОМ HTML `/ru` (fetch текста страницы) — НОЛЬ вхождений `rel="prefetch"`.
      2. Живой страницей (Playwright, `waitUntil: 'load'` + 3 с): в `document.head` ровно
         **3** ссылки `link[rel="prefetch"][as="image"]`, их `href` кончаются на
         `alice.png` / `max.png` / `nastya.png`.
      3. Контекст с `saveData` (эмуляция: `context.addInitScript` подменяет
         `navigator.connection` объектом `{ saveData: true }` ДО загрузки) — ссылок **0**.
      4. Контроль прибора (`EXP-0082`): пункт 2 обязан УМЕТЬ покраснеть — прогон с временно
         пустым списком PERSONAS не делается; вместо этого мутация ниже.
- [ ] **Мутации (обе обязательны, ожидание — адресные падения):**
      м1: убрать guard `saveData` → падает проверка 3 (и только она);
      м2: вставлять ссылки сразу в разметку компонента (не после load) → падает проверка 1.
      После мутаций код вернуть, страж зелёный.
      **Готово:** вывод стража и мутаций вставлен в этот план под шагом.

### Шаг 3 — Расширение `verify-bug69` НЕ делать

Ярус 3 («объект после картинки», `ideas/27` шаг 4) в это задание НЕ входит — он требует
проектных решений. Не трогай `tools/verify-bug69.mjs`.

### Шаг 4 — Замер «после»

- [ ] Lighthouse по канону `EXP-0146` (штатный лаунчер сломан — свой Chrome + `--port`):
      `Start-Process chrome.exe -ArgumentList '--headless=new','--remote-debugging-port=9333','--user-data-dir=<пустая-папка>'`
      → `npx lighthouse http://localhost:4173/ru --port=9333 --only-categories=performance`.
      **Готово:** Perf ≥ 100 − 2 от замера «до» на ТОМ ЖЕ стенде (preview против preview,
      не против боя — правило `bugs/119`). Число вписать сюда.
- [ ] Погасить свой Chrome и preview ДЕРЕВОМ, проверить процессами
      (`Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'preview' }` → пусто).

### Шаг 5 — Сдача

- [ ] Пометки `[TESTED: дата · чем]` на новом коде · веха в `ideas/27` (шаг 3б ✅) · строка в
      реестре `plans/45` · коммит. Выкат в бой НЕ делать — он не твой (уедет штатным деплоем).
