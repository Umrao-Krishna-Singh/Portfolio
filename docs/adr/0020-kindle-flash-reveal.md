# Kindle audio control decoupled from page entry and revealed under seam flash

Status: accepted (2026-10-15, Issue #18).

## Context & Decision

In Issue #18, the Kindle button was reconsidered from an ambiguous entry gate / mute hybrid into a dedicated persistent audio toggle. Placing a floating audio toggle on the wide desk view before the tapestry unrolls clutters the visual composition and creates conflicting interactive calls-to-action with the wax seal.

We decided that the Kindle button begins hidden on page load (`hidden = true`). Breaking the arcane wax seal triggers a full-screen warm seam flash flare (`#seam-flash`). Under this momentary peak flare cover, the Kindle button appears instantly (`hidden = false`) without any separate opacity fade-in animation. When kindled, the button pulsates with a breathing living ember glow (`@keyframes kindle-glow`).

## Considered Options

1. **Kindle visible on initial load as the audio gate**: Rejected. Confuses the user between clicking the seal or clicking the kindle button to begin the experience.
2. **Opacity fade-in transition**: Rejected. The full-screen seam flash flare already masks the DOM element's arrival; a redundant fade-in creates visual competition and lag.
3. **Instant unhiding under flash cover**: Accepted. Provides clean diegetic emergence without drawing attention away from the unrolling tapestry.

## Consequences

- The Kindle toggle remains hidden until the user breaks the wax seal.
- Audio mute/unmute control remains accessible at all times after the tapestry unrolls.
- Audio volume is staged at 0.68 master gain (-20% relative to the original 0.85 baseline) to maintain comfortable headroom.
