const orderRepo = require("../repositories/order.repo");
const { HttpError } = require("./errors");

// GET /orders/:id
async function getOrder(id) {
  if (!Number.isInteger(id) || id <= 0) {
    throw new HttpError(400, "id must be a positive integer");
  }
  const order = await orderRepo.getOrderWithItemsById(id);
  if (!order) throw new HttpError(404, "Order not found");
  return order;
}

// GET /orders?userId=...
async function listOrdersByUser(userId) {
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new HttpError(400, "userId must be a positive integer");
  }
  return orderRepo.listOrdersByUserId(userId);
}

module.exports = { getOrder, listOrdersByUser };
