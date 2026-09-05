import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react';
import type { LoginPayload, Settings, User } from '../../shared/src/index.ts';
import { Endpoints, setApiActor } from './api.ts';
import { playSound } from './utils/sound.ts';
import i18n from './i18n/index.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ToastKind = 'success' | 'error' | 'warning' | 'info';
export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

export type ModalName =
  | 'pos'
  | 'item'
  | 'stockin'
  | 'report'
  | 'shift'
  | 'users'
  | 'settings';

export interface ModalToken {
  name: ModalName;
  payload?: unknown;
}

export interface ConfirmOptions {
  title: string;
  body?: string;
  okLabel?: string;
  variant?: 'danger' | 'primary' | 'warning';
  onOk: () => void | Promise<void>;
}

const SESSION_KEY = 'pancafe_session_v2';

interface StoreValue {
  ready: boolean;
  serverError: string | null;
  retry: () => void;

  user: User | null;
  login: (p: LoginPayload) => Promise<User>;
  logout: () => void;
  locked: boolean;
  lockScreen: () => void;
  unlockScreen: (password: string) => Promise<boolean>;
  switchUser: () => void; // alias of logout (opens login picker)

  settings: Settings;
  saveSettings: (patch: Partial<Settings>) => Promise<void>;

  isAdmin: boolean;
  lang: string;

  modals: ModalToken[];
  openModal: (name: ModalName, payload?: unknown) => void;
  closeModal: (name: ModalName) => void;
  closeAllModals: () => void;
  isOpen: (name: ModalName) => boolean;
  getModalPayload: (name: ModalName) => unknown;

  toasts: Toast[];
  toast: (message: string, kind?: ToastKind) => void;
  sfx: (kind: 'click' | 'cash' | 'success' | 'error') => void;
  confirm: (opts: ConfirmOptions) => void;
  confirmState: ConfirmOptions | null;
  dismissConfirm: () => void;

  printHtml: string | null;
  requestPrint: (html: string) => void;
  clearPrint: () => void;

  refreshTick: number;
  bump: () => void;
}

const StoreCtx = createContext<StoreValue | null>(null);

const DEFAULT_SETTINGS_LIKE: Settings = {
  storeName: 'PanCafe',
  currency: 'ج.م',
  soundEnabled: true,
  autoPrint: false,
  receiptFooter: ''
};

function readSession(): User | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

let toastSeq = 0;

export function AppStoreProvider({ children }: { children: ReactNode }): JSX.Element {
  const [ready, setReady] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(() => readSession());
  const [locked, setLocked] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS_LIKE);
  const [modals, setModals] = useState<ModalToken[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmOptions | null>(null);
  const [printHtml, setPrintHtml] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [langTick, setLangTick] = useState(0);
  const soundRef = useRef(true);

  // Re-render locale-aware components when the interface language changes.
  useEffect(() => {
    const cb = (): void => setLangTick((n) => n + 1);
    i18n.on('languageChanged', cb);
    return () => {
      i18n.off('languageChanged', cb);
    };
  }, []);

  // -------------------------------------------------------------------------
  // Bootstrap
  // -------------------------------------------------------------------------

  const boot = useCallback(async () => {
    setServerError(null);
    try {
      const [health, s] = await Promise.all([
        Endpoints.health(),
        Endpoints.settings.get().catch(() => null)
      ]);
      if (!health || health.status !== 'ok') {
        throw new Error('bad health');
      }
      const sess = readSession();
      setUser(sess);
      setApiActor(sess ? sess.id : null);
      if (s) {
        setSettings(s.settings);
        soundRef.current = s.settings.soundEnabled;
      }
      setReady(true);
    } catch {
      setServerError('Cannot reach the API — is the server running?');
    }
  }, []);

  useEffect(() => {
    void boot();
  }, [boot]);

  const retry = useCallback(() => {
    setReady(false);
    void boot();
  }, [boot]);

  // -------------------------------------------------------------------------
  // Session
  // -------------------------------------------------------------------------

  const applyUser = useCallback((u: User | null) => {
    setUser(u);
    setApiActor(u ? u.id : null);
    try {
      if (u) localStorage.setItem(SESSION_KEY, JSON.stringify(u));
      else localStorage.removeItem(SESSION_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const login = useCallback(
    async (p: LoginPayload): Promise<User> => {
      const { user: u } = await Endpoints.login(p);
      applyUser(u);
      setLocked(false);
      return u;
    },
    [applyUser]
  );

  const logout = useCallback(() => {
    applyUser(null);
    setLocked(false);
  }, [applyUser]);

  const lockScreen = useCallback(() => {
    if (user) setLocked(true);
  }, [user]);

  const unlockScreen = useCallback(
    async (password: string): Promise<boolean> => {
      if (!user) return false;
      try {
        await Endpoints.login({ username: user.username, password });
        setLocked(false);
        return true;
      } catch {
        return false;
      }
    },
    [user]
  );

  const saveSettings = useCallback(async (patch: Partial<Settings>) => {
    const res = await Endpoints.settings.save(patch);
    setSettings(res.settings);
    soundRef.current = res.settings.soundEnabled;
  }, []);

  // -------------------------------------------------------------------------
  // Toasts & sounds
  // -------------------------------------------------------------------------

  const dismissToast = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((message: string, kind: ToastKind = 'info') => {
    const id = ++toastSeq;
    setToasts((list) => [...list, { id, kind, message }]);
    window.setTimeout(() => dismissToast(id), 3600);
    if (soundRef.current) {
      playSound(kind === 'success' ? 'success' : kind === 'error' ? 'error' : 'click');
    }
  }, [dismissToast]);

  const sfx = useCallback((kind: 'click' | 'cash' | 'success' | 'error') => {
    if (soundRef.current) playSound(kind);
  }, []);

  // -------------------------------------------------------------------------
  // Modals
  // -------------------------------------------------------------------------

  const openModal = useCallback((name: ModalName, payload?: unknown) => {
    setModals((list) => [...list.filter((m) => m.name !== name), { name, payload }]);
  }, []);

  const closeModal = useCallback((name: ModalName) => {
    setModals((list) => list.filter((m) => m.name !== name));
  }, []);

  const closeAllModals = useCallback(() => setModals([]), []);

  const isOpen = useCallback((name: ModalName) => modals.some((m) => m.name === name), [modals]);

  const getModalPayload = useCallback(
    (name: ModalName) => modals.find((m) => m.name === name)?.payload,
    [modals]
  );

  // -------------------------------------------------------------------------
  // Confirm dialog
  // -------------------------------------------------------------------------

  const confirm = useCallback((opts: ConfirmOptions) => setConfirmState(opts), []);
  const dismissConfirm = useCallback(() => setConfirmState(null), []);

  // -------------------------------------------------------------------------
  // Print channel (receipts + shift closure reports)
  // -------------------------------------------------------------------------

  const requestPrint = useCallback((html: string) => setPrintHtml(html), []);
  const clearPrint = useCallback(() => setPrintHtml(null), []);

  // -------------------------------------------------------------------------
  // Refresh tick
  // -------------------------------------------------------------------------

  const bump = useCallback(() => setRefreshTick((n) => n + 1), []);

  const value = useMemo<StoreValue>(
    () => ({
      ready,
      serverError,
      retry,

      user,
      login,
      logout,
      locked,
      lockScreen,
      unlockScreen,
      switchUser: logout,

      settings,
      saveSettings,
      isAdmin: !!user && user.role === 'admin',
      lang: i18n.language || 'ar',

      modals,
      openModal,
      closeModal,
      closeAllModals,
      isOpen,
      getModalPayload,

      toasts,
      toast,
      sfx,
      confirm,
      confirmState,
      dismissConfirm,

      printHtml,
      requestPrint,
      clearPrint,

      refreshTick,
      bump
    }),
    [
      ready,
      serverError,
      retry,
      user,
      login,
      logout,
      locked,
      lockScreen,
      unlockScreen,
      settings,
      saveSettings,
      modals,
      openModal,
      closeModal,
      closeAllModals,
      isOpen,
      getModalPayload,
      toasts,
      toast,
      sfx,
      confirm,
      confirmState,
      dismissConfirm,      printHtml,
      requestPrint,
      clearPrint,

      refreshTick,
      bump,
      langTick
    ]
  );

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error('useStore must be used within AppStoreProvider');
  return ctx;
}

export type { StoreValue };
