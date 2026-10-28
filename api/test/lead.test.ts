import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildApp, retryPending } from '../src/app.js';
import { openDb, type Db } from '../src/db.js';
import { loadConfig } from '../src/config.js';
import { unisender } from '../src/mailer.js';

const cfg = loadConfig({ LEADS_ENABLED: 'true' });
const good = { name: 'Иван', phone: '+79991234567', format: 'quest', consent: true, company: '', elapsed: 9000 };

describe('POST /api/lead', () => {
  let db: Db;
  let send: ReturnType<typeof vi.fn>;
  const make = () => buildApp({ cfg, db, send, alert: () => {} });

  beforeEach(() => {
    db = openDb(':memory:');
    send = vi.fn().mockResolvedValue(undefined);
  });

  it('сохраняет заявку и отправляет письмо', async () => {
    const app = await make();
    const res = await app.inject({ method: 'POST', url: '/api/lead', payload: good });
    expect(res.statusCode).toBe(200);
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0][0].text).toContain('+79991234567');
    expect(db.getLead(1)?.mail_status).toBe('sent');
  });

  it('отклоняет невалидный телефон, короткое имя и отсутствие согласия', async () => {
    const app = await make();
    for (const payload of [{ ...good, phone: '12345' }, { ...good, consent: false }, { ...good, name: 'a' }]) {
      const res = await app.inject({ method: 'POST', url: '/api/lead', payload });
      expect(res.statusCode).toBe(400);
    }
    expect(db.getLead(1)).toBeUndefined();
  });

  it('молча отбрасывает ботов: honeypot и слишком быструю отправку', async () => {
    const app = await make();
    const a = await app.inject({ method: 'POST', url: '/api/lead', payload: { ...good, company: 'ООО' } });
    const b = await app.inject({ method: 'POST', url: '/api/lead', payload: { ...good, elapsed: 500 } });
    expect([a.statusCode, b.statusCode]).toEqual([200, 200]);
    expect(db.getLead(1)).toBeUndefined();
    expect(send).not.toHaveBeenCalled();
  });

  it('ограничивает 5 заявок за 10 минут с одного IP', async () => {
    const app = await make();
    const codes: number[] = [];
    for (let i = 0; i < 6; i++) codes.push((await app.inject({ method: 'POST', url: '/api/lead', payload: good })).statusCode);
    expect(codes.slice(0, 5).every((c) => c === 200)).toBe(true);
    expect(codes[5]).toBe(429);
  });

  it('не теряет заявку, если почта упала, и дошлёт её ретраем', async () => {
    send.mockRejectedValueOnce(new Error('down'));
    const app = await make();
    const res = await app.inject({ method: 'POST', url: '/api/lead', payload: good });
    expect(res.statusCode).toBe(200);
    expect(db.getLead(1)?.mail_status).toBe('pending');
    await retryPending(db, send, { error: () => {} });
    expect(db.getLead(1)?.mail_status).toBe('sent');
    expect(send).toHaveBeenCalledTimes(2);
  });
});

describe('unisender', () => {
  it('шлёт письмо на MAIL_TO с ключом в заголовке', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    const c = { ...cfg, UNISENDER_API_KEY: 'k', MAIL_TO: 'publik.emil@gmail.com' };
    await unisender(c, fetchMock as unknown as typeof fetch)({ subject: 's', text: 't' });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers['X-API-KEY']).toBe('k');
    expect(JSON.parse(init.body).message.recipients[0].email).toBe('publik.emil@gmail.com');
  });
});

describe('заявки выключены', () => {
  it('по умолчанию /api/lead не принимает данные', async () => {
    const app = await buildApp({ cfg: loadConfig({}), db: openDb(':memory:'), send: vi.fn(), alert: () => {} });
    const res = await app.inject({ method: 'POST', url: '/api/lead', payload: good });
    expect(res.statusCode).toBe(404);
  });
});

describe('static site', () => {
  it('отдаёт страницы без .html и 404 для неизвестных', async () => {
    const { mkdtempSync, writeFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { tmpdir } = await import('node:os');
    const dir = mkdtempSync(join(tmpdir(), 'site-'));
    writeFileSync(join(dir, 'index.html'), '<h1>home</h1>');
    writeFileSync(join(dir, 'privacy.html'), '<h1>privacy</h1>');
    writeFileSync(join(dir, '404.html'), '<h1>nope</h1>');
    const app = await buildApp({ cfg: { ...cfg, STATIC_DIR: dir }, db: openDb(':memory:'), send: vi.fn(), alert: () => {} });
    expect((await app.inject('/')).body).toContain('home');
    expect((await app.inject('/privacy')).body).toContain('privacy');
    const miss = await app.inject('/nothing');
    expect(miss.statusCode).toBe(404);
    expect(miss.body).toContain('nope');
    expect((await app.inject('/api/health')).statusCode).toBe(200);
  });
});
