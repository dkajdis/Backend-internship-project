const orderService = require("../services/order.service");

// GET /orders/:id
async function detail(req, res, next) {
  try {
    const id = Number(req.params.id);
    const order = await orderService.getOrder(id);
    res.json(order);
  } catch (e) {
    next(e);
  }
}

// GET /orders?userId=...
async function listByUser(req, res, next) {
  try {
    const userId = Number(req.query.userId);
    const rows = await orderService.listOrdersByUser(userId);
    res.json(rows);
  } catch (e) {
    next(e);
  }
}

module.exports = { detail, listByUser };
