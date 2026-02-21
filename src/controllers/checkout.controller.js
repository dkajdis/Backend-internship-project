const checkoutService = require("../services/checkout.service");
const { logInfo } = require("../utils/json-logger");

// POST /checkout
async function checkout(req, res, next) {
  try {
    const userId = Number(req.body.userId);
    const cartId = Number(req.body.cartId);

    const idemKey = req.get("Idempotency-Key");
    if (!idemKey) {
      return res.status(400).json({ error: "Missing Idempotency-Key" });
    }

    const result = await checkoutService.checkout(userId, cartId, idemKey, {
      requestId: req.requestId || null,
    });

    res.locals.orderId = result?.order?.id || null;
    logInfo({
      event: "checkout_created",
      requestId: req.requestId || null,
      orderId: res.locals.orderId,
      status: result?.order?.status || null,
    });

    res.status(201).json(result);
  } catch (e) {
    next(e);
  }
}

module.exports = { checkout };
