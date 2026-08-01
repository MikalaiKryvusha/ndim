// sitemap.xml — пререндеренный эндпоинт (researches/08 §4): при сборке adapter-static
// превращается в статический файл build/sitemap.xml и раздаётся хостингом как есть.
//
// В карту входят ТОЛЬКО публичные индексируемые страницы. Личные экраны (/profile, /relations,
// /dims, /space, /account, /menu, /auth/action) закрыты `noindex` — их здесь быть не должно.
// ⚠️ Прежний комментарий называл их «прод-заглушкой до миграции данных 2.0» — это перестало быть
// правдой 12.07.2026, когда 2.0 выкатили. Это живые экраны продукта, закрытые по приватности.
// Google игнорирует <priority> и <changefreq>, а <lastmod> учитывает только правдивый,
// поэтому пишем один <loc> (researches/08 §4, KISS).
import { SITE_ORIGIN } from '$lib/site';
import { DOCS } from '$lib/content/docs';

export const prerender = true;

/*
 * `/delete-account` здесь НЕ по недосмотру, а по требованию.
 *
 * Все прочие экраны аккаунта закрыты `noindex`, но страница удаления обязана НАХОДИТЬСЯ:
 * Google Play требует «readily discoverable option to initiate account deletion» и
 * веб-ресурс, по которому удаление можно запросить, НЕ возвращаясь в приложение. Закрыв её
 * от поиска, мы выполнили бы букву требования и убили его смысл.
 *
 * Приватных данных на ней нет: до входа это дверь, после входа — шаг подтверждения.
 */
/*
 * 🔓 ДОКУМЕНТЫ ДОБАВЛЕНЫ В КАРТУ 2026-08-01 — слово владельца «Открываем всё!» (интервью №009,
 * В11). До этой правки в карте было ДВА адреса; открыть страницы и не сказать о них поисковику
 * значило сделать половину работы.
 *
 * Список берётся ИЗ САМИХ ДОКУМЕНТОВ (`DOCS`), а не переписывается руками: появится новый
 * документ — он попадёт в карту сам. Руками написанный список разошёлся бы с правдой в первый же
 * раз, когда кто-то добавит страницу и забудет про этот файл.
 *
 * `history` исключена намеренно — она не отдельная страница, а раздел внутри «Меню»
 * (`menu/[slug]/+page.ts` исключает её из пререндера тем же способом).
 * `about` и `author` живут отдельными маршрутами, а не через `[slug]`, поэтому дописаны явно.
 */
const DOC_PATHS = Object.keys(DOCS)
  .filter((slug) => slug !== 'history')
  .map((slug) => `/menu/${slug}`);

const PUBLIC_PATHS = [
  '/',
  '/delete-account',
  ...DOC_PATHS,
  '/menu/about',
  '/menu/author',
  '/menu/support',
  '/menu/donate',
  '/menu/share',
];

export function GET(): Response {
  const urls = PUBLIC_PATHS.map((path) => `  <url><loc>${SITE_ORIGIN}${path}</loc></url>`).join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml' } });
}
