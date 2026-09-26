const ROLES = Object.freeze({ ADMIN: 'admin', RIDER: 'rider' });

const PAYMENT_METHODS = Object.freeze(['Cash', 'Mobile Money', 'Bank Transfer', 'Credit/Unpaid', 'Other']);
const DELIVERY_STATUSES = Object.freeze(['Delivered', 'Failed', 'Returned', 'Cancelled']);
const EXPENSE_CATEGORIES = Object.freeze(['Fuel', 'Bike Repair/Maintenance', 'Parking', 'Other Authorized Expense']);
const EXPENSE_STATUSES = Object.freeze(['Pending', 'Approved', 'Rejected']);
const BIKE_STATUSES = Object.freeze(['Active', 'Maintenance', 'Inactive']);
const ACCOUNT_STATUSES = Object.freeze(['active', 'inactive']);

// Closeout lifecycle:
//  Submitted  -> rider declared handover; the day is locked for the rider
//  Confirmed  -> management confirmed receipt; the day is closed
//  Returned   -> management sent it back; the day is unlocked again
const CLOSEOUT_STATUSES = Object.freeze(['Submitted', 'Confirmed', 'Returned']);
const LOCKING_CLOSEOUT_STATUSES = Object.freeze(['Submitted', 'Confirmed']);

const CORRECTION_STATUSES = Object.freeze(['Pending', 'Approved', 'Rejected']);

const DELIVERY_EDITABLE_FIELDS = Object.freeze([
  'bike', 'customerName', 'customerPhone', 'pickupLocation', 'destination', 'orderReference',
  'deliveryFee', 'amountCollected', 'paymentMethod', 'status', 'remarks',
]);
const EXPENSE_EDITABLE_FIELDS = Object.freeze(['date', 'category', 'amount', 'description']);

const MAX_MONEY_CENTS = 100000000; // 1,000,000.00

module.exports = {
  ROLES, PAYMENT_METHODS, DELIVERY_STATUSES, EXPENSE_CATEGORIES, EXPENSE_STATUSES, BIKE_STATUSES,
  ACCOUNT_STATUSES, CLOSEOUT_STATUSES, LOCKING_CLOSEOUT_STATUSES, CORRECTION_STATUSES,
  DELIVERY_EDITABLE_FIELDS, EXPENSE_EDITABLE_FIELDS, MAX_MONEY_CENTS,
};
