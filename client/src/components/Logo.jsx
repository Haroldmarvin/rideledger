/**
 * Brand mark: the Afri Kapital Kitchen emblem on a navy tile, with the RideLedger name.
 * The image lives in /public/brand so it is cached by the PWA service worker.
 *
 * size     emblem size in px
 * stacked  emblem on top, name centred underneath (for sidebars / narrow screens)
 * light    white text for dark backgrounds
 * tagline  show "Track Every Ride. Account for Every Delivery."
 */
export default function Logo({ size = 32, showText = true, light = false, tagline = false, stacked = false }) {
  const textSize = Math.min(Math.max(size * (stacked ? 0.26 : 0.4), 18), 30);
  return (
    <div className={stacked ? 'd-flex flex-column align-items-center text-center gap-2' : 'd-flex align-items-center gap-2'}>
      <img
        src="/brand/logo-tile.png"
        width={size}
        height={size}
        alt="Afri Kapital Kitchen"
        className="rl-logo-img flex-shrink-0"
        style={{ borderRadius: Math.round(size * 0.18), boxShadow: light ? '0 0 0 1px rgba(255,255,255,.25)' : '0 2px 8px rgba(16,24,40,.25)' }}
      />
      {showText && (
        <div className="lh-1 min-w-0">
          <div className={`fw-bold ${light ? 'text-white' : 'text-body'}`} style={{ fontSize: textSize, letterSpacing: '-0.02em' }}>RideLedger</div>
          {tagline && <div className={`small mt-1 ${light ? 'text-white-50' : 'text-secondary'}`}>Track Every Ride. Account for Every Delivery.</div>}
        </div>
      )}
    </div>
  );
}
