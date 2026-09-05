import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { ReportLine, ReportScope, ReportTotals, Sale, Shift, User } from '../../../shared/src/index.ts';
import { Endpoints } from '../api.ts';
import { useStore } from '../store.tsx';
import { dateLabel, downloadTextFile, salesToCsv, signedMoney, timeLabel } from '../utils/format.ts';
import { shiftReceiptHtml } from '../utils/receipts.ts';
import { useMoney } from '../components/ui.tsx';

type Tab = 'active-shift' | 'today' | 'lookup' | 'history';

function emptyTotals(): ReportTotals {
  return { revenue: 0, cost: 0, profit: 0, marginPct: 0, invoices: 0, itemsQty: 0 };
}

interface Bundle {
  totals: ReportTotals;
  items: ReportLine[];
  sales: Sale[];
}

export function ReportsModal(): ReactNode {
  const { t } = useTranslation();
  const { isOpen, closeModal, isAdmin, refreshTick, openModal, settings, toast } = useStore();
  const money = useMoney();
  const lang = document.documentElement.lang || 'ar';

  const open = isOpen('report');
  const [tab, setTab] = useState<Tab>('active-shift');
  const [shift, setShift] = useState<Shift | null>(null);

  const tabs: Array<{ id: Tab; label: string; icon: string; adminOnly?: boolean }> = [
    { id: 'active-shift', label: t('report.tabActive'), icon: 'fas fa-business-time' },
    { id: 'today', label: t('report.tabToday'), icon: 'fas fa-calendar-day', adminOnly: true },
    { id: 'lookup', label: t('report.tabLookup'), icon: 'fas fa-user-magnifying-glass', adminOnly: true },
    { id: 'history', label: t('report.tabHistory'), icon: 'fas fa-archive' }
  ];
  const visibleTabs = tabs.filter((x) => !x.adminOnly || isAdmin);

  useEffect(() => {
    if (!open) return;
    if (!visibleTabs.some((x) => x.id === tab)) setTab('active-shift');
    let alive = true;
    void Endpoints.shifts
      .active()
      .then((r) => alive && setShift(r.shift))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const exportCsv = async (): Promise<void> => {
    const scope: ReportScope =
      tab === 'active-shift' ? { kind: 'active-shift' } : tab === 'today' ? { kind: 'today' } : { kind: 'all' };
    try {
      const { sales } = await Endpoints.reports.sales(scope);
      if (sales.length === 0) {
        toast(t('report.noData'), 'warning');
        return;
      }
      const labels = [
        t('report.colInvoice'),
        t('report.colDate'),
        t('report.colTime'),
        t('report.colCashier'),
        t('report.colCustomer'),
        t('pos.subtotal'),
        t('pos.discount'),
        t('pos.netDue'),
        t('inv.colName')
      ];
      const rows = sales.map((s) => ({
        invoice: s.invoiceNo,
        date: s.date,
        time: s.time,
        cashier: s.cashierName,
        customer: s.customer,
        subtotal: s.subtotal,
        discount: s.discount,
        total: s.total,
        items: s.items.map((i) => `${i.name} (${i.qty})`).join(' - ')
      }));
      const csv = salesToCsv(
        rows,
        ['invoice', 'date', 'time', 'cashier', 'customer', 'subtotal', 'discount', 'total', 'items'],
        labels
      );
      downloadTextFile(`PanCafe_Report_${new Date().toISOString().slice(0, 10)}.csv`, csv, 'text/csv;charset=utf-8;');
      toast(t('backup.exported'), 'success');
    } catch {
      toast(t('errors.network'), 'error');
    }
  };

  return (
    <div className="overlay-layer" onMouseDown={() => closeModal('report')}>
      <div className="modal-panel modal-xl report-panel pop-in" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3><i className="fas fa-receipt" /> {t('report.title')}</h3>
          <button type="button" className="icon-btn" onClick={() => closeModal('report')}><i className="fas fa-xmark" /></button>
        </div>

        <div className="tabs-bar">
          {visibleTabs.map((tb) => (
            <button
              key={tb.id}
              type="button"
              className={`tab-btn ${tab === tb.id ? 'active' : ''}`}
              onClick={() => setTab(tb.id)}
            >
              <i className={tb.icon} /> {tb.label}
            </button>
          ))}
        </div>

        <div className="modal-body">
          {tab === 'lookup' && isAdmin ? (
            <CashierLookup refreshTick={refreshTick} />
          ) : tab === 'history' ? (
            <ShiftsHistory />
          ) : (
            <SalesReport
              scope={tab === 'today' ? { kind: 'today' } : { kind: 'active-shift' }}
              shift={shift}
              lang={lang}
              isAdmin={isAdmin}
              refreshTick={refreshTick}
              currency={settings.currency}
            />
          )}
        </div>

        <div className="modal-foot between">
          <button type="button" className="btn btn-ghost" onClick={() => void exportCsv()}>
            <i className="fas fa-file-csv" /> {t('report.exportCsv')}
          </button>
          <div className="foot-group">
            {isAdmin && (
              <button
                type="button"
                className="btn btn-warning"
                onClick={() => {
                  closeModal('report');
                  openModal('shift');
                }}
              >
                <i className="fas fa-shield-halved" /> {t('report.closeShiftNow')}
              </button>
            )}
            <button type="button" className="btn btn-ghost" onClick={() => closeModal('report')}>{t('common.close')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Active-shift / today tab
// ---------------------------------------------------------------------------

function SalesReport(props: {
  scope: ReportScope;
  shift: Shift | null;
  lang: string;
  isAdmin: boolean;
  refreshTick: number;
  currency: string;
}): ReactNode {
  const { t } = useTranslation();
  const { user } = useStore();
  const money = useMoney();
  const [bundle, setBundle] = useState<Bundle>({ totals: emptyTotals(), items: [], sales: [] });
  const [loading, setLoading] = useState(true);

  const cashierId = props.isAdmin ? undefined : user?.id;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void Promise.all([
      Endpoints.reports.summary(props.scope, cashierId),
      Endpoints.reports.sales(props.scope, cashierId)
    ])
      .then(([s, l]) => alive && setBundle({ totals: s.totals, items: s.items, sales: l.sales }))
      .catch(() => alive && setBundle({ totals: emptyTotals(), items: [], sales: [] }))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [props.scope.kind, cashierId, props.refreshTick]);

  const startLabel =
    props.shift && props.scope.kind === 'active-shift'
      ? `${dateLabel(props.shift.startedAt, props.lang)} · ${timeLabel(props.shift.startedAt, props.lang)}`
      : '';

  if (loading) {
    return (
      <div className="center-loader">
        <i className="fas fa-circle-notch fa-spin" /> {t('common.loading')}
      </div>
    );
  }

  const scopeIsActive = props.scope.kind === 'active-shift';

  return (
    <div className="report-body">
      <div className="report-context">
        <span>
          <i className="fas fa-calendar-check" />
          {scopeIsActive
            ? t('report.shiftBadge', { num: props.shift?.shiftNumber ?? '-' })
            : t('report.todayBadge')}
        </span>
        {startLabel && <span className="text-muted">{startLabel}</span>}
      </div>

      <div className="kpi-row">
        <Kpi icon="fas fa-money-bill-wave" tone="cyan" label={t('report.revenue')} value={money(bundle.totals.revenue)} />
        {props.isAdmin && <Kpi icon="fas fa-truck-ramp-box" tone="orange" label={t('report.cost')} value={money(bundle.totals.cost)} />}
        {props.isAdmin && (
          <Kpi icon="fas fa-chart-line" tone="success" label={t('report.profit')} value={signedMoney(bundle.totals.profit, props.currency)} />
        )}
        <Kpi icon="fas fa-receipt" tone="default" label={t('report.invoices')} value={bundle.totals.invoices} />
        <Kpi icon="fas fa-boxes-stacked" tone="default" label={t('report.itemsSoldCount')} value={bundle.totals.itemsQty} />
      </div>

      {props.isAdmin && (
        <>
          <h4 className="report-h4"><i className="fas fa-calculator" /> {t('report.profitTableTitle')}</h4>
          <div className="table-wrap slim">
            <table className="table align-middle">
              <thead>
                <tr>
                  <th>{t('report.colItem')}</th>
                  <th>{t('report.colSoldQty')}</th>
                  <th className="text-end">{t('report.colBuyPrice')}</th>
                  <th className="text-end">{t('report.colSellPrice')}</th>
                  <th className="text-end">{t('report.colTotalCost')}</th>
                  <th className="text-end">{t('report.colTotalSale')}</th>
                  <th className="text-end">{t('report.colTotalProfit')}</th>
                </tr>
              </thead>
              <tbody>
                {bundle.items.length === 0 ? (
                  <tr><td colSpan={7} className="text-center text-muted py-4">{t('report.noData')}</td></tr>
                ) : (
                  bundle.items.map((it) => (
                    <tr key={it.itemId || it.name}>
                      <td><strong>{it.name}</strong></td>
                      <td><span className="badge badge-soft-warning">{it.qty}</span></td>
                      <td className="text-end text-muted">{money(it.buyPrice)}</td>
                      <td className="text-end">{money(it.price)}</td>
                      <td className="text-end text-muted">{money(it.totalCost)}</td>
                      <td className="text-end">{money(it.total)}</td>
                      <td className="text-end text-success fw-bold">+{money(it.profit)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h4 className="report-h4"><i className="fas fa-list-check" /> {t('report.invoicesDetails')}</h4>
      <div className="table-wrap slim">
        <table className="table align-middle">
          <thead>
            <tr>
              <th>{t('report.colInvoice')}</th>
              <th>{t('report.colTime')}</th>
              {props.isAdmin && <th>{t('report.colCashier')}</th>}
              {props.isAdmin && <th>{t('report.colCustomer')}</th>}
              <th>{t('report.colItems')}</th>
              <th className="text-end">{t('report.colAmount')}</th>
            </tr>
          </thead>
          <tbody>
            {bundle.sales.length === 0 ? (
              <tr><td colSpan={props.isAdmin ? 6 : 3} className="text-center text-muted py-4">{t('report.noSales')}</td></tr>
            ) : (
              bundle.sales.map((s) => (
                <tr key={s.id}>
                  <td><strong>{s.invoiceNo}</strong></td>
                  <td>{timeLabel(s.time, props.lang)}</td>
                  {props.isAdmin && <td>{s.cashierName}</td>}
                  {props.isAdmin && <td>{s.customer}</td>}
                  <td className="small text-muted">{s.items.map((i) => `${i.name} ×${i.qty}`).join(', ')}</td>
                  <td className="text-end fw-bold">{money(s.total)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cashier lookup (admin)
// ---------------------------------------------------------------------------

let lookupSeq = 0;

function CashierLookup({ refreshTick }: { refreshTick: number }): ReactNode {
  const { t } = useTranslation();
  const { settings } = useStore();
  const money = useMoney();
  const [users, setUsers] = useState<User[]>([]);
  const [cashierId, setCashierId] = useState('');
  const [shiftOpts, setShiftOpts] = useState<Array<{ id: string; label: string }>>([]);
  const [shiftId, setShiftId] = useState('active');
  const [result, setResult] = useState<Bundle | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    void Endpoints.users
      .list()
      .then((r) => alive && setUsers(r.users.filter((u) => u.role !== 'admin')))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const onCashierChange = (id: string): void => {
    setCashierId(id);
    setResult(null);
    setShiftId('active');
    if (!id) return;
    // token guards against stale async responses
    const mySeq = ++lookupSeq;
    void Endpoints.shifts.history().then((r) =>
      Promise.all(r.shifts.map(async (sh) => ({ sh, count: (await Endpoints.reports.sales({ kind: 'shift', shiftId: sh.id }, id)).sales.length }))).then(
        (rows) => {
          if (mySeq !== lookupSeq) return;
          const opts: Array<{ id: string; label: string }> = [{ id: 'active', label: t('report.lookupActiveShift') }];
          rows.forEach(({ sh, count }) => {
            if (count > 0) {
              opts.push({
                id: String(sh.id),
                label: t('report.lookupShiftOpt', {
                  num: sh.shiftNumber,
                  date: dateLabel(sh.startedAt, i18nLang()),
                  start: timeLabel(sh.startedAt ?? '', i18nLang()),
                  end: timeLabel(sh.endedAt ?? '', i18nLang())
                })
              });
            }
          });
          setShiftOpts(opts);
        }
      )
    );
  };

  const show = async (): Promise<void> => {
    if (!cashierId) return;
    setLoading(true);
    setResult(null);
    try {
      const scope: ReportScope = shiftId === 'active' ? { kind: 'active-shift' } : { kind: 'shift', shiftId: Number(shiftId) };
      const [s, l] = await Promise.all([Endpoints.reports.summary(scope, cashierId), Endpoints.reports.sales(scope, cashierId)]);
      setResult({ totals: s.totals, items: s.items, sales: l.sales });
    } finally {
      setLoading(false);
    }
  };

  void refreshTick;
  const cashierName = users.find((u) => u.id === cashierId)?.fullName || '';

  return (
    <div className="lookup-body">
      <div className="lookup-controls">
        <label className="field">
          <span>{t('report.lookupTitle')}</span>
          <select className="form-select" value={cashierId} onChange={(e) => onCashierChange(e.target.value)}>
            <option value="">{t('report.lookupPlaceholder')}</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.fullName}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{t('report.lookupShift')}</span>
          <select className="form-select" value={shiftId} onChange={(e) => setShiftId(e.target.value)}>
            {shiftOpts.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
        </label>
        <button type="button" className="btn btn-primary align-self-end" disabled={!cashierId || loading} onClick={() => void show()}>
          {loading ? <i className="fas fa-circle-notch fa-spin" /> : <i className="fas fa-magnifying-glass" />} {t('report.lookupShow')}
        </button>
      </div>

      {!result && !loading && <div className="muted-center">{t('report.lookupEmpty')}</div>}

      {result && (
        <div className="lookup-results">
          <div className="kpi-row">
            <Kpi icon="fas fa-user" tone="default" label={t('report.lookupCashierLabel')} value={cashierName} />
            <Kpi icon="fas fa-receipt" tone="default" label={t('report.lookupInvoices')} value={result.totals.invoices} />
            <Kpi icon="fas fa-money-bill-wave" tone="success" label={t('report.lookupCash')} value={money(result.totals.revenue)} />
            <Kpi icon="fas fa-chart-line" tone="success" label={t('report.lookupProfit')} value={signedMoney(result.totals.profit, settings.currency)} />
          </div>
          <div className="table-wrap slim">
            <table className="table align-middle">
              <thead>
                <tr>
                  <th>{t('report.colItem')}</th>
                  <th>{t('report.colSoldQty')}</th>
                  <th className="text-end">{t('report.colAmount')}</th>
                </tr>
              </thead>
              <tbody>
                {result.items.length === 0 ? (
                  <tr><td colSpan={3} className="text-center text-muted py-4">{t('report.lookupNoSales')}</td></tr>
                ) : (
                  result.items.map((it) => (
                    <tr key={it.itemId || it.name}>
                      <td><strong>{it.name}</strong></td>
                      <td><span className="badge badge-soft-warning">{it.qty} {it.unit}</span></td>
                      <td className="text-end fw-bold text-success">{money(it.total)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shift history tab
// ---------------------------------------------------------------------------

function ShiftsHistory(): ReactNode {
  const { t } = useTranslation();
  const money = useMoney();
  const { requestPrint, settings, isAdmin, refreshTick } = useStore();
  const [shifts, setShifts] = useState<Shift[]>([]);

  useEffect(() => {
    let alive = true;
    void Endpoints.shifts
      .history()
      .then((r) => alive && setShifts(r.shifts))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [refreshTick]);

  const printShift = async (id: number): Promise<void> => {
    try {
      const report = await Endpoints.shifts.report(id);
      requestPrint(shiftReceiptHtml(report, settings, isAdmin));
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="report-body">
      <div className="table-wrap slim">
        <table className="table align-middle">
          <thead>
            <tr>
              <th>{t('report.colShift')}</th>
              <th>{t('report.colDate')}</th>
              <th>{t('report.colCloser')}</th>
              <th>{t('report.colPeriod')}</th>
              <th>{t('report.colInvoices')}</th>
              <th className="text-end">{t('report.colCash')}</th>
              <th className="text-center">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {shifts.length === 0 ? (
              <tr><td colSpan={7} className="text-center text-muted py-4">{t('report.historyEmpty')}</td></tr>
            ) : (
              shifts.map((sh) => (
                <tr key={sh.id}>
                  <td><strong>#{sh.shiftNumber}</strong></td>
                  <td>{dateLabel(sh.startedAt, i18nLang())}</td>
                  <td><span className="badge badge-soft-success">{sh.closedBy || sh.cashierName}</span></td>
                  <td className="small text-muted">
                    {t('report.shiftPeriod', {
                      start: timeLabel(sh.startedAt ?? '', i18nLang()),
                      end: timeLabel(sh.endedAt ?? '', i18nLang())
                    })}
                  </td>
                  <td>{sh.invoices ?? 0}</td>
                  <td className="text-end">
                    <strong className="text-success">{money(sh.expectedCash ?? 0)}</strong>
                    {sh.shortage > 0 && <div className="small text-danger">{t('report.shortageTag', { amt: money(sh.shortage) })}</div>}
                    {sh.surplus > 0 && <div className="small text-cyan">{t('report.surplusTag', { amt: money(sh.surplus) })}</div>}
                  </td>
                  <td className="text-center">
                    <button type="button" className="btn btn-xs btn-ghost" onClick={() => void printShift(sh.id)}>
                      <i className="fas fa-print" /> {t('common.print')}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

function Kpi(props: { icon: string; tone: string; label: string; value: ReactNode }): ReactNode {
  return (
    <div className={`kpi kpi-${props.tone}`}>
      <span className="kpi-icon"><i className={props.icon} /></span>
      <div>
        <div className="kpi-label">{props.label}</div>
        <div className="kpi-value">{props.value}</div>
      </div>
    </div>
  );
}

function i18nLang(): string {
  return document.documentElement.lang || 'ar';
}
