const { Telegraf, Markup } = require("telegraf");
const { kv } = require("@vercel/kv");

const bot = new Telegraf(process.env.BOT_TOKEN);
bot.catch((err, ctx) => {
  console.error('Unhandled bot error:', err);
  try {
    ctx.reply('⚠️ Сервіс тимчасово оновлюється або база даних налаштовується. Спробуйте через хвилину! 🔄');
  } catch (e) {}
});


bot.use(async (ctx, next) => {
  try {
    if (!ctx.from) return next();

    // Дістаємо налаштування з бази
    const config = await kv.get("app_config");

    // 1. ПЕРЕВІРКА: ТЕХНІЧНІ РОБОТИ
    if (config && config.maintenance) {
      // Якщо пише Адмін — пропускаємо його (щоб ти міг тестувати бота)
      if (String(ctx.from.id) === process.env.ADMIN_ID) {
        return next();
      }
      // Всім іншим блокуємо роботу бота
      return ctx.reply(
        "🛠 *Бот зараз на технічному оновленні!*\n\nМи додаємо нові фічі. Повернемося зовсім скоро 🚀",
        { parse_mode: "Markdown" },
      );
    }

    // 2. ПЕРЕВІРКА: КАНІКУЛИ
    if (config && config.vacation) {
      if (String(ctx.from.id) === process.env.ADMIN_ID) {
        return next();
      }
      // Щоб бот не видавав розклад на канікулах
      return ctx.reply(
        "🌴 *Ура, канікули!*\n\nПар немає, час відпочивати. Набирайся сил! 😎🍹",
        { parse_mode: "Markdown" },
      );
    }
  } catch (e) {
    console.error("Помилка охоронця:", e);
  }

  // Якщо все добре (немає тех. робіт і канікул) — пускаємо команду далі!
  return next();
});

const { sheetsConfig, timeMap } = require("../lib/config");
const { getScheduleForDayAndGroup } = require("../lib/schedule-parser");

// ==========================================
// ФУНКЦІЯ ДЛЯ ЗАВАНТАЖЕННЯ ДАНИХ З ТАБЛИЦІ
// ==========================================

async function getSheetData(sheetId, gid = "0") {
  // Створюємо унікальний ключ для цієї таблиці
  const cacheKey = `cache_${sheetId}_${gid}`;

  // 1. Спочатку шукаємо в швидкій пам'яті (KV)
  const cachedData = await kv.get(cacheKey);
  if (cachedData) {
    return cachedData; // Блискавичне повернення!
  }

  // 2. Якщо в кеші пусто (або пройшла 1 година) - йдемо в Google
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
  const response = await fetch(url);
  const textData = await response.text();
  const rows = textData.split("\n");

  // 3. Зберігаємо результат у кеш на 3600 секунд (1 годину)
  await kv.set(cacheKey, rows, { ex: 3600 });

  return rows;
}

// 🛡 АВТО-ПЕРЕКЛАДАЧ (Виправляє англійські літери на українські)
function normalizeGroup(name) {
  const latinToCyrillic = {
    A: "А",
    B: "В",
    C: "С",
    E: "Е",
    H: "Н",
    I: "І",
    K: "К",
    M: "М",
    O: "О",
    P: "Р",
    T: "Т",
    X: "Х",
  };
  return name
    .toUpperCase()
    .replace(/[ABCEHIKMOPTX]/g, (m) => latinToCyrillic[m])
    .trim();
}

// ==========================================
// АВТО-СКАНЕР ГРУП (З таблиці аудиторій)
// ==========================================
async function getAvailableGroups() {
  try {
    const rows = await getSheetData(
      sheetsConfig.mon.id,
      sheetsConfig.mon.sheets.audience,
    );
    let groups = [];
    for (let row of rows) {
      const firstCell = row.split(",")[0].replace(/"/g, "").trim();
      if (/^\d{3}.*-[А-ЯІЇЄA-Z]/i.test(firstCell)) {
        if (!groups.includes(firstCell)) groups.push(firstCell);
      }
    }
    return groups;
  } catch (error) {
    return ["306-К", "307-К"];
  }
}

function chunkArray(arr, size) {
  const result = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

// ==========================================
// КОМАНДИ НАЛАШТУВАННЯ
// ==========================================
bot.command("start", async (ctx) => {
  if (ctx.chat.type !== "private") return; // В групах /start не показує кнопки
  await ctx.reply("🔄 Завантажую список...");
  const groups = await getAvailableGroups();
  return ctx.reply(
    "Обери свою групу:",
    Markup.keyboard(chunkArray(groups, 3)).resize(),
  );
});

// ==========================================
// КОМАНДА АДМІНІСТРАТОРА (/admin та /admin_test)
// ==========================================
const handleAdmin = (ctx) => {
  if (String(ctx.from.id) === String(process.env.ADMIN_ID)) {
    const adminUrl = `${APP_BASE_URL}/admin.html?userId=${ctx.from.id}`;
    return ctx.reply(
      "👑 Вітаю, пане Адміністратор! Ваша адмін-панель готова:",
      Markup.inlineKeyboard([
        [Markup.button.webApp("⚙️ Відкрити Адмінку (Mini App)", adminUrl)],
        [Markup.button.url("🌐 Відкрити у браузері", adminUrl)],
      ]),
    );
  } else {
    return ctx.reply("Я не розумію цю команду 🤷‍♂️");
  }
};

bot.command("admin", handleAdmin);
bot.command("admin_test", handleAdmin);

bot.command("menu", (ctx) => {
  const kb = [
    ["понеділок", "вівторок"],
    ["середа", "четвер", "п'ятниця"],
    ["субота"],
  ];
  if (ctx.chat.type === "private") {
    kb.push(["Змінити групу", "⚙️ Налаштування"]); // Додали налаштування сюди!
  }
  return ctx.reply("Оберіть дію:", Markup.keyboard(kb).resize());
});

// Обробляємо натискання на кнопку "Налаштування"
bot.hears("⚙️ Налаштування", (ctx) => {
  if (ctx.chat.type !== "private") return;
  return ctx.reply(
    "Відкрийте панель налаштувань:",
    Markup.inlineKeyboard([
      Markup.button.webApp(
        "Відкрити Налаштування",
        `${APP_BASE_URL}/settings.html`,
      ), // ЗАМІНИ НА СВІЙ ДОМЕН!
    ]),
  );
});

// ==========================================
// НАЛАШТУВАННЯ ДЛЯ ГРУП
// ==========================================
bot.command("setgroups", async (ctx) => {
  if (ctx.chat.type === "private") {
    return ctx.reply("Ця команда працює тільки в групах з друзями.");
  }

  const chatMember = await ctx.telegram.getChatMember(ctx.chat.id, ctx.from.id);
  if (!["administrator", "creator"].includes(chatMember.status)) {
    return ctx.reply("❌ Тільки адмін може налаштовувати бота.");
  }

  const args = ctx.message.text.split(" ").slice(1).join(" ");
  if (!args) {
    return ctx.reply("Вкажіть групи. Приклад:\n`/setgroups 306-К, 101-О`", {
      parse_mode: "Markdown",
    });
  }

  // Розділяємо і по комах, і по пробілах, щоб точно зловити все!
  const groups = args
    .split(/[, ]+/)
    .filter((g) => g)
    .map(normalizeGroup);

  await kv.set(`chat_${ctx.chat.id}_groups`, groups);
  await kv.sadd("active_chats", ctx.chat.id); // Для будильника

  return ctx.reply(
    `✅ Збережено! Групи для цього чату: **${groups.join(", ")}**`,
    { parse_mode: "Markdown" },
  );
});

// ==========================================
// ОСНОВНА ФУНКЦІЯ (З рентгеном чату)
// ==========================================
async function sendSchedule(ctx, dayKey, dayName) {
  try {
    let targetGroups = [];
    let chatModeText = "";

    if (ctx.chat.type === "private") {
      chatModeText = "👤 Приватний чат";
      const userGroup = await kv.get(`user_${ctx.from.id}`);
      if (!userGroup)
        return ctx.reply("⚠️ Ти ще не обрав групу! Натисни /start.");
      targetGroups = [userGroup];
    } else {
      chatModeText = "👥 Груповий чат";
      const chatGroups = await kv.get(`chat_${ctx.chat.id}_groups`);
      if (!chatGroups || chatGroups.length === 0)
        return ctx.reply("Адмін ще не налаштував групи. Введіть /setgroups");
      targetGroups = chatGroups;
    }

    let headerDate = "";
    let studyMode = "";
    const groupResults = [];

    for (let currentGroup of targetGroups) {
      const res = await getScheduleForDayAndGroup(dayKey, currentGroup);
      if (res && res.date && !headerDate) headerDate = res.date;
      if (res && res.studyMode && !studyMode) studyMode = res.studyMode;
      groupResults.push(res);
    }

    const displayDate = headerDate || dayName;
    let finalMessage = `🗓 Розклад на **${displayDate}**\n🔧 Режим: ${chatModeText} (${targetGroups.join(", ")})`;
    if (studyMode) finalMessage += `\n📍 Формат: ${studyMode}`;
    finalMessage += "\n\n";

    for (let res of groupResults) {
      if (res.error) {
        finalMessage += `🔥 **${res.group || "Група"}**\n❌ ${res.error}\n\n`;
        continue;
      }

      finalMessage += `🔥 **${res.group}**\n`;
      for (let p of res.pairs) {
        const pairNum = p.pair;
        const timeStr = p.time;
        const lesson = p.name;
        const lessonType = p.type || "🧩 Практика";
        const audience = p.aud || "Дистанційно";

        if (lesson !== "Немає" && lesson !== "") {
          finalMessage += `🔹 *Пара ${pairNum}* |  ⏳ _${timeStr}_\n`;
          finalMessage += `📚 *${lesson}*\n`;
          finalMessage += `🏷 Формат: _${lessonType}_\n`;
          finalMessage += `🚪 Аудиторія: \`${audience}\`\n`;
          finalMessage += `➖➖➖➖➖➖➖➖➖➖\n`;
        } else {
          finalMessage += `🔸 *Пара ${pairNum}* |  ⏳ _${timeStr}_\n`;
          finalMessage += `☕ _Немає пари_\n`;
          finalMessage += `➖➖➖➖➖➖➖➖➖➖\n`;
        }
      }
    }

    const sentMsg = await ctx.replyWithMarkdown(finalMessage);

    // ЗАКРІПЛЕННЯ В ГРУПІ
    if (ctx.chat.type !== "private") {
      const oldMsgId = await kv.get(`chat_${ctx.chat.id}_pinned_msg`);
      if (oldMsgId) {
        try {
          await ctx.telegram.unpinChatMessage(ctx.chat.id, oldMsgId);
        } catch (e) {}
      }
      await ctx.telegram.pinChatMessage(ctx.chat.id, sentMsg.message_id, {
        disable_notification: true,
      });
      await kv.set(`chat_${ctx.chat.id}_pinned_msg`, sentMsg.message_id);
    }
  } catch (error) {
    console.error(`Помилка:`, error);
    await ctx.reply("Виникла помилка під час завантаження розкладу.");
  }
}

bot.hears("понеділок", (ctx) => sendSchedule(ctx, "mon", "Понеділок"));
bot.hears("вівторок", (ctx) => sendSchedule(ctx, "tue", "Вівторок"));
bot.hears("середа", (ctx) => sendSchedule(ctx, "wed", "Середу"));
bot.hears("четвер", (ctx) => sendSchedule(ctx, "thu", "Четвер"));
bot.hears("п'ятниця", (ctx) => sendSchedule(ctx, "fri", "П'ятницю"));
bot.hears("субота", (ctx) => sendSchedule(ctx, "sat", "Суботу"));

// ==========================================
// ОБРОБКА КНОПКИ "РОЗКЛАД НА СЬОГОДНІ"
// ==========================================
bot.action(/today_(mon|tue|wed|thu|fri|sat)/, async (ctx) => {
  const dayKey = ctx.match[1];
  const daysNames = {
    mon: "Понеділок",
    tue: "Вівторок",
    wed: "Середу",
    thu: "Четвер",
    fri: "П'ятницю",
    sat: "Суботу",
  };

  // Прибираємо значок "завантаження" з кнопки
  await ctx.answerCbQuery("Завантажую розклад...");

  // Запускаємо ту саму ідеальну функцію, яку ми написали раніше!
  await sendSchedule(ctx, dayKey, daysNames[dayKey]);
});

module.exports = async (req, res) => {
  try {
    await bot.handleUpdate(req.body);
    res.status(200).send("OK");
  } catch (error) {
    res.status(200).send("OK");
  }
};
