import Fastify, { type FastifyBaseLogger } from 'fastify';
import helmet from '@fastify/helmet';
import fastifyStatic from '@fastify/static';
import { resolve } from 'node:path';
import type { Config } from './config.js';

type Deps = { cfg: Config; logger?: FastifyBaseLogger };

// Astro встраивает небольшие модульные скрипты прямо в HTML, поэтому script-src допускает inline.
// Всё остальное закрыто: никаких внешних источников, фреймов, форм и плагинов.
const CSP = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'", "'unsafe-inline'"],
  styleSrc: ["'self'", "'unsafe-inline'"],
  imgSrc: ["'self'", 'data:'],
  fontSrc: ["'self'"],
  mediaSrc: ["'self'"],
  connectSrc: ["'self'"],
  objectSrc: ["'none'"],
  baseUri: ["'self'"],
  formAction: ["'none'"],
  frameAncestors: ["'none'"],
};

export async function buildApp({ cfg, logger }: Deps) {
  // trustProxy не включаем: адрес клиента нигде не используется, заголовкам X-Forwarded-* не доверяем
  const app = Fastify({ ...(logger ? { loggerInstance: logger } : {}), bodyLimit: 1024 });

  await app.register(helmet, { contentSecurityPolicy: { useDefaults: false, directives: CSP } });

  // проверка живости без внутренних подробностей
  app.get('/api/health', async () => ({ ok: true }));

  // Раздача собранного сайта, когда перед сервером нет nginx (Windows-машина за Tailscale Funnel)
  if (cfg.STATIC_DIR) {
    const root = resolve(cfg.STATIC_DIR);
    await app.register(fastifyStatic, {
      root,
      extensions: ['html'],
      // свой cache-control плагина (max-age=0) иначе перезаписывает заголовки из setHeaders
      cacheControl: false,
      setHeaders(res, path) {
        // хэшированные ассеты не меняются, фото редко, HTML всегда свежий; пути бывают и с \ (Windows)
        if (/[\\/]_astro[\\/]/.test(path)) res.setHeader('cache-control', 'public, max-age=31536000, immutable');
        else if (/[\\/]img[\\/]/.test(path)) res.setHeader('cache-control', 'public, max-age=2592000');
        else res.setHeader('cache-control', 'no-cache');
      },
    });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.code(404).send({ ok: false, error: 'not-found' });
      return reply.code(404).type('text/html').sendFile('404.html');
    });
  }

  app.setErrorHandler((err: Error & { statusCode?: number }, req, reply) => {
    const code = err.statusCode ?? 500;
    if (code >= 500) req.log.error({ err }, 'unhandled');
    reply.code(code).send({ ok: false, error: 'error' });
  });

  return app;
}
