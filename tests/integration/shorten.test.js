import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { openDb } from '../../src/db.js';
import { createApp } from '../../src/app.js';

// INTEGRATION: повний прохід базової вертикалі (happy path) через HTTP-seam
// `createApp(openDb(':memory:'))`. Прецедент для тестів кожної наступної фічі.
describe('shortener — базова вертикаль', () => {
  let app;
  beforeEach(() => {
    app = createApp(openDb(':memory:'));
  });

  it('створює короткий код і повертає short_url', async () => {
    const res = await request(app)
      .post('/api/shorten')
      .send({ url: 'https://example.com/very/long/path' });
    expect(res.status).toBe(201);
    expect(res.body.code).toHaveLength(7);
    expect(res.body.short_url).toContain(res.body.code);
  });

  it('редіректить (302) з коду на оригінал і рахує клік', async () => {
    const { body } = await request(app)
      .post('/api/shorten')
      .send({ url: 'https://example.com' });
    const redirect = await request(app).get(`/${body.code}`);
    expect(redirect.status).toBe(302);
    expect(redirect.headers.location).toBe('https://example.com');

    const stats = await request(app).get(`/api/stats/${body.code}`);
    expect(stats.body.clicks).toBe(1);
  });

  it('невідомий код → 404', async () => {
    const res = await request(app).get('/api/stats/nope123');
    expect(res.status).toBe(404);
  });

  it('редірект на невідомий код → 404 у канонічній формі помилки', async () => {
    const res = await request(app).get('/nope123');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not found' });
  });

  it('бите тіло запиту лишається клієнтською помилкою (400, не 500)', async () => {
    const res = await request(app)
      .post('/api/shorten')
      .set('content-type', 'application/json')
      .send('{"url": broken');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'bad request' });
  });
});
