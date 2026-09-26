/** Product name shown in the app, browser tab, reports and home-screen icon. */
export const APP_NAME = 'Afri Kapital Kitchen Ledger';

export const PAYMENT_METHODS = ['Cash', 'Mobile Money', 'Bank Transfer', 'Credit/Unpaid', 'Other'];
export const DELIVERY_STATUSES = ['Delivered', 'Failed', 'Returned', 'Cancelled'];
export const EXPENSE_CATEGORIES = ['Fuel', 'Bike Repair/Maintenance', 'Parking', 'Other Authorized Expense'];
export const EXPENSE_STATUSES = ['Pending', 'Approved', 'Rejected'];
export const BIKE_STATUSES = ['Active', 'Maintenance', 'Inactive'];

export const STATUS_TONE = {
  Delivered: 'success', Failed: 'danger', Returned: 'warning', Cancelled: 'secondary',
  Pending: 'warning', Approved: 'success', Rejected: 'danger',
  Submitted: 'warning', Confirmed: 'success', Returned_closeout: 'secondary',
  Active: 'success', Maintenance: 'warning', Inactive: 'secondary',
  active: 'success', inactive: 'secondary',
  Exact: 'success', Short: 'danger', Over: 'warning',
};

export const PAYMENT_TONE = {
  Cash: 'success', 'Mobile Money': 'info', 'Bank Transfer': 'primary', 'Credit/Unpaid': 'warning', Other: 'secondary',
};
