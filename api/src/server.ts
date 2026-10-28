import pino from 'pino';
import { loadConfig } from './config.js';
import { buildApp } from './app.js';

const cfg = loadConfig();
const log = pino({ level: cfg.LOG_LEVEL });
const app = await buildApp({ cfg, logger: log });

const shutdown = async () => {
  await app.close();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

await app.listen({ port: cfg.PORT, host: cfg.HOST });
