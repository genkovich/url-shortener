import { openDb } from './db.js';
import { createApp } from './app.js';

const PORT = process.env.PORT || 3000;
const db = openDb();
const app = createApp(db);

app.listen(PORT, () => {
  console.log(`url-shortener → http://localhost:${PORT}`);
});
