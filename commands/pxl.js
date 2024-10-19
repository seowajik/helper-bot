require("dotenv").config();
const axios = require("axios");

// Fungsi untuk mengambil daftar short links dari Pxl.to
async function getShortLinks(limit = 50, offset = 0) {
  const apiUrl = `https://api.pxl.to/api/v1/short?take=${limit}&skip=${offset}`;
  const apiKey = process.env.PXLTO_API_KEY; // API Key dari .env

  try {
    const response = await axios.get(apiUrl, {
      headers: {
        Authorization: `Bearer ${apiKey}`, // API Key dalam header Authorization
      },
    });

    // Kembalikan data short links
    return response.data.data;
  } catch (error) {
    // Tampilkan error message lebih detail
    if (error.response) {
      console.error("Error response data:", error.response.data);
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
      {
        destination: newDestination, // New destination yang akan di-update
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    return response.data; // Mengembalikan hasil dari update
  } catch (error) {
    if (error.response) {
      console.error(
        `Error response from API when updating link ${id}:`,
        error.response.data
      );
    }
    throw new Error(`❌ Gagal memperbarui short link ${id}`);
  }
}

module.exports = {
  name: "pxl",
  description: "Replace semua destination link tertentu pada layanan pxl.",
  action: async (ctx) => {
    // Ambil input dari user
    const message = ctx.message.text;
    const args = message.split(" ").slice(1); // Mendapatkan argumen [oldDestination] [newDestination]

    // Validasi input yang diberikan pengguna apakah ada dua argumen (oldDestination dan newDestination)
    if (args.length < 2) {
      return ctx.reply(
        "❗ Harap masukkan format yang valid: /pxl [oldDestination] [newDestination]"
      );
    }

    const oldDestination = args[0]; // Tujuan lama yang ingin kita update
    const newDestination = args[1]; // Tujuan baru yang akan menggantikan oldDestination

    try {
      // Kirim notifikasi awal ke pengguna
      await ctx.reply(`🔍 Mengambil daftar short links...`);

      // STEP 1: Ambil semua short links
      const shortLinks = await getShortLinks(50, 0); // Mengambil short links (50 halaman pertama saja)

      // STEP 2: Filter links yang sesuai dengan oldDestination
      const linksToUpdate = shortLinks.filter(
        (link) => link.destination === oldDestination
      );

      if (linksToUpdate.length === 0) {
        return ctx.reply(
          `⚠️ Tidak ditemukan short links dengan destination: *${oldDestination}*`
        );
      }

      // Update setiap short link yang ditemukan
      let updateResults = [];
      for (const link of linksToUpdate) {
        // STEP 3: Update setiap short link dengan newDestination
        try {
          const result = await updateShortLink(link.id, newDestination);
          updateResults.push(
            `✅ *Berhasil memperbarui* ${link.id} -> *${newDestination}*`
          );
        } catch (error) {
          updateResults.push(`❌ *Gagal memperbarui* ${link.id}`);
        }
      }

      // Kirimkan hasil akhir update
      await ctx.replyWithMarkdown(
        `📊 **Laporan Pembaruan**:\n\n${updateResults.join("\n")}`
      );
    } catch (error) {
      console.error("Error in executing /pxl command:", error.message);
      // Kirim pesan error ke pengguna
      await ctx.reply("❌ Terjadi kesalahan saat memperbarui links.");
    }
  },
};
