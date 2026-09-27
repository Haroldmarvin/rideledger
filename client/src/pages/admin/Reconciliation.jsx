import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Undo2, Scale, FilePenLine, Check, X, Trash2 } from 'lucide-react';
import api from '../../services/api';
import { useApi } from '../../hooks/useApi';
import { useLookups } from '../../hooks/useLookups';
import { useToast } from '../../context/ToastContext';
import { useConfig } from '../../context/ConfigContext';
import PageHeader from '../../components/PageHeader';
import ErrorAlert from '../../components/ErrorAlert';
import EmptyState from '../../components/EmptyState';
import Pagination from '../../components/Pagination';
import Modal from '../../components/Modal';
import ConfirmModal from '../../components/ConfirmModal';
import DeleteConfirmModal from '../../components/DeleteConfirmModal';
import FormField from '../../components/FormField';
import MoneyInput from '../../components/MoneyInput';
import LoadingButton from '../../components/LoadingButton';
import Money from '../../components/Money';
import { CloseoutBadge, DifferenceBadge, StatusBadge } from '../../components/Badges';
import { TableSkeleton } from '../../components/Skeleton';
import { toCents, centsToInput } from '../../utils/money';
import { formatDate, formatDateTime } from '../../utils/format';
import { ChangeList } from '../shared/DeliveryDetail';

function ConfirmCloseoutModal({ closeout, onClose, onDone }) {
  const { money } = useConfig();
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const preview = useApi(closeout ? '/closeouts/preview' : null, closeout ? { rider: closeout.rider._id, date: closeout.date } : undefined);
  useEffect(() => { if (closeout) { setAmount(centsToInput(closeout.declaredHandover)); setNotes(''); setError(null); } }, [closeout]);
  if (!closeout) return null;
  const live = preview.data;
  const expected = live ? live.expectedHandover : closeout.expectedHandover;
  const received = toCents(amount);
  const diff = Number.isNaN(received) ? null : received - expected;
  const submit = async () => {
    if (Number.isNaN(received)) { setError('Enter the amount received.'); return; }
    setBusy(true);
    setError(null);
    try {
      await api.post(`/closeouts/${closeout._id}/confirm`, { amountReceived: received, notes });
      onDone(closeout);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal show title={`Confirm handover · ${closeout.rider?.name}`} onClose={onClose}
      footer={<><button type="button" className="btn btn-light" onClick={onClose}>Cancel</button><LoadingButton loading={busy} loadingText="Confirming…" className="btn btn-success" onClick={submit} disabled={live?.pendingExpenses > 0}>Confirm receipt & close day</LoadingButton></>}>
      <div className="small text-secondary mb-2">{formatDate(closeout.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · {closeout.closeoutId}</div>
      {error && <div className="alert alert-danger py-2 small">{error}</div>}
      {live?.pendingExpenses > 0 && <div className="alert alert-warning small">This rider has {live.pendingExpenses} pending expense(s) for this day. <Link to="/admin/expenses">Review them</Link> before confirming.</div>}
      <table className="table table-sm mb-3">
        <tbody>
          <tr><td className="text-secondary">Cash collected</td><td className="text-end"><Money cents={live?.summary.cashCollected ?? closeout.cashCollected} /></td></tr>
          <tr><td className="text-secondary">Approved expenses</td><td className="text-end">− <Money cents={live?.summary.approvedExpenses ?? closeout.approvedExpenses} /></td></tr>
          <tr className="fw-bold"><td>Expected handover (recalculated now)</td><td className="text-end"><Money cents={expected} /></td></tr>
          <tr><td className="text-secondary">Rider declared</td><td className="text-end"><Money cents={closeout.declaredHandover} /></td></tr>
        </tbody>
      </table>
      <FormField label="Amount actually received" required hint="Count the cash. Defaults to what the rider declared.">
        <MoneyInput size="lg" value={amount} onChange={setAmount} />
      </FormField>
      {diff !== null && (
        <div className={`rl-diff mb-3 ${diff === 0 ? 'rl-diff-exact' : diff < 0 ? 'rl-diff-short' : 'rl-diff-over'}`}>
          {diff === 0 ? 'Exact match' : diff < 0 ? `Short by ${money(-diff)}` : `Over by ${money(diff)}`}
        </div>
      )}
      <FormField label="Notes" className="mb-0"><textarea className="form-control" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} /></FormField>
      <div className="small text-secondary mt-2">You will be recorded as the receiving officer. The rider&apos;s records for this day will be closed.</div>
    </Modal>
  );
}

function Closeouts() {
  const toast = useToast();
  const { riders } = useLookups({ bikes: false });
  const [f, setF] = useState({ status: 'Submitted', rider: '', from: '', to: '' });
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useApi('/closeouts', { status: f.status || undefined, rider: f.rider || undefined, from: f.from || undefined, to: f.to || undefined, page, limit: 30 });
  const [confirm, setConfirm] = useState(null);
  const [ret, setRet] = useState(null);
  const [delCo, setDelCo] = useState(null);
  const set = (p) => { setF({ ...f, ...p }); setPage(1); };

  return (
    <>
      <div className="card mb-3"><div className="card-body p-2 p-md-3 row g-2">
        <div className="col-6 col-md-3"><select className="form-select" value={f.status} onChange={(e) => set({ status: e.target.value })} aria-label="Status"><option value="">All statuses</option><option value="Submitted">Awaiting confirmation</option><option value="Confirmed">Confirmed</option><option value="Returned">Returned</option></select></div>
        <div className="col-6 col-md-3"><select className="form-select" value={f.rider} onChange={(e) => set({ rider: e.target.value })} aria-label="Rider"><option value="">All riders</option>{riders.map((r) => <option key={r._id} value={r._id}>{r.name}</option>)}</select></div>
        <div className="col-6 col-md-3"><input type="date" className="form-control" value={f.from} onChange={(e) => set({ from: e.target.value })} aria-label="From" /></div>
        <div className="col-6 col-md-3"><input type="date" className="form-control" value={f.to} onChange={(e) => set({ to: e.target.value })} aria-label="To" /></div>
      </div></div>
      <ErrorAlert error={error} onRetry={reload} />
      <div className="card">
        {loading && !data && <TableSkeleton cols={8} />}
        {data?.items.length === 0 && <EmptyState icon={Scale} title={f.status === 'Submitted' ? 'No handovers waiting for confirmation.' : 'No reconciliation records for this period.'} />}
        {data?.items.length > 0 && (
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0 rl-table">
              <thead><tr><th>Date</th><th>Rider</th><th className="text-end">Cash</th><th className="text-end">Expenses</th><th className="text-end">Expected</th><th className="text-end">Declared</th><th className="text-end">Actual</th><th className="text-end">Difference</th><th>Status</th><th /></tr></thead>
              <tbody>
                {data.items.map((c) => (
                  <tr key={c._id}>
                    <td className="text-nowrap">{formatDate(c.date)}<div className="small text-secondary font-monospace">{c.closeoutId}</div></td>
                    <td><Link to={`/admin/riders/${c.rider?._id}`}>{c.rider?.name}</Link></td>
                    <td className="text-end"><Money cents={c.cashCollected} /></td>
                    <td className="text-end"><Money cents={c.approvedExpenses} /></td>
                    <td className="text-end fw-semibold"><Money cents={c.expectedHandover} /></td>
                    <td className="text-end"><Money cents={c.declaredHandover} /></td>
                    <td className="text-end">{c.status === 'Confirmed' ? <Money cents={c.actualHandover} /> : <span className="text-secondary">—</span>}</td>
                    <td className="text-end text-nowrap"><Money cents={c.difference} tone={c.difference < 0 ? 'danger' : c.difference > 0 ? 'warning-emphasis' : 'success'} /> <DifferenceBadge difference={c.difference} /></td>
                    <td><CloseoutBadge status={c.status} />{c.receivedBy && <div className="small text-secondary">{c.receivedBy.name} · {formatDateTime(c.receivedAt)}</div>}{c.riderNotes && <div className="small text-secondary text-truncate" style={{ maxWidth: 180 }} title={c.riderNotes}>Rider: {c.riderNotes}</div>}</td>
                    <td className="text-end text-nowrap">
                      {c.status === 'Submitted' && <>
                        <button type="button" className="btn btn-sm btn-success me-1 d-inline-flex align-items-center gap-1" onClick={() => setConfirm(c)}><CheckCircle2 size={15} /> Confirm</button>
                        <button type="button" className="btn btn-sm btn-outline-secondary me-1" onClick={() => setRet(c)} title="Return to rider"><Undo2 size={15} /></button>
                      </>}
                      <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => setDelCo(c)} title="Delete handover"><Trash2 size={15} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {data && <Pagination page={data.page} pages={data.pages} total={data.total} onChange={setPage} />}
      <ConfirmCloseoutModal closeout={confirm} onClose={() => setConfirm(null)} onDone={(c) => { setConfirm(null); toast.success(`Handover confirmed. ${c.rider?.name}'s day is closed.`); reload(); }} />
      <DeleteConfirmModal show={Boolean(delCo)} title={`Delete handover ${delCo?.closeoutId}?`}
        message={delCo && <>{delCo.rider?.name} · {formatDate(delCo.date)} · expected <Money cents={delCo.expectedHandover} />. The handover record is removed and that day is <strong>unlocked</strong> so the rider can edit and submit again. Deliveries and expenses are kept.</>}
        confirmLabel="Delete handover"
        onConfirm={async (reason) => { await api.delete(`/closeouts/${delCo._id}`, { data: { reason } }); toast.success('Handover deleted. The day is unlocked.'); setDelCo(null); reload(); }}
        onClose={() => setDelCo(null)} />
      <ConfirmModal show={Boolean(ret)} title="Return closeout to rider?" message="The day will be unlocked so the rider can fix their records and submit again." reasonLabel="Tell the rider what to fix" reasonRequired confirmLabel="Return to rider"
        onConfirm={async (notes) => { await api.post(`/closeouts/${ret._id}/return`, { notes }); toast.success('Closeout returned to rider.'); setRet(null); reload(); }} onClose={() => setRet(null)} />
    </>
  );
}

function Corrections() {
  const toast = useToast();
  const [status, setStatus] = useState('Pending');
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useApi('/corrections', { status: status || undefined, page, limit: 30 });
  const [action, setAction] = useState(null);
  return (
    <>
      <div className="rl-chips mb-3">{['Pending', 'Approved', 'Rejected', ''].map((s) => <button type="button" key={s || 'all'} className={`rl-chip rl-chip-sm ${status === s ? 'active' : ''}`} onClick={() => { setStatus(s); setPage(1); }}>{s || 'All'}</button>)}</div>
      <ErrorAlert error={error} onRetry={reload} />
      {loading && !data && <div className="card"><TableSkeleton cols={5} /></div>}
      {data?.items.length === 0 && <div className="card"><EmptyState icon={FilePenLine} title={status === 'Pending' ? 'No correction requests waiting.' : 'No correction requests.'} /></div>}
      {data?.items.map((c) => (
        <div key={c._id} className="card mb-2">
          <div className="card-body">
            <div className="d-flex flex-wrap justify-content-between gap-2">
              <div>
                <div className="fw-semibold">{c.entityType} {c.entityType === 'Delivery' ? <Link to={`/admin/deliveries/${c.entityId}`} className="font-monospace">{c.entityRef}</Link> : <span className="font-monospace">{c.entityRef}</span>}</div>
                <div className="small text-secondary">{c.rider?.name} · day {formatDate(c.date)} · requested {formatDateTime(c.createdAt)} · <span className="font-monospace">{c.requestId}</span></div>
              </div>
              <StatusBadge status={c.status} />
            </div>
            <div className="small mt-2"><span className="text-secondary">Reason:</span> {c.reason}</div>
            <div className="row mt-2 small">
              <div className="col-6"><div className="text-secondary fw-semibold">Current</div><ChangeList data={c.currentValues} /></div>
              <div className="col-6"><div className="text-secondary fw-semibold">Requested</div><ChangeList data={c.requestedChanges} /></div>
            </div>
            {c.reviewNotes && <div className="small mt-2"><span className="text-secondary">Review:</span> {c.reviewNotes} — {c.reviewedBy?.name}</div>}
            {c.status === 'Pending' && (
              <div className="d-flex gap-2 mt-3">
                <button type="button" className="btn btn-sm btn-success d-flex align-items-center gap-1" onClick={() => setAction({ type: 'approve', c })}><Check size={15} /> Approve & apply</button>
                <button type="button" className="btn btn-sm btn-outline-danger d-flex align-items-center gap-1" onClick={() => setAction({ type: 'reject', c })}><X size={15} /> Reject</button>
              </div>
            )}
          </div>
        </div>
      ))}
      {data && <Pagination page={data.page} pages={data.pages} total={data.total} onChange={setPage} />}
      <ConfirmModal show={Boolean(action)} title={action?.type === 'approve' ? 'Approve correction?' : 'Reject correction?'} tone={action?.type === 'approve' ? 'success' : 'danger'}
        message={action?.type === 'approve' ? 'The change is applied to the closed record, the closeout is recalculated, and everything is written to the audit log.' : 'The record stays unchanged.'}
        reasonLabel={action?.type === 'approve' ? 'Note (optional)' : 'Reason'} reasonRequired={action?.type === 'reject'} confirmLabel={action?.type === 'approve' ? 'Approve' : 'Reject'}
        onConfirm={async (notes) => { await api.post(`/corrections/${action.c._id}/${action.type}`, { notes }); toast.success(action.type === 'approve' ? 'Correction approved and applied.' : 'Correction rejected.'); setAction(null); reload(); }}
        onClose={() => setAction(null)} />
    </>
  );
}

export default function Reconciliation() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'corrections' ? 'corrections' : 'closeouts';
  return (
    <div>
      <PageHeader title="Reconciliation" subtitle="Confirm cash handovers and review corrections to closed days" />
      <ul className="nav nav-tabs mb-3">
        <li className="nav-item"><button type="button" className={`nav-link ${tab === 'closeouts' ? 'active' : ''}`} onClick={() => setParams({})}>Daily closeouts</button></li>
        <li className="nav-item"><button type="button" className={`nav-link ${tab === 'corrections' ? 'active' : ''}`} onClick={() => setParams({ tab: 'corrections' })}>Correction requests</button></li>
      </ul>
      {tab === 'closeouts' ? <Closeouts /> : <Corrections />}
    </div>
  );
}
