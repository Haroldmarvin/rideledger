import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import EmptyState from '../components/EmptyState';
import { Compass } from 'lucide-react';

export default function NotFound() {
  const { user } = useAuth();
  const home = user ? (user.role === 'admin' ? '/admin' : '/rider') : '/login';
  return (
    <div className="container py-5">
      <EmptyState icon={Compass} title="Page not found" message="The page you are looking for does not exist." action={<Link to={home} className="btn btn-primary">Go home</Link>} />
    </div>
  );
}
