const { validateExpense } = require('../../services/expenseService');

describe('expense validation', () => {
  const today = '2026-09-24';
  test('valid expense', () => {
    const r = validateExpense({ category: 'Fuel', amount: 1500 }, { today });
    expect(r.ok).toBe(true);
    expect(r.value.date).toBe(today);
  });
  test('future dates and old dates for riders rejected', () => {
    expect(validateExpense({ category: 'Fuel', amount: 100, date: '2026-09-25' }, { today }).ok).toBe(false);
    expect(validateExpense({ category: 'Fuel', amount: 100, date: '2026-09-01' }, { today }).ok).toBe(false);
    expect(validateExpense({ category: 'Fuel', amount: 100, date: '2026-09-01' }, { today, isAdmin: true }).ok).toBe(true);
  });
  test('amount must be positive integer cents', () => {
    expect(validateExpense({ category: 'Fuel', amount: 0 }, { today }).ok).toBe(false);
    expect(validateExpense({ category: 'Fuel', amount: '12.5' }, { today }).ok).toBe(false);
  });
  test('other expenses need a description', () => {
    expect(validateExpense({ category: 'Other Authorized Expense', amount: 100 }, { today }).errors.description).toBeDefined();
  });
});
