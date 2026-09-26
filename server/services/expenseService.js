const { EXPENSE_CATEGORIES, MAX_MONEY_CENTS } = require('../config/constants');
const { parseCentsInput } = require('../utils/money');
const { isValidDateString, businessDate, addDays } = require('../utils/dates');

/**
 * Pure validation for expense input. Riders may date an expense up to 7 days back, never in the future.
 */
function validateExpense(input = {}, { isAdmin = false, today = businessDate() } = {}) {
  const errors = {};
  const v = {};

  v.date = input.date ? String(input.date) : today;
  if (!isValidDateString(v.date)) errors.date = 'Please choose a valid date.';
  else if (v.date > today) errors.date = 'Expense date cannot be in the future.';
  else if (!isAdmin && v.date < addDays(today, -7)) errors.date = 'Expenses older than 7 days must be recorded by management.';

  v.category = input.category;
  if (!v.category) errors.category = 'Please choose an expense category.';
  else if (!EXPENSE_CATEGORIES.includes(v.category)) errors.category = 'Please choose a valid category.';

  v.amount = parseCentsInput(input.amount);
  if (input.amount === undefined || input.amount === null || input.amount === '') errors.amount = 'Please enter the amount spent.';
  else if (!Number.isInteger(v.amount) || v.amount <= 0) errors.amount = 'Amount must be more than zero.';
  else if (v.amount > MAX_MONEY_CENTS) errors.amount = 'Amount is too large.';

  v.description = input.description === undefined || input.description === null ? '' : String(input.description).trim().slice(0, 500);
  if (v.category === 'Other Authorized Expense' && v.description.length < 3) {
    errors.description = 'Please describe what this expense was for.';
  }

  return { ok: Object.keys(errors).length === 0, errors, value: v };
}

module.exports = { validateExpense };
