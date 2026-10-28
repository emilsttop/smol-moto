import { z } from 'zod';

// Сервер только раздаёт собранный сайт: форм и приёма заявок нет, персональные данные не обрабатываются.
const Env = z.object({
  PORT: z.coerce.number().default(8787),
  HOST: z.string().default('127.0.0.1'),
  // папка со сборкой сайта (web/dist). Пусто: отдаётся только /api/health
  STATIC_DIR: z.string().default(''),
  LOG_LEVEL: z.string().default('info'),
});

export type Config = z.infer<typeof Env>;
export const loadConfig = (env: NodeJS.ProcessEnv = process.env): Config => Env.parse(env);
