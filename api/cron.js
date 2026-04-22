const { Telegraf, Markup } = require("telegraf");
const { kv } = require("@vercel/kv");

const bot = new Telegraf(process.env.BOT_TOKEN);

module.exports = async (req, res) => {
  try {
    // Vercel автоматично додає цей секретний ключ для безпеки
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      console.log("❌ Неавторизований запуск крону!");
      // Для тестування вручну розкоментуй наступний рядок:
      // return res.status(401).send('Unauthorized');
    }

    const today = new Date(
      new Date().toLocaleString("en-US", { timeZone: "Europe/Kyiv" }),
    );
    const dayOfWeek = today.getDay(); // 0 - Неділя, 1 - Понеділок...

    if (dayOfWeek === 0) {
      return res.status(200).send("Сьогодні неділя. Відпочиваємо!");
    }

    const daysMap = {
      1: "mon",
      2: "tue",
      3: "wed",
      4: "thu",
      5: "fri",
      6: "sat",
    };
    const dayKey = daysMap[dayOfWeek];

    // Кнопка, яка прикріпиться до повідомлення
    const keyboard = Markup.inlineKeyboard([
      Markup.button.callback("📅 Мій розклад на сьогодні", `today_${dayKey}`),
    ]);

    const text =
      "🌅 Доброго ранку! Твій розклад на сьогодні вже чекає. Вдалого дня та легких пар! ☕️";

    // 1. ВІДПРАВЛЯЄМО В ГРУПИ
    const activeChats = (await kv.smembers("active_chats")) || [];
    for (let chatId of activeChats) {
      try {
        await bot.telegram.sendMessage(chatId, text, keyboard);
      } catch (e) {
        console.log(`Не зміг відправити в чат ${chatId}`);
      }
    }

    // 2. ВІДПРАВЛЯЄМО ПРИВАТНИМ ЮЗЕРАМ
    let [, keys] = await kv.scan(0, { match: "user_*", count: 1000 });
    // Фільтруємо ключі, щоб брати тільки групи (user_123), а не налаштування (user_123_notif)
    let userIds = keys
      .filter((k) => !k.includes("_notif"))
      .map((k) => k.replace("user_", ""));

    for (let userId of userIds) {
      try {
        // ПЕРЕВІРЯЄМО НАЛАШТУВАННЯ:
        const wantsNotif = await kv.get(`user_${userId}_notif`);
        // Відправляємо, ТІЛЬКИ якщо налаштування не вимкнене (false)
        if (wantsNotif !== false) {
          await bot.telegram.sendMessage(userId, text, keyboard);
        }
      } catch (e) {
        console.log(`Не зміг відправити юзеру ${userId}`);
      }
    }

    res.status(200).send("✅ Ранкова розсилка успішно завершена!");
  } catch (error) {
    console.error("Помилка крону:", error);
    res.status(500).send("Помилка сервера");
  }
};
