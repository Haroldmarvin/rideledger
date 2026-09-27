import { useState } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import Modal from './Modal';
import LoadingButton from './LoadingButton';

/**
 * Confirmation for permanent deletes (management only).
 * - message:     what will be removed
 * - confirmText: if set, the admin must type this exact text before the Delete button unlocks
 * - onConfirm(reason) may be async; throw to show the error in the dialog
 */
export default function DeleteConfirmModal({ show, title = 'Delete permanently?', message, confirmText, confirmLabel = 'Delete', onConfirm, onClose }) {
  const [reason, setReason] = useState('');
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const close = () => { setReason(''); setTyped(''); setError(null); onClose(); };
  const typedOk = !confirmText || typed.trim().toLowerCase() === confirmText.trim().toLowerCase();

  const submit = async () => {
    if (!typedOk) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm(reason.trim());
      setReason('');
      setTyped('');
    } catch (e) {
      setError(e.message || 'Could not delete. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal show={show} title={title} onClose={close} fullscreenMobile={false}
      footer={<>
        <button type="button" className="btn btn-light" onClick={close} disabled={busy}>Cancel</button>
        <LoadingButton className="btn btn-danger d-inline-flex align-items-center gap-1" loading={busy} loadingText="Deleting…" onClick={submit} disabled={!typedOk}>
          <Trash2 size={16} /> {confirmLabel}
        </LoadingButton>
      </>}>
      <div className="d-flex gap-2 alert alert-danger py-2 small mb-3">
        <AlertTriangle size={18} className="flex-shrink-0 mt-1" />
        <div>{message}<div className="mt-1 fw-semibold">This cannot be undone. A copy is kept in the Audit Log.</div></div>
      </div>
      {confirmText && (
        <div className="mb-3">
          <label className="form-label fw-medium" htmlFor="delete-typed">Type <strong>{confirmText}</strong> to confirm</label>
          <input id="delete-typed" className="form-control" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoFocus />
        </div>
      )}
      <label className="form-label fw-medium" htmlFor="delete-reason">Reason (optional)</label>
      <textarea id="delete-reason" className="form-control" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="e.g. Entered by mistake" />
      {error && <div className="alert alert-danger py-2 small mt-3 mb-0">{error}</div>}
    </Modal>
  );
}
