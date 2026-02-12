const checkoutService = require("../services/checkout.service");

// POST /checkout
async function checkout(req, res, next) {
  try {
    const userId = Number(req.body.userId);
    const cartId = Number(req.body.cartId);

    const idemKey = req.get("Idempotency-Key");
    if (!idemKey) {
      return res.status(400).json({ error: "Missing Idempotency-Key" });
    }

    const result = await checkoutService.checkout(userId, cartId, idemKey);
    res.status(201).json(result);
  } catch (e) {
    next(e);
  }
}

module.exports = { checkout };
