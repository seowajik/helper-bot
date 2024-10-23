const pino = require("pino");

// Konfigurasi logger dengan pretty printing jika di environment development
const logger = pino({
  level: process.env.LOG_LEVEL || "info", // Level log default (info), bisa di-set dari environment variable
  transport:
    process.env.NODE_ENV === "development"
      ? {
          target: "pino-pretty", // Gunakan pino-pretty untuk development
          options: {
            colorize: true, // Memunculkan warna pada output log di terminal
            translateTime: "SYS:standard", // Translate timestamp ke format waktu yang lebih mudah dibaca
            ignore: "pid,hostname", // Hilangkan PID dan hostname dari output agar lebih bersih
          },
        }
      : undefined,
  base:
    process.env.NODE_ENV === "production"
      ? undefined
      : {
          // Konfigurasi base untuk metadata tambahan
          environment: process.env.NODE_ENV || "development",
        },
});

// API untuk logging
module.exports = {
  info: (msg, meta = {}) => logger.info(meta, msg), // Menggunakan level info
  warn: (msg, meta = {}) => logger.warn(meta, msg), // Menggunakan level warn
  error: (msg, meta = {}) => logger.error(meta, msg), // Menggunakan level error
};
