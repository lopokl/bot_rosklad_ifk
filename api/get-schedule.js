let kv;
try {
  kv = require("@vercel/kv").kv;
} catch (e) {
  kv = {
    get: async () => null,
    set: async () => {},
    incr: async () => 1,
    expire: async () => {},
    lpush: async () => {},
    ltrim: async () => {},
  };
}

const { getScheduleForDayAndGroup } = require("../lib/schedule-parser");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const userId = req.query.userId;
    const dayKey = req.query.day || "mon";

    // --- 📊 ЗБІР СТАТИСТИКИ ДЛЯ АДМІНКИ ---
    if (userId && userId !== "0") {
      try {
        const dateStr = new Date().toISOString().split("T")[0];
        const visitKey = `stat_visits_${dateStr}`;
        const visitsCount = await kv.incr(visitKey);
        if (visitsCount === 1) {
          await kv.expire(visitKey, 30 * 24 * 60 * 60);
        }

        const time = new Date().toLocaleTimeString("uk-UA", {
          timeZone: "Europe/Kyiv",
        });
        const userName = req.query.name || "Студент";
        const tgUser = req.query.username ? `(@${req.query.username})` : "";

        await kv.lpush(
          "recent_logs",
          `[${time}] ${userName} ${tgUser} | ID: ${userId}`,
        );
        await kv.ltrim("recent_logs", 0, 29);
      } catch (e) {}

      try {
        const limitKey = `rate_limit_${userId}`;
        const requestsCount = await kv.incr(limitKey);
        if (requestsCount === 1) {
          await kv.expire(limitKey, 60);
        }
        if (requestsCount > 35) {
          return res.status(429).json({ error: "Забагато запитів! Зачекайте хвилинку ⏳" });
        }
      } catch (e) {}
    }

    // --- ДІСТАЄМО ГРУПУ ---
    let rawUserGroup = req.query.group ? decodeURIComponent(req.query.group) : null;
    if (!rawUserGroup && userId && userId !== "0") {
      try {
        rawUserGroup = await kv.get(`user_${userId}`);
      } catch (e) {}
    }

    if (!rawUserGroup) {
      return res.status(404).json({
        error: "Групу не обрано. Будь ласка, вкажіть вашу групу.",
      });
    }

    const result = await getScheduleForDayAndGroup(dayKey, rawUserGroup);

    if (result.error) {
      return res.status(404).json(result);
    }

    return res.json({
      group: result.group,
      date: result.date,
      scheduleDate: result.date,
      schedule: result.schedule,
      pairs: result.pairs,
    });
  } catch (error) {
    console.error("Помилка get-schedule:", error);
    res.status(500).json({ error: "Помилка завантаження розкладу з сервера" });
  }
};
