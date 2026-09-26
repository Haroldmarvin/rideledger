import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/** Lightweight accessible modal (no Bootstrap JS needed). */
export default function Modal({ show, title, onClose, children, footer, size = '', fullscreenMobile = true }) {
  useEffect(() => {
    if (!show) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    document.body.classList.add('rl-modal-open');
    return () => { document.removeEventListener('keydown', onKey); document.body.classList.remove('rl-modal-open'); };
  }, [show, onClose]);
  if (!show) return null;
  return createPortal(
    <div className="rl-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className={`modal-dialog modal-dialog-centered modal-dialog-scrollable ${size ? `modal-${size}` : ''} ${fullscreenMobile ? 'modal-fullscreen-sm-down' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title fw-semibold">{title}</h5>
            <button type="button" className="btn btn-link text-secondary p-1" onClick={onClose} aria-label="Close"><X size={20} /></button>
          </div>
          <div className="modal-body">{children}</div>
          {footer && <div className="modal-footer">{footer}</div>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
