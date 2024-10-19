require("dotenv").config();
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

// Inisialisasi S3 client untuk R2
const s3Client = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

// Helper: Hash generator untuk checksum (validasi integritas)
async function generateChecksum(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

// Fungsi untuk mengedit link dalam satu file
async function editLinksInFile(fileName, linkMap) {
  let resultSummary = {
    fileName,
    status: "success",
    changes: 0,
    error: null,
  };

  try {
    // Ambil file asli dari R2
    const getParams = {
      Bucket: process.env.R2_BUCKET,
      Key: fileName,
    };

    const { Body } = await s3Client.send(new GetObjectCommand(getParams));
    const originalHtmlContent = await Body.transformToString();

    // Simpan checksum file asli (untuk validasi)
    const originalChecksum = await generateChecksum(originalHtmlContent);

    // Parse HTML dan modifikasi file
    const $ = cheerio.load(originalHtmlContent);
    let updated = false;

    $("a").each((i, elem) => {
      const href = $(elem).attr("href");
      for (const [oldLink, newLink] of Object.entries(linkMap)) {
        if (href && href.includes(oldLink)) {
          $(elem).attr("href", href.replace(oldLink, newLink));
          updated = true;
          resultSummary.changes += 1; // Tambahkan perubahan yang diterapkan
        }
      }
    });

    // Jika tidak ada perubahan, tidak perlu lanjutkan (skip update)
    if (!updated) {
      resultSummary.status = "no_changes";
      return resultSummary; // Kembalikan hasil tanpa perubahan
    }

    // Konversi kembali ke string
    const updatedHtmlContent = $.html();

    // Generate checksum dari file yang baru
    const updatedChecksum = await generateChecksum(updatedHtmlContent);

    // *** Proses Upload ke Temporary File ***
    const tempFileName = `temp_${fileName}`; // Lokasi temporary
    const uploadParams = {
      Bucket: process.env.R2_BUCKET,
      Key: tempFileName, // Upload ke temporary
      Body: updatedHtmlContent,
      ContentType: "text/html",
    };

    await s3Client.send(new PutObjectCommand(uploadParams));

    // Setelah upload berhasil, validasi file yang di-upload tidak corrupt
    const getTempFileParams = {
      Bucket: process.env.R2_BUCKET,
      Key: tempFileName,
    };
    const { Body: tempFileBody } = await s3Client.send(
      new GetObjectCommand(getTempFileParams)
    );
    const tempFileContent = await tempFileBody.transformToString();
    const tempFileChecksum = await generateChecksum(tempFileContent);

    if (tempFileChecksum !== updatedChecksum) {
      throw new Error(
        "File di lokasi temporary corrupt (checksum tidak cocok). Rollback..."
      );
    }

    // *** Commit: Copy dari temp file ke file asli ***
    const copyParams = {
      Bucket: process.env.R2_BUCKET,
      CopySource: `${process.env.R2_BUCKET}/${tempFileName}`,
      Key: fileName, // Salin ke file asli
    };
    await s3Client.send(new CopyObjectCommand(copyParams));

    // *** Cleanup: Menghapus temporary file setelah commit sukses ***
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: tempFileName,
      })
    );

    resultSummary.status = "success";
  } catch (error) {
    resultSummary.status = "error";
    resultSummary.error = error.message;

    // Rollback jika ada kegagalan
    if (typeof tempFileName !== "undefined") {
      try {
        await s3Client.send(
          new DeleteObjectCommand({
            Bucket: process.env.R2_BUCKET,
            Key: tempFileName,
          })
        );
      } catch (rollbackError) {
        console.error("Rollback failed:", rollbackError);
      }
    }
  }

  return resultSummary; // Kembalikan ringkasan hasil ke hasil komprehensif
}

// Fungsi untuk memproses semua file HTML
async function bulkEditLinks(linkMap) {
  let processingResults = [];

  try {
    const listParams = { Bucket: process.env.R2_BUCKET };
    const { Contents } = await s3Client.send(
      new ListObjectsV2Command(listParams)
    );
    const htmlFiles = Contents.filter((obj) => obj.Key.endsWith(".html"));

    for (const file of htmlFiles) {
      const result = await editLinksInFile(file.Key, linkMap);
      processingResults.push(result);
    }
  } catch (error) {
    console.error("Error saat memproses file:", error);
    processingResults.push({ status: "error", error: error.message });
  }

  return processingResults; // Kembalikan hasil pemrosesan secara keseluruhan
}

// Ringkasan hasil dalam bentuk pesan tunggal
function generateSummaryMessage(results) {
  let successCount = 0;
  let noChangeCount = 0;
  let errorCount = 0;
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
  return message;
}

module.exports = {
  name: "r2amp",
  description: "Replace semua destination link tertentu pada semua LP amp.",
  action: async (ctx) => {
    // Ambil data dari pesan yang diterima di chat bot
    const message = ctx.message.text;
    const args = message.split(" ").slice(1); // Ambil argumen setelah '/r2amp'

    // Minimal butuh 2 argumen (oldLink dan newLink)
    if (args.length < 2) {
      return ctx.reply(
        "Format tidak valid. Gunakan format: /r2amp [oldLink] [newLink]"
      );
    }

    const [oldLink, newLink] = args;

    // Buat peta link (linkMap)
    const linkMap = {};
    linkMap[oldLink] = newLink;

    // Eksekusi bulkEditLinks
    const results = await bulkEditLinks(linkMap);

    // Kirim hasil operasinya dalam satu pesan
    const summaryMessage = generateSummaryMessage(results);
    await ctx.reply(summaryMessage);
  },
};
