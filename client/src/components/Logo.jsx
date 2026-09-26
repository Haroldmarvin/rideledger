export default function Logo({ size = 32, showText = true, light = false, tagline = false }) {
  return (
    <div className="d-flex align-items-center gap-2">
      <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
        <rect width="64" height="64" rx="14" fill={light ? '#FFFFFF' : '#0F4C81'} />
        <g fill="none" stroke={light ? '#0F4C81' : '#FFFFFF'} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="19" cy="40" r="9" />
          <circle cx="45" cy="40" r="9" />
          <path d="M19 40 L30 26 L45 40" />
        </g>
        <path d="M30 26 L37 20" stroke="#FFC107" strokeWidth="4" strokeLinecap="round" />
      </svg>
      {showText && (
        <div className="lh-1">
          <div className={`fw-bold ${light ? 'text-white' : 'text-body'}`} style={{ fontSize: size * 0.56, letterSpacing: '-0.02em' }}>RideLedger</div>
          {tagline && <div className={`small mt-1 ${light ? 'text-white-50' : 'text-secondary'}`}>Track Every Ride. Account for Every Delivery.</div>}
        </div>
      )}
    </div>
  );
}
