import { describe, it, expect, beforeEach } from 'vitest';
import { openDb } from '../../src/db.js';
import { generateCode, createLink, resolveLink, listLinks, getStats } from '../../src/shorten.js';

// UNIT: доменний seam — чисті функції src/shorten.js над реальною in-memory БД.
// HTTP тут не задіяний; роути перевіряє tests/integration/shorten.test.js.
describe('generateCode', () => {
  it('повертає 7 символів з алфавіту base62', () => {
    expect(generateCode()).toMatch(/^[A-Za-z0-9]{7}$/);
  });

  it('не повторює той самий код підряд', () => {
    const codes = new Set(Array.from({ length: 50 }, () => generateCode()));
    expect(codes.size).toBe(50);
  });
});

describe('домен shortener', () => {
  let db;
  beforeEach(() => {
    db = openDb(':memory:');
  });

  it('createLink віддає код, за яким resolveLink знаходить оригінал', () => {
    const { code } = createLink(db, 'https://example.com/a');
    expect(resolveLink(db, code).url).toBe('https://example.com/a');
  });

  it('createLink видає різні коди різним лінкам', () => {
    const first = createLink(db, 'https://example.com/a');
    const second = createLink(db, 'https://example.com/b');
    expect(first.code).not.toBe(second.code);
  });

  it('resolveLink на невідомий код віддає null', () => {
    expect(resolveLink(db, 'nope123')).toBeNull();
  });

  it('кожен resolveLink додає один клік', () => {
    const { code } = createLink(db, 'https://example.com');
    expect(getStats(db, code).clicks).toBe(0);

    resolveLink(db, code);
    resolveLink(db, code);

    expect(getStats(db, code).clicks).toBe(2);
  });

  it('getStats на невідомий код віддає null', () => {
    expect(getStats(db, 'nope123')).toBeNull();
  });

  // Порядок не перевіряємо: created_at має точність до мілісекунди, тож два підряд
  // створені лінки лягають з однаковим ключем сортування.
  it('listLinks віддає всі створені лінки', () => {
    createLink(db, 'https://example.com/first');
    createLink(db, 'https://example.com/second');

    const urls = listLinks(db).map((l) => l.url);
    expect(urls).toHaveLength(2);
    expect(urls).toEqual(expect.arrayContaining(['https://example.com/first', 'https://example.com/second']));
  });
});
