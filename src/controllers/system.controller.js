const { pool } = require("../db/pool");

// GET /health
function health(req, res) {
  return res.status(200).json({ status: "ok" });
}

// GET /ready
async function ready(req, res) {
  try {
    await pool.query("SELECT 1");
    return res.status(200).json({ status: "ready" });
  } catch (_) {
    return res.status(503).json({ status: "not_ready" });
  }
}

module.exports = {
  health,
  ready,
};
