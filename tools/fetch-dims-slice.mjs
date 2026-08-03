/**
 * КАНАЛ «КАТАЛОГ → СБОРКА» — шаг 2 фазы 5 (`plans/36`). Родился как инструмент замера шага 0.
 *
 * Фаза 5 даёт каждому измерению публичную страницу, а сайт статический — значит каталог обязан
 * попасть в сборку файлом. Прецедент в проекте есть и изобретать нечего: `tools/extract-docs.mjs`
 * так же генерирует `src/lib/content/docs.ts` из источника.
 *
 * ── ДВА ФАЙЛА, И ЭТО НЕ ПРИХОТЬ ────────────────────────────────────────────────────────────
 *   · `dims-slice.json` — 50 записей, ЛЕЖИТ В GIT. Чтобы `npm run build` работал из чистого
 *     клона, без сети и без боевого доступа. Это запасной каталог, а не «данные проекта».
 *   · `dims-build.json` — весь каталог, **16,7 МБ, В GIT НЕ КЛАДЁТСЯ** (`.gitignore`). Пишется
 *     этим инструментом ШАГОМ ВЫКАТА, перед сборкой.
 * Сборка сама выбирает: есть полный — берёт его, нет — работает на срезе
 * (`src/lib/content/dims-source.ts`). Разработчик, прогнавший `--all`, не пачкает git.
 *
 * ── ДЕТЕРМИНИЗМ — ВОРОТА ШАГА 2 ────────────────────────────────────────────────────────────
 * 🔴 Повторный прогон на неизменившемся каталоге обязан дать ПОБАЙТОВО тот же файл. Иначе каждая
 * сборка выглядела бы как изменение всего сайта, а адреса «поехали» бы — тот же класс беды, что
 * мигающие адреса, которых мы избежали в интервью №021. Ради этого записи СОРТИРУЮТСЯ по `id`:
 * порядок страниц Firestore менять не обязан, но полагаться на это нельзя.
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
 * Запуск:  node tools/fetch-dims-slice.mjs            # 50 записей → dims-slice.json (в git)
 *          node tools/fetch-dims-slice.mjs --all      # весь каталог → dims-build.json (вне git)
 *          node tools/fetch-dims-slice.mjs --count 200
 */
import { writeFileSync } from 'node:fs';

// Слаг живёт в `src/lib/`, а не здесь: там он покрыт тестом детерминизма и коллизий
// (`dim-slug.test.ts` — ворота шага 1 `plans/36`). Копии функции в проекте быть не должно —
// разъехавшиеся копии дали бы разные адреса у инструмента и у сборки, и никто бы не заметил.
import { slugify } from '../src/lib/content/dim-slug.ts';

const API_KEY = 'AIzaSyCZsGkY0Lw_OJ35QhRumcD5RzNJUFsAsww';
const DOCS = 'https://firestore.googleapis.com/v1/projects/ndim-space/databases/(default)/documents';
const ALL = process.argv.includes('--all');
const COUNT = Number(process.argv[process.argv.indexOf('--count') + 1]) || 50;

// Полный каталог и срез живут в РАЗНЫХ файлах: иначе `--all` затирал бы лежащий в git запасной
// срез и оставлял в рабочем дереве 16,7 МБ изменений, которые никто не собирался коммитить.
const OUT = ALL ? 'src/lib/content/dims-build.json' : 'src/lib/content/dims-slice.json';

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

  // Срез берём с равномерным шагом, а не первые N подряд: иначе он попадёт в один вид
  // произведения и один диапазон длины описания.
  // ⚠️ ЧЕСТНАЯ ГРАНИЦА: шаг считается по УЖЕ ПРОЧИТАННЫМ записям, а чтение останавливается на
  // первой странице (300 документов). То есть срез равномерен по первым 300, а не по всем 5111.
  // Для запасного каталога сборки этого достаточно, и переплачивать 17 чтений ради фикстуры
  // незачем — но замер фазы делался на `--all`, а не на срезе, и путать их нельзя.
  let slice = dims;
  if (!ALL) {
    const step = Math.max(1, Math.floor(dims.length / COUNT));
    slice = dims.filter((_, i) => i % step === 0).slice(0, COUNT);
  }

  // 🔴 ВОРОТА ДЕТЕРМИНИЗМА (шаг 2 `plans/36`). Порядок страниц Firestore менять не обязан, но
  // полагаться на чужую гарантию, которой нам никто не давал, нельзя: один переставленный документ
  // сделал бы каждую сборку «изменением всего сайта». Сортируем сами — тогда повторный прогон на
  // неизменившемся каталоге даёт ПОБАЙТОВО тот же файл.
  slice.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

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
