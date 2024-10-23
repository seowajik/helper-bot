const fs = require("fs");
const path = require("path");
const logger = require("../utils/logger"); // Mengimpor logger

module.exports = {
  name: "help",
  action: async (ctx) => {
    const userId = ctx.message?.from?.id; // Dapatkan ID pengguna dari pesan

    try {
      // Log info saat eksekusi perintah /help dimulai
      logger.info(`User ${userId} requested help command`, {
        userId,
        username: ctx.message?.from?.username,
      });

      // Direktori tempat semua command bot berada
      const commandsPath = path.join(__dirname);
      const commandFiles = fs
        .readdirSync(commandsPath)
        .filter((file) => file.endsWith(".js"));

      // Array untuk menyimpan deskripsi setiap command
      let helpMessage = "📋 *Daftar command yang tersedia:*\n\n";

      // Iterasi setiap file command
      for (const file of commandFiles) {
        // Jangan sertakan diri sendiri (help.js) dalam daftar
        if (file === "help.js") continue;

        // Load file command
        const command = require(path.join(commandsPath, file));

        // Jika command memiliki 'name' dan 'description', tambahkan ke help
        if (command.name && command.description) {
          helpMessage += `🔹 */${command.name}*\n_${command.description}_\n\n`;
        }
      }

      // Kirimkan pesan daftar command yang tersedia ke pengguna
      await ctx.replyWithMarkdown(helpMessage);
    } catch (error) {
      // Log error dengan metadata terkait userId untuk troubleshooting
      logger.error(`Error on /help command:`, {
        userId,
        errorMessage: error.message,
        stack: error.stack,
      });

      // Kirim respon kesalahan ke pengguna
      await ctx.reply("❌ Terjadi kesalahan saat mengambil daftar bantuan.");
    }
  },
};
