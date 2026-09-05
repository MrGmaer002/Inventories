import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { Item } from '../../../shared/src/index.ts';
import { DEFAULT_CATEGORIES } from '../../../shared/src/index.ts';
import { useStore } from '../store.tsx';

/** Localized currency from settings. */
export function useMoney(): (v: number | string | null | undefined) => string {
  const { settings } = useStore();
  const cur = settings.currency;
  return (v: number | string | null | undefined): string => {
    const n = Number(v) || 0;
    return `${n.toFixed(2)} ${cur}`;
  };
}

export type StockLevel = 'out' | 'low' | 'ok';

export function stockLevelOf(item: Pick<Item, 'qty' | 'minQty'>): StockLevel {
  const qty = Number(item.qty) || 0;
  const min = Number(item.minQty) || 5;
  if (qty <= 0) return 'out';
  if (qty <= min) return 'low';
  return 'ok';
}

const STOCK_LABEL_KEY: Record<StockLevel, string> = {
  out: 'inv.outOfStock',
  low: 'inv.lowStock',
  ok: 'inv.inStock'
};

const STOCK_CSS: Record<StockLevel, string> = {
  out: 'badge-soft-danger',
  low: 'badge-soft-warning',
  ok: 'badge-soft-success'
};

export function StockTag({ item, pill = true }: { item: Item; pill?: boolean }): ReactNode {
  const { t } = useTranslation();
  const level = stockLevelOf(item);
  return <span className={`stock-tag ${STOCK_CSS[level]} ${pill ? 'tag-pill' : ''}`}>{t(STOCK_LABEL_KEY[level])}</span>;
}

/** Localized category name. */
export function useCategoryLabel(): (id: string) => string {
  const { t } = useTranslation();
  const { lang } = useStore();
  void lang;
  return (id: string): string => {
    const key = id || 'general';
    const cat = DEFAULT_CATEGORIES.find((c) => c.id === key);
    if (cat) return t(cat.name) as string;
    const known = `cat.${key}`;
    const direct = t(known) as string;
    return direct === known ? key : direct;
  };
}

export function StatBox({
  icon,
  label,
  value,
  tone = 'default'
}: {
  icon: string;
  label: string;
  value: ReactNode;
  tone?: 'default' | 'success' | 'cyan' | 'orange' | 'danger';
}): ReactNode {
  return (
    <div className={`stat-box stat-${tone}`}>
      <div className="stat-icon"><i className={icon} /></div>
      <div>
        <div className="stat-label">{label}</div>
        <div className="stat-value">{value}</div>
      </div>
    </div>
  );
}

export function EmptyState({ icon, text, children }: { icon: string; text: string; children?: ReactNode }): ReactNode {
  return (
    <div className="empty-state">
      <i className={icon} />
      <p>{text}</p>
      {children}
    </div>
  );
}
