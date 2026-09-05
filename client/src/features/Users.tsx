import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { Role, User } from '../../../shared/src/index.ts';
import { Endpoints } from '../api.ts';
import { useStore } from '../store.tsx';
import { dateLabel } from '../utils/format.ts';
import { errText } from './Inventory.tsx';

interface UserDraft {
  fullName: string;
  username: string;
  password: string;
  role: Role;
  phone: string;
  avatar: string;
}

const EMPTY_DRAFT: UserDraft = {
  fullName: '',
  username: '',
  password: '',
  role: 'cashier',
  phone: '',
  avatar: '🧑‍💻'
};

export function UsersModal(): ReactNode {
  const { t } = useTranslation();
  const { isOpen, closeModal, user: me, toast, refreshTick, bump } = useStore();
  const lang = document.documentElement.lang || 'ar';
  const open = isOpen('users');

  const [users, setUsers] = useState<User[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<UserDraft>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pwTarget, setPwTarget] = useState<User | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async (): Promise<void> => {
    try {
      const res = await Endpoints.users.list();
      setUsers(res.users);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    if (open) {
      void load();
      setShowForm(false);
      setPwTarget(null);
    }
  }, [open, refreshTick]);

  if (!open) return null;

  const startEdit = (u: User): void => {
    setEditingId(u.id);
    setDraft({
      fullName: u.fullName,
      username: u.username,
      password: '',
      role: u.role,
      phone: u.phone,
      avatar: u.avatar
    });
    setShowForm(true);
  };

  const saveUser = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!draft.fullName.trim() || !draft.username.trim()) {
      toast(t('users.fillAll'), 'warning');
      return;
    }
    if (!editingId && !draft.password.trim()) {
      toast(t('users.fillAll'), 'warning');
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await Endpoints.users.update(editingId, {
          fullName: draft.fullName.trim(),
          username: draft.username.trim(),
          role: draft.role,
          phone: draft.phone,
          avatar: draft.avatar || '🧑‍💻'
        });
        toast(t('users.updated'), 'success');
      } else {
        await Endpoints.users.create({
          ...draft,
          fullName: draft.fullName.trim(),
          username: draft.username.trim()
        });
        toast(t('users.created', { name: draft.fullName.trim() }), 'success');
      }
      setShowForm(false);
      setEditingId(null);
      setDraft(EMPTY_DRAFT);
      bump();
      void load();
    } catch (err) {
      toast(errText(err, t('errors.internal')), 'error');
    } finally {
      setSaving(false);
    }
  };

  const deleteUser = (u: User): void => {
    if (u.id === me?.id) {
      toast(t('users.cannotDeleteSelf'), 'error');
      return;
    }
    if (window.confirm(t('users.deleteConfirm', { name: u.fullName }))) {
      void Endpoints.users
        .remove(u.id)
        .then(() => {
          toast(t('users.deleted'), 'success');
          void load();
        })
        .catch(() => undefined);
    }
  };

  const submitPassword = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!pwTarget) return;
    const newPw = (document.getElementById('pw-new') as HTMLInputElement)?.value ?? '';
    const confirmPw = (document.getElementById('pw-confirm') as HTMLInputElement)?.value ?? '';
    const adminPw = (document.getElementById('pw-admin') as HTMLInputElement)?.value ?? '';
    if (!newPw) {
      toast(t('users.pwRequired'), 'warning');
      return;
    }
    if (newPw !== confirmPw) {
      toast(t('users.pwMismatch'), 'error');
      return;
    }
    setSaving(true);
    try {
      await Endpoints.users.changePassword(pwTarget.id, newPw, adminPw);
      toast(t('users.pwChanged'), 'success');
      setPwTarget(null);
    } catch (err) {
      toast(errText(err, t('users.adminPwWrong')), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="overlay-layer" onMouseDown={() => closeModal('users')}>
      <div className="modal-panel modal-xl users-panel pop-in" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3><i className="fas fa-users-gear" /> {t('users.title')}</h3>
          <button type="button" className="icon-btn" onClick={() => closeModal('users')}><i className="fas fa-xmark" /></button>
        </div>

        <div className="modal-body">
          {showForm ? (
            <form className="panel-card" onSubmit={(e) => void saveUser(e)}>
              <h5>{editingId ? t('users.editTitle') : t('users.addBtn')}</h5>
              <div className="form-grid">
                <label className="field">
                  <span>{t('users.nameLabel')}</span>
                  <input className="form-control" value={draft.fullName} onChange={(e) => setDraft({ ...draft, fullName: e.target.value })} />
                </label>
                <label className="field">
                  <span>{t('users.usernameLabel')}</span>
                  <input className="form-control" value={draft.username} onChange={(e) => setDraft({ ...draft, username: e.target.value })} placeholder={t('users.usernamePh')} />
                </label>
                <label className="field">
                  <span>{t('users.roleLabel')}</span>
                  <select className="form-select" value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value as Role })}>
                    <option value="admin">{t('role.admin')}</option>
                    <option value="cashier">{t('role.cashier')}</option>
                  </select>
                </label>
                <label className="field">
                  <span>{t('users.phoneLabel')}</span>
                  <input className="form-control" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
                </label>
                <label className="field">
                  <span>{t('users.avatarLabel')}</span>
                  <input className="form-control" value={draft.avatar} onChange={(e) => setDraft({ ...draft, avatar: e.target.value })} />
                </label>
                <label className="field">
                  <span>{t('users.passwordLabel')} {editingId && <em className="text-muted">({t('common.optional')})</em>}</span>
                  <input type="password" className="form-control" value={draft.password} onChange={(e) => setDraft({ ...draft, password: e.target.value })} />
                </label>
              </div>
              <div className="modal-foot px-0">
                <button type="button" className="btn btn-ghost" onClick={() => { setShowForm(false); setEditingId(null); }}>
                  {t('common.cancel')}
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? <i className="fas fa-circle-notch fa-spin" /> : <i className="fas fa-user-plus" />} {t('users.create')}
                </button>
              </div>
            </form>
          ) : (
            <>
              <div className="table-wrap slim">
                <table className="table align-middle">
                  <thead>
                    <tr>
                      <th>{t('users.colName')}</th>
                      <th>{t('users.colUsername')}</th>
                      <th>{t('users.colRole')}</th>
                      <th>{t('users.colPhone')}</th>
                      <th>{t('users.colCreated')}</th>
                      <th className="text-center">{t('users.colActions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id}>
                        <td>
                          <span className="item-name-cell"><span className="avatar-sm">{u.avatar || '👤'}</span> <strong>{u.fullName}</strong></span>
                          {u.id === me?.id && <span className="badge badge-soft-cyan ms-2">{t('users.currentAccount')}</span>}
                        </td>
                        <td><code>@{u.username}</code></td>
                        <td><span className={`role-chip ${u.role}`}>{u.role === 'admin' ? t('role.admin') : t('role.cashier')}</span></td>
                        <td className="text-muted">{u.phone || '—'}</td>
                        <td className="text-muted">{dateLabel(u.createdAt, lang)}</td>
                        <td className="text-center">
                          <div className="icon-actions justify-content-center">
                            <button type="button" className="icon-btn sm" title={t('users.changePw')} onClick={() => setPwTarget(u)}>
                              <i className="fas fa-key" />
                            </button>
                            <button type="button" className="icon-btn sm" title={t('common.edit')} onClick={() => startEdit(u)}>
                              <i className="fas fa-pen" />
                            </button>
                            <button type="button" className="icon-btn sm danger" title={t('common.delete')} onClick={() => deleteUser(u)} disabled={u.id === me?.id}>
                              <i className="fas fa-trash-can" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="modal-foot px-0">
                <button type="button" className="btn btn-primary" onClick={() => { setEditingId(null); setDraft(EMPTY_DRAFT); setShowForm(true); }}>
                  <i className="fas fa-user-plus" /> {t('users.addBtn')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Change password modal */}
      {pwTarget && (
        <div className="overlay-layer overlay-soft pop-in" onMouseDown={() => setPwTarget(null)}>
          <form className="confirm-box" onSubmit={(e) => void submitPassword(e)} onMouseDown={(e) => e.stopPropagation()}>
            <h4><i className="fas fa-key" /> {t('users.changePwFor', { name: pwTarget.fullName })}</h4>
            <div className="form-grid mt-2">
              <label className="field span-2">
                <span>{t('users.newPassword')}</span>
                <input id="pw-new" type="password" className="form-control" />
              </label>
              <label className="field span-2">
                <span>{t('users.confirmPassword')}</span>
                <input id="pw-confirm" type="password" className="form-control" />
              </label>
              <label className="field span-2">
                <span>{t('users.adminPassword')}</span>
                <input id="pw-admin" type="password" className="form-control" />
              </label>
            </div>
            <div className="confirm-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setPwTarget(null)}>{t('common.cancel')}</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? <i className="fas fa-circle-notch fa-spin" /> : <i className="fas fa-floppy-disk" />} {t('common.save')}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
