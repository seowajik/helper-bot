const axios = require("axios");

const BASE_URL = process.env.TLY_BASE_URL || "https://api.t.ly"; // API base URL
const TLY_API_KEY = process.env.TLY_API_KEY; // T.LY API Key dari env

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
    console.error("API error response: ", error.response.data);
    return {
      status: "error",
      message: error.response.data.message || "Terjadi kesalahan pada API.",
    };
  }
  console.error("API error: ", error.message);
  return {
    status: "error",
    message: error.message,
  };
}

// Fungsi untuk mendapatkan daftar shortlink yang sesuai dengan destinasi lama (oldDestination)
async function getShortLinksByDestination(oldDestination) {
  try {
    // Cari shortlink yang sesuai dengan oldDestination
    const response = await apiClient.get("/api/v1/link/list", {
      params: {
        search: oldDestination, // Menggunakan destiny sebagai parameter pencarian
      },
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
    const response = await apiClient.put("/api/v1/link", requestBody);
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

    // Kembalikan hasil yang berhasil
    return {
      status: "success",
      message: resultMessage,
    };
  }

  // Jika tidak ditemukan atau terjadi error
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

    if (!TLY_API_KEY) {
      return ctx.reply(
        "API Key TLY tidak ditemukan. Pastikan Anda sudah mengatur TLY_API_KEY di .env."
      );
    }

    // Pastikan kita memiliki argumen oldDestination dan newDestination
    const oldDestination = args[1];
    const newDestination = args[2];

    if (!oldDestination || !newDestination) {
      return ctx.reply(
        "Format salah! Gunakan: /tly [oldDestination] [newDestination]"
      );
    }

    try {
      // Eksekusi penggantian oldDestination ke newDestination
      const replacementResult = await replaceOldDestinationWithNew(
        oldDestination,
        newDestination
      );

      return ctx.reply(replacementResult.message);
    } catch (err) {
      console.error("Error memproses perintah:", err.message);
      ctx.reply(
        "Terjadi kesalahan saat memproses permintaan. Coba lagi nanti."
      );
    }
  },
};
