import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { Item } from '../../../shared/src/index.ts';
import { Endpoints, type ApiError } from '../api.ts';
import { useStore } from '../store.tsx';
import { EmptyState, StockTag, useCategoryLabel, useMoney, stockLevelOf } from '../components/ui.tsx';

type ViewMode = 'grid' | 'table';

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function InventoryPage(): ReactNode {
  const { t } = useTranslation();
  const { user, isAdmin, refreshTick, openModal, confirm, toast, sfx } = useStore();
  const [items, setItems] = useState<Item[]>([]);
  const [query, setQuery] = useState('');
  const [view, setView] = useState<ViewMode>('grid');

  const load = async (): Promise<void> => {
    try {
      const res = await Endpoints.items.list();
      setItems(res.items);
    } catch {
      /* handled globally by silent failure */
    }
  };

  useEffect(() => {
    void load();
  }, [refreshTick, user?.id]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (it) =>
        it.name.toLowerCase().includes(q) ||
        it.barcode.toLowerCase().includes(q) ||
        it.code.toLowerCase().includes(q) ||
        it.notes.toLowerCase().includes(q)
    );
  }, [items, query]);

  const doDelete = async (item: Item): Promise<void> => {
    confirm({
      title: t('inv.deleteConfirm', { name: item.name }),
      okLabel: t('common.delete'),
      variant: 'danger',
      onOk: async () => {
        await Endpoints.items.remove(item.id);
        toast(t('inv.deleted', { name: item.name }), 'warning');
        sfx('click');
        setItems((list) => list.filter((x) => x.id !== item.id));
      }
    });
  };

  const quickSell = (itemId: string): void => openModal('pos', { quickAddId: itemId });

  return (
    <section className="inv-page">
      <div className="page-head">
        <h2>
          <i className="fas fa-boxes-stacked" /> {t('toolbar.inventoryTitle')}
          <span className="count-badge">{t('toolbar.itemsBadge', { count: filtered.length })}</span>
        </h2>
        <div className="page-head-controls">
          <div className="search-box">
            <i className="fas fa-search" />
            <input
              className="form-control"
              placeholder={t('inv.searchPlaceholder')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="view-toggle">
            <button
              type="button"
              className={view === 'grid' ? 'active' : ''}
              title={t('inv.gridView')}
              onClick={() => setView('grid')}
            >
              <i className="fas fa-th-large" />
            </button>
            <button
              type="button"
              className={view === 'table' ? 'active' : ''}
              title={t('inv.tableView')}
              onClick={() => setView('table')}
            >
              <i className="fas fa-list" />
            </button>
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon="fas fa-box-open" text={query ? t('inv.emptySearch') : t('inv.emptyWarehouse')}>
          {isAdmin ? (
            <button type="button" className="btn btn-primary" onClick={() => openModal('item')}>
              <i className="fas fa-plus" /> {t('inv.addFirst')}
            </button>
          ) : (
            <span className="muted-note"><i className="fas fa-circle-info" /> {t('inv.adminOnlyAdd')}</span>
          )}
        </EmptyState>
      ) : view === 'grid' ? (
        <div className="items-grid">
          {filtered.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              isAdmin={isAdmin}
              onQuickSell={() => quickSell(item.id)}
              onEdit={() => openModal('item', { itemId: item.id })}
              onStockIn={() => openModal('stockin', { itemId: item.id })}
              onDelete={() => void doDelete(item)}
            />
          ))}
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table table-hover align-middle">
            <thead>
              <tr>
                <th>{t('inv.colCode')}</th>
                <th>{t('inv.colName')}</th>
                <th>{t('inv.colCategory')}</th>
                <th>{t('inv.colBarcode')}</th>
                <th className="text-end">{t('inv.colSell')}</th>
                {isAdmin && <th className="text-end">{t('inv.colBuy')}</th>}
                <th>{t('inv.colStock')}</th>
                <th>{t('inv.colStatus')}</th>
                <th className="text-center">{t('inv.colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  isAdmin={isAdmin}
                  onQuickSell={() => quickSell(item.id)}
                  onEdit={() => openModal('item', { itemId: item.id })}
                  onStockIn={() => openModal('stockin', { itemId: item.id })}
                  onDelete={() => void doDelete(item)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Grid card
// ---------------------------------------------------------------------------

function ItemCard(props: {
  item: Item;
  isAdmin: boolean;
  onQuickSell: () => void;
  onEdit: () => void;
  onStockIn: () => void;
  onDelete: () => void;
}): ReactNode {
  const { t } = useTranslation();
  const money = useMoney();
  const { item, isAdmin, onQuickSell, onEdit, onStockIn, onDelete } = props;
  const level = stockLevelOf(item);
  const qty = Number(item.qty) || 0;
  const maxVisual = Math.max(qty, (Number(item.minQty) || 5) * 3, 20);
  const pct = Math.min(100, Math.round((qty / maxVisual) * 100));

  return (
    <div className={`item-card stock-${level}`}>
      <div className="item-card-top">
        <span className="code-badge">{item.code}</span>
        <StockTag item={item} />
      </div>
      <div className="item-card-body">
        <span className="item-icon"><i className={item.icon || 'fas fa-box'} /></span>
        <h3 title={item.name}>{item.name}</h3>
        <div className="item-price">{money(item.sellPrice)}</div>
        <div className="stock-meter">
          <div className="stock-meter-label">
            <span>{t('inv.stockLabel', { qty, unit: item.unit || t('itemForm.unitPcs') })}</span>
            {isAdmin && <span className="text-muted small">{t('inv.cost', { cost: money(item.buyPrice) })}</span>}
          </div>
          <div className="meter-track"><div className="meter-fill" style={{ width: `${pct}%` }} /></div>
        </div>
      </div>
      <div className="item-card-actions">
        <button type="button" className="btn btn-sm btn-sell" disabled={qty <= 0} onClick={onQuickSell}>
          <i className="fas fa-cart-plus" /> {t('inv.quickSell')}
        </button>
        {isAdmin && (
          <div className="icon-actions">
            <button type="button" className="icon-btn sm success" title={t('inv.stockIn')} onClick={onStockIn}>
              <i className="fas fa-truck-loading" />
            </button>
            <button type="button" className="icon-btn sm" title={t('inv.editItem')} onClick={onEdit}>
              <i className="fas fa-pen" />
            </button>
            <button type="button" className="icon-btn sm danger" title={t('inv.deleteItem')} onClick={onDelete}>
              <i className="fas fa-trash-can" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Table row
// ---------------------------------------------------------------------------

function ItemRow(props: {
  item: Item;
  isAdmin: boolean;
  onQuickSell: () => void;
  onEdit: () => void;
  onStockIn: () => void;
  onDelete: () => void;
}): ReactNode {
  const { t } = useTranslation();
  const money = useMoney();
  const catLabel = useCategoryLabel();
  const { item, isAdmin, onQuickSell, onEdit, onStockIn, onDelete } = props;
  const qty = Number(item.qty) || 0;
  return (
    <tr>
      <td><span className="code-badge">{item.code}</span></td>
      <td>
        <span className="item-name-cell"><i className={item.icon || 'fas fa-box'} /> <strong>{item.name}</strong></span>
      </td>
      <td className="text-muted">{catLabel(item.category)}</td>
      <td><code>{item.barcode || '—'}</code></td>
      <td className="text-end fw-bold text-success">{money(item.sellPrice)}</td>
      {isAdmin && <td className="text-end text-muted">{money(item.buyPrice)}</td>}
      <td>
        <strong>{qty}</strong> <span className="text-muted small">{item.unit || t('itemForm.unitPcs')}</span>
      </td>
      <td><StockTag item={item} /></td>
      <td className="text-center">
        <div className="icon-actions">
          <button type="button" className="btn btn-sm btn-sell" disabled={qty <= 0} onClick={onQuickSell}>
            <i className="fas fa-cart-plus" /> {t('inv.sell')}
          </button>
          {isAdmin && (
            <>
              <button type="button" className="icon-btn sm success" title={t('inv.stockIn')} onClick={onStockIn}>
                <i className="fas fa-plus" />
              </button>
              <button type="button" className="icon-btn sm" title={t('inv.editItem')} onClick={onEdit}>
                <i className="fas fa-pen" />
              </button>
              <button type="button" className="icon-btn sm danger" title={t('inv.deleteItem')} onClick={onDelete}>
                <i className="fas fa-trash-can" />
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Modal helpers (imported by the modals feature)
// ---------------------------------------------------------------------------

export function errText(e: unknown, fallback: string): string {
  const err = e as ApiError;
  return err && err.message ? err.message : fallback;
}

export type { FormEvent };
export type { ViewMode };
