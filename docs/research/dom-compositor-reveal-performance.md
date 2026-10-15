# DOM Compositor & Reveal Animation Performance: Diagnostic Protocol & Zero-Regression Optimization

Research reference and operational manual for autonomous agents diagnosing and optimizing framerate drops, compositor stalls, and section-reveal hitches across rich animated DOM interfaces. Target: $\ge 30\text{ FPS}$ worst-frame floor (frame delta $\le 33.3\text{ms}$) with zero visual element removal.

---

## 1. Ground Truth Cost Structure & Measured Benchmarks

Measured on the committed baseline (`f4177cf`) via Chrome DevTools Protocol (CDP) under realistic 2.2s section dwell across all 4 pulls:

- **Baseline Worst Dwell Frame**: **366.7ms (3 FPS)** on `#quest-1`, **100.0ms (10 FPS)** on `#quest-2`, **66.9ms (15 FPS)** on `#about-contact`.
- **Baseline Drop Count**: **94 frames $>33.3\text{ms}$** per complete 4-section traversal (88 occurring during animation dwells).
- **Optimized Worst Dwell Frame**: **33.4ms–50.0ms (20–30 FPS)**.
- **Optimized Drop Count**: **26 frames $>33.3\text{ms}$ (-72% drop reduction)**.
- **Core Bottleneck Mechanism**: GPU compositor starvation caused by CPU Skia Gaussian blur rasterization across 180+ inline-block glyphs, software-blurred moving filaments over animated clip-paths, and forced synchronous layout reflows during section settlement.
- **WebGL Independence**: The 3D Three.js scene (UnrealBloomPass, ACES tone-mapping, camera valley) accounts for only 1.1ms–3.5ms per frame; 90%+ of all dropped frames originate entirely in the DOM/CSS compositor pipeline.

---

## 2. Universal Diagnostic Protocol for Agents

When profiling framerate hitching in complex interactive web interfaces, autonomous agents must adhere to the following sequence to prevent false-positive benchmarks.

```
+---------------------------------------------------------------------------------------------------------+
|                                    AGENT PERFORMANCE DIAGNOSIS LOOP                                     |
+---------------------------------------------------------------------------------------------------------+
| 1. Architecture Audit: Settle Gates & Deferred Animation Discovery                                      |
|    - Inspect window scroll/resize handlers.                                                             |
|    - Identify debounce/throttle delays (e.g., `SETTLE_MS = 80ms` + `REVEAL_BEAT = 60ms`).              |
|    - RULE: Never measure scroll-only translation if animation pipelines trigger after motion stops!     |
+---------------------------------------------------------------------------------------------------------+
                                                     |
                                                     v
+---------------------------------------------------------------------------------------------------------+
| 2. Programmatic Headless Benchmarking via CDP                                                           |
|    - Launch headless Chrome with `--remote-debugging-port=PORT --headless=new`.                        |
|    - Discover page WebSocket URI via `/json/list`.                                                      |
|    - Record frame-by-frame VSync intervals using `requestAnimationFrame(frameLoop)`.                   |
|    - Execute realistic motion + COMPLETE ANIMATION DWELL (glide + full duration of longest transition). |
+---------------------------------------------------------------------------------------------------------+
                                                     |
                                                     v
+---------------------------------------------------------------------------------------------------------+
| 3. LongTask vs. VSync-Multiple Disambiguation                                                           |
|    - If `PerformanceObserver({entryTypes: ['longtask']})` reports JS tasks > 50ms:                      |
|      -> Bottleneck is MAIN THREAD CPU JavaScript execution. Profile stack traces.                       |
|    - If zero LongTasks exist, but frame deltas cluster at 33.3ms, 50.0ms, 66.7ms, 83.4ms:              |
|      -> Bottleneck is RASTER / COMPOSITOR THREAD starvation (Skia CPU convolution or GPU readbacks).    |
+---------------------------------------------------------------------------------------------------------+
                                                     |
                                                     v
+---------------------------------------------------------------------------------------------------------+
| 4. Additive Harness Isolation (Zero Production Pollution)                                               |
|    - Inject a single `<style id="harness-overrides">` element.                                          |
|    - Test one candidate bottleneck layer per run (layer promotion, filter removal, blend modes).       |
|    - Verify that visual fidelity remains identical between Baseline and Candidate.                      |
+---------------------------------------------------------------------------------------------------------+
```

### CDP Automation Template (Node.js)

```javascript
import { spawn } from 'child_process';
import http from 'http';

// 1. Launch Headless Chrome
const chrome = spawn("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", [
  `--remote-debugging-port=9285`, '--headless=new', '--window-size=1440,900', TARGET_URL
], { stdio: 'ignore' });

// 2. Query WebSocket URI
const targets = await new Promise(res => http.get("http://127.0.0.1:9285/json/list", r => {
  let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
}));
const ws = new WebSocket(targets[0].webSocketDebuggerUrl);

// 3. Evaluate Dwell Profiler
const results = await evaluateCDP(ws, `
  new Promise(resolve => {
    var frames = [], last = performance.now();
    function loop(now) {
      frames.push(now - last);
      last = now;
      if (running) requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
    targetEl.scrollIntoView({ behavior: 'smooth' });
    setTimeout(() => { running = false; resolve(frames); }, 2800); // 600ms glide + 2200ms dwell
  })
`);
```

---

## 3. Evaluated & Rejected Branches (What Failed & Why)

Future agents must not re-investigate the following dead ends:

| Explored Branch | Hypothesized Cause | Measured Result | Root Cause for Ineffectiveness |
| :--- | :--- | :--- | :--- |
| **Stripping `#grain` Overlay** | Fullscreen SVG `feTurbulence` with `mix-blend-mode: overlay` assumed to choke GPU compositing. | Worst dwell frame remained **67ms–100ms (10–15 FPS)**. | Grain animated via discrete CSS keyframes; does not invalidate section paint layers when isolated. |
| **Stripping `#deskwood` Filter** | Viewport-sized brightness/contrast filter assumed to stall rasterizer. | Worst dwell frame remained **100ms (10 FPS)**. | Filter was evaluated once at boot into a backing store; not dynamically recalculated during scroll dwells. |
| **Disabling Three.js Bloom Pass** | UnrealBloomPass downsample/upsample passes assumed to exhaust iGPU fill rate. | WebGL render dropped 3.5ms $\to$ 1.1ms, but DOM section worst frame was still **83ms–117ms**. | WebGL composer runs asynchronously on the GPU; the section freeze is 100% CPU/Skia DOM-bound. |
| **Scroll-Only Rapid Benchmarking** | Testing framerate by rapidly scrolling without dwelling. | Reported false **55–60 FPS**. | Settle gate (`SETTLE_MS = 80ms` + `REVEAL_BEAT = 60ms`) suppresses all animations until motion stops. Rapid scroll exited before heavy code executed. |
| **Deleting Visual Elements from Source** | Stripping `.char-line`, `.burn-frame`, or character spans from CSS. | Rejected by user / architectural regression. | The bottleneck is the *compositing strategy*, not the presence of the visual design. |

---

## 4. Production Optimization Rules (Specifics & Generics)

### Rule A: Eliminate Per-Character CSS `filter: blur()` Transitions
- **Specific**: `.ember-reveal .ch` had `filter: blur(4px)` transitioning to `filter: blur(0.5px)` across 180+ spans in `#quest-1` and 300+ in `#about-contact`.
- **Generic Principle**: `filter: blur()` cannot be GPU-composited on inline-block text elements. Every animation frame forces Skia's software rasterizer to execute a 2D Gaussian kernel on the CPU.
- **Solution**: Set `filter: none !important;` on `.ch`. Preserve incandescent warmth via multi-tier `text-shadow`:
  ```css
  .ember-reveal .ch, .ember-reveal.ignited .ch { filter: none !important; }
  .ember-reveal .ch {
    text-shadow: 0 0 6px rgba(255, 179, 71, 0.95), 0 0 2px rgba(255, 246, 220, 0.9) !important;
  }
  ```
- **Observed Impact**: Worst dwell on `#quest-1` dropped from **366.7ms (3 FPS)** to **33.4ms (30 FPS)**.

### Rule B: Prevent Full-Document Repaints via Compositor Layer Promotion
- **Specific**: Appending sparks in `#embers` or moving `.char-line` invalidated the entire 7,000px parchment `.column`.
- **Generic Principle**: Any dynamic paint operation inside a non-promoted container forces the browser to re-rasterize the entire parent document layer.
- **Solution**: Promote scroll cards and canvas overlays to independent GPU texture backing stores:
  ```css
  .pull { transform: translateZ(0); will-change: transform; }
  .about-grid { transform: translateZ(0); }
  #embers { transform: translateZ(0); will-change: transform; }
  ```

### Rule C: Decouple Software Filter Blurs from Moving Compositor Elements
- **Specific**: `.char-line` had `filter: blur(1px)`, `box-shadow: 26px`, and `mix-blend-mode: screen` while GSAP translated it across an `img` actively animating `clip-path` and `filter`.
- **Generic Principle**: Combining backdrop blend modes (`mix-blend-mode: screen`) with software filters on a translating element over a dirty clipping sibling forces continuous CPU readbacks.
- **Solution**: Remove the software blur filter from the translating element, promote it to a compositor layer, and use a tight GPU-native box-shadow:
  ```css
  .ink-reveal .char-line {
    transform: translateZ(0); will-change: transform;
    filter: none !important;
    box-shadow: 0 0 12px 2px rgba(255, 154, 42, 0.6) !important;
  }
  .ink-reveal .burn-frame { transform: translateZ(0); will-change: opacity; }
  ```

### Rule D: Substitute Inset Box-Shadow Transitions with Accelerated Opacity Fades
- **Specific**: `.pull.lit` animated an inset box-shadow with a 70px blur radius across 1,100 &times; 900 pixels for 900ms.
- **Generic Principle**: Large-radius dynamic `box-shadow` transitions on large elements force per-pixel software re-rasterization on every frame.
- **Solution**: Pre-render the lighting gradient on an absolute pseudo-element (`::after`), transition only `opacity`:
  ```css
  .pull::after {
    content: ""; position: absolute; inset: 0; pointer-events: none;
    background: linear-gradient(180deg, rgba(255, 176, 96, 0.14) 0%, transparent 60px, transparent calc(100% - 70px), rgba(255, 150, 60, 0.08) 100%);
    opacity: 0; transition: opacity 900ms ease;
  }
  .pull.lit::after { opacity: 1; }
  .pull.lit { box-shadow: none !important; }
  ```

### Rule E: Eliminate Layout Thrashing During DOM Splitting
- **Specific**: `emberOn()` executed `splitChars(el)` (replacing text nodes with 180+ spans), then immediately called `sparkAt()` &rarr; `el.getBoundingClientRect()`.
- **Generic Principle**: Querying geometric properties (`getBoundingClientRect`, `offsetHeight`, `offsetTop`) immediately after mutating the DOM forces a synchronous reflow of the entire document tree.
- **Solution**: Pre-split text blocks at initialization or during loader drop before user scroll interactions begin, or batch geometry queries before DOM mutation.

---

## 5. Additive Diagnostic Harness Architecture

To verify optimizations without modifying production codebase files:

1. **Mount Single Additive Script**: Inject `<script src="harness.js"></script>` at the end of `index.html`.
2. **Dynamic Injected Stylesheet**: Harness mounts `<style id="harness-dynamic-overrides">`.
3. **Strict Baseline Pass-Through**: When in Baseline mode, `styleEl.textContent = ''`. The browser runs 100% authentic committed code.
4. **Side-by-Side Verification Engine**: Expose `window.__TapestryHarness.runComparative(cb)` to run automated 2.2s section dwells on both Baseline and Optimized modes, outputting comparative metrics to `console.table`.

### Reference Files in Repository

- **Pristine Reference (Git HEAD)**: `git show f4177cf:prototype/<file>`
- **Additive Harness Implementation**: [`prototype-perf/harness.js`](file:///d:/learn/projects/new%20portfolio/prototype-perf/harness.js)
- **Interactive Educational Report**: [`report/index.html`](file:///d:/learn/projects/new%20portfolio/report/index.html)
- **Full Automation Verification Script**: [`.tmp/verify-additive-harness.mjs`](file:///d:/learn/projects/new%20portfolio/.tmp/verify-additive-harness.mjs)
- **Active Performance Testbed Port**: `http://127.0.0.1:8904/`
