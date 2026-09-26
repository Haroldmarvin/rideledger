export default function LoadingButton({ loading, children, className = 'btn btn-primary', loadingText, disabled, type = 'button', ...rest }) {
  return (
    <button type={type} className={className} disabled={loading || disabled} aria-busy={loading || undefined} {...rest}>
      {loading && <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />}
      {loading && loadingText ? loadingText : children}
    </button>
  );
}
