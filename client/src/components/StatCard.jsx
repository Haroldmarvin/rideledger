import Money from './Money';

/** KPI card. Provide `cents` for money values or `value` for counts. */
export default function StatCard({ label, value, cents, icon: Icon, tone = 'primary', hint, loading, compact = false }) {
  return (
    <div className={`rl-stat card h-100 ${compact ? 'rl-stat-compact' : ''}`}>
      <div className="card-body">
        <div className="d-flex align-items-start justify-content-between gap-2">
          <div className="text-secondary rl-stat-label">{label}</div>
          {Icon && <span className={`rl-stat-icon rl-tone-${tone}`}><Icon size={compact ? 16 : 18} /></span>}
        </div>
        {loading ? (
          <div className="rl-skeleton mt-2" style={{ height: compact ? 22 : 28, width: '60%' }} />
        ) : (
          <div className={`rl-stat-value ${tone === 'danger' ? 'text-danger' : ''}`}>
            {cents !== undefined ? <Money cents={cents} /> : value}
          </div>
        )}
        {hint && !loading && <div className="small text-secondary mt-1">{hint}</div>}
      </div>
    </div>
  );
}
