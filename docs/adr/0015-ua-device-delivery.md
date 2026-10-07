# Device delivery: UA-based, single URL (the browser toggle is the desktop switch)

Status: accepted (2026-10-07, #13 grilling round 2).

The site serves BOTH experiences from ONE URL, and the mobile-vs-full choice is made from the User-Agent alone at page load. No viewport-width or touch/pointer heuristic participates in that choice, there is no `m.` subdomain, and there is no in-page switch link or localStorage override: the browser's own "Request Desktop Site / Website" option is the switch. It works by swapping the User-Agent and reloading the same URL — which is exactly when our gate re-evaluates.

Evidence from verification (2026-10-07): iOS Safari's request-desktop changes ONLY the UA — the layout viewport stays ~390px and the choice is remembered per-domain; Chrome Android additionally forces a ≈980px layout but its toggle is per-tab. Viewport- or touch-based detection therefore cannot honor the toggle (Safari breakpoints still see a phone-width viewport), while `navigator.userAgentData.mobile` (false in desktop mode; `Sec-CH-UA-Mobile: ?0`) does, with the UA string as fallback. The `m.`-subdomain pattern is the legacy alternative and is discouraged under mobile-first indexing (bidirectional annotations, content parity, `Vary: User-Agent` caching) — Google recommends responsive single-URL sites.

Consequences:

- The 3D gate (prototype/scene.js) becomes a load-time UA check: mobile UA → the designed non-3D mobile version; desktop UA → the full 3D site at ANY window width. A desktop resize never tears the scene down, and a phone requesting the desktop site gets 3D after the browser's reload. This resolves the one-shot `innerWidth <= 768` gate bug (#20 item 1) by construction.
- `prefers-reduced-motion` still forces the non-3D experience independently of the UA decision.
- Layout stacking (side-by-side → top-down) remains viewport-driven CSS exactly as today; ONLY the 3D-vs-non-3D experience choice is UA-driven.
- Tablets follow their UA, full stop (owner decision 2026-10-07, declining tablet-specific code): Android tablets report a mobile UA and get the mobile version; iPads report a desktop UA by default since iPadOS 13 and get the full site.
- The mobile version is a deliberately designed non-3D presentation, not the current width-clamped accident (owner tested and rejected it, 2026-10-06).
