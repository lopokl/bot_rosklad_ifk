# 🎓 Telegram Mini App: Студентський Розклад

![Telegram](https://img.shields.io/badge/Telegram-2CA5E0?style=for-the-badge&logo=telegram&logoColor=white)
![NodeJS](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)
![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)

Сучасний Telegram-бот з інтегрованим **Mini App (Web App)** для зручного перегляду розкладу пар. Проєкт створений для студентів, щоб мати доступ до розкладу, імен викладачів та особистих нотаток у кілька кліків прямо в месенджері.

## ✨ Головні фічі

- **📱 Telegram Mini App:** Зручний та красивий мобільний інтерфейс замість нудних текстових повідомлень.
- **⚡ Serverless Backend:** Працює на Vercel Serverless Functions (без необхідності тримати сервер 24/7 увімкненим).
- **🗂 Інтеграція з Google Sheets:** Розклад тягнеться напряму з Google Таблиць коледжу/університету.
- **💾 Розумне кешування (Vercel KV):** Дані таблиць кешуються на 1 годину для блискавичного завантаження та економії запитів до Google API.
- **🟢 Підсвітка поточної пари:** Додаток автоматично вираховує час і підсвічує пару, яка йде прямо зараз.
- **📝 Особисті нотатки (ДЗ):** Користувачі можуть зберігати свої нотатки (домашку) до кожного предмета у власну базу даних.
- **🔒 Безпечна архітектура:** Конфіги та токени винесені в окремі файли (`config.js`, `.env`).

## 🛠 Технологічний стек

- **Frontend:** HTML5, JavaScript (ES6+), Tailwind CSS.
- **Backend:** Node.js, Telegraf.js (Telegram Bot API).
- **Database / Cache:** Vercel KV (Redis).
- **Deployment:** Vercel.

## 📂 Архітектура проєкту

## 📂 Архітектура проєкту

```text
├── api/
│   ├── admin.js           # API для адмін-панелі (керування ботом)
│   ├── bot.js             # Головний файл Telegram-бота (Webhooks)
│   ├── config.js          # Конфігурація (ID Google таблиць, розклад дзвінків)
│   ├── cron.js            # Автоматичні фонові задачі (розсилка розкладу тощо)
│   ├── feedback.js        # Обробка зворотного зв'язку від користувачів
│   ├── get-schedule.js    # API ендпоінт для парсингу розкладу з Google Sheets
│   ├── notes.js           # API для збереження/читання особистих нотаток (ДЗ)
│   ├── save-group.js      # API для збереження обраної групи юзера
│   └── settings.js        # API для керування налаштуваннями користувача
├── public/
│   ├── admin.html         # Frontend адмін-панелі
│   ├── app.html           # Головний Frontend розкладу (Telegram Mini App)
│   ├── index.html         # Головна сторінка сайту (Лендінг)
│   └── settings.html      # Frontend сторінки налаштувань
├── package.json           # Залежності проєкту (Telegraf, KV тощо)
└── vercel.json            # Налаштування деплою на Vercel
```

🚀 Встановлення та запуск (Для розробників)
Клонуйте репозиторій:

Bash
git clone [https://github.com/ВАШ_НІК/ВАШ_РЕПОЗИТОРІЙ.git](https://github.com/ВАШ_НІК/ВАШ_РЕПОЗИТОРІЙ.git)
cd ВАШ_РЕПОЗИТОРІЙ
Встановіть залежності:

Bash
npm install
Налаштуйте змінні середовища:
Створіть файл .env (використовуючи .env.example як шаблон) та додайте ваш токен:

Фрагмент коду
BOT_TOKEN=ваш_телеграм_токен
KV_REST_API_URL=ваш_url_бази_даних
KV_REST_API_TOKEN=ваш_токен_бази_даних
Налаштуйте таблиці:
Відкрийте api/config.js і вставте ID ваших Google Таблиць.

Локальний запуск (опціонально):
Використовуйте vercel dev для локального тестування serverless функцій.

Деплой:
Проєкт автоматично розгортається через Vercel. Не забудьте додати Environment Variables у налаштуваннях вашого проєкту на Vercel та встановити Webhook для Telegram-бота!

Розроблено з ❤️ для студентів.
