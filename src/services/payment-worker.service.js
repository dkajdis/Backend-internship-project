const orderRepo = require("../repositories/order.repo");
const inventoryRepo = require("../repositories/inventory.repo");
const { pool } = require("../db/pool");

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function pickPaymentResult(orderId) {
  const mode = (process.env.PAYMENT_SIMULATION_MODE || "random").toLowerCase();

  if (mode === "rule_based") {
    // Deterministic rule: even orderId succeeds, odd orderId fails.
    return orderId % 2 === 0;
  }

  const rate = clamp(Number(process.env.PAYMENT_SUCCESS_RATE || 0.7), 0, 1);
  return Math.random() < rate;
}

async function processOrderPayment(orderId, decidePaymentResult = pickPaymentResult) {
  if (!Number.isInteger(orderId) || orderId <= 0) {
    throw new Error("orderId must be a positive integer");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const order = await orderRepo.getOrderByIdForUpdate(orderId, client);
    if (!order) {
      await client.query("COMMIT");
      return { processed: false, reason: "order_not_found", orderId };
    }

    if (String(order.status).toLowerCase() !== "pending") {
      await client.query("COMMIT");
      return {
        processed: false,
        reason: "order_not_pending",
        orderId,
        currentStatus: order.status,
      };
    }

    const items = await orderRepo.getOrderItems(orderId, client);
    const isPaymentSuccess = Boolean(await decidePaymentResult(orderId, order, items));

    let updatedOrder;
    if (isPaymentSuccess) {
      updatedOrder = await orderRepo.updateOrderStatus(orderId, "CONFIRMED", client);
      await client.query("COMMIT");
      return {
        processed: true,
        orderId,
        paymentResult: "success",
        orderStatus: updatedOrder.status,
      };
    }

    await inventoryRepo.restoreInventoryForItems(items, client);
    updatedOrder = await orderRepo.updateOrderStatus(orderId, "CANCELLED", client);

    await client.query("COMMIT");
    return {
      processed: true,
      orderId,
      paymentResult: "fail",
      orderStatus: updatedOrder.status,
      restoredInventoryItems: items.length,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  processOrderPayment,
  pickPaymentResult,
};
