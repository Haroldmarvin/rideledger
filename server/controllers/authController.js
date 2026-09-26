const bcrypt = require('bcryptjs');
const { User, Rider } = require('../models');
const { signToken } = require('../middleware/auth');
const { audit } = require('../services/audit');
const ApiError = require('../utils/ApiError');
const { asyncHandler } = require('../utils/helpers');

const DUMMY_HASH = bcrypt.hashSync('rideledger-timing-guard', 10);

function validatePassword(pw) {
  if (typeof pw !== 'string' || pw.length < 8) return 'Password must be at least 8 characters.';
  if (pw.length > 128) return 'Password is too long.';
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'Password must contain letters and numbers.';
  return null;
}

async function buildProfile(userId) {
  const user = await User.findById(userId).lean();
  if (!user) return null;
  let rider = null;
  if (user.rider) rider = await Rider.findById(user.rider).populate('bike', 'bikeId registrationNumber status').lean();
  delete user.passwordHash;
  delete user.tokenVersion;
  delete user.__v;
  return { ...user, riderProfile: rider };
}

const login = asyncHandler(async (req, res) => {
  const identifier = typeof req.body.identifier === 'string' ? req.body.identifier.trim().toLowerCase()
    : typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  if (!identifier || !password) throw ApiError.badRequest('Please enter your email/username and password.');

  const user = await User.findOne({ $or: [{ email: identifier }, { username: identifier }] }).select('+passwordHash +tokenVersion');
  // Always run bcrypt to keep timing consistent whether or not the user exists
  const ok = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);
  if (!user || !ok) throw ApiError.unauthorized('Incorrect email/username or password.');
  if (user.status !== 'active') throw ApiError.forbidden('Your account has been deactivated. Please contact management.');
  if (user.role === 'rider' && user.rider) {
    const rider = await Rider.findById(user.rider).lean();
    if (!rider || rider.status !== 'active') throw ApiError.forbidden('Your rider account is inactive. Please contact management.');
  }

  user.lastLoginAt = new Date();
  await user.save();
  req.user = { _id: user._id, name: user.name, role: user.role, rider: user.rider };
  await audit(req, { action: 'User logged in', entityType: 'User', entityId: user._id, entityRef: user.email });

  const token = signToken(user);
  res.json({ token, user: await buildProfile(user._id) });
});

const me = asyncHandler(async (req, res) => {
  const profile = await buildProfile(req.user._id);
  if (!profile) throw ApiError.unauthorized();
  res.json({ user: profile });
});

const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const user = await User.findById(req.user._id).select('+passwordHash +tokenVersion');
  if (!user || !(await bcrypt.compare(String(currentPassword || ''), user.passwordHash))) {
    throw ApiError.badRequest('Your current password is incorrect.', { fieldErrors: { currentPassword: 'Incorrect password.' } });
  }
  const problem = validatePassword(newPassword);
  if (problem) throw ApiError.badRequest(problem, { fieldErrors: { newPassword: problem } });
  user.passwordHash = await bcrypt.hash(newPassword, 10);
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  await user.save();
  await audit(req, { action: 'User changed own password', entityType: 'User', entityId: user._id, entityRef: user.email });
  res.json({ message: 'Password changed. Please log in again with your new password.', token: signToken(user) });
});

module.exports = { login, me, changePassword, validatePassword, buildProfile };
