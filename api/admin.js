const { Telegraf } = require("telegraf");
const { kv } = require("@vercel/kv");

const bot = new Telegraf(process.env.BOT_TOKEN);

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { userId, message } = req.body;

    // СУВОРИЙ ЗАХИСТ: Перевіряємо, чи запит дійсно від тебе
    if (String(userId) !== process.env.ADMIN_ID) {
      return res
        .status(403)
        .json({ error: "Доступ заборонено! Ви не адміністратор." });
    }

    if (!message || message.trim() === "") {
      return res
        .status(400)
        .json({ error: "Повідомлення не може бути порожнім." });
    }

    // Скануємо базу і дістаємо ВСІХ користувачів
    let [, keys] = await kv.scan(0, { match: "user_*", count: 1000 });
    let userIds = keys.map((k) => k.replace("user_", ""));
    let successCount = 0;

    // Відправляємо кожному
    const broadcastText = `📢 *Оголошення від Адміністратора:*\n\n${message}`;

    for (let uid of userIds) {
      try {
        await bot.telegram.sendMessage(uid, broadcastText, {
          parse_mode: "Markdown",
        });
        successCount++;
      } catch (e) {
        console.log(
          `Не зміг відправити юзеру ${uid} (можливо, він заблокував бота)`,
        );
      }
    }

    res.json({ success: true, count: successCount });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Помилка сервера" });
  }
};
