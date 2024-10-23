require("dotenv").config();
const axios = require("axios");  // Untuk request HTTP ke API Screenshotlayer
const logger = require('../utils/logger');  // Mengimpor logger dari utils/logger.js

// Fungsi untuk mengambil screenshot dari URL menggunakan Screenshotlayer API
async function getScreenshot(url) {
  const accessKey = process.env.SCREENSHOTLAYER_ACCESS_KEY;  // API Key dari .env

  // Endpoint untuk Screenshotlayer API
  const apiUrl = `http://api.screenshotlayer.com/api/capture?access_key=${accessKey}&url=${encodeURIComponent(
    url
  )}&viewport=1440x900&fullpage=1`;

  try {
    // Kirim request ke Screenshotlayer API dengan Axios
    const response = await axios.get(apiUrl, {
      responseType: "arraybuffer",  // Untuk menangani response gambar sebagai ArrayBuffer
    });

    // Log info ketika screenshot diambil dengan sukses
    logger.info(`Screenshot taken successfully for URL: ${url}`);

    return Buffer.from(response.data, "binary"); // Mengembalikan buffer gambar
  } catch (error) {
    logger.error("Error while fetching screenshot from Screenshotlayer API", {
      url,
      errorMessage: error.response?.data || error.message,
      stack: error.stack,
    });
    throw new Error("Tidak dapat mengambil screenshot. Coba lagi nanti.");
  }
}

module.exports = {
  name: "screenshot",
  description: "Ambil screenshot dari sebuah link tertentu",
  action: async (ctx) => {
    const message = ctx.message.text;
    const args = message.split(" ").slice(1);  // Argumen setelah '/screenshot'
    const userId = ctx.message?.from?.id;     // Mendapatkan ID pengguna dari message
    const username = ctx.message?.from?.username;  // Mendapatkan username dari message

    try {
      // Log info ketika pengguna menjalankan command /screenshot
      logger.info(`User ${userId} executed /screenshot command`, {
        userId,
        username,
        message
      });

      // Jika tidak ada URL, balas dengan pesan error
      if (args.length === 0) {
        return ctx.reply(
          "Harap masukkan URL halaman web. Contoh: /screenshot https://example.com"
        );
      }

      const url = args[0];

      // Validasi URL
      const validUrlPattern =
        /^(https?:\/\/)?([\w-]+(\.[\w-]+)+\.?(:\d+)?(\/\S*)?)$/;
      if (!validUrlPattern.test(url)) {
        logger.warn(`Invalid URL entered by user ${userId}: ${url}`, { userId, url });
        return ctx.reply(
          "URL yang dimasukkan tidak valid. Harap masukkan URL dengan format yang benar (http atau https)."
        );
      }

      // Memberi notifikasi ke pengguna bahwa screenshot sedang diproses
      await ctx.reply("Mengambil screenshot... harap tunggu sebentar.");

      // Ambil screenshot dari halaman web menggunakan Screenshotlayer API
      logger.info(`Fetching screenshot for URL: ${url}`, { userId, url });
      const screenshotBuffer = await getScreenshot(url);

      // Kirim screenshot ke pengguna
      await ctx.replyWithPhoto({ source: screenshotBuffer });
      logger.info(`Screenshot successfully sent to user ${userId} for URL: ${url}`);
    } catch (error) {
      // Log error jika terjadi masalah saat mengambil screenshot
      logger.error("Error in screenshot command", {
        userId,
        username,
        url: args[0],  // URL yang diminta
        errorMessage: error.message,
        stack: error.stack,
      });
      await ctx.reply(
        "Terjadi kesalahan saat memproses permintaan Anda. Coba lagi nanti."
      );
    }
  },
};
