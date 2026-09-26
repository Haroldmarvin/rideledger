import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import FullPageLoader from './components/FullPageLoader';
import RiderLayout from './layouts/RiderLayout';
// Management screens (and their chart library) load only for admins, keeping the rider app light
const AdminLayout = lazy(() => import('./layouts/AdminLayout'));
import Login from './pages/Login';
import NotFound from './pages/NotFound';
import RiderHome from './pages/rider/Home';
import RiderExpenses from './pages/rider/Expenses';
import RiderSummary from './pages/rider/Summary';
import Deliveries from './pages/shared/Deliveries';
import DeliveryForm from './pages/shared/DeliveryForm';
import DeliveryDetail from './pages/shared/DeliveryDetail';
import Profile from './pages/shared/Profile';
const AdminDashboard = lazy(() => import('./pages/admin/Dashboard'));
const Riders = lazy(() => import('./pages/admin/Riders'));
const RiderDetail = lazy(() => import('./pages/admin/RiderDetail'));
const Bikes = lazy(() => import('./pages/admin/Bikes'));
const AdminExpenses = lazy(() => import('./pages/admin/Expenses'));
const Reconciliation = lazy(() => import('./pages/admin/Reconciliation'));
const Reports = lazy(() => import('./pages/admin/Reports'));
const Fees = lazy(() => import('./pages/admin/Fees'));
const AuditLogs = lazy(() => import('./pages/admin/AuditLogs'));
const Settings = lazy(() => import('./pages/admin/Settings'));

function HomeRedirect() {
  const { user, booting } = useAuth();
  if (booting) return <FullPageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.role === 'admin' ? '/admin' : '/rider'} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeRedirect />} />
      <Route path="/login" element={<Login />} />

      <Route path="/rider" element={<ProtectedRoute role="rider"><RiderLayout /></ProtectedRoute>}>
        <Route index element={<RiderHome />} />
        <Route path="deliveries" element={<Deliveries />} />
        <Route path="deliveries/new" element={<DeliveryForm key="new" />} />
        <Route path="deliveries/:id" element={<DeliveryDetail />} />
        <Route path="deliveries/:id/edit" element={<DeliveryForm key="edit" mode="edit" />} />
        <Route path="expenses" element={<RiderExpenses />} />
        <Route path="summary" element={<RiderSummary />} />
        <Route path="profile" element={<Profile />} />
      </Route>

      <Route path="/admin" element={<ProtectedRoute role="admin"><Suspense fallback={<FullPageLoader />}><AdminLayout /></Suspense></ProtectedRoute>}>
        <Route index element={<AdminDashboard />} />
        <Route path="deliveries" element={<Deliveries />} />
        <Route path="deliveries/new" element={<DeliveryForm key="new" />} />
        <Route path="deliveries/:id" element={<DeliveryDetail />} />
        <Route path="deliveries/:id/edit" element={<DeliveryForm key="edit" mode="edit" />} />
        <Route path="riders" element={<Riders />} />
        <Route path="riders/:id" element={<RiderDetail />} />
        <Route path="bikes" element={<Bikes />} />
        <Route path="expenses" element={<AdminExpenses />} />
        <Route path="reconciliation" element={<Reconciliation />} />
        <Route path="reports" element={<Reports />} />
        <Route path="fees" element={<Fees />} />
        <Route path="audit" element={<AuditLogs />} />
        <Route path="settings" element={<Settings />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
