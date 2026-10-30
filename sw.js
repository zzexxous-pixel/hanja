const CACHE_PREFIX = `bareunhanja-${self.registration.scope}-`;
const CACHE_VERSION = `${CACHE_PREFIX}{{APP_VERSION}}`;

// 반드시 로컬에 존재하는 핵심 파일만 프리캐싱 (하나라도 404면 설치 중단 방지)
const PRECACHE_ASSETS = [
    './',
    './index.html',
    './tailwind-build.css',
    './style.css',
    './manifest.webmanifest',
    './icon-192.png',
    './icon-512.png',
    './hanja_data.js',
    './audioEngine.js',
    './speechEngine.js',
    './writingEngine.js',
    './strokeData.js',
    './assets/vendor/hanzi-writer.min.js',
    './assets/strokes/manifest.json',
    './bookmarkStore.js',
    './glyph-index.js',
    './glyphStore.js',
    './script.js'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_VERSION).then((cache) => {
            return cache.addAll(PRECACHE_ASSETS);
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key.startsWith(CACHE_PREFIX) && key !== CACHE_VERSION) {
                        return caches.delete(key);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    // 추가: http 또는 https 요청이 아니면 가로채지 않음
    if (!event.request.url.startsWith('http')) return;
    
    // Cache First, Network Fallback with Dynamic Caching
    event.respondWith(
        caches.open(CACHE_VERSION).then(cache => ['no-store', 'reload'].includes(event.request.cache) ? undefined : cache.match(event.request)).catch(() => undefined).then((cachedResponse) => {
            if (cachedResponse) {
                return cachedResponse;
            }
            return fetch(event.request).then((networkResponse) => {
                // 유효한 응답 또는 opaque 리소스(외부 CDN 폰트/스타일)인 경우 동적 캐싱
                if (!networkResponse || (networkResponse.status !== 200 && networkResponse.type !== 'opaque')) {
                    return networkResponse;
                }
                const responseToCache = networkResponse.clone();
                caches.open(CACHE_VERSION).then((cache) => {
                    if (event.request.cache !== 'no-store') return cache.put(event.request, responseToCache);
                }).catch(() => { /* Cache quota must not break a successful response. */
                });
                return networkResponse;
            }).catch(() => {
                // 오프라인 상태에서 HTML 요청 실패 시 메인 페이지 서빙
                if (event.request.headers.get('accept')?.includes('text/html')) {
                    return caches.open(CACHE_VERSION).then(cache => cache.match('./index.html', { ignoreSearch: true }));
                }
                return new Response('', {status: 503, statusText: 'Offline'});
            });
        })
    );
});