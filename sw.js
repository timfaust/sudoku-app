// The installed app's offline copy (APP_CONCEPT.md §8, U5 phase 2): every file of
// the site, cached whole per version, so an update replaces the cache at once.
// sudoku_reasoner/site.py writes the line below; unbuilt, it caches nothing.

const SITE = {"version":"658b377","files":["css/app.css","css/font.css","data/practice.json","data/starter.json","diagnostics.html","engine/sudoku_reasoner.zip","fonts/AtkinsonHyperlegibleNext.woff2","fonts/OFL.txt","icons/icon-192.png","icons/icon-512.png","icons/icon.svg","index.html","js/board.js","js/diagnostics.js","js/dom.js","js/engine.js","js/geometry.js","js/lessons.js","js/library.js","js/main.js","js/pad.js","js/play.js","js/reading.js","js/settings.js","js/sketch.js","js/step.js","js/store.js","js/strip.js","js/text.js","js/text/de.js","js/text/en.js","js/views/analyse.js","js/views/compare.js","js/views/failure.js","js/views/learn.js","js/views/puzzles.js","js/views/solve.js","js/worker.js","manifest.webmanifest","pyodide/NOTICE.txt","pyodide/pyodide-lock.json","pyodide/pyodide.asm.mjs","pyodide/pyodide.asm.wasm","pyodide/pyodide.mjs","pyodide/python_stdlib.zip"]};

const PREFIX = "sudoku-app-"; // the origin is shared with the owner's other Pages sites, so only this site's caches
const CACHE = `${PREFIX}${SITE.version}`;

// Each file from the server itself, never the browser's HTTP cache, which may
// still hold the version before.
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SITE.files.map(file => new Request(file, { cache: "reload" })))));
});

// A downloaded version takes over when the app starts and asks it to (main.js),
// else once every window of the old one has closed, so a session never mixes
// two versions; the old version's cache goes then.
self.addEventListener("message", event => { if (event.data === "take-over") self.skipWaiting(); });
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys()
    .then(names => Promise.all(names.filter(name => name.startsWith(PREFIX) && name !== CACHE).map(name => caches.delete(name))))
    .then(() => self.clients.claim()));
});

// A file from the copy, else the network; a page the copy lacks (the site's
// root) is the app.
self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== location.origin) return;
  event.respondWith(caches.open(CACHE).then(async cache => (await cache.match(request, { ignoreSearch: true }))
    ?? (request.mode === "navigate" ? await cache.match("index.html") : undefined)
    ?? fetch(request)));
});
