require("dotenv").config();
const axios = require("axios");
const logger = require("../utils/logger"); // Mengimpor logger dari utils/logger.js

// Ambil data dari ENV untuk endpoint, username, dan password
const apiEndpoint = process.env.CEKGAN_ENDPOINT || "https://cekgan.org";
const username = process.env.CEKGAN_USERNAME || "admin";
const password = process.env.CEKGAN_PASSWORD || "Dewasa123@";

// Fungsi untuk mendapatkan daftar short links dari Cekgan
async function getShortLinks() {
  const apiUrl = `${apiEndpoint}/yourls-api.php?action=list&username=${username}&password=${password}&format=json`;

  try {
    const response = await axios.get(apiUrl);

    // Lihat apakah data yang diinginkan ada di respons
    if (response.data && response.data.result) {
      return response.data.result; // Mengembalikan list short links
    } else {
      throw new Error("Tidak ada short links yang ditemukan.");
    }
  } catch (error) {
    logger.error("Error while fetching short links.", {
      errorMessage: error.message,
      stack: error.stack,
    });
    throw new Error("❌ Gagal mengambil daftar short links dari API Cekgan.");
  }
}

// Fungsi untuk memperbarui short link ke destination baru (newDestination)
async function updateShortLink(shortcode, newDestination) {
  const apiUrl = `${apiEndpoint}/yourls-api.php?action=update&username=${username}&password=${password}&format=json`;

  try {
    const params = {
      shorturl: shortcode, // Keyword (shortcode) dari short link yang ingin diupdate
      url: newDestination, // URL pengganti (destination baru)
      title: "keep", // Menjaga title lama jika ada
    };

    // Kirim API request untuk update shortlink
    const response = await axios.post(apiUrl, null, { params });

    // Pastikan kita memeriksa statusCode 200 dan pesan "success"
    if (
      response.data &&
      response.data.statusCode === 200 &&
      response.data.message.includes("success")
    ) {
      logger.info(`Shortlink ${shortcode} successfully updated.`, {
        shortcode,
        newDestination,
      });
      return true; // Tanda berhasil memperbarui
    } else {
      logger.warn(`Failed to update shortlink ${shortcode}.`, {
        shortcode,
        newDestination,
      });
      return false; // Tanda gagal memperbarui
    }
  } catch (error) {
    logger.error(`Error while updating link ${shortcode}.`, {
      shortcode,
      newDestination,
      errorMessage: error.message,
      stack: error.stack,
    });
    return false; // Jika API request gagal atau terjadi error lain
  }
}

module.exports = {
  name: "cekgan",
  description: "Replace semua destination link tertentu pada layanan cekgan.",
  action: async (ctx) => {
    const message = ctx.message.text;
    const args = message.split(" ").slice(1); // Memecah argumen /cekgan [oldDestination] [newDestination]
    const userId = ctx.message?.from?.id; // Dapatkan userId dari message
    const username = ctx.message?.from?.username; // Dapatkan username dari message

    try {
      // Log saat command /cekgan dijalankan oleh user
      logger.info(`User ${userId} executed /cekgan command.`, {
        userId,
        username,
        args,
      });

      // Validasi input: pastikan ada 2 argumen yang diberikan
      if (args.length !== 2) {
        return ctx.reply(
          "❗ Harap masukkan perintah dengan format: /cekgan [oldDestination] [newDestination]"
        );
      }

      const oldDestination = args[0]; // Destination lama
      const newDestination = args[1]; // Destination baru

      // Langkah 1: Ambil daftar short links dari API Cekgan
      await ctx.reply("🔍 Mengambil daftar short links dari Cekgan...");
      logger.info("Fetching short links from Cekgan...", {
        userId,
        oldDestination,
        newDestination,
      });
      const shortLinks = await getShortLinks();

      // Langkah 2: Filter short links yang memiliki destination URL yang sama dengan oldDestination
      const linksToUpdate = shortLinks.filter(
        (link) => link.url === oldDestination
      );

      if (linksToUpdate.length === 0) {
        logger.warn(
          `No short links found with destination: ${oldDestination}`,
          { userId, oldDestination }
        );
        return ctx.reply(
          `⚠️ Tidak ditemukan short links dengan destination: *${oldDestination}*`
        );
      }

      // Langkah 3: Perbarui setiap short link yang memenuhi kriteria
      let updateResults = [];
      for (const link of linksToUpdate) {
        const isUpdated = await updateShortLink(link.keyword, newDestination);

        // Simpan hasil update untuk setiap shortlink ke array hasil
        if (isUpdated) {
          updateResults.push(
            `✅ *Berhasil memperbarui* ${apiEndpoint}/${link.keyword} -> *${newDestination}*`
          );
        } else {
          updateResults.push(`❌ *Gagal memperbarui* ${link.keyword}`);
        }
      }

      // Langkah 4: Kirim laporan hasil pembaruan ke pengguna (dalam satu pesan)
      logger.info(`User ${userId} has completed /cekgan command.`, {
        userId,
        username,
        updateResults,
      });
      await ctx.replyWithMarkdown(
        `📊 **Laporan Pembaruan**:\n\n${updateResults.join("\n")}`
      );
    } catch (error) {
      // Log setiap error ketika proses gagal
      logger.error("Error in executing /cekgan command.", {
        userId,
        username,
        errorMessage: error.message,
        stack: error.stack,
      });
      await ctx.reply("❌ Terjadi kesalahan saat memperbarui links.");
    }
  },
};
