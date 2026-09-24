const { kv } = require("@vercel/kv");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    if (req.method === "GET") {
      const userId = req.query.userId;
      if (!userId) return res.status(400).json({ error: "Немає ID" });

      const group = (await kv.get(`user_${userId}`)) || "Не обрано";
      return res.json({ group });
    }

    if (req.method === "POST") {
      return res.json({ success: true });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Помилка сервера" });
  }
};
