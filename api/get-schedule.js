const { kv } = require("@vercel/kv");

// Наші налаштування (такі ж як у бота)
const { sheetsConfig, timeMap } = require("./config");

// ==========================================
// ФУНКЦІЯ ДЛЯ ЗАВАНТАЖЕННЯ ДАНИХ (З Кешуванням)
// ==========================================
async function getSheetData(sheetId, gid = "0") {
  const cacheKey = `cache_${sheetId}_${gid}`;
  const cachedData = await kv.get(cacheKey);
  if (cachedData) return cachedData;

  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
  const response = await fetch(url);
  const textData = await response.text();
  const rows = textData.split("\n");

  await kv.set(cacheKey, rows, { ex: 3600 });
  return rows;
}

// ==========================================
// 🛡 АВТО-ПЕРЕКЛАДАЧ (Нормалізатор)
// ==========================================
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

// Нормалізація номера аудиторії для порівняння
function normalizeAud(aud) {
  if (!aud) return "";
  return String(aud).replace(/"/g, "").replace(/\s+/g, "").toUpperCase();
}

module.exports = async (req, res) => {
  // Додаємо заголовки, щоб додаток міг безпечно отримувати дані
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  try {
    const userId = req.query.userId;

    // --- 📊 ЗБІР СТАТИСТИКИ ДЛЯ АДМІНКИ ---
    if (userId) {
      // 1. Рахуємо кліки по днях (для графіка)
      const dateStr = new Date().toISOString().split("T")[0]; // напр. "2026-04-28"
      await kv.incr(`stat_visits_${dateStr}`);

      // 2. Записуємо "Хто і коли" (для логів)
      const time = new Date().toLocaleTimeString("uk-UA", {
        timeZone: "Europe/Kyiv",
      });
      await kv.lpush("recent_logs", `[${time}] ID: ${userId} відкрив розклад`);
      await kv.ltrim("recent_logs", 0, 29); // Зберігаємо тільки останні 20 записів
    }
    const dayKey = req.query.day || "mon";
    if (!userId) {
      return res.status(400).json({ error: "Немає ID користувача" });
    }

    // --- 🛡 ЗАХИСТ ВІД СПАМУ (RATE-LIMITING) ---
    const limitKey = `rate_limit_${userId}`;
    const requestsCount = await kv.incr(limitKey); // Збільшуємо лічильник на 1

    // Якщо це перший запит за останній час, ставимо таймер скидання на 60 секунд
    if (requestsCount === 1) {
      await kv.expire(limitKey, 60);
    }

    // Якщо юзер натиснув кнопку більше 15 разів за хвилину - блокуємо
    if (requestsCount > 15) {
      console.log(`⚠️ Спам від юзера: ${userId}`);
      return res
        .status(429)
        .json({ error: "Забагато запитів! Почекай хвилинку ⏳" });
    }
    // ------------------------------------------

    // Дістаємо групу з бази
    const userGroup = await kv.get(`user_${userId}`);
    if (!userGroup) {
      return res
        .status(404)
        .json({ error: "Групу не знайдено. Спочатку вибери її в боті." });
    }

    const sheetId = sheetsConfig[dayKey].id;
    const [itRows, finRows, entRows, audRows] = await Promise.all([
      getSheetData(sheetId, sheetsConfig[dayKey].sheets.it),
      getSheetData(sheetId, sheetsConfig[dayKey].sheets.finance),
      getSheetData(sheetId, sheetsConfig[dayKey].sheets.enterprise),
      getSheetData(sheetId, sheetsConfig[dayKey].sheets.audience),
    ]);

    const allDepartments = [itRows, finRows, entRows];

    // Шукаємо дату
    let targetDate = "Сьогодні";
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
      if (targetDate !== "Сьогодні") break;
    }

    let subjRows = null;
    let groupCol = -1;
    let startRow = -1;

    for (let deptRows of allDepartments) {
      for (let i = 0; i < deptRows.length; i++) {
        const columns = deptRows[i].split(",");
        for (let j = 0; j < columns.length; j++) {
          if (normalizeGroup(columns[j].replace(/"/g, "")) === userGroup) {
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
      return res.json({ group: userGroup, date: targetDate, schedule: [] }); // Порожній розклад
    }

    // Завантажуємо аудиторії всіх груп (для перевірки спільних лекцій)
    const audByGroup = {};
    for (let i = 0; i < audRows.length; i++) {
      const columns = audRows[i].split(",");
      if (columns[0]) {
        const groupName = normalizeGroup(columns[0].replace(/"/g, ""));
        audByGroup[groupName] = columns;
      }
    }
    const audGroupRow = audByGroup[userGroup] || null;

    const headers = subjRows[startRow - 1].split(",");
    const activeGroups = [];
    for (let j = 1; j < headers.length; j++) {
      if (headers[j].replace(/"/g, "").trim() !== "") activeGroups.push(j);
    }

    const scheduleArray = [];

    // Читаємо пари і складаємо їх у JSON масив
    for (let i = startRow; i < subjRows.length; i++) {
      const columns = subjRows[i].split(",");
      const pairNum = columns[0].replace(/"/g, "").trim();

      if (!["1", "2", "3", "4", "5", "6"].includes(pairNum)) {
        if (pairNum === "") {
          if (
            columns.some(
              (col, index) => index > 0 && col.replace(/"/g, "").trim() !== "",
            )
          )
            break;
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
        "Виховна",
      ];

      if (lesson === "-") lesson = "";
      else if (lesson === "") {
        // Якщо наша клітинка пуста — перевіряємо ТІЛЬКИ збіг аудиторій з сусідами ліворуч.
        const pairIndex = parseInt(pairNum, 10);
        const ourAudNormalized =
          !isNaN(pairIndex) && audGroupRow && audGroupRow[pairIndex]
            ? normalizeAud(audGroupRow[pairIndex])
            : "";

        for (let k = groupCol - 1; k >= 1; k--) {
          const leftCell = columns[k]
            ? columns[k].replace(/"/g, "").trim()
            : "";
          if (
            leftCell !== "" &&
            leftCell !== "-" &&
            !ignoredSubjects.some((w) => leftCell.includes(w))
          ) {
            const leftGroupName = normalizeGroup(
              headers[k].replace(/"/g, "").trim(),
            );
            const leftGroupAudRow = audByGroup[leftGroupName];

            if (
              leftGroupAudRow &&
              !isNaN(pairIndex) &&
              leftGroupAudRow[pairIndex]
            ) {
              const leftAudienceNormalized = normalizeAud(
                leftGroupAudRow[pairIndex],
              );

              // Бінго! Аудиторії збігаються — крадемо пару і ставимо "Лекція"
              if (
                ourAudNormalized !== "" &&
                leftAudienceNormalized !== "" &&
                ourAudNormalized === leftAudienceNormalized
              ) {
                lesson = leftCell;
                lessonType = "📢 Лекція";
                break;
              }
            }
          }
        }
        // ❌ Старий фолбек повністю видалено! Немає збігу аудиторії = пара залишається порожньою (Вікно).
      } else {
        // У нашій групі є предмет — перевіряємо аудиторію з правою групою, щоб визначити тип пари (Лекція чи Практика)
        const ourIndex = activeGroups.indexOf(groupCol);
        if (ourIndex !== -1 && ourIndex < activeGroups.length - 1) {
          const nextCol = activeGroups[ourIndex + 1];
          const pairIndex = parseInt(pairNum, 10);
          const nextGroupName = normalizeGroup(
            headers[nextCol].replace(/"/g, "").trim(),
          );
          const nextGroupAudRow = audByGroup[nextGroupName];

          const ourAudNormalized =
            !isNaN(pairIndex) && audGroupRow && audGroupRow[pairIndex]
              ? normalizeAud(audGroupRow[pairIndex])
              : "";
          const nextAudNormalized =
            !isNaN(pairIndex) && nextGroupAudRow && nextGroupAudRow[pairIndex]
              ? normalizeAud(nextGroupAudRow[pairIndex])
              : "";

          // Якщо аудиторії співпадають з сусідом праворуч — це точно спільна лекція
          if (
            ourAudNormalized !== "" &&
            nextAudNormalized !== "" &&
            ourAudNormalized === nextAudNormalized
          ) {
            lessonType = "📢 Лекція";
          }
          // ❌ Старий фолбек з перевіркою порожньої клітинки праворуч також видалено для 100% точності.
        }
      }

      let audience = "Не вказано";
      if (lesson !== "" && audGroupRow) {
        const pairIndex = parseInt(pairNum, 10);
        if (!isNaN(pairIndex) && audGroupRow[pairIndex])
          audience = audGroupRow[pairIndex].replace(/"/g, "").trim();
      }
      if (audience === "" || audience === "-") audience = "Не вказано";

      // Додаємо інформацію про пару в масив
      scheduleArray.push({
        pair: pairNum,
        time: timeMap[pairNum] || "",
        name: lesson === "" ? "Немає" : lesson,
        type: lesson === "" ? "" : lessonType,
        aud: lesson === "" ? "" : audience,
      });
    }

    res.json({ group: userGroup, date: targetDate, schedule: scheduleArray });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Помилка сервера" });
  }
};
