import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Lock, FilePenLine, Flag, History, MapPin, Phone, Hash, Bike, User, Trash2 } from 'lucide-react';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useApi } from '../../hooks/useApi';
import Money from '../../components/Money';
import Modal from '../../components/Modal';
import FormField from '../../components/FormField';
import MoneyInput from '../../components/MoneyInput';
import LoadingButton from '../../components/LoadingButton';
import ErrorAlert from '../../components/ErrorAlert';
import DeleteConfirmModal from '../../components/DeleteConfirmModal';
import { StatusBadge, PaymentBadge, CloseoutBadge } from '../../components/Badges';
import { CardSkeleton } from '../../components/Skeleton';
import { formatDate, formatDateTime } from '../../utils/format';
import { toCents, centsToInput, formatMoney } from '../../utils/money';
import { PAYMENT_METHODS, DELIVERY_STATUSES } from '../../utils/constants';

const LABELS = { deliveryFee: 'Fee', amountCollected: 'Collected', outstandingAmount: 'Outstanding', extraCollected: 'Extra collected', paymentMethod: 'Payment', status: 'Status', customerName: 'Customer', customerPhone: 'Phone', pickupLocation: 'Pickup', destination: 'Destination', orderReference: 'Order ref', remarks: 'Remarks', bike: 'Bike', flags: 'Flags', overpaymentAuthorized: 'Overpayment authorized', reason: 'Reason' };
const MONEY_KEYS = new Set(['deliveryFee', 'amountCollected', 'outstandingAmount', 'extraCollected', 'fee', 'amount']);

export function ChangeList({ data }) {
  if (!data || typeof data !== 'object') return null;
  const entries = Object.entries(data).filter(([, v]) => v !== undefined);
  if (!entries.length) return null;
  return (
    <ul className="list-unstyled small mb-0">
      {entries.map(([k, v]) => (
        <li key={k}><span className="text-secondary">{LABELS[k] || k}:</span> {MONEY_KEYS.has(k) && Number.isInteger(v) ? formatMoney(v) : Array.isArray(v) ? v.join(', ') || '—' : v === null || v === '' ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v)}</li>
      ))}
    </ul>
  );
}

function Row({ icon: Icon, label, children }) {
  return (
    <div className="d-flex gap-3 py-2 border-bottom rl-detail-row">
      <Icon size={16} className="text-secondary mt-1 flex-shrink-0" />
      <div className="flex-grow-1"><div className="small text-secondary">{label}</div><div className="fw-medium">{children || '—'}</div></div>
    </div>
  );
}

export default function DeliveryDetail() {
  const { id } = useParams();
  const { isAdmin } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const base = isAdmin ? '/admin/deliveries' : '/rider/deliveries';
  const { data, loading, error, reload } = useApi(`/deliveries/${id}`);
  const [showCorrection, setShowCorrection] = useState(false);
  const [corr, setCorr] = useState(null);
  const [corrErrors, setCorrErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  if (loading && !data) return <div className="container-narrow"><CardSkeleton rows={8} /></div>;
  if (error) return <div className="container-narrow"><ErrorAlert error={error} onRetry={reload} /><Link to={base} className="btn btn-light">Back to deliveries</Link></div>;
  const { delivery: d, flags, lock, permissions, history, corrections } = data;
  const pendingCorrection = corrections.find((c) => c.status === 'Pending');

  const openCorrection = () => {
    setCorr({ deliveryFee: centsToInput(d.deliveryFee), amountCollected: centsToInput(d.amountCollected), paymentMethod: d.paymentMethod, status: d.status, customerName: d.customerName, destination: d.destination, remarks: d.remarks || '', reason: '' });
    setCorrErrors({});
    setShowCorrection(true);
  };

  const submitCorrection = async () => {
    const changes = {};
    const fee = toCents(corr.deliveryFee);
    const col = toCents(corr.amountCollected);
    if (Number.isNaN(fee)) { setCorrErrors({ deliveryFee: 'Enter a valid amount.' }); return; }
    if (Number.isNaN(col)) { setCorrErrors({ amountCollected: 'Enter a valid amount.' }); return; }
    if (fee !== d.deliveryFee) changes.deliveryFee = fee;
    if (col !== d.amountCollected) changes.amountCollected = col;
    for (const k of ['paymentMethod', 'status', 'customerName', 'destination', 'remarks']) if ((corr[k] || '') !== (d[k] || '')) changes[k] = corr[k];
    if (!Object.keys(changes).length) { setCorrErrors({ _: 'Change at least one value.' }); return; }
    if (corr.reason.trim().length < 5) { setCorrErrors({ reason: 'Please explain why this correction is needed.' }); return; }
    setBusy(true);
    try {
      await api.post(`/deliveries/${d._id}/correction-request`, { changes, reason: corr.reason.trim() });
      toast.success('Correction request sent to management.');
      setShowCorrection(false);
      reload();
    } catch (e) {
      setCorrErrors({ ...(e.fieldErrors || {}), _: e.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container-narrow">
      <div className="d-flex align-items-center gap-2 mb-3">
        <button type="button" className="btn btn-light rl-icon-btn" onClick={() => navigate(-1)} aria-label="Back"><ArrowLeft size={20} /></button>
        <div className="flex-grow-1 min-w-0">
          <h1 className="h5 fw-bold mb-0 font-monospace text-truncate">{d.deliveryId}</h1>
          <div className="small text-secondary">{formatDate(d.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })} · {d.time}</div>
        </div>
        <StatusBadge status={d.status} />
      </div>

      {lock.locked && (
        <div className="alert alert-secondary d-flex gap-2 align-items-start small">
          <Lock size={16} className="mt-1" />
          <div className="flex-grow-1">
            <div className="fw-semibold">Closed period <CloseoutBadge status={lock.closeoutStatus} /></div>
            {isAdmin ? 'Edits to this record are corrections: a reason is required and the closeout is recalculated.' : 'This record is locked. If something is wrong, request a correction from management.'}
          </div>
        </div>
      )}
      {flags.length > 0 && (
        <div className="alert alert-warning small py-2">
          {flags.map((f) => <div key={f.code} className="d-flex gap-2"><Flag size={14} className="mt-1" /> {f.message}</div>)}
        </div>
      )}

      <div className="card mb-3">
        <div className="card-body">
          <div className="row text-center g-2">
            <div className="col-4"><div className="small text-secondary">Fee</div><div className="fw-bold fs-5"><Money cents={d.deliveryFee} /></div></div>
            <div className="col-4"><div className="small text-secondary">Collected</div><div className="fw-bold fs-5 text-success"><Money cents={d.amountCollected} /></div></div>
            {d.extraCollected > 0 ? (
              <div className="col-4"><div className="small text-secondary">Extra (order money)</div><div className="fw-bold fs-5 text-info-emphasis"><Money cents={d.extraCollected} /></div></div>
            ) : (
              <div className="col-4"><div className="small text-secondary">Outstanding</div><div className={`fw-bold fs-5 ${d.outstandingAmount > 0 ? 'text-warning-emphasis' : ''}`}><Money cents={d.outstandingAmount} /></div></div>
            )}
          </div>
          <div className="text-center mt-2"><PaymentBadge method={d.paymentMethod} /></div>
        </div>
      </div>

      <div className="card mb-3">
        <div className="card-body py-1">
          <Row icon={User} label="Customer">{d.customerName}</Row>
          <Row icon={Phone} label="Phone"><a href={`tel:${d.customerPhone}`}>{d.customerPhone}</a></Row>
          <Row icon={MapPin} label="Pickup → Destination">{d.pickupLocation} → {d.destination}</Row>
          <Row icon={Hash} label="Order reference">{d.orderReference}</Row>
          <Row icon={Bike} label="Rider · Bike">{d.rider?.name} ({d.rider?.riderId}) · {d.bike?.bikeId || 'No bike'}</Row>
          {d.remarks && <Row icon={FilePenLine} label="Remarks">{d.remarks}</Row>}
        </div>
      </div>

      <div className="d-flex flex-wrap gap-2 mb-4">
        {permissions.canEdit && (
          <Link to={`${base}/${d._id}/edit`} className="btn btn-primary d-flex align-items-center gap-1"><Pencil size={16} /> {lock.locked ? 'Correct record' : 'Edit'}</Link>
        )}
        {!isAdmin && permissions.requiresCorrection && !pendingCorrection && (
          <button type="button" className="btn btn-outline-primary d-flex align-items-center gap-1" onClick={openCorrection}><FilePenLine size={16} /> Request correction</button>
        )}
        {pendingCorrection && <span className="badge rl-badge rl-badge-warning align-self-center">Correction {pendingCorrection.requestId} pending review</span>}
        {isAdmin && (
          <button type="button" className="btn btn-outline-danger d-flex align-items-center gap-1 ms-auto" onClick={() => setShowDelete(true)}><Trash2 size={16} /> Delete</button>
        )}
      </div>

      <DeleteConfirmModal show={showDelete} title={`Delete delivery ${d.deliveryId}?`}
        message={<>{d.customerName} · {d.destination} · fee <Money cents={d.deliveryFee} />, collected <Money cents={d.amountCollected} />.{lock.locked ? ' This day has a handover, so its totals will be recalculated.' : ''}</>}
        confirmLabel="Delete delivery"
        onConfirm={async (reason) => { await api.delete(`/deliveries/${d._id}`, { data: { reason } }); toast.success(`${d.deliveryId} deleted.`); setShowDelete(false); navigate(base, { replace: true }); }}
        onClose={() => setShowDelete(false)} />

      {corrections.length > 0 && (
        <div className="card mb-3">
          <div className="card-header bg-white fw-semibold">Correction requests</div>
          <ul className="list-group list-group-flush">
            {corrections.map((c) => (
              <li key={c._id} className="list-group-item small">
                <div className="d-flex justify-content-between"><span className="font-monospace">{c.requestId}</span><StatusBadge status={c.status} /></div>
                <div className="text-secondary">{c.reason}</div>
                <ChangeList data={c.requestedChanges} />
                {c.reviewNotes && <div className="mt-1"><span className="text-secondary">Management:</span> {c.reviewNotes}</div>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card mb-5">
        <div className="card-header bg-white fw-semibold d-flex align-items-center gap-2"><History size={16} /> History</div>
        <ul className="list-group list-group-flush">
          {history.length === 0 && <li className="list-group-item small text-secondary">No history.</li>}
          {history.map((h) => (
            <li key={h._id} className="list-group-item small">
              <div className="d-flex justify-content-between gap-2"><strong>{h.action}</strong><span className="text-secondary text-nowrap">{formatDateTime(h.timestamp)}</span></div>
              <div className="text-secondary">by {h.userName}</div>
              {h.previousData && Object.keys(h.previousData).length > 0 && (
                <div className="row mt-1"><div className="col-6"><div className="text-secondary">Before</div><ChangeList data={h.previousData} /></div><div className="col-6"><div className="text-secondary">After</div><ChangeList data={h.newData} /></div></div>
              )}
            </li>
          ))}
        </ul>
      </div>

      <Modal show={showCorrection} title="Request a correction" onClose={() => setShowCorrection(false)}
        footer={<><button type="button" className="btn btn-light" onClick={() => setShowCorrection(false)}>Cancel</button><LoadingButton loading={busy} onClick={submitCorrection}>Send request</LoadingButton></>}>
        {corr && (
          <>
            <p className="small text-secondary">This day is closed. Management must approve changes. Edit the values that are wrong:</p>
            {corrErrors._ && <div className="alert alert-danger py-2 small">{corrErrors._}</div>}
            <div className="row g-2">
              <div className="col-6"><FormField label="Fee" error={corrErrors.deliveryFee}><MoneyInput value={corr.deliveryFee} onChange={(v) => setCorr({ ...corr, deliveryFee: v })} invalid={Boolean(corrErrors.deliveryFee)} /></FormField></div>
              <div className="col-6"><FormField label="Collected" error={corrErrors.amountCollected}><MoneyInput value={corr.amountCollected} onChange={(v) => setCorr({ ...corr, amountCollected: v })} invalid={Boolean(corrErrors.amountCollected)} /></FormField></div>
              <div className="col-6"><FormField label="Payment"><select className="form-select" value={corr.paymentMethod} onChange={(e) => setCorr({ ...corr, paymentMethod: e.target.value })}>{PAYMENT_METHODS.map((p) => <option key={p}>{p}</option>)}</select></FormField></div>
              <div className="col-6"><FormField label="Status"><select className="form-select" value={corr.status} onChange={(e) => setCorr({ ...corr, status: e.target.value })}>{DELIVERY_STATUSES.map((p) => <option key={p}>{p}</option>)}</select></FormField></div>
            </div>
            <FormField label="Customer"><input className="form-control" value={corr.customerName} onChange={(e) => setCorr({ ...corr, customerName: e.target.value })} /></FormField>
            <FormField label="Destination"><input className="form-control" value={corr.destination} onChange={(e) => setCorr({ ...corr, destination: e.target.value })} /></FormField>
            <FormField label="Why is this correction needed?" required error={corrErrors.reason}><textarea className={`form-control ${corrErrors.reason ? 'is-invalid' : ''}`} rows={3} value={corr.reason} onChange={(e) => setCorr({ ...corr, reason: e.target.value })} maxLength={500} /></FormField>
          </>
        )}
      </Modal>
    </div>
  );
}
