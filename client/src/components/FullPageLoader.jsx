import Logo from './Logo';
import { APP_NAME } from '../utils/constants';

export default function FullPageLoader({ label = `Loading ${APP_NAME}…` }) {
  return (
    <div className="min-vh-100 d-flex flex-column align-items-center justify-content-center gap-3">
      <Logo size={120} stacked />
      <div className="spinner-border text-primary" role="status" aria-label={label} />
    </div>
  );
}
