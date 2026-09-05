import type { Settings } from '../../shared/src/index.ts';
import { DEFAULT_SETTINGS } from '../../shared/src/index.ts';
import type { Db } from './db.ts';

const DEFAULTS: Settings = { ...DEFAULT_SETTINGS };

export function getSettings(db: Db): Settings {
  const rows = db.prepare('SELECT key, value FROM settings').all() as Array<{
    key: keyof Settings;
    value: string;
  }>;
  const out: Settings = { ...DEFAULTS };
  for (const row of rows) {
    const v: string = row.value;
    if (row.key === 'soundEnabled' || row.key === 'autoPrint') {
      out[row.key] = v === 'true';
    } else {
      (out as unknown as Record<string, string>)[row.key] = v;
    }
  }
  return out;
}

export function saveSettings(db: Db, patch: Partial<Settings>): Settings {
  const put = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  const current = getSettings(db);
  const next: Settings = { ...current, ...patch };

  const tx = db.transaction(() => {
    put.run('storeName', String(next.storeName ?? DEFAULTS.storeName));
    put.run('currency', String(next.currency ?? DEFAULTS.currency));
    put.run('soundEnabled', String(Boolean(next.soundEnabled)));
    put.run('autoPrint', String(Boolean(next.autoPrint)));
    put.run('receiptFooter', String(next.receiptFooter ?? DEFAULTS.receiptFooter));
  });
  tx();
  return next;
}
