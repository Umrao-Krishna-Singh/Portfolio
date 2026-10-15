# Native hardware signet cursor over DOM elements

Status: accepted (2026-10-15, Issue #18).

## Context & Decision

The desktop scholar's desk environment requires a tactile brass signet hand cursor that stamps down upon interaction to reinforce the physical reality of breaking seals and unfurling parchment.

We chose to implement the signet cursor strictly via native CSS hardware cursors (`cursor: url('data:image/svg+xml...')`, auto) with calibrated multi-DPI hotspots, suppressing it on touch devices via `@media (pointer: coarse), (hover: none)`. We rejected a custom DOM `div` or canvas cursor (`pointermove` + `translate3d`) because DOM cursors run on the JavaScript main thread, adding 16–33ms of input lag behind the physical mouse and incurring compositor repaint penalties on target integrated GPUs (Intel UHD 630, ADR-0010).

## Considered Options

1. **Custom DOM `div` cursor with lerp / spring trailing**: Rejected. Adds noticeable latency behind the hardware pointer and consumes main-thread frame budget during continuous camera dolly and physics simulation.
2. **WebGL-rendered in-canvas pointer**: Rejected. Clamped to canvas bounds, invisible over DOM content pulls, and requires constant draw calls during dwell states (violating ADR-0016).
3. **Native CSS hardware cursor**: Accepted. Runs directly on the OS window server / compositor thread at display refresh rate with 0ms JavaScript latency.

## Consequences

- Cursor interactions have zero frame-rate dependency and zero main-thread overhead.
- Hotspot calibration is fixed in CSS for default (`8 2`), pointer (`10 2`), and active press (`10 4`).
- Touchscreens seamlessly revert to native touch interaction.
- Detailed technical analysis and SVG asset architecture are documented in `docs/research/custom-fantasy-cursor-system.md`.
