import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { Db } from './db.ts';
import { ApiError } from './util.ts';
import { listUsers, createUser, updateUser, deleteUser, changePassword, login, getUserById } from './users.ts';
import { listItems, createItem, updateItem, deleteItem, addStock, getItem } from './items.ts';
import { getSettings, saveSettings } from './settings.ts';
import {
  ensureActiveShift,
  getActiveShift,
  listShiftHistory,
  getShiftById,
  closeActiveShift,
  shiftReport,
  startNewShift
} from './shifts.ts';
import { checkout } from './sales.ts';
import { queryItemsBreakdown, querySales, querySummary } from './reports.ts';
import type { ReportScope } from '../../shared/src/index.ts';
import { exportBackup, importBackup } from './backup.ts';

export function createRouter(db: Db): Router {
  const router = Router();

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Actor from the x-user-id header; throws when missing/unknown. */
  function actor(req: Request) {
    const id = req.header('x-user-id');
    if (!id) throw new ApiError(401, 'unauthorized', 'غير مصرح به');
    const user = getUserById(db, id);
    if (!user) throw new ApiError(401, 'unauthorized', 'غير مصرح به');
    return user;
  }

  function requireAdmin(req: Request) {
    const user = actor(req);
    if (user.role !== 'admin') {
      throw new ApiError(403, 'forbidden', 'عفواً، هذه الخاصية للمدير العام فقط');
    }
    return user;
  }

  function parseScope(req: Request): ReportScope {
    const scope = String(req.query.scope || 'active-shift');
    if (scope.startsWith('shift:')) {
      const id = Number(scope.split(':')[1]);
      if (!Number.isFinite(id)) throw new ApiError(400, 'bad_scope', 'نطاق تقرير غير صالح');
      return { kind: 'shift', shiftId: id };
    }
    if (scope === 'today') return { kind: 'today' };
    if (scope === 'all') return { kind: 'all' };
    return { kind: 'active-shift' };
  }

  // ---------------------------------------------------------------------------
  // Health & auth
  // ---------------------------------------------------------------------------

  router.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', db: 'sqlite' });
  });

  router.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body || {};
    const user = login(db, String(username || ''), String(password || ''));
    res.json({ user });
  });

  // ---------------------------------------------------------------------------
  // Users (admin)
  // ---------------------------------------------------------------------------

  router.get('/api/users', (_req, res) => {
    // Public read (names + roles only — passwords are never exposed) so the
    // switch-user/login screen can render the account picker pre-auth.
    res.json({ users: listUsers(db) });
  });

  router.post('/api/users', (req, res) => {
    requireAdmin(req);
    const user = createUser(db, req.body || {});
    res.status(201).json({ user });
  });

  router.put('/api/users/:id', (req, res) => {
    requireAdmin(req);
    const user = updateUser(db, req.params.id, req.body || {});
    res.json({ user });
  });

  router.delete('/api/users/:id', (req, res) => {
    const admin = requireAdmin(req);
    if (req.params.id === admin.id) {
      throw new ApiError(400, 'cannot_delete_self', 'لا يمكنك حذف حسابك الحالي');
    }
    deleteUser(db, req.params.id);
    res.json({ ok: true });
  });

  router.post('/api/users/:id/password', (req, res) => {
    requireAdmin(req);
    const { newPassword, actorPassword } = req.body || {};
    const user = changePassword(db, req.params.id, String(newPassword || ''), String(actorPassword || ''));
    res.json({ user });
  });

  // ---------------------------------------------------------------------------
  // Items (write ops admin-only)
  // ---------------------------------------------------------------------------

  router.get('/api/items', (_req, res) => {
    res.json({ items: listItems(db) });
  });

  router.post('/api/items', (req, res) => {
    requireAdmin(req);
    const item = createItem(db, req.body || {});
    res.status(201).json({ item });
  });

  router.put('/api/items/:id', (req, res) => {
    requireAdmin(req);
    const item = updateItem(db, req.params.id, req.body || {});
    res.json({ item });
  });

  router.delete('/api/items/:id', (req, res) => {
    requireAdmin(req);
    deleteItem(db, req.params.id);
    res.json({ ok: true });
  });

  router.post('/api/items/:id/stock-in', (req, res) => {
    requireAdmin(req);
    const { qty, unitCost } = req.body || {};
    const item = addStock(db, req.params.id, Number(qty) || 0, unitCost !== undefined ? Number(unitCost) : undefined);
    res.json({ item });
  });

  // ---------------------------------------------------------------------------
  // Sales / checkout
  // ---------------------------------------------------------------------------

  router.post('/api/sales/checkout', (req, res) => {
    const user = actor(req);
    const sale = checkout(db, req.body || {}, user);
    res.status(201).json({ sale });
  });

  // ---------------------------------------------------------------------------
  // Shifts
  // ---------------------------------------------------------------------------

  router.get('/api/shifts/active', (req, res) => {
    // Ensure an active shift exists (idempotent) so the UI always has a drawer.
    const user = actor(req);
    const shift = ensureActiveShift(db, user);
    res.json({ shift });
  });

  router.get('/api/shifts/history', (req, res) => {
    res.json({ shifts: listShiftHistory(db) });
  });

  router.post('/api/shifts/start', (req, res) => {
    const user = actor(req);
    const active = getActiveShift(db);
    if (active && active.status === 'active') {
      res.json({ shift: active });
      return;
    }
    const shift = startNewShift(db, user, Number(req.body?.initialCash) || 0);
    res.status(201).json({ shift });
  });

  router.post('/api/shifts/close', (req, res) => {
    const { actualCash, notes, actorUsername, actorPassword } = req.body || {};
    const result = closeActiveShift(db, {
      actualCash: actualCash !== undefined ? Number(actualCash) : null,
      notes: String(notes || ''),
      actorUsername: actorUsername ? String(actorUsername) : undefined,
      actorPassword: actorPassword ? String(actorPassword) : undefined
    });
    res.json(result);
  });

  router.get('/api/shifts/:id/report', (req, res) => {
    const shift = getShiftById(db, Number(req.params.id));
    if (!shift) throw new ApiError(404, 'shift_not_found', 'الوردية غير موجودة');
    res.json(shiftReport(db, shift));
  });

  // ---------------------------------------------------------------------------
  // Reports & aggregation
  // ---------------------------------------------------------------------------

  router.get('/api/reports/summary', (req, res) => {
    // Auto-ensure active shift so reports against the live drawer never 404.
    ensureActiveShift(db);
    const scope = parseScope(req);
    const totals = querySummary(db, scope, req.query.cashier ? String(req.query.cashier) : undefined);
    const items = queryItemsBreakdown(db, scope, req.query.cashier ? String(req.query.cashier) : undefined);
    res.json({ totals, items });
  });

  router.get('/api/reports/sales', (req, res) => {
    ensureActiveShift(db);
    const scope = parseScope(req);
    const sales = querySales(db, scope, req.query.cashier ? String(req.query.cashier) : undefined);
    res.json({ sales });
  });

  // ---------------------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------------------

  router.get('/api/settings', (_req, res) => {
    res.json({ settings: getSettings(db) });
  });

  router.put('/api/settings', (req, res) => {
    requireAdmin(req);
    res.json({ settings: saveSettings(db, req.body || {}) });
  });

  // ---------------------------------------------------------------------------
  // Backup & restore (admin)
  // ---------------------------------------------------------------------------

  router.get('/api/backup/export', (req, res) => {
    requireAdmin(req);
    res.json(exportBackup(db));
  });

  router.post('/api/backup/import', (req, res) => {
    requireAdmin(req);
    const stats = importBackup(db, req.body);
    res.json({ ok: true, stats });
  });

  // Item detail endpoint used by POS quick-add validation.
  router.get('/api/items/:id', (req, res) => {
    const item = getItem(db, req.params.id);
    if (!item) throw new ApiError(404, 'item_not_found', 'الصنف غير موجود');
    res.json({ item });
  });

  return router;
}

// Express error handling
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ApiError) {
    res.status(err.status).json({ error: err.code, message: err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'internal', message: 'حدث خطأ غير متوقع' });
}
