# Diegetic wax seal entry and synchronous audio activation

Status: accepted (2026-10-15, Issue #18; amends ADR-0002 and ADR-0009).

## Context & Decision

W3C User Activation v2 prohibits audible Web Audio autoplay without an explicit user gesture, and WHATWG §6.4 dictates that passive scrolling (`wheel`/`touchmove`) does not grant transient activation. The previous timer-based auto-unroll (ADR-0002) left audio trapped behind a disconnected toggle button, and the airborne scroll drop from the sky (ADR-0009) undermined the grounded physical reality of the scholar's desk.

We resolved this by placing the closed tapestry resting flat on the desk table under an arcane wax seal. The user must intentionally break the wax seal to begin the experience. Breaking the seal serves as the canonical transient user activation gesture: it synchronously unlocks `AudioContext.resume()` in the immediate call-stack tick before any asynchronous delays, plays the procedural `sealCrack` fracture sound, triggers camera recoil, and smoothly unrolls the tapestry across the desk while fading in the background score (*The Bard's Tale*) at 0.68 master gain (-20%).

## Considered Options

1. **Generic `[ Enter the Realm ]` modal gate**: Rejected as immersion-breaking and conventional.
2. **Auto-unrolling silently with delayed audio on first content interaction**: Rejected because users miss the opening thematic score during the intro unroll, and passive scrolling cannot unlock audio under browser security policies.
3. **Diegetic physical wax seal fracture**: Accepted. Transforms browser-mandated audio gating into an atmospheric ritual grounded in the medieval scholar's world.

## Consequences

- The tapestry cannot unroll passively; the user must break the wax seal to reveal the hero and content pulls.
- Keyboard accessibility and screen readers are preserved via an accessible hidden trigger (`#seal-trigger`) that activates on `Enter`/`Space`.
- Deep technical research and formulas are documented in `docs/research/audio-activation-patterns.md`, `docs/research/3d-arcane-wax-seal-rendering.md`, `docs/research/cinematic-shatter-and-shockwave.md`, and `docs/research/procedural-seal-crack-audio.md`.
