import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function Pagination({ page, pages, total, onChange }) {
  if (!pages || pages <= 1) return total ? <div className="small text-secondary py-2">{total} record{total === 1 ? '' : 's'}</div> : null;
  return (
    <div className="d-flex align-items-center justify-content-between py-2 gap-2">
      <div className="small text-secondary">{total} records · page {page} of {pages}</div>
      <div className="btn-group">
        <button type="button" className="btn btn-outline-secondary btn-sm" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Previous page"><ChevronLeft size={16} /></button>
        <button type="button" className="btn btn-outline-secondary btn-sm" disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="Next page"><ChevronRight size={16} /></button>
      </div>
    </div>
  );
}
