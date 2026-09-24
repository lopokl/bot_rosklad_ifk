# 🎓 Telegram Mini App: Студентський Розклад

![Telegram](https://img.shields.io/badge/Telegram-2CA5E0?style=for-the-badge&logo=telegram&logoColor=white)
![NodeJS](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)
![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)

Сучасний Telegram-бот з інтегрованим **Mini App (Web App)** для зручного перегляду розкладу пар. Проєкт створений для студентів, щоб мати доступ до розкладу, імен викладачів та особистих нотаток у кілька кліків прямо в месенджері або браузері.

## ✨ Головні фічі

- **📱 Telegram Mini App & ПК-дашборд:** Зручний мобільний та десктопний інтерфейс (тижнева сітка пар, гарячі клавіші, швидкий друк) замість нудних текстових повідомлень.
- **⚡ Serverless Backend:** Працює на Vercel Serverless Functions (без необхідності тримати сервер 24/7 увімкненим).
- **🔄 Моніторинг змін у розкладі:** Автоматична перевірка Google Таблиць на появу нових дат та сповіщення студентів.
- **📁 Інтеграція з Google Sheets:** Розклад тягнеться напряму з Google Таблиць коледжу/університету.
- **💾 Розумне кешування (Vercel KV):** Дані таблиць кешуються на 1 годину для блискавичного завантаження та економії запитів до Google API.
- **🟢 Підсвітка поточної пари:** Додаток автоматично вираховує час і підсвічує пару, яка йде прямо зараз.
- **📝 Особисті нотатки (ДЗ):** Користувачі можуть зберігати свої нотатки (домашку) до кожного предмета у власну базу даних.
- **🔒 Безпечна архітектура:** Модульні сервіси винесені в `lib/`, конфіги та токени — в змінні оточення.

## 🛠 Технологічний стек

- **Frontend:** HTML5, JavaScript (ES6+), Tailwind CSS, Chart.js.
- **Backend:** Node.js, Telegraf.js (Telegram Bot API).
- **Database / Cache:** Upstash Redis (Vercel KV).
- **Deployment:** Vercel.

## 📂 Архітектура проєкту

```text
├── api/                   # Serverless Functions (ендпоінти Vercel)
│   ├── admin.js           # API для адмін-панелі
│   ├── app-status.js      # API статусу сервера та банерів
│   ├── bot.js             # Головний файл Telegram-бота (Webhooks)
│   ├── check-updates.js   # Перевірка оновлень розкладу
│   ├── feedback.js        # Зворотний зв'язок від користувачів
│   ├── get-schedule.js    # Парсинг розкладу з Google Sheets
│   ├── groups.js          # Список доступних груп
│   ├── notes.js           # Особисті нотатки (ДЗ)
│   ├── save-group.js      # Збереження обраної групи
│   └── settings.js        # Налаштування користувача
├── lib/                   # Службові модулі та сервіси (не займають ліміти functions)
│   ├── config.js          # Конфігурація (ID таблиць, дзвінки)
│   ├── http-helper.js     # Утиліти HTTP (CORS, перевірка прав)
│   ├── notifier-service.js# Сервіс сповіщень та розсилок у Telegram
│   ├── schedule-helper.js # Обробка та кешування розкладу
│   └── user-service.js    # Робота з базою даних користувачів
├── public/                # Статичні файли веб-інтерфейсу
│   ├── admin.html         # Адмін-панель
│   ├── app.html           # Головний додаток (Мобільний + ПК)
│   ├── index.html         # Лендінг сайту
│   └── settings.html      # Вікно налаштувань
├── package.json           # Залежності проєкту
└── vercel.json            # Налаштування деплою на Vercel
```

## 🚀 Встановлення та запуск

Клонуйте репозиторій:
```bash
git clone https://github.com/lopokl/bot_rosklad_ifk.git
cd bot_rosklad_ifk
```

Встановіть залежності:
```bash
npm install
```

Налаштуйте змінні середовища у Vercel:
- `BOT_TOKEN`: токен від @BotFather
- `ADMIN_ID`: ваш Telegram ID
- `APP_URL`: URL вашого Vercel додатку
- `KV_REST_API_URL` та `KV_REST_API_TOKEN`: параметри з вкладки Storage (Redis)
