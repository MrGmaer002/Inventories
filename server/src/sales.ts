import type { CartLine, CheckoutPayload, Sale, User } from '../../shared/src/index.ts';
import type { Db } from './db.ts';
import { ApiError, round2, timeLocal, toIsoNow, todayLocal } from './util.ts';
import { decrementStock, getItem } from './items.ts';
import { ensureActiveShift } from './shifts.ts';

export function checkout(db: Db, payload: CheckoutPayload, cashier: User): Sale {
  if (!payload.items || payload.items.length === 0) {
    throw new ApiError(400, 'empty_cart', 'سلة البيع فارغة');
  }

  const shift = ensureActiveShift(db, cashier);

  const tx = db.transaction((): Sale => {
    // 1. Build authoritative snapshots from the database (never trust client prices).
    const lines: CartLine[] = payload.items.map((line) => {
      const item = getItem(db, line.itemId);
      if (!item) {
        throw new ApiError(404, 'item_not_found', 'أحد الأصناف غير موجود بالمخزن');
      }
      const qty = Number(line.qty) || 0;
      if (qty <= 0) {
        throw new ApiError(400, 'invalid_qty', 'كمية غير صحيحة في السلة');
      }
      if (item.qty < qty) {
        throw new ApiError(409, 'insufficient_stock', `الكمية المطلوبة تتجاوز المخزون المتاح (${item.name})`);
      }
      return {
        itemId: item.id,
        name: item.name,
        unit: item.unit,
        qty,
        price: round2(item.sellPrice),
        buyPrice: round2(item.buyPrice),
        total: round2(item.sellPrice * qty),
        maxQty: item.qty
      };
    });

    // 2. Invoice number (monotonic).
    const invRow = db
      .prepare(
        `SELECT COALESCE(MAX(CAST(SUBSTR(invoice_no, 5) AS INTEGER)), 999) + 1 AS next FROM sales`
      )
      .get() as { next: number };
    const invoiceNo = `INV-${invRow.next}`;

    // 3. Totals.
    const subtotal = round2(lines.reduce((s, l) => s + l.total, 0));
    const discount = round2(Math.max(0, Number(payload.discount) || 0));
    const total = round2(Math.max(0, subtotal - discount));
    const paidInput = payload.paid !== undefined && payload.paid !== null ? Number(payload.paid) : total;
    const paid = round2(Math.max(0, paidInput));
    const change = round2(Math.max(0, paid - total));
    const customer = String(payload.customer || '').trim() || 'عميل نقدي';

    // 4. Persist sale + lines and deduct stock — all in the same transaction.
    const now = toIsoNow();
    const info = db
      .prepare(
        `INSERT INTO sales (invoice_no, shift_id, cashier_id, cashier_name, customer,
           subtotal, discount, total, paid, change, payment_method, date, time, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'cash', ?, ?, ?)`
      )
      .run(invoiceNo, shift.id, cashier.id, cashier.fullName, customer, subtotal, discount, total, paid, change, todayLocal(), timeLocal(), now);

    const saleId = Number(info.lastInsertRowid);
    const insertLine = db.prepare(
      `INSERT INTO sale_items (sale_id, item_id, name, unit, qty, price, buy_price, total)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const line of lines) {
      insertLine.run(saleId, line.itemId, line.name, line.unit, line.qty, line.price, line.buyPrice, line.total);
      decrementStock(db, line.itemId, line.qty);
    }

    return {
      id: saleId,
      invoiceNo,
      shiftId: shift.id,
      cashierId: cashier.id,
      cashierName: cashier.fullName,
      customer,
      subtotal,
      discount,
      total,
      paid,
      change,
      paymentMethod: 'cash',
      date: todayLocal(),
      time: timeLocal(),
      createdAt: now,
      items: lines
    };
  });

  return tx();
}
