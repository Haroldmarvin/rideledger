import { Suspense, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { LayoutDashboard, List, Users, Bike, Receipt, Scale, FileBarChart, BadgeDollarSign, ScrollText, Settings, LogOut, Menu, X } from 'lucide-react';
import Logo from '../components/Logo';
import { StatGridSkeleton } from '../components/Skeleton';
import { useAuth } from '../context/AuthContext';
import { initials } from '../utils/format';

const NAV = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/deliveries', label: 'Deliveries', icon: List },
  { to: '/admin/riders', label: 'Riders', icon: Users },
  { to: '/admin/bikes', label: 'Bikes', icon: Bike },
  { to: '/admin/expenses', label: 'Expenses', icon: Receipt },
  { to: '/admin/reconciliation', label: 'Reconciliation', icon: Scale },
  { to: '/admin/reports', label: 'Reports', icon: FileBarChart },
  { to: '/admin/fees', label: 'Fees', icon: BadgeDollarSign },
  { to: '/admin/audit', label: 'Audit Logs', icon: ScrollText },
  { to: '/admin/settings', label: 'Settings', icon: Settings },
];

function SideNav({ onNavigate }) {
  const { user, logout } = useAuth();
  return (
    <div className="d-flex flex-column h-100">
      <div className="px-3 py-3 border-bottom border-white border-opacity-10"><Logo size={32} light /></div>
      <nav className="flex-grow-1 py-2 overflow-auto" aria-label="Admin">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} onClick={onNavigate} className={({ isActive }) => `rl-side-link ${isActive ? 'active' : ''}`}>
            <Icon size={18} /> <span>{label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="p-3 border-top border-white border-opacity-10">
        <div className="d-flex align-items-center gap-2 mb-2">
          <span className="rl-avatar">{initials(user?.name)}</span>
          <div className="min-w-0">
            <div className="text-white small fw-semibold text-truncate">{user?.name}</div>
            <div className="text-white-50 small text-truncate">{user?.email}</div>
          </div>
        </div>
        <button type="button" className="btn btn-sm btn-outline-light w-100 d-flex align-items-center justify-content-center gap-2" onClick={() => logout('You have been logged out.')}>
          <LogOut size={15} /> Log out
        </button>
      </div>
    </div>
  );
}

export default function AdminLayout() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => { setOpen(false); }, [location.pathname]);

  return (
    <div className="rl-admin-shell">
      <aside className="rl-sidebar d-none d-lg-block"><SideNav /></aside>
      {open && <div className="rl-offcanvas-backdrop d-lg-none" onClick={() => setOpen(false)} />}
      <aside className={`rl-sidebar rl-sidebar-mobile d-lg-none ${open ? 'show' : ''}`} aria-hidden={!open}>
        <button type="button" className="btn btn-link text-white position-absolute top-0 end-0 m-2" onClick={() => setOpen(false)} aria-label="Close menu"><X size={22} /></button>
        <SideNav onNavigate={() => setOpen(false)} />
      </aside>
      <div className="rl-admin-main">
        <header className="rl-admin-top d-lg-none">
          <button type="button" className="btn btn-link text-white p-1" onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={24} /></button>
          <Logo size={28} light />
          <span style={{ width: 32 }} />
        </header>
        <main className="rl-admin-content">
          <Suspense fallback={<StatGridSkeleton count={4} />}><Outlet /></Suspense>
        </main>
      </div>
    </div>
  );
}
