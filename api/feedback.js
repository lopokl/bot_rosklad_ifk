const { Telegraf } = require("telegraf");
const { kv } = require("@vercel/kv");

const bot = new Telegraf(process.env.BOT_TOKEN);

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const { userId, message } = req.body;
    if (!userId || !message.trim()) {
      return res.status(400).json({ error: "Порожні дані" });
    }

    // Дістаємо групу юзера, щоб ти знав, у кого саме помилка в розкладі
    const group = (await kv.get(`user_${userId}`)) || "Групу не обрано";

    // Формуємо красиве повідомлення для тебе
    const adminMsg = `📩 **Новий відгук / Помилка!**\n\n👤 ID: \`${userId}\`\n🎓 Група: **${group}**\n\n💬 Текст:\n_${message}_`;

    // Відправляємо повідомлення тобі (використовуємо ADMIN_ID з Vercel)
    await bot.telegram.sendMessage(process.env.ADMIN_ID, adminMsg, {
      parse_mode: "Markdown",
    });

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Помилка сервера" });
  }
};
