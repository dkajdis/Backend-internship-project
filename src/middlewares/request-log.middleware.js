const { logInfo } = require("../utils/json-logger");

function requestLogMiddleware(req, res, next) {
  const startedAt = Date.now();

  res.on("finish", () => {
    logInfo({
      event: "http_request",
      requestId: req.requestId || null,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      orderId: res.locals.orderId || null,
      durationMs: Date.now() - startedAt,
    });
  });

  next();
}

module.exports = { requestLogMiddleware };
