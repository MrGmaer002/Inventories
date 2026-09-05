import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));

export const config = {
  port: Number(process.env.PORT || 4000),
  /** SQLite database file — real on-disk DB, swapped for MySQL/Postgres later. */
  dbPath: process.env.PANCAFE_DB_PATH || path.resolve(here, '../data/pancafe.db'),
  /** If the client has been built (npm run build), serve it from this folder. */
  clientDist: path.resolve(here, '../../client/dist'),
  isDev: process.env.NODE_ENV !== 'production'
};

export function ensureDbDir(): void {
  fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
}
