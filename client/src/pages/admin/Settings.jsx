import { useEffect, useState } from 'react';
import { Building2, MapPin, Plus, X, ArrowUp, ArrowDown } from 'lucide-react';
import api from '../../services/api';
import { useConfig } from '../../context/ConfigContext';
import { useToast } from '../../context/ToastContext';
import PageHeader from '../../components/PageHeader';
import FormField from '../../components/FormField';
import LoadingButton from '../../components/LoadingButton';
import { ChangePasswordCard } from '../shared/Profile';

/** Management edits the destination list riders pick from on the New Delivery screen. */
function DestinationsCard() {
  const config = useConfig();
  const toast = useToast();
  const [list, setList] = useState(config.settings?.destinations || []);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const saved = config.settings?.destinations || [];
  useEffect(() => { setList(config.settings?.destinations || []); }, [config.settings]);

  const dirty = JSON.stringify(list) !== JSON.stringify(saved);

  const add = (e) => {
    e?.preventDefault();
    const names = draft.split(',').map((s) => s.trim()).filter(Boolean);
    if (!names.length) return;
    const next = [...list];
    const skipped = [];
    for (const n of names) {
      if (next.some((x) => x.toLowerCase() === n.toLowerCase())) skipped.push(n);
      else next.push(n);
    }
    setList(next);
    setDraft('');
    if (skipped.length) toast.info(`Already in the list: ${skipped.join(', ')}`);
  };

  const remove = (i) => setList(list.filter((_, idx) => idx !== i));
  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    setList(next);
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.put('/settings', { destinations: list });
      await config.reload();
      toast.success('Destination list saved. Riders see it on their next New Delivery.');
    } catch (x) { setError(x.message); } finally { setBusy(false); }
  };

  return (
    <div className="card">
      <div className="card-header bg-white fw-semibold d-flex align-items-center gap-2"><MapPin size={16} /> Delivery destinations</div>
      <div className="card-body">
        <p className="small text-secondary">Riders pick from this list on the New Delivery screen. They can still type a place that is not listed using “Other location”.</p>
        {error && <div className="alert alert-danger py-2 small">{error}</div>}
        <form className="input-group mb-3" onSubmit={add}>
          <input className="form-control" placeholder="Add a location, e.g. Duala (use commas to add several)" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={400} />
          <button type="submit" className="btn btn-outline-primary d-flex align-items-center gap-1" disabled={!draft.trim()}><Plus size={16} /> Add</button>
        </form>
        {list.length === 0 ? (
          <div className="text-secondary small mb-3">No locations yet. Riders will type the destination by hand.</div>
        ) : (
          <ul className="list-group mb-3" style={{ maxHeight: 360, overflowY: 'auto' }}>
            {list.map((d, i) => (
              <li key={d} className="list-group-item d-flex align-items-center gap-2 py-2">
                <span className="text-secondary small" style={{ width: 22 }}>{i + 1}.</span>
                <span className="flex-grow-1">{d}</span>
                <button type="button" className="btn btn-sm btn-light" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${d} up`}><ArrowUp size={14} /></button>
                <button type="button" className="btn btn-sm btn-light" onClick={() => move(i, 1)} disabled={i === list.length - 1} aria-label={`Move ${d} down`}><ArrowDown size={14} /></button>
                <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => remove(i)} aria-label={`Remove ${d}`}><X size={14} /></button>
              </li>
            ))}
          </ul>
        )}
        <div className="d-flex align-items-center gap-2">
          <LoadingButton type="button" loading={busy} onClick={save} disabled={!dirty}>Save destinations</LoadingButton>
          {dirty && <button type="button" className="btn btn-light" onClick={() => setList(saved)} disabled={busy}>Undo changes</button>}
          <span className="small text-secondary ms-auto">{list.length} location{list.length === 1 ? '' : 's'}</span>
        </div>
      </div>
    </div>
  );
}

export default function Settings() {
  const config = useConfig();
  const toast = useToast();
  const [f, setF] = useState(config.settings);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => { setF(config.settings); }, [config.settings]);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { companyName, currencySymbol, allowRiderFeeOverride, requireReceiptForExpenses } = f;
      await api.put('/settings', { companyName, currencySymbol, allowRiderFeeOverride, requireReceiptForExpenses });
      await config.reload();
      toast.success('Settings saved.');
    } catch (x) { setError(x.message); } finally { setBusy(false); }
  };

  return (
    <div>
      <PageHeader title="Settings" subtitle="Organization preferences and your account" />
      <div className="row g-3">
        <div className="col-lg-6">
          <form className="card" onSubmit={save}>
            <div className="card-header bg-white fw-semibold d-flex align-items-center gap-2"><Building2 size={16} /> Organization</div>
            <div className="card-body">
              {error && <div className="alert alert-danger py-2 small">{error}</div>}
              <FormField label="Company name" hint="Shown on reports and exports"><input className="form-control" value={f.companyName || ''} onChange={(e) => setF({ ...f, companyName: e.target.value })} maxLength={120} /></FormField>
              <FormField label="Currency symbol" hint="e.g. $ or L$"><input className="form-control" style={{ maxWidth: 120 }} value={f.currencySymbol || ''} onChange={(e) => setF({ ...f, currencySymbol: e.target.value })} maxLength={5} /></FormField>
              <div className="form-check form-switch mb-2">
                <input id="feeOverride" type="checkbox" className="form-check-input" checked={Boolean(f.allowRiderFeeOverride)} onChange={(e) => setF({ ...f, allowRiderFeeOverride: e.target.checked })} />
                <label htmlFor="feeOverride" className="form-check-label">Riders may change the delivery fee <div className="small text-secondary">When off, riders must use the default fee. Changed fees are always flagged.</div></label>
              </div>
              <div className="form-check form-switch mb-3">
                <input id="receiptReq" type="checkbox" className="form-check-input" checked={Boolean(f.requireReceiptForExpenses)} onChange={(e) => setF({ ...f, requireReceiptForExpenses: e.target.checked })} />
                <label htmlFor="receiptReq" className="form-check-label">Require a receipt photo for every expense</label>
              </div>
              <LoadingButton type="submit" loading={busy}>Save settings</LoadingButton>
              <div className="small text-secondary mt-3">Business day timezone: <strong>{config.businessTz || 'Africa/Monrovia'}</strong> (server setting BUSINESS_TZ).</div>
            </div>
          </form>
        </div>
        <div className="col-lg-6"><DestinationsCard /></div>
        <div className="col-lg-6"><ChangePasswordCard /></div>
      </div>
    </div>
  );
}
