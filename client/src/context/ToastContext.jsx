import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { CheckCircle2, AlertTriangle, Info, XCircle, X } from 'lucide-react';

const ToastContext = createContext(null);
const ICONS = { success: CheckCircle2, danger: XCircle, warning: AlertTriangle, info: Info };

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback((message, tone = 'success', ms = 4000) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t.slice(-3), { id, message, tone }]);
    setTimeout(() => dismiss(id), ms);
  }, [dismiss]);

  const api = useMemo(() => ({
    success: (m) => push(m, 'success'),
    error: (m) => push(m, 'danger', 6000),
    warning: (m) => push(m, 'warning', 6000),
    info: (m) => push(m, 'info'),
  }), [push]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="rl-toasts" aria-live="polite">
        {toasts.map((t) => {
          const Icon = ICONS[t.tone] || Info;
          return (
            <div key={t.id} className={`rl-toast rl-toast-${t.tone}`} role="status">
              <Icon size={18} className="flex-shrink-0" />
              <span className="flex-grow-1">{t.message}</span>
              <button type="button" className="btn btn-link btn-sm p-0 text-reset" onClick={() => dismiss(t.id)} aria-label="Dismiss"><X size={16} /></button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
