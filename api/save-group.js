const { kv } = require("@vercel/kv");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    if (req.method === "POST") {
      const { userId, group } = req.body;
      if (!userId || !group)
        return res.status(400).json({ error: "Бракує даних" });

      // Оновлюємо групу для користувача в базі даних
      await kv.set(`user_${userId}`, group.trim().toUpperCase());
      return res.json({ success: true });
    }
  } catch (error) {
    res.status(500).json({ error: "Помилка сервера" });
  }
};
