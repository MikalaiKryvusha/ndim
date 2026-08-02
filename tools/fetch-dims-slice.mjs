/**
 * ШАГ 0 ФАЗЫ 5 (`plans/36`) — ВЫГРУЗКА СРЕЗА КАТАЛОГА ДЛЯ ЗАМЕРА.
 *
 * Фаза 5 даёт каждому измерению публичную страницу. Прежде чем собирать все 5111, план требует
 * снять ТРИ ЧИСЛА на срезе: вес одной страницы, вес всех, время сборки. Этот инструмент готовит
 * срез; замер делает сборка.
 *
 * ── AUTH ───────────────────────────────────────────────────────────────────────────────────
 * Прямое разрешение владельца 2026-08-02: «можешь в firestore сходить и данные по измерениям
 * почитать» + интервью №013 В2 = Б (анонимный вход в бой ради чтения). `dims/{dimId}` —
 * ПУБЛИЧНЫЙ каталог: правила отдают его любому вошедшему, включая гостя (`firestore.rules:262`).
 * Приватные оценки `points/{uid}/dims/*` инструмент НЕ трогает и трогать не может.
 *
 * ── ПОЧЕМУ КЛЮЧ ЛЕЖИТ ЛИТЕРАЛОМ ────────────────────────────────────────────────────────────
 * Веб-ключ Firebase публичен по устройству (он уходит в каждый браузер) и секретом не является;
 * тот же литерал стоит в `src/lib/firebase.ts` и `tools/probe-prod-stats.mjs`.
 *
 * Запуск:  node tools/fetch-dims-slice.mjs            # 50 измерений (срез шага 0)
 *          node tools/fetch-dims-slice.mjs --all      # весь каталог (для фазы целиком)
 *          node tools/fetch-dims-slice.mjs --count 200
 */
import { writeFileSync } from 'node:fs';

const API_KEY = 'AIzaSyCZsGkY0Lw_OJ35QhRumcD5RzNJUFsAsww';
const DOCS = 'https://firestore.googleapis.com/v1/projects/ndim-space/databases/(default)/documents';
const OUT = 'src/lib/content/dims-slice.json';

const ALL = process.argv.includes('--all');
const COUNT = Number(process.argv[process.argv.indexOf('--count') + 1]) || 50;

/**
 * Слаг адреса: читаемые слова + ХВОСТ ИДЕНТИФИКАТОРА.
 *
 * Google прямо просит «use readable words rather than long ID numbers in your URLs» и приводит
 * длинный идентификатор примером «не рекомендуется» (developers.google.com → URL structure).
 * Но голый слаг из названия ломается, когда название правят в админ-панели, и сталкивается на
 * одноимённых произведениях. Хвост идентификатора снимает обе беды разом: адрес читаем, вечен и
 * уникален. Так устроены адреса Stack Overflow и Medium.
 *
 * 🔴 Функция обязана быть ДЕТЕРМИНИРОВАННОЙ: один и тот же документ даёт один и тот же адрес
 * всегда. Иначе адреса «поедут» между сборками (`plans/36`, шаг 1).
 */
const RU = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

export function slugify(title, id) {
  const words = String(title ?? '')
    .toLowerCase()
    .split('')
    .map((ch) => RU[ch] ?? ch)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  const tail = String(id).slice(0, 8).toLowerCase();
  return words ? `${words}-${tail}` : tail;
}

const loc = (v) => {
  const m = v?.mapValue?.fields ?? {};
  return { ru: m.ru?.stringValue ?? '', en: m.en?.stringValue ?? '' };
};
const num = (v) => Number(v?.integerValue ?? v?.doubleValue ?? 0);

const signUp = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ returnSecureToken: true }),
});
if (!signUp.ok) {
  console.error(`❌ анонимный вход не удался: HTTP ${signUp.status}`);
  process.exit(1);
}
const session = await signUp.json();
const auth = { Authorization: `Bearer ${session.idToken}` };

try {
  let pageToken = '';
  const dims = [];
  do {
    const url = `${DOCS}/dims?pageSize=300` + (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '');
    const res = await fetch(url, { headers: auth });
    if (!res.ok) {
      console.error(`❌ HTTP ${res.status}: ${await res.text()}`);
      break;
    }
    const body = await res.json();
    for (const d of body.documents ?? []) {
      const id = d.name.split('/').pop();
      if (id === 'dims_list') continue;            // индекс — не измерение
      const f = d.fields ?? {};
      const title = loc(f.title);
      dims.push({
        id,
        slug: slugify(title.en || title.ru, id),
        title,
        description: loc(f.description),
        type: loc(f.type),
        author: loc(f.author),
        year: f.year?.stringValue ?? '',
        tags: (f.tags?.arrayValue?.values ?? []).map((t) => t.stringValue ?? '').filter(Boolean),
        rates: num(f.rates),
        rating: num(f.rating),
      });
    }
    pageToken = body.nextPageToken ?? '';
  } while (pageToken && (ALL || dims.length < COUNT));

  // Срез берём РАВНОМЕРНО по каталогу, а не первые N подряд: иначе замер попадёт в один вид
  // произведения и один диапазон длины описания, а нам нужна честная средняя.
  let slice = dims;
  if (!ALL) {
    const step = Math.max(1, Math.floor(dims.length / COUNT));
    slice = dims.filter((_, i) => i % step === 0).slice(0, COUNT);
  }

  // Страж детерминизма адресов: два одинаковых слага — это молча потерянная страница.
  const seen = new Map();
  for (const d of slice) {
    if (seen.has(d.slug)) {
      console.error(`❌ КОЛЛИЗИЯ СЛАГОВ: «${d.slug}» у ${seen.get(d.slug)} и ${d.id}`);
      process.exit(1);
    }
    seen.set(d.slug, d.id);
  }

  writeFileSync(OUT, JSON.stringify(slice, null, 0) + '\n', 'utf8');

  const bytes = Buffer.byteLength(JSON.stringify(slice), 'utf8');
  const descRu = slice.map((d) => d.description.ru.length).filter(Boolean);
  const avg = (a) => (a.length ? Math.round(a.reduce((s, x) => s + x, 0) / a.length) : 0);
  console.log(`✅ выгружено измерений: ${slice.length} (из ${dims.length} в каталоге)`);
  console.log(`   файл: ${OUT} — ${(bytes / 1024).toFixed(1)} КБ`);
  console.log(`   среднее описание RU: ${avg(descRu)} знаков`);
  console.log(`   примеры адресов:`);
  for (const d of slice.slice(0, 5)) console.log(`     /dimension/${d.slug}`);
} finally {
  await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: session.idToken }),
  });
  console.log('🧹 анонимная учётная запись удалена.');
}
