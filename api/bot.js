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

// ==========================================
// БАЗОВІ ФУНКЦІЇ ТА МЕНЮ
// ==========================================
async function getSheetData(sheetId, gid = "0") {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
  const response = await fetch(url);
  const textData = await response.text();
  return textData.split("\n");
}

bot.command("test", (ctx) =>
  ctx.reply("Привіт! Я працюю прямо з твого комп'ютера!"),
);

bot.command("menu", (ctx) => {
  return ctx.reply(
    "Оберіть день тижня:",
    Markup.keyboard([
      ["понеділок", "вівторок"],
      ["середа", "четвер", "п'ятниця"],
      ["субота"],
    ]).resize(),
  );
});

// ==========================================
// УНІВЕРСАЛЬНА ФУНКЦІЯ ОТРИМАННЯ РОЗКЛАДУ
// ==========================================
async function sendSchedule(ctx, dayKey, dayName) {
  try {
    const sheetId = sheetsConfig[dayKey].id;
    const gid = sheetsConfig[dayKey].sheets.it;
    const rows = await getSheetData(sheetId, gid);

    // Поки що група зафіксована, але потім ми зможемо брати її з налаштувань користувача
    const targetGroup = "307-К";

    let groupCol = -1;
    let startRow = -1;

    // КРОК 1: ШУКАЄМО ГРУПУ
    for (let i = 0; i < rows.length; i++) {
      const columns = rows[i].split(",");
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
      return ctx.reply(
        `Групу ${targetGroup} не знайдено в таблиці за ${dayName}.`,
      );
    }

    // КРОК 2: ЧИТАЄМО ПАРИ
    let replyText = `🗓 Розклад на ${dayName} для ${targetGroup}:\n\n`;

    const headers = rows[startRow - 1].split(",");
    const activeGroups = [];
    for (let j = 1; j < headers.length; j++) {
      if (headers[j].trim() !== "") activeGroups.push(j);
    }

    for (let i = startRow; i < rows.length; i++) {
      const columns = rows[i].split(",");
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

      // Беремо пару для нашої групи
      let lesson = columns[groupCol] ? columns[groupCol].trim() : "";
      let lessonType = "🧩 Практика";

      // 🛑 СПИСОК ВИНЯТКІВ (Слова, які бот ніколи не буде вважати спільною лекцією)
      // Ти можеш додавати сюди будь-які частини назв предметів
      const ignoredSubjects = ["Іноземна", "Фізична культура", "Англ"];

      if (lesson === "-") {
        lesson = "";
      }
      // 1. ПЕРЕВІРКА НА ЛЕКЦІЮ (Ми порожні = тягнемо пару зліва)
      else if (lesson === "") {
        for (let k = groupCol - 1; k >= 1; k--) {
          const leftCell = columns[k] ? columns[k].trim() : "";

          // Перевіряємо, чи є в знайденій парі заборонені слова
          // .some() перевіряє, чи хоч одне слово зі списку є в тексті leftCell
          const isIgnored = ignoredSubjects.some((word) =>
            leftCell.includes(word),
          );

          if (leftCell !== "" && leftCell !== "-" && !isIgnored) {
            lesson = leftCell;
            lessonType = "📢 Лекція";
            break;
          }
        }
      }
      // 2. ПЕРЕВІРКА НА ЛЕКЦІЮ (У нас є пара = перевіряємо СПРАВЖНЬОГО сусіда справа)
      else {
        const ourIndex = activeGroups.indexOf(groupCol);
        if (ourIndex !== -1 && ourIndex < activeGroups.length - 1) {
          const nextGroupCol = activeGroups[ourIndex + 1];
          const nextGroupCell = columns[nextGroupCol]
            ? columns[nextGroupCol].trim()
            : "";

          // Якщо в сусідів порожньо, але наш предмет у "чорному списку" - ми не лекція!
          const isIgnored = ignoredSubjects.some((word) =>
            lesson.includes(word),
          );

          if (nextGroupCell === "" && !isIgnored) {
            lessonType = "📢 Лекція";
          }
        }
      }

      if (lesson !== "") {
        replyText += `📍 Пара ${pairNum} (${lessonType}): ${lesson}\n`;
      } else {
        replyText += `📍 Пара ${pairNum}: Вікно\n`;
      }
    }

    await ctx.reply(replyText);
  } catch (error) {
    console.error(`Помилка завантаження розкладу на ${dayName}:`, error);
    await ctx.reply("Виникла помилка під час завантаження розкладу.");
  }
}

// ==========================================
// ПРИВ'ЯЗКА КНОПОК ТА КОМАНД ДО ФУНКЦІЇ
// ==========================================
// Кнопки меню
bot.hears("понеділок", (ctx) => sendSchedule(ctx, "mon", "Понеділок"));
bot.hears("вівторок", (ctx) => sendSchedule(ctx, "tue", "Вівторок"));
bot.hears("середа", (ctx) => sendSchedule(ctx, "wed", "Середу"));
bot.hears("четвер", (ctx) => sendSchedule(ctx, "thu", "Четвер"));
bot.hears("п'ятниця", (ctx) => sendSchedule(ctx, "fri", "П'ятницю"));
bot.hears("субота", (ctx) => sendSchedule(ctx, "sat", "Суботу"));

// Команди
bot.command("rosklad_mon", (ctx) => sendSchedule(ctx, "mon", "Понеділок"));
bot.command("rosklad_tue", (ctx) => sendSchedule(ctx, "tue", "Вівторок"));
bot.command("rosklad_wed", (ctx) => sendSchedule(ctx, "wed", "Середу"));
bot.command("rosklad_thu", (ctx) => sendSchedule(ctx, "thu", "Четвер"));
bot.command("rosklad_fri", (ctx) => sendSchedule(ctx, "fri", "П'ятницю"));
bot.command("rosklad_sat", (ctx) => sendSchedule(ctx, "sat", "Суботу"));

// ==========================================
// ЗАПУСК ДЛЯ VERCEL (Webhook)
// ==========================================
module.exports = async (req, res) => {
  try {
    // РАДАР: Цей текст має з'явитися в логах Vercel, коли ти пишеш боту
    console.log("🔔 Отримано запит від Telegram:", req.body.message?.text);

    await bot.handleUpdate(req.body);
    res.status(200).send("OK");
  } catch (error) {
    console.error("❌ Помилка обробки:", error);
    // Завжди відправляємо 200, щоб Telegram не спамив повторними запитами
    res.status(200).send("OK");
  }
};
