import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type LeadRow = {
  id: number;
  created_at: string;
  name: string;
  phone: string;
  format: string;
  ip_hash: string;
  mail_status: 'pending' | 'sent';
  mail_attempts: number;
};

export function openDb(path: string) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      format TEXT NOT NULL,
      ip_hash TEXT NOT NULL,
      mail_status TEXT NOT NULL DEFAULT 'pending',
      mail_attempts INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS leads_pending ON leads (mail_status) WHERE mail_status = 'pending';
  `);

  const insert = db.prepare('INSERT INTO leads (name, phone, format, ip_hash) VALUES (?, ?, ?, ?)');
  const byId = db.prepare('SELECT * FROM leads WHERE id = ?');
  const pending = db.prepare("SELECT * FROM leads WHERE mail_status = 'pending' AND mail_attempts < 20 ORDER BY id LIMIT 20");
  const markSent = db.prepare("UPDATE leads SET mail_status = 'sent' WHERE id = ?");
  const bumpAttempt = db.prepare('UPDATE leads SET mail_attempts = mail_attempts + 1 WHERE id = ?');
  // ФЗ-152: не храним заявки дольше 12 месяцев
  const purge = db.prepare("DELETE FROM leads WHERE created_at < datetime('now', '-12 months')");

  return {
    raw: db,
    addLead: (l: { name: string; phone: string; format: string; ipHash: string }) =>
      Number(insert.run(l.name, l.phone, l.format, l.ipHash).lastInsertRowid),
    getLead: (id: number) => byId.get(id) as LeadRow | undefined,
    pending: () => pending.all() as LeadRow[],
    markSent: (id: number) => markSent.run(id),
    bumpAttempt: (id: number) => bumpAttempt.run(id),
    purgeOld: () => purge.run().changes,
    close: () => db.close(),
  };
}

export type Db = ReturnType<typeof openDb>;
