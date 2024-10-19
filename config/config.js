// config/config.js
require("dotenv").config();

module.exports = {
  botToken: process.env.TELEGRAM_BOT_TOKEN || "",
};
