const { Bike, Rider } = require('../models');
const ApiError = require('../utils/ApiError');

/**
 * Assign a bike to a rider (one bike per rider, one rider per bike).
 * Pass riderId = null to unassign. Returns { bike, rider, previousRider }.
 */
async function assignBike(bikeId, riderId) {
  const bike = await Bike.findById(bikeId);
  if (!bike) throw ApiError.notFound('Bike not found.');
  const previousRiderId = bike.assignedRider ? String(bike.assignedRider) : null;

  let rider = null;
  if (riderId) {
    rider = await Rider.findById(riderId);
    if (!rider) throw ApiError.notFound('Rider not found.');
    if (rider.status !== 'active') throw ApiError.badRequest('Cannot assign a bike to an inactive rider.');
    if (bike.status === 'Inactive') throw ApiError.badRequest('This bike is inactive. Activate it before assigning.');
    // Free the rider's previous bike
    if (rider.bike && String(rider.bike) !== String(bike._id)) {
      await Bike.updateOne({ _id: rider.bike }, { $set: { assignedRider: null } });
    }
  }
  // Free the bike's previous rider
  if (previousRiderId && previousRiderId !== String(riderId || '')) {
    await Rider.updateOne({ _id: previousRiderId }, { $set: { bike: null } });
  }

  bike.assignedRider = rider ? rider._id : null;
  await bike.save();
  if (rider) {
    rider.bike = bike._id;
    await rider.save();
  }
  return { bike, rider, previousRiderId };
}

async function unassignRider(riderId) {
  const rider = await Rider.findById(riderId);
  if (!rider || !rider.bike) return;
  await Bike.updateOne({ _id: rider.bike }, { $set: { assignedRider: null } });
  rider.bike = null;
  await rider.save();
}

module.exports = { assignBike, unassignRider };
