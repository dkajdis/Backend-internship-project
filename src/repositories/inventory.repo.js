const { pool } = require("../db/pool");

// POST /admin/products
async function createInventoryRow(productId) {
  await pool.query(
    `INSERT INTO inventory (product_id, available_qty)
     VALUES ($1, 0)
     ON CONFLICT (product_id) DO NOTHING`,
    [productId]
  );
}

// GET /admin/inventory/:productId
async function getInventoryByProductId(productId) {
  const { rows } = await pool.query(
    "SELECT product_id, available_qty FROM inventory WHERE product_id = $1",
    [productId]
  );
  return rows[0] || null;
}

// POST /admin/inventory/restock
async function restock(productId, qty) {
  const { rows } = await pool.query(
    `UPDATE inventory
     SET available_qty = available_qty + $1
     WHERE product_id = $2
     RETURNING product_id, available_qty`,
    [qty, productId]
  );
  return rows[0] || null;
}

module.exports = {
  createInventoryRow,
  getInventoryByProductId,
  restock,
};
