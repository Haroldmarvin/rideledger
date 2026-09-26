import { useNavigate } from 'react-router-dom';
import { Lock, Flag } from 'lucide-react';
import Money from './Money';
import { StatusBadge, PaymentBadge } from './Badges';
import { formatDate } from '../utils/format';

export default function DeliveryTable({ items, basePath, showRider = true }) {
  const navigate = useNavigate();
  return (
    <div className="table-responsive">
      <table className="table table-hover align-middle mb-0 rl-table">
        <thead>
          <tr>
            <th>Delivery ID</th><th>Date</th>{showRider && <th>Rider</th>}<th>Customer</th><th>Pickup</th><th>Destination</th>
            <th className="text-end">Fee</th><th className="text-end">Collected</th><th className="text-end">Extra</th><th className="text-end">Outstanding</th><th>Payment</th><th>Status</th>
          </tr>
        </thead>
        <tbody>
          {items.map((d) => (
            <tr key={d._id} role="button" tabIndex={0} onClick={() => navigate(`${basePath}/${d._id}`)} onKeyDown={(e) => { if (e.key === 'Enter') navigate(`${basePath}/${d._id}`); }}>
              <td className="font-monospace small text-nowrap">
                {d.deliveryId}
                {d.closedPeriod && <Lock size={12} className="ms-1 text-secondary" aria-label="Closed" />}
                {d.flags?.length > 0 && <Flag size={12} className="ms-1 text-warning" aria-label="Flagged" />}
              </td>
              <td className="text-nowrap small">{formatDate(d.date)} <span className="text-secondary">{d.time}</span></td>
              {showRider && <td className="text-nowrap">{d.rider?.name}</td>}
              <td><div className="text-truncate" style={{ maxWidth: 160 }}>{d.customerName}</div><div className="small text-secondary">{d.customerPhone}</div></td>
              <td className="small"><div className="text-truncate" style={{ maxWidth: 140 }}>{d.pickupLocation}</div></td>
              <td className="small"><div className="text-truncate" style={{ maxWidth: 140 }}>{d.destination}</div></td>
              <td className="text-end"><Money cents={d.deliveryFee} /></td>
              <td className="text-end"><Money cents={d.amountCollected} /></td>
              <td className="text-end">{d.extraCollected > 0 ? <Money cents={d.extraCollected} tone="info-emphasis" /> : <span className="text-secondary">—</span>}</td>
              <td className="text-end">{d.outstandingAmount > 0 ? <Money cents={d.outstandingAmount} tone="warning-emphasis" /> : <span className="text-secondary">—</span>}</td>
              <td><PaymentBadge method={d.paymentMethod} /></td>
              <td><StatusBadge status={d.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
