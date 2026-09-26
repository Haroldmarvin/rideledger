import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Receipt, Paperclip, Pencil, FilePenLine, Lock } from 'lucide-react';
import { useApi } from '../../hooks/useApi';
import { useToast } from '../../context/ToastContext';
import { useConfig } from '../../context/ConfigContext';
import ExpenseFormModal from '../../components/ExpenseFormModal';
import ReceiptViewer from '../../components/ReceiptViewer';
import EmptyState from '../../components/EmptyState';
import ErrorAlert from '../../components/ErrorAlert';
import Pagination from '../../components/Pagination';
import Money from '../../components/Money';
import { StatusBadge } from '../../components/Badges';
import { CardSkeleton } from '../../components/Skeleton';
import { relativeDay } from '../../utils/format';
import { EXPENSE_STATUSES } from '../../utils/constants';

export default function RiderExpenses() {
  const toast = useToast();
  const { today } = useConfig();
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState(null); // { expense?, correction? }
  const [receipt, setReceipt] = useState(null);
  const { data, loading, error, reload } = useApi('/expenses', { status: status || undefined, page, limit: 30 });

  useEffect(() => {
    if (params.get('new') === '1') { setModal({}); setParams({}, { replace: true }); }
  }, [params, setParams]);

  const onSaved = (_, kind) => {
    setModal(null);
    toast.success(kind === 'correction' ? 'Correction request sent to management.' : kind === 'updated' ? 'Expense updated.' : 'Expense submitted for approval.');
    reload();
  };

  return (
    <div className="container-narrow">
      <div className="d-flex align-items-center justify-content-between mb-3">
        <h1 className="h4 fw-bold mb-0">My Expenses</h1>
        <button type="button" className="btn btn-primary d-flex align-items-center gap-1" onClick={() => setModal({})}><Plus size={18} /> Add</button>
      </div>

      {data && (
        <div className="rl-summary-strip mb-3">
          <div><span>Approved</span><strong className="text-success"><Money cents={data.totals.Approved.amount} /></strong></div>
          <div><span>Pending</span><strong className="text-warning-emphasis"><Money cents={data.totals.Pending.amount} /></strong></div>
          <div><span>Rejected</span><strong className="text-danger"><Money cents={data.totals.Rejected.amount} /></strong></div>
        </div>
      )}

      <div className="rl-chips mb-3">
        {['', ...EXPENSE_STATUSES].map((s) => (
          <button type="button" key={s || 'all'} className={`rl-chip rl-chip-sm ${status === s ? 'active' : ''}`} onClick={() => { setStatus(s); setPage(1); }}>{s || 'All'}</button>
        ))}
      </div>

      <ErrorAlert error={error} onRetry={reload} />
      {loading && !data && <><CardSkeleton /><CardSkeleton /></>}
      {data && data.items.length === 0 && (
        <div className="card"><EmptyState icon={Receipt} title={status === 'Pending' ? 'No pending expenses.' : 'No expenses recorded.'} message="Record fuel, repairs or parking as soon as you pay." action={<button type="button" className="btn btn-primary" onClick={() => setModal({})}>Add expense</button>} /></div>
      )}
      {data?.items.map((e) => (
        <div key={e._id} className="card mb-2">
          <div className="card-body py-3">
            <div className="d-flex justify-content-between align-items-start gap-2">
              <div className="min-w-0">
                <div className="fw-semibold">{e.category}</div>
                <div className="small text-secondary">{relativeDay(e.date, today)} · <span className="font-monospace">{e.expenseId}</span>{e.closedPeriod && <Lock size={12} className="ms-1" />}</div>
                {e.description && <div className="small mt-1 text-truncate">{e.description}</div>}
              </div>
              <div className="text-end flex-shrink-0">
                <div className="fw-bold"><Money cents={e.amount} /></div>
                <StatusBadge status={e.status} />
              </div>
            </div>
            {e.status === 'Rejected' && e.rejectionReason && <div className="small text-danger mt-2">Rejected: {e.rejectionReason}</div>}
            <div className="d-flex gap-3 mt-2">
              {e.receipt && <button type="button" className="btn btn-link btn-sm p-0 d-flex align-items-center gap-1" onClick={() => setReceipt(e)}><Paperclip size={14} /> Receipt</button>}
              {e.status === 'Pending' && !e.closedPeriod && <button type="button" className="btn btn-link btn-sm p-0 d-flex align-items-center gap-1" onClick={() => setModal({ expense: e })}><Pencil size={14} /> Edit</button>}
              {e.closedPeriod && <button type="button" className="btn btn-link btn-sm p-0 d-flex align-items-center gap-1" onClick={() => setModal({ expense: e, correction: true })}><FilePenLine size={14} /> Request correction</button>}
            </div>
          </div>
        </div>
      ))}
      {data && <Pagination page={data.page} pages={data.pages} total={data.total} onChange={setPage} />}

      <ExpenseFormModal show={Boolean(modal)} expense={modal?.expense} correction={modal?.correction} onClose={() => setModal(null)} onSaved={onSaved} />
      <ReceiptViewer expense={receipt} onClose={() => setReceipt(null)} />
    </div>
  );
}
