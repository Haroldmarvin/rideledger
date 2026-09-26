const jwt = require('jsonwebtoken');
const { env } = require('../config/env');
const { User } = require('../models');
const ApiError = require('../utils/ApiError');

function signToken(user) {
  return jwt.sign(
    { sub: String(user._id), role: user.role, tv: user.tokenVersion || 0 },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn, issuer: 'rideledger' },
  );
}

/**
 * Verifies the bearer token AND re-checks the user in the database on every request,
 * so deactivation, role changes and password resets take effect immediately.
 */
async function authenticate(req, res, next) {
  try {
    const header = req.get('authorization') || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) throw ApiError.unauthorized();

    let payload;
    try {
      payload = jwt.verify(token, env.jwtSecret, { issuer: 'rideledger' });
    } catch (e) {
      throw ApiError.unauthorized(e.name === 'TokenExpiredError' ? 'Your session has expired. Please log in again.' : 'Please log in to continue.');
    }

    const user = await User.findById(payload.sub).select('+tokenVersion').lean();
    if (!user || (user.tokenVersion || 0) !== (payload.tv || 0)) throw ApiError.unauthorized('Your session is no longer valid. Please log in again.');
    if (user.status !== 'active') throw ApiError.unauthorized('Your account has been deactivated. Please contact management.');

    req.user = { _id: user._id, name: user.name, email: user.email, role: user.role, rider: user.rider || null };
    return next();
  } catch (err) {
    return next(err);
  }
}

/** Role-based authorization: authorize('admin') */
const authorize = (...roles) => (req, res, next) => {
  if (!req.user) return next(ApiError.unauthorized());
  if (!roles.includes(req.user.role)) return next(ApiError.forbidden());
  return next();
};

/** Rider accounts must be linked to a rider profile. */
function requireRiderProfile(req, res, next) {
  if (req.user.role === 'rider' && !req.user.rider) return next(ApiError.forbidden('Your login is not linked to a rider profile. Please contact management.'));
  return next();
}

module.exports = { signToken, authenticate, authorize, requireRiderProfile };
