import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createLink, resolveLink, listLinks, getStats } from './shorten.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Фабрика застосунку — приймає db, щоб тести підсовували ':memory:'.
export function createApp(db) {
  const app = express();
  app.use(express.json());

  // --- Frontend (статика) ---
  app.use(express.static(join(__dirname, 'public')));

  app.get('/healthz', (_req, res) => res.json({ ok: true }));

  // ============================================================
  //  Базова вертикаль: shorten + redirect + list + stats
  // ============================================================
  app.post('/api/shorten', (req, res) => {
    const { url } = req.body ?? {};
    // ⚠ Валідації НЕМА — вона приїде з фічею docs/features/input-validation/.
    const { code } = createLink(db, url);
    res.status(201).json({ code, short_url: `${req.protocol}://${req.get('host')}/${code}` });
  });

  app.get('/api/links', (_req, res) => res.json(listLinks(db)));

  app.get('/api/stats/:code', (req, res) => {
    const stats = getStats(db, req.params.code);
    if (!stats) return res.status(404).json({ error: 'not found' });
    res.json(stats);
  });

  // ============================================================
  //  ЗАГЛУШКИ — ендпоінти, чиї фічі ще в беклозі (docs/roadmap.md) → 501
  // ============================================================
  const notImplemented = (feature) => (_req, res) =>
    res.status(501).json({ error: 'not implemented', feature });

  app.get('/metrics', notImplemented('metrics'));
  app.get('/api/qr/:code', notImplemented('qr-codes'));
  app.delete('/api/:code', notImplemented('bulk-and-delete'));

  // TODO: невідомий шлях під /api віддає HTML-сторінку Express, а не { error }

  // --- Redirect (тримати ПІСЛЯ /api/*, щоб не перехоплював) ---
  app.get('/:code', (req, res) => {
    const link = resolveLink(db, req.params.code);
    if (!link) return res.status(404).json({ error: 'not found' });
    res.redirect(302, link.url);
  });

  // Останній рубіж: неперехоплена помилка віддається в тій самій формі, що й решта
  // помилок, а не стектрейсом у тіло відповіді. Помилки з власним статусом (напр.
  // express.json() на битому тілі → 400) лишаються клієнтськими, не стають 500.
  app.use((err, _req, res, _next) => {
    const status = err.status ?? err.statusCode ?? 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? 'internal error' : 'bad request' });
  });

  return app;
}
