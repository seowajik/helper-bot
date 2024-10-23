const logger = require("../utils/logger"); // Mengimpor logger dari utils/logger.js

module.exports = {
  name: "start",
  action: async (ctx) => {
    const userId = ctx.message?.from?.id; // Dapatkan ID pengguna dari pesan

    try {
      // Log informasi ketika command /start dijalankan oleh user
      logger.info(`User ${userId} executed /start command`, {
        userId,
        username: ctx.message?.from?.username,
      });

      // Kirim pesan "Welcome" kepada pengguna
      await ctx.reply("Welcome to the bot!");
    } catch (error) {
      // Log error jika terjadi masalah saat menjalankan command /start
      logger.error("Error occurred in /start command", {
        userId,
        errorMessage: error.message,
        stack: error.stack, // Termasuk stack trace untuk debugging
      });

      // Balas ke pengguna ketika terjadi error agar bot terlihat lebih responsif
      await ctx.reply("An error occurred.");
    }
  },
};
