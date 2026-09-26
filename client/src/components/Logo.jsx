/**
 * Brand mark: the Afri Kapital Kitchen emblem on a navy tile, with the app name.
 * The image lives in /public/brand so it is cached by the PWA service worker.
 *
 * size     emblem size in px
 * stacked  emblem on top, name centred underneath (for sidebars / narrow screens)
 * light    white text for dark backgrounds
 * tagline  show "Track Every Ride. Account for Every Delivery."
 */
import { APP_NAME } from '../utils/constants';

export default function Logo({ size = 32, showText = true, light = false, tagline = false, stacked = false }) {
  const textSize = stacked ? Math.min(Math.max(size * 0.2, 17), 26) : Math.min(Math.max(size * 0.36, 16), 24);
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
        <div className="min-w-0" style={{ lineHeight: 1.15 }}>
          <div className={`fw-bold ${light ? 'text-white' : 'text-body'}`} style={{ fontSize: textSize, letterSpacing: '-0.01em' }}>{APP_NAME}</div>
          {tagline && <div className={`small mt-1 ${light ? 'text-white-50' : 'text-secondary'}`}>Track Every Ride. Account for Every Delivery.</div>}
        </div>
      )}
    </div>
  );
}
