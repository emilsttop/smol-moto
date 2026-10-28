import pino from 'pino';
import { loadConfig } from './config.js';
import { openDb } from './db.js';
import { unisender } from './mailer.js';
import { buildApp, retryPending } from './app.js';

const cfg = loadConfig();
const log = pino({ level: cfg.LOG_LEVEL });
const db = openDb(cfg.DB_PATH);
const send = unisender(cfg);

// Алерты владельцу на почту, не чаще раза в час
let lastAlert = 0;
const alert = (msg: string) => {
  if (Date.now() - lastAlert < 3_600_000) return;
  lastAlert = Date.now();
  send({ subject: 'Сайт проката: ошибка', text: msg }).catch((err) => log.error({ err }, 'alert failed'));
};

const app = await buildApp({ cfg, db, send, alert, logger: log });

const retryTimer = setInterval(() => {
  retryPending(db, send, log)
    .then(() => {
      const stuck = db.pending().filter((l) => l.mail_attempts >= 3);
      if (stuck.length) alert(`Заявки не уходят на почту: ${stuck.map((l) => l.id).join(', ')}. Проверьте Unisender.`);
    })
    .catch((err) => log.error({ err }, 'retry loop'));
}, 5 * 60_000);

const purgeTimer = setInterval(() => {
  const n = db.purgeOld();
  if (n) log.info({ n }, 'purged old leads');
}, 24 * 3_600_000);

const shutdown = async () => {
  clearInterval(retryTimer);
  clearInterval(purgeTimer);
  await app.close();
  db.close();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

await app.listen({ port: cfg.PORT, host: cfg.HOST });
