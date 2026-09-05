import type { Shift, ShiftReport, User } from '../../shared/src/index.ts';
import type { Db } from './db.ts';
import { ApiError, round2, toIsoNow } from './util.ts';
import { listUsers, getUserById, login } from './users.ts';
import { queryItemsBreakdown, querySales, querySummary } from './reports.ts';

const SHIFT_COLS = `
  id, shift_number AS shiftNumber, status, cashier_id AS cashierId,
  cashier_name AS cashierName, initial_cash AS initialCash,
  started_at AS startedAt, ended_at AS endedAt, closed_by AS closedBy,
  expected_cash AS expectedCash, actual_cash AS actualCash,
  shortage, surplus, discrepancy, notes,
  invoice_count AS invoices, items_qty AS itemsQty
`;

function rowToShift(row: Record<string, unknown>): Shift {
  return {
    id: row.id as number,
    shiftNumber: row.shiftNumber as number,
    status: row.status as Shift['status'],
    cashierId: row.cashierId as string,
    cashierName: row.cashierName as string,
    initialCash: row.initialCash as number,
    startedAt: row.startedAt as string,
    endedAt: (row.endedAt as string | null) ?? null,
    closedBy: (row.closedBy as string | null) ?? null,
    expectedCash: (row.expectedCash as number | null) ?? null,
    actualCash: (row.actualCash as number | null) ?? null,
    shortage: (row.shortage as number) ?? 0,
    surplus: (row.surplus as number) ?? 0,
    discrepancy: (row.discrepancy as number) ?? 0,
    notes: (row.notes as string | null) ?? null,
    invoices: (row.invoices as number) ?? 0,
    itemsQty: (row.itemsQty as number) ?? 0
  };
}

export function getActiveShift(db: Db): Shift | null {
  const row = db
    .prepare(`SELECT ${SHIFT_COLS} FROM shifts WHERE status = 'active' ORDER BY id DESC LIMIT 1`)
    .get() as Record<string, unknown> | undefined;
  return row ? rowToShift(row) : null;
}

export function getShiftById(db: Db, id: number): Shift | null {
  const row = db.prepare(`SELECT ${SHIFT_COLS} FROM shifts WHERE id = ?`).get(id) as
    | Record<string, unknown>
    | undefined;
  return row ? rowToShift(row) : null;
}

export function listShiftHistory(db: Db): Shift[] {
  const rows = db
    .prepare(
      `SELECT ${SHIFT_COLS} FROM shifts WHERE status = 'closed' ORDER BY ended_at DESC, id DESC`
    )
    .all() as Record<string, unknown>[];
  return rows.map(rowToShift);
}

function defaultCashier(db: Db): User {
  const users = listUsers(db);
  return users.find((u) => u.role === 'admin') || users[0];
}

export function startNewShift(db: Db, cashier?: User | null, initialCash = 0): Shift {
  const user = cashier || defaultCashier(db);
  const maxRow = db
    .prepare('SELECT COALESCE(MAX(shift_number), 0) AS m FROM shifts')
    .get() as { m: number };

  const shift: Shift = {
    id: 0,
    shiftNumber: maxRow.m + 1,
    status: 'active',
    cashierId: user.id,
    cashierName: user.fullName,
    initialCash: round2(Number(initialCash) || 0),
    startedAt: toIsoNow(),
    endedAt: null,
    closedBy: null,
    expectedCash: null,
    actualCash: null,
    shortage: 0,
    surplus: 0,
    discrepancy: 0,
    notes: null,
    invoices: 0,
    itemsQty: 0
  };
  const info = db
    .prepare(
      `INSERT INTO shifts (shift_number, status, cashier_id, cashier_name, initial_cash, started_at)
       VALUES (@shiftNumber, 'active', @cashierId, @cashierName, @initialCash, @startedAt)`
    )
    .run(shift);
  return getShiftById(db, Number(info.lastInsertRowid))!;
}

/** Returns the current active shift, creating one (with the given cashier) if needed. */
export function ensureActiveShift(db: Db, cashier?: User | null): Shift {
  const active = getActiveShift(db);
  if (active) return active;
  return startNewShift(db, cashier);
}

export function shiftReport(db: Db, shift: Shift): ShiftReport {
  const scope = { kind: 'shift', shiftId: shift.id } as const;
  const totals = querySummary(db, scope);
  const items = queryItemsBreakdown(db, scope);
  return { shift, totals, items };
}

export interface CloseShiftResult {
  closedReport: ShiftReport;
  nextShift: Shift;
}

export function closeActiveShift(
  db: Db,
  opts: {
    actualCash?: number | null;
    notes?: string;
    actorUsername?: string;
    actorPassword?: string;
  }
): CloseShiftResult {
  const active = getActiveShift(db);
  if (!active) {
    throw new ApiError(400, 'no_active_shift', 'لا توجد وردية نشطة لتقفيلها');
  }

  // Optional server-side verification of whoever is closing the shift.
  let closer: User | null = null;
  if (opts.actorUsername && opts.actorPassword) {
    closer = login(db, opts.actorUsername, opts.actorPassword);
  } else {
    closer = getUserById(db, active.cashierId);
  }
  if (!closer) closer = defaultCashier(db);

  const report = shiftReport(db, active);
  const expected = report.totals.revenue;
  const counted = opts.actualCash !== undefined && opts.actualCash !== null
    ? round2(Number(opts.actualCash))
    : expected;
  const diff = round2(counted - expected);
  const shortage = diff < 0 ? round2(Math.abs(diff)) : 0;
  const surplus = diff > 0 ? round2(diff) : 0;

  db.prepare(
    `UPDATE shifts SET status = 'closed', ended_at = ?, closed_by = ?,
       expected_cash = ?, actual_cash = ?, shortage = ?, surplus = ?,
       discrepancy = ?, notes = ?, invoice_count = ?, items_qty = ?
     WHERE id = ?`
  ).run(
    toIsoNow(),
    closer.fullName,
    expected,
    counted,
    shortage,
    surplus,
    diff,
    opts.notes || null,
    report.totals.invoices,
    report.totals.itemsQty,
    active.id
  );

  const closed = getShiftById(db, active.id)!;
  // Fresh active shift, drawer reset to 0 — mirrors the legacy "start next shift".
  const nextShift = startNewShift(db, closer, 0);

  return { closedReport: { shift: closed, totals: report.totals, items: report.items }, nextShift };
}

export function salesForShift(db: Db, shiftId: number) {
  return querySales(db, { kind: 'shift', shiftId });
}
