import { useState } from 'react';
import { BadgeDollarSign, History } from 'lucide-react';
import api from '../../services/api';
import { useApi } from '../../hooks/useApi';
import { useConfig } from '../../context/ConfigContext';
import { useToast } from '../../context/ToastContext';
import PageHeader from '../../components/PageHeader';
import ErrorAlert from '../../components/ErrorAlert';
import EmptyState from '../../components/EmptyState';
import FormField from '../../components/FormField';
import MoneyInput from '../../components/MoneyInput';
import LoadingButton from '../../components/LoadingButton';
import Money from '../../components/Money';
import { CardSkeleton } from '../../components/Skeleton';
import { toCents } from '../../utils/money';
import { formatDateTime } from '../../utils/format';

export default function Fees() {
  const toast = useToast();
  const { reload: reloadConfig } = useConfig();
  const { data, loading, error, reload } = useApi('/fees');
  const [fee, setFee] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const cents = toCents(fee);
    if (Number.isNaN(cents)) { setErr('Enter a valid fee.'); return; }
    setBusy(true);
    setErr(null);
    try {
      await api.post('/fees', { fee: cents, note });
      toast.success('Default delivery fee updated. Existing deliveries keep their original fee.');
      setFee(''); setNote('');
      reload(); reloadConfig();
    } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };

  return (
    <div>
      <PageHeader title="Delivery Fees" subtitle="Set the default fee used to pre-fill new deliveries" />
      <ErrorAlert error={error} onRetry={reload} />
      <div className="row g-3">
        <div className="col-lg-5">
          <div className="card mb-3">
            <div className="card-body text-center py-4">
              <BadgeDollarSign size={28} className="text-primary mb-2" />
              <div className="small text-secondary text-uppercase fw-semibold">Current default fee</div>
              {loading && !data ? <CardSkeleton rows={1} /> : <div className="display-6 fw-bold">{data?.current ? <Money cents={data.current.fee} /> : 'Not set'}</div>}
              {data?.current && <div className="small text-secondary">Since {formatDateTime(data.current.effectiveFrom)}</div>}
            </div>
          </div>
          <form className="card" onSubmit={submit} noValidate>
            <div className="card-body">
              <div className="fw-semibold mb-3">Change default fee</div>
              <FormField label="New fee" required error={err}><MoneyInput size="lg" value={fee} onChange={setFee} invalid={Boolean(err)} /></FormField>
              <FormField label="Note" hint="e.g. Fuel price adjustment"><input className="form-control" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} /></FormField>
              <LoadingButton type="submit" loading={busy}>Save new fee</LoadingButton>
              <div className="small text-secondary mt-3">Every delivery stores the fee actually charged. Changing the default never changes historical records.</div>
            </div>
          </form>
        </div>
        <div className="col-lg-7">
          <div className="card">
            <div className="card-header bg-white fw-semibold d-flex align-items-center gap-2"><History size={16} /> Fee history</div>
            {data?.history.length === 0 && <EmptyState title="No fee history yet." />}
            {data?.history.length > 0 && (
              <div className="table-responsive">
                <table className="table align-middle mb-0 rl-table">
                  <thead><tr><th className="text-end">Fee</th><th>Effective from</th><th>Until</th><th>Set by</th><th>Note</th></tr></thead>
                  <tbody>
                    {data.history.map((h) => (
                      <tr key={h._id} className={h.active ? 'table-primary' : ''}>
                        <td className="text-end fw-semibold"><Money cents={h.fee} /></td>
                        <td className="small">{formatDateTime(h.effectiveFrom)}</td>
                        <td className="small">{h.active ? <span className="badge rl-badge rl-badge-success">Current</span> : formatDateTime(h.effectiveTo)}</td>
                        <td className="small">{h.createdBy?.name || '—'}</td>
                        <td className="small text-secondary">{h.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
