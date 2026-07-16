const path = require("path");

function numberFromEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

module.exports = {
  port: numberFromEnv("PORT", 4000),
  adminPassword: process.env.ADMIN_PASSWORD || "",
  isProduction: process.env.NODE_ENV === "production",
  sessionTtlMs: numberFromEnv("ADMIN_SESSION_TTL_MINUTES", 5) * 60 * 1000,
  dataDirectory: path.join(__dirname, "..", "data"),
  uploadsDirectory: path.join(__dirname, "..", "uploads"),
  frontendDist: path.join(__dirname, "..", "..", "frontend", "dist"),
  instagramHandle: "@utoy_drop",
  instagramUrl: "https://www.instagram.com/utoy_drop/",
};
