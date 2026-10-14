# Mandatory scroll-snap on content pulls with thin free-scroll desk zones

Status: accepted (2026-10-14).

Scroll-snap is mandatory on the 2D content pulls (`html { scroll-snap-type: y mandatory }`) to ensure pulls land cleanly. The top and bottom 45svh page edges are free-scroll desk zones where snap is softened (`html.snap-soft { scroll-snap-type: y proximity }`) and scroll position scrubs the 3D camera. When the camera rests stationary inside either desk zone, the 3D scene smoothly parks into Frozen Dwell (ADR-0016).

## Consequences

- **Zone toggle**: Snap mode flips via the `.snap-soft` class dynamically driven by geometry-based scroll calculations.
- **Symmetrical dwell**: Stationary rests at either page top (`scrollY <= 120`) or page bottom (`scrollY >= maxScroll - 120`) activate frozen dwell parking at 60 fps.
- **ScrollTrigger.refresh() banned**: In this stack (compositor-driven CSS snap + ST), `refresh()` measures triggers shifted by current scroll; triggers are destroyed and rebuilt (`rebuildReveals()`) on resize/re-entry. `autoRefreshEvents: "none"` is enforced.
- One decisive wheel gesture crosses between the 45svh desk zones and the mandatory-snap reading column.
