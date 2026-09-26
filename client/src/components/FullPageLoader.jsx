import Logo from './Logo';

export default function FullPageLoader({ label = 'Loading RideLedger…' }) {
  return (
    <div className="min-vh-100 d-flex flex-column align-items-center justify-content-center gap-3">
      <Logo size={120} stacked />
      <div className="spinner-border text-primary" role="status" aria-label={label} />
    </div>
  );
}
