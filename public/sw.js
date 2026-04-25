const CACHE_NAME = "rosklad-cache-v1";

// Що зберігаємо в пам'ять одразу при першому заході
const urlsToCache = ["/", "/app.html"];

// Встановлення Service Worker
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(urlsToCache)),
  );
});

// Перехоплення всіх запитів (Тут відбувається магія)
self.addEventListener("fetch", (event) => {
  // 1. Якщо це запит до API (наприклад, завантаження розкладу)
  if (event.request.url.includes("/api/")) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Якщо інтернет Є - зберігаємо свіжий розклад у кеш і віддаємо юзеру
          const clonedResponse = response.clone();
          caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(event.request, clonedResponse));
          return response;
        })
        .catch(() => {
          // Якщо інтернету НЕМАЄ - дістаємо останній збережений розклад з пам'яті
          return caches.match(event.request);
        }),
    );
  } else {
    // 2. Для всіх інших файлів (сам HTML-додаток)
    event.respondWith(
      caches.match(event.request).then((response) => {
        // Віддаємо з кешу, або ліземо в інтернет, якщо в кеші ще немає
        return response || fetch(event.request);
      }),
    );
  }
});
