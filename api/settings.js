const { kv } = require("@vercel/kv");

module.exports = async (req, res) => {
  // Дозволяємо запити з нашого додатку
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    // ЯКЩО ЦЕ ЗАПИТ НА ОТРИМАННЯ ДАНИХ (GET)
    if (req.method === "GET") {
      const userId = req.query.userId;
      if (!userId) return res.status(400).json({ error: "Немає ID" });

      const group = (await kv.get(`user_${userId}`)) || "Не обрано";
      // За замовчуванням сповіщення увімкнені (якщо в базі ще немає запису, повертаємо true)
      const notifSetting = await kv.get(`user_${userId}_notif`);
      const notifications = notifSetting !== false;

      return res.json({ group, notifications });
    }

    // ЯКЩО ЦЕ ЗАПИТ НА ЗБЕРЕЖЕННЯ ДАНИХ (POST)
    if (req.method === "POST") {
      const { userId, notifications } = req.body;
      if (!userId) return res.status(400).json({ error: "Немає ID" });

      // Зберігаємо вибір користувача (true або false)
      await kv.set(`user_${userId}_notif`, notifications);
      return res.json({ success: true });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Помилка сервера" });
  }
};
