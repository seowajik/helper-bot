require("dotenv").config();
const axios = require("axios");
const logger = require("../utils/logger"); // Mengimpor logger dari utils/logger.js

// Fungsi untuk membuat request ke API Serper
async function checkKeywordRanking(keyword) {
  let data = JSON.stringify({
    q: keyword, // Keyword dari input user
    location: "Jakarta, Indonesia", // Lokasi pencarian di Google
    gl: "id", // Kode negara ("id" untuk Indonesia)
    hl: "id", // Kode bahasa ("id" untuk Bahasa Indonesia)
    autocorrect: false, // Tidak melakukan koreksi otomatis
  });

  let config = {
    method: "post",
    url: "https://google.serper.dev/search",
    headers: {
      "X-API-KEY": process.env.SERPER_API_KEY,
      "Content-Type": "application/json",
    },
    data: data,
  };

  try {
    const response = await axios(config);
    return response.data; // Hasil pencarian
  } catch (error) {
    logger.error("Error while fetching keyword ranking:", {
      errorMessage: error.response?.data || error.message,
    });
    throw new Error("Gagal mendapatkan hasil pencarian.");
  }
}

// Fungsi untuk menampilkan hasil pencarian dalam format rapi
function formatSearchResultsToText(data, keyword) {
  let message = `📊 **Keyword Ranking Results for:** "${keyword}"\n\n`;

  if (data.organic && data.organic.length > 0) {
    message += "__Top Organic Results:__\n";
    data.organic.forEach((result, index) => {
      message += `\n${index + 1}. **${result.title}**\n`;
      message += `🌐 URL: ${result.link}\n`;
      if (result.snippet) message += `📝 Snippet: ${result.snippet}\n`;
    });
  } else {
    message += "Tidak ada hasil pencarian organik untuk keyword ini.\n";
  }

  // Tambahan jika ada "Top Stories" atau "People Also Ask"
  if (data.topStories && data.topStories.length > 0) {
    message += `\n📰 **Top Stories Results**\n`;
    data.topStories.forEach((article, index) => {
      message += `\n${index + 1}. **${article.title}**\n`;
      message += `🌐 URL: ${article.link}\n`;
    });
  }

  if (data.peopleAlsoAsk && data.peopleAlsoAsk.length > 0) {
    message += `\n🧐 **People Also Ask**\n`;
    data.peopleAlsoAsk.forEach((ask, index) => {
      message += `\n${index + 1}. **${ask.question}**\n`;
      if (ask.answer) message += `📝 Answer: ${ask.answer}\n`;
    });
  }

  return message;
}

module.exports = {
  name: "cekindex",
  description: "Cekindex dari sebuah keyword tertentu lokasi Indonesia.",
  action: async (ctx) => {
    const message = ctx.message.text;
    const args = message.split(" ").slice(1); // Ambil keyword setelah command '/cekindex'
    const userId = ctx.message?.from?.id; // Dapatkan ID pengguna dari message
    const username = ctx.message?.from?.username; // Dapatkan username dari message

    // Pastikan user memasukkan keyword
    if (args.length === 0) {
      return ctx.reply(
        "Harap masukkan keyword. Contoh: /cekindex [keyword]. Misal: /cekindex belajar programming"
      );
    }

    const keyword = args.join(" "); // Menggabungkan argumen menjadi keyword penuh

    try {
      // Log saat proses pencarian dimulai oleh user
      logger.info(
        `User ${userId} requested SEO index check for keyword: "${keyword}"`,
        {
          userId,
          username,
          keyword,
        }
      );

      // Mengambil hasil pencarian keyword melalui API serper
      const searchData = await checkKeywordRanking(keyword);

      // Format hasil menjadi pesan yang lebih rapi
      const formattedMessage = formatSearchResultsToText(searchData, keyword);

      // Kirimkan balasan yang sudah diformat ke user
      await ctx.replyWithMarkdown(formattedMessage); // Mengirim pesan hasil pencarian
    } catch (error) {
      // Log error jika terjadi masalah saat pencarian
      logger.error(
        `Error occurred in /cekindex command for keyword "${keyword}"`,
        {
          userId,
          username,
          keyword,
          errorMessage: error.message,
          stack: error.stack,
        }
      );

      // Kirim balasan error ke user
      await ctx.reply(`Terjadi kesalahan: ${error.message}`);
    }
  },
};
