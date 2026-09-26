import { STATUS_TONE, PAYMENT_TONE } from '../utils/constants';

export function StatusBadge({ status, className = '' }) {
  if (!status) return null;
  const tone = STATUS_TONE[status] || 'secondary';
  return <span className={`badge rl-badge rl-badge-${tone} ${className}`}>{status}</span>;
}

export function PaymentBadge({ method }) {
  if (!method) return null;
  return <span className={`badge rl-badge rl-badge-outline-${PAYMENT_TONE[method] || 'secondary'}`}>{method}</span>;
}

export function CloseoutBadge({ status }) {
  if (!status) return null;
  const map = { Submitted: ['warning', 'Awaiting confirmation'], Confirmed: ['success', 'Closed'], Returned: ['secondary', 'Returned to rider'] };
  const [tone, label] = map[status] || ['secondary', status];
  return <span className={`badge rl-badge rl-badge-${tone}`}>{label}</span>;
}

export function DifferenceBadge({ difference }) {
  if (difference === undefined || difference === null) return null;
  if (difference === 0) return <span className="badge rl-badge rl-badge-success">Exact match</span>;
  return difference < 0 ? <span className="badge rl-badge rl-badge-danger">Short</span> : <span className="badge rl-badge rl-badge-warning">Over</span>;
}
