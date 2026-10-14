# Fixed post-processing and rendering pipeline: ACES, bloom, CSS grain, and static lightmap baking

Status: accepted (2026-10-14).

The 3D scene uses fixed cinematic quality with zero runtime degradation ladders: ACES filmic tone mapping, UnrealBloomPass, and authentic CSS `#grain` with SVG fractal noise over the viewport. The desk table and parchment retain full PBR `MeshStandardMaterial` specular and normal responses, while the background wall is baked into HalfFloat diffuse lightmaps. Dynamic candle flickers ride material uniforms (`uF1`, `uF2`), the left candle shadow is removed, and static desk rests park via Frozen Dwell (ADR-0016).

## Considered Options

- **Quality degrade watchdog ladder**: Dynamic shadow/bloom-off and pixel-ratio scaling caused material recompile hitches (9 fps dips) and visual degradation; rejected and deleted outright (Update 4 & 6).
- **Fixed ×0.9 render scaling**: Softened the desk and text noticeably; rejected on visual fidelity (Update 12).
- **Punctual light reduction (8 → 3)**: Required re-authoring the light rig for negligible fps gain and altered candle warmth; rejected and removed.
- **ShaderPass WebGL film grain**: Caused blotchy texture and banding; authentic CSS `#grain` with `mix-blend-mode: overlay` restored.

## Consequences

- `renderer.toneMapping = THREE.ACESFilmicToneMapping` with exposure 1.12–1.38.
- Shadow maps are completely disabled (`renderer.shadowMap.enabled = false`); props use baked blob contact shadows.
- Quality is fixed for the entire session; no runtime degradation or watchdog logic exists.
- Major diffuse wall lighting is baked into HalfFloat lightmaps at boot behind the loader.
- Desk dwell rests park rendering into a static composite (`isParked = true`), holding 60 fps at 1.2–1.6ms render cost (ADR-0016).
