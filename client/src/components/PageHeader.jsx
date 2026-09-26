export default function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
      <div>
        <h1 className="h4 fw-bold mb-0">{title}</h1>
        {subtitle && <div className="text-secondary small mt-1">{subtitle}</div>}
      </div>
      {actions && <div className="d-flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
