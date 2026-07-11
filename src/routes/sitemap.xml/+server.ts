// sitemap.xml — пререндеренный эндпоинт (researches/08 §4): при сборке adapter-static
// превращается в статический файл build/sitemap.xml и раздаётся хостингом как есть.
//
// В карту входят ТОЛЬКО публичные индексируемые страницы. /profile и /relations под
// noindex (прод-заглушка до миграции данных 2.0) — их здесь быть не должно.
// Google игнорирует <priority> и <changefreq>, а <lastmod> учитывает только правдивый,
// поэтому пишем один <loc> (researches/08 §4, KISS).
import { SITE_ORIGIN } from '$lib/site';

export const prerender = true;

const PUBLIC_PATHS = ['/'];

export function GET(): Response {
  const urls = PUBLIC_PATHS.map((path) => `  <url><loc>${SITE_ORIGIN}${path}</loc></url>`).join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml' } });
}
