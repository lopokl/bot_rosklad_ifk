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

// ==========================================
// ДЕКОДУВАННЯ HTML
// ==========================================
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

// ==========================================
// 🛡 УНІВЕРСАЛЬНИЙ НОРМАЛІЗАТОР ГРУП
// ==========================================
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

// ==========================================
// 📅 НОРМАЛІЗАЦІЯ ТА ПОРІВНЯННЯ ДАТ
// ==========================================
function extractDateInfo(str) {
  if (!str) return null;
  const months = {
    "січня": 1, "лютого": 2, "березня": 3, "квітня": 4, "травня": 5, "червня": 6,
    "липня": 7, "серпня": 8, "вересня": 9, "жовтня": 10, "листопада": 11, "грудня": 12,
  };

  const m1 = str.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (m1) {
    return { day: parseInt(m1[1], 10), month: parseInt(m1[2], 10), year: parseInt(m1[3], 10) };
  }

  const m2 = str.match(/(\d{1,2})\s+([а-яіїєґ]+)\s+(\d{4})/i);
  if (m2) {
    const monthNum = months[m2[2].toLowerCase()];
    if (monthNum) {
      return { day: parseInt(m2[1], 10), month: monthNum, year: parseInt(m2[3], 10) };
    }
  }
  return null;
}

function areDatesMatching(d1, d2) {
  const o1 = extractDateInfo(d1);
  const o2 = extractDateInfo(d2);
  if (!o1 || !o2) return false;
  return o1.day === o2.day && o1.month === o2.month && o1.year === o2.year;
}

// ==========================================
// ЗАВАНТАЖЕННЯ HTML ТАБЛИЦІ (PUBHTML)
// ==========================================
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

// ==========================================
// ЗАВАНТАЖЕННЯ ДАНИХ АУДИТОРІЙ ТА ЇХ ДАТИ
// ==========================================
async function getAudienceData(sheetId, gid) {
  if (!gid) return { audDate: "", audByGroup: {} };
  const cacheKey = `cache_auddata_${sheetId}_${gid}`;
  try {
    const cached = await kv.get(cacheKey);
    if (cached && cached.audByGroup) return cached;
  } catch (e) {}

  try {
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
    const res = await fetch(url);
    const text = await res.text();
    const rows = text.split("\n");

    let audDate = "";
    for (let r = 0; r < Math.min(5, rows.length); r++) {
      const info = extractDateInfo(rows[r]);
      if (info) {
        audDate = rows[r];
        break;
      }
    }

    const audByGroup = {};
    for (let r = 0; r < rows.length; r++) {
      const cols = rows[r].split(",");
      const g = cleanGroupName(cols[0].replace(/"/g, ""));
      if (g) {
        audByGroup[g] = cols.map((c) => c.replace(/"/g, "").trim());
      }
    }

    const result = { audDate, audByGroup };
    try {
      await kv.set(cacheKey, result, { ex: 1800 });
    } catch (e) {}
    return result;
  } catch (e) {
    return { audDate: "", audByGroup: {} };
  }
}

// ==========================================
// ГОЛОВНА ФУНКЦІЯ ОТРИМАННЯ РОЗКЛАДУ
// ==========================================
async function getScheduleForDayAndGroup(dayKey, rawGroupName) {
  if (!sheetsConfig[dayKey]) {
    return { error: "Невірний день тижня" };
  }

  const cleanTarget = cleanGroupName(rawGroupName);
  if (!cleanTarget) {
    return { error: "Групу не вказано" };
  }

  const sheetId = sheetsConfig[dayKey].id;
  const [itGrid, finGrid, entGrid, audData] = await Promise.all([
    getSheetHtmlGrid(sheetId, sheetsConfig[dayKey].sheets.it),
    getSheetHtmlGrid(sheetId, sheetsConfig[dayKey].sheets.finance),
    getSheetHtmlGrid(sheetId, sheetsConfig[dayKey].sheets.enterprise),
    getAudienceData(sheetId, sheetsConfig[dayKey].sheets.audience),
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

  // 🔍 ПОРІВНЯННЯ ДАТ: Чи співпадає дата аудиторій з датою розкладу?
  const isOnSite = areDatesMatching(targetDate, audData.audDate);

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

  // Групи курсу (для успадкування аудиторії при спільних лекціях на очному)
  const headerRow = targetGrid[headerRowIdx];
  const activeCourseGroups = [];
  for (let c = 0; c < headerRow.length; c++) {
    const cg = cleanGroupName(headerRow[c].val);
    if (cg && /\d{3}/.test(cg) && !activeCourseGroups.some((g) => g.name === cg)) {
      activeCourseGroups.push({ col: c, name: cg });
    }
  }

  const audGroupRow = audData.audByGroup[cleanTarget] || [];
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
    let isLecture = false;
    if (lesson) {
      if (cellObj && cellObj.colspan >= 4) {
        lessonType = "📢 Лекція";
        isLecture = true;
      } else if (/підгруп|і п|іі п/i.test(lesson)) {
        lessonType = "👥 Підгрупи";
      } else if (/лекц/i.test(lesson)) {
        lessonType = "📢 Лекція";
        isLecture = true;
      }
    }

    // Визначення аудиторії з урахуванням режиму (Очне чи Дистанційне)
    let audience = "Дистанційно";
    const pairIndex = parseInt(pairNum, 10);

    if (lesson) {
      if (isOnSite) {
        // ОЧНЕ НАВЧАННЯ: беремо реальну аудиторію
        if (audGroupRow && audGroupRow[pairIndex] && audGroupRow[pairIndex] !== "-") {
          audience = audGroupRow[pairIndex];
        } else if (isLecture) {
          // Якщо лекція і для нашої групи не вказано — беремо в сусідньої групи потоку
          for (let og of activeCourseGroups) {
            if (og.name !== cleanTarget) {
              const otherAudRow = audData.audByGroup[og.name];
              if (otherAudRow && otherAudRow[pairIndex] && otherAudRow[pairIndex] !== "-") {
                audience = otherAudRow[pairIndex];
                break;
              }
            }
          }
        }
        if (audience === "Дистанційно" || !audience || audience === "-") {
          audience = "Не вказано";
        }
      } else {
        // ДИСТАНЦІЙНЕ НАВЧАННЯ (дати розкладу та аудиторій не співпадають)
        audience = "Дистанційно";
      }
    } else {
      audience = "";
    }

    pairs.push({
      number: pairNum,
      pair: pairNum,
      time: timeMap[pairNum] || "",
      name: lesson || "Немає",
      subject: lesson || "Немає",
      type: lesson ? lessonType : "",
      aud: audience,
      room: audience,
      teacher: "За розкладом",
    });
  }

  return {
    group: rawGroupName,
    date: targetDate || "Сьогодні",
    isOnSite: isOnSite,
    studyMode: isOnSite ? "🏫 Очне навчання" : "🌐 Дистанційне навчання",
    pairs: pairs,
    schedule: pairs,
  };
}

module.exports = {
  cleanGroupName,
  getScheduleForDayAndGroup,
  extractDateInfo,
  areDatesMatching,
};
