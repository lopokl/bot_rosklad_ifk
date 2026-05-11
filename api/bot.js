const { Telegraf, Markup } = require("telegraf");
const { kv } = require("@vercel/kv");

const bot = new Telegraf(process.env.BOT_TOKEN);

const { sheetsConfig, timeMap } = require("./config");

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
// КОМАНДА АДМІНІСТРАТОРА
// ==========================================
bot.command("admin_test", (ctx) => {
  // Перевіряємо, чи ID користувача збігається з твоїм ADMIN_ID з Vercel
  if (String(ctx.from.id) === process.env.ADMIN_ID) {
    return ctx.reply(
      "👑 Вітаю, пане Адміністратор! Ваша панель готова:",
      Markup.inlineKeyboard([
        // ОБОВ'ЯЗКОВО ЗАМІНИ ПОСИЛАННЯ НА СВІЙ VERCEL:
        Markup.button.webApp(
          "⚙️ Відкрити Адмінку",
          "https://bot-rosklad-ifk.vercel.app/admin.html",
        ),
      ]),
    );
  } else {
    // Якщо хтось інший введе /admin, бот прикинеться дурником
    return ctx.reply("Я не розумію цю команду 🤷‍♂️");
  }
});

bot.hears("Змінити групу", async (ctx) => {
  if (ctx.chat.type !== "private") return;
  await ctx.reply("🔄 Завантажую список...");
  const groups = await getAvailableGroups();
  return ctx.reply(
    "Обери нову групу:",
    Markup.keyboard(chunkArray(groups, 3)).resize(),
  );
});

// Реєстрація в приватному чаті
bot.hears(/^\d{3}.*-[А-ЯІЇЄA-Z]/i, async (ctx) => {
  if (ctx.chat.type !== "private") return;
  const group = normalizeGroup(ctx.message.text);
  await kv.set(`user_${ctx.from.id}`, group);
  return ctx.reply(`✅ Збережено: **${group}**.\nТисни /menu`, {
    parse_mode: "Markdown",
  });
});

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
        "https://bot-rosklad-ifk.vercel.app/settings.html",
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

    // БРОНЯ: Точно визначаємо тип чату
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

    const sheetId = sheetsConfig[dayKey].id;
    const [itRows, finRows, entRows, audRows] = await Promise.all([
      getSheetData(sheetId, sheetsConfig[dayKey].sheets.it),
      getSheetData(sheetId, sheetsConfig[dayKey].sheets.finance),
      getSheetData(sheetId, sheetsConfig[dayKey].sheets.enterprise),
      getSheetData(sheetId, sheetsConfig[dayKey].sheets.audience),
    ]);

    const allDepartments = [itRows, finRows, entRows];

    let targetDate = "";
    for (let i = 0; i < Math.min(10, itRows.length); i++) {
      const columns = itRows[i].split(",");
      for (let col of columns) {
        const cleanCol = col.replace(/"/g, "").trim();
        if (
          cleanCol.toLowerCase().includes("на ") &&
          cleanCol.includes("202")
        ) {
          targetDate = cleanCol.replace(/^на\s+/i, "");
          break;
        }
      }
      if (targetDate) break;
    }
    if (!targetDate) targetDate = dayName;

    // РЕНТГЕН: Показуємо, що саме бот зараз робить
    let finalMessage = `🗓 Розклад на **${targetDate}**\n🔧 Режим: ${chatModeText} (${targetGroups.join(", ")})\n\n`;

    for (let currentGroup of targetGroups) {
      let subjRows = null;
      let groupCol = -1;
      let startRow = -1;

      for (let deptRows of allDepartments) {
        for (let i = 0; i < deptRows.length; i++) {
          const columns = deptRows[i].split(",");
          for (let j = 0; j < columns.length; j++) {
            // Нормалізуємо таблицю так само, щоб точно збіглося
            if (normalizeGroup(columns[j].replace(/"/g, "")) === currentGroup) {
              groupCol = j;
              startRow = i + 1;
              subjRows = deptRows;
              break;
            }
          }
          if (groupCol !== -1) break;
        }
        if (groupCol !== -1) break;
      }

      if (groupCol === -1 || !subjRows) {
        finalMessage += `🔥 **${currentGroup}**\n❌ Пар немає або групу не знайдено.\n\n`;
        continue;
      }

      let audGroupRow = null;
      for (let i = 0; i < audRows.length; i++) {
        const columns = audRows[i].split(",");
        const groupName = columns[0]
          ? normalizeGroup(columns[0].replace(/"/g, ""))
          : "";
        if (groupName === currentGroup) {
          audGroupRow = columns;
          break;
        }
      }

      const headers = subjRows[startRow - 1].split(",");
      const activeGroups = [];
      for (let j = 1; j < headers.length; j++) {
        if (headers[j].replace(/"/g, "").trim() !== "") activeGroups.push(j);
      }

      finalMessage += `🔥 **${currentGroup}**\n`;

      for (let i = startRow; i < subjRows.length; i++) {
        const columns = subjRows[i].split(",");
        const pairNum = columns[0].replace(/"/g, "").trim();

        if (!["1", "2", "3", "4", "5", "6"].includes(pairNum)) {
          if (pairNum === "") {
            const hasTextInRow = columns.some(
              (col, index) => index > 0 && col.replace(/"/g, "").trim() !== "",
            );
            if (hasTextInRow) break;
            continue;
          }
          break;
        }

        let lesson = columns[groupCol]
          ? columns[groupCol].replace(/"/g, "").trim()
          : "";
        let lessonType = "🧩 Практика";
        const ignoredSubjects = [
          "Іноземна",
          "Фізична культура",
          "Англ",
          "Виховна"
        ];

        if (lesson === "-") {
          lesson = "";
        } else if (lesson === "") {
          for (let k = groupCol - 1; k >= 1; k--) {
            const leftCell = columns[k]
              ? columns[k].replace(/"/g, "").trim()
              : "";
            const isIgnored = ignoredSubjects.some((word) =>
              leftCell.includes(word),
            );
            if (leftCell !== "" && leftCell !== "-" && !isIgnored) {
              lesson = leftCell;
              lessonType = "📢 Лекція";
              break;
            }
          }
        } else {
          const ourIndex = activeGroups.indexOf(groupCol);
          if (ourIndex !== -1 && ourIndex < activeGroups.length - 1) {
            const nextGroupCol = activeGroups[ourIndex + 1];
            const nextGroupCell = columns[nextGroupCol]
              ? columns[nextGroupCol].replace(/"/g, "").trim()
              : "";
            const isIgnored = ignoredSubjects.some((word) =>
              lesson.includes(word),
            );
            if (nextGroupCell === "" && !isIgnored) {
              lessonType = "📢 Лекція";
            }
          }
        }

        let audience = "Не вказано";
        if (lesson !== "" && audGroupRow) {
          const pairIndex = parseInt(pairNum, 10);
          if (!isNaN(pairIndex) && audGroupRow[pairIndex]) {
            audience = audGroupRow[pairIndex].replace(/"/g, "").trim();
          }
        }

        if (audience === "" || audience === "-") audience = "Не вказано";
        const timeStr = timeMap[pairNum] || "";

        if (lesson !== "") {
          // дизайн основний
          finalMessage += `🔹 *Пара ${pairNum}* |  ⏳ _${timeStr}_\n`;
          finalMessage += `📚 *${lesson}*\n`;
          finalMessage += `🏷 Формат: _${lessonType}_\n`;
          finalMessage += `🚪 Аудиторія: \`${audience}\`\n`;
          finalMessage += `➖➖➖➖➖➖➖➖➖➖\n`; // Розділювач між парами
        } else {
          // Дизайн для немає пари
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
