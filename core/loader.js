// core/loader.js
const fs = require("fs");
const path = require("path");
const logger = require("../utils/logger");

// Fungsi untuk memuat command dari folder "commands"
const loadCommands = (bot) => {
  const commandsPath = path.resolve(__dirname, "../commands");

  // Membaca melalui setiap file di folder commands
  fs.readdirSync(commandsPath).forEach((file) => {
    const commandModule = require(path.join(commandsPath, file));

    // Validasi bahwa module memiliki command dengan key 'name' dan 'action'
    if (commandModule.name && commandModule.action) {
      bot.command(commandModule.name, commandModule.action);
      logger.info(`Loaded command: /${commandModule.name}`);
    } else {
      logger.warn(`Command file ${file} is missing 'name' or 'action'`);
    }
  });
};

module.exports = { loadCommands };
