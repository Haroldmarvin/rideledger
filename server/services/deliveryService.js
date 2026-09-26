const { Setting, Bike } = require('../models');
const { DELIVERY_EDITABLE_FIELDS } = require('../config/constants');
const { validateDelivery } = require('./deliveryValidation');
const { getCurrentFeeCents } = require('./feeService');
const { isObjectId } = require('../utils/helpers');
const ApiError = require('../utils/ApiError');

async function feeContext(isAdmin) {
  const [settings, defaultFee] = await Promise.all([Setting.get(), getCurrentFeeCents()]);
  return { isAdmin, defaultFee, allowFeeOverride: settings.allowRiderFeeOverride !== false };
}

/** Resolve a bike reference (ObjectId) or null. Throws friendly errors. */
async function resolveBike(bikeValue) {
  if (bikeValue === undefined) return undefined;
  if (bikeValue === null || bikeValue === '') return null;
  if (!isObjectId(String(bikeValue))) throw ApiError.badRequest('Please choose a valid bike.', { fieldErrors: { bike: 'Invalid bike.' } });
  const bike = await Bike.findById(bikeValue).lean();
  if (!bike) throw ApiError.badRequest('Selected bike was not found.', { fieldErrors: { bike: 'Bike not found.' } });
  return bike._id;
}

function throwValidation(result) {
  const first = Object.values(result.errors)[0];
  throw ApiError.badRequest(first || 'Please check the delivery details.', { fieldErrors: result.errors });
}

/**
 * Apply a patch to an existing delivery document (mutates it) with full re-validation.
 * The fee comparison uses the default fee at the time the delivery was created, so
 * later changes to the default never alter historical records or their flags.
 */
async function applyDeliveryPatch(delivery, patch, { isAdmin }) {
  const allowed = {};
  for (const k of DELIVERY_EDITABLE_FIELDS) if (patch[k] !== undefined) allowed[k] = patch[k];

  const merged = {
    customerName: delivery.customerName,
    customerPhone: delivery.customerPhone,
    pickupLocation: delivery.pickupLocation,
    destination: delivery.destination,
    orderReference: delivery.orderReference,
    deliveryFee: delivery.deliveryFee,
    amountCollected: delivery.amountCollected,
    paymentMethod: delivery.paymentMethod,
    status: delivery.status,
    remarks: delivery.remarks,
    ...allowed,
  };

  const settings = await Setting.get();
  const ctx = {
    isAdmin,
    defaultFee: Number.isInteger(delivery.defaultFeeAtCreation) ? delivery.defaultFeeAtCreation : null,
    allowFeeOverride: settings.allowRiderFeeOverride !== false || delivery.deliveryFee === merged.deliveryFee,
  };
  const result = validateDelivery(merged, ctx);
  if (!result.ok) throwValidation(result);

  const bike = await resolveBike(allowed.bike);
  const v = result.value;
  Object.assign(delivery, {
    customerName: v.customerName,
    customerPhone: v.customerPhone,
    pickupLocation: v.pickupLocation,
    destination: v.destination,
    orderReference: v.orderReference,
    deliveryFee: v.deliveryFee,
    amountCollected: v.amountCollected,
    outstandingAmount: v.outstandingAmount,
    extraCollected: v.extraCollected,
    paymentMethod: v.paymentMethod,
    status: v.status,
    remarks: v.remarks,
    flags: result.flags,
  });
  if (bike !== undefined) delivery.bike = bike;
  return delivery;
}

const AUDIT_FIELDS = ['bike', 'customerName', 'customerPhone', 'pickupLocation', 'destination', 'orderReference', 'deliveryFee', 'amountCollected', 'outstandingAmount', 'extraCollected', 'paymentMethod', 'status', 'remarks', 'flags'];

function snapshot(d) {
  const o = {};
  for (const k of AUDIT_FIELDS) o[k] = d[k] && d[k].toString && k === 'bike' ? String(d[k]) : (Array.isArray(d[k]) ? [...d[k]] : d[k]);
  return o;
}

module.exports = { feeContext, resolveBike, throwValidation, applyDeliveryPatch, snapshot, AUDIT_FIELDS };
