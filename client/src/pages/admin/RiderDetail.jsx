import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, KeyRound, Phone, Mail, Bike, IdCard } from 'lucide-react';
import api from '../../services/api';
import { useApi } from '../../hooks/useApi';
import { invalidateLookups } from '../../hooks/useLookups';
import { useConfig } from '../../context/ConfigContext';
import { useToast } from '../../context/ToastContext';
import StatCard from '../../components/StatCard';
import ErrorAlert from '../../components/ErrorAlert';
import EmptyState from '../../components/EmptyState';
import Money from '../../components/Money';
import { StatusBadge, CloseoutBadge, DifferenceBadge } from '../../components/Badges';
import { CardSkeleton } from '../../components/Skeleton';
import { PRESETS, presetRange, formatDate, formatDateTime, initials } from '../../utils/format';
import { RiderFormModal, ResetPasswordModal } from './Riders';

export default function RiderDetail() {
  const { id } = useParams();
  const { today } = useConfig();
  const toast = useToast();
  const [range, setRange] = useState({ preset: '30d', ...presetRange('30d', today) });
  const profile = useApi(`/riders/${id}`);
  const perf = useApi(`/riders/${id}/performance`, { from: range.from, to: range.to });
  const activity = useApi(`/riders/${id}/activity`, { limit: 30 });
  const bikes = useApi('/bikes');
  const [edit, setEdit] = useState(false);
  const [reset, setReset] = useState(false);
  const [assigning, setAssigning] = useState(false);

  if (profile.loading && !profile.data) return <CardSkeleton rows={6} />;
  if (profile.error) return <ErrorAlert error={profile.error} onRetry={profile.reload} />;
  const { rider, login } = profile.data;
  const s = perf.data?.summary;
  const h = perf.data?.handover;
  const first = perf.loading && !perf.data;

  const assignBike = async (bike) => {
    setAssigning(true);
    try {
      await api.post(`/riders/${id}/assign-bike`, { bike: bike || null });
      invalidateLookups();
      toast.success(bike ? 'Bike assigned.' : 'Bike unassigned.');
      profile.reload();
      bikes.reload();
    } catch (e) { toast.error(e.message); } finally { setAssigning(false); }
  };

  const setPreset = (preset) => setRange(preset === 'custom' ? { ...range, preset } : { preset, ...presetRange(preset, today) });

  return (
    <div>
      <Link to="/admin/riders" className="btn btn-link px-0 mb-2 d-inline-flex align-items-center gap-1"><ArrowLeft size={16} /> Riders</Link>
      <div className="row g-3 mb-3">
        <div className="col-lg-4">
          <div className="card h-100">
            <div className="card-body">
              <div className="d-flex align-items-center gap-3 mb-3">
                <span className="rl-avatar rl-avatar-lg">{initials(rider.name)}</span>
                <div><div className="h5 fw-bold mb-0">{rider.name}</div><StatusBadge status={rider.status} /></div>
              </div>
              <div className="small d-flex flex-column gap-2">
                <div className="d-flex gap-2"><IdCard size={16} className="text-secondary" /> <span className="font-monospace">{rider.riderId}</span></div>
                <div className="d-flex gap-2"><Phone size={16} className="text-secondary" /> {rider.phone}</div>
                <div className="d-flex gap-2"><Mail size={16} className="text-secondary" /> {rider.email}{login?.username ? ` · @${login.username}` : ''}</div>
                <div className="d-flex gap-2 align-items-center"><Bike size={16} className="text-secondary" />
                  <select className="form-select form-select-sm" value={rider.bike?._id || ''} disabled={assigning || rider.status !== 'active'} onChange={(e) => assignBike(e.target.value)} aria-label="Assigned bike">
                    <option value="">No bike</option>
                    {(bikes.data?.items || []).filter((b) => b.status !== 'Inactive' && (!b.assignedRider || b.assignedRider._id === rider._id)).map((b) => <option key={b._id} value={b._id}>{b.bikeId}{b.status === 'Maintenance' ? ' (maintenance)' : ''}</option>)}
                  </select>
                </div>
                <div className="text-secondary">Last login: {login?.lastLoginAt ? formatDateTime(login.lastLoginAt) : 'Never'}</div>
              </div>
              <div className="d-flex gap-2 mt-3">
                <button type="button" className="btn btn-sm btn-outline-primary d-flex align-items-center gap-1" onClick={() => setEdit(true)}><Pencil size={14} /> Edit</button>
                <button type="button" className="btn btn-sm btn-outline-secondary d-flex align-items-center gap-1" onClick={() => setReset(true)}><KeyRound size={14} /> Reset password</button>
              </div>
            </div>
          </div>
        </div>
        <div className="col-lg-8">
          <div className="card h-100">
            <div className="card-body">
              <div className="d-flex flex-wrap gap-2 align-items-center justify-content-between mb-3">
                <div className="fw-semibold">Performance</div>
                <div className="d-flex gap-2">
                  <select className="form-select form-select-sm w-auto" value={range.preset} onChange={(e) => setPreset(e.target.value)} aria-label="Period">{PRESETS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}</select>
                  {range.preset === 'custom' && <>
                    <input type="date" className="form-control form-control-sm w-auto" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} aria-label="From" />
                    <input type="date" className="form-control form-control-sm w-auto" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} aria-label="To" />
                  </>}
                </div>
              </div>
              <ErrorAlert error={perf.error} onRetry={perf.reload} />
              <div className="row g-2">
                {[
                  ['Total deliveries', s?.deliveries], ['Successful', s?.delivered], ['Failed', s?.failed], ['Returned', s?.returned], ['Cancelled', s?.cancelled],
                ].map(([l, v]) => <div className="col-6 col-md" key={l}><StatCard compact label={l} value={v} loading={first} /></div>)}
              </div>
              <div className="row g-2 mt-0">
                {[
                  ['Total fees', s?.totalFees], ['Total collected', s?.totalCollected], ['Cash', s?.cashCollected], ['Mobile Money', s?.mobileMoneyCollected], ['Bank', s?.bankCollected],
                  ['Outstanding', s?.outstanding, 'warning'], ['Approved expenses', s?.approvedExpenses], ['Amount due (confirmed days)', h?.amountDue], ['Amount handed over', h?.amountHandedOver], ['Differences', h?.differences, h?.differences < 0 ? 'danger' : 'primary'],
                ].map(([l, v, tone]) => <div className="col-6 col-md-4 col-xl" key={l}><StatCard compact label={l} cents={v ?? 0} tone={tone} loading={first} /></div>)}
              </div>
              {h && <div className="small text-secondary mt-2">{h.confirmed} confirmed closeouts · {h.shortDays} short · {h.overDays} over · {perf.data.pendingExpenses} pending expenses</div>}
            </div>
          </div>
        </div>
      </div>

      <div className="row g-3 mb-4">
        <div className="col-lg-7">
          <div className="card h-100">
            <div className="card-header bg-white fw-semibold">Daily closeouts</div>
            {perf.data?.closeouts.length === 0 && <EmptyState title="No reconciliation records for this period." />}
            {perf.data?.closeouts.length > 0 && (
              <div className="table-responsive">
                <table className="table table-sm align-middle mb-0 rl-table">
                  <thead><tr><th>Date</th><th className="text-end">Expected</th><th className="text-end">Handed</th><th className="text-end">Difference</th><th>Status</th></tr></thead>
                  <tbody>
                    {perf.data.closeouts.map((c) => (
                      <tr key={c._id}>
                        <td>{formatDate(c.date)}</td>
                        <td className="text-end"><Money cents={c.expectedHandover} /></td>
                        <td className="text-end"><Money cents={c.actualHandover} /></td>
                        <td className="text-end"><Money cents={c.difference} tone={c.difference < 0 ? 'danger' : undefined} /> <DifferenceBadge difference={c.difference} /></td>
                        <td><CloseoutBadge status={c.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
        <div className="col-lg-5">
          <div className="card h-100">
            <div className="card-header bg-white fw-semibold d-flex justify-content-between">Recent activity <Link to={`/admin/deliveries`} className="small fw-normal">Deliveries</Link></div>
            <ul className="list-group list-group-flush small rl-activity">
              {activity.data?.items.length === 0 && <li className="list-group-item text-secondary">No activity yet.</li>}
              {activity.data?.items.map((a) => (
                <li key={a._id} className="list-group-item">
                  <div className="d-flex justify-content-between gap-2"><span>{a.action}</span><span className="text-secondary text-nowrap">{formatDateTime(a.timestamp)}</span></div>
                  <div className="text-secondary">{a.entityRef} · {a.userName}</div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <RiderFormModal show={edit} rider={{ ...rider, login }} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); toast.success('Rider updated.'); profile.reload(); }} />
      <ResetPasswordModal rider={reset ? rider : null} onClose={() => setReset(false)} />
    </div>
  );
}
