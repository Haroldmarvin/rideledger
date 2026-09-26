import { useState } from 'react';
import Modal from './Modal';
import LoadingButton from './LoadingButton';

/** Confirmation dialog with optional required reason text. onConfirm(reason) may be async. */
export default function ConfirmModal({ show, title, message, confirmLabel = 'Confirm', tone = 'primary', reasonLabel, reasonRequired = false, onConfirm, onClose }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const close = () => { setReason(''); setError(null); onClose(); };
  const submit = async () => {
    if (reasonRequired && reason.trim().length < 3) { setError('Please enter a reason.'); return; }
    setBusy(true);
    setError(null);
    try {
      await onConfirm(reason.trim());
      setReason('');
    } catch (e) {
      setError(e.message || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal show={show} title={title} onClose={close} fullscreenMobile={false}
      footer={<>
        <button type="button" className="btn btn-light" onClick={close} disabled={busy}>Cancel</button>
        <LoadingButton className={`btn btn-${tone}`} loading={busy} onClick={submit}>{confirmLabel}</LoadingButton>
      </>}>
      {message && <div className="mb-3">{message}</div>}
      {reasonLabel && (
        <div>
          <label className="form-label fw-medium" htmlFor="confirm-reason">{reasonLabel}{reasonRequired && <span className="text-danger ms-1">*</span>}</label>
          <textarea id="confirm-reason" className={`form-control ${error ? 'is-invalid' : ''}`} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
        </div>
      )}
      {error && <div className="text-danger small mt-2">{error}</div>}
    </Modal>
  );
}
