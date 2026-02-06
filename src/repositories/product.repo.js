const { pool } = require("../db/pool");

// POST /admin/products
async function createProduct({ sku, name, price }) {
  const { rows } = await pool.query(
    `INSERT INTO products (sku, name, price)
     VALUES ($1, $2, $3)
     RETURNING id, sku, name, price`,
    [sku, name, price]
  );
  return rows[0];
}

// GET /products
async function listProducts() {
  const { rows } = await pool.query(
    "SELECT id, sku, name, price FROM products ORDER BY id ASC"
  );
  return rows;
}

// GET /products/:id
async function getProductById(id) {
  const { rows } = await pool.query(
    "SELECT id, sku, name, price FROM products WHERE id = $1",
    [id]
  );
  return rows[0] || null;
}

// PATCH /admin/products/:id
async function updateProductById(id, patch) {
  const keys = Object.keys(patch);
  if (keys.length === 0) return null;

  const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");
  const values = keys.map((k) => patch[k]);
  values.push(id);

  const { rows } = await pool.query(
    `UPDATE products SET ${sets} WHERE id = $${values.length}
     RETURNING id, sku, name, price`,
    values
  );
  return rows[0] || null;
}

module.exports = {
  createProduct,
  listProducts,
  getProductById,
  updateProductById,
};
