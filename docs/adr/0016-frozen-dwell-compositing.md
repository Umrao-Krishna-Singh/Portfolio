# Frozen Dwell compositing for 3D desk zones

Status: accepted (2026-10-14).

When the camera rests inside either the top or bottom desk zones for more than 250ms, the static 3D desk environment is captured into a HalfFloat render target, and only the live candle flame billboards and bloom pass are composited on top every frame. This eliminates the full 8-light PBR GGX shading pass while parked, jumping framerate from ~25 fps to a solid 60 fps (<1.6ms Three.js cost) on integrated GPUs, while preserving authentic flickering candle flames, specular highlights, and ACES bloom. Wheel or scroll input unparks instantly back to full-scene rendering.

## Context & Considered Options

The 3D desk scene uses an 8-light PBR rig under Three.js `MeshStandardMaterial` and ACES filmic tone mapping with `UnrealBloomPass`. On target hardware (Intel UHD 630 iGPU), rendering the complete scene every frame while the user is parked reading at the desk cost ~34–40 ms/frame (~25 fps).

Alternatives evaluated and rejected:
1. **Quality degrade ladder (watchdog)**: Dropping bloom or shadows degraded visual fidelity and caused material recompile stalls (ADR-0010 Updates 4 & 6).
2. **Fixed 0.9 resolution downscaling**: Caused visible softening on the desk and text, rejected on visual fidelity (ADR-0010 Update 12).
3. **Consolidating lights (8 → 3)**: Required re-architecting light positions for only modest gains (+2–3 fps) and altered illumination mood (archived in `prototype-perf-lights/`, removed 2026-10-14 per ADR-0010 Update 16).
4. **Completely freezing canvas rendering at rest**: Dropped candle flame flicker, halos, and organic life from the scene.

## Consequences

- When stationary at `window.scrollY <= 120` or at full bottom (`scrollY >= maxScroll - 120`), `captureHoldTarget()` captures the scene geometry once.
- `renderParked(f1, f2)` composites `holdTarget` into `composer.readBuffer`, disables scene background clearing, and renders only `flameL`, `flameR`, `haloL`, and `haloR` through the post-processing stack.
- Frame cost at rest drops from ~34ms to ~1.2–1.6ms.
- Any scroll, camera drift, or viewport resize immediately sets `isParked = false` and resets `dwellStillMs = 0`, ensuring continuous interactive navigation is seamless.
