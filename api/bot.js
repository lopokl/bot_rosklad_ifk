require("dotenv").config();
const { Telegraf, Markup } = require("telegraf");

const bot = new Telegraf(process.env.BOT_TOKEN);

const sheetsConfig = {
  mon: {
    id: "1lok-vuNC6Nx_Dx4w2vhRy8bnR0A6ssq2WUXtClGWj9Q",
    sheets: {
      it: "1778922595",
      finance: "325629102",
      enterprise: "1587751514",
      audience: "436522941",
    },
  },
  tue: {
    id: "10UugoyVXw4mwzgFjqO6pnr1v5ofPDQRdjE8NGy_fVRQ",
    sheets: {
      it: "1778922595",
      finance: "325629102",
      enterprise: "1587751514",
      audience: "436522941",
    },
  },
  wed: {
    id: "1VvEML21gmiHdYIMB2aq-B9Ea7n8w_F9YrtTsz5mtq50",
    sheets: {
      it: "1778922595",
      finance: "325629102",
      enterprise: "1587751514",
      audience: "436522941",
    },
  },
  thu: {
    id: "1zPrelCai8jGVcZMREDGltl8yIpLGXqr_288uTwtjVG0",
    sheets: {
      it: "1778922595",
      finance: "325629102",
      enterprise: "1587751514",
      audience: "436522941",
    },
  },
  fri: {
    id: "1I0TjCHqnEwaNFQrTaj86z_iII-7i_Xl9s7JiIupEURo",
    sheets: {
      it: "1778922595",
      finance: "325629102",
      enterprise: "1587751514",
      audience: "436522941",
    },
  },
  sat: {
    id: "1Uk4LNAHU22luWeAYIidY5jQ2N5dyGlUrwI2SFphQ3pc",
    sheets: {
      it: "1778922595",
      finance: "325629102",
      enterprise: "1587751514",
      audience: "436522941",
    },
  },
};

// Розклад дзвінків
const timeMap = {
  1: "08:30 - 09:50",
  2: "10:00 - 11:20",
  3: "11:30 - 12:50",
  4: "13:30 - 14:50",
  5: "15:00 - 16:20",
  6: "16:30 - 17:50",
};

async function getSheetData(sheetId, gid = "0") {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
  const response = await fetch(url);
  const textData = await response.text();
  return textData.split("\n");
}

bot.command("test", (ctx) => ctx.reply("Привіт! Я працюю на серверах Vercel!"));

bot.command("start", (ctx) => {
  return ctx.reply(
    "Оберіть день тижня:",
    Markup.keyboard([
      ["понеділок", "вівторок"],
      ["середа", "четвер", "п'ятниця"],
      ["субота"],
    ]).resize(),
  );
});

async function sendSchedule(ctx, dayKey, dayName) {
  try {
    const sheetId = sheetsConfig[dayKey].id;
    const subjGid = sheetsConfig[dayKey].sheets.it;
    const audGid = sheetsConfig[dayKey].sheets.audience;

    const targetGroup = "307-К";

    // Завантажуємо ОБИДВІ таблиці одночасно
    const [subjRows, audRows] = await Promise.all([
      getSheetData(sheetId, subjGid),
      getSheetData(sheetId, audGid),
    ]);

    // ==========================================
    // СУПЕР-ФІЧА: ШУКАЄМО ДАТУ В ТАБЛИЦІ
    // ==========================================
    let targetDate = "";
    // Скануємо перші 10 рядків таблиці
    for (let i = 0; i < Math.min(10, subjRows.length); i++) {
      const columns = subjRows[i].split(",");
      for (let col of columns) {
        const cleanCol = col.replace(/"/g, "").trim(); // Очищаємо від лапок
        // Якщо клітинка містить слово "на " і рік (наприклад, 2024, 2025, 2026)
        if (
          cleanCol.toLowerCase().includes("на ") &&
          cleanCol.includes("202")
        ) {
          targetDate = cleanCol.replace(/^на\s+/i, ""); // Прибираємо "на " на початку
          break;
        }
      }
      if (targetDate) break; // Знайшли — зупиняємо пошук
    }

    // Якщо раптом секретар забув вписати дату, фолбек на просто день тижня
    if (!targetDate) targetDate = dayName;

    let groupCol = -1;
    let startRow = -1;

    // Шукаємо колонку нашої групи
    for (let i = 0; i < subjRows.length; i++) {
      const columns = subjRows[i].split(",");
      for (let j = 0; j < columns.length; j++) {
        if (columns[j].trim() === targetGroup) {
          groupCol = j;
          startRow = i + 1;
          break;
        }
      }
      if (groupCol !== -1) break;
    }

    if (groupCol === -1) {
      return ctx.reply(`Групу ${targetGroup} не знайдено в таблиці.`);
    }

    // Додаємо знайдену дату в заголовок!
    let replyText = `🗓 Розклад на **${targetDate}** для ${targetGroup}:\n\n`;

    const headers = subjRows[startRow - 1].split(",");
    const activeGroups = [];
    for (let j = 1; j < headers.length; j++) {
      if (headers[j].trim() !== "") activeGroups.push(j);
    }

    // Читаємо розклад
    for (let i = startRow; i < subjRows.length; i++) {
      const columns = subjRows[i].split(",");
      const pairNum = columns[0].trim();

      if (!["1", "2", "3", "4", "5", "6"].includes(pairNum)) {
        if (pairNum === "") {
          const hasTextInRow = columns.some(
            (col, index) => index > 0 && col.trim() !== "",
          );
          if (hasTextInRow) break;
          continue;
        }
        break;
      }

      let lesson = columns[groupCol] ? columns[groupCol].trim() : "";
      let lessonType = "🧩 Практика";
      let audColIndex = groupCol;

      const ignoredSubjects = [
        "Іноземна",
        "Фізична культура",
        "Англ",
        "Основи метрологічної",
      ];

      if (lesson === "-") {
        lesson = "";
      } else if (lesson === "") {
        for (let k = groupCol - 1; k >= 1; k--) {
          const leftCell = columns[k] ? columns[k].trim() : "";
          const isIgnored = ignoredSubjects.some((word) =>
            leftCell.includes(word),
          );
          if (leftCell !== "" && leftCell !== "-" && !isIgnored) {
            lesson = leftCell;
            lessonType = "📢 Лекція";
            audColIndex = k; // Крадемо аудиторію з тієї ж колонки, що і лекцію
            break;
          }
        }
      } else {
        const ourIndex = activeGroups.indexOf(groupCol);
        if (ourIndex !== -1 && ourIndex < activeGroups.length - 1) {
          const nextGroupCol = activeGroups[ourIndex + 1];
          const nextGroupCell = columns[nextGroupCol]
            ? columns[nextGroupCol].trim()
            : "";
          const isIgnored = ignoredSubjects.some((word) =>
            lesson.includes(word),
          );
          if (nextGroupCell === "" && !isIgnored) {
            lessonType = "📢 Лекція";
          }
        }
      }

      // Шукаємо аудиторію
      let audience = "";
      if (lesson !== "" && audRows[i]) {
        const audColumns = audRows[i].split(",");
        audience = audColumns[audColIndex]
          ? audColumns[audColIndex].trim()
          : "";
        if (audience === "") audience = "Не вказано";
      }

      const timeStr = timeMap[pairNum] || "";

      if (lesson !== "") {
        replyText += `🕘 ${timeStr} | Пара ${pairNum}\n📘 ${lesson} (${lessonType})\n🚪 Ауд: ${audience}\n\n`;
      } else {
        replyText += `🕘 ${timeStr} | Пара ${pairNum}\n🪟 Вікно\n\n`;
      }
    }

    await ctx.replyWithMarkdown(replyText);
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
// ЗАПУСК ДЛЯ VERCEL (Webhook)
// ==========================================
module.exports = async (req, res) => {
  try {
    await bot.handleUpdate(req.body);
    res.status(200).send("OK");
  } catch (error) {
    console.error("❌ Помилка Webhook:", error);
    res.status(200).send("OK");
  }
};
