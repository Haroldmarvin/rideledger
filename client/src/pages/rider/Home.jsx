import { Link, useOutletContext } from 'react-router-dom';
import { Plus, RefreshCw, Receipt, Wallet, Lock, Clock3, Truck, CheckCircle2, XCircle, Undo2, Ban } from 'lucide-react';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../context/AuthContext';
import { useConfig } from '../../context/ConfigContext';
import Money from '../../components/Money';
import DeliveryCard from '../../components/DeliveryCard';
import EmptyState from '../../components/EmptyState';
import ErrorAlert from '../../components/ErrorAlert';
import { Skeleton } from '../../components/Skeleton';
import { formatDate } from '../../utils/format';

function Tile({ label, children, tone = '', big = false, loading }) {
  return (
    <div className={`rl-tile ${tone ? `rl-tile-${tone}` : ''} ${big ? 'rl-tile-big' : ''}`}>
      <div className="rl-tile-label">{label}</div>
      <div className="rl-tile-value">{loading ? <Skeleton height={big ? 30 : 22} width="70%" /> : children}</div>
    </div>
  );
}

export default function RiderHome() {
  const { user } = useAuth();
  const { money } = useConfig();
  const { queue } = useOutletContext();
  const { data, loading, error, reload } = useApi('/dashboard/rider');
  const s = data?.summary;
  const firstName = (user?.name || '').split(' ')[0];
  const closed = data?.closeout && ['Submitted', 'Confirmed'].includes(data.closeout.status);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div>
      <div className="d-flex align-items-center justify-content-between mb-3">
        <div>
          <div className="text-secondary small">{greeting},</div>
          <h1 className="h4 fw-bold mb-0">{firstName}</h1>
          <div className="small text-secondary">
            {data ? formatDate(data.date, { weekday: 'long', day: 'numeric', month: 'long' }) : ' '}
            {data?.rider?.bike && <> · Bike <strong>{data.rider.bike.bikeId}</strong></>}
          </div>
        </div>
        <button type="button" className="btn btn-light rl-icon-btn" onClick={() => reload()} aria-label="Refresh" disabled={loading}>
          <RefreshCw size={18} className={loading ? 'rl-spin' : ''} />
        </button>
      </div>

      <ErrorAlert error={error} onRetry={reload} />

      {closed ? (
        <div className={`alert ${data.closeout.status === 'Confirmed' ? 'alert-success' : 'alert-warning'} d-flex gap-2 align-items-start`}>
          {data.closeout.status === 'Confirmed' ? <Lock size={18} className="mt-1" /> : <Clock3 size={18} className="mt-1" />}
          <div>
            <div className="fw-semibold">{data.closeout.status === 'Confirmed' ? 'Today is closed' : 'Handover submitted'}</div>
            <div className="small">{data.closeout.status === 'Confirmed' ? 'Management confirmed your handover. Records for today are locked.' : 'Waiting for management to confirm. Today\'s records are locked.'}</div>
          </div>
        </div>
      ) : (
        <Link to="/rider/deliveries/new" className="btn btn-primary btn-lg w-100 rl-cta mb-3 d-flex align-items-center justify-content-center gap-2">
          <Plus size={24} strokeWidth={2.6} /> Record New Delivery
        </Link>
      )}

      <div className="card mb-3">
        <div className="card-body">
          <div className="d-flex justify-content-between align-items-center mb-2">
            <h2 className="h6 fw-bold mb-0 text-uppercase text-secondary rl-kicker">Today</h2>
            {data?.pendingExpenses > 0 && <span className="badge rl-badge rl-badge-warning">{data.pendingExpenses} expense{data.pendingExpenses > 1 ? 's' : ''} pending</span>}
          </div>
          <div className="rl-count-row mb-3">
            <div><Truck size={16} /><strong>{loading ? '–' : s?.deliveries ?? 0}</strong><span>Total</span></div>
            <div className="text-success"><CheckCircle2 size={16} /><strong>{loading ? '–' : s?.delivered ?? 0}</strong><span>Delivered</span></div>
            <div className="text-danger"><XCircle size={16} /><strong>{loading ? '–' : s?.failed ?? 0}</strong><span>Failed</span></div>
            <div className="text-warning-emphasis"><Undo2 size={16} /><strong>{loading ? '–' : s?.returned ?? 0}</strong><span>Returned</span></div>
            <div className="text-secondary"><Ban size={16} /><strong>{loading ? '–' : s?.cancelled ?? 0}</strong><span>Cancelled</span></div>
          </div>
          <div className="rl-tiles">
            <Tile label="Total Fees" loading={loading}><Money cents={s?.totalFees || 0} /></Tile>
            <Tile label="Collected" tone="success" loading={loading}><Money cents={s?.totalCollected || 0} /></Tile>
            <Tile label="Outstanding" tone="warning" loading={loading}><Money cents={s?.outstanding || 0} /></Tile>
            <Tile label="Approved Expenses" loading={loading}><Money cents={s?.approvedExpenses || 0} /></Tile>
          </div>
          <div className="rl-handover mt-3">
            <div>
              <div className="rl-tile-label text-white-50">Expected Cash Handover</div>
              <div className="small text-white-50">Cash {money(s?.cashCollected || 0)} − approved expenses {money(s?.approvedExpenses || 0)}</div>
            </div>
            <div className="rl-handover-value">{loading ? <Skeleton height={30} width={90} /> : <Money cents={s?.expectedHandover || 0} />}</div>
          </div>
          {!loading && s && (s.mobileMoneyCollected > 0 || s.bankCollected > 0) && (
            <div className="small text-secondary mt-2">Electronic payments (not in cash handover): Mobile Money {money(s.mobileMoneyCollected)} · Bank {money(s.bankCollected)}</div>
          )}
        </div>
      </div>

      <div className="row g-2 mb-3">
        <div className="col-6"><Link to="/rider/expenses?new=1" className="btn btn-outline-primary w-100 py-3 d-flex flex-column align-items-center gap-1"><Receipt size={22} />Add Expense</Link></div>
        <div className="col-6"><Link to="/rider/summary" className="btn btn-outline-primary w-100 py-3 d-flex flex-column align-items-center gap-1"><Wallet size={22} />End of Day</Link></div>
      </div>

      <div className="d-flex justify-content-between align-items-center mb-2">
        <h2 className="h6 fw-bold mb-0">Recent deliveries</h2>
        <Link to="/rider/deliveries" className="small">View all</Link>
      </div>
      {queue.items.map((q) => <DeliveryCard key={q.clientRef} d={q.payload} pending={q} />)}
      {loading && !data ? <><Skeleton height={80} className="mb-2" /><Skeleton height={80} /></> : null}
      {data && !data.recent.length && !queue.items.length && (
        <div className="card"><EmptyState title="No deliveries recorded today." message="Tap the button above after each delivery." action={!closed && <Link to="/rider/deliveries/new" className="btn btn-primary">Record a delivery</Link>} /></div>
      )}
      {data?.recent.map((d) => <DeliveryCard key={d._id} d={d} to={`/rider/deliveries/${d._id}`} />)}
    </div>
  );
}
