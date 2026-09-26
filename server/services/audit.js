const { AuditLog } = require('../models');

const SENSITIVE = new Set(['passwordHash', 'password', 'tokenVersion', '__v']);

function clean(data) {
  if (data === null || data === undefined) return null;
  const obj = typeof data.toObject === 'function' ? data.toObject({ depopulate: true }) : data;
  try {
    return JSON.parse(JSON.stringify(obj, (k, v) => (SENSITIVE.has(k) ? undefined : v)));
  } catch {
    return null;
  }
}

/** Only keep the fields that actually changed (keeps audit entries readable). */
function diff(before, after, keys) {
  const prev = {};
  const next = {};
  for (const k of keys) {
    const a = before ? before[k] : undefined;
    const b = after ? after[k] : undefined;
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      prev[k] = a === undefined ? null : a;
      next[k] = b === undefined ? null : b;
    }
  }
  return { prev, next, changed: Object.keys(next).length > 0 };
}

/**
 * Write an audit record. Never throws (auditing failures are logged, not surfaced),
 * except in tests where we want to know.
 */
async function audit(req, { action, entityType, entityId = null, entityRef, rider = null, previousData = null, newData = null }) {
  try {
    const u = req && req.user;
    await AuditLog.create({
      user: u ? u._id : null,
      userName: u ? u.name : 'System',
      role: u ? u.role : 'system',
      action,
      entityType,
      entityId,
      entityRef,
      rider: rider || (u && u.rider) || null,
      previousData: clean(previousData),
      newData: clean(newData),
      ip: req ? (req.ip || (req.socket && req.socket.remoteAddress)) : undefined,
      userAgent: req && req.get ? String(req.get('user-agent') || '').slice(0, 300) : undefined,
      timestamp: new Date(),
    });
  } catch (err) {
    console.error('[audit] failed to write audit log:', err.message);
    if (process.env.NODE_ENV === 'test') throw err;
  }
}

module.exports = { audit, diff, clean };
