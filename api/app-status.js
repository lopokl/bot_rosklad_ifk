const { kv } = require("@vercel/kv");

module.exports = async (req, res) => {
  // Налаштування CORS (щоб браузер не блокував запит)
  res.setHeader("Access-Control-Allow-Origin", "*");

  try {
    // Дістаємо наш конфіг з бази (банер та режим тех. робіт)
    const config = (await kv.get("app_config")) || {
      maintenance: false,
      banner: "",
    };
    res.status(200).json(config);
  } catch (error) {
    // Якщо база не відповість, віддаємо пусті налаштування
    res.status(500).json({ maintenance: false, banner: "" });
  }
};
