import { wipeDatabase } from './db.ts';

wipeDatabase();
console.log('SQLite database wiped. It will be re-created fresh on next server start.');
