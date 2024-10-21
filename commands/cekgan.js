require("dotenv").config();
const axios = require("axios");

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
    console.error("Error while fetching short links: ", error.message);
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
      return true; // Tanda berhasil memperbarui
    } else {
      return false; // Tanda gagal memperbarui
    }
  } catch (error) {
    console.error(`Error while updating link ${shortcode}: `, error.message);
    return false; // Jika API request gagal atau terjadi error lain
  }
}

module.exports = {
  name: "cekgan",
  description: "Replace semua destination link tertentu pada layanan cekgan.",
  action: async (ctx) => {
    try {
      // Ambil input dari pengguna dengan format perintah `/cekgan [oldDestination] [newDestination]`
      const message = ctx.message.text;
      const args = message.split(" ").slice(1); // Memecah argumen

      // Validasi input pengguna: pastikan selalu ada 2 argumen yang diberikan
      if (args.length !== 2) {
        return ctx.reply(
          "❗ Harap masukkan perintah dengan format: /cekgan [oldDestination] [newDestination]"
        );
      }

      const oldDestination = args[0]; // Destination lama yang akan dicari
      const newDestination = args[1]; // Destination baru yang akan diupdate

      // Langkah 1: Ambil daftar short links dari API Cekgan
      await ctx.reply("🔍 Mengambil daftar short links dari Cekgan...");
      const shortLinks = await getShortLinks();

      // Langkah 2: Filter short links yang memiliki destination URL yang sama dengan oldDestination
      const linksToUpdate = shortLinks.filter(
        (link) => link.url === oldDestination
      );

      if (linksToUpdate.length === 0) {
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
      await ctx.replyWithMarkdown(
        `📊 **Laporan Pembaruan**:\n\n${updateResults.join("\n")}`
      );
    } catch (error) {
      console.error("Error in executing /cekgan command:", error.message);
      await ctx.reply("❌ Terjadi kesalahan saat memperbarui links.");
    }
  },
};
