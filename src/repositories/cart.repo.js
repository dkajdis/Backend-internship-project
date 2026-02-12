const { pool } = require("../db/pool");

async function findOpenCartByUserId(userId) {
  const { rows } = await pool.query(
    "SELECT id, user_id, status FROM carts WHERE user_id = $1 AND status = 'open' LIMIT 1",
    [userId]
  );
  return rows[0] || null;
}

async function createCart(userId) {
  const { rows } = await pool.query(
    `INSERT INTO carts (user_id, status) VALUES ($1, 'open') RETURNING id, user_id, status`,
    [userId]
  );
  return rows[0];
}

async function findOrCreateOpenCart(userId) {
  let cart = await findOpenCartByUserId(userId);
  if (cart) return cart;
  return createCart(userId);
}

async function addOrUpdateCartItem(cartId, productId, qty) {
  const { rows } = await pool.query(
    `INSERT INTO cart_items (cart_id, product_id, qty)
     VALUES ($1, $2, $3)
     ON CONFLICT (cart_id, product_id) DO UPDATE
     SET qty = cart_items.qty + EXCLUDED.qty
     RETURNING id, cart_id, product_id, qty`,
    [cartId, productId, qty]
  );
  return rows[0] || null;
}

async function removeCartItem(cartId, productId) {
  const { rows } = await pool.query(
    `DELETE FROM cart_items WHERE cart_id = $1 AND product_id = $2 RETURNING id, cart_id, product_id, qty`,
    [cartId, productId]
  );
  return rows[0] || null;
}

async function getCartItems(cartId) {
  const { rows } = await pool.query(
    `SELECT product_id, qty FROM cart_items WHERE cart_id = $1 ORDER BY id ASC`,
    [cartId]
  );
  return rows;
}

module.exports = {
  findOpenCartByUserId,
  createCart,
  findOrCreateOpenCart,
  addOrUpdateCartItem,
  removeCartItem,
  getCartItems,
};
