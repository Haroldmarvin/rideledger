import { Inbox } from 'lucide-react';

export default function EmptyState({ icon: Icon = Inbox, title, message, action }) {
  return (
    <div className="rl-empty text-center py-5 px-3">
      <div className="rl-empty-icon mx-auto mb-3"><Icon size={28} /></div>
      <h6 className="fw-semibold mb-1">{title}</h6>
      {message && <p className="text-secondary small mb-3">{message}</p>}
      {action}
    </div>
  );
}
