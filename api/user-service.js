const { kv } = require("@vercel/kv");

async function getUserGroup(userId) {
  if (!userId) return null;
  return await kv.get(`user_${userId}`);
}

async function setUserGroup(userId, group) {
  if (!userId || !group) return;
  return await kv.set(`user_${userId}`, String(group).trim().toUpperCase());
}

async function getUserNotif(userId) {
  if (!userId) return true;
  const val = await kv.get(`user_${userId}_notif`);
  return val !== false;
}

async function setUserNotif(userId, isEnabled) {
  if (!userId) return;
  return await kv.set(`user_${userId}_notif`, Boolean(isEnabled));
}

async function getAllUserIds() {
  let [, keys] = await kv.scan(0, { match: "user_*", count: 2000 });
  return keys
    .filter((k) => !k.includes("_notif") && !k.includes("_pinned"))
    .map((k) => k.replace("user_", ""));
}

async function getActiveChats() {
  return (await kv.smembers("active_chats")) || [];
}

async function addActiveChat(chatId) {
  return await kv.sadd("active_chats", chatId);
}

async function getChatGroups(chatId) {
  return (await kv.get(`chat_${chatId}_groups`)) || [];
}

async function setChatGroups(chatId, groups) {
  return await kv.set(`chat_${chatId}_groups`, groups);
}

async function getUserNote(userId, subject) {
  if (!userId || !subject) return "";
  return (await kv.get(`note_${userId}_${subject}`)) || "";
}

async function setUserNote(userId, subject, note) {
  if (!userId || !subject) return;
  return await kv.set(`note_${userId}_${subject}`, note);
}

async function getAppConfig() {
  return 
    (await kv.get("app_config")) || {
      maintenance: false,
      vacation: false,
      banner: "",
    };
}

async function setAppConfig(config) {
  return await kv.set("app_config", config);
}

async function addRecentLog(message) {
  try {
    const time = new Date().toLocaleTimeString("uk-UA", {
      timeZone: "Europe/Kyiv",
    });
    await kv.lpush("recent_logs", `[${time}] ${message}`);
    await kv.ltrim("recent_logs", 0, 29);
  } catch (e) {
    console.warn("Cannot write log:", e.message);
  }
}

async function trackUserVisit(userId, name = "Student", username = "") {
  if (!userId || userId === "0") return { rateLimited: false };

  try {
    const dateStr = new Date().toISOString().split("T")[0];
    const visitKey = `stat_visits_${dateStr}`;
    const visitsCount = await kv.incr(visitKey);
    if (visitsCount === 1) {
      await kv.expire(visitKey, 30 * 24 * 60 * 60);
    }

    const tgUser = username ? ` (@${username})` : "";
    await addRecentLog(`${name}${tgUser} | ID: ${userId}`);

    const limitKey = `rate_limit_${userId}`;
    const requestsCount = await kv.incr(limitKey);
    if (requestsCount === 1) {
      await kv.expire(limitKey, 60);
    }
    if (requestsCount > 25) {
      return { rateLimited: true };
    }
  } catch (e) {
    console.warn("trackUserVisit error:", e.message);
  }

  return { rateLimited: false };
}

module.exports = {
  getUserGroup,
  setUserGroup,
  getUserNotif,
  setUserNotif,
  getAllUserIds,
  getActiveChats,
  addActiveChat,
  getChatGroups,
  setChatGroups,
  getUserNote,
  setUserNote,
  getAppConfig,
  setAppConfig,
  addRecentLog,
  trackUserVisit,
};
