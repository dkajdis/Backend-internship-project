const { logError } = require("../utils/json-logger");

function errorMiddleware(err, req, res, next) {
  // Handle malformed JSON from express.json()
  // body-parser sets `err.type === 'entity.parse.failed'` for parse errors
  if (err && (err.type === 'entity.parse.failed' || err instanceof SyntaxError)) {
    return res.status(400).json({ message: 'Invalid JSON body' });
  }
  // pg unique violation
  if (err && err.code === "23505") {
    err.status = 409;
    err.message = err.message || "Unique constraint violated";
  }
  // pg check violation (e.g., CHECK constraints)
  if (err && err.code === "23514") {
    err.status = 400;
    err.message = err.message || "Check constraint violated";
  }

  const status = err.status || 500;
  logError({
    event: "http_error",
    requestId: req.requestId || null,
    orderId: res.locals?.orderId || null,
    status,
    error: err.message || "Internal Server Error",
  });
  res.status(status).json({ message: err.message || "Internal Server Error" });
}

module.exports = { errorMiddleware };
