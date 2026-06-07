const { Telegraf } = require("telegraf");
const { kv } = require("@vercel/kv");

const bot = new Telegraf(process.env.BOT_TOKEN);

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    // ==========================================
    // 1. ВИДАЧА СТАТИСТИКИ (GET)
    // ==========================================
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

      // Логи та Конфіг
      const recentLogs = (await kv.lrange("recent_logs", 0, 29)) || [];
      const appConfig = (await kv.get("app_config")) || {
        maintenance: false,
        vacation: false,
        banner: "",
      };

      return res.json({
        totalUsers,
        notifOnCount,
        notifOffCount,
        allGroups,
        chartLabels,
        chartData,
        recentLogs,
        appConfig,
      });
    }

    // ==========================================
    // 2. ДІЇ АДМІНІСТРАТОРА (POST)
    // ==========================================
    if (req.method === "POST") {
      const { userId, action, message, configData, targetId } = req.body;
      if (String(userId) !== process.env.ADMIN_ID)
        return res.status(403).json({ error: "Доступ заборонено" });

      // ДІЯ: РОЗСИЛКА
      if (action === "broadcast") {
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
            /* ігноруємо помилки блокування */
          }
        }
        return res.json({
          success: true,
          count: successCount,
          message: `✅ Відправлено ${successCount} юзерам!`,
        });
      }

      // ДІЯ: ОЧИЩЕННЯ КЕШУ
      if (action === "clear_cache") {
        const keys = await kv.keys("cache_*");
        if (keys.length > 0) await kv.del(...keys);
        return res.json({ success: true, message: `✅ Кеш успішно очищено!` });
      }

      // ДІЯ: ОНОВЛЕННЯ КОНФІГУ ДОДАТКУ (Тех. роботи, канікули, банер)
      if (action === "update_config") {
        await kv.set("app_config", configData);
        return res.json({
          success: true,
          message: "✅ Налаштування збережено!",
        });
      }

      // ДІЯ: ПОШУК ЮЗЕРА ПО ID
      if (action === "lookup_user") {
        if (!targetId) return res.status(400).json({ error: "Введіть ID" });
        try {
          const chatInfo = await bot.telegram.getChat(targetId);
          const userGroup = (await kv.get(`user_${targetId}`)) || "Не обрано";
          return res.json({
            success: true,
            user: {
              first_name: chatInfo.first_name || "Невідомо",
              last_name: chatInfo.last_name || "",
              username: chatInfo.username ? `@${chatInfo.username}` : "Немає",
              group: userGroup,
            },
          });
        } catch (e) {
          return res
            .status(404)
            .json({ error: "Юзер не знайдений або ніколи не запускав бота!" });
        }
      }

      return res.status(400).json({ error: "Невідома дія" });
    }
  } catch (error) {
    console.error("Серверна помилка:", error);
    res.status(500).json({ error: "Помилка сервера" });
  }
};
