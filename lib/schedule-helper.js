const { kv } = require("@vercel/kv");
const { sheetsConfig, timeMap } = require("./config");

async function getSheetData(sheetId, gid = "0", forceRefresh = false) {
  const cacheKey = `cache_${sheetId}_${gid}`;
  if (!forceRefresh) {
    const cachedData = await kv.get(cacheKey);
    if (cachedData) return cachedData;
  }

  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
  const response = await fetch(url);
  const textData = await response.text();
  const rows = textData.split("\n");

  await kv.set(cacheKey, rows, { ex: 3600 });
  return rows;
}

function normalizeGroup(name) {
  if (!name) return "";
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
  return String(name)
    .toUpperCase()
    .replace(/[ABCEHIKMOPTX]/g, (m) => latinToCyrillic[m])
    .trim();
}

function normalizeAud(aud) {
  if (!aud) return "";
  return String(aud).replace(/"/g, "").replace(/\s+/g, "").toUpperCase();
}

async function getAvailableGroups() {
  const cacheKey = "cache_available_groups_list";
  const cached = await kv.get(cacheKey);
  if (cached && Array.isArray(cached) && cached.length > 0) {
    return cached;
  }

  const groupsSet = new Set();
  const dayKey = "mon";

  for (const deptKey of Object.keys(sheetsConfig.departments)) {
    const sheetId = sheetsConfig.departments[deptKey][dayKey];
    if (!sheetId) continue;

    try {
      const rows = await getSheetData(sheetId, "0");
      if (!rows || rows.length < 3) continue;

      const headerRow = rows[2] || "";
      const columns = headerRow.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);

      for (let i = 2; i < columns.length; i++) {
        const rawName = (columns[i] || "").replace(/["\r\n]/g, "").trim();
        if (rawName && !rawName.includes("Ауд") && rawName.length <= 15) {
          const norm = normalizeGroup(rawName);
          if (norm && /^[\\u0400-\\u04FF0-9\\-]+$/.test(norm)) {
            groupsSet.add(norm);
          }
        }
      }
    } catch (e) {
      console.warn(`Error scanning groups for dept ${deptKey}:`, e.message);
    }
  }

  const result = Array.from(groupsSet).sort();
  if (result.length > 0) {
    await kv.set(cacheKey, result, { ex: 24 * 3600 });
  }
  return result;
}

async function checkForScheduleUpdates() {
  const dayKeys = ["mon", "tue", "wed", "thu", "fri", "sat"];
  const dayNames = {
    mon: "Понеділок",
    tue: "Вівторок",
    wed: "Середа",
    thu: "Четвер",
    fri: "Пятниця",
    sat: "Субота",
  };

  const detectedUpdates = [];

  for (const dayKey of dayKeys) {
    const deptKeys = Object.keys(sheetsConfig.departments);
    if (deptKeys.length === 0) continue;
    const firstDept = deptKeys[0];
    const sheetId = sheetsConfig.departments[firstDept][dayKey];
    if (!sheetId) continue;

    try {
      const rows = await getSheetData(sheetId, "0", true);
      if (!rows || rows.length < 2) continue;

      const headerText = `${rows[0] || ""} ${rows[1] || ""}`;
      const match = headerText.match(/(\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?)/);
      const newDate = match ? match[1] : null;

      if (!newDate) continue;

      const kvKey = `schedule_date_${dayKey}`;
      const savedDate = await kv.get(kvKey);

      if (savedDate !== newDate) {
        await kv.set(kvKey, newDate);
        detectedUpdates.push({
          dayKey,
          dayName: dayNames[dayKey] || dayKey,
          oldDate: savedDate || "Not set",
          newDate,
        });
      }
    } catch (err) {
      console.error(`Update check error for ${dayKey}:`, err.message);
    }
  }

  return detectedUpdates;
}

module.exports = {
  getSheetData,
  normalizeGroup,
  normalizeAud,
  getAvailableGroups,
  checkForScheduleUpdates,
};
