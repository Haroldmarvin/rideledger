import { useEffect, useState } from 'react';
import { Camera, Paperclip, X } from 'lucide-react';
import api from '../services/api';
import { useConfig } from '../context/ConfigContext';
import Modal from './Modal';
import FormField from './FormField';
import MoneyInput from './MoneyInput';
import LoadingButton from './LoadingButton';
import { toCents, centsToInput } from '../utils/money';
import { EXPENSE_CATEGORIES } from '../utils/constants';
import { addDays } from '../utils/format';

const MAX_MB = 5;

/**
 * Create / edit an expense. `expense` = existing record for edit. `riders` (admin) enables rider choice.
 * `correction` = true turns it into a correction request for a closed day.
 */
export default function ExpenseFormModal({ show, expense, onClose, onSaved, riders, correction = false }) {
  const { today, settings } = useConfig();
  const [form, setForm] = useState({});
  const [file, setFile] = useState(null);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!show) return;
    setForm(expense
      ? { category: expense.category, amount: centsToInput(expense.amount), description: expense.description || '', date: expense.date, rider: expense.rider?._id || '', reason: '' }
      : { category: 'Fuel', amount: '', description: '', date: today, rider: '', reason: '' });
    setFile(null);
    setErrors({});
  }, [show, expense, today]);

  const pickFile = (f) => {
    if (!f) return;
    if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(f.type)) { setErrors((e) => ({ ...e, receipt: 'Receipt must be a photo (JPG, PNG, WEBP) or a PDF.' })); return; }
    if (f.size > MAX_MB * 1024 * 1024) { setErrors((e) => ({ ...e, receipt: `Receipt is too large (max ${MAX_MB} MB).` })); return; }
    setErrors((e) => ({ ...e, receipt: undefined }));
    setFile(f);
  };

  const submit = async () => {
    const e = {};
    const amount = toCents(form.amount);
    if (!form.category) e.category = 'Please choose a category.';
    if (Number.isNaN(amount) || amount <= 0) e.amount = 'Please enter the amount spent.';
    if (form.category === 'Other Authorized Expense' && form.description.trim().length < 3) e.description = 'Please describe what this expense was for.';
    if (riders && !expense && !form.rider) e.rider = 'Please choose the rider.';
    if (!correction && !expense && settings?.requireReceiptForExpenses && !file) e.receipt = 'Please attach a photo of the receipt.';
    if (correction && form.reason.trim().length < 5) e.reason = 'Please explain why this correction is needed.';
    setErrors(e);
    if (Object.keys(e).length) return;

    setBusy(true);
    try {
      if (correction) {
        const changes = {};
        if (form.category !== expense.category) changes.category = form.category;
        if (amount !== expense.amount) changes.amount = amount;
        if (form.description.trim() !== (expense.description || '')) changes.description = form.description.trim();
        const res = await api.post(`/expenses/${expense._id}/correction-request`, { changes, reason: form.reason.trim() });
        onSaved?.(res.data.correction, 'correction');
        return;
      }
      const fd = new FormData();
      fd.append('category', form.category);
      fd.append('amount', String(amount));
      fd.append('description', form.description.trim());
      fd.append('date', form.date);
      if (riders && !expense) fd.append('rider', form.rider);
      if (expense && form.reason.trim()) fd.append('reason', form.reason.trim());
      if (file) fd.append('receipt', file);
      const res = expense
        ? await api.patch(`/expenses/${expense._id}`, fd)
        : await api.post('/expenses', fd);
      onSaved?.(res.data.expense, expense ? 'updated' : 'created');
    } catch (err) {
      setErrors({ ...(err.fieldErrors || {}), _: err.message });
    } finally {
      setBusy(false);
    }
  };

  const title = correction ? 'Request expense correction' : expense ? `Edit ${expense.expenseId}` : 'New expense';
  return (
    <Modal show={show} title={title} onClose={onClose}
      footer={<><button type="button" className="btn btn-light" onClick={onClose} disabled={busy}>Cancel</button><LoadingButton loading={busy} loadingText="Saving…" onClick={submit}>{correction ? 'Send request' : expense ? 'Save changes' : 'Submit expense'}</LoadingButton></>}>
      {errors._ && <div className="alert alert-danger py-2 small">{errors._}</div>}
      {riders && !expense && (
        <FormField label="Rider" required error={errors.rider}>
          <select className={`form-select ${errors.rider ? 'is-invalid' : ''}`} value={form.rider || ''} onChange={(e) => setForm({ ...form, rider: e.target.value })}>
            <option value="">Choose rider…</option>
            {riders.filter((r) => r.status === 'active').map((r) => <option key={r._id} value={r._id}>{r.name}</option>)}
          </select>
        </FormField>
      )}
      <div className="form-label fw-medium">Category <span className="text-danger">*</span></div>
      <div className="rl-chips mb-3" role="radiogroup" aria-label="Category">
        {EXPENSE_CATEGORIES.map((c) => (
          <button type="button" key={c} role="radio" aria-checked={form.category === c} className={`rl-chip ${form.category === c ? 'active' : ''}`} onClick={() => setForm({ ...form, category: c })}>{c}</button>
        ))}
      </div>
      <div className="row g-2">
        <div className="col-6">
          <FormField label="Amount" required error={errors.amount}>
            <MoneyInput size="lg" value={form.amount || ''} onChange={(v) => setForm({ ...form, amount: v })} invalid={Boolean(errors.amount)} />
          </FormField>
        </div>
        <div className="col-6">
          <FormField label="Date" error={errors.date}>
            <input type="date" className="form-control form-control-lg" value={form.date || ''} max={today} min={riders ? undefined : addDays(today, -7)} disabled={correction} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </FormField>
        </div>
      </div>
      <FormField label="Description / reason" error={errors.description} required={form.category === 'Other Authorized Expense'}>
        <textarea className={`form-control ${errors.description ? 'is-invalid' : ''}`} rows={2} value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={500} />
      </FormField>
      {!correction && (
        <FormField label="Receipt photo" error={errors.receipt} hint={expense?.receipt ? 'A receipt is attached. Choose a new one to replace it.' : 'JPG, PNG, WEBP or PDF, max 5 MB'}>
          {file ? (
            <div className="d-flex align-items-center gap-2 border rounded p-2">
              <Paperclip size={16} /><span className="small text-truncate flex-grow-1">{file.name}</span>
              <button type="button" className="btn btn-sm btn-link text-danger p-0" onClick={() => setFile(null)} aria-label="Remove file"><X size={16} /></button>
            </div>
          ) : (
            <div className="d-flex gap-2">
              <label className="btn btn-outline-primary flex-fill d-flex align-items-center justify-content-center gap-2 mb-0">
                <Camera size={18} /> Take photo
                <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => pickFile(e.target.files[0])} />
              </label>
              <label className="btn btn-outline-secondary flex-fill d-flex align-items-center justify-content-center gap-2 mb-0">
                <Paperclip size={18} /> Choose file
                <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" hidden onChange={(e) => pickFile(e.target.files[0])} />
              </label>
            </div>
          )}
        </FormField>
      )}
      {(correction || (expense && riders)) && (
        <FormField label={correction ? 'Why is this correction needed?' : 'Reason for change'} required={correction} error={errors.reason}>
          <textarea className={`form-control ${errors.reason ? 'is-invalid' : ''}`} rows={2} value={form.reason || ''} onChange={(e) => setForm({ ...form, reason: e.target.value })} maxLength={500} />
        </FormField>
      )}
      {!correction && <div className="small text-secondary">Only expenses approved by management reduce your expected cash handover.</div>}
    </Modal>
  );
}
