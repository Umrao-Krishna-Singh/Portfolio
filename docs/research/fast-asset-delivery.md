# Fast asset delivery: how modern sites ship heavy, "amazing" assets and still feel sub-second

Research notes, 2026-10-06. Question: what methods do modern websites use to load high-quality **assets** — images, video, 3D, fonts, code, audio — with sub-second, snappy-feeling loads? Deliberately broader than audio (the Opus work is one instance of these same ideas).

Sources are the web platform itself (MDN, Chrome for Developers, WHATWG, Khronos) plus provider engineering posts (Cloudflare) and the HTTP Archive's [Web Almanac 2024](https://almanac.httparchive.org/en/2024/page-weight) for real-world numbers. All status claims checked against 2025–2026 sources.

## The core insight first

**Sub-second feel is not sub-second bytes.** The median desktop page weighs **2,652 KB** (images 911 KB, JavaScript 632 KB, video 315 KB, fonts 122 KB, CSS 77 KB — [Web Almanac 2024](https://almanac.httparchive.org/en/2024/page-weight)), and showcase sites with heavy WebGL usually weigh far more. What "instant" sites do differently is apply four orthogonal levers, and never make the *first impression* wait for the *whole experience*:

1. **Fewer bytes per asset** — modern formats/codecs (per asset type).
2. **Perfect timing** — load the right bytes at the right moment (priority, hints, streaming).
3. **Never fetch the same byte twice** — immutable caching, edge, service workers.
4. **Manufacture the feel** — placeholders, prerendering, transitions, choreographed loaders.

A 3 MB page can feel instant and a 300 KB page can feel slow. Everything below is one of the four levers.

## Lever 1 — fewer bytes per asset (formats & codecs)

### Images
- **AVIF is the 2026 production default**: ~94%+ browser support (all engines), typically **40–50% smaller than JPEG** at equivalent quality. WebP remains the conservative baseline in `<picture>` fallbacks.
- **JPEG XL** is technically superior (better lossless, progressive) but still not shippable: Safari 17+ ships it, Google re-vendored a Rust decoder (jxl-rs) and shipped it **flag-only in Chrome 145 (Feb 2026)**, Firefox still default-off. Watch, don't use ([caniuse: JXL](https://caniuse.com/jpegxl)).
- **One master, many variants**: CDN-side transforms (Next/Image, Cloudinary, Cloudflare Images) store a high-res master and synthesize per-viewport/per-DPR/per-format variants on demand, so `srcset`/`sizes`/`<picture>` never hand-maintained. This is how editorial sites ship art direction at every screen size without an asset zoo.

### Text & code
- **zstd is the new default compression**: `Content-Encoding: zstd` shipped in Chrome 123 (2024), Firefox/Edge followed. Cloudflare measured zstd **42% faster to compress than Brotli at 11.3% better ratios** ([Cloudflare, Sep 2024](https://blog.cloudflare.com/new-standards-for-a-faster-and-more-private-internet/)) — the win is mostly for *dynamic* responses that can't be pre-compressed. Static assets should still be **pre-compressed at build time** (Brotli/zstd level max) so the server sends bytes without thinking.
- Code splitting (`import()`), tree-shaking, and module maps mean you ship the code for the current view, not the app. (Import maps — already used here for three.js — are the native mechanism for CDN-bare-specifier loading.)

### Fonts
- WOFF2 + **`unicode-range` subsetting** (Google Fonts serves each alphabet chunk separately), **variable fonts** (one file, all weights), `font-display: swap/optional`, and metric-override fallbacks (`size-adjust`) so the fallback layout doesn't jump. Median pages ship 122 KB of fonts; disciplined sites ship one ~30–60 KB variable WOFF2.

### Audio
- **Opus** is the floor-setter (~30–50% smaller than MP3 at equal quality, and uniquely good at *very* low bitrates — the 25 kbps mono v3 of The Bard's Tale is exactly this lever). `<audio preload="metadata">` + lazy `decodeAudioData` keep audio out of the critical path entirely.

### Video
- **AV1** decodes in all major browsers (Safari on Apple Silicon; hardware decoding is the remaining bottleneck). Ship `codecs=` strings in `<source>` so browsers pick without downloading; poster frames + `preload="none"` + IntersectionObserver-triggered loads keep video out of first paint. Short muted AV1/VP9 loops have replaced GIFs and often background video entirely.

### 3D / WebGL — the "amazing asset" heavyweights
- **Geometry**: glTF 2.0 (GLB) compressed with **meshopt (`EXT_meshopt_compression`)** or **Draco**. Rule of thumb from the [gltf-transform](https://gltf-transform.dev) community: **meshopt for fast decode and streaming** (chunked, worker-friendly), **Draco for maximum shrink** (slower to decode); prune → dedupe → weld → simplify → texture-resize → compress, and compress **last**. `gltfpack`/[gltf.report](https://gltf.report) automate the pass.
- **Textures — the single biggest win**: **KTX2 / Basis Universal** ([three.js `KTX2Loader`](https://threejs.org/docs/#examples/en/loaders/KTX2Loader)) ships textures in a **GPU-native compressed format** (ASTC/ETC2/BC7 chosen per device at transcode time). Textures stay compressed *in GPU memory* — typically **6–10× smaller downloads than PNG/JPG** *and* 4–8× less VRAM, which is why texture-heavy showcase scenes fit "sub-second" at all. Textures, not geometry, dominate 3D payload.
- **Streaming**: progressive LODs (`THREE.LOD`), and for truly large scenes OGC **3D Tiles** (Cesium) stream tiles by camera view — the same "load what the camera can see" idea game engines use.

## Lever 2 — perfect timing (the right bytes at the right moment)

- **Priority is a first-class API now**: `fetchpriority="high"` on exactly the hero/LCP image (supported Chrome 101+, Safari 17+, Firefox 132+), `loading="lazy"` + `content-visibility: auto` on everything below the fold. Browsers already run a priority matrix; hints align your assets with it.
- **Resource hints**: `preconnect` for third-party origins (CDN, fonts), `preload` for the current page's critical assets, `modulepreload` for ES-module graphs.
- **Early Hints (HTTP 103)**: the CDN sends preload/preconnect headers *before* the server finishes thinking. Chrome-only so far (Safari/Firefox not shipped, 2025) — a progressive enhancement at best ([Cloudflare Early Hints](https://blog.cloudflare.com/early-hints/)).
- **Speculation Rules API** — the 2024–26 star: declarative JSON telling the browser to `prefetch` or fully **`prerender`** the next page on hover/viewport proximity ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Speculation_Rules_API), [WHATWG HTML §7.6](https://html.spec.whatwg.org/multipage/nav-history-apis.html#speculative-loading)). A prerendered navigation is genuinely **instant** — this is how modern MPAs feel like SPAs. (Same-origin by default.)
- **HTTP/3 (QUIC)**: no TCP+TLS handshake stack, 0-RTT resumption on repeat visits, no cross-stream head-of-line blocking. 21% of Cloudflare's 2025 traffic ([Radar Year in Review](https://blog.cloudflare.com/radar-2025-year-in-review/)), ~35% of sites advertise it. Browser-side free; needs CDN/origin support.
- **Streaming SSR**: flush the HTML head/hero immediately, stream the rest — the browser parses progressively instead of waiting for a complete document.

## Lever 3 — never fetch the same byte twice

- **Content-hashed filenames + `Cache-Control: immutable, max-age=31536000`**: the URL changes only when content changes, so caches never need revalidation. (This project's manual `?v=N` is the hand-cranked version of the same idea.)
- **Service workers** (Workbox-style precache): repeat visits load from disk, offline included; `stale-while-revalidate` keeps things fresh without a round-trip on the critical path.
- **bfcache** (back/forward cache) — the browser's free "instant back" that sites accidentally opt out of (unload handlers, no-store).
- **Edge caching**: the CDN holds the rendered/transformed asset at a POP near the user; conditional requests (ETag → 304) cost only headers.

## Lever 4 — manufacturing the "snappy feel"

- **LQIP / blur-up**: a ~20×12px inline blur, or a **BlurHash/ThumbHash string (~20–40 bytes) embedded in the API response** and decoded client-side ([ThumbHash](https://evanw.github.io/thumbhash/) — more accurate than BlurHash, encodes aspect ratio + alpha). The page *never* shows an empty box.
- **View Transitions API**: browser-snapshot morphs between states. Same-document transitions are **Baseline as of Oct 2025** (Chrome 111+, Safari 18+, Firefox 144+); cross-document (MPA) transitions are still Chromium-first ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API)). Motion reads as speed even when work is happening.
- **Speculative + optimistic UI**: act on the click, reconcile later; prefetch on pointerdown/hover; skeleton screens beat spinners (perceived-progress research).
- **INP discipline**: "snappy" is mostly *interaction* latency (<200 ms), not load. The recurring trick on heavy sites: **never let big work run on the main thread at interaction time** — chunk it, or push it to workers/WASM.
- **Choreographed loaders**: the Awwwards-style pattern — a tiny HTML/CSS shell paints instantly, a themed loader covers real preparation (compile, bake, decode), and the reveal is gated on *readiness*, not on the clock. Sub-second LCP with a heavy scene is usually this pattern: the first screen is real, the "amazing" streams in behind the veil.

## How it composes — the three archetypes

1. **WebGL showcase** (product configurators, portfolio showpieces): instant HTML shell → loader veil → KTX2+meshopt GLB streams → `KTX2Loader`/`MeshoptDecoder`/`DRACOLoader` in workers → readiness-gated reveal. Size win: textures 6–10×; feel win: choreography.
2. **Editorial/media** (news, magazines): CDN image transforms + `srcset` + `fetchpriority="high"` hero + lazy everything else + ThumbHash placeholders + zstd/HTTP-3. Sub-second LCP with multi-MB galleries.
3. **MPA renaissance** (content sites ditching SPAs): Speculation Rules prerender + bfcache + immutable caching + streaming SSR → navigations that feel client-side with none of the SPA bundle.

## Mapping to this prototype (context, not decisions)

- **Already on the list**: Opus audio (v3), import maps, readiness-gated loader choreography, manual `?v=N` busting, procedural assets (zero download — the parchment *is* the compression story taken to its limit).
- **Production upgrade menu if/when it ships**: pre-compressed static assets (Brotli/zstd at build), content-hashed immutable caching replacing `?v=N`, `preload`+`fetchpriority` on the first-paint sheet, a service-worker precache for repeat-visit instant load, and — directly relevant to the open ADR-0010/watchdog question — moving the parchment column bake off the main thread (OffscreenCanvas worker) instead of degrading quality when frames slip.
- **Not applicable here (yet)**: KTX2/meshopt (no external models — everything procedural), Speculation Rules (single-page scroll site), CDN transforms (no raster media).
- **Honesty note for expectations**: "sub-second" on 3D-heavy sites means *first meaningful paint + interaction latency*, never full-scene-loaded. The craft is deciding what the first second owes the visitor, and hiding the rest behind the veil they're happy to watch.
