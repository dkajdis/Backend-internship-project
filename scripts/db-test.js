require("dotenv").config();
const { Client } = require("pg");

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  await client.connect();
  const res = await client.query("SELECT 1 AS ok");
  console.log(res.rows); // Expect - [ { ok: 1 } ]
  await client.end();
}

main().catch((e) => {
  console.error("DB test failed:", e);
  process.exit(1);
});
