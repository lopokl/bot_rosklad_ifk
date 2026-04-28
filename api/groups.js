const { groupsList } = require("./config");

module.exports = async (req, res) => {
  // Дозволяємо запити з браузера
  res.setHeader("Access-Control-Allow-Origin", "*");

  // Беремо список з конфігу і віддаємо його браузеру
  res.status(200).json({ groups: groupsList || [] });
};
