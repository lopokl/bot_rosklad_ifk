const { Telegraf } = require("telegraf");
const { kv } = require("@vercel/kv");

const bot = new Telegraf(process.env.BOT_TOKEN);

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    // ==========================================
    // 1. ВИДАЧА СТАТИСТИКИ ДЛЯ ДАШБОРДУ (GET)
    // ==========================================
    if (req.method === "GET") {
      const userId = req.query.userId;
      if (String(userId) !== process.env.ADMIN_ID) {
        return res.status(403).json({ error: "Доступ заборонено" });
      }

      // Скануємо базу
      let [, keys] = await kv.scan(0, { match: "user_*", count: 2000 });

      let totalUsers = 0;
      let groupCounts = {};
      let notifOffCount = 0;

      for (let key of keys) {
        if (key.includes("_notif")) {
          // Рахуємо тих, хто вимкнув будильник
          const val = await kv.get(key);
          if (val === false) notifOffCount++;
          continue;
        }
        if (key.includes("_pinned")) continue; // Пропускаємо технічні ключі груп

        // Рахуємо користувача та його групу
        totalUsers++;
        const group = await kv.get(key);
        if (group) {
          groupCounts[group] = (groupCounts[group] || 0) + 1;
        }
      }

      const notifOnCount = totalUsers - notifOffCount;

      // Визначаємо ТОП-3 найпопулярніші групи
      const topGroups = Object.entries(groupCounts)
        .sort((a, b) => b[1] - a[1]) // Сортуємо за спаданням
        .slice(0, 3) // Беремо перші 3
        .map((entry) => `${entry[0]} (${entry[1]} студ.)`);

      return res.json({ totalUsers, notifOnCount, notifOffCount, topGroups });
    }

    // ==========================================
    // 2. МАСОВА РОЗСИЛКА (POST) - Твій старий код
    // ==========================================
    if (req.method === "POST") {
      const { userId, message } = req.body;
      if (String(userId) !== process.env.ADMIN_ID) {
        return res.status(403).json({ error: "Доступ заборонено" });
      }
      if (!message || message.trim() === "") {
        return res.status(400).json({ error: "Повідомлення порожнє" });
      }

      let [, keys] = await kv.scan(0, { match: "user_*", count: 1000 });
      let userIds = keys
        .filter((k) => !k.includes("_notif"))
        .map((k) => k.replace("user_", ""));
      let successCount = 0;
      const broadcastText = `📢 *Оголошення від Адміністратора:*\n\n${message}`;

      for (let uid of userIds) {
        try {
          await bot.telegram.sendMessage(uid, broadcastText, {
            parse_mode: "Markdown",
          });
          successCount++;
        } catch (e) {
          console.log(`Помилка для ${uid}`);
        }
      }
      return res.json({ success: true, count: successCount });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Помилка сервера" });
  }
};
