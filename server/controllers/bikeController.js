const { Bike, Delivery } = require('../models');
const { assignBike } = require('../services/bikeService');
const { audit, diff } = require('../services/audit');
const { BIKE_STATUSES } = require('../config/constants');
const { asyncHandler, isObjectId, qs, trimOrEmpty, escapeRegex } = require('../utils/helpers');
const ApiError = require('../utils/ApiError');
const deletion = require('../services/deletionService');

const POP = { path: 'assignedRider', select: 'riderId name phone status' };

async function findBike(id) {
  const key = isObjectId(id) ? { _id: id } : { bikeId: String(id).toUpperCase() };
  const bike = await Bike.findOne(key);
  if (!bike) throw ApiError.notFound('Bike not found.');
  return bike;
}

const listBikes = asyncHandler(async (req, res) => {
  const filter = {};
  const status = qs(req.query.status);
  if (status) {
    if (!BIKE_STATUSES.includes(status)) throw ApiError.badRequest('Invalid status filter.');
    filter.status = status;
  }
  const search = qs(req.query.search).slice(0, 40);
  if (search) {
    const re = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ bikeId: re }, { registrationNumber: re }];
  }
  // Riders only get the minimal list needed to pick a bike on a delivery
  if (req.user.role === 'rider') {
    const items = await Bike.find({ status: 'Active' }).select('bikeId registrationNumber').sort({ bikeId: 1 }).lean();
    return res.json({ items });
  }
  const items = await Bike.find(filter).sort({ bikeId: 1 }).populate(POP).lean();
  const counts = await Delivery.aggregate([{ $match: { bike: { $in: items.map((b) => b._id) } } }, { $group: { _id: '$bike', deliveries: { $sum: 1 }, lastDate: { $max: '$date' } } }]);
  const cMap = new Map(counts.map((c) => [String(c._id), c]));
  return res.json({ items: items.map((b) => ({ ...b, deliveries: cMap.get(String(b._id))?.deliveries || 0, lastUsed: cMap.get(String(b._id))?.lastDate || null })) });
});

function validateBike(body, { partial = false } = {}) {
  const errors = {};
  const v = {};
  if (!partial || body.bikeId !== undefined) {
    v.bikeId = trimOrEmpty(body.bikeId, 30).toUpperCase();
    if (!/^[A-Z0-9-]{2,30}$/.test(v.bikeId)) errors.bikeId = 'Bike ID can use letters, numbers and dashes (e.g. BK-006).';
  }
  if (body.registrationNumber !== undefined) v.registrationNumber = trimOrEmpty(body.registrationNumber, 40).toUpperCase();
  if (body.status !== undefined) {
    if (!BIKE_STATUSES.includes(body.status)) errors.status = 'Please choose a valid status.';
    v.status = body.status;
  }
  if (body.notes !== undefined) v.notes = trimOrEmpty(body.notes, 500);
  if (Object.keys(errors).length) throw ApiError.badRequest(Object.values(errors)[0], { fieldErrors: errors });
  return v;
}

const createBike = asyncHandler(async (req, res) => {
  const v = validateBike(req.body);
  if (await Bike.exists({ bikeId: v.bikeId })) throw ApiError.conflict('A bike with this ID already exists.', { fieldErrors: { bikeId: 'Already exists.' } });
  let bike = await Bike.create({ ...v, status: v.status || 'Active' });
  if (req.body.assignedRider) {
    if (!isObjectId(String(req.body.assignedRider))) throw ApiError.badRequest('Please choose a valid rider.');
    ({ bike } = await assignBike(bike._id, req.body.assignedRider));
  }
  await audit(req, {
    action: 'Admin created bike', entityType: 'Bike', entityId: bike._id, entityRef: bike.bikeId,
    rider: bike.assignedRider || null, newData: { bikeId: bike.bikeId, registrationNumber: bike.registrationNumber, status: bike.status, assignedRider: bike.assignedRider ? String(bike.assignedRider) : null },
  });
  await bike.populate(POP);
  res.status(201).json({ bike });
});

const updateBike = asyncHandler(async (req, res) => {
  let bike = await findBike(req.params.id);
  const v = validateBike(req.body, { partial: true });
  if (v.bikeId && v.bikeId !== bike.bikeId && await Bike.exists({ bikeId: v.bikeId })) throw ApiError.conflict('A bike with this ID already exists.');
  const before = { bikeId: bike.bikeId, registrationNumber: bike.registrationNumber, status: bike.status, notes: bike.notes, assignedRider: bike.assignedRider ? String(bike.assignedRider) : null };
  Object.assign(bike, v);
  await bike.save();

  if (req.body.assignedRider !== undefined) {
    const target = req.body.assignedRider || null;
    if (target && !isObjectId(String(target))) throw ApiError.badRequest('Please choose a valid rider.');
    if (String(target || '') !== String(bike.assignedRider || '')) ({ bike } = await assignBike(bike._id, target));
  }
  if (bike.status === 'Inactive' && bike.assignedRider) ({ bike } = await assignBike(bike._id, null));

  const after = { bikeId: bike.bikeId, registrationNumber: bike.registrationNumber, status: bike.status, notes: bike.notes, assignedRider: bike.assignedRider ? String(bike.assignedRider) : null };
  const d = diff(before, after, Object.keys(after));
  if (d.changed) {
    let action = 'Admin edited bike';
    if (d.next.assignedRider !== undefined && Object.keys(d.next).length === 1) action = after.assignedRider ? 'Admin assigned bike to rider' : 'Admin unassigned bike';
    await audit(req, { action, entityType: 'Bike', entityId: bike._id, entityRef: bike.bikeId, rider: bike.assignedRider || (before.assignedRider || null), previousData: d.prev, newData: d.next });
  }
  await bike.populate(POP);
  res.json({ bike });
});

/** Management only: remove a bike (its rider is unassigned; past deliveries keep their record). */
const deleteBike = asyncHandler(async (req, res) => {
  const bike = await findBike(req.params.id);
  await deletion.deleteBike(req, bike, trimOrEmpty((req.body && req.body.reason) || req.query.reason, 500));
  res.json({ message: `Bike ${bike.bikeId} deleted.` });
});

module.exports = { listBikes, createBike, updateBike, deleteBike };
