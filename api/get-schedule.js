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
const { sheetsConfig, timeMap } = require("../lib/config");

// ==========================================
// ФУНКЦІЯ ДЛЯ ЗАВАНТАЖЕННЯ ДАНИХ (З Кешуванням)
// ==========================================
async function getSheetData(sheetId, gid = "0") {
  const cacheKey = `cache_${sheetId}_${gid}`;
  try {
    const cachedData = await kv.get(cacheKey);
    if (cachedData) return cachedData;
  } catch (e) {}

  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
  const response = await fetch(url);
  const textData = await response.text();
  const rows = textData.split("\n");

  try {
    await kv.set(cacheKey, rows, { ex: 3600 });
  } catch (e) {}
  return rows;
}

// ==========================================
// 🛡 УНІВЕРСАЛЬНИЙ НОРМАЛІЗАТОР ГРУП
// Приводить "407-К", "407–К", "407 - К ", "407K" до "407К"
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
  return str
    .toUpperCase()
    .replace(/[ABCEHIKMOPTX]/g, (m) => latinToCyrillic[m] || m)
    .replace(/[\s\-_—–−]/g, "")
    .trim();
}

function normalizeAud(aud) {
  if (!aud) return "";
  return aud
    .replace(/["\s]/g, "")
    .replace(/[a-zA-Z]/g, (char) => {
      const map = { a: "а", b: "б", c: "с", e: "е", i: "і", k: "к", m: "м", o: "о", p: "р", t: "т", x: "х" };
      return map[char.toLowerCase()] || char;
    })
    .toLowerCase();
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const userId = req.query.userId;
    const dayKey = req.query.day || "mon";

    if (!sheetsConfig[dayKey]) {
      return res.status(400).json({ error: "Невірний день тижня" });
    }

    // --- 📊 ЗБІР СТАТИСТИКИ ДЛЯ АДМІНКИ ---
    if (userId && userId !== "0") {
      try {
        const dateStr = new Date().toISOString().split("T")[0];
        const visitKey = `stat_visits_${dateStr}`;
        const visitsCount = await kv.incr(visitKey);
        if (visitsCount === 1) {
          await kv.expire(visitKey, 30 * 24 * 60 * 60);
        }

        const time = new Date().toLocaleTimeString("uk-UA", {
          timeZone: "Europe/Kyiv",
        });
        const userName = req.query.name || "Студент";
        const tgUser = req.query.username ? `(@${req.query.username})` : "";

        await kv.lpush(
          "recent_logs",
          `[${time}] ${userName} ${tgUser} | ID: ${userId}`,
        );
        await kv.ltrim("recent_logs", 0, 29);
      } catch (e) {}

      try {
        const limitKey = `rate_limit_${userId}`;
        const requestsCount = await kv.incr(limitKey);
        if (requestsCount === 1) {
          await kv.expire(limitKey, 60);
        }
        if (requestsCount > 35) {
          return res.status(429).json({ error: "Забагато запитів! Зачекайте хвилинку ⏳" });
        }
      } catch (e) {}
    }

    // --- ДІСТАЄМО ГРУПУ: або з параметру group, або з бази по userId ---
    let rawUserGroup = req.query.group ? decodeURIComponent(req.query.group) : null;
    if (!rawUserGroup && userId && userId !== "0") {
      try {
        rawUserGroup = await kv.get(`user_${userId}`);
      } catch (e) {}
    }

    if (!rawUserGroup) {
      return res.status(404).json({
        error: "Групу не обрано. Будь ласка, вкажіть вашу групу.",
      });
    }

    const cleanTargetGroup = cleanGroupName(rawUserGroup);

    const sheetId = sheetsConfig[dayKey].id;
    const [itRows, finRows, entRows, audRows] = await Promise.all([
      getSheetData(sheetId, sheetsConfig[dayKey].sheets.it),
      getSheetData(sheetId, sheetsConfig[dayKey].sheets.finance),
      getSheetData(sheetId, sheetsConfig[dayKey].sheets.enterprise),
      getSheetData(sheetId, sheetsConfig[dayKey].sheets.audience),
    ]);

    const allDepartments = [itRows, finRows, entRows];

    // Шукаємо дату розкладу в шапці таблиці
    let targetDate = "";
    for (let rows of allDepartments) {
      if (rows && rows.length > 0) {
        for (let r = 0; r < Math.min(6, rows.length); r++) {
          const m = rows[r].match(/\d{2}\.\d{2}\.\d{4}/) || rows[r].match(/\d{1,2}\s+[а-яіїєґ]+\s+\d{4}/i);
          if (m) {
            targetDate = m[0];
            break;
          }
        }
        if (targetDate) break;
      }
    }

    // Аудиторії: зберігаємо повний рядок (col 0 = група, col 1 = пара 1, col 2 = пара 2, ...)
    const audByGroup = {};
    if (audRows && audRows.length > 0) {
      for (let row of audRows) {
        const cols = row.split(",");
        const gName = cleanGroupName(cols[0].replace(/"/g, ""));
        if (gName) {
          audByGroup[gName] = cols.map((c) => c.replace(/"/g, "").trim());
        }
      }
    }
    const audGroupRow = audByGroup[cleanTargetGroup] || [];

    // Шукаємо відділення, рядок курсу та стовпчик групи ПО ВСІЙ ТАБЛИЦІ
    let targetRows = null;
    let groupCol = -1;
    let headerRowIdx = -1;
    let headers = [];

    for (let rows of allDepartments) {
      if (!rows || rows.length < 3) continue;
      for (let r = 0; r < rows.length; r++) {
        const cols = rows[r].split(",");
        for (let c = 0; c < cols.length; c++) {
          const cell = cleanGroupName(cols[c].replace(/"/g, ""));
          if (cell === cleanTargetGroup) {
            groupCol = c;
            headerRowIdx = r;
            targetRows = rows;
            headers = cols;
            break;
          }
        }
        if (groupCol !== -1) break;
      }
      if (groupCol !== -1) break;
    }

    if (groupCol === -1 || headerRowIdx === -1) {
      return res.status(404).json({
        error: `Групу ${rawUserGroup} не знайдено в таблиці на цей день.`,
      });
    }

    // Збираємо пари (1-6) ПОЧИНАЮЧИ ВІД ЗАГОЛОВКА КУРСУ
    const scheduleArray = [];
    let currentPairScan = 1;

    for (let i = headerRowIdx + 1; i < targetRows.length; i++) {
      if (currentPairScan > 6) break;
      const columns = targetRows[i].split(",");
      const firstCol = columns[0].replace(/"/g, "").trim();

      // Якщо натрапили на інший курс або підвал
      if (firstCol.toLowerCase().includes("навчальна") || (!firstCol.includes(String(currentPairScan)) && columns.some((c, idx) => idx > 0 && /\d{3}/.test(c)))) {
        break;
      }

      let pairNum = "";
      if (firstCol.includes(String(currentPairScan))) {
        pairNum = String(currentPairScan);
        currentPairScan++;
      } else {
        continue;
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
        "Навчальна",
      ];

      if (lesson === "-") lesson = "";
      else if (lesson === "") {
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
            const leftGroupName = cleanGroupName(
              headers[k].replace(/"/g, ""),
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
              if (
                leftAudienceNormalized !== "" &&
                ourAudNormalized !== "" &&
                leftAudienceNormalized === ourAudNormalized
              ) {
                lesson = leftCell;
                lessonType = "🎓 Лекція (спільна)";
                break;
              }
            }
          }
        }
      }

      let audience = "Не вказано";
      if (lesson !== "") {
        const pairIndex = parseInt(pairNum, 10);
        if (!isNaN(pairIndex) && audGroupRow[pairIndex]) {
          audience = audGroupRow[pairIndex].replace(/"/g, "").trim();
        }
      }
      if (audience === "" || audience === "-") audience = "Не вказано";

      scheduleArray.push({
        pair: pairNum,
        time: timeMap[pairNum] || "",
        name: lesson === "" ? "Немає" : lesson,
        type: lesson === "" ? "" : lessonType,
        aud: lesson === "" ? "" : audience,
      });
    }

    const unifiedPairs = scheduleArray.map((p) => ({
      number: p.pair,
      pair: p.pair,
      time: p.time,
      name: p.name,
      subject: p.name,
      type: p.type,
      aud: p.aud,
      room: p.aud,
      teacher: p.teacher || "За розкладом",
    }));

    return res.json({
      group: rawUserGroup,
      date: targetDate || "Сьогодні",
      scheduleDate: targetDate || "Сьогодні",
      schedule: scheduleArray,
      pairs: unifiedPairs,
    });
  } catch (error) {
    console.error("Помилка get-schedule:", error);
    res.status(500).json({ error: "Помилка завантаження розкладу з сервера" });
  }
};
