const { kv } = require("@vercel/kv");

module.exports = async (req, res) => {
  // Налаштування CORS
  res.setHeader("Access-Control-Allow-Origin", "*");

  try {
    // Дістаємо наш конфіг з бази (або віддаємо стандартний, якщо його ще немає)
    const config = (await kv.get("app_config")) || {
      maintenance: false,
      banner: "",
    };
    res.status(200).json(config);
  } catch (error) {
    // Якщо база раптом "ікне", додаток все одно працюватиме
    res.status(500).json({ maintenance: false, banner: "" });
  }
};
