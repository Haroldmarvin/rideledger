import { CloudOff, RefreshCw, WifiOff, AlertTriangle } from 'lucide-react';

/** Shows offline state and deliveries saved locally that have not reached the server yet. */
export default function SyncBanner({ online, pending, failed, syncing, onSync }) {
  if (online && !pending.length && !failed.length) return null;
  return (
    <div className="rl-sync-banner">
      {!online && (
        <div className="d-flex align-items-center gap-2 text-warning-emphasis">
          <WifiOff size={16} /> <span className="fw-semibold">You are offline.</span>
          <span className="small">New deliveries will be saved on this phone.</span>
        </div>
      )}
      {pending.length > 0 && (
        <div className="d-flex align-items-center gap-2 mt-1">
          <CloudOff size={16} className="text-warning-emphasis" />
          <span className="small flex-grow-1"><strong>{pending.length}</strong> {pending.length === 1 ? 'delivery' : 'deliveries'} saved locally — waiting for connection (Pending Sync)</span>
          <button type="button" className="btn btn-sm btn-outline-secondary d-flex align-items-center gap-1" onClick={onSync} disabled={syncing || !online}>
            <RefreshCw size={14} className={syncing ? 'rl-spin' : ''} /> {syncing ? 'Syncing' : 'Sync now'}
          </button>
        </div>
      )}
      {failed.length > 0 && (
        <div className="d-flex align-items-center gap-2 mt-1 text-danger small">
          <AlertTriangle size={16} /> {failed.length} saved {failed.length === 1 ? 'delivery needs' : 'deliveries need'} attention — see Deliveries.
        </div>
      )}
    </div>
  );
}
