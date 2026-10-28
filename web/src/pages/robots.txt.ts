import type { APIRoute } from 'astro';

// адрес sitemap берётся из SITE_URL сборки, чтобы не править файл при смене домена
export const GET: APIRoute = ({ site }) =>
  new Response(`User-agent: *\nAllow: /\nSitemap: ${new URL('/sitemap.xml', site)}\n`, {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
