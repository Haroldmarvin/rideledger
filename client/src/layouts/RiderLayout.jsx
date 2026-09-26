import { NavLink, Outlet, Link, useLocation } from 'react-router-dom';
import { Home, List, Plus, Receipt, Wallet, UserCircle2, Wifi, WifiOff } from 'lucide-react';
import Logo from '../components/Logo';
import SyncBanner from '../components/SyncBanner';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useSyncQueue } from '../hooks/useSyncQueue';
import { useCallback } from 'react';

const NAV = [
  { to: '/rider', label: 'Home', icon: Home, end: true },
  { to: '/rider/deliveries', label: 'Deliveries', icon: List, end: true },
  { to: '/rider/deliveries/new', label: 'New', icon: Plus, fab: true },
  { to: '/rider/expenses', label: 'Expenses', icon: Receipt },
  { to: '/rider/summary', label: 'Summary', icon: Wallet },
];

export default function RiderLayout() {
  const { user } = useAuth();
  const toast = useToast();
  const location = useLocation();
  const onSynced = useCallback((r) => toast.success(`${r.synced} saved ${r.synced === 1 ? 'delivery' : 'deliveries'} synced to the server.`), [toast]);
  const queue = useSyncQueue(user?._id, { auto: true, onSynced });
  const hideNav = location.pathname.endsWith('/new') || location.pathname.endsWith('/edit');

  return (
    <div className="rl-rider-shell">
      <header className="rl-rider-top">
        <Link to="/rider" className="text-decoration-none"><Logo size={46} light /></Link>
        <div className="d-flex align-items-center gap-3">
          <span className={`d-flex align-items-center gap-1 small ${queue.online ? 'text-white-50' : 'text-warning'}`} title={queue.online ? 'Online' : 'Offline'}>
            {queue.online ? <Wifi size={16} /> : <WifiOff size={16} />}
            <span className="d-none d-sm-inline">{queue.online ? 'Online' : 'Offline'}</span>
          </span>
          <NavLink to="/rider/profile" className="text-white" aria-label="Profile"><UserCircle2 size={28} /></NavLink>
        </div>
      </header>
      <SyncBanner online={queue.online} pending={queue.pending} failed={queue.failed} syncing={queue.syncing} onSync={queue.sync} />
      <main className={`rl-rider-main ${hideNav ? 'pb-4' : ''}`}>
        <Outlet context={{ queue }} />
      </main>
      {!hideNav && (
        <nav className="rl-bottom-nav" aria-label="Main">
          {NAV.map(({ to, label, icon: Icon, end, fab }) => (
            <NavLink key={to} to={to} end={end} aria-label={fab ? 'New Delivery' : label} className={({ isActive }) => `rl-bottom-item ${fab ? 'rl-bottom-fab' : ''} ${isActive ? 'active' : ''}`}>
              <span className="rl-bottom-icon"><Icon size={fab ? 28 : 22} strokeWidth={fab ? 2.6 : 2} /></span>
              <span className="rl-bottom-label">{label}</span>
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  );
}
