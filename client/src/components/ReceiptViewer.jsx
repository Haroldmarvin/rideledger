import { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import Modal from './Modal';
import ErrorAlert from './ErrorAlert';
import { fetchObjectUrl } from '../services/download';

/** Loads an authenticated receipt (image or PDF) and shows it. */
export default function ReceiptViewer({ expense, onClose }) {
  const [state, setState] = useState({ loading: true, url: null, type: null, error: null });
  useEffect(() => {
    if (!expense) return undefined;
    let url;
    setState({ loading: true, url: null, type: null, error: null });
    fetchObjectUrl(`/expenses/${expense._id}/receipt`)
      .then((r) => { url = r.url; setState({ loading: false, url: r.url, type: r.type, error: null }); })
      .catch((e) => setState({ loading: false, url: null, type: null, error: e }));
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [expense]);

  return (
    <Modal show={Boolean(expense)} title={`Receipt · ${expense?.expenseId || ''}`} onClose={onClose} size="lg">
      {state.loading && <div className="text-center py-5"><div className="spinner-border text-primary" role="status" /><div className="small text-secondary mt-2">Loading receipt…</div></div>}
      <ErrorAlert error={state.error} />
      {state.url && (state.type === 'application/pdf'
        ? <div className="text-center py-4"><FileText size={40} className="text-secondary mb-2" /><div><a className="btn btn-primary" href={state.url} target="_blank" rel="noreferrer">Open PDF receipt</a></div></div>
        : <img src={state.url} alt="Receipt" className="img-fluid rounded border w-100" />)}
    </Modal>
  );
}
