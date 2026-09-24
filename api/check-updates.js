const { enableCors, sendSuccess, sendError, isCronAuthorized, isAdmin } = require("./http-helper");
const { checkForScheduleUpdates } = require("./schedule-helper");
const { broadcastToAll } = require("./notifier-service");
const { addRecentLog } = require("./user-service");

module.exports = async (req, res) => {
  if (enableCors(req, res)) return;

  if (!isCronAuthorized(req) && !isAdmin(req)) {
    return sendError(res, 401, "Unauthorized");
  }

  try {
    const updates = await checkForScheduleUpdates();

    if (!updates || updates.length === 0) {
      return sendSuccess(res, {
        updated: false,
        message: "No schedule updates detected",
      });
    }

    const appUrl = process.env.APP_URL || "https://bot-rosklad-ifk.vercel.app";
    const updateReports = [];

    for (const update of updates) {
      const notifyText =
        `🔔 *UVAGA! ONOVLENO ROZKLAD!*\n\n` +
        `📅 Deny: *${update.dayName}*\n` +
        `🧓 Nova data: *${update.newDate}*\n\n` +
        `Dispetcher vnis svizhi zminy. Pereglyanute pary!`;
      const extra = {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: `📖 Rozklad na ${update.dayName}`,
                callback_data: `day_${update.dayKey}`,
              },
            ],
            [
              {
                text: "📱 Vidkryty u dodatku",
                web_app: { url: `${appUrl}/app.html` },
              },
            ],
          ],
        },
      };

      const result = await broadcastToAll({
        text: notifyText,
        extra,
        onlySubscribed: true,
        includeChats: true,
        logTitle: `Onovlennya (${update.dayName})`,
      });

      updateReports.push({
        ...update,
        notified: result.total,
        chats: result.chatCount,
        users: result.userCount,
      });
    }

    return sendSuccess(res, {
      updated: true,
      updatesCount: updates.length,
      reports: updateReports,
    });
  } catch (error) {
    console.error("Check updates error:", error);
    await addRecentLog(`Error checking updates: ${error.message}`);
    return sendError(res, 500, error.message);
  }
};
