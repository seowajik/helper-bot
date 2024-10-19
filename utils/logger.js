// utils/logger.js
const log = (level, message) => {
  const time = new Date().toISOString();
  console.log(`[${time}] [${level.toUpperCase()}] ${message}`);
};

module.exports = {
  info: (msg) => log("info", msg),
  warn: (msg) => log("warn", msg),
  error: (msg) => log("error", msg),
};
