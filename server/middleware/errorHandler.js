const multer = require('multer');
const { env } = require('../config/env');

function notFound(req, res) {
  res.status(404).json({ message: 'The requested resource was not found.' });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let status = err.statusCode || err.status || 500;
  let message = 'Something went wrong on our side. Please try again.';
  let details;

  if (err.expose || (status >= 400 && status < 500 && err.message)) {
    message = err.message;
    details = err.details;
  }

  if (err instanceof multer.MulterError) {
    status = 400;
    message = err.code === 'LIMIT_FILE_SIZE'
      ? `Receipt file is too large. Maximum size is ${env.maxUploadMb} MB.`
      : 'The receipt could not be uploaded. Please try a different file.';
  } else if (err.name === 'ValidationError' && err.errors) {
    status = 400;
    message = 'Some information is missing or invalid.';
    details = { fieldErrors: Object.fromEntries(Object.entries(err.errors).map(([k, v]) => [k, v.message])) };
  } else if (err.name === 'CastError') {
    status = 400;
    message = 'Invalid identifier or value.';
  } else if (err.code === 11000) {
    status = 409;
    const field = Object.keys(err.keyPattern || err.keyValue || {})[0] || 'value';
    message = `That ${field} is already in use.`;
  } else if (err.type === 'entity.parse.failed') {
    status = 400;
    message = 'The request could not be read. Please try again.';
  } else if (err.type === 'entity.too.large') {
    status = 413;
    message = 'The request is too large.';
  } else if (err.name === 'MongoServerSelectionError' || err.name === 'MongoNetworkError') {
    status = 503;
    message = 'The database is temporarily unavailable. Please try again shortly.';
  }

  if (status >= 500 && !env.isTest) console.error('[error]', err);

  const body = { message };
  if (details) body.details = details;
  res.status(status).json(body);
}

module.exports = { notFound, errorHandler };
