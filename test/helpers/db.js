const path = require("path");
require("dotenv").config({ path: path.resolve(process.cwd(), ".env") });

const { pool } = require("../../src/db/pool");

async function resetDb() {
  // Use TRUNCATE ... CASCADE to clear dependent tables via FK relations.
  // Order matters for some schemas, but CASCADE makes it simpler.
  await pool.query(`
    TRUNCATE
      order_items,
      orders,
      cart_items,
      carts,
      idempotency_keys,
      inventory,
      products
    RESTART IDENTITY
    CASCADE
  `);
}

async function closeDb() {
  await pool.end();
}

module.exports = { resetDb, closeDb };
