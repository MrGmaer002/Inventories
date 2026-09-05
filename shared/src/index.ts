/**
 * @pancafe/shared — canonical domain types + API contracts.
 *
 * Single source of truth imported by both the Express API (`server`) and the
 * React SPA (`client`) so the two sides can never drift apart.
 */

// ---------------------------------------------------------------------------
// Users & roles
// ---------------------------------------------------------------------------

export type Role = 'admin' | 'cashier';

export interface User {
  id: string;
  username: string;
  fullName: string;
  role: Role;
  avatar: string;
  phone: string;
  createdAt: string; // YYYY-MM-DD
}

/** Payload used when creating / updating a user. Password is never exposed via the API. */
export interface UserInput {
  username: string;
  fullName: string;
  role: Role;
  avatar?: string;
  phone?: string;
  /** Required on create; optional on update (omit to keep the current password). */
  password?: string;
}

export interface ChangePasswordPayload {
  userId: string;
  newPassword: string;
  /** Password of the currently signed-in admin (server-side authorization). */
  actorPassword: string;
}

export interface LoginPayload {
  username: string;
  password: string;
}

// ---------------------------------------------------------------------------
// Items & inventory
// ---------------------------------------------------------------------------

export interface Item {
  id: string;
  code: string;
  name: string;
  category: string;
  icon: string;
  barcode: string;
  buyPrice: number;
  sellPrice: number;
  qty: number;
  minQty: number;
  unit: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface ItemInput {
  name: string;
  category?: string;
  barcode?: string;
  buyPrice?: number;
  sellPrice: number;
  qty: number;
  minQty?: number;
  unit?: string;
  notes?: string;
  icon?: string;
}

export interface StockInPayload {
  qty: number;
  unitCost?: number;
  supplier?: string;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
}

// ---------------------------------------------------------------------------
// Sales (POS)
// ---------------------------------------------------------------------------

export type PaymentMethod = 'cash';

/** A single sold line. Snapshots name/unit/prices at the time of the sale. */
export interface SaleItem {
  itemId: string;
  name: string;
  unit: string;
  qty: number;
  price: number; // sell price of one unit at sale time
  buyPrice: number; // cost of one unit at sale time
  total: number; // price * qty
}

export interface Sale {
  id: number;
  invoiceNo: string;
  shiftId: number;
  cashierId: string;
  cashierName: string;
  customer: string;
  subtotal: number;
  discount: number;
  total: number;
  paid: number;
  change: number;
  paymentMethod: string;
  date: string; // YYYY-MM-DD (local)
  time: string; // HH:mm formatted at creation
  createdAt: string; // ISO
  items: SaleItem[];
}

/** Line kept by the POS cart while composing a checkout. */
export interface CartLine extends SaleItem {
  maxQty: number;
}

export interface CheckoutPayload {
  customer?: string;
  discount?: number;
  paid?: number;
  paymentMethod?: PaymentMethod;
  items: CartLine[];
}

// ---------------------------------------------------------------------------
// Shifts
// ---------------------------------------------------------------------------

export type ShiftStatus = 'active' | 'closed';

export interface Shift {
  id: number;
  shiftNumber: number;
  status: ShiftStatus;
  cashierId: string;
  cashierName: string;
  initialCash: number;
  startedAt: string; // ISO
  endedAt: string | null; // ISO
  closedBy: string | null;
  /** Drawer audit captured at close time. */
  expectedCash: number | null;
  actualCash: number | null;
  shortage: number;
  surplus: number;
  discrepancy: number;
  notes: string | null;
  /** Aggregates persisted at close time (also derivable from sales). */
  invoices: number;
  itemsQty: number;
}

export interface ShiftStartPayload {
  initialCash?: number;
}

export interface ShiftClosePayload {
  actualCash?: number | null;
  notes?: string;
  /** Optional credentials — verified server-side when provided. */
  actorUsername?: string;
  actorPassword?: string;
}

// ---------------------------------------------------------------------------
// Reporting aggregates (used by both shift-close and the reports screen)
// ---------------------------------------------------------------------------

export interface ReportLine {
  itemId: string;
  name: string;
  unit: string;
  qty: number;
  price: number; // avg sell price observed
  buyPrice: number;
  total: number; // revenue
  totalCost: number;
  profit: number;
}

export interface ReportTotals {
  revenue: number;
  cost: number;
  profit: number;
  marginPct: number;
  invoices: number;
  itemsQty: number;
}

export interface ShiftReport {
  shift: Shift;
  totals: ReportTotals;
  items: ReportLine[];
}

/** Scope selector used by report endpoints. */
export type ReportScope =
  | { kind: 'active-shift' }
  | { kind: 'shift'; shiftId: number }
  | { kind: 'today' }
  | { kind: 'all' };

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export interface Settings {
  storeName: string;
  currency: string;
  soundEnabled: boolean;
  autoPrint: boolean;
  receiptFooter: string;
}

// ---------------------------------------------------------------------------
// Backup & restore
// ---------------------------------------------------------------------------

export interface BackupFile {
  version: string;
  exportedAt: string;
  users: UserInput[];
  items: ItemInput[];
  settings: Settings;
  sales: Sale[];
}

// ---------------------------------------------------------------------------
// API envelope
// ---------------------------------------------------------------------------

export interface ApiErrorBody {
  error: string;
  message?: string;
}

export interface SessionInfo {
  user: User;
}

export type ServerStatus =
  | { status: 'ok'; db: 'sqlite'; dbPath: string }
  | { status: 'error'; error: string };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'cat_all', name: 'categories:all', icon: 'fas fa-boxes-stacked' },
  { id: 'drinks', name: 'categories:drinks', icon: 'fas fa-mug-hot' },
  { id: 'snacks', name: 'categories:snacks', icon: 'fas fa-cookie-bite' },
  { id: 'accessories', name: 'categories:accessories', icon: 'fas fa-headphones' },
  { id: 'spares', name: 'categories:spares', icon: 'fas fa-tools' },
  { id: 'cards', name: 'categories:cards', icon: 'fas fa-gamepad' },
  { id: 'general', name: 'categories:general', icon: 'fas fa-box' }
];

export const DEFAULT_SETTINGS: Settings = {
  storeName: 'مخازن',
  currency: 'ج.م',
  soundEnabled: true,
  autoPrint: true,
  receiptFooter: 'شكراً لتعاملكم معنا - نظام مخازن'
};

export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
