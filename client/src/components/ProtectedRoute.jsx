import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import FullPageLoader from './FullPageLoader';

export default function ProtectedRoute({ role, children }) {
  const { user, booting } = useAuth();
  const location = useLocation();
  if (booting) return <FullPageLoader />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (role && user.role !== role) return <Navigate to={user.role === 'admin' ? '/admin' : '/rider'} replace />;
  return children;
}
