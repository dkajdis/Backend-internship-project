const cartService = require("../services/cart.service");

// POST /cart/items
async function addItem(req, res, next) {
  try {
    const userId = Number(req.body.userId);
    const productId = Number(req.body.productId);
    const qty = Number(req.body.qty);
    const result = await cartService.addItem(userId, productId, qty);
    res.status(201).json(result);
  } catch (e) {
    next(e);
  }
}

// DELETE /cart/items/:productId
async function removeItem(req, res, next) {
  try {
    const productId = Number(req.params.productId);
    // Accept userId from query or body
    const userId = Number(req.query.userId || req.body.userId);
    const removed = await cartService.removeItem(userId, productId);
    res.json(removed);
  } catch (e) {
    next(e);
  }
}

module.exports = { addItem, removeItem };
