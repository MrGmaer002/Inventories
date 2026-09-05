import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { ReportLine, ReportTotals, Shift, ShiftReport } from '../../../shared/src/index.ts';
import { Endpoints } from '../api.ts';
import { useStore } from '../store.tsx';
import { durationLabel, signedMoney, timeLabel } from '../utils/format.ts';
import { shiftReceiptHtml } from '../utils/receipts.ts';
import { useMoney } from '../components/ui.tsx';
import { errText } from './Inventory.tsx';

function emptyTotals(): ReportTotals {
  return { revenue: 0, cost: 0, profit: 0, marginPct: 0, invoices: 0, itemsQty: 0 };
}

type AuditKind = 'match' | 'short' | 'surplus';

function auditKindOf(diff: number): AuditKind {
  if (Math.abs(diff) < 0.01) return 'match';
  return diff < 0 ? 'short' : 'surplus';
}

export function ShiftConsole(): ReactNode {
  const { t } = useTranslation();
  const {
    isOpen,
    closeModal,
    closeAllModals,
    isAdmin,
    user,
    settings,
    toast,
    sfx,
    requestPrint,
    bump,
    refreshTick
  } = useStore();
  const money = useMoney();
  const lang = document.documentElement.lang || 'ar';
  const open = isOpen('shift');

  const [shift, setShift] = useState<Shift | null>(null);
  const [totals, setTotals] = useState<ReportTotals>(emptyTotals());
  const [items, setItems] = useState<ReportLine[]>([]);
  const [itemQuery, setItemQuery] = useState('');
  const [counted, setCounted] = useState('');
  const [password, setPassword] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [closedReport, setClosedReport] = useState<ShiftReport | null>(null);
  const [, setNow] = useState(Date.now());

  // Tick every second so the elapsed-duration label stays fresh.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const load = useCallback(async (): Promise<void> => {
    if (!open) return;
    try {
      const [sh, summary] = await Promise.all([
        Endpoints.shifts.active(),
        Endpoints.reports.summary({ kind: 'active-shift' }, isAdmin ? undefined : user?.id)
      ]);
      setShift(sh.shift);
      setTotals(summary.totals);
      setItems(summary.items);
    } catch {
      /* ignore */
    }
  }, [open, isAdmin, user?.id, refreshTick]);

  useEffect(() => {
    if (!open) return undefined;
    setShowConfirm(false);
    setCounted('');
    setPassword('');
    void load();
    const id = window.setInterval(() => void load(), 30000);
    return () => window.clearInterval(id);
  }, [open, load]);

  const filteredItems = useMemo(() => {
    const q = itemQuery.trim().toLowerCase();
    return q ? items.filter((it) => it.name.toLowerCase().includes(q)) : items;
  }, [items, itemQuery]);

  const expected = totals.revenue;
  const countedVal = counted === '' ? null : Number(counted);
  const audit =
    countedVal === null || Number.isNaN(countedVal)
      ? null
      : { counted: countedVal, diff: Math.round((countedVal - expected) * 100) / 100 };
  const auditKind: AuditKind | null = audit ? auditKindOf(audit.diff) : null;

  const doClose = async (): Promise<void> => {
    if (!password) {
      toast(t('auth.password'), 'warning');
      return;
    }
    setBusy(true);
    try {
      const res = await Endpoints.shifts.close({
        actualCash: audit ? audit.counted : null,
        actorUsername: user?.username,
        actorPassword: password
      });
      sfx('cash');
      setClosedReport(res.closedReport);
      closeAllModals();
      bump();
      const sh = res.closedReport.shift;
      if (sh.shortage > 0) toast(t('shift.closedWithShortage', { amt: money(sh.shortage) }), 'warning');
      else if (sh.surplus > 0) toast(t('shift.closedWithSurplus', { amt: money(sh.surplus) }), 'info');
      else toast(t('shift.closedOk'), 'success');
    } catch (err) {
      toast(errText(err, t('errors.internal')), 'error');
    } finally {
      setBusy(false);
      setPassword('');
    }
  };

  // -- standalone post-close overlay (kept alive even though the modal closed)
  if (closedReport) {
    return (
      <ClosedOverlay
        report={closedReport}
        isAdmin={isAdmin}
        onStartSelling={() => {
          setClosedReport(null);
          closeAllModals();
          bump();
        }}
        onPrint={() => requestPrint(shiftReceiptHtml(closedReport, settings, isAdmin))}
      />
    );
  }

  if (!open) return null;

  return (
    <div className="overlay-layer" onMouseDown={() => closeModal('shift')}>
      <div className="modal-panel modal-xl shift-panel pop-in" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>
            <i className="fas fa-chart-pie" /> {t('shift.title')}
            <span className="live-chip"><span className="pulse-dot" /> {t('shift.liveChip')}</span>
          </h3>
          <button type="button" className="icon-btn" onClick={() => closeModal('shift')}><i className="fas fa-xmark" /></button>
        </div>

        <div className="shift-context">
          <div className="shift-user">
            <span className="user-chip-avatar">{user?.avatar || '👤'}</span>
            <div>
              <strong>{user?.fullName}</strong>
              <span className="text-muted small">{isAdmin ? t('role.admin') : t('role.cashier')}</span>
            </div>
          </div>
          <div className="shift-meta">
            <div>
              <span className="text-muted small">{t('shift.startedAt')}</span>
              <strong>{shift ? `${dateOnly(shift.startedAt, lang)} · ${timeLabel(shift.startedAt, lang)}` : '—'}</strong>
            </div>
            <div>
              <span className="text-muted small">{t('shift.duration')}</span>
              <strong className="text-warning">{shift ? durationLabel(shift.startedAt, lang) : '—'}</strong>
            </div>
          </div>
        </div>

        <div className="kpi-row">
          <Kpi icon="fas fa-money-bill-wave" tone="cash" label={t('shift.drawerCash')} value={money(totals.revenue)} sub={t('shift.drawerSub')} />
          <Kpi icon="fas fa-receipt" tone="default" label={t('shift.invoices')} value={totals.invoices} sub={t('shift.invoicesSub')} />
          <Kpi icon="fas fa-boxes-stacked" tone="default" label={t('shift.pieces')} value={totals.itemsQty} sub={t('shift.piecesSub')} />
          {isAdmin && <Kpi icon="fas fa-truck-ramp-box" tone="orange" label={t('shift.costOfGoods')} value={money(totals.cost)} sub="COGS" />}
          {isAdmin && (
            <Kpi
              icon="fas fa-chart-line"
              tone="success"
              label={t('shift.netProfit')}
              value={signedMoney(totals.profit, settings.currency)}
              sub={t('shift.margin', { pct: totals.marginPct })}
            />
          )}
        </div>

        {!isAdmin && (
          <div className="notice-cashier">
            <i className="fas fa-shield-halved" /> {t('shift.cashierNotice')}
          </div>
        )}

        {/* Drawer count / audit */}
        <div className="audit-count-row">
          <label className="field audit-input">
            <span><i className="fas fa-cash-register" /> {t('shift.countedCash')}</span>
            <div className="input-affix">
              <input
                type="number"
                min={0}
                step="0.5"
                className="form-control form-control-lg"
                value={counted}
                onChange={(e) => setCounted(e.target.value)}
                placeholder="0.00"
              />
              <span>{settings.currency}</span>
            </div>
          </label>
          <div className="audit-expected">
            <div className="text-muted small">{t('shift.expectedDrawer')}</div>
            <strong>{money(expected)}</strong>
          </div>
        </div>

        {audit && (
          <div className={`audit-banner banner-${auditKind === 'short' ? 'danger' : auditKind === 'surplus' ? 'cyan' : 'success'}`}>
            {auditKind === 'short' && (
              <>
                <strong>{t('shift.shortageMsg', { amt: money(Math.abs(audit.diff)) })}</strong>
                <span>{t('shift.expectedVsCounted', { expected: money(expected), counted: money(audit.counted) })}</span>
              </>
            )}
            {auditKind === 'surplus' && (
              <>
                <strong>{t('shift.surplusMsg', { amt: money(audit.diff) })}</strong>
                <span>{t('shift.expectedVsCounted', { expected: money(expected), counted: money(audit.counted) })}</span>
              </>
            )}
            {auditKind === 'match' && <strong>{t('shift.match')}</strong>}
          </div>
        )}

        <div className="table-head-row">
          <h4><i className="fas fa-box-open" /> {t('shift.itemsSoldList')}</h4>
          <div className="search-box sm">
            <i className="fas fa-filter" />
            <input className="form-control" placeholder={t('report.filterItems')} value={itemQuery} onChange={(e) => setItemQuery(e.target.value)} />
          </div>
        </div>

        <div className="table-wrap slim">
          <table className="table align-middle">
            <thead>
              <tr>
                <th>{t('report.colItem')}</th>
                <th>{t('report.colSoldQty')}</th>
                <th className="text-end">{t('report.colSellPrice')}</th>
                <th className="text-end">{t('report.colAmount')}</th>
                {isAdmin && <th className="text-end">{t('report.colBuyPrice')}</th>}
                {isAdmin && <th className="text-end">{t('report.colTotalCost')}</th>}
                {isAdmin && <th className="text-end">{t('report.colTotalProfit')}</th>}
              </tr>
            </thead>
            <tbody>
              {filteredItems.length === 0 ? (
                <tr><td colSpan={isAdmin ? 7 : 4} className="text-center text-muted py-4">{t('shift.noSalesYet')}</td></tr>
              ) : (
                filteredItems.map((it) => (
                  <tr key={it.itemId || it.name}>
                    <td><strong>{it.name}</strong></td>
                    <td><span className="badge badge-soft-warning">{it.qty} {it.unit}</span></td>
                    <td className="text-end">{money(it.price)}</td>
                    <td className="text-end fw-bold text-success">{money(it.total)}</td>
                    {isAdmin && <td className="text-end text-muted">{money(it.buyPrice)}</td>}
                    {isAdmin && <td className="text-end text-muted">{money(it.totalCost)}</td>}
                    {isAdmin && <td className="text-end text-success fw-bold">+{money(it.profit)}</td>}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="modal-foot between">
          <span className="text-muted small">{t('shift.countPrompt')}</span>
          <button type="button" className="btn btn-warning btn-lg" onClick={() => setShowConfirm(true)} disabled={busy}>
            <i className="fas fa-lock" /> {t('shift.closeBtn')}
          </button>
        </div>
      </div>

      <ShiftCloseConfirm
        show={showConfirm}
        audit={audit}
        kind={auditKind}
        expected={expected}
        password={password}
        busy={busy}
        onPassword={setPassword}
        onCancel={() => setShowConfirm(false)}
        onConfirm={() => void doClose()}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Post-close summary overlay (independent of the 'shift' modal state)
// ---------------------------------------------------------------------------

function ClosedOverlay(props: {
  report: ShiftReport;
  isAdmin: boolean;
  onStartSelling: () => void;
  onPrint: () => void;
}): ReactNode {
  const { t } = useTranslation();
  const { settings } = useStore();
  const money = useMoney();
  const lang = document.documentElement.lang || 'ar';
  const { report, isAdmin, onStartSelling, onPrint } = props;
  const s = report.shift;

  return (
    <div className="overlay-layer lock-screen pop-in">
      <div className="done-card pop-in">
        <div className="done-icon"><i className="fas fa-check-circle" /></div>
        <h2>{t('shift.closedTitle')}</h2>
        <p>{t('shift.closedSub')}</p>

        <div className="done-summary">
          <div className="done-summary-top">
            <div>
              <div className="text-muted small">{t('shift.closedBy')}</div>
              <strong>{s.closedBy || s.cashierName}</strong>
              <div className="small text-cyan">#{s.shiftNumber} · {dateOnly(s.startedAt, lang)}</div>
            </div>
            <div className="text-end">
              <div className="text-muted small">{t('shift.drawerActual')}</div>
              <div className="done-cash">{money(s.actualCash ?? report.totals.revenue)}</div>
              <div className="text-muted small">{t('shift.systemSales', { amt: money(s.expectedCash ?? report.totals.revenue) })}</div>
            </div>
          </div>

          {s.shortage > 0 && (
            <div className="done-banner banner-danger">
              <i className="fas fa-triangle-exclamation" /> {t('shift.shortageFound', { amt: money(s.shortage) })}
            </div>
          )}
          {s.surplus > 0 && (
            <div className="done-banner banner-cyan">
              <i className="fas fa-arrow-trend-up" /> {t('shift.surplusFound', { amt: money(s.surplus) })}
            </div>
          )}
          {s.shortage === 0 && s.surplus === 0 && (
            <div className="done-banner banner-success">
              <i className="fas fa-circle-check" /> {t('shift.matchFound', { amt: money(s.actualCash ?? report.totals.revenue) })}
            </div>
          )}

          {isAdmin && (
            <div className="done-admin">
              <span>{t('report.cost')}: <strong className="text-warning">{money(report.totals.cost)}</strong></span>
              <span>{t('shift.netProfit')}: <strong className="text-success">{signedMoney(report.totals.profit, settings.currency)}</strong></span>
            </div>
          )}

          <div className="done-items-head">{t('shift.itemsOutList')}</div>
          <div className="done-items">
            {report.items.length === 0 ? (
              <div className="text-muted small text-center py-3">{t('shift.noItems')}</div>
            ) : (
              report.items.map((it) => (
                <div className="done-item" key={it.itemId || it.name}>
                  <span>{it.name}</span>
                  <span className="text-muted small">{it.qty} {it.unit}</span>
                  <strong className="text-success">{money(it.total)}</strong>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="done-actions">
          <button type="button" className="btn btn-primary" onClick={onStartSelling}>
            <i className="fas fa-play" /> {t('shift.startNewBtn')}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onPrint}>
            <i className="fas fa-print" /> {t('shift.printReport')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Nested confirm (password + audit summary) rendered over the console
// ---------------------------------------------------------------------------

function ShiftCloseConfirm(props: {
  show: boolean;
  audit: { counted: number; diff: number } | null;
  kind: AuditKind | null;
  expected: number;
  password: string;
  busy: boolean;
  onPassword: (v: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}): ReactNode {
  const { t } = useTranslation();
  const money = useMoney();
  if (!props.show) return null;
  const { audit, kind, expected, password, busy, onPassword, onCancel, onConfirm } = props;
  const counted = audit ? audit.counted : expected;
  const shortage = kind === 'short' ? Math.abs(audit!.diff) : 0;
  const surplus = kind === 'surplus' ? audit!.diff : 0;

  return (
    <div className="overlay-layer overlay-soft pop-in" onMouseDown={onCancel}>
      <div className="confirm-box confirm-shift" onMouseDown={(e) => e.stopPropagation()}>
        <h4><i className="fas fa-lock" /> {t('shift.closeBtn')}</h4>
        <p className="text-muted small">{t('shift.passwordConfirm')}</p>

        <div className={`audit-banner banner-${kind === 'short' ? 'danger' : kind === 'surplus' ? 'cyan' : 'success'} mb-2`}>
          {kind === 'short' && (
            <>
              <strong>{t('shift.closeWarningShortage')}</strong>
              <div className="d-flex justify-content-between small mt-1">
                <span>{t('shift.systemExpected')} {money(expected)}</span>
                <span>{t('shift.actualCounted')} {money(counted)}</span>
              </div>
              <div className="mt-1">{t('shift.shortageValue')} <strong>{money(shortage)}</strong></div>
            </>
          )}
          {kind === 'surplus' && (
            <>
              <strong>{t('shift.closeNoticeSurplus')}</strong>
              <div className="d-flex justify-content-between small mt-1">
                <span>{t('shift.systemExpected')} {money(expected)}</span>
                <span>{t('shift.actualCounted')} {money(counted)}</span>
              </div>
              <div className="mt-1">{t('shift.surplusValue')} <strong>+{money(surplus)}</strong></div>
            </>
          )}
          {kind === 'match' && (
            <>
              <strong>{t('shift.closeOk')}</strong>
              <div className="small mt-1">{t('shift.matchFound', { amt: money(counted) })}</div>
            </>
          )}
          {kind === null && <strong className="small">{t('shift.closePreviewNone')}</strong>}
        </div>

        <div className="input-icon">
          <i className="fas fa-key" />
          <input
            type="password"
            className="form-control"
            value={password}
            onChange={(e) => onPassword(e.target.value)}
            placeholder={t('auth.password')}
            autoFocus
          />
        </div>

        <div className="confirm-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>{t('common.cancel')}</button>
          <button type="button" className="btn btn-danger" onClick={onConfirm} disabled={busy || !password}>
            {busy ? <i className="fas fa-circle-notch fa-spin" /> : <i className="fas fa-lock" />} {t('shift.closeBtn')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

function Kpi(props: { icon: string; tone: string; label: string; value: ReactNode; sub?: string }): ReactNode {
  return (
    <div className={`kpi kpi-${props.tone}`}>
      <span className="kpi-icon"><i className={props.icon} /></span>
      <div>
        <div className="kpi-label">{props.label}</div>
        <div className="kpi-value">{props.value}</div>
        {props.sub && <div className="kpi-sub">{props.sub}</div>}
      </div>
    </div>
  );
}

function dateOnly(iso: string | null, lang: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-GB');
}
