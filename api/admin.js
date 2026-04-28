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
    // 1. ВИДАЧА СТАТИСТИКИ ТА КОНФІГІВ (GET)
    // ==========================================
    if (req.method === "GET") {
      const userId = req.query.userId;
      if (String(userId) !== process.env.ADMIN_ID) {
        return res.status(403).json({ error: "Доступ заборонено" });
      }

      // Отримуємо статистику
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
      const topGroups = Object.entries(groupCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map((entry) => `${entry[0]} (${entry[1]} студ.)`);

      // Отримуємо конфіг додатку (банер і тех. роботи)
      const appConfig = (await kv.get("app_config")) || {
        maintenance: false,
        banner: "",
      };

      return res.json({
        totalUsers,
        notifOnCount,
        notifOffCount,
        topGroups,
        appConfig,
      });
    }

    // ==========================================
    // 2. ДІЇ АДМІНІСТРАТОРА (POST)
    // ==========================================
    if (req.method === "POST") {
      const { userId, action, message, configData } = req.body;

      if (String(userId) !== process.env.ADMIN_ID) {
        return res.status(403).json({ error: "Доступ заборонено" });
      }

      // ДІЯ 1: ОЧИЩЕННЯ КЕШУ
      if (action === "clear_cache") {
        const keys = await kv.keys("cache_*");
        if (keys.length > 0) await kv.del(...keys);
        return res.json({ success: true, message: `✅ Кеш успішно очищено!` });
      }

      // ДІЯ 2: РОЗСИЛКА ПОВІДОМЛЕНЬ
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
            /* Ігноруємо помилки заблокованих ботів */
          }
        }
        return res.json({
          success: true,
          count: successCount,
          message: `✅ Відправлено ${successCount} юзерам!`,
        });
      }

      // ДІЯ 3: ОНОВЛЕННЯ НАЛАШТУВАНЬ ДОДАТКУ (Банер та Тех. роботи)
      if (action === "update_config") {
        await kv.set("app_config", configData);
        return res.json({
          success: true,
          message: "✅ Налаштування збережено!",
        });
      }

      return res.status(400).json({ error: "Невідома дія" });
    }
    // ==========================================
    // 1. ВИДАЧА СТАТИСТИКИ ДЛЯ ДАШБОРДУ (GET)
    // ==========================================
    if (req.method === "GET") {
      const userId = req.query.userId;
      if (String(userId) !== process.env.ADMIN_ID) {
        return res.status(403).json({ error: "Доступ заборонено" });
      }

      // Отримуємо статистику (твій старий код)
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
      const topGroups = Object.entries(groupCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map((entry) => `${entry[0]} (${entry[1]} студ.)`);

      const appConfig = (await kv.get("app_config")) || {
        maintenance: false,
        banner: "",
      };

      // 👇 ОСЬ ЦЕЙ НОВИЙ БЛОК: Дістаємо графік за 7 днів
      const chartLabels = [];
      const chartData = [];

      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split("T")[0]; // YYYY-MM-DD

        // Читаємо лічильник з бази (якщо ніхто не заходив - ставимо 0)
        const visits = (await kv.get(`stat_visits_${dateStr}`)) || 0;

        chartLabels.push(dateStr.slice(5)); // Зберігаємо як "04-28"
        chartData.push(visits);
      }

      // Не забудь додати chartLabels та chartData сюди 👇
      return res.json({
        totalUsers,
        notifOnCount,
        notifOffCount,
        topGroups,
        appConfig,
        chartLabels,
        chartData,
      });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Помилка сервера" });
  }
};
