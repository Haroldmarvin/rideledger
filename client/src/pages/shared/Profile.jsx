import { useState } from 'react';
import { LogOut, KeyRound, BadgeCheck, Phone, Mail, Bike, IdCard, CloudOff } from 'lucide-react';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useSyncQueue } from '../../hooks/useSyncQueue';
import FormField from '../../components/FormField';
import LoadingButton from '../../components/LoadingButton';
import { StatusBadge } from '../../components/Badges';
import { initials, formatDateTime } from '../../utils/format';

export function ChangePasswordCard() {
  const { replaceToken } = useAuth();
  const toast = useToast();
  const [f, setF] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!f.currentPassword) errs.currentPassword = 'Enter your current password.';
    if (f.newPassword.length < 8) errs.newPassword = 'At least 8 characters, with letters and numbers.';
    if (f.newPassword !== f.confirm) errs.confirm = 'Passwords do not match.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const res = await api.post('/auth/change-password', { currentPassword: f.currentPassword, newPassword: f.newPassword });
      replaceToken(res.data.token);
      toast.success('Password changed.');
      setF({ currentPassword: '', newPassword: '', confirm: '' });
    } catch (err) {
      setErrors({ ...(err.fieldErrors || {}), _: err.message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="card mb-3" onSubmit={submit} noValidate>
      <div className="card-header bg-white fw-semibold d-flex align-items-center gap-2"><KeyRound size={16} /> Change password</div>
      <div className="card-body">
        {errors._ && <div className="alert alert-danger py-2 small">{errors._}</div>}
        <FormField label="Current password" error={errors.currentPassword}><input type="password" autoComplete="current-password" className={`form-control ${errors.currentPassword ? 'is-invalid' : ''}`} value={f.currentPassword} onChange={(e) => setF({ ...f, currentPassword: e.target.value })} /></FormField>
        <FormField label="New password" error={errors.newPassword}><input type="password" autoComplete="new-password" className={`form-control ${errors.newPassword ? 'is-invalid' : ''}`} value={f.newPassword} onChange={(e) => setF({ ...f, newPassword: e.target.value })} /></FormField>
        <FormField label="Confirm new password" error={errors.confirm}><input type="password" autoComplete="new-password" className={`form-control ${errors.confirm ? 'is-invalid' : ''}`} value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} /></FormField>
        <LoadingButton type="submit" loading={busy} loadingText="Saving…">Update password</LoadingButton>
      </div>
    </form>
  );
}

export default function Profile() {
  const { user, logout } = useAuth();
  const q = useSyncQueue(user?._id);
  const r = user?.riderProfile;
  const logoutSafely = () => {
    if (q.items.length && !window.confirm(`You have ${q.items.length} delivery(ies) saved on this phone that have not synced. They stay on this phone and sync when you log in again. Log out anyway?`)) return;
    logout('You have been logged out.');
  };
  return (
    <div className="container-narrow">
      <div className="card mb-3">
        <div className="card-body d-flex align-items-center gap-3">
          <span className="rl-avatar rl-avatar-lg">{initials(user?.name)}</span>
          <div>
            <div className="h5 fw-bold mb-0">{user?.name}</div>
            <div className="small text-secondary text-capitalize">{user?.role}{r ? ` · ${r.riderId}` : ''}</div>
          </div>
        </div>
        <ul className="list-group list-group-flush">
          {r && <li className="list-group-item d-flex gap-2 align-items-center"><IdCard size={16} className="text-secondary" /> Rider ID <strong className="ms-auto">{r.riderId}</strong></li>}
          <li className="list-group-item d-flex gap-2 align-items-center"><Mail size={16} className="text-secondary" /> <span className="text-truncate">{user?.email}</span></li>
          {(r?.phone || user?.phone) && <li className="list-group-item d-flex gap-2 align-items-center"><Phone size={16} className="text-secondary" /> {r?.phone || user?.phone}</li>}
          {r && <li className="list-group-item d-flex gap-2 align-items-center"><Bike size={16} className="text-secondary" /> Bike <strong className="ms-auto">{r.bike ? `${r.bike.bikeId} · ${r.bike.registrationNumber || ''}` : 'Not assigned'}</strong></li>}
          <li className="list-group-item d-flex gap-2 align-items-center"><BadgeCheck size={16} className="text-secondary" /> Account <span className="ms-auto"><StatusBadge status={user?.status} /></span></li>
          {user?.lastLoginAt && <li className="list-group-item small text-secondary">Last login {formatDateTime(user.lastLoginAt)}</li>}
        </ul>
      </div>
      {q.items.length > 0 && (
        <div className="alert alert-warning d-flex gap-2 align-items-center"><CloudOff size={18} /><div className="small flex-grow-1">{q.items.length} deliver{q.items.length === 1 ? 'y' : 'ies'} saved on this phone (Pending Sync).</div><button type="button" className="btn btn-sm btn-outline-secondary" onClick={q.sync} disabled={!q.online || q.syncing}>Sync</button></div>
      )}
      <ChangePasswordCard />
      <button type="button" className="btn btn-outline-danger w-100 d-flex align-items-center justify-content-center gap-2 mb-4" onClick={logoutSafely}><LogOut size={18} /> Log out</button>
    </div>
  );
}
