import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import Logo from '../components/Logo';
import LoadingButton from '../components/LoadingButton';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { user, login, notice, setNotice } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ identifier: '', password: '' });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (user) return <Navigate to={user.role === 'admin' ? '/admin' : '/rider'} replace />;

  const submit = async (e) => {
    e.preventDefault();
    if (!form.identifier.trim() || !form.password) { setError('Please enter your email/username and password.'); return; }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const u = await login(form.identifier.trim(), form.password);
      const from = location.state?.from;
      const home = u.role === 'admin' ? '/admin' : '/rider';
      navigate(from && from.startsWith(home) ? from : home, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rl-login min-vh-100 d-flex">
      <div className="rl-login-hero d-none d-lg-flex flex-column justify-content-between p-5">
        <Logo size={150} light tagline stacked />
        <div>
          <h2 className="display-6 fw-bold text-white mb-3">Every delivery recorded.<br />Every dollar accounted for.</h2>
          <p className="text-white-50 mb-0" style={{ maxWidth: 440 }}>Riders log deliveries on their phones as they happen. Management sees collections, expenses and cash handovers in one place — with a full audit trail.</p>
        </div>
        <div className="text-white-50 small">© {new Date().getFullYear()} RideLedger</div>
      </div>
      <div className="flex-grow-1 d-flex align-items-center justify-content-center p-3">
        <div className="w-100" style={{ maxWidth: 400 }}>
          <div className="d-lg-none mb-4 d-flex justify-content-center"><Logo size={130} tagline stacked /></div>
          <div className="card shadow-sm border-0">
            <div className="card-body p-4">
              <h1 className="h4 fw-bold mb-1">Sign in</h1>
              <p className="text-secondary small mb-4">Use your email or username.</p>
              {notice && <div className="alert alert-warning py-2 small">{notice}</div>}
              {error && <div className="alert alert-danger py-2 small" role="alert">{error}</div>}
              <form onSubmit={submit} noValidate>
                <div className="mb-3">
                  <label htmlFor="identifier" className="form-label fw-medium">Email or username</label>
                  <input id="identifier" className="form-control form-control-lg" autoComplete="username" autoCapitalize="none" value={form.identifier} onChange={(e) => setForm({ ...form, identifier: e.target.value })} autoFocus />
                </div>
                <div className="mb-4">
                  <label htmlFor="password" className="form-label fw-medium">Password</label>
                  <div className="input-group input-group-lg">
                    <input id="password" type={show ? 'text' : 'password'} className="form-control" autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                    <button type="button" className="btn btn-outline-secondary" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button>
                  </div>
                </div>
                <LoadingButton type="submit" loading={busy} loadingText="Signing in…" className="btn btn-primary btn-lg w-100 d-flex align-items-center justify-content-center gap-2">
                  <LogIn size={18} /> Sign in
                </LoadingButton>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
