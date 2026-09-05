import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Endpoints } from '../api.ts';
import { switchLanguage } from '../i18n/index.ts';
import { useStore, type ConfirmOptions } from '../store.tsx';

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------

export function ToastsHost(): ReactNode {
  const { toasts } = useStore();
  const { t } = useTranslation();
  return createPortal(
    <div className="toast-host" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`app-toast toast-${toast.kind}`}>
          <i className={toastIcon(toast.kind)} />
          <span>{toast.message}</span>
        </div>
      ))}
      {toasts.length > 0 ? <span className="sr-only">{t('common.ok')}</span> : null}
    </div>,
    document.body
  );
}

function toastIcon(kind: string): string {
  switch (kind) {
    case 'success':
      return 'fas fa-check-circle';
    case 'error':
      return 'fas fa-circle-xmark';
    case 'warning':
      return 'fas fa-triangle-exclamation';
    default:
      return 'fas fa-circle-info';
  }
}

// ---------------------------------------------------------------------------
// Confirm dialog
// ---------------------------------------------------------------------------

export function ConfirmHost(): ReactNode {
  const { confirmState, dismissConfirm } = useStore();
  if (!confirmState) return null;
  return <ConfirmDialog options={confirmState} onCancel={dismissConfirm} />;
}

function ConfirmDialog({ options, onCancel }: { options: ConfirmOptions; onCancel: () => void }): ReactNode {
  const { t } = useTranslation();
  const busyRef = useRef(false);

  const handleOk = async (): Promise<void> => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      await options.onOk();
    } finally {
      onCancel();
    }
  };

  return (
    <div className="overlay-layer overlay-soft" onMouseDown={onCancel}>
      <div className="confirm-box pop-in" onMouseDown={(e) => e.stopPropagation()}>
        <div className="confirm-icon">
          <i className={options.variant === 'danger' ? 'fas fa-trash-can' : 'fas fa-triangle-exclamation'} />
        </div>
        <h4>{options.title}</h4>
        {options.body ? <p>{options.body}</p> : null}
        <div className="confirm-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            {t('common.cancel')}
          </button>
          <button type="button" className={`btn btn-${options.variant === 'danger' ? 'danger' : options.variant === 'warning' ? 'warning' : 'primary'}`} onClick={() => void handleOk()}>
            {options.okLabel || t('common.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Print host — renders receipt HTML into #print-root and triggers window.print
// ---------------------------------------------------------------------------

export function PrintHost(): ReactNode {
  const { printHtml, clearPrint } = useStore();
  const [printed, setPrinted] = useState<string | null>(null);

  useEffect(() => {
    if (printHtml && printHtml !== printed) {
      setPrinted(printHtml);
      const id = window.setTimeout(() => {
        window.print();
      }, 120);
      return () => window.clearTimeout(id);
    }
    if (!printHtml) {
      setPrinted(null);
    }
  }, [printHtml, printed]);

  useEffect(() => {
    if (printed) {
      const done = (): void => clearPrint();
      window.addEventListener('afterprint', done);
      return () => window.removeEventListener('afterprint', done);
    }
    return undefined;
  }, [printed, clearPrint]);

  if (!printed) return null;
  const root = document.getElementById('print-root');
  if (!root) return null;
  return createPortal(
    <div className="print-sheet" dangerouslySetInnerHTML={{ __html: printed }} />,
    root
  );
}

// ---------------------------------------------------------------------------
// Lock screen overlay
// ---------------------------------------------------------------------------

export function LockOverlay(): ReactNode {
  const { locked, user, unlockScreen, toast } = useStore();
  const { t } = useTranslation();
  const [pw, setPw] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (locked && inputRef.current) {
      setPw('');
      const id = window.setTimeout(() => inputRef.current?.focus(), 120);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [locked]);

  if (!locked || !user) return null;

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    const ok = await unlockScreen(pw);
    if (ok) toast(t('auth.unlocked'), 'success');
    else toast(t('auth.wrongPassword'), 'error');
  };

  return (
    <div className="overlay-layer lock-screen pop-in">
      <form className="lock-card" onSubmit={(e) => void submit(e)}>
        <div className="lock-avatar">{user.avatar || '👤'}</div>
        <h3>{t('auth.lockedTitle')}</h3>
        <p>{t('auth.lockedSubtitle')}</p>
        <p className="lock-user">{user.fullName} (@{user.username})</p>
        <div className="input-icon">
          <i className="fas fa-lock" />
          <input
            ref={inputRef}
            type="password"
            className="form-control"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder={t('auth.password')}
            autoFocus
          />
        </div>
        <button type="submit" className="btn btn-primary btn-block">
          <i className="fas fa-unlock" /> {t('auth.unlock')}
        </button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sign-in screen (no session) — account cards + password
// ---------------------------------------------------------------------------

export function SignInScreen(): ReactNode {
  const { user, login, toast, settings, lang } = useStore();
  const { t } = useTranslation();
  const [users, setUsers] = useState<Array<{ id: string; fullName: string; username: string; role: string; avatar: string }>>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (user) return;
    let alive = true;
    Endpoints.users
      .list()
      .then((res) => {
        if (!alive) return;
        setUsers(res.users);
        const first = res.users.find((u) => u.role === 'admin') || res.users[0];
        setSelected(first ? first.id : null);
      })
      .catch(() => undefined)
      .finally(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, [user]);

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    const u = users.find((x) => x.id === selected);
    if (!u || !pw) return;
    setBusy(true);
    try {
      const logged = await login({ username: u.username, password: pw });
      toast(t('auth.welcomeBack', { name: logged.fullName }), 'success');
    } catch {
      toast(t('auth.wrongPassword'), 'error');
    } finally {
      setBusy(false);
      setPw('');
    }
  };

  return (
    <div className="signin-screen">
      <button
        type="button"
        className="signin-lang icon-btn"
        title={t('lang.change')}
        onClick={() => switchLanguage(lang === 'ar' ? 'en' : 'ar')}
      >
        <i className="fas fa-language" />
      </button>
      <div className="signin-card pop-in">
        <div className="signin-brand">
          <div className="brand-logo"><i className="fas fa-boxes-stacked" /></div>
          <h1>{settings.storeName || t('app.name')}</h1>
          <p>{t('app.suite')}</p>
        </div>
        <h3>{t('auth.loginTitle')}</h3>
        <p className="signin-sub">{t('auth.loginSubtitle')}</p>

        <div className="user-card-grid">
          {users.map((u) => (
            <button
              key={u.id}
              type="button"
              className={`user-card ${selected === u.id ? 'active' : ''}`}
              onClick={() => {
                setSelected(u.id);
                setPw('');
              }}
            >
              <span className="user-card-avatar">{u.avatar || '👤'}</span>
              <strong>{u.fullName}</strong>
              <small>@{u.username}</small>
              <span className={`role-chip ${u.role}`}>
                {u.role === 'admin' ? t('role.adminShort') : t('role.cashierShort')}
              </span>
            </button>
          ))}
          {!loaded && <div className="signin-loading"><i className="fas fa-circle-notch fa-spin" /></div>}
          {loaded && users.length === 0 && <p>{t('common.empty')}</p>}
        </div>

        <form className="signin-form" onSubmit={(e) => void submit(e)}>
          <div className="input-icon">
            <i className="fas fa-key" />
            <input
              type="password"
              className="form-control"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder={t('auth.password')}
              autoComplete="current-password"
            />
          </div>
          <button type="submit" className="btn btn-primary btn-block" disabled={busy || !selected}>
            {busy ? <i className="fas fa-circle-notch fa-spin" /> : <i className="fas fa-right-to-bracket" />}
            {' '}{t('auth.loginBtn')}
          </button>
        </form>
        <p className="signin-hint"><i className="fas fa-circle-info" /> {t('auth.defaultHint')}</p>
      </div>
    </div>
  );
}
