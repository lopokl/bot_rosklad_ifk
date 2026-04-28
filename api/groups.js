const { groupsList } = require("./config");

module.exports = async (req, res) => {
  // Дозволяємо запити з браузера
  res.setHeader("Access-Control-Allow-Origin", "*");

  // Віддаємо масив груп
  res.status(200).json({ groups: groupsList || [] });
};
