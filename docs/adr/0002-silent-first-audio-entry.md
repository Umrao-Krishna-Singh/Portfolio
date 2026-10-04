# Silent-first audio entry (kindle, no gate)

Status: accepted (2026-10-03).

There is no entry gate and no autoplay attempt: the loader auto-dissolves in under 3s and the page starts silent. The only sound control is the floating kindle — a pulsating muted-speaker that starts the background drone, and only the drone. We rejected the blueprint's `[ ENTER THE REALM ]` gate because browsers block audible autoplay until a gesture anyway, so a gate buys nothing and costs every visitor a click. Consequence: all motion and meaning must work with sound off; audio is garnish, never signal.

## Update (2026-10-04, user iterate round 4)

The loader part of this ADR is REVISED (the audio part stands). The loader no longer auto-dissolves on a fixed timer: it dissolves when the 3D scene reports `tapestry:3d-ready` — sheet bake done (capped), every material precompiled, six real render frames rendered, the bloom composer's first pass compiled — and the intro dolly starts one beat after the dissolve, so the one-time GPU compile bill is paid behind the loader, never on screen (user: "only finish the loader once everything is properly ready"; the choppy intro start was exactly that bill). The no-gate principle survives as a BOUND: a 15s fallback drops the loader no matter what, a module-graph error drops it immediately, and the fallback owns the "scene absent" verdict (removes zones, rebuilds triggers, opens reveals) — a slow CDN must keep its desk bands, so no timed zone-removal runs before the fallback (verified failure: zones deleted at 3.5s while three.js was still fetching). The warmup itself is bounded at 1.6s if rAF is suspended (occluded/background tab), because a loader must never hang on a frame the compositor refuses to produce.
