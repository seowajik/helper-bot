require("dotenv").config();
const axios = require("axios");

// Fungsi untuk memformat data balasan dari API IP ke dalam teks informatif
function formatIpInfo(data) {
  // Jika status dari API gagal
  if (data.status !== "success") {
    return `❌ Gagal mengambil informasi IP. Pesan: ${data.message}`;
  }

  // Format pesan yang rapi dan informatif
  return `
🌏 **Detail Lokasi untuk IP: ${data.query}**

- 🌐 **IP Address**: ${data.query}
- 🌍 **Kontinen**: ${data.continent} (${data.continentCode})
- 🇨🇦 **Negara**: ${data.country} (${data.countryCode3})
- 📍 **Region**: ${data.regionName} (${data.region})
- 🏙️ **Kota**: ${data.city || "N/A"}
- 📦 **Distrik**: ${data.district || "N/A"}
- 📮 **Kode Pos**: ${data.zip || "N/A"}
- 🌐 **Longitude**: ${data.lon}
- 🌐 **Latitude**: ${data.lat}
- 🕐 **Zona Waktu**: ${data.timezone} (Offset UTC ${data.offset / 3600})
- 📅 **Waktu Sekarang**: ${data.currentTime}

— 🌐 **Informasi Jaringan** —
- 🌍 **ISP**: ${data.isp}
- 🏢 **Organisasi**: ${data.org || "N/A"}
- 🔧 **AS Info**: ${data.as} (${data.asname || "N/A"})

— 🌍 **Informasi Tambahan** —
- 📞 **Kode Panggil**: +${data.callingCode}
- 💰 **Mata Uang**: ${data.currency || "N/A"}
- 📱 **Mobile?**: ${data.mobile ? "Iya" : "Tidak"}
- 🛡️ **Proxy?**: ${data.proxy ? "Iya" : "Tidak"}
- 🏢 **Hosting?**: ${data.hosting ? "Iya" : "Tidak"}
- 🔍 **Reverse DNS**: ${data.reverse || "N/A"}
  `;
}

// Fungsi untuk mengambil data IP dari API ip-api.com
async function fetchIpInfo(ip) {
  // URL dengan IP dan API key dari file env
  const apiUrl = `https://pro.ip-api.com/json/${ip}?key=${process.env.IP_API_KEY}&fields=status,message,continent,continentCode,country,countryCode,countryCode3,region,regionName,city,district,zip,lat,lon,timezone,offset,currentTime,currency,callingCode,isp,org,as,asname,reverse,mobile,proxy,hosting,query`;

  try {
    const response = await axios.get(apiUrl);
    return response.data;
  } catch (error) {
    console.error("Error fetching IP info:", error);
    throw new Error("Gagal mengambil data dari API IP.");
  }
}

module.exports = {
  name: "cekip",
  description: "Dapatkan informasi dari sebuah alamat IP tertentu",
  action: async (ctx) => {
    const message = ctx.message.text;
    const args = message.split(" ").slice(1); // Ambil IP setelah '/cekip'

    // Jika pengguna tidak memberi IP, berikan pesan error
    if (args.length === 0) {
      return ctx.reply(
        "❌ Harap masukkan IP address yang valid. Contoh: `/cekip 1.1.1.1`"
      );
    }

    const ipAddress = args[0];

    try {
      // Ambil informasi IP menggunakan API
      const ipInfo = await fetchIpInfo(ipAddress);

      // Format hasil menjadi pesan yang diatur rapi
      const formattedMessage = formatIpInfo(ipInfo);

      // Kirim pesan dengan informasi yang diformat
      await ctx.replyWithMarkdown(formattedMessage);
    } catch (error) {
      console.error("Error in cekip command:", error);
      await ctx.reply(`❌ Gagal memproses permintaan Anda. Coba lagi nanti.`);
    }
  },
};
