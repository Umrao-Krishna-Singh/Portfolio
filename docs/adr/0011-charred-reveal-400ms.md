# Charred reveal: char edge, embers, and heat shimmer with 400ms settle token

Status: accepted (2026-10-14).

Text and sketch reveals ignite as a charred burn: a ragged burning filament sweeps each line/panel, glowing embers drift on a 2D canvas, and text cools to permanent ink over a single source-of-truth 400ms token. Reveals replay on viewport re-entry and are governed by a settle gate (motion queues triggers, igniting only after 80ms of scroll quiet + 60ms beat) so animations never pop in or burn off-screen.

## Performance Rules & Architecture

- **No forced layout flushes**: Synchronous `offsetWidth` reads are banned. Elements reset via persistent off-screen `.rearm`, cleanly stripped in a `requestAnimationFrame` microtask when igniting.
- **Layer promotion restraint**: `.ember-reveal .ch` uses `will-change: opacity, transform`. `filter` is excluded from `will-change` to prevent thousands of GPU texture backing layers.
- **Pre-rendered particle glow**: 2D canvas ember sparks stamp a pre-rendered 32×32 radial gradient sprite via `drawImage()`, eliminating per-frame `shadowBlur` Gaussian convolutions.
- **GPU transform sweeps**: `.char-line` sweeps via GPU `transform: translateY()`, isolating fire wobble to the independent CSS `scale: 1 0.9 -> 1 1.14` property to avoid layout recalculation.
- **Desk zone deferral**: Reveals never ignite behind opaque 3D desk zones; pending triggers queue and flush smoothly upon zone exit.

## Consequences

- All fire settle timings share the 400ms token across CSS and JS.
- Schedulers must remain idempotent and restartable across repeated scroll visits.
- Re-entries enforce a 900ms cooldown to prevent boundary jitter machine-gunning.
- Mobile ≤768px (no WebGL) keeps exactly this 2D charred reveal as its primary experience.
