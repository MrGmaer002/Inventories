import { openDatabase } from './db.ts';
import { createApp } from './app.ts';
import { config } from './config.ts';

const db = openDatabase();
const app = createApp(db);

app.listen(config.port, () => {
  console.log(`\n  PanCafe API  ->  http://localhost:${config.port}`);
  console.log(`  SQLite DB    ->  ${config.dbPath}\n`);
});
