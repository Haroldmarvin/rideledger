/**
 * Pure validation for delivery input. Returns friendly, non-technical messages.
 * The server ALWAYS recalculates outstandingAmount — any client value is ignored.
 */
const { PAYMENT_METHODS, DELIVERY_STATUSES } = require('../config/constants');
const { parseCentsInput, isValidCents, formatCents } = require('../utils/money');
const { calculateOutstanding, calculateExtraCollected } = require('./calculations');

const PHONE_RE = /^\+?\d{7,15}$/;

function normalizePhone(v) {
  return String(v || '').replace(/[\s\-().]/g, '');
}

function isValidPhone(v) {
  return PHONE_RE.test(normalizePhone(v));
}

const FLAG_MESSAGES = Object.freeze({
  ZERO_FINANCIALS: 'Marked as Delivered but the fee and amount collected are both zero.',
  FEE_OVERRIDE: 'Delivery fee is different from the current default fee.',
  COLLECTED_ON_UNSUCCESSFUL: 'Money was collected on a delivery that was not completed.',
  PARTIAL_PAYMENT: 'Customer paid only part of the delivery fee.',
  EXTRA_COLLECTED: 'Customer paid more than the delivery fee (e.g. order money). The extra is included in the rider\'s collections and cash handover.',
});

/**
 * @param {object} input raw request body (merged with existing values for updates)
 * @param {object} ctx { isAdmin, defaultFee (cents|null), allowFeeOverride (bool) }
 * @returns {{ ok: boolean, errors: object, flags: string[], value: object }}
 */
function validateDelivery(input = {}, ctx = {}) {
  const errors = {};
  const flags = [];
  const v = {};

  const text = (key, label, { required = true, max = 200, min = 1 } = {}) => {
    const raw = input[key] === undefined || input[key] === null ? '' : String(input[key]).trim();
    if (required && raw.length < min) errors[key] = `Please enter the ${label}.`;
    else if (raw.length > max) errors[key] = `${label[0].toUpperCase()}${label.slice(1)} is too long (max ${max} characters).`;
    v[key] = raw;
  };

  text('customerName', 'customer name', { max: 120, min: 2 });
  if (errors.customerName && String(input.customerName || '').trim().length === 1) {
    errors.customerName = 'Customer name looks too short.';
  }
  text('pickupLocation', 'pickup location');
  text('destination', 'destination');
  text('orderReference', 'order reference', { required: false, max: 60 });
  text('remarks', 'remarks', { required: false, max: 500 });

  const phoneRaw = String(input.customerPhone || '').trim();
  if (!phoneRaw) errors.customerPhone = 'Please enter the customer phone number.';
  else if (!isValidPhone(phoneRaw)) errors.customerPhone = 'Phone number looks wrong. Use digits only, e.g. 0777123456 or +231777123456.';
  v.customerPhone = normalizePhone(phoneRaw);

  if (!input.paymentMethod) errors.paymentMethod = 'Please choose how the customer paid.';
  else if (!PAYMENT_METHODS.includes(input.paymentMethod)) errors.paymentMethod = 'Please choose a valid payment method.';
  v.paymentMethod = input.paymentMethod;

  if (!input.status) errors.status = 'Please choose the delivery status.';
  else if (!DELIVERY_STATUSES.includes(input.status)) errors.status = 'Please choose a valid delivery status.';
  v.status = input.status;

  const fee = parseCentsInput(input.deliveryFee);
  const collected = parseCentsInput(input.amountCollected === '' || input.amountCollected === undefined || input.amountCollected === null ? 0 : input.amountCollected);

  if (input.deliveryFee === undefined || input.deliveryFee === null || input.deliveryFee === '') errors.deliveryFee = 'Please enter the delivery fee.';
  else if (!isValidCents(fee)) errors.deliveryFee = 'Delivery fee must be a valid amount of zero or more.';
  if (!isValidCents(collected)) errors.amountCollected = 'Amount collected must be a valid amount of zero or more.';

  v.deliveryFee = fee;
  v.amountCollected = collected;

  if (!errors.deliveryFee && !errors.amountCollected) {
    if (v.paymentMethod === 'Credit/Unpaid' && collected > 0) {
      errors.amountCollected = 'Payment is marked Credit/Unpaid, so amount collected should be 0. Choose the method the customer actually used.';
    }
    if (!ctx.isAdmin && ctx.allowFeeOverride === false && Number.isInteger(ctx.defaultFee) && fee !== ctx.defaultFee) {
      errors.deliveryFee = `Delivery fee must be the standard fee of ${formatCents(ctx.defaultFee)}.`;
    }
  }

  const ok = Object.keys(errors).length === 0;
  if (ok) {
    v.outstandingAmount = calculateOutstanding(fee, collected);
    v.extraCollected = calculateExtraCollected(fee, collected);
    if (v.status === 'Delivered' && fee === 0 && collected === 0) flags.push('ZERO_FINANCIALS');
    if (Number.isInteger(ctx.defaultFee) && fee !== ctx.defaultFee) flags.push('FEE_OVERRIDE');
    if (['Failed', 'Cancelled'].includes(v.status) && collected > 0) flags.push('COLLECTED_ON_UNSUCCESSFUL');
    if (v.paymentMethod !== 'Credit/Unpaid' && collected > 0 && collected < fee) flags.push('PARTIAL_PAYMENT');
    if (v.extraCollected > 0) flags.push('EXTRA_COLLECTED');
  }

  return { ok, errors, flags, value: v };
}

module.exports = { validateDelivery, isValidPhone, normalizePhone, FLAG_MESSAGES };
