# 🎓 Telegram Mini App: Студентський Розклад

![Telegram](https://img.shields.io/badge/Telegram-2CA5E0?style=for-the-badge&logo=telegram&logoColor=white)
![NodeJS](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)
![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)

Сучасний Telegram-бот з інтегрованим **Mini App (Web App)** для зручного перегляду розкладу пар. Проєкт створений для студентів, щоб мати доступ до розкладу, імен викладачів та особистих нотаток у кілька кліків прямо в месенджері або браузері.

## ✨ Головні фічі

- **📱 Telegram Mini App & ПК-дашборд:** Зручний мобільний та десктопний інтерфейс (тижнева сітка пар, гарячі клавіші, швидкий друк) замість нудних текстових повідомлень.
- **⚡ Serverless Backend:** Працює на Vercel Serverless Functions (без необхідності тримати сервер 24/7 увімкненим).
- **🔄 Моніторинг змін у розкладі:** Автоматична фонова перевірка Google Таблиць на появу нових дат та сповіщення студентів.
- **📁 Інтеграція з Google Sheets:** Розклад тягнеться напряму з Google Таблиць коледжу/університету.
- **💾 Розумне кешування (Vercel KV):** Дані таблиць кешуються на 1 годину для блискавичного завантаження та економії запитів до Google API.
- **🟢 Підсвітка поточної пари:** Додаток автоматично вираховує час і підсвічує пару, яка йде прямо зараз.
- **📝 Особисті нотатки (ДЗ):** Користувачі можуть зберігати свої нотатки (домашку) до кожного предмета у власну базу даних.
- **🔒 Безпечна архітектура:** Модульні сервіси (`user-service.js`, `notifier-service.js`, `schedule-helper.js`, `http-helper.js`), конфіги та токени винесені в змінні оточення.

## 🛠 Технологічний стек

- **Frontend:** HTML5, JavaScript (ES6+), Tailwind CSS, Chart.js.
- **Backend:** Node.js, Telegraf.js (Telegram Bot API).
- **Database / Cache:** Vercel KV (Redis).
- **Deployment:** Vercel.

## 📂 Архітектура проєкту

```text
├── api/
│   ├── admin.js           # API для адмін-панелі (аналітика, конфіг, розсилка)
│   ├── bot.js             # Головний файл Telegram-бота (Webhooks)
│   ├── check-updates.js   # Автоматична перевірка оновлень розкладу (Cron / Admin)
│   ├── config.js          # Конфігурація (ID Google таблиць, дзвінки)
│   ├── feedback.js        # Обробка зворотного зв'язку від користувачів
│   ├── get-schedule.js    # API ендпоінт для парсингу розкладу з Google Sheets
│   ├── http-helper.js     # Утиліти HTTP (CORS, стандартизовані відповіді, перевірка прав)
│   ├── notes.js           # API для збереження/читання особистих нотаток (ДЗ)
│   ├── notifier-service.js# Сервіс відправки повідомлень та розсилок у Telegram
│   ├── save-group.js      # API для збереження обраної групи юзера
│   ├── schedule-helper.js # Допоміжні функції роботи з таблицями, кешуванням та нормалізацією
│   ├── settings.js        # API для керування налаштуваннями користувача
│   └── user-service.js    # Сервіс взаємодії з Vercel KV (користувачі, ліміти, логи)
├── public/
│   ├── admin.html         # Frontend адмін-панелі
│   ├── app.html           # Головний Frontend розкладу (Мобільний + ПК дашборд)
│   ├── index.html         # Головна сторінка сайту (Лендінг)
│   └── settings.html      # Frontend сторінки налаштувань
├── package.json           # Залежності проєкту (Telegraf, KV тощо)
└── vercel.json            # Налаштування деплою на Vercel (Cron jobs)
```

🚀 Встановлення та запуск (Для розробників)
Клонуйте репозиторій:

```bash
git clone https://github.com/ВАШ_НІК/ВАШ_РЕПОЗИТОРІЙ.git
cd ВАШ_РЕПОЗИТОРІЙ
```

Встановіть залежності:

```bash
npm install
```

Налаштуйте змінні середовища:
Створіть файл `.env` та додайте ваші токени:

```env
BOT_TOKEN=ваш_телеграм_токен
ADMIN_ID=ваш_telegram_id
KV_REST_API_URL=ваш_url_бази_даних
KV_REST_API_TOKEN=ваш_токен_бази_даних
CRON_SECRET=ваш_секретний_ключ_для_крон
```

Розроблено з ❤️ для студентів.
