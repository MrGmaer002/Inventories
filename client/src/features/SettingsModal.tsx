import { useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { Settings } from '../../../shared/src/index.ts';
import { Endpoints } from '../api.ts';
import { switchLanguage } from '../i18n/index.ts';
import { useStore } from '../store.tsx';
import { errText } from './Inventory.tsx';

export function SettingsModal(): ReactNode {
  const { t } = useTranslation();
  const { isOpen, closeModal, settings, saveSettings, toast, lang, bump, confirm } = useStore();
  const open = isOpen('settings');

  const [form, setForm] = useState<Settings>(settings);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const set = <K extends keyof Settings>(key: K, value: Settings[K]): void =>
    setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setSaving(true);
    try {
      await saveSettings(form);
      toast(t('settings.saved'), 'success');
      bump();
      closeModal('settings');
    } catch (err) {
      toast(errText(err, t('errors.internal')), 'error');
    } finally {
      setSaving(false);
    }
  };

  const exportBackup = async (): Promise<void> => {
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
    } catch (err) {
      toast(errText(err, t('errors.network')), 'error');
    }
  };

  const onPickFile = (e: ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const obj = JSON.parse(String(reader.result)) as unknown;
        confirm({
          title: t('backup.importConfirmTitle'),
          body: t('backup.importConfirmBody'),
          okLabel: t('backup.importBtn'),
          variant: 'danger',
          onOk: async () => {
            try {
              const res = await Endpoints.backup.importData(obj);
              toast(
                t('backup.imported', {
                  users: res.stats.users,
                  items: res.stats.items,
                  sales: res.stats.sales
                }),
                'success'
              );
              window.setTimeout(() => window.location.reload(), 900);
            } catch (err) {
              toast(errText(err, t('backup.invalid')), 'error');
            }
          }
        });
      } catch {
        toast(t('backup.readError'), 'error');
      } finally {
        setImporting(false);
      }
    };
    reader.onerror = () => {
      toast(t('backup.readError'), 'error');
      setImporting(false);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="overlay-layer" onMouseDown={() => closeModal('settings')}>
      <div className="modal-panel settings-panel pop-in" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3><i className="fas fa-gear" /> {t('settings.title')}</h3>
          <button type="button" className="icon-btn" onClick={() => closeModal('settings')}><i className="fas fa-xmark" /></button>
        </div>

        <form className="modal-body" onSubmit={(e) => void submit(e)}>
          <h5 className="settings-h"><i className="fas fa-store" /> {t('settings.storeName')}</h5>
          <div className="form-grid">
            <label className="field">
              <span>{t('settings.storeName')}</span>
              <input className="form-control" value={form.storeName} onChange={(e) => set('storeName', e.target.value)} />
            </label>
            <label className="field">
              <span>{t('settings.currency')}</span>
              <input className="form-control" value={form.currency} onChange={(e) => set('currency', e.target.value)} />
            </label>
            <label className="field span-2">
              <span>{t('settings.footer')}</span>
              <input className="form-control" value={form.receiptFooter} onChange={(e) => set('receiptFooter', e.target.value)} />
            </label>
          </div>

          <h5 className="settings-h"><i className="fas fa-sliders" /> {t('settings.behavior')}</h5>
          <div className="switch-row">
            <div>
              <strong>{t('settings.sound')}</strong>
            </div>
            <label className="switch">
              <input type="checkbox" checked={form.soundEnabled} onChange={(e) => set('soundEnabled', e.target.checked)} />
              <span className="slider" />
            </label>
          </div>
          <div className="switch-row">
            <div>
              <strong>{t('settings.autoPrint')}</strong>
            </div>
            <label className="switch">
              <input type="checkbox" checked={form.autoPrint} onChange={(e) => set('autoPrint', e.target.checked)} />
              <span className="slider" />
            </label>
          </div>

          <h5 className="settings-h"><i className="fas fa-globe" /> {t('settings.language')}</h5>
          <div className="btn-group">
            <button
              type="button"
              className={`btn ${lang === 'ar' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => switchLanguage('ar')}
            >
              العربية
            </button>
            <button
              type="button"
              className={`btn ${lang === 'en' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => switchLanguage('en')}
            >
              English
            </button>
          </div>

          <h5 className="settings-h"><i className="fas fa-database" /> {t('settings.backupTitle')}</h5>
          <div className="backup-row">
            <button type="button" className="btn btn-secondary" onClick={() => void exportBackup()}>
              <i className="fas fa-download" /> {t('settings.exportBtn')}
            </button>
            <button type="button" className="btn btn-warning" onClick={() => fileRef.current?.click()} disabled={importing}>
              {importing ? <i className="fas fa-circle-notch fa-spin" /> : <i className="fas fa-upload" />} {t('settings.importBtn')}
            </button>
            <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={onPickFile} />
          </div>
          <p className="text-muted small">
            <i className="fas fa-circle-info" /> {t('settings.importHint')}
          </p>
          <p className="text-warning small">
            <i className="fas fa-triangle-exclamation" /> {t('settings.importWarning')}
          </p>

          <div className="modal-foot">
            <button type="button" className="btn btn-ghost" onClick={() => closeModal('settings')}>{t('common.cancel')}</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <i className="fas fa-circle-notch fa-spin" /> : <i className="fas fa-floppy-disk" />} {t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
