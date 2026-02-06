require("dotenv").config();
const { Pool, types } = require("pg");

// Parse Postgres types that `pg` returns as strings into JS numbers
types.setTypeParser(20, (val) => (val === null ? null : parseInt(val, 10))); // bigint -> number
types.setTypeParser(1700, (val) => (val === null ? null : parseFloat(val))); // numeric/decimal -> number

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // host: process.env.DB_HOST,
  // port: Number(process.env.DB_PORT),
  // database: process.env.DB_NAME,
  // user: process.env.DB_USER,
  // password: process.env.DB_PASSWORD,
});

module.exports = { pool };
