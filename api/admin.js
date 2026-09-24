const { Telegraf } = require("telegraf");
const { kv } = require("@vercel/kv");

const bot = new Telegraf(process.env.BOT_TOKEN);

const cleanId = (id) => String(id || "").replace(/[^0-9]/g, "");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const adminEnvId = cleanId(process.env.ADMIN_ID);

    // ==========================================
    // 1. ВИДАЧА СТАТИСТИКИ (GET)
    // ==========================================
    if (req.method === "GET") {
      const userId = cleanId(req.query.userId);
      if (!userId || !adminEnvId || userId !== adminEnvId) {
        return res.status(403).json({ error: "Доступ заборонено (невірний ADMIN_ID)" });
      }

      let totalUsers = 0;
      let groupCounts = {};

      try {
        let [, keys] = await kv.scan(0, { match: "user_*", count: 2000 });
        for (let key of keys) {
          if (key.includes("_notif") || key.includes("_pinned")) continue;
          totalUsers++;
          const group = await kv.get(key);
          if (group) groupCounts[group] = (groupCounts[group] || 0) + 1;
        }
      } catch (e) {
        console.log("KV scan warning:", e.message);
      }

      const activeGroupsCount = Object.keys(groupCounts).length;
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
        let visits = 0;
        try {
          visits = (await kv.get(`stat_visits_${dateStr}`)) || 0;
        } catch (e) {}
        chartLabels.push(dateStr.slice(5));
        chartData.push(visits);
      }

      // Логи та Конфіг
      let recentLogs = [];
      try {
        recentLogs = (await kv.lrange("recent_logs", 0, 29)) || [];
      } catch (e) {}

      let appConfig = {
        maintenance: false,
        vacation: false,
        banner: "",
      };
      try {
        const savedConfig = await kv.get("app_config");
        if (savedConfig) appConfig = savedConfig;
      } catch (e) {}

      return res.json({
        totalUsers,
        activeGroupsCount,
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
      const { userId, action, message, configData, targetId } = req.body || {};
      const userCleanId = cleanId(userId);

      if (!userCleanId || !adminEnvId || userCleanId !== adminEnvId) {
        return res.status(403).json({ error: "Доступ заборонено (невірний ADMIN_ID)" });
      }

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

      // ДІЯ: ПЕРЕВІРКА ОНОВЛЕНЬ РОЗКЛАДУ
      if (action === "check_updates") {
        const { checkForScheduleUpdates } = require("../lib/schedule-helper");
        const updates = await checkForScheduleUpdates();
        if (!updates || updates.length === 0) {
          return res.json({
            success: true,
            updates: [],
            message: "Оновлень не знайдено, розклад актуальний.",
          });
        }
        return res.json({
          success: true,
          updates,
          message: `Знайдено оновлень дат розкладу: ${updates.length}`,
        });
      }

      // ДІЯ: ОЧИЩЕННЯ КЕШУ
      if (action === "clear_cache") {
        try {
          const keys = await kv.keys("cache_*");
          if (keys.length > 0) await kv.del(...keys);
        } catch (e) {}
        return res.json({ success: true, message: `✅ Кеш успішно очищено!` });
      }

      // ДІЯ: ОНОВЛЕННЯ КОНФІГУ ДОДАТКУ
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
          let userGroup = "Не обрано";
          try {
            userGroup = (await kv.get(`user_${targetId}`)) || "Не обрано";
          } catch (e) {}

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

    return res.status(405).json({ error: "Метод не підтримується" });
  } catch (error) {
    console.error("Помилка admin API:", error);
    res.status(500).json({ error: "Помилка сервера: " + error.message });
  }
};
