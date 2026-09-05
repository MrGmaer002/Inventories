import type { Db } from './db.ts';
import { ApiError, hashPassword, newId, round2, toIsoNow } from './util.ts';
import { listUsers } from './users.ts';
import { listItems, createItem, updateItem } from './items.ts';
import { getSettings } from './settings.ts';

interface BackupUsersRow {
  id: string;
  username: string;
  fullName: string;
  role: 'admin' | 'cashier';
  avatar?: string;
  phone?: string;
  createdAt?: string;
  /** Native exports carry the scrypt hash; legacy backups carry plaintext `password`. */
  passwordHash?: string;
  password?: string;
}

export interface BackupPayload {
  version: string;
  exportedAt: string;
  users: BackupUsersRow[];
  items: unknown[];
  sales: Array<Record<string, unknown>>;
  settings: unknown;
}

export function exportBackup(db: Db): BackupPayload {
  const users = db
    .prepare(
      `SELECT id, username, full_name AS fullName, role, avatar, phone,
              created_at AS createdAt, password AS passwordHash FROM users`
    )
    .all() as BackupUsersRow[];

  const items = listItems(db);

  const sales = db
    .prepare(
      `SELECT id, invoice_no AS invoiceNo, shift_id AS shiftId, cashier_id AS cashierId,
              cashier_name AS cashierName, customer, subtotal, discount, total, paid,
              change, payment_method AS paymentMethod, date, time, created_at AS createdAt
       FROM sales ORDER BY id ASC`
    )
    .all() as Array<Record<string, unknown>>;

  const saleItems = db
    .prepare(
      `SELECT sale_id AS saleId, item_id AS itemId, name, unit, qty, price,
              buy_price AS buyPrice, total FROM sale_items ORDER BY sale_id ASC`
    )
    .all() as Array<Record<string, unknown> & { saleId: number }>;

  const bySale = new Map<number, unknown[]>();
  for (const si of saleItems) {
    const arr = bySale.get(si.saleId) || [];
    const { saleId: _s, ...rest } = si;
    arr.push(rest);
    bySale.set(si.saleId, arr);
  }
  const salesWithItems = sales.map((s) => ({ ...s, items: bySale.get(s.id as number) || [] }));

  return {
    version: '2.0',
    exportedAt: new Date().toISOString(),
    users,
    items,
    sales: salesWithItems,
    settings: getSettings(db)
  };
}

export interface ImportStats {
  users: number;
  items: number;
  sales: number;
}

/**
 * Restores a backup. Accepts:
 *  - native exports (version 2.x, hashed passwords, full item codes)
 *  - legacy PanCafe exports (version 1.0 from the old localStorage app:
 *    plaintext passwords, old user/item shapes, sales grouped by old shift ids)
 * Historical sales are archived into a single synthetic closed shift and a fresh
 * active shift is opened.
 */
export function importBackup(db: Db, raw: unknown): ImportStats {
  if (!raw || typeof raw !== 'object') {
    throw new ApiError(400, 'invalid_backup', 'ملف النسخة الاحتياطية غير صالح');
  }
  const data = raw as Record<string, unknown>;
  const users = (Array.isArray(data.users) ? data.users : []) as BackupUsersRow[];
  const items = (Array.isArray(data.items) ? data.items : []) as Array<Record<string, unknown>>;
  const sales = (Array.isArray(data.sales) ? data.sales : []) as Array<
    Record<string, unknown> & { items?: Array<Record<string, unknown>> }
  >;
  const settingsRaw = (data.settings || {}) as Record<string, unknown>;
  if (items.length === 0 && users.length === 0) {
    throw new ApiError(400, 'invalid_backup', 'ملف النسخة الاحتياطية غير صالح');
  }

  const tx = db.transaction((): ImportStats => {
    // Wipe everything except the admin bootstrap user (which we keep/refresh).
    db.exec('DELETE FROM sale_items; DELETE FROM sales; DELETE FROM shifts; DELETE FROM items; DELETE FROM settings; DELETE FROM users;');
    db.exec(`DELETE FROM sqlite_sequence WHERE name IN ('sales','sale_items','shifts')`);

    // --- Users -------------------------------------------------------------
    let adminKept = false;
    for (const u of users) {
      const username = String(u.username || '').trim().toLowerCase();
      const fullName = String(u.fullName || '').trim();
      if (!username || !fullName) continue;
      const isAdmin = u.role === 'admin' || username === 'admin';
      if (isAdmin && !adminKept) adminKept = true;

      const id = String(u.id || newId('usr'));
      const hashed = u.passwordHash
        ? String(u.passwordHash)
        : hashPassword(String(u.password || '123'));
      db.prepare(
        `INSERT OR REPLACE INTO users (id, username, password, full_name, role, avatar, phone, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        username,
        hashed,
        fullName,
        isAdmin ? 'admin' : 'cashier',
        String(u.avatar || (isAdmin ? '👨‍💼' : '🧑‍💻')),
        String(u.phone || ''),
        String(u.createdAt || toIsoNow().slice(0, 10))
      );
    }
    if (!adminKept) {
      db.prepare(
        `INSERT OR REPLACE INTO users (id, username, password, full_name, role, avatar, phone, created_at)
         VALUES ('usr_admin', 'admin', ?, 'Admin', 'admin', '👨‍💼', '', ?)`
      ).run(hashPassword('123'), toIsoNow().slice(0, 10));
    }

    // --- Settings ----------------------------------------------------------
    const putSetting = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    putSetting.run('storeName', String(settingsRaw.storeName ?? 'PanCafe'));
    putSetting.run('currency', String(settingsRaw.currency ?? 'ج.م'));
    putSetting.run('soundEnabled', String(Boolean(settingsRaw.soundEnabled ?? true)));
    putSetting.run('autoPrint', String(Boolean(settingsRaw.autoPrint ?? false)));
    putSetting.run('receiptFooter', String(settingsRaw.receiptFooter ?? 'thankYou'));

    // --- Items -------------------------------------------------------------
    let itemCount = 0;
    const itemIdMap = new Map<string, string>(); // legacy id -> new id
    for (const it of items) {
      const name = String(it.name || '').trim();
      if (!name) continue;
      const legacyId = String(it.id || '');
      const qty = Number(it.qty) || 0;
      const cat = String(it.category || 'general');
      const created = createItem(db, {
        name,
        category: cat,
        icon: String(it.icon || ''),
        barcode: String(it.barcode || ''),
        buyPrice: Number(it.buyPrice) || 0,
        sellPrice: Number(it.sellPrice) || 0,
        qty,
        minQty: Number(it.minQty) || 5,
        unit: String(it.unit || '') || 'قطعة',
        notes: String(it.notes || '')
      });
      itemIdMap.set(legacyId, created.id);
      itemCount++;
    }

    // --- Sales (archived into one synthetic closed shift) --------------------
    let salesCount = 0;
    const activeCount = (db.prepare('SELECT COUNT(*) AS n FROM shifts').get() as { n: number }).n;
    const firstNumber = Math.max(1, activeCount + 1);

    if (sales.length > 0) {
      db.prepare(
        `INSERT INTO shifts (shift_number, status, cashier_id, cashier_name, started_at, ended_at,
           closed_by, expected_cash, actual_cash, shortage, surplus, discrepancy, notes)
         VALUES (?, 'closed', 'usr_admin', 'Backup Import', ?, ?, 'Import', 0, 0, 0, 0, 0, 'Migrated from backup')`
      ).run(firstNumber, toIsoNow(), toIsoNow());

      const shiftId = (
        db.prepare('SELECT id FROM shifts WHERE shift_number = ?').get(firstNumber) as { id: number }
      ).id;
      const insertSale = db.prepare(
        `INSERT INTO sales (invoice_no, shift_id, cashier_id, cashier_name, customer,
           subtotal, discount, total, paid, change, payment_method, date, time, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'cash', ?, ?, ?)`
      );
      const insertLine = db.prepare(
        `INSERT INTO sale_items (sale_id, item_id, name, unit, qty, price, buy_price, total)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      );

      sales.forEach((sale, idx) => {
        const saleItems = Array.isArray(sale.items) ? sale.items : [];
        const subtotal = round2(Number(sale.subtotal) || saleItems.reduce((a, l) => a + (Number(l.total) || 0), 0) || 0);
        const discount = round2(Number(sale.discount) || 0);
        const total = round2(Number(sale.total) || Math.max(0, subtotal - discount));
        const invoiceNo = sale.invoiceNo
          ? String(sale.invoiceNo)
          : `INV-${1000 + idx + 1}`;
        const info = insertSale.run(
          invoiceNo,
          shiftId,
          String(sale.cashierId || 'usr_admin'),
          String(sale.cashierName || 'Admin'),
          String(sale.customer || 'عميل نقدي'),
          subtotal,
          discount,
          total,
          round2(Number(sale.paid) || total),
          round2(Number(sale.change) || 0),
          String(sale.date || toIsoNow().slice(0, 10)),
          String(sale.time || '00:00'),
          toIsoNow()
        );
        const saleId = Number(info.lastInsertRowid);
        for (const l of saleItems) {
          const qty = Number(l.qty) || 0;
          if (qty <= 0) continue;
          const price = round2(Number(l.price) || 0);
          const buyPrice = round2(Number(l.buyPrice) || 0);
          insertLine.run(
            saleId,
            l.itemId ? itemIdMap.get(String(l.itemId)) || String(l.itemId) : null,
            String(l.name || ''),
            String(l.unit || '') || 'قطعة',
            qty,
            price,
            buyPrice,
            round2(Number(l.total) || price * qty)
          );
        }
        salesCount++;
      });
    }

    // Fresh active shift for going forward.
    db.prepare(
      `INSERT INTO shifts (shift_number, status, cashier_id, cashier_name, initial_cash, started_at)
       VALUES (?, 'active', 'usr_admin', 'Admin', 0, ?)`
    ).run(firstNumber + 1, toIsoNow());

    return { users: users.length, items: itemCount, sales: salesCount };
  });

  return tx();
}
