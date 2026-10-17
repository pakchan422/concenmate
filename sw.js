// ConcenMate 書伴 Service Worker（v1.208.0，PWA 用）
// 策略：網絡優先——每次都先攞伺服器最新版本，網絡唔通先用返上次嘅快取，
// 所以網站一更新，學生下次開就係新版本，唔會卡喺舊版。
// 只處理同網域嘅 GET 請求；Firebase、Google、EmailJS 等外部請求一律唔理。
const CACHE = 'concenmate-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    try {
      const res = await fetch(req);
      // 淨係快取完整（200）嘅回應；聲音檔嘅分段回應（206）唔快取
      if (res && res.status === 200 && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      }
      return res;
    } catch (err) {
      const hit = await caches.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') {
        const idx = (await caches.match('./')) || (await caches.match('index.html'));
        if (idx) return idx;
      }
      throw err;
    }
  })());
});
