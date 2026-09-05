import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AppStoreProvider, useStore } from './store.tsx';
import { ConfirmHost, LockOverlay, PrintHost, SignInScreen, ToastsHost } from './components/Overlays.tsx';
import { StatusBar, TitleBar, Toolbar } from './components/Shell.tsx';
import { InventoryPage } from './features/Inventory.tsx';
import { PosModal } from './features/Pos.tsx';
import { ItemModal, StockInModal } from './features/ItemModals.tsx';
import { ReportsModal } from './features/Reports.tsx';
import { ShiftConsole } from './features/Shift.tsx';
import { UsersModal } from './features/Users.tsx';
import { SettingsModal } from './features/SettingsModal.tsx';

export default function App(): ReactNode {
  return (
    <AppStoreProvider>
      <Root />
    </AppStoreProvider>
  );
}

function Root(): ReactNode {
  const { ready, serverError, retry, user } = useStore();
  const { t } = useTranslation();

  if (!ready) {
    return (
      <div className="boot-screen">
        {serverError ? (
          <div className="boot-card">
            <i className="fas fa-plug-circle-xmark" />
            <h3>{serverError}</h3>
            <p>npm run dev</p>
            <button type="button" className="btn btn-primary" onClick={retry}>
              <i className="fas fa-rotate-right" /> {t('auth.loginBtn')}
            </button>
          </div>
        ) : (
          <div className="boot-card">
            <i className="fas fa-circle-notch fa-spin" />
            <p>{t('common.loading')}</p>
          </div>
        )}
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <SignInScreen />
        <ToastsHost />
        <ConfirmHost />
      </>
    );
  }

  return (
    <div className="app-shell">
      <TitleBar />
      <Toolbar />
      <main className="content">
        <InventoryPage />
      </main>
      <StatusBar />

      {/* Feature modals */}
      <PosModal />
      <ItemModal />
      <StockInModal />
      <ReportsModal />
      <ShiftConsole />
      {user.role === 'admin' && <UsersModal />}
      <SettingsModal />

      {/* Global overlays */}
      <LockOverlay />
      <ToastsHost />
      <ConfirmHost />
      <PrintHost />
    </div>
  );
}
