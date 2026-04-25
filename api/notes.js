const { kv } = require("@vercel/kv");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    if (req.method === "GET") {
      const { userId, subject } = req.query;
      const note = (await kv.get(`note_${userId}_${subject}`)) || "";
      return res.json({ note });
    }

    if (req.method === "POST") {
      const { userId, subject, note } = req.body;
      await kv.set(`note_${userId}_${subject}`, note);
      return res.json({ success: true });
    }
  } catch (error) {
    res.status(500).json({ error: "Помилка сервера" });
  }
};
