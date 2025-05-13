const CACHE_NAME = 'shadow-routes-cache-v1';
// רשימת הקבצים לשמירה במטמון. התאימי אותה לקבצים האמיתיים בפרויקט שלך!
const urlsToCache = [
    '/',
    '/index.html',
    '/css/styles.css',
    '/css/comparison.css', // אם עדיין רלוונטי
    '/js/app.js',
    '/js/map.js',
    '/js/bottomSheet.js',
    '/assets/bgu-logo.png', // אם זה הלוגו שלך
    // הוסיפי כאן נתיבים לאייקונים שהגדרת במניפסט:
    '/assets/icons/icon-192x192.jpg',
    '/assets/icons/icon-512x512.jpg',
    // אם יש לך עוד קבצי JS/CSS/תמונות חשובים, הוסיפי גם אותם
    'https://unpkg.com/maplibre-gl@3.6.2/dist/maplibre-gl.js',
    'https://unpkg.com/maplibre-gl@3.6.2/dist/maplibre-gl.css',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap' // שימי לב ששמירת קבצים חיצוניים יכולה להיות מורכבת יותר מבחינת CORS אם השרת החיצוני לא מאפשר
];

// התקנת ה-Service Worker ושמירת קבצים במטמון
self.addEventListener('install', event => {
    console.log('Service Worker: Installing...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Service Worker: Caching app shell');
                return cache.addAll(urlsToCache.map(url => new Request(url, { cache: 'reload' }))); // reload כדי לוודא שאנחנו מקבלים את הגרסה העדכנית ביותר מהרשת בזמן ההתקנה
            })
            .then(() => {
                console.log('Service Worker: App shell cached successfully');
                return self.skipWaiting(); // הפעל את ה-SW החדש מייד
            })
            .catch(error => {
                console.error('Service Worker: Caching failed', error);
            })
    );
});

// הפעלת ה-Service Worker
self.addEventListener('activate', event => {
    console.log('Service Worker: Activating...');
    // הסרת מטמונים ישנים
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Service Worker: Deleting old cache', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            console.log('Service Worker: Activated and old caches cleared.');
            return self.clients.claim(); // קח שליטה על כל הלקוחות הפתוחים
        })
    );
});

// יירוט בקשות רשת והגשת קבצים מהמטמון (אסטרטגיית Cache First, ואז Network)
self.addEventListener('fetch', event => {
    // אנחנו רוצים שה-API calls לשרת שלנו (למשל /route, /shadows) תמיד יגיעו לרשת
    // ולא יוגשו מהמטמון, כי הנתונים שם דינמיים.
    const requestUrl = new URL(event.request.url);
    if (requestUrl.pathname.startsWith('/route') ||
        requestUrl.pathname.startsWith('/shadows') ||
        requestUrl.pathname.startsWith('/shadows_at_time') ||
        requestUrl.pathname.startsWith('/api/') || // למועדפים
        requestUrl.pathname.startsWith('/login') || // לאימות
        requestUrl.pathname.startsWith('/register')) {

        // עבור בקשות API, תמיד נסה רשת, ואם נכשל, אל תעשה כלום (או החזר תגובת שגיאה מותאמת)
        event.respondWith(fetch(event.request).catch(() => {
            // אפשר להחזיר תגובה גנרית שמציינת שהמשתמש אופליין
            // return new Response(JSON.stringify({ error: "App is offline" }), { headers: { 'Content-Type': 'application/json' }});
            // כרגע, פשוט ניתן לבקשה להיכשל אם אין רשת
        }));
        return;
    }

    // עבור קבצים סטטיים (HTML, CSS, JS, תמונות), נסה קודם כל מהמטמון
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                if (response) {
                    // console.log('Service Worker: Serving from cache', event.request.url);
                    return response; // הגיש מהמטמון אם נמצא
                }
                // console.log('Service Worker: Fetching from network', event.request.url);
                return fetch(event.request).then(
                    networkResponse => {
                        // אם הבקשה הצליחה והיא לקובץ מהדומיין שלנו (ולא CDN חיצוני שאולי לא נרצה לשמור הכל ממנו)
                        // וזו בקשת GET, אז שמור אותה במטמון לשימוש עתידי
                        if (networkResponse && networkResponse.status === 200 && event.request.method === 'GET' &&
                            !requestUrl.hostname.includes('api.maptiler.com') && // <--- !!! זה השינוי שהוספנו !!!
                            (event.request.url.startsWith(self.location.origin) ||
                             urlsToCache.includes(requestUrl.pathname) || // שים לב: תנאי זה בודק רק את ה-pathname
                             requestUrl.hostname.includes('unpkg') ||
                             requestUrl.hostname.includes('googleapis'))) {
                            const responseToCache = networkResponse.clone();
                            caches.open(CACHE_NAME)
                                .then(cache => {
                                    cache.put(event.request, responseToCache);
                                });
                        }
                        return networkResponse;
                    }
                ).catch(error => {
                    console.error('Service Worker: Fetching from network failed', event.request.url, error);
                    // כאן אפשר להחזיר דף אופליין גנרי אם רוצים
                });
            })
    );
});