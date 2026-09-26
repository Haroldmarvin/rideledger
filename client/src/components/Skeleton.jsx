export function Skeleton({ height = 16, width = '100%', className = '' }) {
  return <div className={`rl-skeleton ${className}`} style={{ height, width }} />;
}

export function CardSkeleton({ rows = 3 }) {
  return (
    <div className="card mb-2">
      <div className="card-body">
        <Skeleton height={18} width="45%" className="mb-2" />
        {Array.from({ length: rows }).map((_, i) => <Skeleton key={i} height={12} width={`${85 - i * 15}%`} className="mb-2" />)}
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 6, cols = 6 }) {
  return (
    <div className="p-3">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="d-flex gap-3 mb-3">
          {Array.from({ length: cols }).map((__, c) => <Skeleton key={c} height={14} width={`${100 / cols}%`} />)}
        </div>
      ))}
    </div>
  );
}

export function StatGridSkeleton({ count = 4 }) {
  return (
    <div className="row g-2 g-md-3">
      {Array.from({ length: count }).map((_, i) => (
        <div className="col-6 col-lg-3" key={i}>
          <div className="card"><div className="card-body"><Skeleton height={12} width="50%" className="mb-3" /><Skeleton height={24} width="70%" /></div></div>
        </div>
      ))}
    </div>
  );
}
