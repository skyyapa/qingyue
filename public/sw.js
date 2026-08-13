/* 轻阅 Service Worker：应用壳预缓存 + 运行时缓存 + 离线回退 */
const VERSION = 'qingyue-v1'
const CACHE_NAME = `${VERSION}-shell`

/* 安装时预缓存应用壳（相对路径，兼容任意 base） */
const PRECACHE = ['./', './manifest.json', './favicon.svg', './icons/icon-192.png', './icons/icon-512.png']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)

  // 只处理同源 GET（跨域书源请求不缓存，避免混入脏数据）
  if (request.method !== 'GET' || url.origin !== location.origin) return

  // 导航请求：网络优先，离线时回退应用壳
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((resp) => {
          const copy = resp.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put('./', copy))
          return resp
        })
        .catch(() => caches.match('./'))
    )
    return
  }

  // 静态资源与页面：缓存优先（首次请求后离线可用）
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((resp) => {
          if (resp.ok) {
            const copy = resp.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
          }
          return resp
        })
    )
  )
})
