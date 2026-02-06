const path = require("path");
require("dotenv").config({ path: path.resolve(process.cwd(), ".env") });

const { pool } = require("../../src/db/pool");

async function resetDb() {
  // The inventory depends on the products, so using CASCADE is the most convenient.
  await pool.query("TRUNCATE products, inventory RESTART IDENTITY CASCADE");
}

async function closeDb() {
  await pool.end();
}

module.exports = { resetDb, closeDb };
