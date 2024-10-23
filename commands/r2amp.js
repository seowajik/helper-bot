const {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
  CopyObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");
const cheerio = require("cheerio");
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

  logger.info(`Processing file: ${fileName}`);

  try {
    // STEP 1: Ambil file dari R2
    logger.info(`[1] Fetching file from R2 Bucket: ${fileName}`);
    const getParams = {
      Bucket: process.env.R2_BUCKET,
      Key: fileName,
    };

    const { Body } = await s3Client.send(new GetObjectCommand(getParams));
    const originalHtmlContent = await Body.transformToString();

    logger.info(`[1.1] Successfully fetched file: ${fileName}`);

    // STEP 2: Modifikasi konten HTML
    logger.info(`[2] Modifying HTML for file: ${fileName}`);
    const $ = cheerio.load(originalHtmlContent);
    let updated = false;

    // Proses setiap tag <a> yang memiliki href
    $("a").each((i, elem) => {
      const href = $(elem).attr("href");
      if (href) {
        // Pastikan href tidak null
        for (const [oldLink, newLink] of Object.entries(linkMap)) {
          const oldLinkRegex = new RegExp(`\\b${escapeRegex(oldLink)}\\b`, "g");
          if (oldLinkRegex.test(href)) {
            $(elem).attr("href", href.replace(oldLinkRegex, newLink)); // Ganti link
            updated = true;
            resultSummary.changes += 1; // Hitung jumlah perubahan
            logger.info(
              `[2.1] Updated: ${oldLink} -> ${newLink} in ${fileName}`
            );
          }
        }
      }
    });

    // Jika tidak ada perubahan, lewati proses upload
    if (!updated) {
      logger.info(`[2.2] No changes detected in file: ${fileName}`);
      resultSummary.status = "no_changes";
      return resultSummary;
    }

    // STEP 3: Upload file yang telah diedit ke tempat sementara
    logger.info(`[3] Uploading temporary file for: ${fileName}`);
    const tempFileName = `temp_${fileName}`;
    const uploadParams = {
      Bucket: process.env.R2_BUCKET,
      Key: tempFileName,
      Body: $.html(),
      ContentType: "text/html",
    };

    await s3Client.send(new PutObjectCommand(uploadParams));
    logger.info(`[3.1] Successfully uploaded temporary file: ${tempFileName}`);

    // STEP 4: Menyalin perubahan dari file sementara ke file asli
    logger.info(
      `[4] Overwriting original file with temporary file: ${fileName}`
    );
    const copyParams = {
      Bucket: process.env.R2_BUCKET,
      CopySource: `${process.env.R2_BUCKET}/${tempFileName}`,
      Key: fileName,
    };
    await s3Client.send(new CopyObjectCommand(copyParams));

    // STEP 5: Cleanup: hapus temporary file setelah berhasil commit
    logger.info(`[5] Deleting temporary file: ${tempFileName}`);
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: tempFileName,
      })
    );

    resultSummary.status = "success";
  } catch (error) {
    logger.error(`Error processing file ${fileName}:`, {
      errorMessage: error.message,
      stack: error.stack,
    });
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
        logger.info(`[Rollback] Temporary file deleted: ${tempFileName}`);
      } catch (rollbackError) {
        logger.error("Rollback failed:", {
          errorMessage: rollbackError.message,
          stack: rollbackError.stack,
        });
      }
    }
  }

  return resultSummary;
}

// Fungsi untuk mencari file yang mengandung `oldLink` dengan match exakt
async function findFilesWithOldLink(oldLink) {
  let filesWithOldLink = [];

  try {
    // Mengambil daftar semua objek di bucket R2
    const listParams = { Bucket: process.env.R2_BUCKET };
    const { Contents } = await s3Client.send(
      new ListObjectsV2Command(listParams)
    );

    logger.info(`Found ${Contents.length} total files in bucket`);

    // Filter untuk hanya file HTML di dalam bucket
    const htmlFiles = Contents.filter((obj) => obj.Key.endsWith(".html"));

    logger.info(
      `Inspecting ${htmlFiles.length} HTML files for oldLink: ${oldLink}`
    );

    const oldLinkRegex = new RegExp(`\\b${escapeRegex(oldLink)}\\b`);

    // Looping setiap file, dan mencari oldLink dengan keyword exact match
    for (const file of htmlFiles) {
      logger.info(`Inspecting file: ${file.Key}`);

      const getParams = { Bucket: process.env.R2_BUCKET, Key: file.Key };
      const { Body } = await s3Client.send(new GetObjectCommand(getParams));
      const htmlContent = await Body.transformToString();

      // Cari oldLink yang "exact match" di dalam konten HTML menggunakan regex
      if (oldLinkRegex.test(htmlContent)) {
        filesWithOldLink.push(file.Key);
        logger.info(`oldLink found in file: ${file.Key}`);
      } else {
        logger.info(`No oldLink found in file: ${file.Key}`);
      }
    }
  } catch (error) {
    logger.error("Error while searching for oldLink in files:", {
      errorMessage: error.message,
      stack: error.stack,
    });
  }

  return filesWithOldLink;
}

// Fungsi bulk edit
async function bulkEditLinks(linkMap, filesWithOldLink) {
  let processingResults = [];

  logger.info("Starting bulk edit process for found files");

  // Edit setiap file yang ditemukan
  for (const fileName of filesWithOldLink) {
    const result = await editLinksInFile(fileName, linkMap);
    processingResults.push(result);
  }

  return processingResults;
}

// Generate summary message
function generateSummaryMessage(results) {
  let successCount = 0,
    noChangeCount = 0,
    errorCount = 0;
  let message = `📋 Summary of R2 Bucket Processing: \n`;

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

// Ekspor perintah
module.exports = {
  name: "r2amp",
  description: "Replace semua destinasi link di file AMP",
  action: async (ctx) => {
    const message = ctx.message.text;
    const args = message.split(" ").slice(1); // Ambil argumen dari /r2amp

    // Validasi input
    if (args.length < 2) {
      return ctx.reply("Format salah! Gunakan: /r2amp [oldLink] [newLink]");
    }

    const [oldLink, newLink] = args;
    const userId = ctx.message?.from?.id;
    const username = ctx.message?.from?.username || "unknown";

    logger.info(`User ${username}(${userId}) mengirim command /r2amp`, {
      oldLink,
      newLink,
    });

    // Validasi apakah oldLink dan newLink benar merupakan URL
    const urlRegex = /^(https?:\/\/[^\s/$.?#].[^\s]*)$/i;
    if (!urlRegex.test(oldLink) || !urlRegex.test(newLink)) {
      logger.warn("User memberikan link tidak valid pada /r2amp", {
        oldLink,
        newLink,
        userId,
        username,
      });
      return ctx.reply("Link tidak valid. Mohon periksa kembali URL Anda.");
    }

    const linkMap = { [oldLink]: newLink };

    await ctx.reply("🔍 Mencari file yang mengandung oldLink...");

    // Tahap mencari file dengan oldLink
    const filesWithOldLink = await findFilesWithOldLink(oldLink);

    if (filesWithOldLink.length === 0) {
      logger.warn(`No files found containing oldLink: ${oldLink}`, {
        userId,
        username,
      });
      return ctx.reply(
        `Tidak ditemukan file yang mengandung oldLink: ${oldLink}`
      );
    }

    await ctx.reply(
      `Ditemukan ${filesWithOldLink.length} file. Sedang memproses...`
    );

    // Tahap bulk edit file
    const results = await bulkEditLinks(linkMap, filesWithOldLink);

    // Kirim summary ke pengguna
    const summaryMessage = generateSummaryMessage(results);
    await ctx.reply(summaryMessage);

    logger.info("Proses /r2amp selesai", { userId, username });
  },
};
