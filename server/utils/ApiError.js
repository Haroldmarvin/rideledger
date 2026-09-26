/** Error type whose message is safe to show to end users. */
class ApiError extends Error {
  constructor(statusCode, message, details) {
    super(message);
    this.statusCode = statusCode;
    this.details = details; // e.g. { fieldErrors: { customerName: '...' } }
    this.expose = true;
  }

  static badRequest(message, details) { return new ApiError(400, message, details); }
  static unauthorized(message = 'Please log in to continue.') { return new ApiError(401, message); }
  static forbidden(message = 'You do not have permission to do that.') { return new ApiError(403, message); }
  static notFound(message = 'Record not found.') { return new ApiError(404, message); }
  static conflict(message, details) { return new ApiError(409, message, details); }
  static locked(message, details) { return new ApiError(423, message, details); }
}

module.exports = ApiError;
