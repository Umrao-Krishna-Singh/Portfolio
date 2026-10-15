# Camera valley: scroll-scrubbed and reversible with one-shot intro dolly

Status: accepted (2026-10-05).

The camera path forms a continuous valley: wide desk view at the page top, pushed-in read framing in the 2D reading column, and wide desk view at the page bottom. The valley is fully reversible and scrubbed by scroll position with frame-rate-independent camera damping ($k = 1 - e^{-dt \cdot 12}$). The intro is an authored one-shot continuous dolly: ~1s wide hold followed by an unbroken descent where the scroll drops with a damped thud and unrolls across the desk.

## Consequences

- **Authoring & Handoff**: The intro uses `camDirect = true` for exact authored timing, transitioning smoothly into the DOM reading hero via a 450ms crossfade at the handoff point (`tapestry:handoff`).
- **Framing**: Top read framing (PUSH) keeps the head rod and cap sigil in frame; bottom read framing (PUSH_END $\to$ WIDE_END) frames the foot and unrolled length.
- **Bake & Compile Gating**: The loader waits for the sheet texture bake and forces `renderer.compile()` on warm-pass geometry before the intro begins, preventing first-frame upload hitches.
- **Exposure Scaling**: Renderer tone mapping exposure scales dynamically (1.12 at PUSH up to 1.38 at WIDE) to ensure the wide desk shot remains luminous and moody without washing out the reading frame.

## Update (2026-10-15, Issue #18: Resting start under wax seal)

The airborne scroll drop from the sky is eliminated (ADR-0017). The closed tapestry begins already resting flat on the scholar's desk table under the arcane wax seal; breaking the seal initiates the authored camera dolly and forward roll unroll.
