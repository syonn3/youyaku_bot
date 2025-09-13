// v0.1 雛形（まだ機能は持たせません）
self.addEventListener('install', () => {
  // ここは空でOK（将来キャッシュを入れます）
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
