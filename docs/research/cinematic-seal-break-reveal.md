# Cinematic Seal-Break & Light Flood Architecture (Three.js r160)

Technical reference for the cinematic climax of breaking the Arcane Wax Seal on the scholar's desk: physical fracture vs. radial dissolve, screen-space light flood, camera trauma recoil, compositor shockwaves, and instant Kindle arrival under seam-flash cover. Operates under [ADR-0010](file:///d:/learn/projects/new%20portfolio/docs/adr/0010-post-processing-perf-budget.md) (zero runtime shader recompilations) and [ADR-0016](file:///d:/learn/projects/new%20portfolio/docs/adr/0016-frozen-dwell-compositing.md) (iGPU fill-rate budget).

---

## 1. Cinematic Grammar of the Seal Break

In cinematic game design (Sakurai hit-stop, INSIDE light reveals, Vlambeer screen shake), high-impact events fail when executed as single-scale, unpaced events. A convincing seal break requires a choreographed multi-beat sequence:

```
t = 0.00s   Hit-stop / crack ignition: seal emissive spike, world pauses ~100ms, audio ducks
t = 0.10s   Rupture: fracture snap audio, physical shard burst or radial dissolve wavefront
t = 0.12s   Nova seam-flash: full-screen exposure spike; Kindle toggle unhides under flare cover
t = 0.15s   Radial compositor shockwave expands; camera executes damped trauma recoil
t = 0.35s   Flash decays; exposure adapts down exponentially; tapestry unroll begins
t = 1.60s   Background music (The Bard's Tale) completes smooth fade-in; desk settles
```

---

## 2. Seal Demolition: Shatter vs. Dissolve

Two architectural treatments are available for the seal's destruction:

### Option A: Physical Low-Poly Shard Ballistics (Default)
- **Mechanism**: 16 low-poly wax shards pre-allocated in a single `THREE.InstancedMesh` with flat typed arrays (`Float32Array` positions, velocities, angular spins).
- **Physics**: Ballistic parabolic arc ($y(t) = y_0 + v_y t - \frac{1}{2} g t^2$) with ground bounce damping against the desk plane ($y = 0.38$).
- **Performance**: Zero heap allocations in rAF loop; 1 draw call for all 16 shards.

### Option B: Radial Wavefront Dissolve
- **Mechanism**: Seal geometry dissolves radially outward via noise-thresholded discard or alpha-cutoff in vertex/fragment shader.
- **Wavefront Mask Formula**:
  $$\text{front}(t) = v \cdot (t - t_0), \qquad g(\mathbf{p}, t) = \text{smoothstep}(\text{front}(t), \text{front}(t) - w, \lVert \mathbf{p} - \mathbf{p}_{\text{seal}} \rVert)$$
  where $v \approx 6.0\text{ m/s}$ and band width $w \approx 0.6\text{ m}$.
- **Trade-off**: Dissolve requires alpha test / discard which can disrupt early-Z on mobile GPUs; instanced shards rely on standard opaque/pre-depth rendering.

---

## 3. Screen-Space Light Flood & Seam-Flash Masking

### 3.1 Masking the Kindle Toggle Entrance ([ADR-0020](file:///d:/learn/projects/new%20portfolio/docs/adr/0020-kindle-flash-reveal.md))
To eliminate visual competition and avoid a sluggish opacity transition, `#kindle` is unhidden instantly (`hidden = false`) at the peak opacity tick ($t \approx 120\text{ms}$) of `#seam-flash`. The blinding warm flare acts as an organic optical cut:
- Attack: 40ms power4.in to `opacity: 0.95`.
- Unhide: `kindle.hidden = false` synchronously in flash onComplete callback.
- Decay: 280ms power2.out back to `opacity: 0`.

### 3.2 Compositor Shockwave Ring
A circular shockwave expands across the viewport via GPU compositor properties only:
```css
#seal-shockwave {
  position: fixed;
  inset: 0;
  pointer-events: none;
  border-radius: 50%;
  border: 2px solid rgba(255, 179, 71, 0.85);
  box-shadow: 0 0 24px rgba(255, 154, 42, 0.6);
  transform: scale(0.1);
  opacity: 0;
  will-change: transform, opacity;
}
#seal-shockwave.trigger {
  animation: shockwave-expand 0.65s cubic-bezier(0.1, 0.9, 0.2, 1) forwards;
}
@keyframes shockwave-expand {
  0% { transform: scale(0.1); opacity: 1; }
  100% { transform: scale(3.2); opacity: 0; }
}
```
*Zero repaint tax*: Never animate `width`, `height`, or software blur filters during the shockwave.

---

## 4. Camera Trauma Recoil Math

Camera impact feedback is modeled as a damped harmonic oscillator (or Eiserloh trauma shake), perturbing camera pitch and elevation without desynchronizing the upcoming unroll dolly:

$$\text{decay}(t) = e^{-\zeta \omega_n t}, \qquad \text{osc}(t) = \cos(\omega_d t)$$
$$\Delta y(t) = A_y \cdot \text{decay}(t) \cdot \text{osc}(t), \qquad \Delta \theta(t) = A_\theta \cdot \text{decay}(t) \cdot \text{osc}(t)$$

Calibrated parameters for scholar's desk scale:
- Damping ratio $\zeta = 0.58$ (slightly underdamped; produces 2 perceptible oscillations then settles).
- Natural frequency $\omega_n = 26.0\text{ rad/s}$ ($\omega_d = 21.18\text{ rad/s}$).
- Linear amplitude $A_y = 0.085\text{ m}$, angular pitch amplitude $A_\theta = -0.045\text{ rad}$.
- Settle window: Total recoil duration is $\sim 320\text{ms}$, seamlessly blending into the unroll tracking camera move.

---

## 5. Performance Budget Integrity

1. **Zero Runtime Shader Recompilation ([ADR-0010](file:///d:/learn/projects/new%20portfolio/docs/adr/0010-post-processing-perf-budget.md))**: Custom uniforms (`uPulse`, `uFlare`) must be bound in `onBeforeCompile` with a static `customProgramCacheKey`. Materials must be precompiled behind the loader via `renderer.compile()`.
2. **Zero GC in rAF**: Shard instancing, matrix compositions, and camera perturbations must write into pre-allocated scratch objects (`_scratchMat`, `_scratchPos`, `_scratchQuat`).
3. **Compositor Isolation**: All full-screen overlay elements (`#warmth`, `#seam-flash`, `#seal-shockwave`) must live on promoted hardware layers (`will-change: transform, opacity`) to prevent CPU Skia raster invalidation.
