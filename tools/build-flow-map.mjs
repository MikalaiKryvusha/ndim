#!/usr/bin/env node
/**
 * СБОРЩИК «РАЗВЁРТКИ» — лист приложения в самодостаточном HTML: зум, панорама, снимки живых
 * экранов, стрелки связей. Ноль служб, ноль внешних скриптов, ноль интернета.
 *
 * ПОЧЕМУ НЕ draw.io И НЕ PENPOT (интервью №057, закрыто 2026-09-04 делегированием владельца;
 * `FORK:` со всеми доводами — в самом документе интервью):
 *   · в draw.io у каждой коробки АБСОЛЮТНЫЕ координаты — агент считал бы раскладку вслепую;
 *     здесь раскладку держит браузер, а агент пишет правила;
 *   · замер проекта: в `design/` 43 макета, и НИ ОДИН не подключает внешний скрипт — владелец
 *     открывает файл двойным щелчком; развёртка в этом же виде не заводит новой сущности;
 *   · Penpot стоит 7 служб, 2,7 ГиБ памяти и 6 ГБ диска (`researches/58`), а схема лежит ВНУТРИ
 *     службы — её выгрузка становится ручным обрядом, то есть парой, которая дрейфует (EXP-0274).
 * Цена решения названа честно: владелец коробки мышью не двигает — он смотрит и комментирует.
 *
 * 🔑 ПАРА «ИСТИНА ↔ ЗЕРКАЛО». Истина — `design/flow-map/flow-map.json` (текст, читаемые диффы).
 * Зеркало — `design/flow-map.html` (генерируется). Патчить зеркало на месте ЗАПРЕЩЕНО: правка
 * умрёт при следующей пересборке, и пара разъедется (`AGENT_GUIDE.md` → Реестр пар).
 *
 * Снимки экранов вшиваются в файл как data:URI — поэтому HTML тяжёлый, и это осознанная цена
 * самодостаточности: страницу можно унести на флешке и открыть где угодно.
 *
 * Запуск:   node tools/build-flow-map.mjs            собрать design/flow-map.html
 *           node tools/build-flow-map.mjs --selftest самопроверка сборщика
 * Коды:     0 — собрано; 1 — ошибка манифеста или пропавший снимок.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { pathToFileURL } from 'node:url';

const MANIFEST = 'design/flow-map/flow-map.json';
const OUT = 'design/flow-map.html';

/** Экран в единицах листа: снимок 390x900 рисуется в своих пикселях один к одному. */
const ЭКРАН_Ш = 390;
const ЭКРАН_В = 900;
const ПОДПИСЬ_В = 64; // высота шапки карточки экрана над снимком

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

/** Экранирование для вставки в HTML-текст и в атрибуты. */
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Снимок → data:URI. Пропавший файл — ОТКАЗ, а не тихая дырка в листе. */
function dataURI(файл) {
  if (!existsSync(файл)) throw new Error(`снимок не найден: ${файл}`);
  const mime = MIME[extname(файл).toLowerCase()];
  if (!mime) throw new Error(`неизвестный тип снимка: ${файл}`);
  return `data:${mime};base64,${readFileSync(файл).toString('base64')}`;
}

/**
 * Точки стыковки стрелки: берём ближайшие борта двух карточек, чтобы линия не резала снимок.
 * Возвращает {x1,y1,x2,y2} в единицах листа.
 */
export function стыковка(a, b) {
  const ax = a.x + ЭКРАН_Ш / 2, ay = a.y + (ЭКРАН_В + ПОДПИСЬ_В) / 2;
  const bx = b.x + ЭКРАН_Ш / 2, by = b.y + (ЭКРАН_В + ПОДПИСЬ_В) / 2;
  const dx = bx - ax, dy = by - ay;
  // По какой оси карточки дальше друг от друга — с той стороны и выходим.
  if (Math.abs(dx) >= Math.abs(dy)) {
    const s = dx > 0 ? 1 : -1;
    return {
      x1: ax + s * (ЭКРАН_Ш / 2), y1: ay,
      x2: bx - s * (ЭКРАН_Ш / 2), y2: by,
      сторона: 'бок', знак: s,
    };
  }
  const s = dy > 0 ? 1 : -1;
  return {
    x1: ax, y1: ay + s * ((ЭКРАН_В + ПОДПИСЬ_В) / 2),
    x2: bx, y2: by - s * ((ЭКРАН_В + ПОДПИСЬ_В) / 2),
    сторона: 'верхниз', знак: s,
  };
}

/**
 * ТРАССА СТРЕЛКИ — ВОДОПРОВОДОМ, А НЕ ЛУЧОМ.
 *
 * Слово владельца 2026-09-05: «*Стрелки нужно рисовать логическими путями, как водопровод,
 * изгибая, крася в разные цвета, а не прямые лучи*». Прямой луч между центрами читается только
 * когда карточек десяток; на листе из сорока он пересекает чужие снимки, и клубок из таких лучей
 * не показывает НИЧЕГО — глазу не за что зацепиться.
 *
 * Труба идёт под прямыми углами с закруглениями на поворотах: вышли из борта, отошли на полку,
 * повернули, дошли по полке, повернули, вошли в борт. `сдвиг` разводит трубы, выходящие из одной
 * карточки, по разным полкам — иначе они слились бы в одну линию.
 */
export function труба(t, сдвиг = 0) {
  const R = 22; // радиус закругления на повороте
  const скруглить = (точки) => {
    let d = `M ${точки[0][0]} ${точки[0][1]}`;
    for (let i = 1; i < точки.length - 1; i++) {
      const [px, py] = точки[i - 1], [x, y] = точки[i], [nx, ny] = точки[i + 1];
      const в1 = Math.hypot(x - px, y - py), в2 = Math.hypot(nx - x, ny - y);
      const r = Math.min(R, в1 / 2, в2 / 2);
      const ax = x - ((x - px) / (в1 || 1)) * r, ay = y - ((y - py) / (в1 || 1)) * r;
      const bx = x + ((nx - x) / (в2 || 1)) * r, by = y + ((ny - y) / (в2 || 1)) * r;
      d += ` L ${Math.round(ax)} ${Math.round(ay)} Q ${x} ${y} ${Math.round(bx)} ${Math.round(by)}`;
    }
    const [lx, ly] = точки[точки.length - 1];
    return `${d} L ${lx} ${ly}`;
  };

  if (t.сторона === 'бок') {
    // Полка между карточками: труба выходит вбок, идёт по вертикали, входит сбоку.
    const полка = t.x1 + (t.x2 - t.x1) / 2 + сдвиг;
    if (Math.abs(t.y2 - t.y1) < 2) return скруглить([[t.x1, t.y1], [t.x2, t.y2]]);
    return скруглить([[t.x1, t.y1], [полка, t.y1], [полка, t.y2], [t.x2, t.y2]]);
  }
  // Сверху вниз: вышли снизу, отошли на полку по вертикали, поехали вбок, вошли сверху.
  const полка = t.y1 + (t.y2 - t.y1) / 2 + сдвиг;
  if (Math.abs(t.x2 - t.x1) < 2) return скруглить([[t.x1, t.y1], [t.x2, t.y2]]);
  return скруглить([[t.x1, t.y1], [t.x1, полка], [t.x2, полка], [t.x2, t.y2]]);
}

/**
 * ЦВЕТ ТРУБЫ — ПО ТОМУ, ОТКУДА ОНА ВЫХОДИТ. Тогда пучок труб одного происхождения читается как
 * одна система, а не как случайные линии: «вот всё, что ведёт из публичного лица», «вот всё, что
 * ведёт из двери». Цвета разведены по тону и различимы в обеих темах.
 */
export const ЦВЕТА = ['#1467d6', '#c2410c', '#0f766e', '#7c3aed', '#b91c1c', '#0369a1', '#4d7c0f'];
export const цветТрубы = (индексИсточника) => ЦВЕТА[индексИсточника % ЦВЕТА.length];

/** Проверка манифеста: связь, ссылающаяся в пустоту, — отказ до сборки, а не кривой лист. */
export function проверить(m) {
  const беды = [];
  if (!m || typeof m !== 'object') return ['манифест не объект'];
  const экраны = m['экраны'] || [];
  if (!экраны.length) беды.push('в манифесте нет ни одного экрана');
  const ids = new Set();
  for (const э of экраны) {
    if (!э.id) беды.push(`у экрана «${э['имя'] ?? '?'}» нет id`);
    else if (ids.has(э.id)) беды.push(`id «${э.id}» встречается дважды`);
    else ids.add(э.id);
    if (typeof э.x !== 'number' || typeof э.y !== 'number') беды.push(`у экрана «${э.id}» нет координат`);
  }
  for (const с of m['связи'] || []) {
    if (!ids.has(с['от'])) беды.push(`связь ссылается на несуществующий экран «${с['от']}»`);
    if (!ids.has(с['к'])) беды.push(`связь ссылается на несуществующий экран «${с['к']}»`);
  }
  return беды;
}

function собрать(m) {
  const экраны = m['экраны'];
  const поId = Object.fromEntries(экраны.map((э) => [э.id, э]));
  const Ш = m['лист']?.['ширина'] ?? 2600;
  const В = m['лист']?.['высота'] ?? 1500;

  const карточки = экраны.map((э) => `
      <figure class="scr" style="left:${э.x}px; top:${э.y}px" data-id="${esc(э.id)}">
        <figcaption>
          <b>${esc(э['имя'])}</b>
          <span class="addr">${esc(э['адрес'] ?? '')}</span>
        </figcaption>
        <img src="${dataURI(э['файл'])}" alt="${esc(э['имя'])}" width="${ЭКРАН_Ш}" height="${ЭКРАН_В}" draggable="false">
        ${э['заметка'] ? `<p class="note">${esc(э['заметка'])}</p>` : ''}
      </figure>`).join('');

  /*
   * Каждому ИСТОЧНИКУ — свой цвет и своя стрелка-наконечник того же цвета: наконечник, крашенный
   * общим цветом, разрывал бы трубу в самом заметном месте. Трубы из одной карточки разводятся
   * `сдвиг`ом по разным полкам, чтобы не слипнуться в одну линию.
   */
  const источники = [...new Set((m['связи'] || []).map((с) => с['от']))];
  const счётИсточника = new Map();
  const стрелки = (m['связи'] || []).map((с, i) => {
    const t = стыковка(поId[с['от']], поId[с['к']]);
    const н = счётИсточника.get(с['от']) ?? 0;
    счётИсточника.set(с['от'], н + 1);
    const цвет = цветТрубы(источники.indexOf(с['от']));
    const d = труба(t, (н - 1) * 26);
    const mx = (t.x1 + t.x2) / 2, my = (t.y1 + t.y2) / 2;
    return `
        <path d="${d}" stroke="${цвет}" marker-end="url(#tip${источники.indexOf(с['от']) % ЦВЕТА.length})"/>
        ${с['подпись'] ? `<text x="${mx}" y="${my - 12}" text-anchor="middle" fill="${цвет}">${esc(с['подпись'])}</text>` : `<!-- ${i} -->`}`;
  }).join('');

  const наконечники = ЦВЕТА.map((c, i) => `
      <marker id="tip${i}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="${c}"/>
      </marker>`).join('');

  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(m['название'])}</title>
<!-- СГЕНЕРИРОВАНО tools/build-flow-map.mjs из design/flow-map/flow-map.json. Не править руками:
     правка умрёт при пересборке. Правится манифест. -->
<style>
  :root{
    --bg:#f4f2ee; --ink:#1b1a17; --dim:#6d6a63; --line:#d9d5cc; --card:#fff; --accent:#1467d6;
    --grid:#e6e2d9;
  }
  @media (prefers-color-scheme: dark){
    :root:not([data-theme="light"]){
      --bg:#15140f; --ink:#efece4; --dim:#a09b8f; --line:#33302a; --card:#1e1c17; --accent:#7fb0ff;
      --grid:#22201b;
    }
  }
  :root[data-theme="dark"]{
    --bg:#15140f; --ink:#efece4; --dim:#a09b8f; --line:#33302a; --card:#1e1c17; --accent:#7fb0ff;
    --grid:#22201b;
  }
  *{box-sizing:border-box}
  html,body{height:100%}
  body{margin:0;background:var(--bg);color:var(--ink);overflow:hidden;
    font:15px/1.5 -apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif}

  /* Рама листа: она ловит колесо и перетаскивание.

     🔴 ВЫДЕЛЕНИЕ ЗАПРЕЩЕНО НА ВСЁМ ЛИСТЕ. Слово владельца 2026-09-05: «*когда я кликаю и
     удерживаю, чтобы перемещаться — это синим выделяет экраны — неудобно*». Перетаскивание и
     выделение текста — один и тот же жест мышью, и браузер по умолчанию делает второе. На листе,
     который двигают ЛАДОНЬЮ, выделять нечего: он не документ, а карта. */
  #viewport{position:fixed;inset:0;cursor:grab;touch-action:none;
    -webkit-user-select:none;user-select:none;-webkit-touch-callout:none;
    background-image:radial-gradient(var(--grid) 1px, transparent 1px);background-size:32px 32px}
  #viewport.dragging{cursor:grabbing}
  #viewport *{-webkit-user-drag:none}

  /* Сам лист: двигается и масштабируется ОДНИМ transform — поэтому снимки и стрелки едут вместе. */
  #sheet{position:absolute;left:0;top:0;transform-origin:0 0;will-change:transform}
  #sheet .paper{position:absolute;left:0;top:0;width:${Ш}px;height:${В}px;
    background:transparent}

  svg.links{position:absolute;left:0;top:0;width:${Ш}px;height:${В}px;overflow:visible;pointer-events:none}
  /* Труба: цвет задаёт разметка (свой на каждый источник), стили — только форму.
     Скруглённые концы и стыки нужны, чтобы повороты читались как поворот, а не как излом. */
  svg.links path{fill:none;stroke-width:3;opacity:.9;stroke-linecap:round;stroke-linejoin:round}
  svg.links text{font:600 13px/1 -apple-system,"Segoe UI",Roboto,Arial,sans-serif;
    paint-order:stroke;stroke:var(--bg);stroke-width:5px}

  figure.scr{position:absolute;margin:0;width:${ЭКРАН_Ш}px;background:var(--card);
    border:1px solid var(--line);border-radius:14px;box-shadow:0 6px 24px rgba(0,0,0,.10);overflow:hidden}
  figure.scr figcaption{display:flex;flex-direction:column;gap:2px;padding:10px 14px;
    border-bottom:1px solid var(--line);height:${ПОДПИСЬ_В}px}
  figure.scr figcaption b{font-size:15px}
  figure.scr .addr{color:var(--dim);font-size:12.5px}
  figure.scr img{display:block;width:${ЭКРАН_Ш}px;height:${ЭКРАН_В}px;object-fit:cover}
  figure.scr .note{margin:0;padding:10px 14px;color:var(--dim);font-size:13px;border-top:1px solid var(--line)}

  /* Панель управления — единственное, что НЕ едет с листом. */
  #bar{position:fixed;left:16px;bottom:16px;display:flex;gap:8px;align-items:center;
    background:var(--card);border:1px solid var(--line);border-radius:12px;padding:8px 10px;
    box-shadow:0 6px 24px rgba(0,0,0,.12);z-index:10}
  #bar button{font:inherit;color:var(--ink);background:transparent;border:1px solid var(--line);
    border-radius:8px;padding:6px 10px;cursor:pointer;min-width:38px}
  #bar button:hover{border-color:var(--accent);color:var(--accent)}
  #zoom{min-width:56px;text-align:center;color:var(--dim);font-variant-numeric:tabular-nums}
  #title{position:fixed;left:16px;top:16px;z-index:10;max-width:min(560px,60vw);
    background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 16px;
    box-shadow:0 6px 24px rgba(0,0,0,.12)}
  #title h1{margin:0 0 4px;font-size:17px}
  #title p{margin:0;color:var(--dim);font-size:13px}
</style>
</head>
<body>
<div id="title">
  <h1>${esc(m['название'])}</h1>
  <p>${esc(m['подпись'] ?? '')}</p>
</div>

<div id="viewport">
  <div id="sheet">
    <div class="paper">
      <svg class="links" viewBox="0 0 ${Ш} ${В}">
        <defs>${наконечники}
        </defs>${стрелки}
      </svg>${карточки}
    </div>
  </div>
</div>

<div id="bar">
  <button id="out" title="Отдалить">−</button>
  <span id="zoom">100%</span>
  <button id="in" title="Приблизить">+</button>
  <button id="fit" title="Вписать весь лист">вписать</button>
  <button id="one" title="Масштаб 1:1">1:1</button>
  <button id="theme" title="Светлая / тёмная">тема</button>
</div>

<script>
(() => {
  const vp = document.getElementById('viewport');
  const sheet = document.getElementById('sheet');
  const zoomLabel = document.getElementById('zoom');
  const Ш = ${Ш}, В = ${В};
  const МИН = 0.05, МАКС = 4;

  let s = 1, x = 0, y = 0;

  const применить = () => {
    sheet.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + s + ')';
    zoomLabel.textContent = Math.round(s * 100) + '%';
  };

  /** Зум В ТОЧКУ КУРСОРА: точка под указателем обязана остаться на месте — иначе лист «убегает». */
  const зумВТочку = (нов, px, py) => {
    нов = Math.min(МАКС, Math.max(МИН, нов));
    const k = нов / s;
    x = px - (px - x) * k;
    y = py - (py - y) * k;
    s = нов;
    применить();
  };

  const вписать = () => {
    const поля = 60;
    const k = Math.min((vp.clientWidth - поля * 2) / Ш, (vp.clientHeight - поля * 2) / В);
    s = Math.min(МАКС, Math.max(МИН, k));
    x = (vp.clientWidth - Ш * s) / 2;
    y = (vp.clientHeight - В * s) / 2;
    применить();
  };

  // Колесо — зум. Ctrl+колесо тоже зум (жест тачпада), поэтому браузерный зум страницы гасим.
  vp.addEventListener('wheel', (e) => {
    e.preventDefault();
    const шаг = Math.exp(-e.deltaY * 0.0015);
    зумВТочку(s * шаг, e.clientX, e.clientY);
  }, { passive: false });

  // Панорама перетаскиванием. Указатель захватывается, чтобы лист не «отлипал» за краем окна.
  let тянем = false, lx = 0, ly = 0, pid = null;
  vp.addEventListener('pointerdown', (e) => {
    тянем = true; pid = e.pointerId; lx = e.clientX; ly = e.clientY;
    vp.setPointerCapture(pid); vp.classList.add('dragging');
  });
  vp.addEventListener('pointermove', (e) => {
    if (!тянем) return;
    x += e.clientX - lx; y += e.clientY - ly; lx = e.clientX; ly = e.clientY;
    применить();
  });
  const отпустить = () => {
    if (!тянем) return;
    тянем = false; vp.classList.remove('dragging');
    try { vp.releasePointerCapture(pid); } catch { /* указатель уже отпущен */ }
  };
  vp.addEventListener('pointerup', отпустить);
  vp.addEventListener('pointercancel', отпустить);

  // Щипок двумя пальцами.
  const касания = new Map();
  let базаЩипка = 0, базаМасштаба = 1;
  vp.addEventListener('pointerdown', (e) => касания.set(e.pointerId, e));
  vp.addEventListener('pointermove', (e) => {
    if (!касания.has(e.pointerId)) return;
    касания.set(e.pointerId, e);
    if (касания.size !== 2) return;
    const [a, b] = [...касания.values()];
    const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    if (!базаЩипка) { базаЩипка = d; базаМасштаба = s; return; }
    зумВТочку(базаМасштаба * (d / базаЩипка), (a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2);
  });
  const снятьКасание = (e) => { касания.delete(e.pointerId); if (касания.size < 2) базаЩипка = 0; };
  vp.addEventListener('pointerup', снятьКасание);
  vp.addEventListener('pointercancel', снятьКасание);

  const центр = () => [vp.clientWidth / 2, vp.clientHeight / 2];
  document.getElementById('in').onclick = () => зумВТочку(s * 1.25, ...центр());
  document.getElementById('out').onclick = () => зумВТочку(s / 1.25, ...центр());
  document.getElementById('fit').onclick = вписать;
  document.getElementById('one').onclick = () => зумВТочку(1, ...центр());
  document.getElementById('theme').onclick = () => {
    const cur = document.documentElement.getAttribute('data-theme');
    const тёмная = cur ? cur === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', тёмная ? 'light' : 'dark');
  };

  // Клавиши: +/− зум, 0 — вписать, стрелки — сдвиг.
  addEventListener('keydown', (e) => {
    if (e.key === '+' || e.key === '=') зумВТочку(s * 1.25, ...центр());
    else if (e.key === '-') зумВТочку(s / 1.25, ...центр());
    else if (e.key === '0') вписать();
    else if (e.key.startsWith('Arrow')) {
      const d = e.shiftKey ? 200 : 60;
      if (e.key === 'ArrowLeft') x += d; if (e.key === 'ArrowRight') x -= d;
      if (e.key === 'ArrowUp') y += d; if (e.key === 'ArrowDown') y -= d;
      применить();
    }
  });

  addEventListener('resize', () => { /* лист не пересчитываем: человек сам решает, вписывать ли */ });
  вписать();
})();
</script>
</body>
</html>
`;
}

/* ── Точка входа. Работа только под ЗАПУСКОМ, не под импортом (класс EXP-0188, ideas/43):
   модуль, исполняющий работу при импорте, делает юниты бессильными — они не могут ни разу
   вызвать его, не собрав файл побочным действием. Поймано собственным парным тестом. ───── */
const ЗАПУЩЕН_НАПРЯМУЮ = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;

// ── самопроверка ────────────────────────────────────────────────────────────────────────────
if (ЗАПУЩЕН_НАПРЯМУЮ && process.argv.includes('--selftest')) {
  let плохо = 0;
  const прав = (имя, усл) => { if (усл) console.log('  ✓ ' + имя); else { console.error('  ✖ ' + имя); плохо++; } };

  // Стыковка: карточки по горизонтали — линия выходит вбок, не режет снимок.
  const t1 = стыковка({ x: 0, y: 0 }, { x: 1000, y: 0 });
  прав('горизонтальная связь выходит из правого борта', t1.x1 === ЭКРАН_Ш && t1.y1 === (ЭКРАН_В + ПОДПИСЬ_В) / 2);
  прав('горизонтальная связь входит в левый борт', t1.x2 === 1000);
  // По вертикали — снизу вверх.
  const t2 = стыковка({ x: 0, y: 0 }, { x: 0, y: 1200 });
  прав('вертикальная связь выходит из нижнего борта', t2.y1 === ЭКРАН_В + ПОДПИСЬ_В && t2.x1 === ЭКРАН_Ш / 2);

  // Проверка манифеста обязана КРАСНЕТЬ на связи в пустоту — иначе лист соберётся кривым молча.
  прав('связь в несуществующий экран — отказ', проверить({
    'экраны': [{ id: 'a', x: 0, y: 0 }], 'связи': [{ 'от': 'a', 'к': 'нет-такого' }],
  }).length === 1);
  прав('двойной id — отказ', проверить({ 'экраны': [{ id: 'a', x: 0, y: 0 }, { id: 'a', x: 1, y: 1 }] }).length === 1);
  прав('экран без координат — отказ', проверить({ 'экраны': [{ id: 'a' }] }).length === 1);
  прав('здоровый манифест молчит', проверить({
    'экраны': [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 600, y: 0 }], 'связи': [{ 'от': 'a', 'к': 'b' }],
  }).length === 0);

  if (плохо) { console.error(`\n✖ самопроверка провалена: ${плохо}`); process.exit(1); }
  console.log('\n✅ самопроверка сборщика развёртки пройдена');
  process.exit(0);
}

// ── боевая сборка ───────────────────────────────────────────────────────────────────────────
if (ЗАПУЩЕН_НАПРЯМУЮ) {
  let м;
  try { м = JSON.parse(readFileSync(MANIFEST, 'utf8')); }
  catch (err) { console.error(`✖ не читается ${MANIFEST}: ${err.message}`); process.exit(1); }

  const беды = проверить(м);
  if (беды.length) {
    console.error(`✖ манифест ${MANIFEST} неисправен:`);
    for (const b of беды) console.error('  · ' + b);
    process.exit(1);
  }

  let html;
  try { html = собрать(м); }
  catch (err) { console.error(`✖ ${err.message}`); process.exit(1); }

  writeFileSync(OUT, html, 'utf8');
  const кб = Math.round(Buffer.byteLength(html) / 1024);
  console.log(`✅ ${OUT} — ${м['экраны'].length} экран(ов), ${(м['связи'] || []).length} связ(и), ${кб} КБ, внешних ссылок 0`);
  console.log(`   правится ${MANIFEST}, зеркало пересобирается этой же командой (${basename(process.argv[1])})`);
}
