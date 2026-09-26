/** Labeled form group with friendly inline error. */
export default function FormField({ label, error, hint, children, required, className = 'mb-3', htmlFor }) {
  return (
    <div className={className}>
      {label && <label className="form-label fw-medium" htmlFor={htmlFor}>{label}{required && <span className="text-danger ms-1">*</span>}</label>}
      {children}
      {error ? <div className="invalid-feedback d-block">{error}</div> : hint ? <div className="form-text">{hint}</div> : null}
    </div>
  );
}
