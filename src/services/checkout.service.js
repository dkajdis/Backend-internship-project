const orderRepo = require("../repositories/order.repo");
const inventoryRepo = require("../repositories/inventory.repo");
const { pool } = require("../db/pool");
const { HttpError } = require("./errors");

async function checkout(userId, cartId, idemKey) {
  if (!Number.isInteger(userId) || userId <= 0) throw new HttpError(400, "userId must be a positive integer");
  if (!Number.isInteger(cartId) || cartId <= 0) throw new HttpError(400, "cartId must be a positive integer");
  if (!idemKey) throw new HttpError(400, "Missing Idempotency-Key");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Use an empty JSON object as the in-progress placeholder because response is NOT NULL.
    await client.query(
      `INSERT INTO idempotency_keys (key, response) VALUES ($1, '{}'::jsonb)
       ON CONFLICT (key) DO NOTHING`,
      [idemKey]
    );

    const idem = await client.query(
      `SELECT response FROM idempotency_keys WHERE key = $1 FOR UPDATE`,
      [idemKey]
    );

    const saved = idem.rows[0]?.response;
    const isPending =
      saved &&
      typeof saved === "object" &&
      !Array.isArray(saved) &&
      Object.keys(saved).length === 0;

    if (saved && !isPending) {
      await client.query("COMMIT");
      return saved;
    }

    const cart = await orderRepo.getCartForCheckout(cartId, client);
    if (!cart) throw new HttpError(404, "Cart not found");
    if (cart.user_id !== userId) throw new HttpError(403, "Cart does not belong to this user");
    if (cart.status !== "open") throw new HttpError(400, `Cart is not open (status: ${cart.status})`);

    if (!cart.items || cart.items.length === 0 || cart.items[0].product_id === null) {
      throw new HttpError(400, "Cart is empty");
    }

    const items = cart.items.filter((item) => item.product_id !== null);

    const totalPrice = items
      .reduce((sum, item) => {
        return sum + parseFloat(item.price) * item.qty;
      }, 0)
      .toFixed(2);

    try {
      await inventoryRepo.decreaseInventoryForCheckout(items, client);
    } catch (e) {
      if (e.message.includes("Insufficient stock")) throw new HttpError(400, e.message);
      throw e;
    }

    const result = await orderRepo.createOrderWithItems(userId, totalPrice, items, client);
    await orderRepo.markCartAsCheckedOut(cartId, client);

    const responseBody = { order: result.order, order_items: result.items };

    await client.query(`UPDATE idempotency_keys SET response = $2 WHERE key = $1`, [idemKey, responseBody]);

    await client.query("COMMIT");
    return responseBody;
  } catch (e) {
    await client.query("ROLLBACK");

    try {
      await pool.query(`DELETE FROM idempotency_keys WHERE key = $1 AND response = '{}'::jsonb`, [idemKey]);
    } catch (_) {}

    throw e;
  } finally {
    client.release();
  }
}

module.exports = { checkout };
