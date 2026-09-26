const { validateDelivery, isValidPhone } = require('../../services/deliveryValidation');

const base = { customerName: 'Musu Kollie', customerPhone: '0777123456', pickupLocation: 'Sinkor', destination: 'Congo Town', deliveryFee: 5000, amountCollected: 5000, paymentMethod: 'Cash', status: 'Delivered' };

describe('delivery validation', () => {
  test('valid delivery computes outstanding server-side (ignores client value)', () => {
    const r = validateDelivery({ ...base, amountCollected: 3000, outstandingAmount: 0 }, { defaultFee: 5000 });
    expect(r.ok).toBe(true);
    expect(r.value.outstandingAmount).toBe(2000);
    expect(r.flags).toContain('PARTIAL_PAYMENT');
  });
  test('credit/unpaid -> outstanding = fee', () => {
    const r = validateDelivery({ ...base, amountCollected: 0, paymentMethod: 'Credit/Unpaid' }, {});
    expect(r.ok).toBe(true);
    expect(r.value.outstandingAmount).toBe(5000);
  });
  test('credit/unpaid with money collected is rejected', () => {
    const r = validateDelivery({ ...base, paymentMethod: 'Credit/Unpaid' }, {});
    expect(r.ok).toBe(false);
    expect(r.errors.amountCollected).toMatch(/Credit\/Unpaid/);
  });
  test('collected greater than fee is accepted: outstanding 0, extra recorded and flagged', () => {
    const r = validateDelivery({ ...base, deliveryFee: 500, amountCollected: 2500 }, { isAdmin: false });
    expect(r.ok).toBe(true);
    expect(r.value.outstandingAmount).toBe(0);
    expect(r.value.extraCollected).toBe(2000);
    expect(r.flags).toContain('EXTRA_COLLECTED');
  });
  test('paid exactly the fee: no outstanding, no extra, no flag', () => {
    const r = validateDelivery({ ...base }, { defaultFee: 5000 });
    expect(r.value.outstandingAmount).toBe(0);
    expect(r.value.extraCollected).toBe(0);
    expect(r.flags).not.toContain('EXTRA_COLLECTED');
  });
  test('client-sent extraCollected is ignored (server recalculates)', () => {
    const r = validateDelivery({ ...base, amountCollected: 3000, extraCollected: 99999 }, {});
    expect(r.value.extraCollected).toBe(0);
    expect(r.value.outstandingAmount).toBe(2000);
  });
  test('missing fields give friendly messages', () => {
    const r = validateDelivery({ deliveryFee: 500 }, {});
    expect(r.ok).toBe(false);
    expect(r.errors.customerName).toMatch(/customer name/);
    expect(r.errors.destination).toMatch(/destination/);
    expect(r.errors.paymentMethod).toMatch(/how the customer paid/);
    expect(r.errors.customerPhone).toBeDefined();
  });
  test('invalid phone', () => {
    expect(isValidPhone('0777 123 456')).toBe(true);
    expect(isValidPhone('+231 77 712 3456')).toBe(true);
    expect(isValidPhone('12ab')).toBe(false);
    expect(validateDelivery({ ...base, customerPhone: '123' }, {}).errors.customerPhone).toMatch(/Phone number looks wrong/);
  });
  test('delivered with zero financial info is flagged', () => {
    const r = validateDelivery({ ...base, deliveryFee: 0, amountCollected: 0 }, { defaultFee: 500 });
    expect(r.ok).toBe(true);
    expect(r.flags).toEqual(expect.arrayContaining(['ZERO_FINANCIALS', 'FEE_OVERRIDE']));
  });
  test('fee override can be disabled for riders', () => {
    const r = validateDelivery({ ...base, deliveryFee: 700, amountCollected: 700 }, { defaultFee: 500, allowFeeOverride: false });
    expect(r.ok).toBe(false);
    expect(r.errors.deliveryFee).toMatch(/standard fee/);
  });
  test('non-integer / injected money rejected', () => {
    expect(validateDelivery({ ...base, deliveryFee: 50.5 }, {}).ok).toBe(false);
    expect(validateDelivery({ ...base, deliveryFee: { $gt: 0 } }, {}).ok).toBe(false);
    expect(validateDelivery({ ...base, amountCollected: -1 }, {}).ok).toBe(false);
  });
});
