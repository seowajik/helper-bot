const {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
  CopyObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");
const cheerio = require("cheerio");
const crypto = require("crypto");
const logger = require("../utils/logger"); // Pastikan logger aktif

// Inisialisasi S3 client untuk Cloudflare R2
const s3Client = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

// Helper: Hash generator untuk checksum
async function generateChecksum(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

// Fungsi untuk mengedit link dalam satu file HTML
async function editLinksInFile(fileName, linkMap) {
  let resultSummary = {
    fileName,
    status: "success",
    changes: 0,
    error: null,
  };

  logger.info(`Memproses file: ${fileName}`); // Logging awal

  try {
    // STEP 1: Ambil file asli dari R2
    logger.info(`[1] Mengambil file dari bucket R2: ${fileName}`);
    const getParams = {
      Bucket: process.env.R2_BUCKET,
      Key: fileName,
    };

    const { Body } = await s3Client.send(new GetObjectCommand(getParams));
    const originalHtmlContent = await Body.transformToString(); // Ambil konten asli dalam bentuk string

    logger.info(`[1.1] Berhasil mengambil file: ${fileName}`);

    // STEP 2: Modifikasi konten HTML menggunakan cheerio
    logger.info(`[2] Modifikasi konten HTML dari file: ${fileName}`);
    const $ = cheerio.load(originalHtmlContent); // Gunakan cheerio untuk manipulasi HTML
    let updated = false; // Flag untuk melacak apakah ada perubahan

    $("a").each((i, elem) => {
      const href = $(elem).attr("href");
      if (href) {
        // Pastikan href tidak null
        for (const [oldLink, newLink] of Object.entries(linkMap)) {
          if (href.includes(oldLink)) {
            $(elem).attr("href", href.replace(oldLink, newLink)); // Ganti link lama dengan link baru
            updated = true;
            resultSummary.changes += 1; // Hitung jumlah perubahan
            logger.info(
              `[2.1] Link diperbarui: ${oldLink} -> ${newLink} di ${fileName}`
            );
          }
        }
      }
    });

    // Jika tidak ada perubahan, skip update
    if (!updated) {
      logger.info(`[2.2] Tidak ada perubahan pada file: ${fileName}`);
      resultSummary.status = "no_changes"; // Tandai tidak ada perubahan
      return resultSummary; // Langsung keluar jika tidak ada perubahan
    }

    // STEP 3: Upload file yang telah diedit ke tempat sementara
    logger.info(`[3] Mengunggah file sementara untuk: ${fileName}`);
    const tempFileName = `temp_${fileName}`;
    const uploadParams = {
      Bucket: process.env.R2_BUCKET,
      Key: tempFileName, // Simpan dalam temp file
      Body: $.html(), // Konversi kembali ke string
      ContentType: "text/html",
    };

    await s3Client.send(new PutObjectCommand(uploadParams));
    logger.info(`[3.1] File sementara terunggah: ${tempFileName}`);

    // STEP 4: Commit perubahan dengan menyalin dari file sementara ke file asli
    logger.info(`[4] Menyalin file sementara ke file asli: ${fileName}`);
    const copyParams = {
      Bucket: process.env.R2_BUCKET,
      CopySource: `${process.env.R2_BUCKET}/${tempFileName}`,
      Key: fileName,
    };
    await s3Client.send(new CopyObjectCommand(copyParams));

    // STEP 5: Cleanup, hapus temporary file setelah berhasil commit
    logger.info(`[5] Menghapus file sementara: ${tempFileName}`);
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: tempFileName,
      })
    );

    resultSummary.status = "success";
  } catch (error) {
    // Tangkap error dan catat error log
    logger.error(`Error processing file ${fileName}:`, error);
    resultSummary.status = "error";
    resultSummary.error = error.message;

    // Rollback: Hapus temporary file jika ada error
    if (typeof tempFileName !== "undefined") {
      try {
        await s3Client.send(
          new DeleteObjectCommand({
            Bucket: process.env.R2_BUCKET,
            Key: tempFileName,
          })
        );
        logger.info(`[Rollback] File temporary dihapus: ${tempFileName}`);
      } catch (rollbackError) {
        logger.error("Rollback gagal:", rollbackError);
      }
    }
  }

  return resultSummary; // Kembalikan hasil pemrosesan file
}

// Fungsi untuk mencari file yang mengandung `oldLink`
async function findFilesWithOldLink(oldLink) {
  let filesWithOldLink = [];

  try {
    // Dapatkan daftar semua objek di bucket
    const listParams = { Bucket: process.env.R2_BUCKET };
    const { Contents } = await s3Client.send(
      new ListObjectsV2Command(listParams)
    );

    logger.info(`Ditemukan ${Contents.length} file dalam bucket`);

    // Filter file HTML untuk diproses
    const htmlFiles = Contents.filter((obj) => obj.Key.endsWith(".html"));

    logger.info(`Memulai pencarian di ${htmlFiles.length} file...`);

    // Cari oldLink dalam setiap file HTML
    for (const file of htmlFiles) {
      logger.info(`Memeriksa file: ${file.Key}`);

      const getParams = {
        Bucket: process.env.R2_BUCKET,
        Key: file.Key,
      };

      // Ambil konten file
      const { Body } = await s3Client.send(new GetObjectCommand(getParams));
      const htmlContent = await Body.transformToString();

      // Cari apakah oldLink ada di dalam file
      if (htmlContent.includes(oldLink)) {
        filesWithOldLink.push(file.Key);
        logger.info(`oldLink ditemukan di file: ${file.Key}`);
      }
    }
  } catch (error) {
    logger.error("Error saat mencari oldLink dalam file:", error);
  }

  return filesWithOldLink; // Kembalikan daftar file yang mengandung oldLink
}

// Fungsi untuk memproses semua file yang mengandung `oldLink`
async function bulkEditLinks(linkMap, filesWithOldLink) {
  let processingResults = [];

  logger.info("Memulai bulkEditLinks pada file-file yang ditemukan");

  // Proses hanya file yang mengandung `oldLink`
  for (const fileName of filesWithOldLink) {
    const result = await editLinksInFile(fileName, linkMap);
    processingResults.push(result);
  }

  return processingResults; // Kembalikan hasil komprehensif
}

// Ringkasan hasil yang akan dikirim ke pengguna
function generateSummaryMessage(results) {
  let successCount = 0,
    noChangeCount = 0,
    errorCount = 0;
  let message = `Summary of the R2 Bucket Processing:\n`;

  results.forEach((result) => {
    if (result.status === "success") {
      successCount++;
      message += `✔️ File ${result.fileName}: ${result.changes} changes applied.\n`;
    } else if (result.status === "no_changes") {
      noChangeCount++;
      message += `ℹ️ File ${result.fileName}: No changes applied.\n`;
    } else if (result.status === "error") {
      errorCount++;
      message += `❌ File ${result.fileName}: Error: ${result.error}\n`;
    }
  });

  message += `\nSummary of Operation:\n- Success: ${successCount}\n- No Changes: ${noChangeCount}\n- Errors: ${errorCount}\n`;

  return message; // Return final summary message
}

// Ekspor command untuk dipakai di bot
module.exports = {
  name: "r2amp",
  description: "Replace semua destination link tertentu pada semua LP amp.",
  action: async (ctx) => {
    const message = ctx.message.text;
    const args = message.split(" ").slice(1); // Ambil argumen setelah /r2amp

    // Minimal memerlukan 2 argumen
    if (args.length < 2) {
      return ctx.reply(
        "Format tidak valid. Gunakan format: /r2amp [oldLink] [newLink]"
      );
    }

    const [oldLink, newLink] = args;

    logger.info(
      `Command /r2amp digunakan oleh user: ${
        ctx.message.from.username || ctx.message.from.id
      }`
    );

    // Validasi link sederhana
    const urlRegex = /^(https?:\/\/[^\s/$.?#].[^\s]*)$/i;
    if (!urlRegex.test(oldLink) || !urlRegex.test(newLink)) {
      logger.info(`Link tidak valid: oldLink: ${oldLink}, newLink: ${newLink}`);
      return ctx.reply(
        "❗ Link yang diberikan tidak valid. Harap gunakan URL yang benar."
      );
    }

    // Buat map link
    const linkMap = {};
    linkMap[oldLink] = newLink;

    await ctx.reply("🔍 Mencari file yang mengandung oldLink...");

    // Tahap pencarian: Cari file yang mengandung oldLink
    const filesWithOldLink = await findFilesWithOldLink(oldLink);

    if (filesWithOldLink.length === 0) {
      return ctx.reply(
        `Tidak ditemukan file HTML yang mengandung link ${oldLink}`
      );
    }

    await ctx.reply(
      `Ditemukan ${filesWithOldLink.length} file yang mengandung oldLink. Memproses...`
    );

    // Tahap penggantian: Replace oldLink ke newLink di semua file yang ditemukan
    const results = await bulkEditLinks(linkMap, filesWithOldLink);

    // Kirim summary hasil operasinya kepada user
    const summaryMessage = generateSummaryMessage(results);
    await ctx.reply(summaryMessage);
  },
};
