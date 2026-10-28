import Fastify, { type FastifyBaseLogger } from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Config } from './config.js';
import type { Db } from './db.js';
import { leadMail, type SendMail } from './mailer.js';

export const LeadInput = z.object({
  name: z.string().trim().min(2).max(60),
  phone: z.string().regex(/^\+7\d{10}$/),
  format: z.enum(['ride', 'quest', 'gift']),
  consent: z.literal(true),
  company: z.string().max(200).optional().default(''),
  elapsed: z.number().int().nonnegative(),
});

// человек физически не успеет заполнить форму и удержать кнопку быстрее
const MIN_FILL_MS = 3000;

type Deps = {
  cfg: Config;
  db: Db;
  send: SendMail;
  alert: (msg: string) => void;
  logger?: FastifyBaseLogger;
};

export async function buildApp({ cfg, db, send, alert, logger }: Deps) {
  const app = Fastify({ ...(logger ? { loggerInstance: logger } : {}), trustProxy: true, bodyLimit: 2048 });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, { origin: cfg.SITE_ORIGIN, methods: ['POST'] });
  await app.register(rateLimit, { global: false });

  const hashIp = (ip: string) => createHash('sha256').update(cfg.IP_SALT + ip).digest('hex').slice(0, 32);

  app.get('/api/health', async () => {
    db.raw.prepare('SELECT 1').get();
    return { ok: true, pending: db.pending().length };
  });

  if (cfg.LEADS_ENABLED === 'true') app.post(
    '/api/lead',
    { config: { rateLimit: { max: 5, timeWindow: '10 minutes' } } },
    async (req, reply) => {
      const parsed = LeadInput.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ ok: false, error: 'invalid' });
      const lead = parsed.data;

      // боты: заполнили скрытое поле или отправили быстрее человека. Отвечаем «ок», ничего не сохраняем
      if (lead.company || lead.elapsed < MIN_FILL_MS) {
        req.log.warn({ reason: lead.company ? 'honeypot' : 'too-fast' }, 'lead dropped');
        return { ok: true };
      }

      const id = db.addLead({ name: lead.name, phone: lead.phone, format: lead.format, ipHash: hashIp(req.ip) });
      // заявка уже в базе: если письмо не уйдёт, его дошлёт фоновой ретрай
      try {
        await send(leadMail(db.getLead(id)!));
        db.markSent(id);
      } catch (err) {
        db.bumpAttempt(id);
        req.log.error({ err, id }, 'lead mail failed, queued for retry');
      }
      return { ok: true };
    },
  );

  // Раздача собранного сайта, когда перед API нет nginx (Windows-машина за Tailscale Funnel)
  if (cfg.STATIC_DIR) {
    const root = resolve(cfg.STATIC_DIR);
    await app.register(fastifyStatic, {
      root,
      extensions: ['html'],
      setHeaders(res, path) {
        // хэшированные ассеты не меняются, фото редко, HTML всегда свежий
        if (path.includes('_astro')) res.setHeader('cache-control', 'public, max-age=31536000, immutable');
        else if (/[\/]img[\/]/.test(path)) res.setHeader('cache-control', 'public, max-age=2592000');
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
    if (code >= 500) {
      req.log.error({ err }, 'unhandled');
      alert(`API 500: ${err.message}`);
    }
    reply.code(code).send({ ok: false, error: code === 429 ? 'rate' : 'error' });
  });

  return app;
}

// Повторная отправка писем по заявкам, которые не ушли сразу
export async function retryPending(db: Db, send: SendMail, log: { error: (o: object, m: string) => void }) {
  for (const l of db.pending()) {
    try {
      await send(leadMail(l));
      db.markSent(l.id);
    } catch (err) {
      db.bumpAttempt(l.id);
      log.error({ err, id: l.id, attempts: l.mail_attempts + 1 }, 'retry failed');
    }
  }
}
