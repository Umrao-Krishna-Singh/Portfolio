# WebGL Performance Techniques for Fill-Rate-Bound Scenes (Intel UHD 630)

Research reference on structure-changing techniques for fragment-shading-bound Three.js (r160) scenes on weak integrated GPUs, targeting $\ge 2\times$ FPS with zero visual degradation.

## 1. Measured Cost Structure (Ground Truth)

- **Shading Slope**: ~12–15 ms per rendered megapixel at 1080p DPR-1 (dominated by compile-time unrolled 8-light PBR in `lights_fragment_begin.glsl`).
- **Fixed Overhead**: ~5–10 ms (UnrealBloomPass ~2–4 ms, CPU draw submission ~4 ms).
- **CSS Grain Tax**: ~6 ms/frame (fullscreen animated `mix-blend-mode: overlay` over DOM content).
- **Bottleneck**: Fragment shading ALU on large screen-covering geometry (desk, wall, parchment). Geometry complexity, occlusion overdraw, and CPU submission are not the limiting factors.

## 2. Structural Techniques (Ranked)

| Technique | Mechanism | Expected Impact | Implementation Status |
| :--- | :--- | :--- | :--- |
| **Frozen Dwell Compositing** | Capture static scene to HalfFloat RT once during camera rests; composite only dynamic flame billboards + bloom on top. | Drops parked dwell from ~35ms to ~1.2–1.6ms (60 fps locked). | **Adopted** (ADR-0016). |
| **Analytic Lightmap Baking** | Bake static/distant lighting into HalfFloat lightmaps; modulate candle pools via uniforms (`uF1`, `uF2`). | Cuts per-pixel PBR ALU down to 1–2 texture fetches + multiply. | **Adopted** for background wall (ADR-0010). |
| **Compositor Grain Optimization** | Animate grain via compositor-only transforms or scoped overlays; eliminate fullscreen `mix-blend-mode` repaint thrashing. | Reclaims ~6ms compositor overhead. | **Adopted** (ADR-0010). |
| **Hand-Written ShaderMaterial** | Replace full PBR on matte surfaces with analytic hemisphere + cone falloffs. | Replaces 8 PBR BRDFs with ~3 cheap mathematical terms. | Fallback alternative to lightmaps. |
| **Fixed Pacing (30-on-60)** | Cap rAF cadence to an integer divisor (every 2nd vsync) to prevent 24–32 fps judder. | Improves perceptual smoothness; does not increase throughput. | Evaluated. |

## 3. Architecture Details

### A. Quake-Style Dynamic Lightstyles on Baked Surfaces
Three.js `MeshBasicMaterial.lightMap` samples an indirect diffuse texture with zero lighting ALU. To retain dynamic candle flickers without live PBR re-evaluation:
- Surface lighting is split into static terms (ambient, moon, embers) and dynamic candle pools.
- Reflected irradiance modulates the baked pools via uniform scalars:
  $$\text{reflectedLight} += (\text{lightMapTexel} \cdot \text{intensity} + \text{pool}_1 \cdot uF_1 + \text{pool}_2 \cdot uF_2) \cdot \frac{1}{\pi}$$
- Eliminates 8-light BRDF loops while preserving candle animation and contact shadows.

### B. Frozen Dwell Cinemagraph Pipeline
- Camera movement/scroll sets `isParked = false` and resets `dwellStillMs = 0`.
- When camera and scroll remain stationary for $>250\text{ms}$ in a desk zone:
  1. `captureHoldTarget()` renders the static environment (desk, paper, candles, wall) into `holdTarget` once.
  2. `renderParked(f1, f2)` writes `holdTarget` into `composer.readBuffer`, disables scene clearing, and renders only flame billboards (`flameL`, `flameR`) and halos (`haloL`, `haloR`).
  3. `UnrealBloomPass` and `OutputPass` execute on the composite, preserving live candle bloom and flicker at 60 fps.

## 4. Evaluated and Rejected Techniques

- **Quality Degrade Ladder (Watchdog)**: Dropping bloom, shadows, or pixel ratio mid-run caused full material recompilation hitches (9 fps dips) and visual pops (ADR-0010).
- **Fixed $\times0.9$ Render Scale**: Caused noticeable blurring on desk grain and parchment text; rejected on visual fidelity.
- **Punctual Light Reduction (8 $\to$ 3)**: Yielded only marginal gains (+2–3 fps) on iGPU while altering candle warmth and illumination mood.
- **`mediump` Precision Qualifiers**: Three.js defaults to `highp`; desktop GPUs evaluate minimum precision at fp32. Yields no performance gain on Intel Gen9.
- **HalfFloat $\to$ UnsignedByte Render Targets**: RT bandwidth is not the bottleneck; 8-bit targets cause severe color banding under ACES tone mapping and bloom.
- **Depth Prepass**: The desk scene has minimal occluded geometry; an early-Z prepass adds pure overhead with nothing to amortize.
- **WebGPU Migration**: In Three.js r160, WebGPU is experimental, lacks parity for `EffectComposer`, and does not improve fragment ALU throughput on identical execution units.
- **OffscreenCanvas / Worker**: Solves main-thread CPU blocking; ineffective when the bottleneck is GPU fragment fill-rate.

## 5. Primary References

- **Three.js r160 Source**: [Rendering on Demand](https://github.com/mrdoob/three.js/blob/r160/manual/en/rendering-on-demand.html) · [lights_fragment_begin.glsl.js](https://github.com/mrdoob/three.js/blob/r160/src/renderers/shaders/ShaderChunk/lights_fragment_begin.glsl.js) · [EffectComposer.js](https://github.com/mrdoob/three.js/blob/r160/examples/jsm/postprocessing/EffectComposer.js)
- **id Software Quake Source**: [gl_rlight.c (Lightstyles)](https://github.com/id-Software/Quake/blob/master/WinQuake/gl_rlight.c) · [gl_rsurf.c (Surface Caching)](https://github.com/id-Software/Quake/blob/master/WinQuake/gl_rsurf.c)
- **Abrash, Graphics Programming Black Book**: [Chapter 68: Quake's Lighting Model](https://github.com/jagregory/abrash-black-book/blob/master/src/chapter-68.md)
- **NVIDIA GPU Gems 3**: [Chapter 21: True Impostors](https://developer.nvidia.com/gpugems/gpugems3/part-iv-image-effects/chapter-21-true-impostors)
- **Web Platform Performance**: [web.dev Rendering Performance](https://web.dev/articles/rendering-performance) · [web.dev Compositor-Only Properties](https://web.dev/articles/stick-to-compositor-only-properties-and-manage-layer-count) · [Android Frame Pacing](https://source.android.com/docs/core/graphics/frame-pacing)
