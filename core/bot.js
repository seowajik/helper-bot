// core/bot.js
const { Telegraf } = require("telegraf");
const { botToken } = require("../config/config");

// Pastikan token masuk
if (!botToken) {
  throw new Error(
    "Bot token is missing. Please set TELEGRAM_BOT_TOKEN in .env"
  );
}

// Inisialisasi bot instance
const bot = new Telegraf(botToken);

module.exports = bot;
