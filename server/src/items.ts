import type { Item, ItemInput } from '../../shared/src/index.ts';
import type { Db } from './db.ts';
import { ApiError, newId, round2, toIsoNow, toIsoDate } from './util.ts';

const ITEM_COLS = `
  id, code, name, category, icon, barcode,
  buy_price AS buyPrice, sell_price AS sellPrice,
  qty, min_qty AS minQty, unit, notes,
  created_at AS createdAt, updated_at AS updatedAt
`;

interface ItemRow {
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

const CATEGORY_ICONS: Record<string, string> = {
  drinks: 'fas fa-mug-hot',
  snacks: 'fas fa-cookie-bite',
  accessories: 'fas fa-headphones',
  spares: 'fas fa-tools',
  cards: 'fas fa-gamepad',
  general: 'fas fa-box'
};

export function listItems(db: Db): Item[] {
  const rows = db
    .prepare(`SELECT ${ITEM_COLS} FROM items ORDER BY created_at DESC, name ASC`)
    .all() as ItemRow[];
  return rows.map((r) => ({ ...r }));
}

export function getItem(db: Db, id: string): Item | null {
  const row = db.prepare(`SELECT ${ITEM_COLS} FROM items WHERE id = ?`).get(id) as
    | ItemRow
    | undefined;
  return row ? { ...row } : null;
}

function nextItemCode(db: Db): string {
  const row = db.prepare("SELECT MAX(CAST(SUBSTR(code, 5) AS INTEGER)) AS maxNum FROM items WHERE code LIKE 'BOX-%'").get() as
    | { maxNum: number | null }
    | undefined;
  const n = (row?.maxNum ?? 0) + 1;
  return `BOX-${String(n).padStart(2, '0')}`;
}

export function createItem(db: Db, input: ItemInput): Item {
  const name = String(input.name || '').trim();
  if (!name) throw new ApiError(400, 'missing_fields', 'يرجى كتابة اسم الصنف / المنتج');

  const now = toIsoNow();
  const category = input.category || 'general';
  const item: Item = {
    id: newId('itm'),
    code: nextItemCode(db),
    name,
    category,
    icon: input.icon || CATEGORY_ICONS[category] || 'fas fa-box',
    barcode: String(input.barcode || '').trim(),
    buyPrice: round2(Number(input.buyPrice) || 0),
    sellPrice: round2(Number(input.sellPrice) || 0),
    qty: Number(input.qty) || 0,
    minQty: Number(input.minQty) || 5,
    unit: String(input.unit || '').trim() || 'قطعة',
    notes: String(input.notes || '').trim(),
    createdAt: toIsoDate(new Date()),
    updatedAt: toIsoDate(new Date())
  };
  db.prepare(
    `INSERT INTO items (id, code, name, category, icon, barcode, buy_price, sell_price, qty, min_qty, unit, notes, created_at, updated_at)
     VALUES (@id, @code, @name, @category, @icon, @barcode, @buyPrice, @sellPrice, @qty, @minQty, @unit, @notes, @createdAt, @updatedAt)`
  ).run(item);
  void now;
  return item;
}

export function updateItem(db: Db, id: string, patch: Partial<ItemInput>): Item {
  const existing = getItem(db, id);
  if (!existing) throw new ApiError(404, 'item_not_found', 'الصنف غير موجود');

  const category = patch.category !== undefined ? patch.category : existing.category;
  const next: Item = {
    ...existing,
    name: patch.name !== undefined ? String(patch.name).trim() : existing.name,
    category,
    icon: patch.icon !== undefined ? patch.icon : patch.category ? CATEGORY_ICONS[category] || 'fas fa-box' : existing.icon,
    barcode: patch.barcode !== undefined ? String(patch.barcode).trim() : existing.barcode,
    buyPrice: patch.buyPrice !== undefined ? round2(Number(patch.buyPrice) || 0) : existing.buyPrice,
    sellPrice: patch.sellPrice !== undefined ? round2(Number(patch.sellPrice) || 0) : existing.sellPrice,
    qty: patch.qty !== undefined ? Number(patch.qty) || 0 : existing.qty,
    minQty: patch.minQty !== undefined ? Number(patch.minQty) || 5 : existing.minQty,
    unit: patch.unit !== undefined ? String(patch.unit).trim() || 'قطعة' : existing.unit,
    notes: patch.notes !== undefined ? String(patch.notes).trim() : existing.notes,
    updatedAt: toIsoDate(new Date())
  };
  if (!next.name) throw new ApiError(400, 'missing_fields', 'يرجى كتابة اسم الصنف / المنتج');

  db.prepare(
    `UPDATE items SET name=@name, category=@category, icon=@icon, barcode=@barcode,
       buy_price=@buyPrice, sell_price=@sellPrice, qty=@qty, min_qty=@minQty, unit=@unit,
       notes=@notes, updated_at=@updatedAt WHERE id=@id`
  ).run(next);
  return next;
}

export function deleteItem(db: Db, id: string): void {
  const existing = getItem(db, id);
  if (!existing) throw new ApiError(404, 'item_not_found', 'الصنف غير موجود');
  db.prepare('DELETE FROM items WHERE id = ?').run(id);
}

export function addStock(db: Db, id: string, qty: number, unitCost?: number): Item {
  if (!(qty > 0)) throw new ApiError(400, 'invalid_qty', 'يرجى كتابة كمية صحيحة أكبر من الصفر');
  const item = getItem(db, id);
  if (!item) throw new ApiError(404, 'item_not_found', 'الصنف غير موجود');

  const patch: Partial<ItemInput> = { qty: round2(item.qty + qty) };
  if (unitCost !== undefined && Number(unitCost) > 0) {
    patch.buyPrice = round2(Number(unitCost));
  }
  return updateItem(db, id, patch);
}

/** Internal use: adjust stock when a sale happens (never exposes HTTP). */
export function decrementStock(db: Db, itemId: string, qty: number): void {
  const item = getItem(db, itemId);
  if (!item || item.qty < qty) {
    throw new ApiError(409, 'insufficient_stock', `الكمية المطلوبة تتجاوز المخزون المتاح لـ ${item?.name || 'الصنف'}`);
  }
  db.prepare('UPDATE items SET qty = ?, updated_at = ? WHERE id = ?').run(
    round2(item.qty - qty),
    toIsoDate(new Date()),
    itemId
  );
}
