/* 3D desk scene — premium pass (ADRs 0007-0010, 0012).
   three.js 0.160.0 pinned (MIT). Stylized-cinematic: ACES tone mapping,
   bloom + output pass (degrades to plain render if addons fail), GLSL flame
   shaders, content-bearing parchment sheet from the ONE shared parchment
   generator (parchment.js, ADR-0008).
   Camera valley (ADR-0009): page top = WIDE desk, read framing at the zone
   edge, end = WIDE again. Scrubbed by scroll inside thin desk zones (ADR-0012),
   fully reversible. Intro = ONE unbroken dolly; the roll drops with a heavy
   damped settle (bounce banned) and unrolls during the move. Click skips.
   NO quality watchdog (owner 2026-10-13): one fixed quality all session.
   Skips: reduced-motion, mobile UA (ADR-0015), no gsap, no WebGL (DOM stands alone). */
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
window.THREE = THREE;

(function () {
  var T = new Proxy({}, {
    get: function (_, prop) {
      return window.Tapestry ? window.Tapestry[prop] : undefined;
    }
  });
  var holder = document.getElementById("gl");
  var canvas = document.getElementById("gl-canvas");
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  /* Device choice per ADR-0015: the UA ALONE decides — userAgentData first
     (what the browser's request-desktop toggle actually flips), UA-string
     fallback. NEVER viewport width: a desktop window keeps the 3D scene at
     any width, and a phone switches versions via the browser toggle. */
  function mobileUA() {
    var d = navigator.userAgentData;
    if (d && typeof d.mobile === "boolean") return d.mobile;
    return /Mobi|iPhone|iPod|IEMobile|BlackBerry|Opera Mini/i.test(navigator.userAgent || "");
  }
  /* If app.js's bounded fallback already gave up on us (slow CDN: the
     zones were removed and the page revealed standalone), do not resurrect
     the 3D over it — the standalone page IS the delivered experience. */
  var zoneTopEarly = document.getElementById("zone-top");
  if (reduced || mobileUA() || !window.gsap || !zoneTopEarly || !zoneTopEarly.isConnected) {
    teardown();
  } else {
    /* A boot crash must degrade to "no 3D" (zones removed, DOM standalone),
       never to a page with dead scroll zones and no scene. */
    try { boot(); } catch (e) {
      if (window.console && console.error) console.error("[tapestry3d] boot failed:", e);
      teardown();
    }
  }

  /* Once dead, everything inside boot() stands down: the frame loop
     stops (no GPU burn on a detached canvas), the zone listener never
     claims, and a late handoff cannot yank the standalone page. */
  var dead = false;
  function teardown() {
    dead = true;
    if (holder) holder.remove();
    document.querySelectorAll(".desk-zone").forEach(function (z) { z.remove(); });
    /* CSS keys the non-3D presentation (candles, zone hiding, proximity
       snap) off this class instead of a width breakpoint — the experience
       choice is UA-driven (ADR-0015), the layout stays viewport-driven. */
    document.documentElement.classList.add("no-3d");
    document.documentElement.classList.add("intro-done");
    /* Never leave the page locked if the scene dies mid-intro (context
       lost, boot crash): restore scrolling + snap so the DOM page stands
       alone (critic P1). */
    document.body.style.overflow = "";
    document.documentElement.classList.remove("no-snap");
    var col = document.querySelector(".column");
    if (col) col.style.opacity = "";
    /* Tell app.js the loader may dissolve now — the gated loader must
       never wait on a scene that will never report ready. */
    try {
      window.__TAPESTRY_NO_3D = true;
      window.dispatchEvent(new Event("tapestry:no-3d"));
    } catch (e) {}
  }

  function boot() {
  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: "high-performance" });
  } catch (e) { teardown(); return; }
  canvas.addEventListener("webglcontextlost", function (e) {
    e.preventDefault();
    teardown();
  });
  var nativeDpr = Math.min(window.devicePixelRatio || 1, 1.5);
  /* Motion DPR: during rapid camera dolly and unroll motion, rendering at
     0.82 scale provides a noticeable ~33% reduction in GPU fill-rate.
     Full native DPR is restored upon handoff when stationary. */
  var introDpr = Math.min(nativeDpr, 0.82);
  renderer.setPixelRatio(introDpr);
  renderer.setSize(window.innerWidth, window.innerHeight);
  /* NO shadow map at all (owner 2026-10-13: "remove the candle shadow
     from the left candle entirely, I don't want it") — and the left
     candle's spot was the only shadow-casting light, so this disables
     the whole shadow system from the first frame: no depth pass, no
     shadow sampling in any material, no mid-session state. */
  renderer.shadowMap.enabled = false;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;

  var NIGHT = 0x14100B;
  var scene = new THREE.Scene();
  window.__T3D_SCENE = scene;
  scene.background = new THREE.Color(NIGHT);
  /* Warm exponential fog: the far desk fades into candlelit air instead of
     a black hole (background-darkness fix; research Finding 5). */
  scene.fog = new THREE.FogExp2(0x1a120a, 0.022);

  var camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 100);
  /* Valley poses: WIDE reads the desk from ~45° above (user iterate: was
     ~14° frontal — too flat; a hint of tilt keeps the roll drop legible),
     PUSH stays the near-top-down read framing, so the dolly is mostly a
     shortening dive instead of a swing. */
  var WIDE = { p: [-0.85, 8.6, 6.9], l: [0, 0.9, -0.55] };
  /* Read framing rides toward the sheet's HEAD: the top rod and the
     baked cap stay in frame to the last beat of the dolly (user: "the
     scroll must not become just paper once the intro is done" — the old
     look sat so close both rods were cropped out). */
  var PUSH = { p: [0, 6.6, 0.4], l: [0, 0, -2.0] };
  /* Bottom-zone poses: the layer fades in already reading the sheet's
     FOOT (bottom rod + fin slice), then the pullback widens until BOTH
     rods fit the frame (user). */
  var PUSH_END = { p: [0, 6.8, 3.6], l: [0, 0, 2.3] };
  var WIDE_END = { p: [-0.85, 9.5, 8.1], l: [0, 0.2, 0.7] };
  /* Issue #18 rework (owner): the desk opens CINEMATICALLY — a slow push-in
     to the seal's close-up (OPEN legible, the ember pulse readable), and on
     break the camera pulls back OUT to WIDE before the burst plays. Kept as
     its own pose rather than a valley stop: it never participates in the
     scroll scrub. */
  var SEAL_CLOSE = { p: [0.42, 2.5, -2.55], l: [0, 0.72, -4.34] };
  var look = new THREE.Vector3().fromArray(WIDE.l);
  camera.position.fromArray(WIDE.p);
  camera.lookAt(look);
  function fitPUSH() {
    /* Pulled back on narrow aspects so the sheet keeps its margins. */
    var aspect = window.innerWidth / Math.max(1, window.innerHeight);
    var lift = Math.max(0, 1.55 - aspect) * 3.4;
    PUSH.p[1] = 6.6 + lift;
    PUSH_END.p[1] = 6.8 + lift;
  }
  fitPUSH();

  /* ---------- Post: RenderPass -> UnrealBloom -> OutputPass ----------
     Addons come from the pinned jsdelivr package; any failure keeps the
     plain renderer (no bloom, same scene). OutputPass applies ACES + sRGB
     when compositing; without it the renderer tone-maps directly. */
  var composer = null, bloomPass = null, grainPass = null, composerReady = false;

  /* Stage 1: Film grain inside WebGL composer removes the mix-blend-mode overlay tax */
  function makeGrainPass(ShaderPass) {
    var c = document.createElement("canvas");
    c.width = 240; c.height = 240;
    var ctx = c.getContext("2d");
    var img = ctx.createImageData(240, 240);
    var d = img.data;
    function lattice(cx, cy) {
      var s = Math.sin(cx * 127.1 + cy * 311.7) * 43758.5453;
      return s - Math.floor(s);
    }
    function vnoise(u, v, cells) {
      var x = u * cells, y = v * cells;
      var x0 = Math.floor(x), y0 = Math.floor(y);
      var fx = x - x0, fy = y - y0;
      fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
      var c0 = lattice(x0 % cells, y0 % cells);
      var c1 = lattice((x0 + 1) % cells, y0 % cells);
      var c2 = lattice(x0 % cells, (y0 + 1) % cells);
      var c3 = lattice((x0 + 1) % cells, (y0 + 1) % cells);
      return c0 + (c1 - c0) * fx + (c2 - c0) * fy + (c0 - c1 - c2 + c3) * fx * fy;
    }
    for (var y = 0; y < 240; y++) {
      for (var x = 0; x < 240; x++) {
        var h = vnoise(x / 240, y / 240, 200) * 0.62 + vnoise(x / 240, y / 240, 100) * 0.38;
        var val = Math.floor(Math.min(255, Math.max(0, h * 255)));
        var idx = (y * 240 + x) * 4;
        d[idx] = val;
        d[idx + 1] = val;
        d[idx + 2] = val;
        d[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    var grainTex = new THREE.CanvasTexture(c);
    grainTex.wrapS = grainTex.wrapT = THREE.RepeatWrapping;

    return new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        uGrain: { value: grainTex },
        uShift: { value: new THREE.Vector2(0, 0) },
        uOpacity: { value: 0.10 },
        uVignette: { value: 0.30 }
      },
      vertexShader: [
        "varying vec2 vUv;",
        "void main() {",
        "  vUv = uv;",
        "  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);",
        "}"
      ].join("\n"),
      fragmentShader: [
        "uniform sampler2D tDiffuse;",
        "uniform sampler2D uGrain;",
        "uniform vec2 uShift;",
        "uniform float uOpacity;",
        "uniform float uVignette;",
        "varying vec2 vUv;",
        "vec3 overlayBlend(vec3 b, vec3 s) {",
        "  return mix(2.0 * b * s, 1.0 - 2.0 * (1.0 - b) * (1.0 - s), step(0.5, b));",
        "}",
        "void main() {",
        "  vec4 base = texture2D(tDiffuse, vUv);",
        "  vec2 grainCoord = (gl_FragCoord.xy + uShift) / vec2(240.0, 240.0);",
        "  vec4 grain = texture2D(uGrain, grainCoord);",
        "  vec2 vq = vUv - vec2(0.5);",
        "  float vig = 1.0 - uVignette * dot(vq, vq) * 1.9;",
        "  vec3 blended = overlayBlend(base.rgb, grain.rgb) * vig;",
        "  gl_FragColor = vec4(mix(base.rgb, blended, uOpacity), base.a);",
        "}"
      ].join("\n")
    });
  }

  try {
    composer = new EffectComposer(renderer);
    if (typeof composer.setPixelRatio === "function") {
      composer.setPixelRatio(renderer.getPixelRatio());
    }
    composer.addPass(new RenderPass(scene, camera));
    bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight), 0.25, 0.4, 1.5);
    composer.addPass(bloomPass);
    composer.addPass(new OutputPass());
    if (typeof ShaderPass !== "undefined") sealFxBuildNovaCompose(ShaderPass);
    composer.setSize(window.innerWidth, window.innerHeight);
    bloomPass.setSize(
      Math.max(2, Math.round(window.innerWidth * 0.5)),
      Math.max(2, Math.round(window.innerHeight * 0.5)));
    warmHidden(true);
    composer.render();
    warmHidden(false);
    composerReady = true;
  } catch (e) {
    if (window.console && console.warn) console.warn("[tapestry3d] composer init fallback:", e);
    composer = null;
    composerReady = true;
  }

  /* Show/hide the not-yet-unrolled sheet parts for warm passes. The 1px
     sliver renders only behind the opaque loader. */
  function warmHidden(show) {
    if (show) {
      if (plane) plane.visible = true;
      if (topDowel) topDowel.visible = true;
    } else {
      if (plane) plane.visible = open > 0.01;
      if (topDowel) topDowel.visible = true;
    }
  }

  /* ---------- Lights: pooled candlelight in a readable room ----------
     Night air gets DIRECTION, not a flat wash (research Finding 5): a
     hemisphere sky/ground pair replaces the ambient, the hearth lift is
     given a visible ember-bed source on the far desk, and the cool window
     key rims the desk's left edge. r160: hemisphere/ambient/directional
     are plain multipliers; point/spot are candela. */
  var hemiLight = new THREE.HemisphereLight(0x36435c, 0x1d1409, 0.42);
  scene.add(hemiLight);
  var wall = new THREE.Mesh(
    new THREE.PlaneGeometry(70, 30),
    new THREE.MeshStandardMaterial({ color: 0x392b1a, roughness: 1 })
  );
  wall.position.set(0, 6, -18);
  scene.add(wall);
  /* Window on the wall: flat glow planes only (the key light does the
     lighting). At the approved 45° down-look the wall sits above the top
     of frame — these are staged for a possible higher look (user iterate),
     and the cool KEY light is what actually reads in the wide shot. */
  var windowGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(4.6, 6.2),
    new THREE.MeshBasicMaterial({ color: 0x3c4c6e })
  );
  windowGlow.position.set(-5.6, 7.4, -17.9);
  scene.add(windowGlow);
  var windowCore = new THREE.Mesh(
    new THREE.PlaneGeometry(3.2, 5.0),
    new THREE.MeshBasicMaterial({ color: 0x5d729e })
  );
  windowCore.position.set(-5.6, 7.4, -17.85);
  scene.add(windowCore);
  /* Chair-back silhouette behind the desk: room depth at near-zero cost. */
  var chairMat = new THREE.MeshStandardMaterial({ color: 0x1b1309, roughness: 1 });
  var chairBack = new THREE.Mesh(new THREE.BoxGeometry(5.2, 5.4, 0.5), chairMat);
  chairBack.position.set(0.4, 2.7, -8.2);
  scene.add(chairBack);
  var chairStiles = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.1, 0.62), chairMat);
  chairStiles.position.set(0.4, 4.6, -8.15);
  scene.add(chairStiles);
  /* Faint hearth glow so the back of the desk and the resting roll keep
     form in the wide hold — and it now has a SOURCE (user: the old lift
     read as "some light in the background"): an ember bed glowing on the
     far desk with a low warm light pooled over it. */
  var hearthTex = (function () {
    var c = document.createElement("canvas");
    c.width = 256; c.height = 128;
    var g = c.getContext("2d");
    var rg = g.createRadialGradient(128, 128, 8, 128, 128, 120);
    rg.addColorStop(0, "rgba(255,158,74,0.85)");
    rg.addColorStop(0.35, "rgba(214,110,44,0.38)");
    rg.addColorStop(1, "rgba(120,52,18,0)");
    g.fillStyle = rg;
    g.save();
    g.translate(128, 128);
    g.scale(1, 0.5);
    g.translate(-128, -128);
    g.fillRect(0, 0, 256, 256);
    g.restore();
    return new THREE.CanvasTexture(c);
  })();
  var hearthBed = new THREE.Mesh(
    new THREE.PlaneGeometry(12, 5.6),
    new THREE.MeshBasicMaterial({
      map: hearthTex, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, opacity: 0.6
    })
  );
  hearthBed.rotation.x = -Math.PI / 2;
  hearthBed.position.set(1.0, 0.02, -9.5);
  scene.add(hearthBed);
  var back = new THREE.PointLight(0xff9d5c, 26, 26, 2);
  back.position.set(0.8, 2.0, -9.0);
  scene.add(back);
  /* Cool window key: no shadows (only the candle spot casts); it rims
     the desk's left edge and lifts the room out of the void. */
  /* Cool window key: faint — strong enough to lift the room's left side
     out of the void, too strong and the wood reads blue (verified frame). */
  var keyLight = new THREE.DirectionalLight(0x9db0cc, 0.85);
  keyLight.position.set(-7, 10, -3);
  keyLight.target.position.set(0.5, 0.8, 0);
  scene.add(keyLight.target);
  scene.add(keyLight);
  /* Candle light, two roles (research Finding 3): a wide soft pool from
     the wick DOWN at the desk around that candle's own base — the old
     narrow spot aimed ~3 units away, so the bright patch read as detached
     background light — plus a small point light at the flame that wraps
     the wax body itself. Candela units, decay 2 (r160). */
  var flameLight = new THREE.SpotLight(0xffbe7a, 26, 30, 1.0, 0.85, 2);
  /* castShadow intentionally never set (owner 2026-10-13: the left
     candle's shadow is unwanted; see the shadowMap note at boot). */
  flameLight.target.position.set(-4.5, 0, -1.0);
  scene.add(flameLight.target);
  scene.add(flameLight);
  var flameLight2 = new THREE.SpotLight(0xffbe7a, 21, 30, 1.0, 0.85, 2);
  flameLight2.target.position.set(4.5, 0, -0.8);
  scene.add(flameLight2.target);
  scene.add(flameLight2);
  var bodyLight = new THREE.PointLight(0xffb066, 9, 7, 2);
  scene.add(bodyLight);
  var bodyLight2 = new THREE.PointLight(0xffb066, 7, 6, 2);
  scene.add(bodyLight2);

  /* ---------- Textures: CC0 PBR (ambientCG Wood051, CC0 1.0) with flat
     fallback if the files are missing. ---------- */
  var PBR = {
    wood: {
      color: "/assets/textures/pbr/wood-wood051/Wood051_color_1K.jpg",
      normal: "/assets/textures/pbr/wood-wood051/Wood051_normal_gl_1K.jpg",
      roughness: "/assets/textures/pbr/wood-wood051/Wood051_roughness_1K.jpg"
    }
  };
  var loader = new THREE.TextureLoader();
  function tex(url, rx, ry) {
    var t = loader.load(url);
    t.colorSpace = THREE.SRGBColorSpace;
    if (rx) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry || rx); }
    return t;
  }
  function dataTex(url) {
    var t = loader.load(url);
    t.colorSpace = THREE.NoColorSpaceColorSpace || THREE.LinearSRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }
  var woodMap = tex((PBR && PBR.wood && PBR.wood.color) || "/assets/textures/wood051-color.jpg", 2, 2);
  var woodNormal = (PBR && PBR.wood && PBR.wood.normal) ? dataTex(PBR.wood.normal) : null;
  var woodRough = (PBR && PBR.wood && PBR.wood.roughness) ? dataTex(PBR.wood.roughness) : null;
  var tableMat = new THREE.MeshStandardMaterial({ map: woodMap, color: PBR ? 0xa8845c : 0x96754d, roughness: 0.82 });
  if (woodNormal) {
    tableMat.normalMap = woodNormal;
    tableMat.normalScale = new THREE.Vector2(0.35, 0.35);
  }
  if (woodRough) {
    tableMat.roughnessMap = woodRough;
  }
  [woodMap, woodNormal, woodRough].forEach(function (t) {
    if (t && t.anisotropy !== undefined) t.anisotropy = 8;
  });

  /* ---------- Table ---------- */
  var table = new THREE.Mesh(new THREE.PlaneGeometry(46, 30), tableMat);
  table.rotation.x = -Math.PI / 2;
  table.receiveShadow = true;
  scene.add(table);

  /* ---------- The sheet: content-bearing, from the shared generator ----- */
  var TW = 6.4, TH = 8.8, TOPZ = -4.4;
  var planeMat = new THREE.MeshStandardMaterial({ color: 0xf5ecd7, roughness: 0.92 });
  var planeGeo = new THREE.PlaneGeometry(TW, TH, 4, 28);
  planeGeo.translate(0, -TH / 2, 0);
  var base = planeGeo.attributes.position.array.slice();
  var drapeCount = planeGeo.attributes.position.count;
  var staticDrape = new Float32Array(drapeCount);
  for (var di = 0; di < drapeCount; di++) {
    var dx = base[di * 3];
    var dy = base[di * 3 + 1];
    var de = dx / (TW / 2);
    staticDrape[di] = 0.022 * Math.sin(dy * 2.3 + dx * 0.8) +
                      0.014 * Math.sin(dy * 4.9 - dx * 1.4 + 1.7) +
                      0.028 * de * de;
  }
  var plane = new THREE.Mesh(planeGeo, planeMat);
  plane.rotation.x = -Math.PI / 2;
  plane.position.set(0, 0.06, TOPZ);
  plane.scale.y = 0.001;
  plane.receiveShadow = true;
  scene.add(plane);

  /* Texture window: the sheet shows a TH-tall slice of the page; the
     slice pans toward the page end in the bottom zone. Verified against
     render: offset max = page top (flipY), so pageP 0 -> max offset. */
  var sheet = { tex: null, repeatY: 1, pageP: 0.04 };
  function applySheetWindow() {
    if (!sheet.tex) return;
    sheet.tex.repeat.set(1, sheet.repeatY);
    sheet.tex.offset.y = (1 - sheet.repeatY) * (1 - sheet.pageP);
  }
  async function buildSheet() {
    /* One retry if the content bridge is slow — a permanently blank sheet
       silently breaks the unification promise (critic P2). */
    for (var attempt = 0; attempt < 2; attempt++) {
      try {
        if (window.Parchment) {
          await window.Parchment.loadGrain();
          await window.Parchment.fonts();
        }
        var ready = window.TAPESTRY_READY || Promise.resolve();
        await Promise.race([ready, new Promise(function (r) { setTimeout(r, 3500); })]);
        var blocks = (window.TAPESTRY_CONTENT || {}).blocks;
        if ((!blocks || !blocks.length) && attempt === 0) {
          await new Promise(function (r) { setTimeout(r, 2200); });
          continue;
        }
        var canvas2;
        if (blocks && blocks.length && window.Parchment) {
          /* Cap heights were measured in DOM column px; rescale to the
             bake width so the lead-in keeps its proportion (critic P2). */
          var colEl = document.querySelector(".column");
          if (colEl && colEl.clientWidth) {
            var cs = 1280 / colEl.clientWidth;
            blocks.forEach(function (b) { if (b.t === "cap") b.h = Math.round(b.h * cs); });
          }
          var baked = await window.Parchment.bake({ type: "layout", blocks: blocks, width: 1280, target: "sheet" });
          canvas2 = baked.canvas;
        } else {
          var baked = window.Parchment
            ? await window.Parchment.bake({ type: "base", width: 1280, height: 1760, opts: { seed: 7 }, target: "sheet" })
            : { canvas: document.createElement("canvas"), height: 1760 };
          canvas2 = baked.canvas;
        }
        var t = new THREE.CanvasTexture(canvas2);
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        sheet.tex = t;
        sheet.repeatY = Math.min(1, (TH * (1280 / TW)) / canvas2.height);
        planeMat.map = t;
        planeMat.color.set(0xffffff);
        planeMat.needsUpdate = true;
        applySheetWindow();
        /* A bake landing after the warm pass must not pay its first-frame
           bill on screen — ALWAYS upload + compile here, whatever the
           intro is doing (a program swap on the unroll's first frame is
           the hitch; a compile during the quiet hold is invisible). */
        try { renderer.initTexture(t); } catch (e) {}
        plane.visible = true;
        try { renderer.compile(scene, camera); } catch (e) {}
        plane.visible = open > 0.01;
        return;
      } catch (e) { if (attempt) return; }
    }
  }
  var sheetPromise = buildSheet();

  /* The scroll's rods must READ at the 45° down-look (user: "the top
     roll is still not there"): warm mid-brown instead of near-black, a
     touch thicker, and a faint candlelit self-warmth so the rod never
     collapses into a dark sliver against the desk. */
  var woodDark = new THREE.MeshStandardMaterial({
    color: 0x7a5430, roughness: 0.62,
    emissive: 0x24150a, emissiveIntensity: 1
  });
  function dowel() {
    var g = new THREE.Group();
    var bar = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, TW + 1.4, 16), woodDark);
    bar.rotation.z = Math.PI / 2;
    bar.castShadow = true;
    g.add(bar);
    [-1, 1].forEach(function (s) {
      var knob = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 12), woodDark);
      knob.position.x = s * (TW / 2 + 0.7);
      knob.castShadow = true;
      g.add(knob);
    });
    return g;
  }
  var topDowel = dowel();
  topDowel.position.set(0, 0.14, TOPZ - 0.15);
  scene.add(topDowel);

  var rollGroup = new THREE.Group();
  /* The rolled remainder gets its own blank parchment skin — sharing the
     panned sheet texture wrapped readable text around the rod. */
  var rollMat = planeMat.clone();
  rollMat.map = null;
  rollMat.color.set(0xf0e6cc);
  /* Rolled-paper read (user: at rest it read as "two rods and a weird
     white cylinder"): the SIDE shows faint horizontal layer lines, the
     ENDS show a parchment spiral — so the cylinder says "rolled scroll",
     and its rod sits concentric through it with just the knobbed ends
     protruding. */
  var rollSideTex = (function () {
    var c = document.createElement("canvas");
    c.width = 256; c.height = 128;
    var g = c.getContext("2d");
    g.fillStyle = "#efe4c8";
    g.fillRect(0, 0, 256, 128);
    for (var i = 0; i < 26; i++) {
      g.strokeStyle = "rgba(176,154,112," + (0.12 + Math.random() * 0.2).toFixed(2) + ")";
      g.lineWidth = 1 + Math.random() * 2.5;
      var y = Math.random() * 128;
      g.beginPath();
      g.moveTo(0, y);
      g.bezierCurveTo(80, y + (Math.random() * 10 - 5), 170, y + (Math.random() * 10 - 5), 256, y);
      g.stroke();
    }
    var t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  })();
  var rollCapTex = (function () {
    var c = document.createElement("canvas");
    c.width = c.height = 256;
    var g = c.getContext("2d");
    g.fillStyle = "#e6d9ba";
    g.fillRect(0, 0, 256, 256);
    var cx = 128, cy = 128;
    for (var r = 116; r > 8; r -= 6 + Math.random() * 6) {
      g.strokeStyle = "rgba(150,128,88," + (0.25 + Math.random() * 0.3).toFixed(2) + ")";
      g.lineWidth = 2 + Math.random() * 3;
      g.beginPath();
      var a0 = Math.random() * Math.PI * 2;
      g.arc(cx + (Math.random() * 10 - 5), cy + (Math.random() * 10 - 5), r, a0, a0 + Math.PI * (1.4 + Math.random() * 0.6));
      g.stroke();
    }
    var t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  var rollSideMat = rollMat.clone();
  rollSideMat.map = rollSideTex;
  var rollCapMat = rollMat.clone();
  rollCapMat.map = rollCapTex;
  var roll = new THREE.Mesh(
    new THREE.CylinderGeometry(0.34, 0.34, TW + 0.4, 24, 1, false),
    [rollSideMat, rollCapMat, rollCapMat]
  );
  roll.rotation.z = Math.PI / 2;
  roll.castShadow = true;
  rollGroup.add(roll);
  var lowDowel = dowel();
  rollGroup.add(lowDowel);
  scene.add(rollGroup);

  /* ---------- Arcane Ember Sigil Seal & Shard Physics (Issue #18, ADR-0017) ----------
     The closed scroll lies on the desk, cinched by a crimson ribbon band; the
     Arcane Ember Sigil Seal is pressed flat onto the ribbon crossing at the
     crown of the roll. Blood-orange wax: procedural rim displacement and
     pour lobes, a baked stamp face (raised bevel, runic ring, white-hot
     "OPEN") and a breathing ember pulse under the bloom pass. Breaking the
     seal is the page's only entry: it unlocks Web Audio inside the gesture,
     vaporizes the wax into a nova of light (round 6 rework), shakes the
     camera, and starts the authored unroll dolly. */

  /* Keep in sync with layRoll(): at open=0 the roll centre sits at
     (0, 0.06 + 0.34, TOPZ + 0.12) with radius 0.34 — the seal rides the
     crown, sunk a hair into the ribbon wrapping it. */
  var SEAL_Z = TOPZ + 0.12;
  var SEAL_Y = 0.757;

  function createWaxSealGeometry() {
    var radius = 0.30;
    var height = 0.075;
    var geom = new THREE.CylinderGeometry(radius, radius * 1.06, height, 48, 2, false);
    var pos = geom.attributes.position;
    var v = new THREE.Vector3();
    for (var i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      var r = Math.sqrt(v.x * v.x + v.z * v.z);
      var ang = Math.atan2(v.z, v.x);
      /* Hand-pressed spread: lobed low-frequency waves + fine irregularity,
         ramping from 0 at the stamp centre so the face stays round. */
      var t2 = r / radius;
      var wobble = 1 + t2 * t2 * (
        0.055 * Math.sin(ang * 5 + 0.4) +
        0.030 * Math.sin(ang * 8 + 1.2) +
        0.016 * Math.sin(ang * 13 + 2.1));
      v.x *= wobble;
      v.z *= wobble;
      /* Molten lobes sag over the outer edge where the wax poured on. */
      if (t2 > 0.8) {
        var drip = Math.max(0, Math.sin(ang * 3 + 0.8)) +
                   0.7 * Math.max(0, Math.sin(ang * 7 + 2.6));
        v.y -= drip * 0.03 * (t2 - 0.8) / 0.2;
      }
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    geom.computeVertexNormals();
    return geom;
  }

  /* The stamp face is painted once into two canvases: an sRGB albedo (wax
     mottling, bevel shading, gold runes, cream "OPEN") and a linear data
     map (R: height for the bump, G: roughness, B: emissive mask). Splitting
     channels keeps the albedo painterly while the shader keys the white-hot
     pulse off the data map only. */
  var sealColorCanvas = document.createElement("canvas");
  var sealDataCanvas = document.createElement("canvas");

  /* Procedural vector esoteric/alchemical sigils: crisp, resolution-independent,
     and 100% immune to system font rune glyph fallbacks (Issue #18). */
  function drawArcaneSigil(ctx, idx, s) {
    s = s || 10;
    ctx.beginPath();
    switch (idx % 12) {
      case 0: /* Solar circle with central dot and 4 cardinal spokes */
        ctx.arc(0, 0, s * 0.72, 0, Math.PI * 2);
        ctx.moveTo(0, -s); ctx.lineTo(0, -s * 0.72);
        ctx.moveTo(0, s * 0.72); ctx.lineTo(0, s);
        ctx.moveTo(-s, 0); ctx.lineTo(-s * 0.72, 0);
        ctx.moveTo(s * 0.72, 0); ctx.lineTo(s, 0);
        ctx.arc(0, 0, s * 0.18, 0, Math.PI * 2);
        break;
      case 1: /* Alchemical Mercury / horned circle with cross */
        ctx.arc(0, -s * 0.1, s * 0.45, 0, Math.PI * 2);
        ctx.moveTo(-s * 0.45, -s * 0.55);
        ctx.arc(0, -s * 0.55, s * 0.45, Math.PI, 0, true);
        ctx.moveTo(0, s * 0.35); ctx.lineTo(0, s);
        ctx.moveTo(-s * 0.35, s * 0.65); ctx.lineTo(s * 0.35, s * 0.65);
        break;
      case 2: /* Fire triangle with bisecting bar */
        ctx.moveTo(0, -s); ctx.lineTo(s * 0.8, s * 0.65);
        ctx.lineTo(-s * 0.8, s * 0.65); ctx.closePath();
        ctx.moveTo(-s * 0.45, 0.1 * s); ctx.lineTo(s * 0.45, 0.1 * s);
        break;
      case 3: /* Inverted Earth triangle with horizontal bar */
        ctx.moveTo(0, s); ctx.lineTo(s * 0.8, -s * 0.65);
        ctx.lineTo(-s * 0.8, -s * 0.65); ctx.closePath();
        ctx.moveTo(-s * 0.7, -s * 0.15); ctx.lineTo(s * 0.7, -s * 0.15);
        break;
      case 4: /* Crux ansata / Ankh */
        ctx.arc(0, -s * 0.4, s * 0.4, 0, Math.PI * 2);
        ctx.moveTo(0, 0); ctx.lineTo(0, s);
        ctx.moveTo(-s * 0.5, s * 0.4); ctx.lineTo(s * 0.5, s * 0.4);
        break;
      case 5: /* Mystic diamond with central ocular core */
        ctx.moveTo(0, -s); ctx.lineTo(s * 0.75, 0);
        ctx.lineTo(0, s); ctx.lineTo(-s * 0.75, 0); ctx.closePath();
        ctx.arc(0, 0, s * 0.25, 0, Math.PI * 2);
        break;
      case 6: /* Triskele tripartite chevron */
        for (var a = 0; a < 3; a++) {
          var tAng = a * (Math.PI * 2 / 3) - Math.PI / 2;
          var x1 = Math.cos(tAng) * s, y1 = Math.sin(tAng) * s;
          var x2 = Math.cos(tAng + 0.6) * s * 0.4, y2 = Math.sin(tAng + 0.6) * s * 0.4;
          ctx.moveTo(0, 0); ctx.lineTo(x1, y1);
          ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
        }
        break;
      case 7: /* Lunar crescent with star cross */
        ctx.arc(0, 0, s * 0.75, -Math.PI * 0.4, Math.PI * 0.4);
        ctx.arc(s * 0.3, 0, s * 0.6, Math.PI * 0.35, -Math.PI * 0.35, true);
        ctx.closePath();
        ctx.moveTo(-s * 0.35, 0); ctx.lineTo(-s * 0.1, 0);
        ctx.moveTo(-s * 0.22, -s * 0.12); ctx.lineTo(-s * 0.22, s * 0.12);
        break;
      case 8: /* Alchemical Sulfur: triangle over patriarchal cross */
        ctx.moveTo(0, -s * 0.9); ctx.lineTo(s * 0.7, -s * 0.05);
        ctx.lineTo(-s * 0.7, -s * 0.05); ctx.closePath();
        ctx.moveTo(0, -s * 0.05); ctx.lineTo(0, s * 0.85);
        ctx.moveTo(-s * 0.4, s * 0.4); ctx.lineTo(s * 0.4, s * 0.4);
        break;
      case 9: /* Dagaz hex hourglass bind */
        ctx.moveTo(-s * 0.65, -s * 0.85); ctx.lineTo(s * 0.65, -s * 0.85);
        ctx.lineTo(-s * 0.65, s * 0.85); ctx.lineTo(s * 0.65, s * 0.85); ctx.closePath();
        ctx.moveTo(-s * 0.4, 0); ctx.lineTo(s * 0.4, 0);
        break;
      case 10: /* Cardinal wind arrows */
        ctx.moveTo(0, -s); ctx.lineTo(0, s);
        ctx.moveTo(-s, 0); ctx.lineTo(s, 0);
        ctx.moveTo(-s * 0.3, -s * 0.7); ctx.lineTo(0, -s); ctx.lineTo(s * 0.3, -s * 0.7);
        ctx.moveTo(-s * 0.3, s * 0.7); ctx.lineTo(0, s); ctx.lineTo(s * 0.3, s * 0.7);
        break;
      case 11: /* Aegishjalmur tridents */
        ctx.moveTo(0, -s * 0.9); ctx.lineTo(0, s * 0.9);
        ctx.moveTo(-s * 0.5, -s * 0.5); ctx.lineTo(0, -s * 0.25); ctx.lineTo(s * 0.5, -s * 0.5);
        ctx.moveTo(-s * 0.5, s * 0.5); ctx.lineTo(0, s * 0.25); ctx.lineTo(s * 0.5, s * 0.5);
        break;
    }
  }

  function paintSealCanvases() {
    var size = 512;
    sealColorCanvas.width = sealColorCanvas.height = size;
    sealDataCanvas.width = sealDataCanvas.height = size;
    var cx = size / 2;
    var R = size / 2 - 6;
    var i, ang, rr, k, rAng;

    /* ---- albedo ---- */
    var a = sealColorCanvas.getContext("2d");
    var grad = a.createRadialGradient(cx, cx, R * 0.1, cx, cx, R);
    grad.addColorStop(0, "#C84A16");
    grad.addColorStop(0.62, "#A32B08");
    grad.addColorStop(0.88, "#7C1B04");
    grad.addColorStop(1, "#611102");
    a.fillStyle = grad;
    a.beginPath();
    a.arc(cx, cx, R, 0, Math.PI * 2);
    a.fill();
    /* wax mottling: short translucent flecks of lighter/darker wax */
    for (i = 0; i < 420; i++) {
      ang = Math.random() * Math.PI * 2;
      rr = Math.sqrt(Math.random()) * R * 0.98;
      a.fillStyle = Math.random() < 0.5
        ? "rgba(255,166,100," + (0.03 + Math.random() * 0.07).toFixed(3) + ")"
        : "rgba(52,10,0," + (0.04 + Math.random() * 0.08).toFixed(3) + ")";
      a.beginPath();
      a.arc(cx + Math.cos(ang) * rr, cx + Math.sin(ang) * rr,
        1 + Math.random() * 3.2, 0, Math.PI * 2);
      a.fill();
    }
    /* porous, darker poured rim with a lit inner lip */
    a.strokeStyle = "rgba(40,6,0,0.55)";
    a.lineWidth = 14;
    a.beginPath();
    a.arc(cx, cx, R * 0.965, 0, Math.PI * 2);
    a.stroke();
    a.strokeStyle = "rgba(255,150,90,0.28)";
    a.lineWidth = 5;
    a.beginPath();
    a.arc(cx, cx, R * 0.9, 0, Math.PI * 2);
    a.stroke();
    /* bevel read around the stamp plate */
    a.strokeStyle = "rgba(50,8,0,0.6)";
    a.lineWidth = 7;
    a.beginPath();
    a.arc(cx, cx, R * 0.72, 0, Math.PI * 2);
    a.stroke();
    a.strokeStyle = "rgba(255,170,110,0.33)";
    a.lineWidth = 3;
    a.beginPath();
    a.arc(cx, cx, R * 0.7, 0, Math.PI * 2);
    a.stroke();

    var sigilCount = 12;
    for (k = 0; k < sigilCount; k++) {
      rAng = (k / sigilCount) * Math.PI * 2 - Math.PI / 2;
      a.save();
      a.translate(cx + Math.cos(rAng) * R * 0.545, cx + Math.sin(rAng) * R * 0.545);
      a.rotate(rAng + Math.PI / 2);
      a.lineWidth = 2.4;
      a.strokeStyle = "rgba(30,5,0,0.7)";
      drawArcaneSigil(a, k, 10);
      a.stroke();
      a.lineWidth = 2.0;
      a.strokeStyle = "#F7C98F";
      drawArcaneSigil(a, k, 10);
      a.stroke();
      a.restore();
    }
    /* the white-hot OPEN, stamped deepest */
    a.textAlign = "center";
    a.textBaseline = "middle";
    a.shadowColor = "rgba(255,132,0,0.9)";
    a.shadowBlur = 22;
    a.fillStyle = "#FFF3DC";
    a.font = "700 74px 'Cinzel Decorative', serif";
    a.fillText("OPEN", cx, cx + 4);
    a.shadowBlur = 0;
    a.strokeStyle = "rgba(80,12,0,0.35)";
    a.lineWidth = 2;
    a.strokeText("OPEN", cx, cx + 4);

    /* ---- data map: R height, G roughness, B emissive ---- */
    var d = sealDataCanvas.getContext("2d");
    d.fillStyle = "rgb(140, 105, 0)"; /* mid height, satin wax, no emissive */
    d.beginPath();
    d.arc(cx, cx, R, 0, Math.PI * 2);
    d.fill();
    /* pores in the rim: rougher, slightly recessed */
    d.fillStyle = "rgba(110, 190, 0, 0.5)";
    for (i = 0; i < 260; i++) {
      ang = Math.random() * Math.PI * 2;
      rr = R * (0.86 + Math.random() * 0.12);
      d.beginPath();
      d.arc(cx + Math.cos(ang) * rr, cx + Math.sin(ang) * rr,
        1 + Math.random() * 2.5, 0, Math.PI * 2);
      d.fill();
    }
    /* raised bevel plate ring + recessed groove inside it */
    d.strokeStyle = "rgb(205, 95, 70)";
    d.lineWidth = 12;
    d.beginPath();
    d.arc(cx, cx, R * 0.71, 0, Math.PI * 2);
    d.stroke();
    d.strokeStyle = "rgb(70, 120, 0)";
    d.lineWidth = 6;
    d.beginPath();
    d.arc(cx, cx, R * 0.62, 0, Math.PI * 2);
    d.stroke();
    /* faint arcane veins threading the wax (dim blue channel = dim pulse) */
    d.strokeStyle = "rgba(150, 110, 46, 0.5)";
    d.lineWidth = 2.5;
    for (i = 0; i < 4; i++) {
      d.beginPath();
      var v0 = Math.random() * Math.PI * 2;
      d.arc(cx + (Math.random() * 60 - 30), cx + (Math.random() * 60 - 30),
        R * (0.2 + Math.random() * 0.25), v0, v0 + Math.PI * (0.5 + Math.random()));
      d.stroke();
    }
    for (k = 0; k < sigilCount; k++) {
      rAng = (k / sigilCount) * Math.PI * 2 - Math.PI / 2;
      d.save();
      d.translate(cx + Math.cos(rAng) * R * 0.545, cx + Math.sin(rAng) * R * 0.545);
      d.rotate(rAng + Math.PI / 2);
      d.lineWidth = 2.2;
      d.strokeStyle = "rgb(235, 85, 255)";
      drawArcaneSigil(d, k, 10);
      d.stroke();
      d.restore();
    }
    d.textAlign = "center";
    d.textBaseline = "middle";
    d.font = "700 74px 'Cinzel Decorative', serif";
    d.fillStyle = "rgb(255, 90, 255)";
    d.fillText("OPEN", cx, cx + 4);
  }
  paintSealCanvases();
  var sealColorTex = new THREE.CanvasTexture(sealColorCanvas);
  sealColorTex.colorSpace = THREE.SRGBColorSpace;
  sealColorTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  var sealDataTex = new THREE.CanvasTexture(sealDataCanvas);
  /* CylinderGeometry bakes its cap UVs swapped (u follows world z, v follows
     world x), so the stamp face renders the painted "OPEN" rotated a quarter
     turn — it read vertically in the close-up. A shared quarter-turn on BOTH
     canvases (albedo + data must stay aligned) lays the word along world x,
     which the close-up camera projects as horizontal. */
  sealColorTex.center.set(0.5, 0.5);
  sealColorTex.rotation = Math.PI / 2;
  sealDataTex.center.set(0.5, 0.5);
  sealDataTex.rotation = Math.PI / 2;
  /* Re-paint once the display font actually arrives — the boot-time bake
     may run before Cinzel Decorative loads and stamp "OPEN" in a fallback
     serif. Swapping canvas content under the same textures is a pixel
     upload, never a shader event (ADR-0010). */
  if (document.fonts && document.fonts.load) {
    document.fonts.load("700 74px 'Cinzel Decorative'")
      .then(function () { return document.fonts.ready; })
      .then(function () {
        paintSealCanvases();
        sealColorTex.needsUpdate = true;
        sealDataTex.needsUpdate = true;
      })
      .catch(function () {});
  }

  var sealUniforms = {
    uPulse: { value: 1.0 },
    uEmberColor: { value: new THREE.Color(0xff4500) },
    uWhiteHotColor: { value: new THREE.Color(0xfff5e0) }
  };

  /* Nova uniforms (owner round 6: the wax VAPORIZES into the eruption).
     uNovaFront01 sweeps 0->1 across the seal radius driving a radial
     discard() dissolve; uNovaEdgeGlow is the white-hot burn band. Uniform
     writes only — ADR-0010. */
  var novaU = {
    uNovaFront01: { value: 0 },
    uNovaEdgeGlow: { value: 0 }
  };
  var sealFaceMat = new THREE.MeshPhysicalMaterial({
    map: sealColorTex,
    bumpMap: sealDataTex,
    bumpScale: 0.55,
    roughnessMap: sealDataTex,
    roughness: 1.0,
    metalness: 0.0,
    clearcoat: 0.35,
    clearcoatRoughness: 0.5,
    sheen: 0.4,
    sheenColor: 0xff8a4d,
    sheenRoughness: 0.6,
    emissive: 0xff4300,
    emissiveIntensity: 1.0,
    emissiveMap: sealDataTex
  });
  /* The poured edge + underside read as broken wax interior, not stamp. */
  var sealSideMat = new THREE.MeshStandardMaterial({
    color: 0x8f2508,
    roughness: 0.58,
    metalness: 0.02,
    emissive: 0xff4300,
    emissiveIntensity: 0.06
  });
  sealSideMat.customProgramCacheKey = function () { return "arcane-wax-side-nova-v1"; };
  sealSideMat.onBeforeCompile = function (shader) {
    shader.uniforms.uNovaFront01 = novaU.uNovaFront01;
    shader.uniforms.uNovaEdgeGlow = novaU.uNovaEdgeGlow;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <common>",
      "#include <common>\nvarying float vNovaR;"
    );
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\nvNovaR = length(position.xz) * 2.6667;"
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <common>",
      "#include <common>\nuniform float uNovaFront01;\nuniform float uNovaEdgeGlow;\nvarying float vNovaR;"
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <clipping_planes_fragment>",
      [
        "#include <clipping_planes_fragment>",
        "float novaThS = uNovaFront01 * 1.15;",
        "float novaHash = fract(sin(floor(vNovaR * 11.0) * 127.1 + floor(vNovaR * 7.0) * 311.7) * 43758.5453);",
        "float novaFieldS = mix(novaHash, vNovaR, 0.6);",
        "if (novaFieldS < novaThS - 0.16) discard;"
      ].join("\n")
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <emissivemap_fragment>",
      [
        "#include <emissivemap_fragment>",
        "float novaEdgeS = (1.0 - smoothstep(novaThS - 0.34, novaThS - 0.02, novaFieldS)) * step(0.001, uNovaFront01);",
        "totalEmissiveRadiance += mix(vec3(1.0, 0.4, 0.1), vec3(1.0, 0.9, 0.7), novaEdgeS) * novaEdgeS * uNovaEdgeGlow;"
      ].join("\n")
    );
  };
  sealFaceMat.customProgramCacheKey = function () {
    return "arcane-wax-seal-nova-v3";
  };
  sealFaceMat.onBeforeCompile = function (shader) {
    shader.uniforms.uPulse = sealUniforms.uPulse;
    shader.uniforms.uEmberColor = sealUniforms.uEmberColor;
    shader.uniforms.uWhiteHotColor = sealUniforms.uWhiteHotColor;
    shader.uniforms.uNovaFront01 = novaU.uNovaFront01;
    shader.uniforms.uNovaEdgeGlow = novaU.uNovaEdgeGlow;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <common>",
      "#include <common>\nvarying float vNovaR;"
    );
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\nvNovaR = length(position.xz) * 2.6667;"
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <common>",
      "#include <common>\nuniform float uNovaFront01;\nuniform float uNovaEdgeGlow;\n" +
      "uniform vec3 uEmberColor;\nuniform vec3 uWhiteHotColor;\nuniform float uPulse;\n" +
      "varying float vNovaR;"
    );
    /* Radial vaporization: dissolve FROM the eruption outward — the field
       mixes the wax's own height mottle (data-map R) with normalized
       radius, and discard() kills fragments the front has passed. Early
       in the fragment so dissolved wax costs nothing. */
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <clipping_planes_fragment>",
      "#include <clipping_planes_fragment>\n" +
      "float novaTh = uNovaFront01 * 1.15;\n" +
      "float novaField = vNovaR;\n" +
      "#ifdef USE_EMISSIVEMAP\n" +
      "  novaField = mix(texture2D(emissiveMap, vEmissiveMapUv).r, vNovaR, 0.65);\n" +
      "#endif\n" +
      "if (novaField < novaTh - 0.16) discard;"
    );
    /* The stamp's emissive answer REPLACES the stock map product: the wax
       body keeps a warm ember breath, the rune/OPEN mask (data blue
       channel) ignites past the bloom threshold. uPulse is a plain uniform
       write — no program invalidation, ever (ADR-0010). The nova edge band
       rides on top: white-hot at the burn front, ember behind it. */
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <emissivemap_fragment>",
      "#include <emissivemap_fragment>\n" +
      "#ifdef USE_EMISSIVEMAP\n" +
      "  vec4 sealTexel = texture2D(emissiveMap, vEmissiveMapUv);\n" +
      "  float glyphMask = smoothstep(0.5, 0.92, sealTexel.b);\n" +
      "  vec3 hot = mix(uEmberColor * 1.15, uWhiteHotColor * 2.7, glyphMask);\n" +
      "  totalEmissiveRadiance = hot * (0.16 + 0.84 * glyphMask) * uPulse;\n" +
      "#endif\n" +
      "float novaEdge = (1.0 - smoothstep(novaTh - 0.34, novaTh - 0.02, novaField)) *\n" +
      "                step(0.001, uNovaFront01);\n" +
      "vec3 novaRamp = mix(vec3(1.0, 0.36, 0.08), vec3(1.0, 0.92, 0.72), novaEdge * novaEdge);\n" +
      "totalEmissiveRadiance += novaRamp * novaEdge * uNovaEdgeGlow;"
    );
  };

  var sealGeo = createWaxSealGeometry();
  /* Group order: side wall, top cap (the stamp face), bottom cap. */
  var sealMesh = new THREE.Mesh(sealGeo, [sealSideMat, sealFaceMat, sealSideMat]);
  sealMesh.position.set(0, SEAL_Y, SEAL_Z);
  scene.add(sealMesh);

  var ribbonMat = new THREE.MeshStandardMaterial({
    color: 0x8a1608,
    roughness: 0.62,
    metalness: 0.05,
    side: THREE.FrontSide,
    transparent: true
  });
  var ribbonMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.341, 0.341, 0.28, 32, 1, true, -Math.PI * 0.25, Math.PI * 1.10),
    ribbonMat
  );
  ribbonMesh.rotation.z = Math.PI / 2;
  ribbonMesh.position.set(0, 0.40, SEAL_Z);
  scene.add(ribbonMesh);

  var sealLight = new THREE.PointLight(0xff7a33, 1.1, 2.6, 2);
  sealLight.position.set(0, 1.3, SEAL_Z);
  scene.add(sealLight);

  /* Hover eases in tick: the pulse breathes harder and the wax swells a
     touch when the signet hand is over the seal. */
  var sealHover = 0, sealHoverTarget = 0;
  function updateSealPulse(t, dt) {
    sealHover += (sealHoverTarget - sealHover) * Math.min(1, dt * 9);
    var p = 1 + (0.34 + 0.55 * sealHover) * Math.sin(t * 2.4) +
            (0.13 + 0.2 * sealHover) * Math.sin(t * 5.1 + 0.8);
    sealUniforms.uPulse.value = Math.max(0.15, p);
    if (sealLight) sealLight.intensity = 1.1 + 0.75 * sealHover + 0.3 * Math.sin(t * 2.4);
    sealMesh.scale.setScalar(1 + 0.045 * sealHover);
  }

  var sealOrigin = new THREE.Vector3();

  /* ---------- Vapor embers (the nova's carry-off) ----------
     One Points cloud, soft round sprite, per-point color ramp (additive +
     vertexColors: a point whose color reaches black is out — free kills,
     no alpha sorting). Enough count to read as the wax LEAVING, not
     sparks: 132 motes, spawned by novaIgniteEmbers, turbiated by
     novaUpdateEmbers (curl-ish swirl, they skim and never land). */
  var EMBER_COUNT = 132;
  var emberPos = new Float32Array(EMBER_COUNT * 3);
  var emberVel = new Float32Array(EMBER_COUNT * 3);
  var emberCol = new Float32Array(EMBER_COUNT * 3);
  var emberLife = new Float32Array(EMBER_COUNT);
  var emberLifeMax = new Float32Array(EMBER_COUNT);
  var emberGeom = new THREE.BufferGeometry();
  emberGeom.setAttribute("position", new THREE.BufferAttribute(emberPos, 3));
  emberGeom.setAttribute("color", new THREE.BufferAttribute(emberCol, 3));
  var emberSprite = (function () {
    var c = document.createElement("canvas");
    c.width = c.height = 32;
    var g = c.getContext("2d");
    var rg = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    rg.addColorStop(0, "rgba(255,255,255,1)");
    rg.addColorStop(0.35, "rgba(255,255,255,0.55)");
    rg.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = rg;
    g.fillRect(0, 0, 32, 32);
    return new THREE.CanvasTexture(c);
  })();
  var emberMat = new THREE.PointsMaterial({
    size: 0.1,
    map: emberSprite,
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true
  });
  var emberPoints = new THREE.Points(emberGeom, emberMat);
  emberPoints.visible = false;
  emberPoints.renderOrder = 7;
  emberPoints.frustumCulled = false;
  scene.add(emberPoints);

  /* ---------- Impact jolt on the parked composite ----------
     The burst plays OVER the frozen hold target, so a camera-space kick
     would move nothing the viewer can see. The jolt is a damped sinusoid
     applied to the hold quad's scale instead — the whole frozen frame
     recoils, physically, at zero main-thread cost. */
  var quadKickTime = -1.0;
  var QUAD_KICK_DURATION = 0.38;
  function applyQuadKick() {
    quadKickTime = 0.0;
  }
  function applyQuadKickStep(dt) {
    if (quadKickTime < 0.0) return;
    quadKickTime += dt;
    if (quadKickTime >= QUAD_KICK_DURATION) {
      quadKickTime = -1.0;
      holdQuadMesh.scale.set(1, 1, 1);
      return;
    }
    var decay = Math.exp(-12.0 * quadKickTime);
    var s = 1 + 0.03 * decay * Math.cos(21.18 * quadKickTime);
    holdQuadMesh.scale.set(s, s, 1);
  }

  /* ---------- O(1) screen-space hover test + projected trigger anchor ---- */
  var _sealCenterNdc = new THREE.Vector3();
  var _sealEdgeNdc = new THREE.Vector3();
  var sealScreenX = 0, sealScreenY = 0, sealScreenR = 40;
  var isHoveringSeal = false;
  var sealBroken = false;
  var sealPhase = "pre"; /* pre → approach → wait → pulling → burst → intro → done */
  var lastTriggerX = -1, lastTriggerY = -1;

  function projectSeal() {
    sealMesh.getWorldPosition(_sealCenterNdc);
    _sealCenterNdc.project(camera);
    sealScreenX = (_sealCenterNdc.x * 0.5 + 0.5) * window.innerWidth;
    sealScreenY = (-_sealCenterNdc.y * 0.5 + 0.5) * window.innerHeight;
    /* project one rim-radius offset: the true on-screen radius, not a guess */
    _sealEdgeNdc.set(sealMesh.position.x + 0.34, sealMesh.position.y, sealMesh.position.z);
    _sealEdgeNdc.project(camera);
    sealScreenR = Math.max(24,
      Math.abs((_sealEdgeNdc.x * 0.5 + 0.5) * window.innerWidth - sealScreenX));
  }

  function checkSealHover(clientX, clientY) {
    if (sealBroken || !sealMesh || !camera) return false;
    projectSeal();
    var dx = clientX - sealScreenX;
    var dy = clientY - sealScreenY;
    return (dx * dx + dy * dy) <= (sealScreenR * sealScreenR);
  }

  /* ---------- Nova eruption (owner round 6: treatment B is THE effect) ---
     The owner's notes, implemented: the light radially FLOODS the whole
     scene (not a local glow), the wax VAPORIZES (no shards, no mess), the
     camera shake is violent, and a riser->boom scores it. Research:
     docs/research/nova-eruption-implementation.md.

     Grammar: ONE world-space wavefront front(t) = 6*(t-0.09) m gates every
     channel — HDR shells (the geometric carrier), a screen-space annulus in
     a compose pass before OutputPass, a fake-GI quartet (nova point light +
     hemisphere boost + fog color pulse + per-material emissive answer), and
     an asymmetric exposure arc (strike ~+2.3 EV, 0.2 s rapatronic hold,
     tau=0.45 s filmic recovery). Every envelope is a pure function of the
     fracture clock, so the deterministic ?shot= frames stay exact. */
  var sealFxShot = null, sealFxAutobreak = 0;
  (function () {
    try {
      var qs = new URLSearchParams(window.location.search);
      sealFxShot = qs.get("shot");
      if (sealFxShot && ["pre", "break", "flood"].indexOf(sealFxShot) < 0) sealFxShot = null;
      sealFxAutobreak = parseFloat(qs.get("autobreak")) || 0;
      if (qs.get("play") && !sealFxAutobreak) sealFxAutobreak = 1.4;
    } catch (e) {}
  })();

  var sealFx = {
    clock: -1,     /* seconds since the eruption; -1 = not lit yet */
    charge: -1,    /* click -> eruption gather (the pull-back IS the riser) */
    waitClock: 0,
    live: false,   /* the flood needs the full render path (fog/ambient/emissive) */
    captureSaved: null
  };
  var sealFxScale = 1;         /* hit-stop + speed ramp on the burst systems */
  var shotFrozen = false;
  var sealFxStagedExposure = 0;
  var novaBaseFogColor = scene.fog.color.clone();
  var novaBaseFogDensity = scene.fog.density;
  var novaBaseHemi = hemiLight.intensity;
  var novaBaseFov = camera.fov;
  var novaFogFlood = new THREE.Color(0xffdcae);

  function novaClamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function novaSmooth(a, b, x) {
    var t = novaClamp01((x - a) / (b - a));
    return t * t * (3 - 2 * t);
  }

  /* ---- pure envelopes of the fracture clock (live + staging share them) */
  function novaTimeScaleAt(clk) {
    /* 90ms hit-stop on the eruption frame, then the speed ramp back. */
    return (clk < 0.09) ? 0.02 : 0.22 + 0.78 * novaSmooth(0.09, 1.1, clk);
  }
  function novaFrontAt(clk) { return 6 * Math.max(0, clk - 0.09); }
  function novaFront01At(clk) {
    /* v3: the WAX burns slower than light travels — a 1.5 m/s dissolve
       front (~0.3s of visible burn-away) instead of the 6 m/s light front,
       which vaporized the seal in 2 frames. */
    return novaClamp01((1.5 * Math.max(0, clk - 0.09)) / 0.44);
  }
  function novaGAt(clk) {
    /* scalar flood gate: rises while the front crosses the desk, holds
       through the white-out, relaxes through the recovery. */
    return novaSmooth(0.09, 0.55, clk) * Math.exp(-Math.max(0, clk - 0.75) * 2.2);
  }
  function novaExpMulAt(clk) {
    /* TWO-BEAT arc (v2): the wave crosses the desk VISIBLY first (only a
       mild lift), the white-out lands as the front reaches the far edge
       (rapatronic hold), then tau=0.45 filmic recovery — v1 spiked at
       0.04s and the flash masked the crossing entirely. */
    var strike = novaSmooth(0.26, 0.38, clk);
    var hold = (clk < 0.72) ? 1 : Math.exp(-(clk - 0.72) / 0.45);
    return 1 + 1.55 * strike * hold;
  }
  function novaLightAt(clk) {
    return 70 * novaSmooth(0.02, 0.07, clk) * Math.exp(-Math.max(0, clk - 0.09) * 2.2);
  }
  function novaTraumaAt(clk) {
    /* Eiserloh: shake = trauma^2. Spike at hit-stop exit; v2 decays slower
       (0.85/s) so the violence stays visible THROUGH the white-out into
       the recovery — shake hidden inside a blown frame is shake wasted. */
    return (clk < 0.09) ? 0 : 0.95 * Math.exp(-(clk - 0.09) * 0.85);
  }
  function novaCoreAAt(clk) {
    return novaSmooth(0, 0.03, clk) * Math.exp(-Math.max(0, clk - 0.05) * 6.5);
  }
  function novaCoreRAt(clk) { return 0.10 + 0.42 * novaSmooth(0, 0.5, clk); }
  function novaShellAAt(clk) {
    return novaSmooth(0.02, 0.1, clk) * Math.exp(-Math.max(0, clk - 0.28) * 2.6);
  }

  /* ---- shared uniforms for every material that ANSWERS the flood ---- */
  var novaSharedU = {
    uNovaG: { value: 0 },
    uNovaFrontM: { value: 0 },
    uNovaColor: { value: new THREE.Color(1.35, 1.0, 0.6) },
    uNovaXZ: { value: new THREE.Vector2(0, SEAL_Z) }
  };

  /* ---- the desk itself answers (tableMat stays the PBR material, so the
     answer rides an emissive injection — same mechanics as the seal's) ---- */
  tableMat.customProgramCacheKey = function () { return "table-nova-v1"; };
  tableMat.onBeforeCompile = function (shader) {
    shader.uniforms.uNovaG = novaSharedU.uNovaG;
    shader.uniforms.uNovaFrontM = novaSharedU.uNovaFrontM;
    shader.uniforms.uNovaColor = novaSharedU.uNovaColor;
    shader.uniforms.uNovaXZ = novaSharedU.uNovaXZ;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <common>",
      "#include <common>\nvarying vec3 vNovaWP;"
    );
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\nvNovaWP = (modelMatrix * vec4(transformed, 1.0)).xyz;"
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <common>",
      "#include <common>\nuniform float uNovaG;\nuniform float uNovaFrontM;\nuniform vec3 uNovaColor;\nuniform vec2 uNovaXZ;\nvarying vec3 vNovaWP;"
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <emissivemap_fragment>",
      ["#include <emissivemap_fragment>",
       "if (uNovaG > 0.001) {",
       "  float novaD = distance(vNovaWP.xz, uNovaXZ);",
       "  float novaHit = smoothstep(uNovaFrontM, uNovaFrontM - 0.9, novaD);",
       "  totalEmissiveRadiance += uNovaColor * uNovaG * novaHit;",
       "}"].join("\n")
    );
  };

  /* ---- nova light: the strike-decay fill that reaches the ink pots ---- */
  var novaLight = new THREE.PointLight(0xffd9a8, 0, 26, 2);
  novaLight.visible = false;
  scene.add(novaLight);

  /* ---- HDR shells: inner filled core (inverted fresnel) + outer rim ---- */
  var novaCoreMat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(6.0, 5.0, 4.0) },
      uAlpha: { value: 0 }
    },
    vertexShader: [
      "varying vec3 vNrm;",
      "varying vec3 vView;",
      "void main() {",
      "  vNrm = normalize(normalMatrix * normal);",
      "  vec4 mv = modelViewMatrix * vec4(position, 1.0);",
      "  vView = normalize(-mv.xyz);",
      "  gl_Position = projectionMatrix * mv;",
      "}"
    ].join("\n"),
    fragmentShader: [
      "uniform vec3 uColor;",
      "uniform float uAlpha;",
      "varying vec3 vNrm;",
      "varying vec3 vView;",
      "void main() {",
      "  float face = pow(abs(dot(normalize(vNrm), normalize(vView))), 1.6);",
      "  gl_FragColor = vec4(uColor * face, uAlpha * face);",
      "}"
    ].join("\n"),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  var novaCore = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), novaCoreMat);
  novaCore.visible = false;
  novaCore.renderOrder = 8;
  scene.add(novaCore);

  var novaShellMat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(1.8, 1.25, 0.62) },
      uAlpha: { value: 0 }
    },
    vertexShader: novaCoreMat.vertexShader,
    fragmentShader: [
      "uniform vec3 uColor;",
      "uniform float uAlpha;",
      "varying vec3 vNrm;",
      "varying vec3 vView;",
      "void main() {",
      "  float fr = pow(1.0 - abs(dot(normalize(vNrm), normalize(vView))), 3.2);",
      "  gl_FragColor = vec4(uColor * fr, uAlpha * fr);",
      "}"
    ].join("\n"),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.BackSide
  });
  var novaShell = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), novaShellMat);
  novaShell.visible = false;
  novaShell.renderOrder = 8;
  scene.add(novaShell);

  /* ---- desk light pool: the wave made visible ON a surface ---- */
  var novaPoolMat = new THREE.ShaderMaterial({
    uniforms: {
      uFront: { value: 0 },
      uE: { value: 0 },
      uColor: { value: new THREE.Color(2.6, 1.9, 1.05) }
    },
    vertexShader: "varying vec2 vUvP;\nvoid main() { vUvP = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: [
      "uniform float uFront;",
      "uniform float uE;",
      "uniform vec3 uColor;",
      "varying vec2 vUvP;",
      "void main() {",
      "  vec2 d = vUvP - vec2(0.5);",
      "  float dist = length(d) * 2.0;",
      "  if (dist >= 1.0 || uE <= 0.001) discard;",
      "  float r = dist * 3.6;",
      "  float dFront = uFront - r;",
      "  if (dFront < -0.15) discard;",
      "  float ring = smoothstep(-0.15, 0.0, dFront) * smoothstep(0.6, 0.0, dFront);",
      "  float trail = (dFront >= 0.0) ? exp(-dFront * 2.2) : 0.0;",
      "  float edgeFalloff = smoothstep(1.0, 0.72, dist);",
      "  float intensity = (ring * 1.8 + trail * 0.7) * edgeFalloff * uE;",
      "  gl_FragColor = vec4(uColor * intensity, intensity);",
      "}"
    ].join("\n"),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  var novaPool = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3.6), novaPoolMat);
  novaPool.rotation.x = -Math.PI / 2;
  novaPool.position.set(0, 0.078, SEAL_Z);
  novaPool.visible = false;
  novaPool.renderOrder = 6;
  scene.add(novaPool);

  /* ---- vapor smoke: billboarded soft quads, procedural canvas alpha ---- */
  var novaSmokeTex = (function () {
    var c = document.createElement("canvas");
    c.width = c.height = 128;
    var g = c.getContext("2d");
    for (var i = 0; i < 26; i++) {
      var ang = Math.random() * Math.PI * 2;
      var rr = Math.random() * 34;
      var x = 64 + Math.cos(ang) * rr, y = 64 + Math.sin(ang) * rr;
      var rr2 = 14 + Math.random() * 22;
      var rg = g.createRadialGradient(x, y, 0, x, y, rr2);
      rg.addColorStop(0, "rgba(255,255,255,0.10)");
      rg.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = rg;
      g.fillRect(0, 0, 128, 128);
    }
    return new THREE.CanvasTexture(c);
  })();
  var NOVA_SMOKE = 9;
  var novaSmoke = [];
  for (var nsI = 0; nsI < NOVA_SMOKE; nsI++) {
    var sm = new THREE.Sprite(new THREE.SpriteMaterial({
      map: novaSmokeTex,
      color: 0x7d6c58,
      transparent: true,
      opacity: 0,
      depthWrite: false
    }));
    sm.visible = false;
    sm.renderOrder = 9;
    scene.add(sm);
    novaSmoke.push(sm);
  }
  var novaSmokeClock = -1;

  /* ---- screen-space flood: analytic annulus added before OutputPass ---- */
  var novaCompose = null;
  function sealFxBuildNovaCompose(ShaderPass) {
    novaCompose = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        uSunUv: { value: new THREE.Vector2(0.5, 0.5) },
        uAspect: { value: 1.0 },
        uMetersPerUv: { value: 2.0 },
        uFront: { value: 0.0 },
        uFloodColor: { value: new THREE.Color(2.4, 2.05, 1.5) },
        uFloodE: { value: 0.0 },
        uCoreGlow: { value: 0.0 }
      },
      vertexShader: "varying vec2 vUvN;\nvoid main() { vUvN = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: [
        "uniform sampler2D tDiffuse;",
        "uniform vec2 uSunUv;",
        "uniform float uAspect;",
        "uniform float uMetersPerUv;",
        "uniform float uFront;",
        "uniform float uFloodE;",
        "uniform float uCoreGlow;",
        "uniform vec3 uFloodColor;",
        "varying vec2 vUvN;",
        "void main() {",
        "  vec4 base = texture2D(tDiffuse, vUvN);",
        "  vec2 d2 = vUvN - uSunUv;",
        "  d2.x *= uAspect;",
        "  float d = length(d2) * uMetersPerUv;",
        "  float flood = smoothstep(uFront, uFront - 0.7, d);",
        "  float band = exp(-abs(d - uFront) * 2.4);",
        "  vec3 lift = uFloodColor * (flood * 0.55 + band * 1.5) * uFloodE;",
        "  lift += uFloodColor * uCoreGlow / (d * 6.0 + 0.35);",
        "  gl_FragColor = vec4(base.rgb + lift, base.a);",
        "}"
      ].join("\n")
    });
    /* insert BEFORE OutputPass so the lift tone-maps with the frame */
    composer.passes.splice(composer.passes.length - 1, 0, novaCompose);
  }

  /* ---- embers: the wax LEAVING (curl-ish turbulence, no landing) ---- */
  var novaEmberT = 0;
  function novaIgniteEmbers(origin) {
    for (var i = 0; i < EMBER_COUNT; i++) {
      var i3 = i * 3;
      var ang = Math.random() * Math.PI * 2;
      var rad = Math.sqrt(Math.random()) * 0.24;
      emberPos[i3] = origin.x + Math.cos(ang) * rad;
      emberPos[i3 + 1] = origin.y + 0.02 + Math.random() * 0.05;
      emberPos[i3 + 2] = origin.z + Math.sin(ang) * rad;
      var spd = 0.9 + Math.random() * 1.9;
      emberVel[i3] = Math.cos(ang) * spd;
      emberVel[i3 + 1] = 1.3 + Math.random() * 2.0;
      emberVel[i3 + 2] = Math.sin(ang) * spd + 0.4;
      emberLifeMax[i] = 0.9 + Math.random() * 0.9;
      emberLife[i] = emberLifeMax[i];
      emberCol[i3] = 3.4; emberCol[i3 + 1] = 2.5; emberCol[i3 + 2] = 1.5;
    }
    emberGeom.attributes.position.needsUpdate = true;
    emberGeom.attributes.color.needsUpdate = true;
    emberPoints.visible = true;
    emberMat.size = 0.13; /* v2: the burst reads denser at the break */
    novaEmberT = 0;
  }
  function novaUpdateEmbers(dt) {
    novaEmberT += dt;
    var anyAlive = false;
    for (var i = 0; i < EMBER_COUNT; i++) {
      var i3 = i * 3;
      if (emberLife[i] <= 0) continue;
      anyAlive = true;
      emberLife[i] -= dt;
      /* two out-of-phase lattices = cheap curl noise: the motes swirl,
         not just rise (Bridson-lite, research section 2.4) */
      emberVel[i3] += Math.sin(emberPos[i3 + 1] * 3.1 + novaEmberT * 2.9 + i * 0.31) * 0.85 * dt;
      emberVel[i3 + 2] += Math.cos(emberPos[i3 + 1] * 2.6 - novaEmberT * 2.4 + i * 0.53) * 0.85 * dt;
      emberVel[i3 + 1] -= 1.35 * dt;
      emberVel[i3] *= 1 - 0.5 * dt;
      emberVel[i3 + 2] *= 1 - 0.5 * dt;
      emberPos[i3] += emberVel[i3] * dt;
      emberPos[i3 + 1] += emberVel[i3 + 1] * dt;
      emberPos[i3 + 2] += emberVel[i3 + 2] * dt;
      if (emberPos[i3 + 1] < 0.05) emberPos[i3 + 1] = 0.05; /* skim, never land */
      var k = Math.max(0, emberLife[i] / emberLifeMax[i]);
      /* white-hot -> ember -> black (additive: black is a free kill) */
      emberCol[i3] = 3.2 * Math.pow(k, 1.1);
      emberCol[i3 + 1] = 2.4 * Math.pow(k, 1.9);
      emberCol[i3 + 2] = 1.5 * Math.pow(k, 3.2);
      if (emberLife[i] <= 0) {
        emberCol[i3] = emberCol[i3 + 1] = emberCol[i3 + 2] = 0;
        emberPos[i3 + 1] = -5; /* park dead points under the desk */
      }
    }
    if (anyAlive) {
      emberGeom.attributes.position.needsUpdate = true;
      emberGeom.attributes.color.needsUpdate = true;
    } else {
      emberPoints.visible = false;
    }
  }
  function novaUpdateSmoke(dt) {
    if (novaSmokeClock < 0) return;
    novaSmokeClock += dt;
    var t = novaSmokeClock;
    var k = Math.min(1, t / 1.6);
    for (var i = 0; i < NOVA_SMOKE; i++) {
      var s = novaSmoke[i];
      var ang = (i / NOVA_SMOKE) * Math.PI * 2 + 0.4;
      s.position.set(
        sealOrigin.x + Math.cos(ang) * (0.1 + 0.34 * k),
        sealOrigin.y + (0.22 + 0.75 * k) * (0.7 + 0.3 * Math.sin(i * 2.1)),
        sealOrigin.z + Math.sin(ang) * (0.1 + 0.34 * k));
      var sc = 0.28 + 0.95 * k;
      s.scale.set(sc, sc, 1);
      s.material.opacity = 0.5 * novaSmooth(0.05, 0.35, t) *
        Math.exp(-Math.max(0, t - 0.8) * 1.6);
    }
    if (t > 2.6) {
      novaSmokeClock = -1;
      for (var j = 0; j < NOVA_SMOKE; j++) novaSmoke[j].visible = false;
    }
  }

  /* ---- trauma camera (Eiserohl grammar, roll-dominant for top-down) ---- */
  var novaNoiseT = 0;
  function novaNoise1(x, seed) {
    var i = Math.floor(x), f = x - i;
    var h = function (n) {
      var s = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453;
      return s - Math.floor(s);
    };
    var u = f * f * (3 - 2 * f);
    return h(i) * (1 - u) + h(i + 1) * u;
  }
  function novaApplyCamera(clk, dt) {
    novaNoiseT += dt;
    var trauma = (clk >= 0) ? novaTraumaAt(clk) : 0;
    var shake = trauma * trauma;
    if (shake > 0.0004) {
      var sn = shake / 0.9025; /* normalized to the 0.95 trauma ceiling */
      var tt = novaNoiseT * 28; /* ~28 Hz: above drift, below buzz */
      camera.position.x += 0.020 * (novaNoise1(tt, 5.1) - 0.5) * 2 * sn;
      camera.position.y += 0.034 * (novaNoise1(tt, 9.4) - 0.5) * 2 * sn;
      camera.position.z += 0.020 * (novaNoise1(tt, 15.8) - 0.5) * 2 * sn;
      camera.rotateZ(0.085 * (novaNoise1(tt, 11.3) - 0.5) * 2 * sn);
      camera.rotateX(0.045 * (novaNoise1(tt, 27.7) - 0.5) * 2 * sn);
      camera.rotateY(0.045 * (novaNoise1(tt, 41.9) - 0.5) * 2 * sn);
      camera.fov = novaBaseFov + 8 * sn;
      camera.updateProjectionMatrix();
    } else if (camera.fov !== novaBaseFov) {
      camera.fov = novaBaseFov;
      camera.updateProjectionMatrix();
    }
  }

  /* ---- the frame-by-frame application (live update + staging share it) */
  function novaApply(clk, dt) {
    if (clk < 0) return;
    sealFxScale = novaTimeScaleAt(clk);
    var g = novaGAt(clk);
    var front = novaFrontAt(clk);

    /* fake-GI quartet */
    novaLight.intensity = novaLightAt(clk);
    hemiLight.intensity = novaBaseHemi * (1 + 3.2 * g);
    scene.fog.color.copy(novaBaseFogColor).lerp(novaFogFlood, 0.72 * g);
    scene.fog.density = novaBaseFogDensity + 0.065 * g;
    novaSharedU.uNovaG.value = g;
    novaSharedU.uNovaFrontM.value = front;

    /* exposure arc (camChase wrote the base grade earlier this frame) */
    renderer.toneMappingExposure *= novaExpMulAt(clk);

    /* vaporization */
    var f01 = novaFront01At(clk);
    novaU.uNovaFront01.value = f01;
    novaU.uNovaEdgeGlow.value = 10 * novaSmooth(0.09, 0.18, clk) *
      Math.exp(-Math.max(0, clk - 0.55) * 2.4);
    if (clk > 0.9 && sealMesh.visible) sealMesh.visible = false;
    if (ribbonMesh) {
      ribbonMat.opacity = Math.max(0, 1 - f01 * 1.5);
      ribbonMesh.scale.setScalar(1 + 0.06 * f01);
      if (f01 >= 0.99 && ribbonMesh.visible) ribbonMesh.visible = false;
    }

    /* shells */
    var ca = novaCoreAAt(clk);
    novaCore.visible = ca > 0.004;
    novaCoreMat.uniforms.uAlpha.value = ca;
    novaCore.scale.setScalar(novaCoreRAt(clk));
    var sa = novaShellAAt(clk);
    novaShell.visible = sa > 0.004;
    novaShellMat.uniforms.uAlpha.value = sa;
    novaShell.scale.setScalar(Math.min(4.2, Math.max(0.3, front)));

    /* desk pool: fast expanding radial flash on the desk under the seal, decays before unroll */
    var pe = 1.35 * novaSmooth(0.09, 0.35, clk) * Math.exp(-Math.max(0, clk - 0.45) * 5.0);
    novaPool.visible = pe > 0.01 && sealPhase === "burst";
    novaPoolMat.uniforms.uFront.value = front;
    novaPoolMat.uniforms.uE.value = pe;

    /* screen-space flood */
    if (novaCompose) {
      _sealCenterNdc.copy(sealOrigin).project(camera);
      novaCompose.uniforms.uSunUv.value.set(
        _sealCenterNdc.x * 0.5 + 0.5, _sealCenterNdc.y * 0.5 + 0.5);
      novaCompose.uniforms.uAspect.value = window.innerWidth / Math.max(1, window.innerHeight);
      novaCompose.uniforms.uMetersPerUv.value =
        2 * Math.tan(camera.fov * Math.PI / 360) * camera.position.distanceTo(sealOrigin);
      var nFloodE = 1.05 * novaSmooth(0.09, 0.2, clk) * Math.exp(-Math.max(0, clk - 0.9) * 2.0);
      var nCoreGlow = 1.15 * novaSmooth(0, 0.03, clk) * Math.exp(-clk * 2.9);
      novaCompose.uniforms.uFloodE.value = nFloodE;
      novaCompose.uniforms.uCoreGlow.value = nCoreGlow;
      novaCompose.enabled = (nFloodE > 0.001 || nCoreGlow > 0.001);
    }

    if (dt > 0) {
      if (emberPoints.visible) novaUpdateEmbers(dt * sealFxScale);
      novaUpdateSmoke(dt * sealFxScale);
    }
  }

  function novaUpdate(dt) {
    sealFx.waitClock += dt;
    if (sealFx.charge >= 0) sealFx.charge += dt;
    if (sealFx.clock >= 0) sealFx.clock += dt;

    /* charge beat: the pull-back window IS the riser's visual twin — the
       wax gathers light, breathes harder, the frame creeps brighter. */
    if (sealFx.clock < 0 && sealFx.charge >= 0) {
      var ck = Math.min(1, sealFx.charge / 0.59);
      var swell = ck * ck;
      sealUniforms.uPulse.value = Math.max(sealUniforms.uPulse.value, 1 + 3.2 * swell);
      if (sealLight) sealLight.intensity = 1.1 + 20 * swell * swell;
      renderer.toneMappingExposure += 0.3 * swell * swell;
      novaCore.visible = true;
      novaCore.position.copy(sealMesh.position);
      novaCoreMat.uniforms.uAlpha.value = 0.22 * swell;
      novaCore.scale.setScalar(0.08 + 0.09 * swell);
      return;
    }

    if (sealFx.clock >= 0) {
      novaApply(sealFx.clock, dt);
      novaApplyCamera(sealFx.clock, dt);
    }
  }

  /* ---------- Ignition ---------- */
  function sealFxIgnite(origin) {
    sealFx.clock = 0;
    sealFx.charge = -1;
    sealFx.live = true;
    sealOrigin.copy(origin);
    novaCore.position.copy(origin);
    novaShell.position.copy(origin);
    novaLight.position.set(origin.x, origin.y + 0.55, origin.z);
    novaLight.visible = true;
    novaPool.position.set(origin.x, 0.078, origin.z);
    novaSharedU.uNovaXZ.value.set(origin.x, origin.z);
    novaIgniteEmbers(origin);
    novaSmokeClock = 0;
    for (var i = 0; i < NOVA_SMOKE; i++) novaSmoke[i].visible = true;
  }

  /* ---------- Capture hooks (the frozen-dwell base stays clean) -------- */
  function sealFxHideForCapture() {
    sealFx.captureSaved = {
      fogColor: scene.fog.color.clone(),
      fogDensity: scene.fog.density,
      hemi: hemiLight.intensity,
      novaG: novaSharedU.uNovaG.value,
      novaFrontM: novaSharedU.uNovaFrontM.value,
      vis: []
    };
    var objs = [novaCore, novaShell, novaPool, novaLight];
    for (var i = 0; i < NOVA_SMOKE; i++) objs.push(novaSmoke[i]);
    for (var j = 0; j < objs.length; j++) {
      sealFx.captureSaved.vis.push([objs[j], objs[j].visible]);
      objs[j].visible = false;
    }
    novaSharedU.uNovaG.value = 0;
    novaSharedU.uNovaFrontM.value = 0;
    scene.fog.color.copy(novaBaseFogColor);
    scene.fog.density = novaBaseFogDensity;
    hemiLight.intensity = novaBaseHemi;
  }
  function sealFxRestoreAfterCapture() {
    var s = sealFx.captureSaved;
    if (!s) return;
    scene.fog.color.copy(s.fogColor);
    scene.fog.density = s.fogDensity;
    hemiLight.intensity = s.hemi;
    novaSharedU.uNovaG.value = s.novaG;
    novaSharedU.uNovaFrontM.value = s.novaFrontM;
    for (var i = 0; i < s.vis.length; i++) s.vis[i][0].visible = s.vis[i][1];
    sealFx.captureSaved = null;
  }

  /* ---------- Reset (staging/reload) ---------- */
  function sealFxResetScene() {
    sealFx.clock = -1;
    sealFx.charge = -1;
    sealFx.live = false;
    sealFxScale = 1;
    novaU.uNovaFront01.value = 0;
    novaU.uNovaEdgeGlow.value = 0;
    novaSharedU.uNovaG.value = 0;
    novaSharedU.uNovaFrontM.value = 0;
    scene.fog.color.copy(novaBaseFogColor);
    scene.fog.density = novaBaseFogDensity;
    hemiLight.intensity = novaBaseHemi;
    novaLight.intensity = 0;
    novaLight.visible = false;
    novaCore.visible = false;
    novaShell.visible = false;
    novaPool.visible = false;
    novaCoreMat.uniforms.uAlpha.value = 0;
    novaShellMat.uniforms.uAlpha.value = 0;
    novaSmokeClock = -1;
    for (var i = 0; i < NOVA_SMOKE; i++) {
      novaSmoke[i].visible = false;
      novaSmoke[i].material.opacity = 0;
    }
    for (var e = 0; e < EMBER_COUNT; e++) emberLife[e] = 0;
    emberPoints.visible = false;
    ribbonMat.opacity = 1;
    if (ribbonMesh) {
      ribbonMesh.visible = true;
      ribbonMesh.scale.setScalar(1);
    }
    sealMesh.visible = true;
    sealMesh.scale.setScalar(1);
    camera.fov = novaBaseFov;
    camera.updateProjectionMatrix();
    if (novaCompose) {
      novaCompose.uniforms.uFloodE.value = 0;
      novaCompose.uniforms.uCoreGlow.value = 0;
    }
    sealPhase = "wait";
  }

  /* ---------- Deterministic integration for staged frames ---------- */
  function sealFxIntegrate(seconds) {
    var step = 1 / 60;
    for (var acc = 0; acc < seconds; acc += step) {
      var clk = sealFx.clock + acc;
      var sdt = step * novaTimeScaleAt(clk);
      if (emberPoints.visible) novaUpdateEmbers(sdt);
      novaUpdateSmoke(sdt);
    }
    sealFx.clock += seconds;
  }

  function sealFxStageShot(moment) {
    sealFxResetScene();
    shotFrozen = true;
    if (moment === "pre") {
      sealFx.waitClock = 2.2;
      setCamSeal(1);
      sealUniforms.uPulse.value = 1.35;
    } else {
      var target = (moment === "break") ? 0.14 : 0.45;
      setCamSeal(0);
      sealMesh.getWorldPosition(sealOrigin);
      sealBroken = true;
      sealFx.clock = 0;
      sealFxIgnite(sealOrigin);
      sealPhase = "burst";
      sealFxIntegrate(target);
      novaApply(sealFx.clock, 0);
      novaNoiseT = target;
      novaApplyCamera(target, 0);
      sealFxStagedExposure = 1.38 * novaExpMulAt(target);
      renderer.toneMappingExposure = sealFxStagedExposure;
    }
    window.__shotReady = true;
  }
  window.__sealShot = function (m) {
    sealFxStageShot(m || "flood");
    return "staged " + (m || "flood");
  };
  window.__sealFx = sealFx;

  /* Compile the nova materials behind the loader (renderer.compile only
     sees VISIBLE objects — same rule as every other hidden system). */
  (function () {
    var objs = [novaCore, novaShell, novaPool];
    for (var i = 0; i < NOVA_SMOKE; i++) objs.push(novaSmoke[i]);
    for (var j = 0; j < objs.length; j++) objs[j].visible = true;
    novaLight.visible = true;
    try { renderer.compile(scene, camera); } catch (e) {}
    for (var k = 0; k < objs.length; k++) objs[k].visible = false;
    novaLight.visible = false;
  })();

  /* Cinematic approach (owner, issue-18 rework): after the loader dissolves     the camera pushes in from the wide desk to the seal's close-up — the
     stamped OPEN and the ember pulse are the whole show until the break. */
  function startSealApproach() {
    if (sealFxShot) { sealFxStageShot(sealFxShot); return; }
    if (dead || sealBroken || sealPhase !== "pre") return;
    sealPhase = "approach";
    var push = { k: 0 };
    window.gsap.to(push, {
      k: 1, duration: 1.9, ease: "power2.inOut",
      onUpdate: function () { setCamSeal(push.k); },
      onComplete: function () {
        sealPhase = "wait";
        if (sealFxAutobreak > 0) {
          window.gsap.delayedCall(sealFxAutobreak, function () { breakSeal(); });
        }
      }
    });
  }

  function breakSeal() {
    if (sealBroken) return;
    sealBroken = true;
    sealPhase = "pulling";
    holder.style.pointerEvents = "auto"; /* stray clicks die here until handoff */

    /* Web Audio unlocks synchronously inside the gesture tick (WebKit drops
       activation across async boundaries). The crack SFX itself waits for
       the visual fracture at the end of the pull-back, so sound and
       picture land on the same frame. */
    if (T && T.unlockAudio) T.unlockAudio();
    if (T && T.preloadMusic) T.preloadMusic();

    var sealTriggerBtn = document.getElementById("seal-trigger");
    if (sealTriggerBtn) sealTriggerBtn.hidden = true;
    document.body.classList.remove("seal-interactive");
    sealHover = 0;
    sealHoverTarget = 0;

    sealFx.charge = 0; /* the pull-back IS the riser's visual twin */
    if (T) T.novaRiser(0.52);
    breakSealGo();
  }
  /* 1. Quick smooth pull-back to the wide desk framing — an authored
        ease, never a cut. Reverses from wherever the approach stands. */
  function breakSealGo() {
    var pull = { k: sealMix };
    window.gsap.to(pull, {
      k: 0, duration: 0.52, ease: "power2.inOut",
      onUpdate: function () { setCamSeal(pull.k); },
      onComplete: function () {
        sealPhase = "burst";
        /* The tick parks the scene on its next frame (burst branch), then
           burstSealNow fires behind one cheap parked frame — the capture's
           single heavy render never lands on a fracture frame. */
        window.gsap.delayedCall(0.07, burstSealNow);
      }
    });
  }

  function burstSealNow() {
    if (sealPhase !== "burst") return;

    /* 2. The wax stays — it VAPORIZES as the front crosses it (owner
          round 6: no shards, no mess). The nova owns light from here. */
    sealMesh.getWorldPosition(sealOrigin);
    if (sealLight) sealLight.visible = false;
    sealUniforms.uPulse.value = 1;
    sealFxIgnite(sealOrigin);
    applyQuadKick();
    /* Crackle lands instantly with the fracture, followed by nova boom at hit-stop exit (0.09s) */
    if (T && T.sealCrack) T.sealCrack(1.2);
    if (window.gsap && T) {
      window.gsap.delayedCall(0.09, function () { T.novaBoom(); });
      window.gsap.delayedCall(0.62, function () { if (T) T.crackle(0.5); });
      window.gsap.delayedCall(1.05, function () { if (T) T.crackle(0.35); });
    }

    /* 3. The shockwave is IN the scene now: two HDR light rings sweeping
          the desk plus the ember shower, all feeding the bloom pass — no
          DOM overlay can read as physical light. */

    /* 4. Seam flash: the kindle appears under the flare peak (ADR-0017),
          then the flare decays. The heavy work — track fetch/decode, DOM —
          lives behind async boundaries off this tick. */
    var kindle = document.getElementById("kindle");
    if (!sealFxShot) {
      /* the DOM kindle reveals OUT of the receding flood (t+0.35s),
         never popping on top of the white-out */
      window.gsap.delayedCall(0.35, function () {
        if (kindle) kindle.hidden = false;
        if (T) T.kindleAfterSeal();
      });
    } else if (kindle) {
      kindle.hidden = false;
    }

    /* 5. Hold the burst beat while the flood settles,
          then hand to the authored dolly. */
    window.gsap.delayedCall(1.0, function () {
      sealPhase = "intro";
      if (novaPool) novaPool.visible = false;
      isParked = false;
      dwellStillMs = 0;
      startIntro();
    });
  }

  window.addEventListener("pointermove", function (ev) {
    if (sealBroken) return;
    var over = checkSealHover(ev.clientX, ev.clientY);
    if (over !== isHoveringSeal) {
      isHoveringSeal = over;
      sealHoverTarget = over ? 1 : 0;
      document.body.classList.toggle("seal-interactive", over);
    }
  }, { passive: true });

  function handleSealInteraction(ev) {
    if (sealBroken) return;
    /* WHATWG §6.4: touch pointerdown grants no activation — touch breaks
       the seal on pointerup instead (audio-activation research §1.1). */
    if (ev.type === "pointerdown" && ev.pointerType !== "mouse") {
      return;
    }
    if (checkSealHover(ev.clientX, ev.clientY)) {
      ev.preventDefault();
      breakSeal();
    }
  }

  window.addEventListener("pointerdown", handleSealInteraction);
  window.addEventListener("pointerup", function (ev) {
    if (ev.pointerType !== "mouse") handleSealInteraction(ev);
  });

  var sealTriggerBtn = document.getElementById("seal-trigger");
  if (sealTriggerBtn) {
    sealTriggerBtn.addEventListener("click", function (ev) {
      ev.preventDefault();
      breakSeal();
    });
  }

  var open = 1;
  function layRoll() {
    var leadZ = TOPZ + TH * open;
    /* The rolled remainder winds ONTO its rod as it pays out: the paper
       wrap shrinks around the concentric dowel as the sheet grows (real
       scroll physics — user). At rest the scroll is ONE object: spiral
       roll with the rod's knobbed ends protruding; the head rod only
       appears once the sheet unrolls past it. */
    var s = 0.5 + 0.5 * (1 - open);
    roll.scale.set(1, s, s);
    lowDowel.position.set(0, 0, 0);
    rollGroup.position.set(0, 0.06 + 0.34 * s, leadZ + 0.12);
    topDowel.visible = true;
    /* The roll spins as it lays paper: length / radius radians total. */
    roll.rotation.x = open * (TH / 0.34);
    plane.scale.y = Math.max(open, 0.001);
    /* A 0.001-scale plane still renders as a bright 1px sliver under the
       roll — hide it entirely until the unroll begins (critic P2). */
    plane.visible = open > 0.01;
    var pos = planeGeo.attributes.position;
    for (var i = 0; i < pos.count; i++) {
      var d = base[i * 3 + 1] + TH * open; /* distance ahead of the moving edge */
      var d2 = d * d;
      /* Peel curl: tight and low, hugging the roll — not a traveling wave. */
      var curl = d2 < 1.4 ? 0.38 * Math.exp(-d2 / 0.12) : 0;
      /* Gentle precomputed static drape so the sheet never reads as a flat decal. */
      var z = (curl + staticDrape[i]) * open;
      pos.setZ(i, base[i * 3 + 2] + z);
    }
    pos.needsUpdate = true;
    /* Compute normal on rest or throttled during active motion */
    if (open >= 0.99 || (Math.round(open * 100) % 6 === 0)) {
      planeGeo.computeVertexNormals();
    }
  }

  /* ---------- Candles: iron tripod + tall wax + drips + GLSL flames ---
     Big enough to READ as candles from the steep top-down camera (the
     old small wax + hot pool read as two glowing orbs). ---------- */
  var iron = new THREE.MeshStandardMaterial({ color: 0x2a2019, roughness: 0.62, metalness: 0.5 });
  /* Wax skin, generated once and shared by both candles. A height field
     (horizontally+vertically wrapped value noise, vertical melt ridges
     with beads) is baked into FOUR maps: albedo, tangent-space normal
     (Sobel — bump maps barely register at grazing angles), roughness
     variation, and a wick-side emissive gradient. The old 128px bump
     canvas left a single smooth GGX streak down a featureless cylinder —
     exactly the "metal" signature (research Finding 2). */
  var waxTex = (function () {
    var W = 256, H = 512;
    var height = new Float32Array(W * H);
    /* Wrap-in-both-axes value noise: integer cells across W and 2*cells
       across H, so the map tiles when repeated 3x2. */
    function lattice(cx, cy) {
      var s = Math.sin(cx * 127.1 + cy * 311.7) * 43758.5453;
      return s - Math.floor(s);
    }
    function vnoise(u, v, cells) { /* u,v in [0,1) */
      var x = u * cells, y = v * cells * 2;
      var x0 = Math.floor(x), y0 = Math.floor(y);
      var fx = x - x0, fy = y - y0;
      fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
      var c0 = lattice(x0 % cells, y0 % (cells * 2));
      var c1 = lattice((x0 + 1) % cells, y0 % (cells * 2));
      var c2 = lattice(x0 % cells, (y0 + 1) % (cells * 2));
      var c3 = lattice((x0 + 1) % cells, (y0 + 1) % (cells * 2));
      return c0 + (c1 - c0) * fx + (c2 - c0) * fy + (c0 - c1 - c2 + c3) * fx * fy;
    }
    var OCT = [[4, 0.42], [8, 0.27], [16, 0.18], [32, 0.13]];
    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W; x++) {
        var h = 0;
        for (var o = 0; o < OCT.length; o++) h += vnoise(x / W, y / H, OCT[o][0]) * OCT[o][1];
        height[y * W + x] = h;
      }
    }
    /* Melt ridges: thin vertical runs of higher wax, bead at the foot. */
    for (var d = 0; d < 14; d++) {
      var dx = Math.floor(Math.random() * W);
      var w = 2 + Math.floor(Math.random() * 5);
      var y0 = Math.floor(Math.random() * H * 0.3);
      var y1 = y0 + Math.floor(H * (0.35 + Math.random() * 0.55));
      for (var yy = y0; yy < Math.min(H, y1); yy++) {
        for (var xx = -w; xx <= w; xx++) {
          var fx = dx + xx;
          var xi = ((fx % W) + W) % W;
          var fall = 1 - (xx * xx) / (w * w + 1);
          height[yy * W + xi] += 0.16 * fall;
        }
      }
      var bx = ((dx % W) + W) % W, by = Math.min(H - 1, y1);
      var br = 4 + Math.random() * 4;
      for (var byy = -br; byy <= br; byy++) {
        for (var bxx = -br; bxx <= br; bxx++) {
          var px = ((bx + bxx) % W + W) % W;
          var py = by + byy;
          if (py < 0 || py >= H) continue;
          var dist = Math.sqrt(bxx * bxx + byy * byy) / br;
          if (dist <= 1) height[py * W + px] += 0.3 * (1 - dist * dist);
        }
      }
    }
    function canvasTex(fill, srgb) {
      var c = document.createElement("canvas");
      c.width = W; c.height = H;
      fill(c.getContext("2d"));
      var t = new THREE.CanvasTexture(c);
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(3, 2);
      return t;
    }
    /* Albedo: warm wax, lit-side tone follows the height field. */
    var color = canvasTex(function (g) {
      var img = g.createImageData(W, H);
      for (var i = 0; i < W * H; i++) {
        var hv = Math.min(1, Math.max(0, height[i] / 1.15));
        var r = 236 + hv * 19, gg = 224 + hv * 20, b = 196 + hv * 22;
        img.data[i * 4] = r; img.data[i * 4 + 1] = gg;
        img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = 255;
      }
      g.putImageData(img, 0, 0);
    }, true);
    /* Tangent-space normal from a wrapped Sobel over the height field. */
    var normal = canvasTex(function (g) {
      var img = g.createImageData(W, H);
      var K = 2.4;
      for (var y = 0; y < H; y++) {
        for (var x = 0; x < W; x++) {
          var xm = (x - 1 + W) % W, xp = (x + 1) % W;
          var ym = (y - 1 + H) % H, yp = (y + 1) % H;
          var gx = height[y * W + xp] - height[y * W + xm];
          var gy = height[yp * W + x] - height[ym * W + x];
          var nz = 1 / Math.sqrt(gx * gx * K * K + gy * gy * K * K + 1);
          var i = (y * W + x) * 4;
          img.data[i] = (0.5 - gx * K * nz * 0.5) * 255;
          img.data[i + 1] = (0.5 - gy * K * nz * 0.5) * 255;
          img.data[i + 2] = (nz * 0.5 + 0.5) * 255;
          img.data[i + 3] = 255;
        }
      }
      g.putImageData(img, 0, 0);
    }, false);
    /* Roughness: crevices matte, ridges polished — breaks the lobe into
       patches instead of one coherent streak. */
    var rough = canvasTex(function (g) {
      var img = g.createImageData(W, H);
      for (var i = 0; i < W * H; i++) {
        var hv = Math.min(1, Math.max(0, height[i] / 1.15));
        var v = Math.round((0.92 - hv * 0.42) * 255);
        img.data[i * 4] = v; img.data[i * 4 + 1] = v;
        img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255;
      }
      g.putImageData(img, 0, 0);
    }, false);
    /* Glow: warm near the wick (canvas top = cylinder top), fading out by
       ~20% down — the wax reads lit-from-within where light can't reach. */
    var glow = canvasTex(function (g) {
      var img = g.createImageData(W, H);
      for (var y = 0; y < H; y++) {
        var fall = Math.max(0, 1 - (y / H) / 0.2);
        fall = fall * fall;
        for (var x = 0; x < W; x++) {
          var i = (y * W + x) * 4;
          img.data[i] = Math.round(255 * fall);
          img.data[i + 1] = Math.round(120 * fall);
          img.data[i + 2] = Math.round(38 * fall);
          img.data[i + 3] = 255;
        }
      }
      g.putImageData(img, 0, 0);
    }, true);
    return { color: color, normal: normal, rough: rough, glow: glow };
  })();
  /* Physical wax (shared by both candles): sheen gives the soft grazing
     scatter that reads "wax not plastic", half specular intensity kills
     the dielectric glint, the maps break the highlight into patches, and
     the wick-side glow gradient reads lit-from-within (research Verdict).
     Transmission was rejected: r160 renders the whole opaque scene a
     second time every frame for it, and wax is a scattering medium, not
     a refracting one. */
  var waxMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, metalness: 0, roughness: 0.72,
    map: waxTex.color, roughnessMap: waxTex.rough, normalMap: waxTex.normal,
    normalScale: new THREE.Vector2(0.5, 0.5),
    sheen: 0.4, sheenColor: 0xfff0cc, sheenRoughness: 0.9,
    specularIntensity: 0.5, clearcoat: 0,
    emissive: 0xff9a3c, emissiveIntensity: 0.16, emissiveMap: waxTex.glow
  });
  /* Fake SSS on top: wrapped diffuse + the GDC-2011 back-transmittance
     term, injected by patching the r160 lights chunk at compile time.
     THREE.ShaderChunk.lights_fragment_begin is synchronous in memory,
     eliminating all runtime CDN imports. */
  var patched = THREE.ShaderChunk.lights_fragment_begin.replace(/RE_Direct\(/g, "RE_Direct_Wax(");
  waxMat.onBeforeCompile = function (shader) {
    shader.uniforms.uWrap = { value: 0.5 };
    shader.uniforms.uWrapStrength = { value: 0.35 };
    shader.uniforms.uTransPower = { value: 2.0 };
    shader.uniforms.uTransScale = { value: 0.8 };
    shader.uniforms.uThickness = { value: 0.45 };
    /* The wrapper (uniforms + function) must live at GLOBAL scope —
       lights_fragment_begin sits INSIDE main(), where declarations are
       illegal. Appending after lights_physical_pars_fragment puts it
       after RE_Direct's own definition and before main. */
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <lights_physical_pars_fragment>",
      [
        "#include <lights_physical_pars_fragment>",
        "uniform float uWrap, uWrapStrength, uTransPower, uTransScale, uThickness;",
        "void RE_Direct_Wax( const in IncidentLight directLight,",
        "    const in vec3 geometryPosition, const in vec3 geometryNormal,",
        "    const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal,",
        "    const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {",
        "  RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir,",
        "             geometryClearcoatNormal, material, reflectedLight );",
        "  float dotNL = dot( geometryNormal, directLight.direction );",
        "  float wrapped = saturate( ( dotNL + uWrap ) / ( 1.0 + uWrap ) );",
        "  float lambert = saturate( dotNL );",
        "  reflectedLight.directDiffuse += directLight.color",
        "    * BRDF_Lambert( material.diffuseColor )",
        "    * ( wrapped - lambert ) * uWrapStrength;",
        "  vec3 scatteringHalf = normalize( directLight.direction + ( geometryNormal * 0.4 ) );",
        "  float scatteringDot = pow( saturate( dot( geometryViewDir, -scatteringHalf ) ), uTransPower ) * uTransScale;",
        "  reflectedLight.directDiffuse += ( scatteringDot + 0.05 ) * uThickness",
        "    * directLight.color * material.diffuseColor;",
        "}"
      ].join("\n")
    );
    /* Inside main: route the chunk's light calls through the wrapper. */
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <lights_fragment_begin>", patched
    );
  };
  waxMat.customProgramCacheKey = function () { return "wax-sss-v1"; };
  function makeCandle(x, z, waxH) {
    var g = new THREE.Group();
    var dish = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.8, 0.12, 22), iron);
    dish.position.y = 0.55;
    dish.castShadow = true;
    g.add(dish);
    for (var i = 0; i < 3; i++) {
      var a = (i / 3) * Math.PI * 2 + 0.5;
      var leg = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.09, 0.66, 8), iron);
      leg.position.set(Math.cos(a) * 0.42, 0.26, Math.sin(a) * 0.42);
      leg.rotation.z = Math.cos(a) * 0.5;
      leg.rotation.x = -Math.sin(a) * 0.5;
      leg.castShadow = true;
      g.add(leg);
    }
    var wax = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.5, waxH, 22), waxMat);
    wax.position.y = 0.62 + waxH / 2;
    wax.castShadow = true;
    g.add(wax);
    /* Melted rim + drips so the silhouette says "candle", not "pillar". */
    var rim = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.055, 10, 26), waxMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.62 + waxH - 0.1;
    g.add(rim);
    for (var dp = 0; dp < 3; dp++) {
      var da = dp * 2.2 + x;
      var drip = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 10), waxMat);
      drip.scale.y = 2 + (dp % 2);
      drip.position.set(Math.cos(da) * 0.45, 0.62 + waxH - 0.28 - dp * 0.22, Math.sin(da) * 0.45);
      g.add(drip);
    }
    var wick = new THREE.Mesh(
      new THREE.CylinderGeometry(0.032, 0.032, 0.2, 6),
      new THREE.MeshStandardMaterial({ color: 0x14100b })
    );
    wick.position.y = 0.62 + waxH + 0.06;
    g.add(wick);
    g.position.set(x, 0, z);
    scene.add(g);
    return g;
  }
  var candleL = makeCandle(-5.4, -2.2, 2.3);
  var candleR = makeCandle(5.4, -2.2, 1.95);
  flameLight.position.set(-5.4, 3.15, -2.2);
  flameLight2.position.set(5.4, 2.8, -2.2);

  var flameUniforms = [];
  function makeFlame(x, z, seed, y) {
    var flameY = y || 2.82;
    var u = {
      uTime: { value: 0 },
      uSeed: { value: seed }
    };
    var mat = new THREE.ShaderMaterial({
      uniforms: u,
      vertexShader: [
        "varying vec2 vUv;",
        "uniform float uTime;",
        "void main() {",
        "  vUv = uv;",
        "  vec3 p = position;",
        "  float sway = sin(uTime * 3.1 + uv.y * 5.0) * 0.05 * uv.y * uv.y;",
        "  p.x += sway;",
        "  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);",
        "}"
      ].join("\n"),
      fragmentShader: [
        "varying vec2 vUv;",
        "uniform float uTime;",
        "uniform float uSeed;",
        "float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }",
        "float noise(vec2 p) {",
        "  vec2 i = floor(p); vec2 f = fract(p);",
        "  vec2 u = f * f * (3.0 - 2.0 * f);",
        "  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),",
        "             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);",
        "}",
        "float fbm(vec2 p) {",
        "  float v = 0.0; float a = 0.5;",
        "  for (int i = 0; i < 3; i++) { v += a * noise(p); p *= 2.13; a *= 0.5; }",
        "  return v;",
        "}",
        "void main() {",
        "  vec2 uv = vUv;",
        "  vec2 c = vec2(uv.x - 0.5, uv.y);",
        "  float t = uTime * 1.7 + uSeed;",
        "  float n = fbm(vec2(c.x * 3.2 + uSeed, uv.y * 4.5 - t * 2.3));",
        "  float body = uv.y + n * 0.26 - 0.03;",
        "  float r = 0.30 * (1.0 - body * 0.72);",
        "  float flame = smoothstep(r, r * 0.4, abs(c.x) * (1.0 + body * 0.6));",
        "  flame *= smoothstep(1.02, 0.5, uv.y) * smoothstep(-0.02, 0.14, uv.y);",
        "  float core = smoothstep(r * 0.55, 0.0, abs(c.x) * (1.0 + body * 0.85))",
        "             * smoothstep(0.92, 0.15, uv.y);",
        "  vec3 col = mix(vec3(1.0, 0.42, 0.08), vec3(1.0, 0.70, 0.24), flame);",
        "  col = mix(col, vec3(1.0, 0.96, 0.86), core * 0.92);",
        "  float a = clamp(flame * 0.85 + core * 0.55, 0.0, 1.0);",
        "  /* HDR push: the bloom high-pass (threshold 1.5, linear space)",
        "     must be passed by the flames ALONE — the desk stays below it */",
        "  gl_FragColor = vec4(col * a * 2.6, a);",
        "}"
      ].join("\n"),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    var m = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.95), mat);
    m.position.set(x, flameY, z);
    scene.add(m);
    flameUniforms.push(u);
    return m;
  }
  var flameL = makeFlame(-5.4, -2.2, 0.0, 3.18);
  var flameR = makeFlame(5.4, -2.2, 17.3, 2.82);
  flameLight.position.set(-5.4, 3.2, -2.2);
  flameLight2.position.set(5.4, 2.85, -2.2);
  bodyLight.position.set(-5.4, 3.0, -2.2);
  bodyLight2.position.set(5.4, 2.65, -2.2);
  /* Additive halos around the flames: the flame shader renders the fire,
     the halo sells "this is the light source" at a glance (research
     Finding 3 — the eye accepts brightness, not desynced brightness). */
  var haloTex = (function () {
    var c = document.createElement("canvas");
    c.width = c.height = 128;
    var g = c.getContext("2d");
    var rg = g.createRadialGradient(64, 64, 2, 64, 64, 62);
    rg.addColorStop(0, "rgba(255,214,150,0.9)");
    rg.addColorStop(0.25, "rgba(255,166,80,0.42)");
    rg.addColorStop(0.6, "rgba(255,132,48,0.13)");
    rg.addColorStop(1, "rgba(255,120,40,0)");
    g.fillStyle = rg;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  })();
  function makeHalo(x, y, z, s) {
    var sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: haloTex, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, opacity: 0.55
    }));
    sp.position.set(x, y, z);
    sp.scale.set(s, s, 1);
    scene.add(sp);
    return sp;
  }
  var haloL = makeHalo(-5.4, 3.2, -2.2, 1.7);
  var haloR = makeHalo(5.4, 2.85, -2.2, 1.5);

  /* ---------- Desk dressing: loose sheets (inkwell/quill/stamp removed 2026-10-13) -- */
  /* Static contact shadows: the props sit outside the spot pools, so a
     cheap dark blob under each keeps them from floating (critic pass 2). */
  var blobTex = (function () {
    var c = document.createElement("canvas");
    c.width = c.height = 128;
    var g = c.getContext("2d");
    var rg = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    rg.addColorStop(0, "rgba(8,5,2,0.55)");
    rg.addColorStop(0.6, "rgba(8,5,2,0.28)");
    rg.addColorStop(1, "rgba(8,5,2,0)");
    g.fillStyle = rg;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  })();
  function blob(x, z, sx, sz) {
    var m = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false })
    );
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = Math.random() * 3;
    m.scale.set(sx, sz, 1);
    m.position.set(x, 0.012, z);
    scene.add(m);
    return m;
  }
  blob(-5.4, -2.2, 2.1, 2.1);
  blob(5.4, -2.2, 2.1, 2.1);
  blob(-3.75, -0.1, 2.2, 3.2);

  /* The inkwell, quill, and seal stamp were REMOVED (owner 2026-10-13:
     "remove these elements from the table, I don't want it" — with crops
     of the inkwell+quill pair and the stamp). Their construction, their
     materials (glass/featherMat/brass), and their three contact-shadow
     blobs went with them. The loose sheets stay. */

  var looseSheets = new THREE.Group();
  var sheetPainted = [];
  /* Ink content for the loose sheets (user round 5b: "add some artwork
     to the cards to give them character"): quill-style scribbles — a
     letter, a rough map, a sigil page. Deterministic per sheet (seeded
     LCG) so the grain repaint redraws the SAME art, not a new one. */
  function doodleSheet(g, w, h, kind, seed) {
    var s = 1234 + seed * 77;
    function rnd() { s = (s * 16807) % 2147483647; return s / 2147483647; }
    var ink = "rgba(56,38,18,0.8)";
    g.strokeStyle = ink; g.fillStyle = ink;
    g.lineCap = "round";
    var mx = w * 0.13, mw = w * 0.74;
    if (kind === 0) {
      /* A letter: script lines with word gaps, short last row. */
      var rows = 9 + Math.floor(rnd() * 3);
      for (var r = 0; r < rows; r++) {
        var y = h * 0.13 + r * (h * 0.7) / rows;
        g.lineWidth = 1 + rnd() * 0.7;
        var x = mx + (r === 0 ? 22 : rnd() * 14);
        var end = mx + mw - (r >= rows - 2 ? mw * (0.15 + rnd() * 0.35) : 0);
        while (x < end) {
          var wl = 9 + rnd() * 24;
          g.beginPath();
          for (var px = 0; px <= wl; px += 3) {
            var yy = y + Math.sin(px * 0.9 + r * 2) * 1.7 + (rnd() - 0.5) * 1.1;
            if (px === 0) g.moveTo(x + px, yy); else g.lineTo(x + px, yy);
          }
          g.stroke();
          x += wl + 5 + rnd() * 7;
        }
      }
    } else if (kind === 1) {
      /* A rough map: coastline, dotted route, X marks the spot. */
      g.lineWidth = 1.4;
      g.beginPath();
      var cx = w * 0.44, cy = h * 0.36, R = w * 0.3;
      for (var a = 0; a <= 6.4; a += 0.35) {
        var rr = R * (0.72 + rnd() * 0.5);
        var px2 = cx + Math.cos(a) * rr * 1.15, py2 = cy + Math.sin(a) * rr * 0.8;
        if (a === 0) g.moveTo(px2, py2); else g.lineTo(px2, py2);
      }
      g.stroke();
      g.lineWidth = 1.3; g.setLineDash([4, 5]);
      g.beginPath();
      g.moveTo(w * 0.2, h * 0.75);
      g.bezierCurveTo(w * 0.4, h * 0.6, w * 0.55, h * 0.55, w * 0.72, h * 0.4);
      g.stroke();
      g.setLineDash([]);
      g.lineWidth = 1.8;
      [[w * 0.72, h * 0.4], [w * 0.24, h * 0.73]].forEach(function (p) {
        g.beginPath();
        g.moveTo(p[0] - 5, p[1] - 5); g.lineTo(p[0] + 5, p[1] + 5);
        g.moveTo(p[0] + 5, p[1] - 5); g.lineTo(p[0] - 5, p[1] + 5);
        g.stroke();
      });
      /* Compass cross, corner. */
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(w * 0.84, h * 0.1); g.lineTo(w * 0.84, h * 0.2);
      g.moveTo(w * 0.79, h * 0.15); g.lineTo(w * 0.89, h * 0.15);
      g.stroke();
    } else {
      /* A sigil page: circle + inscribed star, rune rows beneath. */
      g.lineWidth = 1.5;
      var sx = w * 0.5, sy = h * 0.24, sr = w * 0.24;
      g.beginPath(); g.arc(sx, sy, sr, 0, 6.283); g.stroke();
      g.beginPath();
      for (var p2 = 0; p2 < 6; p2++) {
        var an = -1.57 + p2 * (6.283 / 3); /* hexagram: step 2 vertices */
        var vx = sx + Math.cos(an) * sr, vy = sy + Math.sin(an) * sr;
        if (p2 === 0) g.moveTo(vx, vy); else g.lineTo(vx, vy);
      }
      g.closePath(); g.stroke();
      for (var rp = 0; rp < 4; rp++) {
        var ry = h * 0.5 + rp * h * 0.09;
        g.lineWidth = 1 + rnd() * 0.6;
        for (var m = 0; m < 6 + Math.floor(rnd() * 3); m++) {
          var rxx = mx + m * (mw / 8) + rnd() * 4;
          g.beginPath();
          g.moveTo(rxx, ry - 4 + rnd() * 3);
          g.lineTo(rxx + 3 + rnd() * 5, ry + 4 - rnd() * 3);
          if (rnd() < 0.5) { g.moveTo(rxx + 1, ry + 4); g.lineTo(rxx + 4 + rnd() * 3, ry - 4); }
          g.stroke();
        }
      }
    }
    /* An ink blot or two — every desk has one. */
    for (var b = 0; b < 2; b++) {
      g.beginPath();
      g.arc(mx + rnd() * mw, h * (0.2 + rnd() * 0.7), 1.5 + rnd() * 2.5, 0, 6.283);
      g.fill();
    }
  }
  function buildLooseSheets() {
    for (var s = 0; s < 3; s++) {
      (function (idx) {
        var paint = function () {
          var c1 = window.Parchment
            ? window.Parchment.base(256, 352, { seed: 20 + idx })
            : null;
          if (c1) doodleSheet(c1.getContext("2d"), 256, 352, idx, idx);
          return c1;
        };
        var c1 = paint();
        var sc = c1 ? new THREE.CanvasTexture(c1) : null;
        if (sc) sc.colorSpace = THREE.SRGBColorSpace;
        var sm = new THREE.MeshStandardMaterial({
          color: sc ? 0xe4d7b8 : 0xd8c9a8, roughness: 0.9,
          map: sc || null
        });
        var sp = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.1, 1, 1), sm);
        sp.rotation.x = -Math.PI / 2;
        sp.rotation.z = (idx - 1) * 0.22 + 0.1;
        sp.position.set(-3.9 + idx * 0.14, 0.02 + idx * 0.013, -0.4 + idx * 0.18);
        sp.receiveShadow = true;
        looseSheets.add(sp);
        if (c1 && sc) sheetPainted.push({ canvas: c1, tex: sc, paint: paint });
      })(s);
    }
    scene.add(looseSheets);
    /* Debug handle: lets tests read the live sheet canvases (textures are
       unreachable from outside the module otherwise). */
    window.__TAPESTRY_SHEETS = sheetPainted;
  }
  /* Built SYNCHRONOUSLY now: these used to arrive with the grain image,
     popping in unlit long after the desk was on screen (user round 5:
     "cards get light on them much later"). The photo grain composites
     into the SAME canvases when it lands — same texture objects, so no
     new GPU upload path — and only if the intro hasn't started. */
  buildLooseSheets();
  if (window.Parchment) {
    window.Parchment.loadGrain().then(function (ok) {
      if (!ok || introStarted) return;
      sheetPainted.forEach(function (sp) {
        var fresh = sp.paint();
        if (!fresh) return;
        sp.canvas.getContext("2d").drawImage(fresh, 0, 0);
        sp.tex.needsUpdate = true;
      });
    }).catch(function () {});
  }

  /* The dressing corner sits outside both flame pools — the sheets read
     as dark cutouts there. A small warm pool claims the corner from the
     first frame; it rides the shared flicker (tick). */
  var dressingLight = new THREE.SpotLight(0xffbe7a, 13, 9, 0.85, 0.95, 2);
  dressingLight.position.set(-3.4, 3.3, 0.9);
  dressingLight.target.position.set(-3.85, 0, -0.25);
  scene.add(dressingLight);
  scene.add(dressingLight.target);

  /* ---------- Stage 2: Analytic GPU lightmap bake of big surfaces ---------- */
  var sharedPoolUniforms = {
    uF1: { value: 1.0 },
    uF2: { value: 1.0 }
  };
  var freezeTime = null;

  function patchBakeMaterial(mat, pool1Tex, pool2Tex, sharedUniforms, cacheKey) {
    mat.customProgramCacheKey = function () { return cacheKey; };
    mat.onBeforeCompile = function (shader) {
      shader.uniforms.uPool1 = { value: pool1Tex };
      shader.uniforms.uPool2 = { value: pool2Tex };
      shader.uniforms.uF1 = sharedUniforms.uF1;
      shader.uniforms.uF2 = sharedUniforms.uF2;
      shader.uniforms.uNovaG = novaSharedU.uNovaG;
      shader.uniforms.uNovaFrontM = novaSharedU.uNovaFrontM;
      shader.uniforms.uNovaColor = novaSharedU.uNovaColor;
      shader.uniforms.uNovaXZ = novaSharedU.uNovaXZ;

      shader.vertexShader = shader.vertexShader.replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vNovaWP;"
      );
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvNovaWP = (modelMatrix * vec4(transformed, 1.0)).xyz;"
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        /#include\s*<lightmap_pars_fragment>/,
        [
          "#include <lightmap_pars_fragment>",
          "uniform sampler2D uPool1;",
          "uniform sampler2D uPool2;",
          "uniform float uF1;",
          "uniform float uF2;",
          "uniform float uNovaG;",
          "uniform float uNovaFrontM;",
          "uniform vec3 uNovaColor;",
          "uniform vec2 uNovaXZ;",
          "varying vec3 vNovaWP;"
        ].join("\n")
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        /reflectedLight\.indirectDiffuse\s*\+=\s*lightMapTexel\.rgb\s*\*\s*lightMapIntensity\s*\*\s*RECIPROCAL_PI;/,
        [
          "vec3 lm = lightMapTexel.rgb * lightMapIntensity",
          "        + texture2D(uPool1, vLightMapUv).rgb * uF1",
          "        + texture2D(uPool2, vLightMapUv).rgb * uF2;",
          "reflectedLight.indirectDiffuse += lm * RECIPROCAL_PI;"
        ].join("\n")
      );

      /* the baked surfaces ANSWER the nova: emissive lift gated by the
         same world-space wavefront that drives the flood */
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <emissivemap_fragment>",
        [
          "#include <emissivemap_fragment>",
          "float novaD = distance(vNovaWP.xz, uNovaXZ);",
          "float novaHit = smoothstep(uNovaFrontM, uNovaFrontM - 0.9, novaD);",
          "totalEmissiveRadiance += uNovaColor * uNovaG * novaHit;"
        ].join("\n")
      );
    };

  }

  function patchTableMaterial(mat, pool1Tex, pool2Tex, sharedUniforms) {
    mat.customProgramCacheKey = function () { return "table-specular-baked-v3"; };
    mat.onBeforeCompile = function (shader) {
      shader.uniforms.uPool1 = { value: pool1Tex };
      shader.uniforms.uPool2 = { value: pool2Tex };
      shader.uniforms.uF1 = sharedUniforms.uF1;
      shader.uniforms.uF2 = sharedUniforms.uF2;
      shader.uniforms.uNormalMap = { value: woodNormal };
      shader.uniforms.uFlame1Pos = { value: new THREE.Vector3().copy(flameLight.position) };
      shader.uniforms.uFlame1Color = { value: new THREE.Color(0xffbe7a).multiplyScalar(26.0) };
      shader.uniforms.uFlame2Pos = { value: new THREE.Vector3().copy(flameLight2.position) };
      shader.uniforms.uFlame2Color = { value: new THREE.Color(0xffbe7a).multiplyScalar(21.0) };

      shader.vertexShader = shader.vertexShader.replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vWorldPos;"
      );
      shader.vertexShader = shader.vertexShader.replace(
        "#include <worldpos_vertex>",
        "#include <worldpos_vertex>\nvWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;"
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        /#include\s*<lightmap_pars_fragment>/,
        [
          "#include <lightmap_pars_fragment>",
          "uniform sampler2D uPool1, uPool2, uNormalMap;",
          "uniform float uF1, uF2;",
          "uniform vec3 uFlame1Pos, uFlame1Color, uFlame2Pos, uFlame2Color;",
          "varying vec3 vWorldPos;"
        ].join("\n")
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        /reflectedLight\.indirectDiffuse\s*\+=\s*lightMapTexel\.rgb\s*\*\s*lightMapIntensity\s*\*\s*RECIPROCAL_PI;/,
        [
          "vec3 lm = lightMapTexel.rgb * lightMapIntensity",
          "        + texture2D(uPool1, vLightMapUv).rgb * uF1",
          "        + texture2D(uPool2, vLightMapUv).rgb * uF2;",
          "reflectedLight.indirectDiffuse += lm * RECIPROCAL_PI;"
        ].join("\n")
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        /vec3 outgoingLight = reflectedLight\.indirectDiffuse;/,
        [
          "vec3 outgoingLight = reflectedLight.indirectDiffuse;",
          "vec3 nTex = texture2D(uNormalMap, vMapUv).xyz * 2.0 - 1.0;",
          "vec3 N = normalize(vec3(nTex.x * 0.35, 1.0, -nTex.y * 0.35));",
          "vec3 V = normalize(cameraPosition - vWorldPos);",
          "vec3 L1 = normalize(uFlame1Pos - vWorldPos);",
          "vec3 H1 = normalize(L1 + V);",
          "float dotNL1 = max(dot(N, L1), 0.0);",
          "float dotNH1 = max(dot(N, H1), 0.0);",
          "float spec1 = pow(dotNH1, 30.0) * dotNL1;",
          "vec3 L2 = normalize(uFlame2Pos - vWorldPos);",
          "vec3 H2 = normalize(L2 + V);",
          "float dotNL2 = max(dot(N, L2), 0.0);",
          "float dotNH2 = max(dot(N, H2), 0.0);",
          "float spec2 = pow(dotNH2, 30.0) * dotNL2;",
          "vec3 spec = (uFlame1Color * spec1 * uF1 + uFlame2Color * spec2 * uF2) * 0.026;",
          "outgoingLight += spec;"
        ].join("\n")
      );
    };
  }

  function makeBakeTarget() {
    return new THREE.WebGLRenderTarget(1024, 1024, {
      type: THREE.HalfFloatType,
      depthBuffer: false,
      stencilBuffer: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: false
    });
  }

  var tableA = makeBakeTarget(), tableB1 = makeBakeTarget(), tableB2 = makeBakeTarget();
  var wallA = makeBakeTarget(), wallB1 = makeBakeTarget(), wallB2 = makeBakeTarget();
  var sheetA = makeBakeTarget(), sheetB1 = makeBakeTarget(), sheetB2 = makeBakeTarget();

  function initBake() {
    var bakeCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    var bakeScene = new THREE.Scene();
    var bakeQuadMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    bakeScene.add(bakeQuadMesh);

    var bakeMat = new THREE.ShaderMaterial({
      uniforms: {
        uGroup: { value: 0 },
        uWorldOrigin: { value: new THREE.Vector3() },
        uWorldAxisU: { value: new THREE.Vector3() },
        uWorldAxisV: { value: new THREE.Vector3() },
        uWorldNormal: { value: new THREE.Vector3() },

        // Static A
        uHemiSky: { value: new THREE.Color(0x36435c).multiplyScalar(0.42) },
        uHemiGround: { value: new THREE.Color(0x1d1409).multiplyScalar(0.42) },
        uHemiDir: { value: new THREE.Vector3(0, 1, 0) },
        uKeyColor: { value: new THREE.Color(0x9db0cc).multiplyScalar(0.85) },
        uKeyDir: { value: new THREE.Vector3().subVectors(keyLight.position, keyLight.target.position).normalize() },
        uBackPos: { value: new THREE.Vector3().copy(back.position) },
        uBackColor: { value: new THREE.Color(0xff9d5c).multiplyScalar(26.0) },
        uBackDist: { value: 26.0 },
        uBackDecay: { value: 2.0 },

        // Left Candle B1
        uFlame1Pos: { value: new THREE.Vector3().copy(flameLight.position) },
        uFlame1Color: { value: new THREE.Color(0xffbe7a).multiplyScalar(26.0) },
        uFlame1Dir: { value: new THREE.Vector3().subVectors(flameLight.position, flameLight.target.position).normalize() },
        uFlame1Dist: { value: 30.0 },
        uFlame1Decay: { value: 2.0 },
        uFlame1ConeCos: { value: Math.cos(1.0) },
        uFlame1PenumbraCos: { value: Math.cos(1.0 * (1.0 - 0.85)) },

        uDressingPos: { value: new THREE.Vector3().copy(dressingLight.position) },
        uDressingColor: { value: new THREE.Color(0xffbe7a).multiplyScalar(13.0) },
        uDressingDir: { value: new THREE.Vector3().subVectors(dressingLight.position, dressingLight.target.position).normalize() },
        uDressingDist: { value: 9.0 },
        uDressingDecay: { value: 2.0 },
        uDressingConeCos: { value: Math.cos(0.85) },
        uDressingPenumbraCos: { value: Math.cos(0.85 * (1.0 - 0.95)) },

        uBody1Pos: { value: new THREE.Vector3().copy(bodyLight.position) },
        uBody1Color: { value: new THREE.Color(0xffb066).multiplyScalar(9.0) },
        uBody1Dist: { value: 7.0 },
        uBody1Decay: { value: 2.0 },

        // Right Candle B2
        uFlame2Pos: { value: new THREE.Vector3().copy(flameLight2.position) },
        uFlame2Color: { value: new THREE.Color(0xffbe7a).multiplyScalar(21.0) },
        uFlame2Dir: { value: new THREE.Vector3().subVectors(flameLight2.position, flameLight2.target.position).normalize() },
        uFlame2Dist: { value: 30.0 },
        uFlame2Decay: { value: 2.0 },
        uFlame2ConeCos: { value: Math.cos(1.0) },
        uFlame2PenumbraCos: { value: Math.cos(1.0 * (1.0 - 0.85)) },

        uBody2Pos: { value: new THREE.Vector3().copy(bodyLight2.position) },
        uBody2Color: { value: new THREE.Color(0xffb066).multiplyScalar(7.0) },
        uBody2Dist: { value: 6.0 },
        uBody2Decay: { value: 2.0 }
      },
      vertexShader: [
        "varying vec2 vUv;",
        "void main() {",
        "  vUv = uv;",
        "  gl_Position = vec4(position.xy, 0.0, 1.0);",
        "}"
      ].join("\n"),
      fragmentShader: [
        "precision highp float;",
        "varying vec2 vUv;",
        "uniform int uGroup;",
        "uniform vec3 uWorldOrigin;",
        "uniform vec3 uWorldAxisU;",
        "uniform vec3 uWorldAxisV;",
        "uniform vec3 uWorldNormal;",

        "uniform vec3 uHemiSky;",
        "uniform vec3 uHemiGround;",
        "uniform vec3 uHemiDir;",
        "uniform vec3 uKeyColor;",
        "uniform vec3 uKeyDir;",
        "uniform vec3 uBackPos;",
        "uniform vec3 uBackColor;",
        "uniform float uBackDist;",
        "uniform float uBackDecay;",

        "uniform vec3 uFlame1Pos;",
        "uniform vec3 uFlame1Color;",
        "uniform vec3 uFlame1Dir;",
        "uniform float uFlame1Dist;",
        "uniform float uFlame1Decay;",
        "uniform float uFlame1ConeCos;",
        "uniform float uFlame1PenumbraCos;",

        "uniform vec3 uDressingPos;",
        "uniform vec3 uDressingColor;",
        "uniform vec3 uDressingDir;",
        "uniform float uDressingDist;",
        "uniform float uDressingDecay;",
        "uniform float uDressingConeCos;",
        "uniform float uDressingPenumbraCos;",

        "uniform vec3 uBody1Pos;",
        "uniform vec3 uBody1Color;",
        "uniform float uBody1Dist;",
        "uniform float uBody1Decay;",

        "uniform vec3 uFlame2Pos;",
        "uniform vec3 uFlame2Color;",
        "uniform vec3 uFlame2Dir;",
        "uniform float uFlame2Dist;",
        "uniform float uFlame2Decay;",
        "uniform float uFlame2ConeCos;",
        "uniform float uFlame2PenumbraCos;",

        "uniform vec3 uBody2Pos;",
        "uniform vec3 uBody2Color;",
        "uniform float uBody2Dist;",
        "uniform float uBody2Decay;",

        "float getDistanceAttenuation( const in float lightDistance, const in float cutoffDistance, const in float decayExponent ) {",
        "  float distanceFalloff = 1.0 / max( pow( lightDistance, decayExponent ), 0.01 );",
        "  if ( cutoffDistance > 0.0 ) {",
        "    float factor = clamp( 1.0 - pow( lightDistance / cutoffDistance, 4.0 ), 0.0, 1.0 );",
        "    distanceFalloff *= factor * factor;",
        "  }",
        "  return distanceFalloff;",
        "}",

        "float getSpotAttenuation( const in float coneCosine, const in float penumbraCosine, const in float angleCosine ) {",
        "  return smoothstep( coneCosine, penumbraCosine, angleCosine );",
        "}",

        "void main() {",
        "  vec3 P = uWorldOrigin + vUv.x * uWorldAxisU + vUv.y * uWorldAxisV;",
        "  vec3 N = normalize(uWorldNormal);",
        "  vec3 irradiance = vec3(0.0);",

        "  if (uGroup == 0) {",
        "    float dotNHemi = dot(N, uHemiDir);",
        "    float hemiWeight = 0.5 * dotNHemi + 0.5;",
        "    irradiance += mix(uHemiGround, uHemiSky, hemiWeight);",

        "    float dotNKey = max(dot(N, uKeyDir), 0.0);",
        "    irradiance += uKeyColor * dotNKey;",

        "    vec3 backL = uBackPos - P;",
        "    float backDist = length(backL);",
        "    if (backDist > 0.0) {",
        "      vec3 backDir = normalize(backL);",
        "      float dotNBack = max(dot(N, backDir), 0.0);",
        "      float backAtten = getDistanceAttenuation(backDist, uBackDist, uBackDecay);",
        "      irradiance += uBackColor * dotNBack * backAtten;",
        "    }",
        "  } else if (uGroup == 1) {",
        "    vec3 flame1L = uFlame1Pos - P;",
        "    float flame1Dist = length(flame1L);",
        "    if (flame1Dist > 0.0) {",
        "      vec3 flame1Dir = normalize(flame1L);",
        "      float angleCos1 = dot(flame1Dir, uFlame1Dir);",
        "      float spotAtten1 = getSpotAttenuation(uFlame1ConeCos, uFlame1PenumbraCos, angleCos1);",
        "      if (spotAtten1 > 0.0) {",
        "        float dotNFlame1 = max(dot(N, flame1Dir), 0.0);",
        "        float distAtten1 = getDistanceAttenuation(flame1Dist, uFlame1Dist, uFlame1Decay);",
        "        irradiance += uFlame1Color * spotAtten1 * distAtten1 * dotNFlame1;",
        "      }",
        "    }",

        "    vec3 dressL = uDressingPos - P;",
        "    float dressDist = length(dressL);",
        "    if (dressDist > 0.0) {",
        "      vec3 dressDir = normalize(dressL);",
        "      float angleCosD = dot(dressDir, uDressingDir);",
        "      float spotAttenD = getSpotAttenuation(uDressingConeCos, uDressingPenumbraCos, angleCosD);",
        "      if (spotAttenD > 0.0) {",
        "        float dotNDress = max(dot(N, dressDir), 0.0);",
        "        float distAttenD = getDistanceAttenuation(dressDist, uDressingDist, uDressingDecay);",
        "        irradiance += uDressingColor * spotAttenD * distAttenD * dotNDress;",
        "      }",
        "    }",
        "    vec3 body1L = uBody1Pos - P;",
        "    float body1Dist = length(body1L);",
        "    if (body1Dist > 0.0) {",
        "      vec3 body1Dir = normalize(body1L);",
        "      float dotNBody1 = max(dot(N, body1Dir), 0.0);",
        "      float distAttenB1 = getDistanceAttenuation(body1Dist, uBody1Dist, uBody1Decay);",
        "      irradiance += uBody1Color * distAttenB1 * dotNBody1;",
        "    }",
        "  } else if (uGroup == 2) {",
        "    vec3 flame2L = uFlame2Pos - P;",
        "    float flame2Dist = length(flame2L);",
        "    if (flame2Dist > 0.0) {",
        "      vec3 flame2Dir = normalize(flame2L);",
        "      float angleCos2 = dot(flame2Dir, uFlame2Dir);",
        "      float spotAtten2 = getSpotAttenuation(uFlame2ConeCos, uFlame2PenumbraCos, angleCos2);",
        "      if (spotAtten2 > 0.0) {",
        "        float dotNFlame2 = max(dot(N, flame2Dir), 0.0);",
        "        float distAtten2 = getDistanceAttenuation(flame2Dist, uFlame2Dist, uFlame2Decay);",
        "        irradiance += uFlame2Color * spotAtten2 * distAtten2 * dotNFlame2;",
        "      }",
        "    }",
        "    vec3 body2L = uBody2Pos - P;",
        "    float body2Dist = length(body2L);",
        "    if (body2Dist > 0.0) {",
        "      vec3 body2Dir = normalize(body2L);",
        "      float dotNBody2 = max(dot(N, body2Dir), 0.0);",
        "      float distAttenB2 = getDistanceAttenuation(body2Dist, uBody2Dist, uBody2Decay);",
        "      irradiance += uBody2Color * distAttenB2 * dotNBody2;",
        "    }",
        "  }",

        "  gl_FragColor = vec4(irradiance, 1.0);",
        "}"
      ].join("\n"),
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false
    });
    bakeQuadMesh.material = bakeMat;

    var surfaces = [
      {
        origin: new THREE.Vector3(-23.0, 0.0, 15.0),
        axisU: new THREE.Vector3(46.0, 0.0, 0.0),
        axisV: new THREE.Vector3(0.0, 0.0, -30.0),
        normal: new THREE.Vector3(0.0, 1.0, 0.0),
        targets: [tableA, tableB1, tableB2]
      },
      {
        origin: new THREE.Vector3(-35.0, -9.0, -18.0),
        axisU: new THREE.Vector3(70.0, 0.0, 0.0),
        axisV: new THREE.Vector3(0.0, 30.0, 0.0),
        normal: new THREE.Vector3(0.0, 0.0, 1.0),
        targets: [wallA, wallB1, wallB2]
      }
    ];

    surfaces.forEach(function (surf) {
      bakeMat.uniforms.uWorldOrigin.value.copy(surf.origin);
      bakeMat.uniforms.uWorldAxisU.value.copy(surf.axisU);
      bakeMat.uniforms.uWorldAxisV.value.copy(surf.axisV);
      bakeMat.uniforms.uWorldNormal.value.copy(surf.normal);

      for (var grp = 0; grp < 3; grp++) {
        bakeMat.uniforms.uGroup.value = grp;
        renderer.setRenderTarget(surf.targets[grp]);
        renderer.clear();
        renderer.render(bakeScene, bakeCamera);
      }
    });

    renderer.setRenderTarget(null);
    bakeScene.remove(bakeQuadMesh);
    bakeQuadMesh.geometry.dispose();
    bakeMat.dispose();

    // Material swaps to unlit MeshBasicMaterial with lightmaps + flicker pools + normal specular
    // Keep tableMat as MeshStandardMaterial to preserve 100% exact PBR specular sheen from back and flame lights
    // table.material = tableMat;


    var wallMat = new THREE.MeshBasicMaterial({
      color: 0x392b1a,
      lightMap: wallA.texture,
      lightMapIntensity: 1,
      fog: true
    });
    patchBakeMaterial(wallMat, wallB1.texture, wallB2.texture, sharedPoolUniforms, "wall-baked-nova-v2");
    wall.material = wallMat;
    wall.geometry.setAttribute("uv2", wall.geometry.attributes.uv.clone());
  }

  initBake();

  /* ---------- Stage 3: Frozen Dwell for desk stillness ---------- */
  var baseMeshes = [
    wall, windowGlow, windowCore, chairBack, chairStiles,
    hearthBed, table, plane, topDowel, rollGroup, looseSheets,
    candleL, candleR
  ];
  function setBaseVisible(v) {
    for (var i = 0; i < baseMeshes.length; i++) {
      if (!baseMeshes[i]) continue;
      if (baseMeshes[i] === plane) {
        baseMeshes[i].visible = v && open > 0.01;
      } else {
        baseMeshes[i].visible = v;
      }
    }
    if (sealMesh) sealMesh.visible = v && !sealBroken;
    if (ribbonMesh) ribbonMesh.visible = v && !sealBroken;
  }

  var holdTarget = new THREE.WebGLRenderTarget(
    Math.max(2, Math.round(window.innerWidth * Math.min(1.0, window.devicePixelRatio || 1))),
    Math.max(2, Math.round(window.innerHeight * Math.min(1.0, window.devicePixelRatio || 1))),
    {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true
    }
  );

  var holdQuadScene = new THREE.Scene();
  var holdQuadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1);
  var holdQuadMat = new THREE.MeshBasicMaterial({
    map: holdTarget.texture,
    depthTest: false,
    depthWrite: false
  });
  var holdQuadMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), holdQuadMat);
  holdQuadMesh.frustumCulled = false;
  holdQuadScene.add(holdQuadMesh);

  function captureHoldTarget() {
    if (!composer || !live) return;
    flameL.visible = false;
    flameR.visible = false;
    haloL.visible = false;
    haloR.visible = false;
    if (sealMesh) sealMesh.visible = false;
    if (ribbonMesh) ribbonMesh.visible = false;
    emberPoints.visible = false;
    sealFxHideForCapture();
    setBaseVisible(true);

    var curF1 = sharedPoolUniforms.uF1.value;
    var curF2 = sharedPoolUniforms.uF2.value;
    var curFL1 = flameLight.intensity;
    var curFL2 = flameLight2.intensity;
    var curBL1 = bodyLight.intensity;
    var curBL2 = bodyLight2.intensity;
    var curDL = dressingLight.intensity;

    flameLight.intensity = 26;
    flameLight2.intensity = 21;
    bodyLight.intensity = 9;
    bodyLight2.intensity = 7;
    dressingLight.intensity = 13;
    sharedPoolUniforms.uF1.value = 1.0;
    sharedPoolUniforms.uF2.value = 1.0;

    renderer.setRenderTarget(holdTarget);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);

    flameLight.intensity = curFL1;
    flameLight2.intensity = curFL2;
    bodyLight.intensity = curBL1;
    bodyLight2.intensity = curBL2;
    dressingLight.intensity = curDL;
    sharedPoolUniforms.uF1.value = curF1;
    sharedPoolUniforms.uF2.value = curF2;

    flameL.visible = true;
    flameR.visible = true;
    haloL.visible = true;
    haloR.visible = true;
    if (sealMesh) sealMesh.visible = !sealBroken;
    if (ribbonMesh) ribbonMesh.visible = !sealBroken;
    sealFxRestoreAfterCapture();
  }

  function renderParked(f1, f2, dt) {
    var fAvg = (f1 + f2) * 0.5;
    holdQuadMat.color.setScalar(1.0 + (fAvg - 1.0) * 0.28);
    applyQuadKickStep(dt); /* burst recoil, drawn into the frozen frame */

    renderer.setRenderTarget(composer.readBuffer);
    renderer.render(holdQuadScene, holdQuadCamera);

    setBaseVisible(false);
    if (sealMesh) sealMesh.visible = !sealBroken;
    if (ribbonMesh) ribbonMesh.visible = !sealBroken;

    var prevBg = scene.background;
    scene.background = null;
    renderer.clearDepth();

    var rp = composer.passes[0];
    var prevClear = rp.clear;
    rp.clear = false;

    composer.render();

    rp.clear = prevClear;
    scene.background = prevBg;
    setBaseVisible(true);
  }

  var dwellStillMs = 0;
  var isParked = false;
  var lastScrollY = window.scrollY;
  var lastCamP = new THREE.Vector3().copy(camera.position);

  /* ---------- Loop: renders only while the 3D layer is visible ---------- */
  var live = false;
  var clock = new THREE.Clock();
  /* Layer opacity chases a goal (set by show/zone scrubs/exits) even when
     not live — random boundary input crossfades instead of popping. */
  var opGoal = 0, opCur = 0;
  function tick() {
    requestAnimationFrame(tick);
    if (dead) return;
    var dt = Math.min(clock.getDelta(), 0.1);
    if (Math.abs(opCur - opGoal) > 0.004) {
      opCur += (opGoal - opCur) * (1 - Math.exp(-dt * 10));
      holder.style.opacity = opCur.toFixed(3);
      syncColumnFade();
    }
    if (!live) return;
    var t = clock.getElapsedTime();
    /* NO quality watchdog (owner 2026-10-13: "remove the watchdog
       entirely, it is only creating nuisance"). Quality is FIXED for the
       whole session — composer always, shadows always on, pixel ratio
       never changes. Nothing may recompile or degrade mid-experience:
       the old ladder's shadow-off rung forced a full material recompile
       that itself stalled frames (the meter's 9fps dips on section
       changes), and its pixel-ratio rung never resized the composer's
       render targets at all (EffectComposer caches its own pixel ratio).
       Waste is removed at the source in this build instead. */
    /* Out-of-phase flicker; the shader, the lights and the halos share
       one clock and one depth — brightness that desyncs from its source
       is what kills the "lit by the candles" read (research Finding 3). */
    var ft = (freezeTime !== null) ? freezeTime : t;
    var f1 = 1 + 0.1 * Math.sin(ft * 13) + 0.07 * Math.sin(ft * 31 + 1);
    var f2 = 1 + 0.1 * Math.sin(ft * 11 + 2.4) + 0.07 * Math.sin(ft * 27 + 4);
    flameUniforms[0].uTime.value = ft;
    flameUniforms[1].uTime.value = ft;
    /* Full billboard: the camera stays steeply top-down, so the flames
       must face it (a vertical plane reads as a sliver from above). */
    flameL.lookAt(camera.position);
    flameR.lookAt(camera.position);
    flameL.scale.set(0.9 + 0.08 * (f1 - 1), 1.02 + 0.16 * (f1 - 1), 1);
    flameR.scale.set(0.9 + 0.08 * (f2 - 1), 1.02 + 0.16 * (f2 - 1), 1);
    flameL.rotation.y = Math.atan2(camera.position.x - flameL.position.x, camera.position.z - flameL.position.z);
    flameR.rotation.y = Math.atan2(camera.position.x - flameR.position.x, camera.position.z - flameR.position.z);
    flameLight.intensity = 26 * f1;
    flameLight2.intensity = 21 * f2;
    bodyLight.intensity = 9 * f1;
    bodyLight2.intensity = 7 * f2;
    dressingLight.intensity = 13 * f1;
    haloL.material.opacity = Math.min(0.8, 0.5 * f1);
    haloR.material.opacity = Math.min(0.8, 0.5 * f2);
    sharedPoolUniforms.uF1.value = f1;
    sharedPoolUniforms.uF2.value = f2;
    if (!sealBroken && sealMesh) {
      updateSealPulse(t, dt);
      if (sealTriggerBtn && !sealTriggerBtn.hidden) {
        projectSeal();
        /* Style writes only when the seal actually moves on screen — an
           identical write still burns a style recalc every frame. */
        if (Math.abs(sealScreenX - lastTriggerX) > 0.5 ||
            Math.abs(sealScreenY - lastTriggerY) > 0.5) {
          lastTriggerX = sealScreenX;
          lastTriggerY = sealScreenY;
          sealTriggerBtn.style.left = sealScreenX.toFixed(1) + "px";
          sealTriggerBtn.style.top = sealScreenY.toFixed(1) + "px";
        }
      }
    }
    if (!shotFrozen) {
      camChase(dt);
      novaUpdate(dt);
    }
    if (grainPass) {
      var DRIFT = [[0, 0], [-24, 14], [18, -28], [-30, -8], [26, 22]];
      var driftIdx = Math.floor((t % 1.1) / 0.22) % 5;
      grainPass.uniforms.uShift.value.set(DRIFT[driftIdx][0], DRIFT[driftIdx][1]);
    }
    var maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    var inDwell = (window.scrollY <= 120) || (maxScroll > 200 && window.scrollY >= maxScroll - 120);
    if (novaCompose) {
      if (sealFx.clock < 0 || sealFx.clock > 2.0) {
        novaCompose.enabled = false;
      }
    }

    var moving = (Math.abs(window.scrollY - lastScrollY) > 0.5) ||
                 (Math.abs(opCur - opGoal) > 0.004) ||
                 (lastCamP.distanceToSquared(camera.position) > 0.0001) ||
                 (emberPoints.visible && sealPhase !== "burst") ||
                 sealPhase === "approach" || sealPhase === "pulling" ||
                 sealPhase === "intro" || !inDwell ||
                 (sealFx.live && sealFx.clock >= 0 && sealFx.clock < 2.8) ||
                 shotFrozen;

    lastScrollY = window.scrollY;
    lastCamP.copy(camera.position);

    if (moving) {
      dwellStillMs = 0;
      isParked = false;
    } else {
      dwellStillMs += dt * 1000;
      if (dwellStillMs >= 250 && !isParked && composer) {
        captureHoldTarget();
        isParked = true;
      }
    }

    var __rt0 = window.__T3D ? performance.now() : 0;
    /* The composer owns the frame (bloom + ACES output must never
       silently vanish). */
    if (isParked && composer) {
      renderParked(f1, f2, dt);
    } else {
      if (composer) composer.render();
      else renderer.render(scene, camera);
    }
    if (window.__T3D) {
      window.__T3D.renderMsTotal += performance.now() - __rt0;
      window.__T3D.renderCount++;
      window.__T3D.isParked = isParked;
    }
  }
  /* Occlusion-safe frame pump (round 6): a backgrounded host window
     suspends rAF, killing video capture and gsap. This runs the SAME tick
     plus gsap's ticker so recording/staging can drive real-time frames. */
  window.__pumpFrame = function () {
    if (window.gsap) gsap.ticker.tick(performance.now() / 1000);
    tick();
  };
  /* Debug/diagnosis handle (round-6b method): lets a probe flip the two
     GPU cost levers live and read back render times. Kept tiny; the
     per-frame cost is one performance.now() pair only while __T3D is
     observed. */
  window.__T3D = {
    renderMsTotal: 0,
    renderCount: 0,
    plain: false,
    get composer() { return composer; },
    get renderer() { return renderer; },
    get holdTarget() { return holdTarget; },
    setBloom: function (on) { if (bloomPass) bloomPass.enabled = on; },
    bloomOn: function () { return !!(bloomPass && bloomPass.enabled); },
    setShadows: function (on) {
      renderer.shadowMap.enabled = on;
      flameLight.castShadow = on;
      scene.traverse(function (o) {
        if (!o.material) return;
        (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { m.needsUpdate = true; });
      });
    },
    setDpr: function (v) {
      renderer.setPixelRatio(v);
      if (composer) {
        if (typeof composer.setPixelRatio === "function") {
          composer.setPixelRatio(v);
        } else {
          composer.setSize(window.innerWidth, window.innerHeight);
        }
      }
      if (bloomPass) {
        bloomPass.setSize(
          Math.max(2, Math.round(window.innerWidth * 0.5)),
          Math.max(2, Math.round(window.innerHeight * 0.5)));
      }
    },
    setPlain: function (on) { this.plain = on; },
    stage: function () { return 0; }, /* watchdog is gone; stub for the meter */
    /* Bench knobs (occlusion-proof GPU-cost measurement, 2026-10-07):
       offscreen renders the whole composer chain into render targets with
       no screen blit — steady-state submission cost then equals true GPU
       frame cost even when the window cannot present. */
    setOffscreen: function (on) { if (composer) composer.renderToScreen = !on; },
    setBloomRes: function (scale) {
      if (!bloomPass) return;
      bloomPass.setSize(
        Math.max(2, Math.round(window.innerWidth * scale)),
        Math.max(2, Math.round(window.innerHeight * scale)));
    },
    pose: function (valleyT, openV) {
      setCam(valleyT);
      open = openV;
      layRoll();
    },
    renderOnce: function () {
      var t0 = performance.now();
      camChase(0.016);
      /* Frozen shots stage their own exposure (the variant arc at the
         shot instant); camChase just reset it to the pose grade. */
      if (shotFrozen && sealFxStagedExposure > 0) {
        renderer.toneMappingExposure = sealFxStagedExposure;
      }
      if (shotFrozen) novaApplyCamera(sealFx.clock, 0);
      if (!this.plain && composer) composer.render();
      else renderer.render(scene, camera);
      return performance.now() - t0;
    },
    freezeFlicker: function (t) {
      freezeTime = (typeof t === "number") ? t : null;
    },
    getFreezeTime: function () {
      return freezeTime;
    }
  };
  layRoll();
  tick();
  function show() { live = true; holder.classList.add("live"); setOpacity(1); }
  function hide() { live = false; holder.classList.remove("live"); }
  function setOpacity(v) { opGoal = v; }
  /* The DOM column crossfades against the 3D layer instead of ghosting
     under it (user recording: both layers at ~50% read as a double
     exposure). Tracks the DAMPED value in tick so they move together.
     The column surfaces only in the LAST slice of the fade: the sheet's
     baked text and the DOM text are the same words at different
     projections, and any band where both are legible reads as the ghost
     double-exposure the owner kept recording (ticket #20). 0.15 keeps a
     whisper of overlap so the hand stays a crossfade, not a swap. */
  var columnEl = document.querySelector(".column");
  function syncColumnFade() {
    if (!columnEl) return;
    if (!introDone) return;
    columnEl.style.opacity = String(Math.max(0, Math.min(1, (0.15 - opCur) / 0.15)));
  }

  function mixPose(A, B, t) {
    camGoal.p.set(
      A.p[0] + (B.p[0] - A.p[0]) * t,
      A.p[1] + (B.p[1] - A.p[1]) * t,
      A.p[2] + (B.p[2] - A.p[2]) * t);
    camGoal.l.set(
      A.l[0] + (B.l[0] - A.l[0]) * t,
      A.l[1] + (B.l[1] - A.l[1]) * t,
      A.l[2] + (B.l[2] - A.l[2]) * t);
  }
  function setCam(lerpT) {
    /* Sets the GOAL pose; the tick loop chases it. Random up/down input
       produces smooth pursuit instead of teleporting (zone jank fix),
       and the scrub feels damped but tight (lambda ~12: ~63% in 80ms). */
    valleyT = lerpT;
    mixPose(WIDE, PUSH, lerpT);
  }
  function setCamEnd(q) {
    /* Bottom zone: fades in at the sheet's FOOT (q=0), pulls back to the
       whole-scroll wide (q=1) — both rods in frame (user). */
    valleyT = 1 - q;
    mixPose(PUSH_END, WIDE_END, q);
  }
  /* Seal close-up: mixes WIDE -> SEAL_CLOSE (0 = wide desk, 1 = seal fills
     the frame). The pull uses the same scalar, so an interruption at any
     point can reverse cleanly from wherever the camera stands. */
  var sealMix = 0;
  function setCamSeal(k) {
    sealMix = k;
    valleyT = 0.18 * k; /* close-up rides a touch dimmer, still the wide grade */
    mixPose(WIDE, SEAL_CLOSE, k);
  }
  /* Damped camera: goal (scroll/intro target) vs current (what renders).
     camDirect=true during the intro dolly keeps the authored timing exact;
     scrubbed zones chase. */
  var camGoal = {
    p: new THREE.Vector3().fromArray(WIDE.p),
    l: new THREE.Vector3().fromArray(WIDE.l)
  };
  var camCur = {
    p: new THREE.Vector3().fromArray(WIDE.p),
    l: new THREE.Vector3().fromArray(WIDE.l)
  };
  var camDirect = true;
  var valleyT = 0; /* 0 = WIDE, 1 = PUSH — drives the per-pose exposure */
  function camChase(dt) {
    if (camDirect) {
      camCur.p.copy(camGoal.p); camCur.l.copy(camGoal.l);
    } else {
      var k = 1 - Math.exp(-dt * 12);
      camCur.p.lerp(camGoal.p, k);
      camCur.l.lerp(camGoal.l, k);
    }
    camera.position.copy(camCur.p);
    look.copy(camCur.l);
    camera.lookAt(look);
    /* Wide desk shots ride a brighter grade (user: "the scene is very
       dark at the desk shot"); the read framings keep 1.12. Research
       puts night interiors at 1.4-1.5 under ACES — 1.38 stays moody. */
    renderer.toneMappingExposure = 1.12 + 0.26 * (1 - valleyT);
  }
  function ease(x) { return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; }

  /* ---------- Desk zones: the valley, scrubbed (ADR-0009/0012) ---------- */
  var de = document.documentElement;
  var zoneTopEl = document.getElementById("zone-top");
  var zoneBotEl = document.getElementById("zone-bottom");
  var zoneCue = document.getElementById("zone-cue");

  /* Snap strictness follows the bands (user iterate): MANDATORY outside —
     leaving a section always lands on the next one — PROXIMITY inside the
     bands, so the 3D scrub keeps resting anywhere. CSS cannot vary
     snap-type by scroll region (one scroller, one snap-type), so the
     class flips with zone membership; the flip is bounded because the
     top band holds no snap targets at all. */
  function zoneEnter() { live = true; holder.classList.add("live"); de.classList.add("snap-soft"); de.classList.remove("no-snap"); }
  function zoneExit() {
    de.classList.remove("snap-soft", "no-snap");
    setOpacity(0);
    holder.classList.remove("live");
    holder.style.pointerEvents = "none";
    live = false;
  }

  /* Zone membership is decided by geometry, not trigger isActive: an
     instant scroll to the very end puts progress at exactly 1 where the
     old guard froze the camera and never faded the layer in/out. */
  var topActive = false, botActive = false;
  function scrubTop(p) {
    /* Re-assert every time: a stuck topActive from an earlier stale
       state must not block the zone from re-activating (zoneEnter is
       idempotent). */
    topActive = true;
    zoneEnter();
    setCam(ease(p));
    /* Fade starts at 72% (was 55%): the 50/50 blend band where BOTH the
       sheet's baked text and the DOM column are legible was ~20svh of
       restable scroll (user recording, round 6 — the ghost double-exposure
       at every crossing). Tightening the fade band shrinks it to ~3svh,
       a wheel-flick, and the intro crossfade is untouched (it runs through
       zoneExit's setOpacity(0), not this scroll mapping). */
    var fade = p < 0.72 ? 1 : 1 - (p - 0.72) / 0.28;
    setOpacity(fade < 0.02 ? 0 : fade);
    if (zoneCue) zoneCue.style.opacity = String(Math.max(0, 1 - p * 1.6));
    sheet.pageP = 0.02 + 0.09 * p;
    applySheetWindow();
  }
  function scrubBottom(p) {
    botActive = true;
    zoneEnter();
    setOpacity(Math.min(1, p / 0.2) < 0.02 ? 0 : Math.min(1, p / 0.2));
    /* The bottom cue fades as the pullback takes over (top cue's twin). */
    var botCue = document.querySelector("#zone-bottom .zone-cue-top");
    if (botCue) botCue.style.opacity = String(Math.max(0, 1 - p * 2.2));
    var q = ease(Math.min(1, Math.max(0, (p - 0.1) / 0.85)));
    setCamEnd(q);
    sheet.pageP = 0.78 + 0.22 * q;
    applySheetWindow();
  }
  function zoneIdle() {
    if (topActive || botActive) {
      topActive = botActive = false;
      zoneExit();
      /* Crossing OUT of a desk zone (never fired by the intro handoff's
         own zoneExit — this branch only runs when a zone truly claimed
         first). app.js uses this moment, while the DOM column is still
         invisible under the fading layer, to reset the parked panels so
         they REPLAY their reveal as the page surfaces (owner #20: the
         first glide down after a desk dwell must not land on a prefilled
         hero — the old stay-lit-through-dwell rule predates the fade
         mapping change and now reads as dead content popping in). */
      try { window.dispatchEvent(new CustomEvent("tapestry:zone-leave")); } catch (e) {}
    }
  }

  /* Zone driving is a plain scroll listener on GEOMETRY, deliberately not
     ScrollTrigger: ST.refresh() in this stack (compositor-driven CSS snap
     + ST 3.13) measures every trigger shifted by the current scroll
     (verified: zone start drifted to -1779), which left the bands dead.
     create() measures correctly, but a listener costs nothing and cannot
     drift. Progress math mirrors the old trigger ranges exactly. */
  function zoneScroll() {
    isParked = false;
    dwellStillMs = 0;
    if (dead || !introDone) return;
    /* Detached zones (teardown) must never claim a band: with the zones
       gone, offsetHeight/offsetTop read as 0 and the bottom test would be
       true everywhere — snap-soft would stick forever (critic P1). */
    if (!zoneTopEl || !zoneTopEl.isConnected || !zoneBotEl || !zoneBotEl.isConnected) return;
    var y = window.scrollY;
    /* ONE zone decision per event: a stale opposite-band claim must not
       zoneIdle() the band that just activated (verified: a jump from the
       bottom band to the top band left the 3D fading out mid-zone). */
    var claimed = false;
    if (zoneTopEl) {
      var topH = zoneTopEl.offsetHeight;
      if (y < topH - 2) {
        claimed = true;
        scrubTop(Math.min(1, Math.max(0, y / topH)));
      }
    }
    if (!claimed && zoneBotEl) {
      if (y + window.innerHeight * 0.85 >= zoneBotEl.offsetTop) {
        claimed = true;
        var bs = zoneBotEl.offsetTop - window.innerHeight * 0.85;
        var be = document.documentElement.scrollHeight - window.innerHeight;
        scrubBottom(Math.min(1, Math.max(0, (y - bs) / Math.max(1, be - bs))));
      }
    }
    if (!claimed && (topActive || botActive)) zoneIdle();
  }
  window.addEventListener("scroll", zoneScroll, { passive: true });

  /* ---------- Intro: wide hold, then ONE unbroken dolly; the roll drops
     with a heavy damped settle and unrolls during the move. Click skips. */
  var introDone = false;
  var topZoneH = zoneTopEl ? zoneTopEl.offsetHeight : window.innerHeight * 1.4;

  function handoff() {
    if (introDone) return;
    if (dead) { introDone = true; return; } /* teardown won — page is standalone */
    introDone = true;
    /* Field diagnostics: a handoff that throws would leave the page
       locked with no console trace reachable from automation. */
    window.__INTRO_STATE = "handoff-begin";
    try {
      handoffInner();
      window.__INTRO_STATE = "handoff-done";
    } catch (e) {
      window.__INTRO_STATE = "handoff-error: " + (e && e.message);
      if (document.body) document.body.style.overflow = "";
      if (window.console && console.error) console.error("[tapestry3d] handoff failed:", e);
      zoneExit();
    }
  }
  function handoffInner() {
    /* Swap under the seam flash: land the scroll with the hero CENTERED
       (the sigil cap above it fills the top of frame — the letter opens
       mid-desk), drop the 3D layer, restore scrolling, then tell app.js
       to open the reveal gate so the hero ignition is always seen. */
    sealPhase = "done";
    document.documentElement.classList.add("intro-done");
    de.style.scrollBehavior = "auto";
    /* Adopted C7: Restore native DPR on handoff so desk dwell zones stay crisp */
    if (nativeDpr !== introDpr) {
      renderer.setPixelRatio(nativeDpr);
      if (composer) {
        if (typeof composer.setPixelRatio === "function") composer.setPixelRatio(nativeDpr);
        composer.setSize(window.innerWidth, window.innerHeight);
      }
    }
    /* If the zones were torn down mid-intro (context lost), the captured
       zone height is a lie — land relative to 0. */
    var zoneH = (zoneTopEl && zoneTopEl.isConnected) ? topZoneH : 0;
    var land = zoneH;
    var hero = document.querySelector("#hero");
    if (hero) {
      var heroTop = 0, el = hero;
      while (el) { heroTop += el.offsetTop; el = el.offsetParent; }
      /* EXACTLY the hero snap point (fixHeroSnap: margin = max(0, 50svh −
         heroH/2)) — land elsewhere and snap yanks the landing. */
      land = Math.max(land,
        heroTop - Math.max(0, window.innerHeight / 2 - hero.offsetHeight / 2));
    }
    /* A hash deep-link (#contact from the CTAs) overrides the hero landing:
       aim at its pull's snap point instead of silently discarding it. */
    if (location.hash && location.hash.length > 1) {
      var hEl = document.querySelector(location.hash);
      var pull = hEl && hEl.closest ? hEl.closest(".pull") : null;
      if (pull || hEl) {
        var tEl = pull || hEl, tTop = 0, walk = tEl;
        while (walk) { tTop += walk.offsetTop; walk = walk.offsetParent; }
        land = Math.max(0, tTop);
      }
    }
    window.scrollTo(0, land);
    document.body.style.overflow = "";
    /* Crossfade, not swap (user recording: the sheet faded off a BLANK
       DOM hero, then the ignition re-created the same content — "contents
       disappear and play again"). The hero batch ignites NOW under the
       still-opaque sheet (app.js plays the handoff batch immediately);
       the sheet lifts 260ms later, over an already-igniting page. Round 6:
       450 -> 260 — the hold was dead air the user read as the intro
       hanging after the unroll. */
    camDirect = false;
    window.dispatchEvent(new CustomEvent("tapestry:handoff"));
    setTimeout(function () {
      if (!dead) zoneExit();
    }, 260);
    var flash = document.getElementById("seam-flash");
    if (flash && window.gsap) {
      /* A whisper of exposure shift, not a flash effect (critic: a big
         full-screen flash reads as exactly the kind of effect to avoid). */
      window.gsap.fromTo(flash, { opacity: 0 }, {
        opacity: 0.22, duration: 0.26, ease: "power2.in",
        onComplete: function () {
          window.gsap.to(flash, { opacity: 0, duration: 0.5, ease: "power2.out" });
        }
      });
    }
  }

  /* The intro ALWAYS plays (user: opinionated site, every visit opens
     fresh — back/forward is handled by app.js reloading on bfcache).
     Defensive top-pin in case anything restored scroll before boot. */
  document.body.style.overflow = "hidden";
  de.classList.add("no-snap");
  if (window.scrollY > 0) {
    var prevBeh = de.style.scrollBehavior;
    de.style.scrollBehavior = "auto";
    window.scrollTo(0, 0);
    de.style.scrollBehavior = prevBeh;
  }
  show();
  /* The holder keeps pointer events while the intro runs ONLY so it eats
     clicks (the hidden DOM underneath must not be clickable mid-intro).
     There is NO skip: the intro plays in full (owner 2026-10-07). */
  open = 0;
  layRoll();
  /* The scroll rests flat on the desk table under the wax seal (Issue #18).
     No airborne drop from the sky; the roll is already present on the desk. */

  function startIntro() {
    if (introStarted || introDone) return;
    introStarted = true;
    window.__INTRO_STATE = "intro-running";
    holder.style.pointerEvents = "auto"; /* eats clicks only — no skip path */
    introTl = window.gsap.timeline({ onComplete: handoff });

    /* The single continuous camera dolly from WIDE to PUSH. */
    var dolly = { t: 0 };
    introTl.to(dolly, {
      t: 1, duration: 3.4, ease: "power2.inOut",
      onUpdate: function () { setCam(dolly.t); }
    });

    /* The unroll moves forward across the desk table. */
    introTl.to({ v: 0 }, {
      v: 1, duration: 2.2, ease: "power2.out",
      onStart: function () { if (T) T.unroll(2.2); },
      onUpdate: function () { open = this.targets()[0].v; layRoll(); },
      onComplete: function () {
        if (T) T.thud();
        window.gsap.to(rollGroup.position, {
          y: 0.38, duration: 0.12, ease: "power1.out", yoyo: true, repeat: 1
        });
      }
    }, "<0.1");
    introTl.to({}, { duration: 0.12 });
  }
  var introStarted = false;
  var introTl = null;
  /* Start only once the scene is FULLY warm (user: "finish the loader
     only once everything is properly ready"). Sequence: wait for the
     sheet bake (capped — a slow content bridge must not stall the page),
     precompile every material, render a few real frames, let the
     composer run its first pass (bloom targets + shader compile). Only
     then does the ready event fire (app.js dissolves the loader) and
     the wide hold begin — the dolly never pays the GPU's first-frame
     bill on screen. */
  (function awaitSheet() {
    var done = false;
    function go() {
      if (done) return;
      done = true;
      warmAndGo();
    }
    if (sheetPromise) sheetPromise.then(go).catch(go);
    else go();
    setTimeout(go, 3000);
  })();
  function warmAndGo() {
    /* Same rule as the composer's first pass: the warm frames must see
       the hidden sheet parts so their programs and the sheet texture
       upload behind the loader, not on the unroll's first frame. */
    warmHidden(true);
    /* The nova FX objects (shells, pool, smoke) compiled at module init via
       their own warm pass; the ember Points compile here with the rest. */
    try { renderer.compile(scene, camera); } catch (e) {}
    var frames = 0, done = false;
    function finish() {
      if (done) return;
      done = true;
      warmHidden(false); /* back to the open=0 rest state */
      window.__TAPESTRY_3D_READY = true;
      try { window.dispatchEvent(new CustomEvent("tapestry:3d-ready")); } catch (e) {}
      /* Ready: the loader dissolves over the first beat of the
         cinematic approach — the desk pushes in toward the seal. */
      startSealApproach();
    }
    var giveUp = setTimeout(finish, 1000);
    (function step() {
      if (done) return;
      if (composer && composerReady) composer.render();
      else renderer.render(scene, camera);
      if (++frames < 2) { requestAnimationFrame(step); return; }
      clearTimeout(giveUp);
      finish();
    })();
  }
  /* ---------- Resize ---------- */
  /* The 3D choice is load-time UA only (ADR-0015): a desktop window
     resize — however narrow — never tears the scene down. Layout stacking
     keeps following the viewport via CSS; only the look is fixed. */
  window.addEventListener("resize", function () {
    fitPUSH();
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    var curDpr = (introDone || sealPhase === "done") ? nativeDpr : introDpr;
    renderer.setPixelRatio(curDpr);
    renderer.setSize(window.innerWidth, window.innerHeight);
    if (composer) {
      if (typeof composer.setPixelRatio === "function") composer.setPixelRatio(curDpr);
      composer.setSize(window.innerWidth, window.innerHeight);
    }
    if (bloomPass) {
      bloomPass.setSize(
        Math.max(2, Math.round(window.innerWidth * 0.5)),
        Math.max(2, Math.round(window.innerHeight * 0.5)));
    }
    isParked = false;
    dwellStillMs = 0;
    if (holdTarget) {
      holdTarget.setSize(
        Math.max(2, Math.round(window.innerWidth * curDpr)),
        Math.max(2, Math.round(window.innerHeight * curDpr))
      );
    }
    topZoneH = zoneTopEl ? zoneTopEl.offsetHeight : window.innerHeight * 1.4;
  });

  window.TapestryScene = {
    breakSeal: breakSeal,
    checkSealHover: checkSealHover,
    isSealBroken: function () { return sealBroken; },
    sealMesh: sealMesh
  };

  /* Flag only after a full boot: app.js's failsafe keys off it to drop
     dead zones and re-measure triggers when the scene never came up. */
  window.__TAPESTRY_3D = true;
  }
})();
