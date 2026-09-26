import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Bike as BikeIcon, Pencil } from 'lucide-react';
import api from '../../services/api';
import { useApi } from '../../hooks/useApi';
import { invalidateLookups } from '../../hooks/useLookups';
import { useToast } from '../../context/ToastContext';
import PageHeader from '../../components/PageHeader';
import Modal from '../../components/Modal';
import FormField from '../../components/FormField';
import LoadingButton from '../../components/LoadingButton';
import ErrorAlert from '../../components/ErrorAlert';
import EmptyState from '../../components/EmptyState';
import { StatusBadge } from '../../components/Badges';
import { TableSkeleton } from '../../components/Skeleton';
import { BIKE_STATUSES } from '../../utils/constants';
import { formatDate } from '../../utils/format';

function BikeModal({ show, bike, riders, onClose, onSaved }) {
  const [f, setF] = useState({});
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState(false);
  if (show !== last) {
    setLast(show);
    if (show) {
      setF(bike ? { bikeId: bike.bikeId, registrationNumber: bike.registrationNumber || '', status: bike.status, notes: bike.notes || '', assignedRider: bike.assignedRider?._id || '' } : { bikeId: '', registrationNumber: '', status: 'Active', notes: '', assignedRider: '' });
      setErrors({});
    }
  }
  const submit = async () => {
    if (!/^[A-Za-z0-9-]{2,30}$/.test(f.bikeId || '')) { setErrors({ bikeId: 'Use letters, numbers and dashes, e.g. BK-006.' }); return; }
    setBusy(true);
    try {
      const body = { ...f, assignedRider: f.assignedRider || null };
      const res = bike ? await api.patch(`/bikes/${bike._id}`, body) : await api.post('/bikes', body);
      invalidateLookups();
      onSaved(res.data.bike, Boolean(bike));
    } catch (e) {
      setErrors({ ...(e.fieldErrors || {}), _: e.message });
    } finally { setBusy(false); }
  };
  return (
    <Modal show={show} title={bike ? `Edit ${bike.bikeId}` : 'Add bike'} onClose={onClose}
      footer={<><button type="button" className="btn btn-light" onClick={onClose}>Cancel</button><LoadingButton loading={busy} onClick={submit}>{bike ? 'Save' : 'Add bike'}</LoadingButton></>}>
      {errors._ && <div className="alert alert-danger py-2 small">{errors._}</div>}
      <div className="row g-2">
        <div className="col-6"><FormField label="Bike ID / number" required error={errors.bikeId}><input className={`form-control ${errors.bikeId ? 'is-invalid' : ''}`} value={f.bikeId || ''} onChange={(e) => setF({ ...f, bikeId: e.target.value.toUpperCase() })} placeholder="BK-006" /></FormField></div>
        <div className="col-6"><FormField label="Registration number"><input className="form-control" value={f.registrationNumber || ''} onChange={(e) => setF({ ...f, registrationNumber: e.target.value.toUpperCase() })} /></FormField></div>
      </div>
      <FormField label="Status">
        <div className="rl-chips">{BIKE_STATUSES.map((s) => <button type="button" key={s} className={`rl-chip ${f.status === s ? 'active' : ''}`} onClick={() => setF({ ...f, status: s })}>{s}</button>)}</div>
      </FormField>
      <FormField label="Assigned rider" hint={f.status === 'Inactive' ? 'Inactive bikes are automatically unassigned.' : 'Assigning moves the rider off any other bike.'}>
        <select className="form-select" value={f.assignedRider || ''} disabled={f.status === 'Inactive'} onChange={(e) => setF({ ...f, assignedRider: e.target.value })}>
          <option value="">Unassigned</option>
          {riders.filter((r) => r.status === 'active').map((r) => <option key={r._id} value={r._id}>{r.name}{r.bike && r.bike._id !== bike?._id ? ` (has ${r.bike.bikeId})` : ''}</option>)}
        </select>
      </FormField>
      <FormField label="Notes" className="mb-0"><textarea className="form-control" rows={2} value={f.notes || ''} onChange={(e) => setF({ ...f, notes: e.target.value })} maxLength={500} /></FormField>
    </Modal>
  );
}

export default function Bikes() {
  const toast = useToast();
  const [status, setStatus] = useState('');
  const { data, loading, error, reload } = useApi('/bikes', { status: status || undefined });
  const riders = useApi('/riders');
  const [modal, setModal] = useState(null);
  return (
    <div>
      <PageHeader title="Bikes" subtitle="Fleet list and rider assignment" actions={<button type="button" className="btn btn-primary d-flex align-items-center gap-1" onClick={() => setModal({})}><Plus size={16} /> Add bike</button>} />
      <div className="rl-chips mb-3">{['', ...BIKE_STATUSES].map((s) => <button type="button" key={s || 'all'} className={`rl-chip rl-chip-sm ${status === s ? 'active' : ''}`} onClick={() => setStatus(s)}>{s || 'All'}</button>)}</div>
      <ErrorAlert error={error} onRetry={reload} />
      <div className="card">
        {loading && !data && <TableSkeleton cols={5} />}
        {data?.items.length === 0 && <EmptyState icon={BikeIcon} title="No bikes found." action={<button type="button" className="btn btn-primary" onClick={() => setModal({})}>Add bike</button>} />}
        {data?.items.length > 0 && (
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0 rl-table">
              <thead><tr><th>Bike</th><th>Registration</th><th>Assigned rider</th><th>Status</th><th className="text-end">Deliveries</th><th>Last used</th><th>Notes</th><th /></tr></thead>
              <tbody>
                {data.items.map((b) => (
                  <tr key={b._id}>
                    <td className="fw-semibold font-monospace">{b.bikeId}</td>
                    <td>{b.registrationNumber || '—'}</td>
                    <td>{b.assignedRider ? <Link to={`/admin/riders/${b.assignedRider._id}`}>{b.assignedRider.name}</Link> : <span className="text-secondary">Unassigned</span>}</td>
                    <td><StatusBadge status={b.status} /></td>
                    <td className="text-end">{b.deliveries}</td>
                    <td className="small">{b.lastUsed ? formatDate(b.lastUsed) : '—'}</td>
                    <td className="small text-secondary text-truncate" style={{ maxWidth: 220 }}>{b.notes}</td>
                    <td className="text-end"><button type="button" className="btn btn-sm btn-light" onClick={() => setModal({ bike: b })} title="Edit"><Pencil size={15} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <BikeModal show={Boolean(modal)} bike={modal?.bike} riders={riders.data?.items || []} onClose={() => setModal(null)}
        onSaved={(b, edit) => { setModal(null); toast.success(edit ? `${b.bikeId} updated.` : `${b.bikeId} added.`); reload(); riders.reload(); }} />
    </div>
  );
}
