import { useEffect, useState } from 'react';
import { Building2 } from 'lucide-react';
import api from '../../services/api';
import { useConfig } from '../../context/ConfigContext';
import { useToast } from '../../context/ToastContext';
import PageHeader from '../../components/PageHeader';
import FormField from '../../components/FormField';
import LoadingButton from '../../components/LoadingButton';
import { ChangePasswordCard } from '../shared/Profile';

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
      await api.put('/settings', f);
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
        <div className="col-lg-6"><ChangePasswordCard /></div>
      </div>
    </div>
  );
}
