import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search, Users, Pencil, KeyRound, Power, Trash2 } from 'lucide-react';
import api from '../../services/api';
import { useApi } from '../../hooks/useApi';
import { useDebounce } from '../../hooks/useDebounce';
import { invalidateLookups } from '../../hooks/useLookups';
import { useToast } from '../../context/ToastContext';
import PageHeader from '../../components/PageHeader';
import Modal from '../../components/Modal';
import FormField from '../../components/FormField';
import LoadingButton from '../../components/LoadingButton';
import ErrorAlert from '../../components/ErrorAlert';
import EmptyState from '../../components/EmptyState';
import ConfirmModal from '../../components/ConfirmModal';
import DeleteConfirmModal from '../../components/DeleteConfirmModal';
import Money from '../../components/Money';
import { StatusBadge } from '../../components/Badges';
import { TableSkeleton } from '../../components/Skeleton';
import { formatDateTime } from '../../utils/format';

export function RiderFormModal({ show, rider, onClose, onSaved }) {
  const isEdit = Boolean(rider);
  const bikes = useApi(show ? '/bikes' : null);
  const [f, setF] = useState({});
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [lastShow, setLastShow] = useState(false);
  if (show !== lastShow) {
    setLastShow(show);
    if (show) {
      setF(rider ? { name: rider.name, email: rider.email || '', phone: rider.phone || '', username: rider.login?.username || '', notes: rider.notes || '' } : { name: '', email: '', phone: '', username: '', password: '', bike: '', notes: '' });
      setErrors({});
    }
  }

  const submit = async () => {
    const e = {};
    if ((f.name || '').trim().length < 2) e.name = 'Enter the rider\'s full name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email || '')) e.email = 'Enter a valid email.';
    if (!/^\+?\d{7,15}$/.test((f.phone || '').replace(/[\s\-().]/g, ''))) e.phone = 'Enter a valid phone number.';
    if (!isEdit && ((f.password || '').length < 8 || !/[A-Za-z]/.test(f.password) || !/\d/.test(f.password))) e.password = 'At least 8 characters with letters and numbers.';
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const body = { name: f.name, email: f.email, phone: f.phone, notes: f.notes };
      if (f.username) body.username = f.username;
      if (!isEdit) { body.password = f.password; if (f.bike) body.bike = f.bike; }
      const res = isEdit ? await api.patch(`/riders/${rider._id}`, body) : await api.post('/riders', body);
      invalidateLookups();
      onSaved(res.data.rider, isEdit);
    } catch (err) {
      setErrors({ ...(err.fieldErrors || {}), _: err.message });
    } finally {
      setBusy(false);
    }
  };

  const freeBikes = (bikes.data?.items || []).filter((b) => !b.assignedRider && b.status === 'Active');
  const inv = (k) => (errors[k] ? 'is-invalid' : '');
  return (
    <Modal show={show} title={isEdit ? `Edit ${rider.name}` : 'Add rider'} onClose={onClose}
      footer={<><button type="button" className="btn btn-light" onClick={onClose}>Cancel</button><LoadingButton loading={busy} onClick={submit}>{isEdit ? 'Save' : 'Create rider'}</LoadingButton></>}>
      {errors._ && <div className="alert alert-danger py-2 small">{errors._}</div>}
      <FormField label="Full name" required error={errors.name}><input className={`form-control ${inv('name')}`} value={f.name || ''} onChange={(e) => setF({ ...f, name: e.target.value })} /></FormField>
      <div className="row g-2">
        <div className="col-sm-6"><FormField label="Email (login)" required error={errors.email}><input type="email" className={`form-control ${inv('email')}`} value={f.email || ''} onChange={(e) => setF({ ...f, email: e.target.value })} /></FormField></div>
        <div className="col-sm-6"><FormField label="Phone" required error={errors.phone}><input type="tel" className={`form-control ${inv('phone')}`} value={f.phone || ''} onChange={(e) => setF({ ...f, phone: e.target.value })} /></FormField></div>
      </div>
      <FormField label="Username" hint="Optional short login name, e.g. jflomo" error={errors.username}><input className={`form-control ${inv('username')}`} value={f.username || ''} onChange={(e) => setF({ ...f, username: e.target.value.toLowerCase() })} autoCapitalize="none" /></FormField>
      {!isEdit && (
        <>
          <FormField label="Initial password" required error={errors.password} hint="Share it with the rider; they can change it in Profile."><input type="text" className={`form-control ${inv('password')}`} value={f.password || ''} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="new-password" /></FormField>
          <FormField label="Assign bike" hint={freeBikes.length ? 'Only active, unassigned bikes are listed' : 'No free bikes — add one under Bikes'}>
            <select className="form-select" value={f.bike || ''} onChange={(e) => setF({ ...f, bike: e.target.value })}>
              <option value="">No bike</option>
              {freeBikes.map((b) => <option key={b._id} value={b._id}>{b.bikeId} {b.registrationNumber ? `· ${b.registrationNumber}` : ''}</option>)}
            </select>
          </FormField>
        </>
      )}
      <FormField label="Notes" className="mb-0"><textarea className="form-control" rows={2} value={f.notes || ''} onChange={(e) => setF({ ...f, notes: e.target.value })} maxLength={500} /></FormField>
    </Modal>
  );
}

export function ResetPasswordModal({ rider, onClose }) {
  const toast = useToast();
  const [pw, setPw] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (pw.length < 8 || !/[A-Za-z]/.test(pw) || !/\d/.test(pw)) { setErr('At least 8 characters with letters and numbers.'); return; }
    setBusy(true);
    try {
      const res = await api.post(`/riders/${rider._id}/reset-password`, { password: pw });
      toast.success(res.data.message);
      setPw('');
      onClose();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal show={Boolean(rider)} title={`Reset password · ${rider?.name || ''}`} onClose={() => { setPw(''); setErr(null); onClose(); }} fullscreenMobile={false}
      footer={<LoadingButton loading={busy} onClick={submit}>Reset password</LoadingButton>}>
      <FormField label="New password" error={err} hint="The rider will be signed out of all devices."><input className={`form-control ${err ? 'is-invalid' : ''}`} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" /></FormField>
    </Modal>
  );
}

export default function Riders() {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const q = useDebounce(search);
  const { data, loading, error, reload } = useApi('/riders', { search: q || undefined, status: status || undefined });
  const [modal, setModal] = useState(null); // {rider?}
  const [resetFor, setResetFor] = useState(null);
  const [toggle, setToggle] = useState(null);
  const [del, setDel] = useState(null); // { rider, footprint? }

  // First try a plain delete; if the rider has records the server answers 409 with counts → ask again with typed confirmation
  const doDelete = async (reason) => {
    const { rider, footprint } = del;
    try {
      await api.delete(`/riders/${rider._id}${footprint ? '?cascade=true' : ''}`, { data: { reason } });
    } catch (e) {
      if (e.status === 409 && e.raw?.details?.requiresCascade && !footprint) { setDel({ rider, footprint: e.raw.details.footprint }); return; }
      throw e;
    }
    invalidateLookups();
    toast.success(`${rider.name} deleted.`);
    setDel(null);
    reload();
  };

  const doToggle = async () => {
    const next = toggle.status === 'active' ? 'inactive' : 'active';
    await api.patch(`/riders/${toggle._id}`, { status: next });
    invalidateLookups();
    toast.success(`${toggle.name} ${next === 'active' ? 'activated' : 'deactivated'}.`);
    setToggle(null);
    reload();
  };

  return (
    <div>
      <PageHeader title="Riders" subtitle="Manage rider accounts, bikes and access" actions={<button type="button" className="btn btn-primary d-flex align-items-center gap-1" onClick={() => setModal({})}><Plus size={16} /> Add rider</button>} />
      <div className="card mb-3"><div className="card-body p-2 p-md-3 row g-2">
        <div className="col-md-6 position-relative"><Search size={16} className="rl-input-icon" style={{ left: 20 }} /><input type="search" className="form-control ps-5" placeholder="Search name, ID, phone, email" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <div className="col-md-3"><select className="form-select" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select></div>
      </div></div>
      <ErrorAlert error={error} onRetry={reload} />
      <div className="card">
        {loading && !data && <TableSkeleton cols={6} />}
        {data?.items.length === 0 && <EmptyState icon={Users} title="No riders found." action={<button type="button" className="btn btn-primary" onClick={() => setModal({})}>Add rider</button>} />}
        {data?.items.length > 0 && (
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0 rl-table">
              <thead><tr><th>Rider</th><th>Contact</th><th>Bike</th><th className="text-end">Today</th><th className="text-end">Cash due today</th><th>Status</th><th>Last login</th><th /></tr></thead>
              <tbody>
                {data.items.map((r) => (
                  <tr key={r._id}>
                    <td><Link to={`/admin/riders/${r._id}`} className="fw-semibold">{r.name}</Link><div className="small text-secondary font-monospace">{r.riderId}</div></td>
                    <td className="small">{r.phone}<div className="text-secondary">{r.email}</div></td>
                    <td>{r.bike ? <span className="badge rl-badge rl-badge-outline-primary">{r.bike.bikeId}</span> : <span className="text-secondary small">None</span>}</td>
                    <td className="text-end">{r.today?.deliveries || 0}</td>
                    <td className="text-end"><Money cents={r.today?.expectedHandover || 0} /></td>
                    <td><StatusBadge status={r.status} /></td>
                    <td className="small text-secondary">{r.login?.lastLoginAt ? formatDateTime(r.login.lastLoginAt) : 'Never'}</td>
                    <td className="text-end text-nowrap">
                      <button type="button" className="btn btn-sm btn-light" title="Edit" onClick={() => setModal({ rider: r })}><Pencil size={15} /></button>{' '}
                      <button type="button" className="btn btn-sm btn-light" title="Reset password" onClick={() => setResetFor(r)}><KeyRound size={15} /></button>{' '}
                      <button type="button" className={`btn btn-sm ${r.status === 'active' ? 'btn-outline-warning' : 'btn-outline-success'}`} title={r.status === 'active' ? 'Deactivate' : 'Activate'} onClick={() => setToggle(r)}><Power size={15} /></button>{' '}
                      <button type="button" className="btn btn-sm btn-outline-danger" title="Delete rider" onClick={() => setDel({ rider: r })}><Trash2 size={15} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <RiderFormModal show={Boolean(modal)} rider={modal?.rider} onClose={() => setModal(null)} onSaved={(r, edit) => { setModal(null); toast.success(edit ? 'Rider updated.' : `Rider ${r.riderId} created.`); reload(); }} />
      <ResetPasswordModal rider={resetFor} onClose={() => setResetFor(null)} />
      <ConfirmModal show={Boolean(toggle)} title={toggle?.status === 'active' ? 'Deactivate rider?' : 'Activate rider?'} tone={toggle?.status === 'active' ? 'danger' : 'success'}
        message={toggle?.status === 'active' ? `${toggle?.name} will be signed out and cannot log in. Their bike is unassigned. All historical records are kept.` : `${toggle?.name} will be able to log in again.`}
        confirmLabel={toggle?.status === 'active' ? 'Deactivate' : 'Activate'} onConfirm={doToggle} onClose={() => setToggle(null)} />
      <DeleteConfirmModal
        key={del?.footprint ? 'cascade' : 'simple'}
        show={Boolean(del)}
        title={del?.footprint ? `Delete ${del?.rider.name} and ALL their records?` : `Delete ${del?.rider.name}?`}
        message={del?.footprint
          ? `${del.rider.name} has ${del.footprint.deliveries} deliveries, ${del.footprint.expenses} expenses and ${del.footprint.closeouts} handovers. All of them will be deleted along with the rider's login. Reports will no longer include them.`
          : `${del?.rider.name}'s account and login will be removed. If they have any records you will be asked again.`}
        confirmText={del?.footprint ? del.rider.name : undefined}
        confirmLabel={del?.footprint ? 'Delete rider and records' : 'Delete rider'}
        onConfirm={doDelete}
        onClose={() => setDel(null)} />
    </div>
  );
}
