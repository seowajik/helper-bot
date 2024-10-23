require("dotenv").config();
const axios = require("axios");
const logger = require("../utils/logger"); // Mengimpor logger dari utils/logger.js

// Fungsi untuk mengambil daftar short links dari Pxl.to
async function getShortLinks(limit = 50, offset = 0) {
  const apiUrl = `https://api.pxl.to/api/v1/short?take=${limit}&skip=${offset}`;
  const apiKey = process.env.PXLTO_API_KEY;

  try {
    const response = await axios.get(apiUrl, {
      headers: {
        Authorization: `Bearer ${apiKey}`, // API Key dalam header Authorization
      },
    });

    // Log informasi saat short links berhasil diambil
    logger.info("Short links fetched successfully from PXL.to", {
      limit,
      offset,
      totalLinks: response.data.data.length,
    });

    return response.data.data;
  } catch (error) {
    if (error.response) {
      logger.error("Error response while fetching PXL.to short links", {
        status: error.response.status,
        data: error.response.data,
      });
    } else {
      logger.error("Error fetching PXL.to short links", {
        message: error.message,
      });
    }
    throw new Error("❌ Gagal mengambil daftar short links.");
  }
}

// Fungsi untuk memperbarui short link
async function updateShortLink(id, newDestination) {
  const apiUrl = `https://api.pxl.to/api/v1/short/${encodeURIComponent(id)}`;
  const apiKey = process.env.PXLTO_API_KEY;

  try {
    const response = await axios.put(
      apiUrl,
      { destination: newDestination },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    // Log saat short link berhasil diperbarui
    logger.info(`Short link ${id} successfully updated to ${newDestination}`, {
      shortLinkId: id,
      newDestination,
    });

    return response.data;
  } catch (error) {
    if (error.response) {
      logger.error(`Error response from API when updating link ${id}`, {
        status: error.response.status,
        data: error.response.data,
      });
    } else {
      logger.error(`Error updating short link ${id}`, {
        errorMessage: error.message,
      });
    }
    throw new Error(`❌ Gagal memperbarui short link ${id}`);
  }
}

module.exports = {
  name: "pxl",
  description: "Replace semua destination link tertentu pada layanan pxl.",
  action: async (ctx) => {
    const message = ctx.message.text;
    const args = message.split(" ").slice(1); // Mendapatkan argumen [oldDestination] [newDestination]
    const userId = ctx.message?.from?.id; // Dapatkan userId dari message
    const username = ctx.message?.from?.username; // Dapatkan username dari message

    // Log command yang dijalankan user
    logger.info(`User ${userId} executed /pxl command`, {
      userId,
      username,
      message,
    });

    // Validasi input
    if (args.length < 2) {
      logger.warn(`Invalid arguments from user ${userId}`, {
        userId,
        username,
        args,
      });
      return ctx.reply(
        "❗ Harap masukkan format yang valid: /pxl [oldDestination] [newDestination]"
      );
    }

    const oldDestination = args[0]; // Tujuan lama
    const newDestination = args[1]; // Tujuan baru

    try {
      // Log proses pengambilan short links dimulai
      logger.info(
        `Fetching short links for user ${userId} with old destination: ${oldDestination}`
      );

      // Kirim notifikasi awal ke pengguna
      await ctx.reply("🔍 Mengambil daftar short links...");

      // STEP 1: Ambil short links dari API
      const shortLinks = await getShortLinks(50, 0);

      // STEP 2: Filter links yang sesuai dengan destination lama (oldDestination)
      const linksToUpdate = shortLinks.filter(
        (link) => link.destination === oldDestination
      );

      if (linksToUpdate.length === 0) {
        logger.warn(`No links found for destination ${oldDestination}`, {
          userId,
          oldDestination,
        });
        return ctx.reply(
          `⚠️ Tidak ditemukan short links dengan destination: *${oldDestination}*`
        );
      }

      // STEP 3: Update setiap short link yang ditemukan
      let updateResults = [];
      for (const link of linksToUpdate) {
        try {
          const result = await updateShortLink(link.id, newDestination);
          updateResults.push(
            `✅ *Berhasil memperbarui* ${link.id} -> *${newDestination}*`
          );
        } catch (error) {
          updateResults.push(`❌ *Gagal memperbarui* ${link.id}`);
        }
      }

      // Log hasil pembaruan short links
      logger.info("Short links update completed", {
        userId,
        oldDestination,
        newDestination,
        results: updateResults,
      });

      // Kirim laporan hasil pembaruan ke pengguna
      await ctx.replyWithMarkdown(
        `📊 **Laporan Pembaruan**:\n\n${updateResults.join("\n")}`
      );
    } catch (error) {
      // Log error jika terjadi masalah dalam proses
      logger.error("Error occurred in /pxl command", {
        userId,
        username,
        errorMessage: error.message,
        stack: error.stack,
      });

      // Kirim pesan error ke pengguna
      await ctx.reply("❌ Terjadi kesalahan saat memperbarui links.");
    }
  },
};
