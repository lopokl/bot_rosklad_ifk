let kv;
try {
  kv = require("@vercel/kv").kv;
} catch (e) {
  kv = {
    get: async () => null,
    set: async () => {},
    incr: async () => 1,
    expire: async () => {},
    lpush: async () => {},
    ltrim: async () => {},
  };
}

const { sheetsConfig, timeMap } = require("./config");

function decodeHtml(html) {
  if (!html) return "";
  return html
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function cleanGroupName(str) {
  if (!str) return "";
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
  return String(str)
    .toUpperCase()
    .replace(/[ABCEHIKMOPTX]/g, (m) => latinToCyrillic[m] || m)
    .replace(/[\s\-_—–−]/g, "")
    .trim();
}

async function getSheetHtmlGrid(sheetId, gid = "0") {
  const cacheKey = `cache_pubgrid_${sheetId}_${gid}`;
  try {
    const cachedData = await kv.get(cacheKey);
    if (cachedData && Array.isArray(cachedData) && cachedData.length > 0) {
      return cachedData;
    }
  } catch (e) {}

  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/pubhtml/sheet?gid=${gid}`;
  const response = await fetch(url);
  const html = await response.text();

  const trMatches = html.split(/<tr[^>]*>/i).slice(1);
  const grid = [];

  for (let tr of trMatches) {
    const trContent = tr.split(/<\/tr>/i)[0];
    const row = [];
    const tdRegex = /<td([^>]*)>(.*?)<\/td>/gis;
    let match;

    while ((match = tdRegex.exec(trContent)) !== null) {
      const attrs = match[1];
      const val = decodeHtml(match[2].replace(/<[^>]+>/g, "").trim());
      const colspanMatch = attrs.match(/colspan=["']?(\d+)["']?/i);
      const colspan = colspanMatch ? parseInt(colspanMatch[1], 10) : 1;

      for (let c = 0; c < colspan; c++) {
        row.push({
          val: val,
          colspan: colspan,
          colIndexInCell: c,
        });
      }
    }
    if (row.length > 0) {
      grid.push(row);
    }
  }

  try {
    await kv.set(cacheKey, grid, { ex: 1800 });
  } catch (e) {}

  return grid;
}

async function getScheduleForDayAndGroup(dayKey, rawGroupName) {
  if (!sheetsConfig[dayKey]) {
    return { error: "Невірний день тижня" };
  }

  const cleanTarget = cleanGroupName(rawGroupName);
  if (!cleanTarget) {
    return { error: "Групу не вказано" };
  }

  const sheetId = sheetsConfig[dayKey].id;
  const [itGrid, finGrid, entGrid] = await Promise.all([
    getSheetHtmlGrid(sheetId, sheetsConfig[dayKey].sheets.it),
    getSheetHtmlGrid(sheetId, sheetsConfig[dayKey].sheets.finance),
    getSheetHtmlGrid(sheetId, sheetsConfig[dayKey].sheets.enterprise),
  ]);

  const allGrids = [itGrid, finGrid, entGrid];

  // Знаходимо дату розкладу в шапці
  let targetDate = "";
  for (let grid of allGrids) {
    for (let r = 0; r < Math.min(5, grid.length); r++) {
      for (let cell of grid[r]) {
        const m = cell.val.match(/\d{2}\.\d{2}\.\d{4}/) || cell.val.match(/\d{1,2}\s+[а-яіїєґ]+\s+\d{4}/i);
        if (m) {
          targetDate = m[0];
          break;
        }
      }
      if (targetDate) break;
    }
    if (targetDate) break;
  }

  // Знаходимо колонку групи
  let targetGrid = null;
  let targetCol = -1;
  let headerRowIdx = -1;

  for (let grid of allGrids) {
    for (let r = 0; r < grid.length; r++) {
      for (let c = 0; c < grid[r].length; c++) {
        if (cleanGroupName(grid[r][c].val) === cleanTarget) {
          targetGrid = grid;
          targetCol = c;
          headerRowIdx = r;
          break;
        }
      }
      if (targetCol !== -1) break;
    }
    if (targetCol !== -1) break;
  }

  if (!targetGrid || targetCol === -1 || headerRowIdx === -1) {
    return {
      error: `Групу ${rawGroupName} не знайдено в таблиці на цей день.`,
    };
  }

  // Зчитуємо пари
  const pairs = [];
  let currentPairScan = 1;

  for (let r = headerRowIdx + 1; r < targetGrid.length; r++) {
    if (currentPairScan > 6) break;
    const row = targetGrid[r];
    const firstCol = row[0]?.val || "";

    if (
      firstCol.toLowerCase().includes("навчальна") ||
      (!firstCol.includes(String(currentPairScan)) &&
        row.some((cell) => /\d{3}/.test(cell.val)))
    ) {
      break;
    }

    if (!firstCol.includes(String(currentPairScan))) continue;
    const pairNum = String(currentPairScan);
    currentPairScan++;

    const cellObj = row[targetCol];
    let lesson = cellObj ? cellObj.val : "";
    if (lesson === "-") lesson = "";

    let lessonType = "🧩 Практика";
    if (lesson) {
      if (cellObj && cellObj.colspan >= 4) {
        lessonType = "📢 Лекція";
      } else if (/підгруп|і п|іі п/i.test(lesson)) {
        lessonType = "👥 Підгрупи";
      } else if (/лекц/i.test(lesson)) {
        lessonType = "📢 Лекція";
      }
    }

    pairs.push({
      number: pairNum,
      pair: pairNum,
      time: timeMap[pairNum] || "",
      name: lesson || "Немає",
      subject: lesson || "Немає",
      type: lesson ? lessonType : "",
      aud: lesson ? "Дистанційно" : "",
      room: lesson ? "Дистанційно" : "",
      teacher: "За розкладом",
    });
  }

  return {
    group: rawGroupName,
    date: targetDate || "Сьогодні",
    pairs: pairs,
    schedule: pairs,
  };
}

module.exports = {
  cleanGroupName,
  getScheduleForDayAndGroup,
};
