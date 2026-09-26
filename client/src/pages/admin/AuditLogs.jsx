import { Fragment, useState } from 'react';
import { ScrollText, ChevronDown, ChevronRight, Search } from 'lucide-react';
import { useApi } from '../../hooks/useApi';
import { useDebounce } from '../../hooks/useDebounce';
import { useLookups } from '../../hooks/useLookups';
import PageHeader from '../../components/PageHeader';
import ErrorAlert from '../../components/ErrorAlert';
import EmptyState from '../../components/EmptyState';
import Pagination from '../../components/Pagination';
import { TableSkeleton } from '../../components/Skeleton';
import { formatDateTime } from '../../utils/format';
import { ChangeList } from '../shared/DeliveryDetail';

export default function AuditLogs() {
  const { riders } = useLookups({ bikes: false });
  const [f, setF] = useState({ search: '', entityType: '', rider: '', from: '', to: '' });
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(null);
  const search = useDebounce(f.search);
  const { data, loading, error, reload } = useApi('/audit-logs', { search: search || undefined, entityType: f.entityType || undefined, rider: f.rider || undefined, from: f.from || undefined, to: f.to || undefined, page, limit: 50 });
  const set = (p) => { setF({ ...f, ...p }); setPage(1); };

  return (
    <div>
      <PageHeader title="Audit Logs" subtitle="Read-only, append-only history of every important change" />
      <div className="card mb-3"><div className="card-body p-2 p-md-3 row g-2">
        <div className="col-md-4 position-relative"><Search size={16} className="rl-input-icon" style={{ left: 20 }} /><input type="search" className="form-control ps-5" placeholder="Search action, record ID, user" value={f.search} onChange={(e) => set({ search: e.target.value })} /></div>
        <div className="col-6 col-md-2"><select className="form-select" value={f.entityType} onChange={(e) => set({ entityType: e.target.value })} aria-label="Record type"><option value="">All records</option>{(data?.entityTypes || []).map((t) => <option key={t}>{t}</option>)}</select></div>
        <div className="col-6 col-md-2"><select className="form-select" value={f.rider} onChange={(e) => set({ rider: e.target.value })} aria-label="Rider"><option value="">All riders</option>{riders.map((r) => <option key={r._id} value={r._id}>{r.name}</option>)}</select></div>
        <div className="col-6 col-md-2"><input type="date" className="form-control" value={f.from} onChange={(e) => set({ from: e.target.value })} aria-label="From" /></div>
        <div className="col-6 col-md-2"><input type="date" className="form-control" value={f.to} onChange={(e) => set({ to: e.target.value })} aria-label="To" /></div>
      </div></div>
      <ErrorAlert error={error} onRetry={reload} />
      <div className="card">
        {loading && !data && <TableSkeleton cols={5} />}
        {data?.items.length === 0 && <EmptyState icon={ScrollText} title="No audit entries found." />}
        {data?.items.length > 0 && (
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0 rl-table">
              <thead><tr><th style={{ width: 28 }} /><th>Date / time</th><th>User</th><th>Action</th><th>Record</th><th>IP / device</th></tr></thead>
              <tbody>
                {data.items.map((a) => {
                  const hasDetail = a.previousData || a.newData;
                  const isOpen = open === a._id;
                  return (
                    <Fragment key={a._id}>
                      <tr role={hasDetail ? 'button' : undefined} onClick={() => hasDetail && setOpen(isOpen ? null : a._id)}>
                        <td>{hasDetail && (isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />)}</td>
                        <td className="small text-nowrap">{formatDateTime(a.timestamp)}</td>
                        <td className="small">{a.userName}<div className="text-secondary text-capitalize">{a.role}</div></td>
                        <td>{a.action}</td>
                        <td className="small"><span className="text-secondary">{a.entityType}</span><div className="font-monospace">{a.entityRef}</div></td>
                        <td className="small text-secondary text-truncate" style={{ maxWidth: 200 }} title={a.userAgent}>{a.ip}<div className="text-truncate">{a.userAgent}</div></td>
                      </tr>
                      {isOpen && (
                        <tr className="table-light"><td /><td colSpan={5}>
                          <div className="row small">
                            <div className="col-md-6"><div className="fw-semibold text-secondary">Previous value</div>{a.previousData ? <ChangeList data={a.previousData} /> : <span className="text-secondary">—</span>}</div>
                            <div className="col-md-6"><div className="fw-semibold text-secondary">New value</div>{a.newData ? <ChangeList data={a.newData} /> : <span className="text-secondary">—</span>}</div>
                          </div>
                        </td></tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {data && <Pagination page={data.page} pages={data.pages} total={data.total} onChange={setPage} />}
    </div>
  );
}
