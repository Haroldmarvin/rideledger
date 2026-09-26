const p = require('../../services/policy');

const admin = { _id: 'a', role: 'admin', rider: null };
const riderA = { _id: 'u1', role: 'rider', rider: 'r1' };
const riderB = { _id: 'u2', role: 'rider', rider: 'r2' };
const recA = { rider: 'r1', status: 'Pending' };

describe('role permissions & rider data isolation', () => {
  test('admins see everything, riders only their own', () => {
    expect(p.canView(admin, 'r1')).toBe(true);
    expect(p.canView(riderA, 'r1')).toBe(true);
    expect(p.canView(riderB, 'r1')).toBe(false);
    expect(p.canView({ role: 'rider', rider: null }, null)).toBe(false);
  });
  test('scopeFilter forces rider id regardless of requested filter', () => {
    expect(p.scopeFilter(riderB, { rider: 'r1', _id: 'x' })).toEqual({ rider: 'r2', _id: 'x' });
    expect(p.scopeFilter(admin, { rider: 'r1' })).toEqual({ rider: 'r1' });
  });
  test('another rider cannot modify', () => {
    expect(p.canModify(riderB, recA, null).allowed).toBe(false);
  });
});

describe('closed-day restrictions', () => {
  test('open day: rider may edit own record', () => {
    expect(p.canModify(riderA, recA, null).allowed).toBe(true);
    expect(p.canModify(riderA, recA, { status: 'Returned' }).allowed).toBe(true);
  });
  test('submitted or confirmed day: rider locked, must request correction', () => {
    for (const status of ['Submitted', 'Confirmed']) {
      const r = p.canModify(riderA, recA, { status });
      expect(r.allowed).toBe(false);
      expect(r.requiresCorrection).toBe(true);
    }
  });
  test('admin may correct a closed day but must give a reason', () => {
    const r = p.canModify(admin, recA, { status: 'Confirmed' });
    expect(r.allowed).toBe(true);
    expect(r.requiresReason).toBe(true);
  });
  test('riders cannot edit reviewed expenses', () => {
    expect(p.canRiderEditExpense(riderA, { rider: 'r1', status: 'Approved' }, null).allowed).toBe(false);
    expect(p.canRiderEditExpense(riderA, { rider: 'r1', status: 'Pending' }, null).allowed).toBe(true);
  });
});
