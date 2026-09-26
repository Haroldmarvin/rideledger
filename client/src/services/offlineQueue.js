/**
 * Offline / low-connectivity support for deliveries.
 *
 * - Deliveries that cannot reach the server are saved locally ("Saved Locally — Waiting for Connection").
 * - Each has a clientRef (idempotency key). The server never creates two deliveries for one clientRef,
 *   so re-sending after a timeout or reconnect is always safe.
 * - Items are removed ONLY after the server confirms. Items the server rejects (e.g. validation,
 *   closed day) stay visible as "Needs attention" — nothing is silently dropped or faked as synced.
 */
import api from './api';

const EVENT = 'rl-queue-changed';
const key = (userId) => `rl_offline_queue_${userId}`;
const draftKey = (userId) => `rl_delivery_draft_${userId}`;

function read(userId) {
  try { return JSON.parse(localStorage.getItem(key(userId)) || '[]'); } catch { return []; }
}
function write(userId, items) {
  try { localStorage.setItem(key(userId), JSON.stringify(items)); } catch { /* storage full/unavailable */ }
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function newClientRef() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export const offlineQueue = {
  EVENT,
  list: (userId) => read(userId),
  add(userId, payload) {
    const items = read(userId);
    items.push({ clientRef: payload.clientRef, payload, savedAt: new Date().toISOString(), status: 'pending', attempts: 0, error: null });
    write(userId, items);
  },
  remove(userId, clientRef) { write(userId, read(userId).filter((i) => i.clientRef !== clientRef)); },
  update(userId, clientRef, patch) { write(userId, read(userId).map((i) => (i.clientRef === clientRef ? { ...i, ...patch } : i))); },
  retry(userId, clientRef) { this.update(userId, clientRef, { status: 'pending', error: null }); },
};

let syncing = false;
/** Try to send every pending delivery. Returns { synced, failed, remaining }. */
export async function syncQueue(userId) {
  if (!userId || syncing) return { synced: 0, failed: 0, remaining: read(userId).length };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { synced: 0, failed: 0, remaining: read(userId).length };
  syncing = true;
  let synced = 0;
  let failed = 0;
  try {
    for (const item of read(userId)) {
      if (item.status !== 'pending') continue;
      try {
        await api.post('/deliveries', item.payload);
        offlineQueue.remove(userId, item.clientRef);
        synced += 1;
      } catch (err) {
        if (err.isNetwork || err.status >= 500 || err.status === 429) break; // still offline — try again later
        offlineQueue.update(userId, item.clientRef, { status: 'error', error: err.message, fieldErrors: err.fieldErrors, attempts: (item.attempts || 0) + 1 });
        failed += 1;
      }
    }
  } finally {
    syncing = false;
  }
  return { synced, failed, remaining: read(userId).length };
}

export const drafts = {
  load(userId) { try { return JSON.parse(localStorage.getItem(draftKey(userId)) || 'null'); } catch { return null; } },
  save(userId, data) { try { localStorage.setItem(draftKey(userId), JSON.stringify({ ...data, savedAt: new Date().toISOString() })); } catch { /* ignore */ } },
  clear(userId) { try { localStorage.removeItem(draftKey(userId)); } catch { /* ignore */ } },
};
