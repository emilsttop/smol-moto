import { z } from 'zod';

const Env = z.object({
  PORT: z.coerce.number().default(8787),
  HOST: z.string().default('127.0.0.1'),
  DB_PATH: z.string().default('./data/leads.db'),
  IP_SALT: z.string().min(8).default('dev-salt-not-for-prod'),
  SITE_ORIGIN: z.string().default('http://localhost:4321'),
  UNISENDER_API_KEY: z.string().default(''),
  UNISENDER_API_URL: z.string().url().default('https://go1.unisender.ru/ru/transactional/api/v1/email/send.json'),
  MAIL_FROM: z.string().default('noreply@example.ru'),
  MAIL_TO: z.string().default(''),
  LOG_LEVEL: z.string().default('info'),
  // папка со сборкой сайта (web/dist). Пусто: API без раздачи статики (за nginx)
  STATIC_DIR: z.string().default(''),
  // приём заявок с формы. Сейчас формы на сайте нет (персональные данные не собираем), поэтому выключено
  LEADS_ENABLED: z.enum(['true', 'false']).default('false'),
});

export type Config = z.infer<typeof Env>;
export const loadConfig = (env: NodeJS.ProcessEnv = process.env): Config => Env.parse(env);
