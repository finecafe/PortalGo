/* Service worker: chạy offline phần giao diện, dữ liệu ưu tiên mạng. */
const VERSION = 'v2';
const SHELL = `cmp-shell-${VERSION}`;
const DATA = `cmp-data-${VERSION}`;
const SHELL_FILES = [
  './',
  './index.html',
  './css/style.css',
  './js/config.js',
  './js/app.js',
  './manifest.webmanifest',
  './assets/logo.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/favicon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => ![SHELL, DATA].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Ảnh thumbnail YouTube: lấy từ cache nếu có, không thì tải rồi lưu (giới hạn nhẹ)
  if (url.hostname === 'i.ytimg.com' || url.hostname.endsWith('.camau.gov.vn')) {
    e.respondWith(
      caches.open(DATA).then(async (c) => {
        const hit = await c.match(req);
        if (hit) return hit;
        try {
          const res = await fetch(req);
          if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone());
          return res;
        } catch { return hit || Response.error(); }
      })
    );
    return;
  }

  if (url.origin !== location.origin) return;

  // Danh sách video: ưu tiên mạng, rớt mạng thì dùng bản đã lưu
  if (url.pathname.endsWith('/data/videos.json') || url.pathname.endsWith('/data/news.json')) {
    e.respondWith(
      fetch(req)
        .then((res) => { const copy = res.clone(); caches.open(DATA).then((c) => c.put(req, copy)); return res; })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Giao diện: ưu tiên cache, đồng thời làm mới nền
  e.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req)
        .then((res) => { if (res.ok) { const copy = res.clone(); caches.open(SHELL).then((c) => c.put(req, copy)); } return res; })
        .catch(() => hit);
      return hit || net;
    })
  );
});
