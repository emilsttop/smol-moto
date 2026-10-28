import { defineConfig } from 'astro/config';

// SITE_URL задаётся в CI; локально — заглушка для canonical и sitemap
export default defineConfig({
  site: process.env.SITE_URL ?? 'https://moto-smolensk.ru',
  trailingSlash: 'never',
  build: { format: 'file', inlineStylesheets: 'auto' },
  vite: {
    server: {
      proxy: { '/api': 'http://127.0.0.1:8787' },
    },
  },
});
