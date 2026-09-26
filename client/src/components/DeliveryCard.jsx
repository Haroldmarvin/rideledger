import { Link } from 'react-router-dom';
import { MapPin, Clock, CloudOff, AlertTriangle, Lock } from 'lucide-react';
import Money from './Money';
import { StatusBadge, PaymentBadge } from './Badges';

/** Mobile-friendly delivery card. `pending` renders a local (not yet synced) delivery. */
export default function DeliveryCard({ d, to, showRider = false, pending = null }) {
  const body = (
    <div className={`card rl-delivery-card mb-2 ${pending ? 'rl-card-pending' : ''}`}>
      <div className="card-body py-3">
        <div className="d-flex justify-content-between align-items-start gap-2">
          <div className="min-w-0">
            <div className="fw-semibold text-truncate">{d.customerName}</div>
            <div className="small text-secondary d-flex align-items-center gap-1">
              {pending ? (
                pending.status === 'error'
                  ? <span className="text-danger d-flex align-items-center gap-1"><AlertTriangle size={13} /> Needs attention</span>
                  : <span className="text-warning-emphasis d-flex align-items-center gap-1"><CloudOff size={13} /> Pending Sync</span>
              ) : (
                <>
                  <span className="font-monospace">{d.deliveryId}</span>
                  {d.closedPeriod && <Lock size={12} className="ms-1" aria-label="Closed period" />}
                </>
              )}
            </div>
          </div>
          <div className="text-end flex-shrink-0">
            <div className="fw-bold"><Money cents={d.deliveryFee} /></div>
            <StatusBadge status={d.status} />
          </div>
        </div>
        <div className="small text-secondary mt-2 d-flex align-items-center gap-1 text-truncate">
          <MapPin size={13} className="flex-shrink-0" /> <span className="text-truncate">{d.pickupLocation} → {d.destination}</span>
        </div>
        <div className="d-flex justify-content-between align-items-center mt-2 small">
          <span className="d-flex align-items-center gap-1 text-secondary">
            <Clock size={13} /> {d.time || (pending ? new Date(pending.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '')} {showRider && d.rider?.name ? `· ${d.rider.name}` : ''}
          </span>
          <span className="d-flex align-items-center gap-2">
            <PaymentBadge method={d.paymentMethod} />
            {d.outstandingAmount > 0 && <span className="text-warning-emphasis fw-semibold">Owes <Money cents={d.outstandingAmount} /></span>}
            {d.extraCollected > 0 && <span className="text-info-emphasis fw-semibold">+<Money cents={d.extraCollected} /> extra</span>}
          </span>
        </div>
        {pending?.error && <div className="small text-danger mt-2">{pending.error}</div>}
      </div>
    </div>
  );
  return to ? <Link to={to} className="text-reset text-decoration-none d-block">{body}</Link> : body;
}
