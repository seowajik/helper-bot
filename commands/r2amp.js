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
const logger = require("../utils/logger");

// Inisialisasi S3 client untuk Cloudflare R2
const s3Client = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

// Helper: generator checksum
async function generateChecksum(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

// Helper untuk men-escape regex dari URL
function escapeRegex(string) {
  return string.replace(/[-\/\\^$*+?.()|[$${}]/g, "\\$&");
}

// Fungsi untuk mengedit link dalam satu file HTML
async function editLinksInFile(fileName, linkMap) {
  let resultSummary = {
    fileName,
    status: "success",
    changes: 0,
    error: null,
  };

  logger.info(`Memproses file: ${fileName}`);

  try {
    // STEP 1: Ambil file dari R2
    logger.info(`[1] Mengambil file dari R2: ${fileName}`);
    const getParams = {
      Bucket: process.env.R2_BUCKET,
      Key: fileName,
    };

    const { Body } = await s3Client.send(new GetObjectCommand(getParams));
    const originalHtmlContent = await Body.transformToString();

    logger.info(`[1.1] Berhasil mengambil file: ${fileName}`);

    // STEP 2: Modifikasi konten HTML
    logger.info(`[2] Memodifikasi HTML dari file: ${fileName}`);
    const $ = cheerio.load(originalHtmlContent);
    let updated = false;

    // Proses setiap tag <a> yang memiliki href
    $("a").each((i, elem) => {
      const href = $(elem).attr("href");
      if (href) {
        // Pastikan href tidak null
        for (const [oldLink, newLink] of Object.entries(linkMap)) {
          // Buat regex dengan word boundary di sekitar oldLink untuk mencocokkan URL penuh
          const oldLinkRegex = new RegExp(`\\b${escapeRegex(oldLink)}\\b`, "g");

          if (oldLinkRegex.test(href)) {
            $(elem).attr("href", href.replace(oldLinkRegex, newLink)); // Ganti link
            updated = true;
            resultSummary.changes += 1; // Hitung jumlah perubahan
            logger.info(
              `[2.1] Diperbarui: ${oldLink} -> ${newLink} di file ${fileName}`
            );
          }
        }
      }
    });

    // Jika tidak ada perubahan, lewati proses upload
    if (!updated) {
      logger.info(`[2.2] Tidak ada perubahan pada file: ${fileName}`);
      resultSummary.status = "no_changes";
      return resultSummary;
    }

    // STEP 3: Upload file yang telah diedit ke tempat sementara
    logger.info(`[3] Mengunggah file sementara untuk: ${fileName}`);
    const tempFileName = `temp_${fileName}`;
    const uploadParams = {
      Bucket: process.env.R2_BUCKET,
      Key: tempFileName,
      Body: $.html(),
      ContentType: "text/html",
    };

    await s3Client.send(new PutObjectCommand(uploadParams));
    logger.info(`[3.1] File sementara terunggah: ${tempFileName}`);

    // STEP 4: Commit perubahan dengan menyalin dari file sementara ke file asli
    logger.info(`[4] Menimpa file asli dengan file sementara: ${fileName}`);
    const copyParams = {
      Bucket: process.env.R2_BUCKET,
      CopySource: `${process.env.R2_BUCKET}/${tempFileName}`,
      Key: fileName,
    };
    await s3Client.send(new CopyObjectCommand(copyParams));

    // STEP 5: Cleanup: hapus temporary file setelah berhasil commit
    logger.info(`[5] Menghapus temporary file: ${tempFileName}`);
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: tempFileName,
      })
    );

    resultSummary.status = "success";
  } catch (error) {
    logger.error(`Error memproses file ${fileName}:`, error);
    resultSummary.status = "error";
    resultSummary.error = error.message;

    // Hapus temporary file jika terjadi error
    if (typeof tempFileName !== "undefined") {
      try {
        await s3Client.send(
          new DeleteObjectCommand({
            Bucket: process.env.R2_BUCKET,
            Key: tempFileName,
          })
        );
        logger.info(`[Rollback] Temporary file dihapus: ${tempFileName}`);
      } catch (rollbackError) {
        logger.error("Rollback gagal:", rollbackError);
      }
    }
  }

  return resultSummary;
}

// Fungsi untuk mencari file yang mengandung `oldLink` dengan match exact
async function findFilesWithOldLink(oldLink) {
  let filesWithOldLink = [];

  try {
    // Mengambil daftar semua objek di bucket R2
    const listParams = { Bucket: process.env.R2_BUCKET };
    const { Contents } = await s3Client.send(
      new ListObjectsV2Command(listParams)
    );

    logger.info(`Ditemukan ${Contents.length} file di bucket`);

    // Filter untuk hanya file HTML di dalam bucket
    const htmlFiles = Contents.filter((obj) => obj.Key.endsWith(".html"));

    logger.info(`Memeriksa ${htmlFiles.length} file HTML...`);

    // Escape oldLink untuk diubah jadi regex yang aman.
    const oldLinkRegex = new RegExp(`\\b${escapeRegex(oldLink)}\\b`);

    // Looping setiap file, dan mencari oldLink dengan exact match
    for (const file of htmlFiles) {
      logger.info(`Memeriksa file: ${file.Key}`);

      const getParams = {
        Bucket: process.env.R2_BUCKET,
        Key: file.Key,
      };

      // Ambil konten dari file di R2
      const { Body } = await s3Client.send(new GetObjectCommand(getParams));
      const htmlContent = await Body.transformToString();

      // Cari oldLink yang "exact match" di dalam konten HTML menggunakan regex
      if (oldLinkRegex.test(htmlContent)) {
        filesWithOldLink.push(file.Key);
        logger.info(`oldLink ditemukan di file: ${file.Key}`);
      } else {
        logger.info(`oldLink TIDAK ditemukan di file: ${file.Key}`);
      }
    }
  } catch (error) {
    logger.error("Error saat mencari oldLink di file:", error);
  }

  // Mengembalikan daftar file yang ditemukan mengandung oldLink
  return filesWithOldLink;
}

// Fungsi bulk edit
async function bulkEditLinks(linkMap, filesWithOldLink) {
  let processingResults = [];

  logger.info("Memulai bulk edit");

  // Edit setiap file yang ditemukan
  for (const fileName of filesWithOldLink) {
    const result = await editLinksInFile(fileName, linkMap);
    processingResults.push(result);
  }

  return processingResults;
}

// Generate summary
function generateSummaryMessage(results) {
  let successCount = 0,
    noChangeCount = 0,
    errorCount = 0;
  let message = `📋 Summary of the R2 Bucket Processing: \n`;

  results.forEach((result) => {
    if (result.status === "success") {
      successCount++;
      message += `✔️ File ${result.fileName}: ${result.changes} changes applied.\n`;
    } else if (result.status === "no_changes") {
      noChangeCount++;
      message += `ℹ️ File ${result.fileName}: No changes.\n`;
    } else if (result.status === "error") {
      errorCount++;
      message += `❌ File ${result.fileName}: Error: ${result.error}\n`;
    }
  });

  message += `\nSummary:\n- Success: ${successCount}\n- No Changes: ${noChangeCount}\n- Errors: ${errorCount}\n`;

  return message;
}

// Eksport perintah
module.exports = {
  name: "r2amp",
  description: "Replace semua destinasi link di file AMP",
  action: async (ctx) => {
    const message = ctx.message.text;
    const args = message.split(" ").slice(1); // Ambil argumen dari /r2amp

    // Harus ada 2 argumen (oldLink dan newLink)
    if (args.length < 2) {
      return ctx.reply("Format salah! Gunakan: /r2amp [oldLink] [newLink]");
    }

    const [oldLink, newLink] = args;

    logger.info(
      `User ${
        ctx.message.from.username || ctx.message.from.id
      } menggunakan /r2amp`
    );

    // Validasi link apakah benar merupakan URL
    const urlRegex = /^(https?:\/\/[^\s/$.?#].[^\s]*)$/i;
    if (!urlRegex.test(oldLink) || !urlRegex.test(newLink)) {
      logger.info(`Link tidak valid: oldLink: ${oldLink}, newLink: ${newLink}`);
      return ctx.reply("Link tidak valid. Mohon periksa kembali URL Anda.");
    }

    const linkMap = { [oldLink]: newLink };

    await ctx.reply("🔍 Mencari file yang mengandung oldLink...");

    // Tahap mencari file dengan oldLink
    const filesWithOldLink = await findFilesWithOldLink(oldLink);

    if (filesWithOldLink.length === 0) {
      return ctx.reply(`Tidak ditemukan file yang mengandung ${oldLink}`);
    }

    await ctx.reply(
      `Ditemukan ${filesWithOldLink.length} file. Sedang memproses...`
    );

    // Tahap mengedit link di file
    const results = await bulkEditLinks(linkMap, filesWithOldLink);

    // Kirim summary ke pengguna
    const summaryMessage = generateSummaryMessage(results);
    await ctx.reply(summaryMessage);
  },
};
