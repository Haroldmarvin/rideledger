const c = require('../../services/calculations');

const D = (fee, collected, paymentMethod = 'Cash', status = 'Delivered') => ({
  deliveryFee: fee, amountCollected: collected, paymentMethod, status,
  outstandingAmount: c.calculateOutstanding(fee, collected), extraCollected: c.calculateExtraCollected(fee, collected),
});

describe('outstanding calculation', () => {
  test('spec examples', () => {
    expect(c.calculateOutstanding(5000, 5000)).toBe(0);
    expect(c.calculateOutstanding(5000, 3000)).toBe(2000);
    expect(c.calculateOutstanding(5000, 0)).toBe(5000);
  });
  test('customer pays more than the fee: nothing outstanding, the rest is extra collected', () => {
    expect(c.calculateOutstanding(500, 2500)).toBe(0);
    expect(c.calculateExtraCollected(500, 2500)).toBe(2000);
    expect(c.calculateExtraCollected(500, 300)).toBe(0);
  });
  test('extra collected cash is part of the expected handover', () => {
    const s = c.summarize([D(500, 2500, 'Cash'), D(500, 500, 'Cash'), D(500, 1500, 'Mobile Money')], [{ status: 'Approved', amount: 300 }]);
    expect(s.totalCollected).toBe(4500);
    expect(s.cashCollected).toBe(3000);
    expect(s.extraCollected).toBe(3000); // 2000 cash + 1000 mobile money
    expect(s.outstanding).toBe(0);
    expect(s.expectedHandover).toBe(2700); // all cash collected minus approved expenses
  });
});

describe('payment totals', () => {
  test('groups collections by payment method', () => {
    const s = c.summarize([
      D(500, 500, 'Cash'), D(500, 500, 'Cash'), D(500, 250, 'Cash'),
      D(500, 500, 'Mobile Money'), D(750, 750, 'Bank Transfer'),
      D(500, 0, 'Credit/Unpaid'), D(500, 500, 'Other'),
      D(0, 0, 'Cash', 'Failed'), D(500, 0, 'Credit/Unpaid', 'Returned'), D(0, 0, 'Cash', 'Cancelled'),
    ]);
    expect(s.deliveries).toBe(10);
    expect(s.delivered).toBe(7);
    expect(s.failed).toBe(1);
    expect(s.returned).toBe(1);
    expect(s.cancelled).toBe(1);
    expect(s.totalFees).toBe(4250);
    expect(s.cashCollected).toBe(1250);
    expect(s.mobileMoneyCollected).toBe(500);
    expect(s.bankCollected).toBe(750);
    expect(s.otherCollected).toBe(500);
    expect(s.electronicCollected).toBe(1250);
    expect(s.totalCollected).toBe(3000);
    expect(s.outstanding).toBe(1250); // 250 part-pay + 500 credit + 500 returned credit
    expect(s.creditCount).toBe(2);
    expect(s.totalFees - s.totalCollected).toBe(s.outstanding);
  });
});

describe('expense approval affects accountability', () => {
  test('only APPROVED expenses count', () => {
    const expenses = [
      { status: 'Approved', amount: 1000 }, { status: 'Pending', amount: 700 }, { status: 'Rejected', amount: 900 }, { status: 'Approved', amount: 500 },
    ];
    expect(c.sumApprovedExpenses(expenses)).toBe(1500);
    const s = c.summarize([D(15000, 15000, 'Cash')], expenses);
    expect(s.approvedExpenses).toBe(1500);
    expect(s.expectedHandover).toBe(13500);
  });
});

describe('expected handover and difference', () => {
  test('spec example: cash 150, expenses 20 -> expected 130', () => {
    expect(c.calculateExpectedHandover(15000, 2000)).toBe(13000);
  });
  test('electronic payments do not count toward cash handover', () => {
    const s = c.summarize([D(15000, 15000, 'Cash'), D(7000, 7000, 'Mobile Money')], [{ status: 'Approved', amount: 2000 }]);
    expect(s.expectedHandover).toBe(13000);
  });
  test('difference = actual - expected, classified', () => {
    expect(c.calculateDifference(13000, 13000)).toBe(0);
    expect(c.classifyDifference(0)).toBe('Exact');
    expect(c.calculateDifference(12500, 13000)).toBe(-500);
    expect(c.classifyDifference(-500)).toBe('Short');
    expect(c.classifyDifference(100)).toBe('Over');
  });
  test('buildCloseoutFigures', () => {
    const s = c.summarize([D(15000, 15000, 'Cash')], [{ status: 'Approved', amount: 2000 }]);
    const f = c.buildCloseoutFigures(s, 12000);
    expect(f).toMatchObject({ cashCollected: 15000, approvedExpenses: 2000, expectedHandover: 13000, actualHandover: 12000, difference: -1000, differenceStatus: 'Short' });
  });
  test('grouped and raw summaries agree', () => {
    const list = [D(500, 500), D(500, 0, 'Credit/Unpaid'), D(750, 750, 'Mobile Money')];
    expect(c.summarizeGroups(c.groupDeliveries(list), 0)).toEqual(c.summarize(list, []));
  });
});
