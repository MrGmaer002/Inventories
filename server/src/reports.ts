import type { ReportLine, ReportScope, ReportTotals, Sale } from '../../shared/src/index.ts';
import type { Db } from './db.ts';
import { round2 } from './util.ts';

/**
 * Central reporting module. Every financial number shown anywhere
 * (shift-close modal, reports screen, cashier lookup, receipts) comes from
 * these SQL aggregations so the math is defined exactly once.
 */

export interface ScopeSql {
  where: string;
  params: unknown[];
}

export function scopeSql(scope: ReportScope, cashierId?: string): ScopeSql {
  let where: string;
  const params: unknown[] = [];

  switch (scope.kind) {
    case 'active-shift':
      where = `s.shift_id = (SELECT id FROM shifts WHERE status = 'active' ORDER BY id DESC LIMIT 1)`;
      break;
    case 'shift':
      where = 's.shift_id = ?';
      params.push(scope.shiftId);
      break;
    case 'today': {
      where = 's.date = ?';
      const d = new Date();
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      params.push(`${y}-${m}-${day}`);
      break;
    }
    case 'all':
      where = '1 = 1';
      break;
  }
  if (cashierId) {
    where += ' AND s.cashier_id = ?';
    params.push(cashierId);
  }
  return { where, params };
}

export function querySummary(db: Db, scope: ReportScope, cashierId?: string): ReportTotals {
  const { where, params } = scopeSql(scope, cashierId);

  const saleRow = db
    .prepare(`SELECT COUNT(*) AS invoices, COALESCE(SUM(s.total), 0) AS revenue FROM sales s WHERE ${where}`)
    .get(...params) as { invoices: number; revenue: number };

  // Note: totals ignore per-item discount adjustments — the per-line cost uses sale_items snapshots.

  const itemsRow = db
    .prepare(
      `SELECT COALESCE(SUM(si.qty), 0) AS itemsQty,
              COALESCE(SUM(si.buy_price * si.qty), 0) AS cost
       FROM sales s
       JOIN sale_items si ON si.sale_id = s.id
       WHERE ${where}`
    )
    .get(...params) as { itemsQty: number; cost: number };

  const revenue = round2(saleRow.revenue);
  const cost = round2(itemsRow.cost);
  const profit = round2(revenue - cost);
  return {
    revenue,
    cost,
    profit,
    marginPct: revenue > 0 ? round2((profit / revenue) * 100) : 0,
    invoices: saleRow.invoices,
    itemsQty: round2(itemsRow.itemsQty)
  };
}

export function queryItemsBreakdown(db: Db, scope: ReportScope, cashierId?: string): ReportLine[] {
  const { where, params } = scopeSql(scope, cashierId);
  const rows = db
    .prepare(
      `SELECT si.item_id AS itemId,
              si.name,
              si.unit,
              SUM(si.qty) AS qty,
              SUM(si.total) AS total,
              SUM(si.buy_price * si.qty) AS totalCost
       FROM sales s
       JOIN sale_items si ON si.sale_id = s.id
       WHERE ${where}
       GROUP BY si.item_id, si.name, si.unit
       ORDER BY SUM(si.total) DESC`
    )
    .all(...params) as Array<{
    itemId: string;
    name: string;
    unit: string;
    qty: number;
    total: number;
    totalCost: number;
  }>;

  return rows.map((r) => {
    const total = round2(r.total);
    const totalCost = round2(r.totalCost);
    const qty = round2(r.qty);
    return {
      itemId: r.itemId,
      name: r.name,
      unit: r.unit,
      qty,
      total,
      totalCost,
      price: qty > 0 ? round2(total / qty) : 0,
      buyPrice: qty > 0 ? round2(totalCost / qty) : 0,
      profit: round2(total - totalCost)
    };
  });
}

export function querySales(db: Db, scope: ReportScope, cashierId?: string): Sale[] {
  const { where, params } = scopeSql(scope, cashierId);
  const rows = db
    .prepare(
      `SELECT s.id, s.invoice_no AS invoiceNo, s.shift_id AS shiftId,
              s.cashier_id AS cashierId, s.cashier_name AS cashierName,
              s.customer, s.subtotal, s.discount, s.total, s.paid,
              s.change AS change, s.payment_method AS paymentMethod,
              s.date, s.time, s.created_at AS createdAt
       FROM sales s
       WHERE ${where}
       ORDER BY s.created_at DESC, s.id DESC`
    )
    .all(...params) as Array<Omit<Sale, 'items'>>;

  if (rows.length === 0) return [];

  const saleItems = db
    .prepare(
      `SELECT sale_id AS saleId, item_id AS itemId, name, unit, qty, price,
              buy_price AS buyPrice, total
       FROM sale_items WHERE sale_id IN (${rows.map(() => '?').join(',')})`
    )
    .all(...rows.map((r) => r.id)) as Array<{
    saleId: number;
    itemId: string;
    name: string;
    unit: string;
    qty: number;
    price: number;
    buyPrice: number;
    total: number;
  }>;

  const bySale = new Map<number, Sale['items']>();
  for (const si of saleItems) {
    const list = bySale.get(si.saleId) || [];
    list.push({
      itemId: si.itemId,
      name: si.name,
      unit: si.unit,
      qty: si.qty,
      price: si.price,
      buyPrice: si.buyPrice,
      total: si.total
    });
    bySale.set(si.saleId, list);
  }

  return rows.map((r) => ({ ...r, items: bySale.get(r.id) || [] }));
}
