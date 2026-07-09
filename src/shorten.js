// Доменний шар shortener — базова вертикаль (happy path), фіча `base-vertical`.
// Валідації, дедупу й expiry тут навмисно немає: кожне з них — окрема фіча
// з власним SDD-пакетом (docs/features/*/spec.md, черга — docs/roadmap.md).

import { randomInt } from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'; // base62
const CODE_LEN = 7; // рішення: docs/adr/0001-base62-7-char-codes.md

export function generateCode() {
  let code = '';
  for (let i = 0; i < CODE_LEN; i++) {
    code += ALPHABET[randomInt(ALPHABET.length)];
  }
  return code;
}

// Створити короткий лінк. Happy path: url приходить сюди вже валідним.
export function createLink(db, url) {
  let code = generateCode();
  // мінімальний захист від колізії первинного ключа
  while (db.prepare('SELECT 1 FROM links WHERE code = ?').get(code)) {
    code = generateCode();
  }
  db.prepare(
    'INSERT INTO links (code, url, created_at, clicks) VALUES (?, ?, ?, 0)'
  ).run(code, url, Date.now());
  return { code };
}

// Знайти лінк за кодом і врахувати клік. null → немає такого коду.
export function resolveLink(db, code) {
  const row = db.prepare('SELECT * FROM links WHERE code = ?').get(code);
  if (!row) return null;
  db.prepare('UPDATE links SET clicks = clicks + 1 WHERE code = ?').run(code);
  return row;
}

export function listLinks(db) {
  return db.prepare('SELECT * FROM links ORDER BY created_at DESC').all();
}

export function getStats(db, code) {
  return db.prepare('SELECT code, clicks, created_at FROM links WHERE code = ?').get(code) || null;
}
