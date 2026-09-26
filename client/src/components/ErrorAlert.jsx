import { AlertTriangle, WifiOff, RotateCw } from 'lucide-react';

export default function ErrorAlert({ error, onRetry, className = '' }) {
  if (!error) return null;
  const message = typeof error === 'string' ? error : error.message;
  const Icon = error.isNetwork ? WifiOff : AlertTriangle;
  return (
    <div className={`alert alert-danger d-flex align-items-start gap-2 ${className}`} role="alert">
      <Icon size={18} className="flex-shrink-0 mt-1" />
      <div className="flex-grow-1">{message}</div>
      {onRetry && (
        <button type="button" className="btn btn-sm btn-outline-danger d-flex align-items-center gap-1" onClick={() => onRetry()}>
          <RotateCw size={14} /> Retry
        </button>
      )}
    </div>
  );
}
