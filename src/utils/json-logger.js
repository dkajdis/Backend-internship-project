function write(level, payload) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    ...payload,
  };
  const line = JSON.stringify(entry);
  if (level === "error") {
    console.error(line);
    return;
  }
  console.log(line);
}

function logInfo(payload) {
  write("info", payload);
}

function logError(payload) {
  write("error", payload);
}

module.exports = { logInfo, logError };
