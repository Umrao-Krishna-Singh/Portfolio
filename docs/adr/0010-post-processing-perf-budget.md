# Post-processing stack: ACES, bloom, grain — sized to a GTX 1650 4GB, with auto-degrade

Status: accepted (2026-10-04).

The 3D scene gets a fixed cinematic grade: ACES filmic tone mapping (free), UnrealBloomPass (the single most expensive add, ~2-4ms and 60-80MB VRAM at these resolutions), and film grain + vignette as a cheap CSS overlay on top of the canvas (free on GPU). Flames are a custom GLSL shader on billboards (<0.5ms), replacing sprite blobs — the cartoon flame was a primary "childish" tell. Pixel ratio is capped at 1.75. An FPS watchdog drops bloom automatically if the frame budget slips — on the user's GTX 1650 4GB the rule is degrade, never stutter. Photoreal post (SSAO, SSR, depth of field passes) is rejected as out of budget. Consequence: no other full-screen passes may be added without re-costing against the 4GB budget, and the watchdog's degrade steps are part of the contract, not an optimization.
