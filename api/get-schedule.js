const { kv } = require("@vercel/kv");

// Наші налаштування (такі ж як у бота)
const { sheetsConfig, timeMap } = require("./config");

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

async function getSheetData(sheetId, gid = "0") {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
  const response = await fetch(url);
  const textData = await response.text();
  return textData.split("\n");
}

module.exports = async (req, res) => {
  // Додаємо заголовки, щоб додаток міг безпечно отримувати дані
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  try {
    const userId = req.query.userId;
    const dayKey = req.query.day || "mon";

    if (!userId) {
      return res.status(400).json({ error: "Немає ID користувача" });
    }

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

    let audGroupRow = null;
    for (let i = 0; i < audRows.length; i++) {
      const columns = audRows[i].split(",");
      if (
        columns[0] &&
        normalizeGroup(columns[0].replace(/"/g, "")) === userGroup
      ) {
        audGroupRow = columns;
        break;
      }
    }

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
        "Основи метрологічної",
      ];

      if (lesson === "-") lesson = "";
      else if (lesson === "") {
        for (let k = groupCol - 1; k >= 1; k--) {
          const leftCell = columns[k]
            ? columns[k].replace(/"/g, "").trim()
            : "";
          if (
            leftCell !== "" &&
            leftCell !== "-" &&
            !ignoredSubjects.some((w) => leftCell.includes(w))
          ) {
            lesson = leftCell;
            lessonType = "📢 Лекція";
            break;
          }
        }
      } else {
        const ourIndex = activeGroups.indexOf(groupCol);
        if (ourIndex !== -1 && ourIndex < activeGroups.length - 1) {
          const nextCell = columns[activeGroups[ourIndex + 1]]
            ? columns[activeGroups[ourIndex + 1]].replace(/"/g, "").trim()
            : "";
          if (
            nextCell === "" &&
            !ignoredSubjects.some((w) => lesson.includes(w))
          )
            lessonType = "📢 Лекція";
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
