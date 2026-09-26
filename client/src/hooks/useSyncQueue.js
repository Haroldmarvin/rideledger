import { useCallback, useEffect, useState } from 'react';
import { offlineQueue, syncQueue } from '../services/offlineQueue';
import { useOnlineStatus } from './useOnlineStatus';

/** Live view of the offline delivery queue + automatic background sync. */
export function useSyncQueue(userId, { auto = false, onSynced } = {}) {
  const [items, setItems] = useState(() => (userId ? offlineQueue.list(userId) : []));
  const [syncing, setSyncing] = useState(false);
  const online = useOnlineStatus();

  useEffect(() => {
    const refresh = () => setItems(userId ? offlineQueue.list(userId) : []);
    refresh();
    window.addEventListener(offlineQueue.EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => { window.removeEventListener(offlineQueue.EVENT, refresh); window.removeEventListener('storage', refresh); };
  }, [userId]);

  const sync = useCallback(async () => {
    if (!userId) return null;
    setSyncing(true);
    try {
      const r = await syncQueue(userId);
      if (r.synced && onSynced) onSynced(r);
      return r;
    } finally {
      setSyncing(false);
    }
  }, [userId, onSynced]);

  useEffect(() => {
    if (!auto || !userId) return undefined;
    if (online) sync();
    const t = setInterval(() => { if (navigator.onLine) sync(); }, 30000);
    return () => clearInterval(t);
  }, [auto, online, userId, sync]);

  const pending = items.filter((i) => i.status === 'pending');
  const failed = items.filter((i) => i.status === 'error');
  return { items, pending, failed, syncing, sync, online };
}
