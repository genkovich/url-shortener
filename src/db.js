import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// Одне джерело для БД. Тести відкривають ':memory:', прод — файл із DB_PATH.
export function openDb(path = process.env.DB_PATH || 'data/links.db') {
  // better-sqlite3 не створює теку сама — на чистому клоні data/ ще немає.
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  migrate(db);
  return db;
}

// Базова схема. Нові фічі (expiry, alias) додають колонки окремими міграціями —
// конвенція в docs/architecture-map.md (Conventions → Migrations).
export function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS links (
      code       TEXT PRIMARY KEY,
      url        TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      clicks     INTEGER NOT NULL DEFAULT 0
    );
  `);
}
