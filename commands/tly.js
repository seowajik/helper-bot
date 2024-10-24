const axios = require("axios");
const logger = require("../utils/logger"); // Mengimpor logger dari utils/logger.js

const BASE_URL = process.env.TLY_BASE_URL || "https://api.t.ly"; // API base URL
const TLY_API_KEY = process.env.TLY_API_KEY; // T.LY API Key dari .env

// Setup default axios instance dengan bearer token
const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: `Bearer ${TLY_API_KEY}`, // Bearer token untuk otentikasi
  },
});

// Fungsi untuk menangani error API
async function handleApiError(error) {
  if (error.response) {
    logger.error("API error response", {
      status: error.response.status,
      data: error.response.data,
    });
    return {
      status: "error",
      message: error.response.data.message || "Terjadi kesalahan pada API.",
    };
  }
  logger.error("API error", { message: error.message });
  return {
    status: "error",
    message: error.message,
  };
}

// Fungsi untuk mendapatkan daftar shortlink yang sesuai dengan destinasi lama (oldDestination)
async function getShortLinksByDestination(oldDestination) {
  try {
    // Log info saat mencari shortlink berdasarkan destination lama
    logger.info(`Fetching shortlinks for destination: ${oldDestination}`);

    const response = await apiClient.get("/api/v1/link/list", {
      params: {
        search: oldDestination, // Menggunakan destinasi sebagai parameter pencarian
      },
    });

    // Log response dari API
    logger.info("Received response from T.LY API for shortlink list", {
      oldDestination,
      data: response.data,
    });

    if (response.data && response.data.data.length) {
      const matchingLinks = response.data.data.filter(
        (link) => link.long_url === oldDestination
      );
      if (matchingLinks.length) {
        return {
          status: "success",
          data: matchingLinks,
        };
      }
    }

    logger.warn(`No shortlinks found for destination: ${oldDestination}`);
    return {
      status: "error",
      message: `Tidak ditemukan shortlink dengan destinasi ${oldDestination}`,
    };
  } catch (error) {
    return handleApiError(error);
  }
}

// Fungsi untuk memperbarui destinasi shortlink
async function updateShortLink(shortUrl, newDestination) {
  const requestBody = {
    short_url: shortUrl,
    long_url: newDestination,
  };

  try {
    // Log saat mulai memperbarui shortlink
    logger.info(
      `Updating shortlink: ${shortUrl} to new destination: ${newDestination}`
    );

    const response = await apiClient.put("/api/v1/link", requestBody);

    // Log setelah berhasil memperbarui shortlink
    logger.info(
      `Shortlink ${shortUrl} successfully updated to ${newDestination}`,
      {
        shortUrl,
        newDestination,
      }
    );

    return {
      status: "success",
      data: response.data,
    };
  } catch (error) {
    return handleApiError(error);
  }
}

// Fungsi proses utama untuk mengganti oldDestination dengan newDestination
async function replaceOldDestinationWithNew(oldDestination, newDestination) {
  logger.info("Starting replacement of oldDestination with newDestination", {
    oldDestination,
    newDestination,
  });

  const linksResponse = await getShortLinksByDestination(oldDestination);

  if (linksResponse.status === "success" && linksResponse.data.length) {
    const shortLinks = linksResponse.data;
    let resultMessage = `Ditemukan ${shortLinks.length} shortlink dengan URL lama ${oldDestination}. Memperbarui...\n\n`;

    for (const link of shortLinks) {
      const updateResponse = await updateShortLink(
        link.short_url,
        newDestination
      );

      if (updateResponse.status === "success") {
        resultMessage += `✅ Berhasil memperbarui shortlink: ${link.short_url} ke ${newDestination}\n`;
      } else {
        resultMessage += `❌ Gagal memperbarui shortlink: ${link.short_url}\n`;
      }
    }

    // Log hasil pembaruan shortlink
    logger.info("Replacement completed", {
      oldDestination,
      newDestination,
      resultMessage,
    });

    // Kembalikan hasil pembaruan
    return {
      status: "success",
      message: resultMessage,
    };
  } else {
    logger.warn(
      `No shortlinks found or error occurred for destination: ${oldDestination}`
    );
  }

  // Jika tidak ditemukan shortlink atau terjadi error di tahap pencarian
  return {
    status: "error",
    message: linksResponse.message,
  };
}

// Command handler utama untuk Bot Telegram
module.exports = {
  name: "tly",
  description: "Commands untuk mengelola T.LY short links",
  action: async (ctx) => {
    const args = ctx.message.text.split(" ");
    const userId = ctx.message?.from?.id; // Mendapatkan ID pengguna dari message
    const username = ctx.message?.from?.username; // Mendapatkan username dari message

    // Log info ketika pengguna memulai command /tly
    logger.info(`User ${userId} executed /tly command`, {
      userId,
      username,
      message: ctx.message.text,
    });

    if (!TLY_API_KEY) {
      logger.error("T.LY API Key is missing");
      return ctx.reply(
        "API Key T.LY tidak ditemukan. Pastikan Anda sudah mengatur TLY_API_KEY di .env."
      );
    }

    // Pastikan kita memiliki argumen oldDestination dan newDestination
    const oldDestination = args[1];
    const newDestination = args[2];

    if (!oldDestination || !newDestination) {
      logger.warn(`Invalid arguments from user ${userId}`, {
        userId,
        username,
        oldDestination,
        newDestination,
      });
      return ctx.reply(
        "Format salah! Gunakan: /tly [oldDestination] [newDestination]"
      );
    }

    try {
      // Log proses penggantian destinasi dimulai
      logger.info(`Processing T.LY shortlink replacement for user ${userId}`, {
        oldDestination,
        newDestination,
      });

      // Eksekusi penggantian oldDestination ke newDestination
      const replacementResult = await replaceOldDestinationWithNew(
        oldDestination,
        newDestination
      );

      logger.info(`Replacement result for user ${userId}`, {
        userId,
        result: replacementResult.message,
      });

      return ctx.reply(replacementResult.message);
    } catch (err) {
      // Log error jika terjadi masalah dalam proses
      logger.error("Error in /tly command execution", {
        userId,
        username,
        errorMessage: err.message,
        stack: err.stack,
      });

      ctx.reply(
        "Terjadi kesalahan saat memproses permintaan. Coba lagi nanti."
      );
    }
  },
};
