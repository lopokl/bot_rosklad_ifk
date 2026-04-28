const { Telegraf } = require("telegraf");
const { kv } = require("@vercel/kv");

const bot = new Telegraf(process.env.BOT_TOKEN);

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    if (req.method === "GET") {
      const userId = req.query.userId;
      if (String(userId) !== process.env.ADMIN_ID)
        return res.status(403).json({ error: "Доступ заборонено" });

      let [, keys] = await kv.scan(0, { match: "user_*", count: 2000 });
      let totalUsers = 0,
        notifOffCount = 0,
        groupCounts = {};

      for (let key of keys) {
        if (key.includes("_notif")) {
          const val = await kv.get(key);
          if (val === false) notifOffCount++;
          continue;
        }
        if (key.includes("_pinned")) continue;
        totalUsers++;
        const group = await kv.get(key);
        if (group) groupCounts[group] = (groupCounts[group] || 0) + 1;
      }

      const notifOnCount = totalUsers - notifOffCount;

      // 👇 Формуємо повний список ВСІХ груп (від найбільшої до найменшої)
      const allGroups = Object.entries(groupCounts)
        .sort((a, b) => b[1] - a[1])
        .map((entry) => `${entry[0]} — ${entry[1]} студ.`);

      // Графік активності
      const chartLabels = [];
      const chartData = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split("T")[0];
        const visits = (await kv.get(`stat_visits_${dateStr}`)) || 0;
        chartLabels.push(dateStr.slice(5));
        chartData.push(visits);
      }

      // Логи (Останні 30 дій)
      const recentLogs = (await kv.lrange("recent_logs", 0, 29)) || [];

      return res.json({
        totalUsers,
        notifOnCount,
        notifOffCount,
        allGroups,
        chartLabels,
        chartData,
        recentLogs,
      });
    }

    if (req.method === "POST") {
      const { userId, message } = req.body;
      if (String(userId) !== process.env.ADMIN_ID)
        return res.status(403).json({ error: "Доступ заборонено" });
      if (!message || message.trim() === "")
        return res.status(400).json({ error: "Повідомлення порожнє" });

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
          /* ігноруємо помилки */
        }
      }
      return res.json({ success: true, count: successCount });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Помилка сервера" });
  }
};
