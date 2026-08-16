/**
 * ЗАМЕР «МЕСТА ОБЪЕКТА В СВОЁМ ВИДЕ» — чем подкрепляются макеты для владельца (интервью №036, В1).
 *
 * Владелец прочитал вопрос и ответил дословно: «*не понимаю проблему. Наверное, нужно чтобы ты еще
 * проще пояснил и нарисовал макеты с визуализацией проблемы*». Макет без чисел был бы рисунком
 * моего мнения, поэтому сначала прибор, потом картинка: страница `design/catalog-place-mockups.html`
 * подставляет ровно то, что печатает этот файл.
 *
 * Прибор НЕ страж — он ничего не выносит на приёмку продукта и никого не красит. Его работа —
 * ответить числом на вопрос «насколько место в середине списка случайно».
 *
 * 🔑 МЕРА СЛУЧАЙНОСТИ ВЫБРАНА ТАК, ЧТОБЫ ЕЁ МОЖНО БЫЛО ПРОВЕРИТЬ РУКАМИ: сколько мест теряет
 * объект, если ОДИН человек поставит ему «5». Один голос — это наименьшее событие, какое вообще
 * может случиться с объектом; если от наименьшего события место едет на сотни строк, то место
 * говорит не об объекте, а о том, кто случайно зашёл.
 *
 * Порядок и формула берутся ИЗ ПРОДУКТА (`catalog-hub.ts`), а не повторяются здесь: повтор
 * формулы в приборе — это второй источник истины, который разъедется с первым в тот день, когда
 * владелец снова поменяет кривую (а он менял её восемь раз за один день).
 *
 * Запуск:
 *   node tools/measure-catalog-place.mjs            # сводка по всем видам + движение от голоса
 *   node tools/measure-catalog-place.mjs --json     # то же машиночитаемо (вход для макетов)
 */
import { readFileSync } from 'node:fs';
import { groupByKind, placesIn, makeComparator } from '../src/lib/content/catalog-hub.ts';

const SNAPSHOT = 'src/lib/content/dims-build.json';

/** Голос, которым мерится сдвиг: середина шкалы 0…10 — самое обычное, что может поставить человек. */
const PROBE_VOTE = 5;

const raw = JSON.parse(readFileSync(SNAPSHOT, 'utf8'));
const all = (Array.isArray(raw) ? raw : Object.values(raw)).map((d) => ({
  slug: d.slug,
  type: d.type,
  title: d.title,
  rating: d.rating ?? 0,
  rates: d.rates ?? 0,
}));

const { hubs, prior } = groupByKind(all);
const compare = makeComparator(prior);

/** Место объекта после того, как ему добавили один голос `vote`. Список пересортировывается целиком. */
const rankAfterVote = (list, slug, vote) => {
  const changed = list.map((d) =>
    d.slug === slug
      ? { ...d, rates: d.rates + 1, rating: (d.rating * d.rates + vote) / (d.rates + 1) }
      : d,
  );
  changed.sort(compare);
  return placesIn(changed).get(slug)?.rank ?? 0;
};

const report = { prior: { m: prior.m, c: prior.c }, probeVote: PROBE_VOTE, kinds: [] };

for (const [key, list] of hubs) {
  const rated = list.filter((d) => d.rates > 0);
  if (rated.length < 20) continue;

  const places = placesIn(list);
  const rows = rated.map((d) => ({
    slug: d.slug,
    title: d.title,
    rating: d.rating,
    rates: d.rates,
    rank: places.get(d.slug).rank,
  }));
  rows.sort((a, b) => a.rank - b.rank);

  // Полосы мест: голова (1–50), вторая полусотня, середина, хвост.
  const of = rows.length;
  const bands = [
    { name: '1–50', from: 1, to: 50 },
    { name: '51–100', from: 51, to: 100 },
    { name: 'середина', from: Math.floor(of * 0.45) + 1, to: Math.floor(of * 0.55) },
    { name: 'хвост', from: of - 49, to: of },
  ].map((b) => {
    const inBand = rows.filter((r) => r.rank >= b.from && r.rank <= b.to);
    const votes = inBand.map((r) => r.rates);
    const one = votes.filter((v) => v === 1).length;
    return {
      ...b,
      n: inBand.length,
      avgVotes: votes.reduce((s, v) => s + v, 0) / (inBand.length || 1),
      onlyOneVote: one,
      onlyOneVotePct: Math.round((one / (inBand.length || 1)) * 100),
      minRating: Math.min(...inBand.map((r) => r.rating)),
      maxRating: Math.max(...inBand.map((r) => r.rating)),
    };
  });

  // Сдвиг от ОДНОГО голоса — по образцам мест, равномерно разложенным по списку.
  const probes = [1, 10, 50, 100, Math.round(of * 0.25), Math.round(of / 2), Math.round(of * 0.75)]
    .filter((r, i, a) => r >= 1 && r <= of && a.indexOf(r) === i)
    .sort((a, b) => a - b)
    .map((rank) => {
      const row = rows[rank - 1];
      const after = rankAfterVote(list, row.slug, PROBE_VOTE);
      return { rank, after, moved: after - rank, rating: row.rating, rates: row.rates, title: row.title };
    });

  report.kinds.push({ key, total: list.length, rated: of, rows: rows.slice(0, 5), bands, probes,
    maxVotes: Math.max(...rows.map((r) => r.rates)) });
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 1));
} else {
  console.log(`опора каталога: m=${prior.m} · C=${prior.c.toFixed(3)} · пробный голос ${PROBE_VOTE}\n`);
  for (const k of report.kinds) {
    console.log(`— ${k.key}: ${k.rated} оценённых из ${k.total}, максимум голосов ${k.maxVotes}`);
    for (const b of k.bands) {
      console.log(
        `   места ${b.name.padEnd(9)} голосов в среднем ${b.avgVotes.toFixed(2)} · ` +
          `с одним голосом ${String(b.onlyOneVote).padStart(3)} из ${String(b.n).padStart(3)} (${b.onlyOneVotePct}%) · ` +
          `оценки ${b.minRating.toFixed(1)}…${b.maxRating.toFixed(1)}`,
      );
    }
    for (const p of k.probes) {
      console.log(
        `   место ${String(p.rank).padStart(4)} (${p.rating.toFixed(1)} × ${p.rates}) ` +
          `+ один голос «${PROBE_VOTE}» → ${p.after} (${p.moved >= 0 ? '+' : ''}${p.moved})`,
      );
    }
    console.log('');
  }
}
