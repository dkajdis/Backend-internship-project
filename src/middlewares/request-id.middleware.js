const { randomUUID } = require("crypto");

function requestIdMiddleware(req, res, next) {
  const incoming = req.get("x-request-id");
  const requestId =
    typeof incoming === "string" && incoming.trim() !== ""
      ? incoming.trim()
      : randomUUID();

  req.requestId = requestId;
  res.setHeader("x-request-id", requestId);
  next();
}

module.exports = { requestIdMiddleware };
