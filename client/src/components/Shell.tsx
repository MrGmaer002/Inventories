import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { Item, ReportTotals, Shift } from '../../../shared/src/index.ts';
import { Endpoints } from '../api.ts';
import { switchLanguage } from '../i18n/index.ts';
import { useStore } from '../store.tsx';
import { useMoney } from './ui.tsx';

// ---------------------------------------------------------------------------
// Hook: fresh shift + summary + item count (auto-refreshes)
// ---------------------------------------------------------------------------

export interface StatusData {
  shift: Shift | null;
  summary: ReportTotals | null;
  itemCount: number;
}

export function useStatusData(intervalMs = 30000): StatusData {
  const { user, isAdmin, refreshTick } = useStore();
  const [data, setData] = useState<StatusData>({ shift: null, summary: null, itemCount: 0 });
  const fetching = useRef(false);

  const load = useCallback(async (): Promise<void> => {
    if (!user || fetching.current) return;
    fetching.current = true;
    try {
      const cashier = isAdmin ? undefined : user.id;
      const [s, r, items] = await Promise.all([
        Endpoints.shifts.active().catch(() => null),
        Endpoints.reports
          .summary({ kind: 'active-shift' }, cashier)
          .catch(() => null),
        Endpoints.items.list().catch(() => null)
      ]);
      setData({
        shift: s ? s.shift : null,
        summary: r ? r.totals : null,
        itemCount: items ? items.items.length : 0
      });
    } finally {
      fetching.current = false;
    }
  }, [user, isAdmin]);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), intervalMs);
    return () => window.clearInterval(id);
  }, [load, refreshTick, intervalMs]);

  return data;
}

// ---------------------------------------------------------------------------
// Live clock
// ---------------------------------------------------------------------------

export function LiveClock(): ReactNode {
  const { lang } = useStore();
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const locale = lang === 'ar' ? 'ar-EG' : 'en-GB';
  return (
    <span className="live-clock" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      {now.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Title bar
// ---------------------------------------------------------------------------

export function TitleBar(): ReactNode {
  const { t } = useTranslation();
  const { user, isAdmin, settings, lockScreen, logout, openModal, lang } = useStore();

  return (
    <header className="titlebar">
      <div className="brand">
        <span className="brand-logo"><i className="fas fa-boxes-stacked" /></span>
        <div>
          <strong>{settings.storeName || t('app.name')}</strong>
          <small>{t('app.version')}</small>
        </div>
      </div>

      <div className="titlebar-actions">
        <div className="user-chip" title={t('status.switchUser')}>
          <span className="user-chip-avatar">{user?.avatar || '👤'}</span>
          <div className="user-chip-text">
            <strong>{user?.fullName}</strong>
            <span className={`role-chip ${user?.role}`}>
              {isAdmin ? t('role.admin') : t('role.cashier')}
            </span>
          </div>
        </div>
        <button type="button" className="icon-btn" title={t('lang.change')} onClick={() => switchLanguage(lang === 'ar' ? 'en' : 'ar')}>
          <i className="fas fa-language" />
        </button>
        <button type="button" className="icon-btn" title={t('status.switchUser')} onClick={logout}>
          <i className="fas fa-right-from-bracket" />
        </button>
        <button type="button" className="icon-btn" title={t('auth.lock')} onClick={lockScreen}>
          <i className="fas fa-lock" />
        </button>
        <button type="button" className="icon-btn" title={t('status.settings')} onClick={() => openModal('settings')}>
          <i className="fas fa-gear" />
        </button>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------------------

export function Toolbar(): ReactNode {
  const { t } = useTranslation();
  const { isAdmin, openModal, lockScreen, toast } = useStore();

  const doBackup = async (): Promise<void> => {
    try {
      const data = await Endpoints.backup.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pancafe_backup_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast(t('backup.exported'), 'success');
    } catch {
      toast(t('errors.internal'), 'error');
    }
  };

  return (
    <nav className="toolbar">
      <div className="toolbar-group">
        <button type="button" className="tb-btn tb-accent" onClick={() => openModal('pos')}>
          <i className="fas fa-cash-register" /> <span>{t('toolbar.pos')}</span>
        </button>
        {isAdmin && (
          <button type="button" className="tb-btn tb-green" onClick={() => openModal('item')}>
            <i className="fas fa-plus-circle" /> <span>{t('toolbar.addItem')}</span>
          </button>
        )}
        <button type="button" className="tb-btn tb-warning" onClick={() => openModal('report')}>
          <i className="fas fa-chart-line" /> <span>{t('toolbar.report')}</span>
        </button>
        <button type="button" className="tb-btn tb-cyan" onClick={() => openModal('shift')}>
          <i className="fas fa-chart-pie" /> <span>{t('toolbar.shiftStats')}</span>
        </button>
      </div>

      <div className="toolbar-sep" />

      <div className="toolbar-group">
        {isAdmin && (
          <button type="button" className="tb-btn" onClick={() => openModal('users')}>
            <i className="fas fa-users-gear" /> <span>{t('toolbar.usersManage')}</span>
          </button>
        )}
        {isAdmin && (
          <button type="button" className="tb-btn" onClick={() => void doBackup()}>
            <i className="fas fa-database" /> <span>{t('toolbar.backup')}</span>
          </button>
        )}
        <button type="button" className="tb-btn" onClick={lockScreen}>
          <i className="fas fa-user-lock" /> <span>{t('toolbar.lock')}</span>
        </button>
      </div>
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Status bar
// ---------------------------------------------------------------------------

export function StatusBar(): ReactNode {
  const { t } = useTranslation();
  const { user } = useStore();
  const money = useMoney();
  const data = useStatusData();

  return (
    <footer className="statusbar">
      <div className="statusbar-section">
        <span className="sb-item"><i className="fas fa-circle online-dot" /> {t('status.systemOnline')}</span>
        <span className="sb-item">
          <i className="fas fa-user-tie" /> {t('status.cashier')}: <strong>{user?.fullName || '-'}</strong>
        </span>
        <span className="sb-item">
          <i className="fas fa-business-time" /> {t('status.shift')}:{' '}
          <strong className="text-cyan">{data.shift ? t('status.shiftNum', { num: data.shift.shiftNumber }) : '-'}</strong>
        </span>
        <span className="sb-item">
          <i className="fas fa-boxes-stacked" /> {t('status.itemsCount')}: <strong>{data.itemCount}</strong>
        </span>
      </div>
      <div className="statusbar-section">
        <span className="sb-item">
          <i className="fas fa-receipt" /> {t('status.invoicesCount')}: <strong>{data.summary?.invoices ?? 0}</strong>
        </span>
        <span className="sb-item sb-money">
          <i className="fas fa-coins" /> {t('status.drawerTotal')}:{' '}
          <strong>{data.summary ? money(data.summary.revenue) : money(0)}</strong>
        </span>
        <LiveClock />
      </div>
    </footer>
  );
}
