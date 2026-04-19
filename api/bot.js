require("dotenv").config();
const { Telegraf, Markup } = require("telegraf");
const { kv } = require("@vercel/kv");

const bot = new Telegraf(process.env.BOT_TOKEN);

// Конфігурація таблиць з усіма відділеннями
const sheetsConfig = {
  mon: { id: "1lok-vuNC6Nx_Dx4w2vhRy8bnR0A6ssq2WUXtClGWj9Q", sheets: { it: "1778922595", finance: "325629102", enterprise: "1587751514", audience: "436522941" } },
  tue: { id: "10UugoyVXw4mwzgFjqO6pnr1v5ofPDQRdjE8NGy_fVRQ", sheets: { it: "1778922595", finance: "325629102", enterprise: "1587751514", audience: "436522941" } },
  wed: { id: "1VvEML21gmiHdYIMB2aq-B9Ea7n8w_F9YrtTsz5mtq50", sheets: { it: "1778922595", finance: "325629102", enterprise: "1587751514", audience: "436522941" } },
  thu: { id: "1zPrelCai8jGVcZMREDGltl8yIpLGXqr_288uTwtjVG0", sheets: { it: "1778922595", finance: "325629102", enterprise: "1587751514", audience: "436522941" } },
  fri: { id: "1I0TjCHqnEwaNFQrTaj86z_iII-7i_Xl9s7JiIupEURo", sheets: { it: "1778922595", finance: "325629102", enterprise: "1587751514", audience: "436522941" } },
  sat: { id: "1Uk4LNAHU22luWeAYIidY5jQ2N5dyGlUrwI2SFphQ3pc", sheets: { it: "1778922595", finance: "325629102", enterprise: "1587751514", audience: "436522941" } },
};

const timeMap = {
  "1": "08:30 - 09:50", "2": "10:05 - 11:25", "3": "11:55 - 13:15",
  "4": "13:30 - 14:50", "5": "15:05 - 16:25", "6": "16:40 - 18:00"
};

async function getSheetData(sheetId, gid = "0") {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
  const response = await fetch(url);
  const textData = await response.text();
  return textData.split("\n");
}

// ==========================================
// АВТО-СКАНЕР ГРУП (З таблиці аудиторій)
// ==========================================
async function getAvailableGroups() {
  try {
    const rows = await getSheetData(sheetsConfig.mon.id, sheetsConfig.mon.sheets.audience);
    let groups = [];
    
    for (let row of rows) {
      const firstCell = row.split(",")[0].replace(/"/g, "").trim();
      if (/^\d{3}.*-[А-ЯІЇЄA-Z]/i.test(firstCell)) {
        if (!groups.includes(firstCell)) {
          groups.push(firstCell);
        }
      }
    }
    return groups;
  } catch (error) {
    console.error("Помилка сканування груп:", error);
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
// РЕЄСТРАЦІЯ ТА ВИБІР ГРУПИ
// ==========================================
bot.command("start", async (ctx) => {
  await ctx.reply("🔄 Завантажую актуальний список груп...");
  const groups = await getAvailableGroups();
  const keyboard = chunkArray(groups, 3);
  
  return ctx.reply(
    "👋 Привіт! Я бот розкладу. Обери свою групу зі списку нижче:",
    Markup.keyboard(keyboard).resize()
  );
});

bot.hears("Змінити групу", async (ctx) => {
  await ctx.reply("🔄 Завантажую актуальний список груп...");
  const groups = await getAvailableGroups();
  const keyboard = chunkArray(groups, 3);
  
  return ctx.reply("Обери нову групу:", Markup.keyboard(keyboard).resize());
});

bot.hears(/^\d{3}.*-[А-ЯІЇЄA-Z]/i, async (ctx) => {
  const group = ctx.message.text.trim();
  const userId = ctx.from.id; 
  
  await kv.set(`user_${userId}`, group);
  
  return ctx.reply(
    `✅ Супер! Я запам'ятав, що ти з групи **${group}**.\nТепер тисни /menu, щоб дивитися свій розклад.`,
    { parse_mode: "Markdown" }
  );
});

bot.command("menu", (ctx) => {
  return ctx.reply("Оберіть день тижня:", Markup.keyboard([
    ["понеділок", "вівторок"],
    ["середа", "четвер", "п'ятниця"],
    ["субота"],
    ["Змінити групу"] 
  ]).resize());
});

// ==========================================
// ОСНОВНА ФУНКЦІЯ (Шукає по всіх 3 відділеннях)
// ==========================================
async function sendSchedule(ctx, dayKey, dayName) {
  try {
    const userId = ctx.from.id;
    const targetGroup = await kv.get(`user_${userId}`);

    if (!targetGroup) {
      return ctx.reply("⚠️ Ти ще не обрав групу! Натисни /start, щоб вибрати її.");
    }

    const sheetId = sheetsConfig[dayKey].id;
    
    // Завантажуємо ВСІ таблиці одночасно
    const [itRows, finRows, entRows, audRows] = await Promise.all([
      getSheetData(sheetId, sheetsConfig[dayKey].sheets.it),
      getSheetData(sheetId, sheetsConfig[dayKey].sheets.finance),
      getSheetData(sheetId, sheetsConfig[dayKey].sheets.enterprise),
      getSheetData(sheetId, sheetsConfig[dayKey].sheets.audience)
    ]);

    let subjRows = null;
    let groupCol = -1;
    let startRow = -1;

    // Масив з таблицями відділень
    const allDepartments = [itRows, finRows, entRows];

    // КРОК 1: Шукаємо, в якій саме таблиці є наша група
    for (let deptRows of allDepartments) {
      for (let i = 0; i < deptRows.length; i++) {
        const columns = deptRows[i].split(",");
        for (let j = 0; j < columns.length; j++) {
          // Очищаємо від лапок для точного співпадіння
          if (columns[j].replace(/"/g, "").trim() === targetGroup) {
            groupCol = j;
            startRow = i + 1;
            subjRows = deptRows; // Знайшли правильну таблицю відділення!
            break;
          }
        }
        if (groupCol !== -1) break;
      }
      if (groupCol !== -1) break; // Виходимо, якщо знайшли
    }

    if (groupCol === -1 || !subjRows) {
      return ctx.reply(`Групу ${targetGroup} не знайдено в жодному відділенні на ${dayName}. Можливо, в неї сьогодні немає пар?`);
    }

    // КРОК 2: Шукаємо дату в тій таблиці, де знайшли групу
    let targetDate = "";
    for (let i = 0; i < Math.min(10, subjRows.length); i++) {
      const columns = subjRows[i].split(",");
      for (let col of columns) {
        const cleanCol = col.replace(/"/g, "").trim(); 
        if (cleanCol.toLowerCase().includes("на ") && cleanCol.includes("202")) {
          targetDate = cleanCol.replace(/^на\s+/i, ""); 
          break;
        }
      }
      if (targetDate) break; 
    }
    if (!targetDate) targetDate = dayName;

    // КРОК 3: Шукаємо аудиторії (по горизонталі в таблиці audRows)
    let audGroupRow = null; 
    for (let i = 0; i < audRows.length; i++) {
      const columns = audRows[i].split(",");
      const groupName = columns[0] ? columns[0].replace(/"/g, "").trim() : "";
      if (groupName === targetGroup) {
        audGroupRow = columns; 
        break;
      }
    }

    let replyText = `🗓 Розклад на **${targetDate}** для ${targetGroup}:\n\n`;
    
    const headers = subjRows[startRow - 1].split(",");
    const activeGroups = [];
    for (let j = 1; j < headers.length; j++) {
      if (headers[j].replace(/"/g, "").trim() !== "") activeGroups.push(j);
    }

    // КРОК 4: Читаємо пари
    for (let i = startRow; i < subjRows.length; i++) {
      const columns = subjRows[i].split(",");
      const pairNum = columns[0].replace(/"/g, "").trim();

      if (!["1", "2", "3", "4", "5", "6"].includes(pairNum)) {
        if (pairNum === "") {
          const hasTextInRow = columns.some((col, index) => index > 0 && col.replace(/"/g, "").trim() !== "");
          if (hasTextInRow) break;
          continue;
        }
        break;
      }

      let lesson = columns[groupCol] ? columns[groupCol].replace(/"/g, "").trim() : "";
      let lessonType = "🧩 Практика";
      const ignoredSubjects = ["Іноземна", "Фізична культура", "Англ", "Основи метрологічної"];

      if (lesson === "-") {
        lesson = "";
      } else if (lesson === "") {
        for (let k = groupCol - 1; k >= 1; k--) {
          const leftCell = columns[k] ? columns[k].replace(/"/g, "").trim() : "";
          const isIgnored = ignoredSubjects.some((word) => leftCell.includes(word));
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
          const nextGroupCell = columns[nextGroupCol] ? columns[nextGroupCol].replace(/"/g, "").trim() : "";
          const isIgnored = ignoredSubjects.some((word) => lesson.includes(word));
          if (nextGroupCell === "" && !isIgnored) {
            lessonType = "📢 Лекція";
          }
        }
      }

      // Додаємо аудиторію
      let audience = "Не вказано";
      if (lesson !== "" && audGroupRow) {
        const pairIndex = parseInt(pairNum, 10); 
        if (!isNaN(pairIndex) && audGroupRow[pairIndex]) {
          audience = audGroupRow[pairIndex].replace(/"/g, "").trim();
        }
      }
      
      if (audience === "" || audience === "-") {
        audience = "Не вказано";
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
