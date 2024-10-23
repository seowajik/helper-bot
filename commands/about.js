const logger = require("../utils/logger"); // Mengimpor logger dari utils/logger.js

module.exports = {
  name: "about",
  description: "Dapatkan informasi tentang pembuat bot.",
  action: async (ctx) => {
    const userId = ctx.message?.from?.id; // Mendapatkan ID pengguna yang menjalankan perintah

    try {
      // Log info ketika command /about dijalankan
      logger.info(`User ${userId} executed /about command`, {
        userId,
        username: ctx.message?.from?.username,
      });

      // Kirim balasan mengenai informasi tentang pembuat bot
      await ctx.reply(
        "Bot ini di buat oleh fiki ganteng abiez yang terkenal di dunia bawah."
      );
    } catch (error) {
      // Log error beserta metadata yang relevan jika terjadi kesalahan
      logger.error("Error occurred in /about command", {
        userId,
        errorMessage: error.message,
        stack: error.stack, // Sertakan stack trace untuk debugging lebih mudah
      });

      // Mengirim pesan error kepada pengguna
      await ctx.reply("❌ Terjadi kesalahan saat menampilkan informasi.");
    }
  },
};
