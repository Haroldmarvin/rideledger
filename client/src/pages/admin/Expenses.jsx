import { useState } from 'react';
import { Check, X, Paperclip, Receipt, Plus, Pencil } from 'lucide-react';
import api from '../../services/api';
import { useApi } from '../../hooks/useApi';
import { useLookups } from '../../hooks/useLookups';
import { useToast } from '../../context/ToastContext';
import { useConfig } from '../../context/ConfigContext';
import PageHeader from '../../components/PageHeader';
import ErrorAlert from '../../components/ErrorAlert';
import EmptyState from '../../components/EmptyState';
import Pagination from '../../components/Pagination';
import ConfirmModal from '../../components/ConfirmModal';
import ReceiptViewer from '../../components/ReceiptViewer';
import ExpenseFormModal from '../../components/ExpenseFormModal';
import Money from '../../components/Money';
import { StatusBadge } from '../../components/Badges';
import { TableSkeleton } from '../../components/Skeleton';
import { EXPENSE_STATUSES, EXPENSE_CATEGORIES } from '../../utils/constants';
import { formatDate, formatDateTime, PRESETS, presetRange } from '../../utils/format';

export default function AdminExpenses() {
  const toast = useToast();
  const { today } = useConfig();
  const { riders } = useLookups({ bikes: false });
  const [f, setF] = useState({ status: 'Pending', rider: '', category: '', preset: 'all', from: '', to: '' });
  const [page, setPage] = useState(1);
  const params = { status: f.status || undefined, rider: f.rider || undefined, category: f.category || undefined, from: f.from || undefined, to: f.to || undefined, page, limit: 30 };
  const { data, loading, error, reload } = useApi('/expenses', params);
  const [receipt, setReceipt] = useState(null);
  const [action, setAction] = useState(null); // {type, expense}
  const [form, setForm] = useState(null);

  const set = (patch) => { setF({ ...f, ...patch }); setPage(1); };
  const setPreset = (preset) => {
    if (preset === 'all') return set({ preset, from: '', to: '' });
    if (preset === 'custom') return set({ preset });
    return set({ preset, ...presetRange(preset, today) });
  };

  const review = async (reason) => {
    const { type, expense } = action;
    await api.patch(`/expenses/${expense._id}/${type}`, reason ? { reason } : {});
    toast.success(`${expense.expenseId} ${type === 'approve' ? 'approved' : 'rejected'}.`);
    setAction(null);
    reload();
  };

  return (
    <div>
      <PageHeader title="Expenses" subtitle="Only approved expenses reduce a rider's expected cash handover" actions={<button type="button" className="btn btn-outline-primary d-flex align-items-center gap-1" onClick={() => setForm({})}><Plus size={16} /> Record expense</button>} />
      {data && (
        <div className="rl-summary-strip mb-3">
          {EXPENSE_STATUSES.map((s) => (
            <button type="button" key={s} className={`rl-strip-btn ${f.status === s ? 'active' : ''}`} onClick={() => set({ status: f.status === s ? '' : s })}>
              <span>{s} ({data.totals[s].count})</span><strong className={s === 'Approved' ? 'text-success' : s === 'Rejected' ? 'text-danger' : 'text-warning-emphasis'}><Money cents={data.totals[s].amount} /></strong>
            </button>
          ))}
        </div>
      )}
      <div className="card mb-3"><div className="card-body p-2 p-md-3 row g-2">
        <div className="col-6 col-md-2"><select className="form-select" value={f.status} onChange={(e) => set({ status: e.target.value })} aria-label="Status"><option value="">All statuses</option>{EXPENSE_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></div>
        <div className="col-6 col-md-3"><select className="form-select" value={f.rider} onChange={(e) => set({ rider: e.target.value })} aria-label="Rider"><option value="">All riders</option>{riders.map((r) => <option key={r._id} value={r._id}>{r.name}</option>)}</select></div>
        <div className="col-6 col-md-3"><select className="form-select" value={f.category} onChange={(e) => set({ category: e.target.value })} aria-label="Category"><option value="">All categories</option>{EXPENSE_CATEGORIES.map((s) => <option key={s}>{s}</option>)}</select></div>
        <div className="col-6 col-md-2"><select className="form-select" value={f.preset} onChange={(e) => setPreset(e.target.value)} aria-label="Dates"><option value="all">All dates</option>{PRESETS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}</select></div>
        {f.preset === 'custom' && <>
          <div className="col-6 col-md-2"><input type="date" className="form-control" value={f.from} onChange={(e) => set({ from: e.target.value })} aria-label="From" /></div>
          <div className="col-6 col-md-2"><input type="date" className="form-control" value={f.to} onChange={(e) => set({ to: e.target.value })} aria-label="To" /></div>
        </>}
      </div></div>
      <ErrorAlert error={error} onRetry={reload} />
      <div className="card">
        {loading && !data && <TableSkeleton />}
        {data?.items.length === 0 && <EmptyState icon={Receipt} title={f.status === 'Pending' ? 'No pending expenses.' : 'No expenses found.'} message={f.status === 'Pending' ? 'All caught up.' : 'Try different filters.'} />}
        {data?.items.length > 0 && (
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0 rl-table">
              <thead><tr><th>Expense</th><th>Rider</th><th>Category</th><th>Description</th><th className="text-end">Amount</th><th>Receipt</th><th>Status</th><th /></tr></thead>
              <tbody>
                {data.items.map((e) => (
                  <tr key={e._id}>
                    <td><div className="font-monospace small">{e.expenseId}</div><div className="small text-secondary">{formatDate(e.date)}</div></td>
                    <td>{e.rider?.name}</td>
                    <td className="small">{e.category}</td>
                    <td className="small" style={{ maxWidth: 240 }}><div className="text-truncate">{e.description || '—'}</div>{e.status === 'Rejected' && <div className="text-danger text-truncate">Reason: {e.rejectionReason}</div>}</td>
                    <td className="text-end fw-semibold"><Money cents={e.amount} /></td>
                    <td>{e.receipt ? <button type="button" className="btn btn-sm btn-link p-0 d-flex align-items-center gap-1" onClick={() => setReceipt(e)}><Paperclip size={14} /> View</button> : <span className="small text-secondary">None</span>}</td>
                    <td><StatusBadge status={e.status} />{e.reviewedBy && <div className="small text-secondary" title={formatDateTime(e.reviewedAt)}>by {e.reviewedBy.name}</div>}</td>
                    <td className="text-end text-nowrap">
                      {e.status !== 'Approved' && <button type="button" className="btn btn-sm btn-success me-1" onClick={() => setAction({ type: 'approve', expense: e })} title="Approve"><Check size={15} /></button>}
                      {e.status !== 'Rejected' && <button type="button" className="btn btn-sm btn-outline-danger me-1" onClick={() => setAction({ type: 'reject', expense: e })} title="Reject"><X size={15} /></button>}
                      <button type="button" className="btn btn-sm btn-light" onClick={() => setForm({ expense: e })} title="Edit"><Pencil size={15} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {data && <Pagination page={data.page} pages={data.pages} total={data.total} onChange={setPage} />}

      <ReceiptViewer expense={receipt} onClose={() => setReceipt(null)} />
      <ConfirmModal show={Boolean(action)} title={action?.type === 'approve' ? 'Approve expense?' : 'Reject expense?'} tone={action?.type === 'approve' ? 'success' : 'danger'}
        message={action && <><strong>{action.expense.rider?.name}</strong> · {action.expense.category} · <Money cents={action.expense.amount} />{action.expense.description ? <div className="small text-secondary mt-1">{action.expense.description}</div> : null}{action.type === 'approve' && <div className="small mt-2">This will reduce the rider&apos;s expected cash handover for {formatDate(action.expense.date)}.</div>}</>}
        reasonLabel={action?.type === 'reject' ? 'Reason for rejection' : (action?.expense.status === 'Rejected' ? 'Note (optional)' : undefined)} reasonRequired={action?.type === 'reject'}
        confirmLabel={action?.type === 'approve' ? 'Approve' : 'Reject'} onConfirm={review} onClose={() => setAction(null)} />
      <ExpenseFormModal show={Boolean(form)} expense={form?.expense} riders={riders} onClose={() => setForm(null)} onSaved={() => { setForm(null); toast.success('Expense saved.'); reload(); }} />
    </div>
  );
}
