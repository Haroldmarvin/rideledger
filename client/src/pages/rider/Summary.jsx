import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Clock3, Lock, Send, Undo2 } from 'lucide-react';
import api from '../../services/api';
import { useApi } from '../../hooks/useApi';
import { useConfig } from '../../context/ConfigContext';
import { useToast } from '../../context/ToastContext';
import Money from '../../components/Money';
import MoneyInput from '../../components/MoneyInput';
import LoadingButton from '../../components/LoadingButton';
import ErrorAlert from '../../components/ErrorAlert';
import Modal from '../../components/Modal';
import EmptyState from '../../components/EmptyState';
import { CloseoutBadge, DifferenceBadge } from '../../components/Badges';
import { CardSkeleton } from '../../components/Skeleton';
import { toCents } from '../../utils/money';
import { addDays, formatDate, formatDateTime, relativeDay } from '../../utils/format';

function Line({ label, children, strong, tone }) {
  return (
    <div className={`d-flex justify-content-between py-1 ${strong ? 'fw-bold' : ''}`}>
      <span className={strong ? '' : 'text-secondary'}>{label}</span>
      <span className={tone ? `text-${tone}` : ''}>{children}</span>
    </div>
  );
}

export default function RiderSummary() {
  const { today, money } = useConfig();
  const toast = useToast();
  const [date, setDate] = useState(today);
  const { data, loading, error, reload } = useApi('/closeouts/preview', { date });
  const history = useApi('/closeouts', { limit: 10 });
  const [actual, setActual] = useState('');
  const [notes, setNotes] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  const s = data?.summary;
  const closeout = data?.closeout;
  const canSubmit = data && (!closeout || closeout.status === 'Returned');
  const actualCents = actual === '' ? NaN : toCents(actual);
  const expected = data?.expectedHandover ?? 0;
  const diff = Number.isNaN(actualCents) ? null : actualCents - expected;

  const submit = async () => {
    setBusy(true);
    setSubmitError(null);
    try {
      await api.post('/closeouts', { date, actualHandover: actualCents, notes });
      toast.success('Handover submitted. Management will confirm receipt.');
      setConfirming(false);
      setActual('');
      setNotes('');
      reload();
      history.reload();
    } catch (e) {
      setSubmitError(e);
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container-narrow">
      <div className="d-flex align-items-center justify-content-between mb-3 gap-2">
        <h1 className="h4 fw-bold mb-0">End of Day</h1>
        <input type="date" className="form-control w-auto" value={date} max={today} min={addDays(today, -60)} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Summary date" />
      </div>
      <div className="small text-secondary mb-3">{relativeDay(date, today)} · {formatDate(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>

      <ErrorAlert error={error} onRetry={reload} />
      <ErrorAlert error={submitError} />
      {loading && !data && <CardSkeleton rows={8} />}

      {data && (
        <>
          <div className="card mb-3">
            <div className="card-body">
              <h2 className="h6 fw-bold text-uppercase text-secondary rl-kicker">Deliveries</h2>
              <div className="rl-count-row mb-2">
                <div><strong>{s.deliveries}</strong><span>Total</span></div>
                <div className="text-success"><strong>{s.delivered}</strong><span>Delivered</span></div>
                <div className="text-danger"><strong>{s.failed}</strong><span>Failed</span></div>
                <div className="text-warning-emphasis"><strong>{s.returned}</strong><span>Returned</span></div>
                <div className="text-secondary"><strong>{s.cancelled}</strong><span>Cancelled</span></div>
              </div>
              <hr />
              <Line label="Total delivery fees"><Money cents={s.totalFees} /></Line>
              <Line label="Total collected"><Money cents={s.totalCollected} /></Line>
              <div className="ps-3 small">
                <Line label="Cash"><Money cents={s.cashCollected} /></Line>
                <Line label="Mobile Money"><Money cents={s.mobileMoneyCollected} /></Line>
                <Line label="Bank transfer"><Money cents={s.bankCollected} /></Line>
                {s.otherCollected > 0 && <Line label="Other"><Money cents={s.otherCollected} /></Line>}
              </div>
              {s.extraCollected > 0 && <Line label="Extra collected (order money, included above)" tone="info-emphasis"><Money cents={s.extraCollected} /></Line>}
              <Line label="Outstanding (credit / unpaid)" tone="warning-emphasis"><Money cents={s.outstanding} /></Line>
            </div>
          </div>

          <div className="card mb-3 rl-reconcile">
            <div className="card-body">
              <h2 className="h6 fw-bold text-uppercase text-secondary rl-kicker">Cash reconciliation</h2>
              <Line label="Cash collected"><Money cents={s.cashCollected} /></Line>
              <Line label="− Approved expenses"><Money cents={s.approvedExpenses} /></Line>
              <hr className="my-2" />
              <div className="text-center py-2">
                <div className="small text-secondary text-uppercase fw-semibold">Expected handover</div>
                <div className="display-6 fw-bold"><Money cents={expected} /></div>
                {expected < 0 && <div className="small text-secondary">Approved expenses are more than cash collected — management owes you {money(-expected)}.</div>}
              </div>
              {data.pendingExpenses > 0 && (
                <div className="alert alert-warning small d-flex gap-2 mb-0"><AlertTriangle size={16} className="mt-1" /> {data.pendingExpenses} expense{data.pendingExpenses > 1 ? 's are' : ' is'} still pending approval and not included yet. Management must review {data.pendingExpenses > 1 ? 'them' : 'it'} before confirming.</div>
              )}
            </div>
          </div>

          {closeout && closeout.status !== 'Returned' && (
            <div className={`card mb-3 border-${closeout.status === 'Confirmed' ? 'success' : 'warning'}`}>
              <div className="card-body">
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <div className="fw-bold d-flex align-items-center gap-2">{closeout.status === 'Confirmed' ? <Lock size={18} className="text-success" /> : <Clock3 size={18} className="text-warning" />} Handover {closeout.closeoutId}</div>
                  <CloseoutBadge status={closeout.status} />
                </div>
                <Line label="Expected at submission"><Money cents={closeout.expectedHandover} /></Line>
                <Line label="You declared"><Money cents={closeout.declaredHandover} /></Line>
                {closeout.status === 'Confirmed' && <Line label="Management received"><Money cents={closeout.actualHandover} /></Line>}
                <Line label="Difference" strong><span className="d-flex align-items-center gap-2"><Money cents={closeout.difference} tone={closeout.difference < 0 ? 'danger' : closeout.difference > 0 ? 'warning-emphasis' : 'success'} /><DifferenceBadge difference={closeout.difference} /></span></Line>
                {closeout.status === 'Confirmed' && <div className="small text-secondary mt-2">Received by {closeout.receivedBy?.name} · {formatDateTime(closeout.receivedAt)}</div>}
                {closeout.notes && <div className="small mt-1"><span className="text-secondary">Management notes:</span> {closeout.notes}</div>}
                <div className="small text-secondary mt-2">{closeout.status === 'Confirmed' ? 'This day is closed. To fix a mistake, open the record and request a correction.' : 'Records for this day are locked while management confirms.'}</div>
              </div>
            </div>
          )}

          {closeout?.status === 'Returned' && (
            <div className="alert alert-secondary small d-flex gap-2"><Undo2 size={16} className="mt-1" /><div><strong>Management returned your handover.</strong> {closeout.notes} — fix your records, then submit again.</div></div>
          )}

          {canSubmit && (
            <div className="card mb-3 border-primary">
              <div className="card-body">
                <label htmlFor="actual" className="form-label fw-bold text-uppercase small">Actual amount handed over</label>
                <MoneyInput id="actual" size="lg" value={actual} onChange={setActual} placeholder="0.00" />
                {diff !== null && (
                  <div className={`rl-diff mt-2 ${diff === 0 ? 'rl-diff-exact' : diff < 0 ? 'rl-diff-short' : 'rl-diff-over'}`}>
                    {diff === 0 ? <><CheckCircle2 size={18} /> Exact match</> : diff < 0 ? <><AlertTriangle size={18} /> Short by {money(-diff)}</> : <><AlertTriangle size={18} /> Over by {money(diff)}</>}
                  </div>
                )}
                <textarea className="form-control mt-2" rows={2} placeholder="Notes for management (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
                <LoadingButton className="btn btn-primary btn-lg w-100 mt-3 d-flex align-items-center justify-content-center gap-2" disabled={Number.isNaN(actualCents)} onClick={() => setConfirming(true)}>
                  <Send size={18} /> Submit handover
                </LoadingButton>
                <div className="small text-secondary mt-2">After you submit, you cannot change deliveries or expenses for this day.</div>
              </div>
            </div>
          )}
        </>
      )}

      <h2 className="h6 fw-bold mt-4 mb-2">Previous handovers</h2>
      {history.data?.items.length === 0 && <div className="card"><EmptyState title="No reconciliation records for this period." /></div>}
      {history.data?.items.map((c) => (
        <button type="button" key={c._id} className="card mb-2 w-100 text-start border" onClick={() => setDate(c.date)}>
          <div className="card-body py-2 d-flex justify-content-between align-items-center">
            <div><div className="fw-semibold">{relativeDay(c.date, today)}</div><div className="small text-secondary">Expected {money(c.expectedHandover)} · Handed {money(c.actualHandover)}</div></div>
            <div className="text-end"><CloseoutBadge status={c.status} /><div className="small mt-1"><Money cents={c.difference} tone={c.difference < 0 ? 'danger' : c.difference > 0 ? 'warning-emphasis' : 'success'} /></div></div>
          </div>
        </button>
      ))}
      <div className="text-center my-3"><Link to="/rider/deliveries" className="small">View delivery history</Link></div>

      <Modal show={confirming} title="Submit end-of-day handover?" onClose={() => setConfirming(false)} fullscreenMobile={false}
        footer={<><button type="button" className="btn btn-light" onClick={() => setConfirming(false)} disabled={busy}>Go back</button><LoadingButton loading={busy} loadingText="Submitting…" onClick={submit}>Yes, submit</LoadingButton></>}>
        <Line label="Expected handover"><Money cents={expected} /></Line>
        <Line label="You are handing over" strong>{Number.isNaN(actualCents) ? '—' : <Money cents={actualCents} />}</Line>
        {diff !== null && <Line label="Difference"><span className="d-flex gap-2 align-items-center"><Money cents={diff} /><DifferenceBadge difference={diff} /></span></Line>}
        <div className="alert alert-warning small mt-3 mb-0">Your records for {formatDate(date)} will be locked. Changes after this need management approval.</div>
      </Modal>
    </div>
  );
}
