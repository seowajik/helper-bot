// commands/start.js
module.exports = {
  name: "start",
  action: async (ctx) => {
    try {
      await ctx.reply("Welcome to the bot!");
    } catch (error) {
      console.error("Error on /start command:", error);
      await ctx.reply("An error occurred.");
    }
  },
};
