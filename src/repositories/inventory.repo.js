const { pool } = require("../db/pool");

// POST /admin/products
async function createInventoryRow(productId, client = null) {
  const db = client || pool;
  await db.query(
    `INSERT INTO inventory (product_id, available_qty)
     VALUES ($1, 0)
     ON CONFLICT (product_id) DO NOTHING`,
    [productId]
  );
}

// GET /admin/inventory/:productId
async function getInventoryByProductId(productId, client = null) {
  const db = client || pool;
  const { rows } = await db.query(
    "SELECT product_id, available_qty FROM inventory WHERE product_id = $1",
    [productId]
  );
  return rows[0] || null;
}

// POST /admin/inventory/restock
async function restock(productId, qty, client = null) {
  const db = client || pool;
  const { rows } = await db.query(
    `UPDATE inventory
     SET available_qty = available_qty + $1
     WHERE product_id = $2
     RETURNING product_id, available_qty`,
    [qty, productId]
  );
  return rows[0] || null;
}

// Checkout: Verify stock and decrease inventory
// - if client provided: use existing transaction (no BEGIN/COMMIT)
// - else: create its own transaction (backward compatible)
async function decreaseInventoryForCheckout(items, client = null) {
  if (client) {
    // Use outer transaction
    const inventoryQuery = `
      SELECT product_id, available_qty
      FROM inventory
      WHERE product_id = ANY($1)
      ORDER BY product_id
      FOR UPDATE
    `;
    const productIds = items.map(item => item.product_id);
    const inventoryResult = await client.query(inventoryQuery, [productIds]);
    const inventories = inventoryResult.rows;

    for (const item of items) {
      const inv = inventories.find(i => i.product_id === item.product_id);
      if (!inv) throw new Error(`Inventory not found for product ${item.product_id}`);
      if (inv.available_qty < item.qty) {
        throw new Error(
          `Insufficient stock for product ${item.product_id}. Available: ${inv.available_qty}, Required: ${item.qty}`
        );
      }
    }

    const decreasedInventories = [];
    for (const item of items) {
      const result = await client.query(
        `UPDATE inventory
         SET available_qty = available_qty - $1
         WHERE product_id = $2
         RETURNING product_id, available_qty`,
        [item.qty, item.product_id]
      );
      decreasedInventories.push(result.rows[0]);
    }

    return decreasedInventories;
  }

  // No client: keep original behavior
  const localClient = await pool.connect();
  try {
    await localClient.query("BEGIN");

    const inventoryQuery = `
      SELECT product_id, available_qty
      FROM inventory
      WHERE product_id = ANY($1)
      ORDER BY product_id
      FOR UPDATE
    `;
    const productIds = items.map(item => item.product_id);
    const inventoryResult = await localClient.query(inventoryQuery, [productIds]);
    const inventories = inventoryResult.rows;

    for (const item of items) {
      const inv = inventories.find(i => i.product_id === item.product_id);
      if (!inv) throw new Error(`Inventory not found for product ${item.product_id}`);
      if (inv.available_qty < item.qty) {
        throw new Error(
          `Insufficient stock for product ${item.product_id}. Available: ${inv.available_qty}, Required: ${item.qty}`
        );
      }
    }

    const decreasedInventories = [];
    for (const item of items) {
      const result = await localClient.query(
        `UPDATE inventory
         SET available_qty = available_qty - $1
         WHERE product_id = $2
         RETURNING product_id, available_qty`,
        [item.qty, item.product_id]
      );
      decreasedInventories.push(result.rows[0]);
    }

    await localClient.query("COMMIT");
    return decreasedInventories;
  } catch (e) {
    await localClient.query("ROLLBACK");
    throw e;
  } finally {
    localClient.release();
  }
}

module.exports = {
  createInventoryRow,
  getInventoryByProductId,
  restock,
  decreaseInventoryForCheckout,
};
