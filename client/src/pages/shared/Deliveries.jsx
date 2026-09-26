import { useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { Plus, PackageOpen, RotateCw, Trash2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useConfig } from '../../context/ConfigContext';
import { useApi } from '../../hooks/useApi';
import { useLookups } from '../../hooks/useLookups';
import { offlineQueue } from '../../services/offlineQueue';
import FilterBar, { toParams } from '../../components/FilterBar';
import DeliveryCard from '../../components/DeliveryCard';
import DeliveryTable from '../../components/DeliveryTable';
import EmptyState from '../../components/EmptyState';
import ErrorAlert from '../../components/ErrorAlert';
import Pagination from '../../components/Pagination';
import PageHeader from '../../components/PageHeader';
import Money from '../../components/Money';
import { CardSkeleton, TableSkeleton } from '../../components/Skeleton';
import { presetRange, relativeDay } from '../../utils/format';

export default function Deliveries() {
  const { user, isAdmin } = useAuth();
  const { today } = useConfig();
  const outlet = useOutletContext() || {};
  const queue = outlet.queue;
  const [filters, setFilters] = useState(() => (isAdmin ? { preset: '7d', ...presetRange('7d', today) } : { preset: 'all', from: '', to: '' }));
  const [page, setPage] = useState(1);
  const { riders, bikes } = useLookups({ riders: isAdmin, bikes: isAdmin });
  const params = { ...toParams(filters), page, limit: isAdmin ? 50 : 30 };
  const { data, loading, error, reload } = useApi('/deliveries', params);
  const base = isAdmin ? '/admin/deliveries' : '/rider/deliveries';
  const s = data?.summary;

  const onFilters = (f) => { setFilters(f); setPage(1); };

  // Group rider cards by day for readability
  const groups = [];
  if (!isAdmin && data) {
    for (const d of data.items) {
      const last = groups[groups.length - 1];
      if (last && last.date === d.date) last.items.push(d); else groups.push({ date: d.date, items: [d] });
    }
  }

  return (
    <div className={isAdmin ? '' : 'container-narrow'}>
      <PageHeader
        title={isAdmin ? 'Deliveries' : 'My Deliveries'}
        subtitle={isAdmin ? 'All riders · filter, search and open any record' : 'Only your own deliveries are shown'}
        actions={isAdmin && <Link to="/admin/deliveries/new" className="btn btn-primary d-flex align-items-center gap-1"><Plus size={16} /> Record delivery</Link>}
      />
      <FilterBar value={filters} onChange={onFilters} riders={riders} bikes={bikes} show={{ rider: isAdmin, bike: isAdmin, allDates: true }} />

      {s && (
        <div className="rl-summary-strip mb-3">
          <div><span>Deliveries</span><strong>{s.deliveries}</strong></div>
          <div><span>Fees</span><strong><Money cents={s.totalFees} /></strong></div>
          <div><span>Collected</span><strong className="text-success"><Money cents={s.totalCollected} /></strong></div>
          {s.extraCollected > 0 && <div><span>Extra (order money)</span><strong className="text-info-emphasis"><Money cents={s.extraCollected} /></strong></div>}
          <div><span>Outstanding</span><strong className="text-warning-emphasis"><Money cents={s.outstanding} /></strong></div>
        </div>
      )}

      <ErrorAlert error={error} onRetry={reload} />

      {!isAdmin && queue && queue.items.length > 0 && (
        <div className="mb-3">
          <div className="small fw-semibold text-secondary mb-1">Saved on this phone — not yet on the server</div>
          {queue.items.map((q) => (
            <div key={q.clientRef}>
              <DeliveryCard d={q.payload} pending={q} />
              {q.status === 'error' && (
                <div className="d-flex gap-2 mb-3 mt-n1">
                  <button type="button" className="btn btn-sm btn-outline-primary d-flex align-items-center gap-1" onClick={() => { offlineQueue.retry(user._id, q.clientRef); queue.sync(); }}><RotateCw size={14} /> Try again</button>
                  <button type="button" className="btn btn-sm btn-outline-danger d-flex align-items-center gap-1" onClick={() => { if (window.confirm('Remove this unsynced delivery from your phone? It was never saved on the server.')) offlineQueue.remove(user._id, q.clientRef); }}><Trash2 size={14} /> Discard</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {loading && !data && (isAdmin ? <div className="card"><TableSkeleton /></div> : <><CardSkeleton /><CardSkeleton /><CardSkeleton /></>)}

      {data && data.items.length === 0 && (
        <div className="card">
          <EmptyState icon={PackageOpen} title={filters.preset === 'today' ? 'No deliveries recorded today.' : 'No deliveries found.'} message="Try a different date range or clear the filters."
            action={!isAdmin && <Link to="/rider/deliveries/new" className="btn btn-primary">Record a delivery</Link>} />
        </div>
      )}

      {data && data.items.length > 0 && (isAdmin ? (
        <>
          <div className="card d-none d-md-block"><div className={loading ? 'opacity-50' : ''}><DeliveryTable items={data.items} basePath={base} /></div></div>
          <div className="d-md-none">{data.items.map((d) => <DeliveryCard key={d._id} d={d} to={`${base}/${d._id}`} showRider />)}</div>
        </>
      ) : (
        <div className={loading ? 'opacity-50' : ''}>
          {groups.map((g) => (
            <div key={g.date}>
              <div className="small fw-semibold text-secondary mt-3 mb-1">{relativeDay(g.date, today)}</div>
              {g.items.map((d) => <DeliveryCard key={d._id} d={d} to={`${base}/${d._id}`} />)}
            </div>
          ))}
        </div>
      ))}
      {data && <Pagination page={data.page} pages={data.pages} total={data.total} onChange={setPage} />}
    </div>
  );
}
