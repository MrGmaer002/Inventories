import Database from 'better-sqlite3';
import fs from 'node:fs';
import { ensureDbDir, config } from './config.ts';
import { DEFAULT_SETTINGS, type Settings } from '../../shared/src/index.ts';
import { hashPassword } from './util.ts';

export type Db = Database.Database;

export function openDatabase(): Db {
  ensureDbDir();
  const db = new Database(config.dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  seed(db);
  return db;
}

function migrate(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id         TEXT PRIMARY KEY,
      username   TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password   TEXT NOT NULL,
      full_name  TEXT NOT NULL,
      role       TEXT NOT NULL CHECK (role IN ('admin','cashier')),
      avatar     TEXT NOT NULL DEFAULT '👤',
      phone      TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS items (
      id         TEXT PRIMARY KEY,
      code       TEXT NOT NULL UNIQUE,
      name       TEXT NOT NULL,
      category   TEXT NOT NULL DEFAULT 'general',
      icon       TEXT NOT NULL DEFAULT 'fas fa-box',
      barcode    TEXT NOT NULL DEFAULT '',
      buy_price  REAL NOT NULL DEFAULT 0,
      sell_price REAL NOT NULL DEFAULT 0,
      qty        REAL NOT NULL DEFAULT 0,
      min_qty    REAL NOT NULL DEFAULT 5,
      unit       TEXT NOT NULL DEFAULT 'قطعة',
      notes      TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS shifts (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      shift_number INTEGER NOT NULL UNIQUE,
      status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed')),
      cashier_id   TEXT NOT NULL,
      cashier_name TEXT NOT NULL,
      initial_cash REAL NOT NULL DEFAULT 0,
      started_at   TEXT NOT NULL,
      ended_at     TEXT,
      closed_by    TEXT,
      expected_cash REAL,
      actual_cash   REAL,
      shortage     REAL NOT NULL DEFAULT 0,
      surplus      REAL NOT NULL DEFAULT 0,
      discrepancy  REAL NOT NULL DEFAULT 0,
      notes        TEXT,
      invoice_count INTEGER NOT NULL DEFAULT 0,
      items_qty     REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS sales (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_no     TEXT NOT NULL UNIQUE,
      shift_id       INTEGER NOT NULL REFERENCES shifts(id),
      cashier_id     TEXT NOT NULL,
      cashier_name   TEXT NOT NULL,
      customer       TEXT NOT NULL DEFAULT 'عميل نقدي',
      subtotal       REAL NOT NULL,
      discount       REAL NOT NULL DEFAULT 0,
      total          REAL NOT NULL,
      paid           REAL NOT NULL,
      change         REAL NOT NULL,
      payment_method TEXT NOT NULL DEFAULT 'cash',
      date           TEXT NOT NULL,
      time           TEXT NOT NULL,
      created_at     TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sales_shift   ON sales(shift_id);
    CREATE INDEX IF NOT EXISTS idx_sales_date    ON sales(date);
    CREATE INDEX IF NOT EXISTS idx_sales_cashier ON sales(cashier_id);

    CREATE TABLE IF NOT EXISTS sale_items (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id   INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
      item_id   TEXT,
      name      TEXT NOT NULL,
      unit      TEXT NOT NULL DEFAULT 'قطعة',
      qty       REAL NOT NULL,
      price     REAL NOT NULL,
      buy_price REAL NOT NULL,
      total     REAL NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Forward migration for databases created before invoice_count/items_qty.
  const shiftCols = db.prepare(`PRAGMA table_info(shifts)`).all() as Array<{ name: string }>;
  if (!shiftCols.some((c) => c.name === 'invoice_count')) {
    db.exec(`ALTER TABLE shifts ADD COLUMN invoice_count INTEGER NOT NULL DEFAULT 0;`);
    db.exec(`ALTER TABLE shifts ADD COLUMN items_qty REAL NOT NULL DEFAULT 0;`);
  }
}

function seed(db: Db): void {
  // Default admin (username: admin / password: 123) — only when no users exist yet.
  const userCount = (db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n;
  if (userCount === 0) {
    const now = new Date();
    db.prepare(
      `INSERT INTO users (id, username, password, full_name, role, avatar, phone, created_at)
       VALUES (@id, @username, @password, @fullName, @role, @avatar, @phone, @createdAt)`
    ).run({
      id: 'usr_admin',
      username: 'admin',
      password: hashPassword('123'),
      fullName: 'Admin',
      role: 'admin',
      avatar: '👨‍💼',
      phone: '',
      createdAt: now.toISOString().slice(0, 10)
    });
  }

  const settingsCount = (db.prepare('SELECT COUNT(*) AS n FROM settings').get() as { n: number }).n;
  if (settingsCount === 0) {
    const put = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    put.run('storeName', DEFAULT_SETTINGS.storeName);
    put.run('currency', DEFAULT_SETTINGS.currency);
    put.run('soundEnabled', String(DEFAULT_SETTINGS.soundEnabled));
    put.run('autoPrint', String(DEFAULT_SETTINGS.autoPrint));
    put.run('receiptFooter', DEFAULT_SETTINGS.receiptFooter);
  }
}

export function isFreshInstall(): boolean {
  const db = openDatabase();
  try {
    const n = (db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n;
    return n <= 1;
  } finally {
    db.close();
  }
}

export function dbFilePath(): string {
  return config.dbPath;
}

export function wipeDatabase(): void {
  try {
    fs.rmSync(config.dbPath, { force: true });
    fs.rmSync(config.dbPath + '-wal', { force: true });
    fs.rmSync(config.dbPath + '-shm', { force: true });
  } catch {
    /* ignore */
  }
}
