require("dotenv").config();
const axios = require("axios");

// Fungsi untuk membuat request ke API serper
async function checkKeywordRanking(keyword) {
  // Request body dengan keyword dan parameter
  let data = JSON.stringify({
    q: keyword, // Keyword dari input user
    location: "Jakarta, Indonesia", // Lokasi pencarian di Google
    gl: "id", // Kode negara ("id" untuk Indonesia)
    hl: "id", // Kode bahasa ("id" untuk Bahasa Indonesia)
    autocorrect: false, // Tidak melakukan koreksi otomatis
  });

  // Konfigurasi request
  let config = {
    method: "post",
    url: "https://google.serper.dev/search", // URL yang benar dari serper.dev
    headers: {
      "X-API-KEY": process.env.SERPER_API_KEY, // API Key dari serper.dev
      "Content-Type": "application/json",
    },
    data: data,
  };

  try {
    // Mengirim request dengan Axios
    const response = await axios(config);
    return response.data; // Hasil pencarian
  } catch (error) {
    console.error(
      "Error while fetching keyword ranking:",
      error.response?.data || error.message
    );
    throw new Error("Gagal mendapatkan hasil pencarian.");
  }
}

// Fungsi untuk menampilkan hasil pencarian dalam format rapi
function formatSearchResultsToText(data, keyword) {
  let message = `📊 **Keyword Ranking Results for:** "${keyword}"\n\n`;

  // Top Organic Results (hasil pencarian organik)
  if (data.organic && data.organic.length > 0) {
    message += "__Top Organic Results:__\n";

    data.organic.forEach((result, index) => {
      message += `\n${index + 1}. **${result.title}**\n`;
      message += `🌐 URL: ${result.link}\n`;
      if (result.snippet) {
        message += `📝 Snippet: ${result.snippet}\n`;
      }
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
      if (ask.answer) {
        message += `📝 Answer: ${ask.answer}\n`;
      }
    });
  }

  return message;
}

module.exports = {
  name: "cekindex",
  description: "Cekindex dari sebuah keyword tertentu lokasi indonesia.",
  action: async (ctx) => {
    const message = ctx.message.text;
    const args = message.split(" ").slice(1); // Argumen setelah '/cekindex'

    // Pastikan user memasukkan keyword
    if (args.length === 0) {
      return ctx.reply(
        "Harap masukkan keyword. Contoh: /cekindex [keyword]. Misal: /cekindex belajar programming"
      );
    }

    const keyword = args.join(" "); // Gabungkan argumen menjadi keyword utuh

    try {
      // Request ke serper API untuk mendapatkan hasil
      const searchData = await checkKeywordRanking(keyword);

      // Format hasil menjadi pesan yang lebih rapi
      const formattedMessage = formatSearchResultsToText(searchData, keyword);

      // Kirim pesan hasil ke pengguna
      await ctx.replyWithMarkdown(formattedMessage); // Kirim hasil dalam format Markdown
    } catch (error) {
      console.error("Error in cekindex command:", error.message);
      await ctx.reply(`Terjadi kesalahan: ${error.message}`);
    }
  },
};
