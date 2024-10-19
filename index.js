// index.js
require("dotenv").config(); // Load env pertama
const bot = require("./core/bot");
const logger = require("./utils/logger");
const { loadCommands } = require("./core/loader");

// Log token untuk memastikan token ter-load
console.log("Loaded TELEGRAM_BOT_TOKEN:", process.env.TELEGRAM_BOT_TOKEN);

// Load all commands
loadCommands(bot);

// Event ketika bot berhasil berjalan
bot
  .launch()
  .then(() => {
    logger.info("Bot is up and running!");
  })
  .catch((err) => {
    logger.error("Failed to launch the bot due to:", err); // Update log untuk lebih informatif
  });

// Graceful shutdown
process.once("SIGINT", () => {
  logger.info("SIGINT received, shutting down...");
  bot.stop("SIGINT");
  logger.info("Bot stopped gracefully (SIGINT)");
});

process.once("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down...");
  bot.stop("SIGTERM");
  logger.info("Bot stopped gracefully (SIGTERM)");
});
