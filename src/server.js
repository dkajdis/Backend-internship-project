require("dotenv").config();
const { pool } = require("./db/pool");
const { createApp } = require("./app");

function toPositiveInt(value, fallback) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return fallback;
  return n;
}

const app = createApp();

const port = Number(process.env.PORT || 3000);
const requestTimeoutMs = toPositiveInt(process.env.HTTP_REQUEST_TIMEOUT_MS, 15000);
const keepAliveTimeoutMs = toPositiveInt(process.env.HTTP_KEEP_ALIVE_TIMEOUT_MS, 5000);
const headersTimeoutMs = toPositiveInt(
  process.env.HTTP_HEADERS_TIMEOUT_MS,
  keepAliveTimeoutMs + 1000
);
const shutdownGraceMs = toPositiveInt(process.env.HTTP_SHUTDOWN_GRACE_MS, 10000);

const server = app.listen(port, () => console.log(`Listening on http://localhost:${port}`));
server.requestTimeout = requestTimeoutMs;
server.keepAliveTimeout = keepAliveTimeoutMs;
server.headersTimeout = Math.max(headersTimeoutMs, keepAliveTimeoutMs + 1000);

function closeServer() {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) return reject(error);
      return resolve();
    });
  });
}

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`[shutdown] Received ${signal}. Closing HTTP server...`);
  const forceExitTimer = setTimeout(() => {
    console.error(`[shutdown] Graceful shutdown timed out after ${shutdownGraceMs}ms`);
    process.exit(1);
  }, shutdownGraceMs);
  forceExitTimer.unref();

  try {
    await closeServer();
    await pool.end();
    clearTimeout(forceExitTimer);
    console.log("[shutdown] HTTP server and DB pool closed.");
    process.exit(0);
  } catch (error) {
    clearTimeout(forceExitTimer);
    console.error(`[shutdown] Failed: ${error.message}`);
    process.exit(1);
  }
}

process.on("SIGINT", () => shutdown("SIGINT").catch(() => process.exit(1)));
process.on("SIGTERM", () => shutdown("SIGTERM").catch(() => process.exit(1)));
