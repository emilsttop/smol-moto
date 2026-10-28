import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

let dir: string;
beforeAll(() => {
  // каталог сайта внутри временной папки, рядом с ним «секретный» файл, который не должен отдаваться
  const base = mkdtempSync(join(tmpdir(), 'site-'));
  dir = join(base, 'web');
  mkdirSync(join(dir, 'img'), { recursive: true });
  writeFileSync(join(dir, 'index.html'), '<h1>home</h1>');
  writeFileSync(join(dir, 'privacy.html'), '<h1>privacy</h1>');
  writeFileSync(join(dir, '404.html'), '<h1>nope</h1>');
  writeFileSync(join(dir, 'img', 'a.webp'), 'img');
  writeFileSync(join(base, 'secret.env'), 'TOKEN=1');
});

const make = () => buildApp({ cfg: { ...loadConfig({}), STATIC_DIR: dir } });

describe('сайт', () => {
  it('отдаёт страницы без .html и 404 для неизвестных', async () => {
    const app = await make();
    expect((await app.inject('/')).body).toContain('home');
    expect((await app.inject('/privacy')).body).toContain('privacy');
    const miss = await app.inject('/nothing');
    expect(miss.statusCode).toBe(404);
    expect(miss.body).toContain('nope');
  });

  it('не выпускает за пределы папки сайта', async () => {
    const app = await make();
    for (const url of ['/../secret.env', '/%2e%2e/secret.env', '/img/..%2f..%2fsecret.env']) {
      const res = await app.inject(url);
      expect(res.body).not.toContain('TOKEN');
    }
  });

  it('ставит CSP с запретом фреймов и форм', async () => {
    const res = await (await make()).inject('/');
    const csp = String(res.headers['content-security-policy']);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("form-action 'none'");
    expect(csp).toContain("object-src 'none'");
  });

  it('кэширует картинки, а HTML нет', async () => {
    const app = await make();
    expect((await app.inject('/img/a.webp')).headers['cache-control']).toContain('max-age=2592000');
    expect((await app.inject('/')).headers['cache-control']).toBe('no-cache');
  });
});

describe('api', () => {
  it('health отвечает без внутренних подробностей', async () => {
    const res = await (await make()).inject('/api/health');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it('приёма заявок нет', async () => {
    const res = await (await make()).inject({ method: 'POST', url: '/api/lead', payload: { name: 'x' } });
    expect(res.statusCode).toBe(404);
  });
});
