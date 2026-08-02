/**
 * ПРИБОР ЗАМЕРА БОЕВЫХ АГРЕГАТОВ (не страж) — читает `space/stats`, `space/server`, снимки дней
 * и РАЗМЕР каталога `dims/dims_list` из БОЯ, чтобы закрыть два открытых вопроса разом:
 *
 *   1. «Какие ПРОЦЕНТЫ похожести видит новичок в бою» (`plans/28` §5, последняя незакрытая
 *      клетка ворот фазы 1 эпика `plans/23`). На стенде их снять нельзя: каталог 48 против 5111,
 *      любой процент там — артефакт размера стенда, а не продукта.
 *   2. Шаг 0 эпика `ideas/28` — РЕАЛЬНЫЙ размер боевого `dims_list` в байтах против потолка
 *      документа Firestore в 1 МиБ. От него зависит, влезет ли в тот же документ счётчик
 *      популярности измерения.
 *
 * ── AUTH (почему агенту вообще можно ходить в бой) ─────────────────────────────────────────
 * Интервью №013, В2 = **Б**, слово владельца дословно:
 *   «не испортит. Я делал множество тестовых аккаунтов, когда разрабатывал NDiim.
 *    Тестирование боем - залог качества.»
 * Это разрешение на АНОНИМНЫЙ ВХОД В БОЙ ради чтения агрегатов. Разрешение точечное: прибор
 * только ЧИТАЕТ и не пишет в бой ни одного документа.
 *
 * ── ЧЕГО ЭТОТ ПРИБОР НЕ ДЕЛАЕТ (и почему след в бою меньше обещанного владельцу) ───────────
 * Владельцу была названа цена «в бою появится настоящий анонимный аккаунт, он войдёт в счётчики
 * и проживёт 7 дней». Цена оказалась НИЖЕ, и это надо знать, а не выдавать за заслугу:
 *   · `accounts:signUp` заводит запись только в Firebase Auth. Документа `points/{uid}` он не
 *     создаёт — его создаёт приложение (`ensureSpaceExists`), а прибор приложением не является.
 *   · Счётчик `people` считает сервер синхронизации ПО ТОЧКАМ Firestore, а не по учётным
 *     записям Auth. Нет точки — нет вклада в цифры витрины.
 *   · Учётная запись удаляется здесь же (`accounts:delete` своим же токеном) — по умолчанию,
 *     без флага. Отключить уборку можно `--keep`, но тогда аккаунт действительно проживёт 7 дней.
 * Итог: при штатном прогоне цифры владельца прибор не двигает вовсе.
 *
 * ── ПОЧЕМУ ЭТО НЕ УТЕЧКА ПДн ───────────────────────────────────────────────────────────────
 * Читаются только АГРЕГАТЫ Пространства (числа) и каталог измерений (публичный справочник).
 * Ни одной чужой оценки, ни одного профиля, ни одной почты. Оценки по измерениям правила не
 * отдают никому, кроме владельца оценки и вычислителя (интервью №002, В4).
 *
 * ── ПОЧЕМУ КЛЮЧ ЛЕЖИТ ЛИТЕРАЛОМ ────────────────────────────────────────────────────────────
 * Веб-ключ Firebase публичен по устройству (он уходит в каждый браузер) и секретом не является;
 * тот же литерал стоит в `src/lib/firebase.ts` и `tools/snapshot-landing-metric.mjs`.
 *
 * Запуск:  node tools/probe-prod-stats.mjs            # прочитать и убрать за собой
 *          node tools/probe-prod-stats.mjs --keep     # оставить анонимный аккаунт в бою
 *          node tools/probe-prod-stats.mjs --days 7   # сколько снимков дней тянуть (деф. 5)
 */

const PROJECT = 'ndim-space';
const API_KEY = 'AIzaSyCZsGkY0Lw_OJ35QhRumcD5RzNJUFsAsww';

const KEEP = process.argv.includes('--keep');
const DAYS = Number(process.argv[process.argv.indexOf('--days') + 1]) || 5;

const DOCS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

/** Разворачивает значение Firestore REST в обычное JS-значение (нужны только скаляры и карты). */
function plain(value) {
  if (value == null) return null;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('nullValue' in value) return null;
  if ('mapValue' in value) return fields(value.mapValue.fields ?? {});
  if ('arrayValue' in value) return (value.arrayValue.values ?? []).map(plain);
  return value;
}

function fields(map) {
  return Object.fromEntries(Object.entries(map).map(([k, v]) => [k, plain(v)]));
}

async function readDoc(token, path) {
  const response = await fetch(`${DOCS}/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) return { ok: false, status: response.status, text: await response.text() };
  const body = await response.json();
  return { ok: true, body, raw: JSON.stringify(body).length, data: fields(body.fields ?? {}) };
}

// ── 1. Анонимный вход в БОЙ ────────────────────────────────────────────────────────────────
console.log('🔑 анонимный вход в БОЙ (разрешение владельца: интервью №013, В2 = Б)…');
const signUp = await fetch(
  `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ returnSecureToken: true }),
  },
);
if (!signUp.ok) {
  console.error(`❌ анонимный вход не удался: HTTP ${signUp.status}`);
  console.error(await signUp.text());
  process.exit(1);
}
const session = await signUp.json();
const token = session.idToken;
console.log(`   вошёл, uid = ${session.localId}\n`);

let exitCode = 0;
try {
  // ── 2. Агрегаты Пространства ─────────────────────────────────────────────────────────────
  const stats = await readDoc(token, 'space/stats');
  if (!stats.ok) {
    console.error(`❌ space/stats: HTTP ${stats.status}\n${stats.text}`);
    exitCode = 1;
  } else {
    console.log('📊 space/stats — АГРЕГАТЫ БОЯ');
    console.log(`   обновлён: ${stats.body.updateTime}`);
    for (const [key, value] of Object.entries(stats.data)) {
      const shown =
        value && typeof value === 'object' ? JSON.stringify(value) : String(value);
      console.log(`   ${key.padEnd(20)} ${shown}`);
    }
    console.log('');
  }

  // ── 3. Сердцебиение сервера синхронизации ────────────────────────────────────────────────
  const server = await readDoc(token, 'space/server');
  if (server.ok) {
    console.log('💓 space/server — СЕРДЦЕБИЕНИЕ');
    console.log(`   обновлён: ${server.body.updateTime}`);
    for (const [key, value] of Object.entries(server.data)) {
      console.log(`   ${key.padEnd(20)} ${JSON.stringify(value)}`);
    }
    console.log('');
  } else {
    console.log(`💓 space/server: HTTP ${server.status} (не критично для замера)\n`);
  }

  // ── 4. Снимки последних дней — видно ли ДВИЖЕНИЕ, а не только «сейчас» ───────────────────
  console.log(`📅 space/stats/daily — последние ${DAYS} дней (там, где снимок есть)`);
  const today = new Date();
  for (let back = 0; back < DAYS; back++) {
    const day = new Date(today.getTime() - back * 86400000).toISOString().slice(0, 10);
    const snapshot = await readDoc(token, `space/stats/daily/${day}`);
    if (!snapshot.ok) {
      console.log(`   ${day}  — нет (HTTP ${snapshot.status})`);
      continue;
    }
    const d = snapshot.data;
    const brief = Object.entries(d)
      .filter(([, v]) => v === null || typeof v !== 'object')
      .map(([k, v]) => `${k}=${v}`)
      .join('  ');
    console.log(`   ${day}  ${brief}`);
  }
  console.log('');

  // ── 5. Каталог измерений: РАЗМЕР против потолка 1 МиБ (шаг 0 эпика ideas/28) ─────────────
  const dims = await readDoc(token, 'dims/dims_list');
  if (!dims.ok) {
    console.error(`❌ dims/dims_list: HTTP ${dims.status}\n${dims.text}`);
    exitCode = 1;
  } else {
    console.log('📚 dims/dims_list — КАТАЛОГ ИЗМЕРЕНИЙ (шаг 0 эпика ideas/28)');
    console.log(`   обновлён: ${dims.body.updateTime}`);
    for (const [key, value] of Object.entries(dims.data)) {
      // Полезная нагрузка — JSON-строка каталога (наследие 1.x). Её НЕ печатаем: она сотни КБ.
      if (typeof value === 'string' && value.length > 200) {
        const bytes = Buffer.byteLength(value, 'utf8');
        const LIMIT = 1048576; // потолок документа Firestore, 1 МиБ
        let count = null;
        try {
          count = Object.keys(JSON.parse(value)).length;
        } catch {
          /* поле не JSON — тогда просто размер */
        }
        console.log(`   поле «${key}»: строка ${value.length} знаков, ${bytes} байт UTF-8`);
        if (count !== null) console.log(`   записей в каталоге: ${count}`);
        console.log(
          `   доля потолка 1 МиБ: ${((bytes / LIMIT) * 100).toFixed(1)} % ` +
            `(запас ${(LIMIT - bytes).toLocaleString('ru-RU')} байт)`,
        );
        if (count) {
          console.log(`   средний вес записи: ${(bytes / count).toFixed(1)} байт`);
        }
      } else {
        console.log(`   ${key.padEnd(20)} ${JSON.stringify(value)}`);
      }
    }
    console.log(`   вес ВСЕГО документа в ответе REST: ${dims.raw.toLocaleString('ru-RU')} байт`);
    console.log('');
  }
} finally {
  // ── 6. Уборка: анонимная учётная запись удаляется своим же токеном ──────────────────────
  if (KEEP) {
    console.log('⚠️  --keep: анонимный аккаунт ОСТАВЛЕН в бою (проживёт 7 дней).');
  } else {
    const removed = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: token }),
      },
    );
    console.log(
      removed.ok
        ? `🧹 анонимный аккаунт ${session.localId} удалён — следа в бою не осталось.`
        : `⚠️  аккаунт ${session.localId} удалить не удалось (HTTP ${removed.status}) — проживёт 7 дней.`,
    );
  }
}

process.exit(exitCode);
