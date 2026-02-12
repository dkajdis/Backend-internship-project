const { pool } = require("../db/pool");

// Create a new order with order_items
// - if client provided: use existing transaction (no BEGIN/COMMIT)
// - else: create its own transaction (backward compatible)
async function createOrderWithItems(userId, totalPrice, orderItems, client = null) {
  if (client) {
    // Use outer transaction
    const orderResult = await client.query(
      `INSERT INTO orders (user_id, total_price, status)
       VALUES ($1, $2, 'pending')
       RETURNING id, user_id, total_price, status`,
      [userId, totalPrice]
    );
    const order = orderResult.rows[0];

    const orderItemsInserted = [];
    for (const item of orderItems) {
      const itemResult = await client.query(
        `INSERT INTO order_items (order_id, product_id, qty, price)
         VALUES ($1, $2, $3, $4)
         RETURNING id, order_id, product_id, qty, price`,
        [order.id, item.product_id, item.qty, item.price]
      );
      orderItemsInserted.push(itemResult.rows[0]);
    }

    return { order, items: orderItemsInserted };
  }

  // No client: keep original behavior
  const localClient = await pool.connect();
  try {
    await localClient.query("BEGIN");

    const orderResult = await localClient.query(
      `INSERT INTO orders (user_id, total_price, status)
       VALUES ($1, $2, 'pending')
       RETURNING id, user_id, total_price, status`,
      [userId, totalPrice]
    );
    const order = orderResult.rows[0];

    const orderItemsInserted = [];
    for (const item of orderItems) {
      const itemResult = await localClient.query(
        `INSERT INTO order_items (order_id, product_id, qty, price)
         VALUES ($1, $2, $3, $4)
         RETURNING id, order_id, product_id, qty, price`,
        [order.id, item.product_id, item.qty, item.price]
      );
      orderItemsInserted.push(itemResult.rows[0]);
    }

    await localClient.query("COMMIT");
    return { order, items: orderItemsInserted };
  } catch (e) {
    await localClient.query("ROLLBACK");
    throw e;
  } finally {
    localClient.release();
  }
}

// Mark cart as checked out
async function markCartAsCheckedOut(cartId, client = null) {
  const db = client || pool;
  const { rows } = await db.query(
    `UPDATE carts SET status = 'checked_out' WHERE id = $1 RETURNING id, user_id, status`,
    [cartId]
  );
  return rows[0] || null;
}

// Get cart with all details for checkout validation
async function getCartForCheckout(cartId, client = null) {
  const db = client || pool;
  const { rows } = await db.query(
    `SELECT c.id, c.user_id, c.status,
            json_agg(
              json_build_object(
                'product_id', ci.product_id,
                'qty', ci.qty,
                'price', p.price
              )
            ) as items
     FROM carts c
     LEFT JOIN cart_items ci ON c.id = ci.cart_id
     LEFT JOIN products p ON ci.product_id = p.id
     WHERE c.id = $1
     GROUP BY c.id, c.user_id, c.status`,
    [cartId]
  );
  return rows[0] || null;
}

module.exports = {
  createOrderWithItems,
  markCartAsCheckedOut,
  getCartForCheckout,
};
