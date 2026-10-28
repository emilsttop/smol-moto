import type { APIRoute } from 'astro';

const pages = ['/', '/privacy', '/terms'];

export const GET: APIRoute = ({ site }) => {
  const urls = pages.map((p) => `<url><loc>${new URL(p, site)}</loc></url>`).join('');
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`,
    { headers: { 'content-type': 'application/xml' } },
  );
};
