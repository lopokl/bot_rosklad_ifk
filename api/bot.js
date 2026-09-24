const { Telegraf, Markup } = require("telegraf");
let kv;
try {
  kv = require("@vercel/kv").kv;
} catch (e) {
  kv = {
    get: async () => null,
    set: async () => {},
    sadd: async () => {},
    incr: async () => 1,
    expire: async () => {},
    lpush: async () => {},
    ltrim: async () => {},
  };
}

const { sheetsConfig, timeMap } = require("../lib/config");
const { getScheduleForDayAndGroup, cleanGroupName } = require("../lib/schedule-parser");

const bot = new Telegraf(process.env.BOT_TOKEN);

const APP_BASE_URL = process.env.APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://bot-rosklad-ifk.vercel.app");

bot.catch((err, ctx) => {
  console.error("Unhandled bot error:", err);
  try {
    ctx.reply(
      "⚠️ Сервіс тимчасово оновлюється або база даних налаштовується. Спробуйте через хвилину! 🔄",
    );
  } catch (e) {}
});

// ==========================================
// 🛡 MIDDLEWARE: ТЕХНІЧНІ РОБОТИ ТА КАНІКУЛИ
// ==========================================
bot.use(async (ctx, next) => {
  try {
    if (!ctx.from) return next();

    const config = await kv.get("app_config");

    if (config && config.maintenance) {
      if (String(ctx.from.id) === String(process.env.ADMIN_ID)) {
        return next();
      }
      return ctx.reply(
        "🛠 *Бот зараз на технічному оновленні!*\n\nМи додаємо нові фічі. Повернемося зовсім скоро 🚀",
        { parse_mode: "Markdown" },
      );
    }

    if (config && config.vacation) {
      if (String(ctx.from.id) === String(process.env.ADMIN_ID)) {
        return next();
      }
      return ctx.reply(
        "🌴 *Ура, канікули!*\n\nПар немає, час відпочивати. Набирайся сил! 😎🍹",
        { parse_mode: "Markdown" },
      );
    }
  } catch (e) {
    console.error("Помилка middleware:", e);
  }
  return next();
});

// ==========================================
// ДЕКОДУВАННЯ ТА СПИСОК ГРУП
// ==========================================
async function getAvailableGroups() {
  const cacheKey = "cache_available_groups_list";
  try {
    const cached = await kv.get(cacheKey);
    if (cached && Array.isArray(cached) && cached.length > 0) return cached;
  } catch (e) {}

  try {
    const url = `https://docs.google.com/spreadsheets/d/${sheetsConfig.mon.id}/export?format=csv&gid=${sheetsConfig.mon.sheets.audience}`;
    const res = await fetch(url);
    const text = await res.text();
    const rows = text.split("\n");
    const groups = [];

    for (let r of rows) {
      const firstCell = r.split(",")[0].replace(/"/g, "").trim();
      if (/^\d{3}/.test(firstCell)) {
        if (!groups.includes(firstCell)) groups.push(firstCell);
      }
    }

    if (groups.length > 0) {
      try {
        await kv.set(cacheKey, groups, { ex: 3600 });
      } catch (e) {}
      return groups;
    }
  } catch (e) {
    console.error("Error fetching available groups:", e);
  }

  return [
    "101-О", "107-І", "108-І", "109-К", "110-К",
    "208-І", "209-І", "210-К", "211-К",
    "308-К", "309-К", "406-К", "407-К"
  ];
}

function chunkArray(arr, size) {
  const result = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

function getMainKeyboard(ctx) {
  return Markup.keyboard([
    ["📅 Сьогодні", "🗓 Завтра"],
    ["Понеділок", "Вівторок", "Середа"],
    ["Четвер", "П'ятниця", "Субота"],
    ["✏️ Змінити групу", "⚙️ Налаштування"],
  ]).resize();
}

function getCourseSelectionKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("1️⃣ 1 курс", "course_1"),
      Markup.button.callback("2️⃣ 2 курс", "course_2"),
    ],
    [
      Markup.button.callback("3️⃣ 3 курс", "course_3"),
      Markup.button.callback("4️⃣ 4 курс", "course_4"),
    ],
    [
      Markup.button.callback("📋 Всі групи списком", "course_all"),
    ],
  ]);
}

function getKyivDayKey(offsetDays = 0) {
  const now = new Date();
  const targetDate = new Date(now.getTime() + offsetDays * 24 * 60 * 60 * 1000);
  const kyivDay = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Kyiv",
    weekday: "short",
  }).format(targetDate).toLowerCase();

  const map = {
    mon: "mon",
    tue: "tue",
    wed: "wed",
    thu: "thu",
    fri: "fri",
    sat: "sat",
    sun: "mon",
  };
  return map[kyivDay] || "mon";
}

// ==========================================
// 🚀 КОМАНДА /START ТА ЗМІНА ГРУПИ
// ==========================================
async function promptGroupSelection(ctx, isWelcome = false) {
  let text = isWelcome
    ? `👋 **Привіт, ${ctx.from.first_name || "студенте"}!**\nЯ бот розкладу коледжу.\n\n👇 **Обери свій курс**, щоб обрати групу, або просто **напиши назву групи у чат** (наприклад, \`407-К\`):`
    : `🎓 **Обери свій курс**, або напиши назву групи у чат:`;

  return ctx.reply(text, {
    parse_mode: "Markdown",
    ...getCourseSelectionKeyboard(),
  });
}

bot.command("start", async (ctx) => {
  if (ctx.chat.type !== "private") return;
  try {
    await kv.sadd("bot_users", ctx.from.id);
  } catch (e) {}

  const existingGroup = await kv.get(`user_${ctx.from.id}`);
  if (existingGroup) {
    return ctx.reply(
      `👋 **Привіт, ${ctx.from.first_name || "студенте"}!**\nТвоя збережена група: **${existingGroup}**.\n\nОбери день для перегляду розкладу або налаштуй бота:`,
      { parse_mode: "Markdown", ...getMainKeyboard(ctx) },
    );
  }

  return promptGroupSelection(ctx, true);
});

bot.command(["group", "change_group"], async (ctx) => {
  if (ctx.chat.type !== "private") return;
  return promptGroupSelection(ctx, false);
});

bot.hears(/^(✏️ )?змінити групу$/i, async (ctx) => {
  if (ctx.chat.type !== "private") return;
  return promptGroupSelection(ctx, false);
});

// ==========================================
// ⚙️ НАЛАШТУВАННЯ
// ==========================================
async function sendSettings(ctx) {
  if (ctx.chat.type !== "private") return;
  const currentGroup = (await kv.get(`user_${ctx.from.id}`)) || "Не обрано";
  const appUrl = `${APP_BASE_URL}/app.html?userId=${ctx.from.id}&group=${encodeURIComponent(currentGroup)}`;

  const text = `⚙️ **Налаштування бота**\n\n` +
    `👤 **Користувач:** ${ctx.from.first_name || "Студент"} ${ctx.from.username ? `(@${ctx.from.username})` : ""}\n` +
    `🎓 **Твоя група:** **${currentGroup}**\n` +
    `🆔 **Твій ID:** \`${ctx.from.id}\`\n\n` +
    `Оберіть дію нижче:`;

  return ctx.reply(text, {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard([
      [Markup.button.callback("✏️ Змінити групу", "action_change_group")],
      [Markup.button.webApp("📱 Відкрити розклад у Mini App", appUrl)],
    ]),
  });
}

bot.command(["settings", "menu"], async (ctx) => {
  if (ctx.chat.type === "private") {
    await ctx.reply("📋 Головне меню активовано:", getMainKeyboard(ctx));
    return sendSettings(ctx);
  } else {
    return ctx.reply("📋 Використовуйте команди днів: /mon, /tue, /wed, /thu, /fri, /sat або /setgroups");
  }
});

bot.hears(/^(⚙️ )?налаштування$/i, async (ctx) => {
  return sendSettings(ctx);
});

// ==========================================
// 🔄 ОБРОБНИКИ ІНЛАЙН-КНОПОК ВИБОРУ КУРСУ ТА ГРУПИ
// ==========================================
bot.action("action_change_group", async (ctx) => {
  await ctx.answerCbQuery();
  return promptGroupSelection(ctx, false);
});

bot.action("back_to_courses", async (ctx) => {
  await ctx.answerCbQuery();
  return ctx.editMessageText(
    "🎓 **Обери свій курс**, або напиши назву групи у чат:",
    { parse_mode: "Markdown", ...getCourseSelectionKeyboard() },
  );
});

bot.action(/^course_(\d|all)$/, async (ctx) => {
  await ctx.answerCbQuery("Завантажую групи...");
  const cNum = ctx.match[1];
  const allGroups = await getAvailableGroups();

  let filtered = allGroups;
  if (cNum !== "all") {
    filtered = allGroups.filter((g) => g.startsWith(cNum));
  }

  const buttons = filtered.map((g) =>
    Markup.button.callback(g, `selgrp_${g}`),
  );
  const rows = chunkArray(buttons, 3);
  rows.push([Markup.button.callback("🔙 Назад до курсів", "back_to_courses")]);

  return ctx.editMessageText(
    `🎓 **Оберіть вашу групу (${cNum === "all" ? "всі курси" : cNum + " курс"}):**\nАбо введіть назву групи вручну:`,
    { parse_mode: "Markdown", ...Markup.inlineKeyboard(rows) },
  );
});

bot.action(/^selgrp_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery("Групу збережено! 🎉");
  const chosenGroup = ctx.match[1];

  await kv.set(`user_${ctx.from.id}`, chosenGroup);
  try {
    await kv.sadd("bot_users", ctx.from.id);
  } catch (e) {}

  await ctx.deleteMessage().catch(() => {});
  return ctx.reply(
    `✅ **Твою групу успішно встановлено: ${chosenGroup}** 🎉\n\nТепер натискай кнопку потрібного дня тижня нижче:`,
    { parse_mode: "Markdown", ...getMainKeyboard(ctx) },
  );
});

// ==========================================
// ✍️ ТЕКСТОВИЙ ВВІД НАЗВИ ГРУПИ В ЧАТ
// ==========================================
bot.hears(/^\d{3}.*/, async (ctx) => {
  if (ctx.chat.type !== "private") return;
  const input = ctx.message.text.trim();
  const cleanInput = cleanGroupName(input);

  const allGroups = await getAvailableGroups();
  let matchedGroup = allGroups.find(
    (g) => cleanGroupName(g) === cleanInput,
  );

  if (!matchedGroup) {
    // Якщо не знайшли точного збігу, але формат правильний — беремо введений
    matchedGroup = input.toUpperCase().replace(/\s+/g, "");
  }

  await kv.set(`user_${ctx.from.id}`, matchedGroup);
  try {
    await kv.sadd("bot_users", ctx.from.id);
  } catch (e) {}

  return ctx.reply(
    `✅ **Твою групу успішно встановлено: ${matchedGroup}** 🎉\n\nТепер обери день тижня в меню нижче:`,
    { parse_mode: "Markdown", ...getMainKeyboard(ctx) },
  );
});

// ==========================================
// 👑 АДМІН-ПАНЕЛЬ
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

// ==========================================
// 👥 НАЛАШТУВАННЯ ДЛЯ ГРУПОВИХ ЧАТІВ
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
    return ctx.reply(
      "Вкажіть групи. Приклад:\n`/setgroups 407-К, 406-К`",
      { parse_mode: "Markdown" },
    );
  }

  const groups = args
    .split(/[, ]+/)
    .filter((g) => g)
    .map((g) => g.trim());

  await kv.set(`chat_${ctx.chat.id}_groups`, groups);
  try {
    await kv.sadd("active_chats", ctx.chat.id);
  } catch (e) {}

  return ctx.reply(
    `✅ Збережено! Групи для цього чату: **${groups.join(", ")}**`,
    { parse_mode: "Markdown" },
  );
});

// ==========================================
// 📅 ВІДПРАВКА РОЗКЛАДУ
// ==========================================
async function sendSchedule(ctx, dayKey, dayName) {
  try {
    let targetGroups = [];
    let chatModeText = "";

    if (ctx.chat.type === "private") {
      chatModeText = "👤 Приватний чат";
      const userGroup = await kv.get(`user_${ctx.from.id}`);
      if (!userGroup) {
        return ctx.reply(
          "⚠️ Ти ще не обрав групу! Обери свій курс:",
          { parse_mode: "Markdown", ...getCourseSelectionKeyboard() },
        );
      }
      targetGroups = [userGroup];
    } else {
      chatModeText = "👥 Груповий чат";
      const chatGroups = await kv.get(`chat_${ctx.chat.id}_groups`);
      if (!chatGroups || chatGroups.length === 0) {
        return ctx.reply("Адмін ще не налаштував групи. Введіть /setgroups");
      }
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

    if (ctx.chat.type !== "private") {
      try {
        const oldMsgId = await kv.get(`chat_${ctx.chat.id}_pinned_msg`);
        if (oldMsgId) {
          await ctx.telegram.unpinChatMessage(ctx.chat.id, oldMsgId).catch(() => {});
        }
        await ctx.telegram.pinChatMessage(ctx.chat.id, sentMsg.message_id, {
          disable_notification: true,
        }).catch(() => {});
        await kv.set(`chat_${ctx.chat.id}_pinned_msg`, sentMsg.message_id);
      } catch (e) {}
    }
  } catch (error) {
    console.error("Помилка sendSchedule:", error);
    await ctx.reply("Виникла помилка під час завантаження розкладу.");
  }
}

// ==========================================
// 📆 ОБРОБНИКИ КОМАНД І КНОПОК ДНІВ ТИЖНЯ
// ==========================================
bot.hears(/^(📅 )?сьогодні$/i, (ctx) => {
  const dayKey = getKyivDayKey(0);
  sendSchedule(ctx, dayKey, "Сьогодні");
});
bot.command("today", (ctx) => {
  const dayKey = getKyivDayKey(0);
  sendSchedule(ctx, dayKey, "Сьогодні");
});

bot.hears(/^(🗓 )?завтра$/i, (ctx) => {
  const dayKey = getKyivDayKey(1);
  sendSchedule(ctx, dayKey, "Завтра");
});
bot.command("tomorrow", (ctx) => {
  const dayKey = getKyivDayKey(1);
  sendSchedule(ctx, dayKey, "Завтра");
});

bot.hears(/^понеділок$/i, (ctx) => sendSchedule(ctx, "mon", "Понеділок"));
bot.command("mon", (ctx) => sendSchedule(ctx, "mon", "Понеділок"));

bot.hears(/^вівторок$/i, (ctx) => sendSchedule(ctx, "tue", "Вівторок"));
bot.command("tue", (ctx) => sendSchedule(ctx, "tue", "Вівторок"));

bot.hears(/^середа$/i, (ctx) => sendSchedule(ctx, "wed", "Середу"));
bot.command("wed", (ctx) => sendSchedule(ctx, "wed", "Середу"));

bot.hears(/^четвер$/i, (ctx) => sendSchedule(ctx, "thu", "Четвер"));
bot.command("thu", (ctx) => sendSchedule(ctx, "thu", "Четвер"));

bot.hears(/^п'?ятниця$/i, (ctx) => sendSchedule(ctx, "fri", "П'ятницю"));
bot.command("fri", (ctx) => sendSchedule(ctx, "fri", "П'ятницю"));

bot.hears(/^субота$/i, (ctx) => sendSchedule(ctx, "sat", "Суботу"));
bot.command("sat", (ctx) => sendSchedule(ctx, "sat", "Суботу"));

module.exports = async (req, res) => {
  try {
    await bot.handleUpdate(req.body);
    res.status(200).send("OK");
  } catch (error) {
    res.status(200).send("OK");
  }
};
