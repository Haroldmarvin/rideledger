const { toCents, isValidCents, parseCentsInput, sumCents, formatCents } = require('../../utils/money');

describe('money (integer cents)', () => {
  test('parses decimals exactly without float drift', () => {
    expect(toCents('12.50')).toBe(1250);
    expect(toCents('0.1')).toBe(10);
    expect(toCents(1.005)).toBe(101); // decimal-string shift, never 100.49999
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents('19.99')).toBe(1999);
    expect(toCents('7')).toBe(700);
    expect(toCents('-3.25')).toBe(-325);
  });
  test('rejects invalid input', () => {
    expect(toCents('abc')).toBeNaN();
    expect(toCents('1.234')).toBeNaN();
    expect(toCents('')).toBeNaN();
    expect(toCents(null)).toBeNaN();
  });
  test('0.1 + 0.2 problem does not exist in cents', () => {
    expect(sumCents([toCents('0.1'), toCents('0.2')])).toBe(toCents('0.3'));
    const many = Array.from({ length: 1000 }, () => toCents('0.10'));
    expect(sumCents(many)).toBe(10000);
  });
  test('validates API cents', () => {
    expect(isValidCents(500)).toBe(true);
    expect(isValidCents(5.5)).toBe(false);
    expect(isValidCents(-1)).toBe(false);
    expect(isValidCents(-1, { allowNegative: true })).toBe(true);
    expect(parseCentsInput('500')).toBe(500);
    expect(parseCentsInput('5.00')).toBeNaN();
    expect(parseCentsInput({ $gt: 0 })).toBeNaN();
  });
  test('formats', () => {
    expect(formatCents(123456)).toBe('$1,234.56');
    expect(formatCents(-500)).toBe('-$5.00');
    expect(formatCents(5, 'L$')).toBe('L$0.05');
  });
});
