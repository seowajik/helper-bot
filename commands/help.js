const fs = require("fs");
const path = require("path");

module.exports = {
  name: "help",
  action: async (ctx) => {
    try {
      // Direktori tempat semua command berada
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

        // Pastikan command punya 'name'
        if (command.name && command.description) {
          helpMessage += `🔹 */${command.name}*\n_${command.description}_\n\n`;
        }
      }

      // Kirimkan pesan kepada pengguna
      await ctx.replyWithMarkdown(helpMessage);
    } catch (error) {
      console.error("Error on /help command:", error);
      await ctx.reply("❌ Terjadi kesalahan saat mengambil daftar bantuan.");
    }
  },
};
