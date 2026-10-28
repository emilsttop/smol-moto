import type { Config } from './config.js';
import type { LeadRow } from './db.js';

export type Mail = { subject: string; text: string };
export type SendMail = (mail: Mail) => Promise<void>;

const FORMATS: Record<string, string> = {
  ride: 'Прогулка с инструктором',
  quest: 'Эндуро-квест для двоих',
  gift: 'Подарочный сертификат',
};

export function leadMail(l: Pick<LeadRow, 'id' | 'name' | 'phone' | 'format' | 'created_at'>): Mail {
  const format = FORMATS[l.format] ?? l.format;
  return {
    subject: `Заявка №${l.id}: ${format}`,
    text: [
      `Имя: ${l.name}`,
      `Телефон: ${l.phone}`,
      `Формат: ${format}`,
      `Время (UTC): ${l.created_at}`,
      '',
      'Клиент ждёт звонка.',
    ].join('\n'),
  };
}

// Unisender Go, транзакционное письмо
export function unisender(cfg: Config, fetchImpl: typeof fetch = fetch): SendMail {
  return async ({ subject, text }) => {
    if (!cfg.UNISENDER_API_KEY || !cfg.MAIL_TO) throw new Error('mail is not configured');
    const res = await fetchImpl(cfg.UNISENDER_API_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-API-KEY': cfg.UNISENDER_API_KEY },
      body: JSON.stringify({
        message: {
          recipients: [{ email: cfg.MAIL_TO }],
          subject,
          from_email: cfg.MAIL_FROM,
          from_name: 'Сайт проката',
          body: { plaintext: text },
          track_links: 0,
          track_read: 0,
        },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`unisender ${res.status}: ${(await res.text()).slice(0, 200)}`);
  };
}
