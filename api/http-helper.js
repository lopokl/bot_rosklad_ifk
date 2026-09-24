/**
 * Спільні HTTP та CORS утиліти для Vercel Serverless Functions
 */

function enableCors(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return true;
  }
  return false;
}

function sendError(res, statusCode = 500, message = "Помилка сервера") {
  return res.status(statusCode).json({ error: message });
}

function sendSuccess(res, data = {}) {
  return res.status(200).json(typeof data === "object" ? data : { data });
}

function isAdmin(req) {
  const adminId = process.env.ADMIN_ID;
  if (!adminId) return false;
  const requestedId = req.query?.userId || req.body?.userId;
  return String(requestedId) === String(adminId);
}

function isCronAuthorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const authHeader = req.headers?.authorization;
  const querySecret = req.query?.secret || req.body?.secret;
  return authHeader === `Bearer ${secret}` || querySecret === secret;
}

module.exports = {
  enableCors,
  sendError,
  sendSuccess,
  isAdmin,
  isCronAuthorized,
};
