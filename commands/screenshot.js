require("dotenv").config(); // Untuk mengambil API Key dari .env
const axios = require("axios"); // Untuk request HTTP ke API Screenshotlayer

// Fungsi untuk mengambil screenshot dari URL menggunakan Screenshotlayer API
async function getScreenshot(url) {
  const accessKey = process.env.SCREENSHOTLAYER_ACCESS_KEY; // API Key dari file .env

  // Endpoint untuk Screenshotlayer API
  const apiUrl = `http://api.screenshotlayer.com/api/capture?access_key=${accessKey}&url=${encodeURIComponent(
    url
  )}&viewport=1440x900&fullpage=1`;

  try {
    // Kirim request ke Screenshotlayer API dengan Axios
    const response = await axios.get(apiUrl, {
      responseType: "arraybuffer", // Untuk menangani respon gambar sebagai ArrayBuffer
    });

    return Buffer.from(response.data, "binary"); // Mengembalikan buffer gambar
  } catch (error) {
    console.error(
      "Gagal mengambil screenshot:",
      error.response?.data || error.message
    );
    throw new Error("Tidak dapat mengambil screenshot. Coba lagi nanti.");
  }
}

module.exports = {
  name: "screenshot",
  description: "Ambil screenshot dari sebuah link tertentu",
  action: async (ctx) => {
    const message = ctx.message.text;
    const args = message.split(" ").slice(1); // Argumen setelah '/screenshot'

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
      return ctx.reply(
        "URL yang dimasukkan tidak valid. Harap masukkan URL dengan format yang benar (http atau https)."
      );
    }

    try {
      // Memberi notifikasi ke pengguna bahwa screenshot sedang diproses
      await ctx.reply("Mengambil screenshot... harap tunggu sebentar.");

      // Ambil screenshot dari halaman web menggunakan Screenshotlayer API
      const screenshotBuffer = await getScreenshot(url);

      // Kirim screenshot ke pengguna
      await ctx.replyWithPhoto({ source: screenshotBuffer });
    } catch (error) {
      console.error("Error in screenshot:", error.message);
      await ctx.reply(
        "Terjadi kesalahan saat memproses permintaan Anda. Coba lagi nanti."
      );
    }
  },
};
