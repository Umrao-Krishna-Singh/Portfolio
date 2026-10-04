/* 3D desk scene — premium pass (ADRs 0007-0010, 0012).
   three.js 0.160.0 pinned (MIT). Stylized-cinematic: ACES tone mapping,
   bloom + output pass (degrades to plain render if addons fail), GLSL flame
   shaders, content-bearing parchment sheet from the ONE shared parchment
   generator (parchment.js, ADR-0008).
   Camera valley (ADR-0009): page top = WIDE desk, read framing at the zone
   edge, end = WIDE again. Scrubbed by scroll inside thin desk zones (ADR-0012),
   fully reversible. Intro = ONE unbroken dolly; the roll drops with a heavy
   damped settle (bounce banned) and unrolls during the move. Click skips.
   FPS watchdog: degrade (bloom off, then pixel ratio + shadows), never stutter.
   Skips: reduced-motion, <=768px, no gsap, no WebGL (DOM stands alone). */
import * as THREE from "three";

(function () {
  var holder = document.getElementById("gl");
  var canvas = document.getElementById("gl-canvas");
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  /* If app.js's bounded fallback already gave up on us (slow CDN: the
     zones were removed and the page revealed standalone), do not resurrect
     the 3D over it — the standalone page IS the delivered experience. */
  var zoneTopEarly = document.getElementById("zone-top");
  if (reduced || window.innerWidth <= 768 || !window.gsap || !zoneTopEarly || !zoneTopEarly.isConnected) {
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
    /* Never leave the page locked if the scene dies mid-intro (context
       lost, squeeze past 768, boot crash): restore scrolling + snap so
       the DOM page stands alone (critic P1). */
    document.body.style.overflow = "";
    document.documentElement.classList.remove("no-snap");
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
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;

  var NIGHT = 0x14100B;
  var scene = new THREE.Scene();
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
  var composer = null, bloomPass = null, composerReady = false;
  Promise.all([
    import("three/addons/postprocessing/EffectComposer.js"),
    import("three/addons/postprocessing/RenderPass.js"),
    import("three/addons/postprocessing/UnrealBloomPass.js"),
    import("three/addons/postprocessing/OutputPass.js")
  ]).then(function (m) {
    var EffectComposer = m[0].EffectComposer, RenderPass = m[1].RenderPass;
    var UnrealBloomPass = m[2].UnrealBloomPass, OutputPass = m[3].OutputPass;
    /* Adopt only before the intro starts — a grade change mid-dolly is
       itself a seam (critic pass 2). The first composer render (bloom's
       render targets + shader compile) happens HERE, behind the loader,
       so the user never sees the hitch (choppy-start fix). */
    if (!introStarted) {
      composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));
      bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight), 0.25, 0.4, 1.5);
      composer.addPass(bloomPass);
      composer.addPass(new OutputPass());
      composer.setSize(window.innerWidth, window.innerHeight);
      composer.render();
    }
    composerReady = true;
  }).catch(function () { composer = null; composerReady = true; });

  /* ---------- Lights: pooled candlelight in a readable room ----------
     Night air gets DIRECTION, not a flat wash (research Finding 5): a
     hemisphere sky/ground pair replaces the ambient, the hearth lift is
     given a visible ember-bed source on the far desk, and the cool window
     key rims the desk's left edge. r160: hemisphere/ambient/directional
     are plain multipliers; point/spot are candela. */
  scene.add(new THREE.HemisphereLight(0x36435c, 0x1d1409, 0.42));
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
  flameLight.castShadow = true;
  flameLight.shadow.mapSize.set(1024, 1024);
  flameLight.shadow.bias = -0.002;
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
      color: "../.tmp/pen-runs/assets/pbr/wood-wood051/Wood051_color_1K.jpg",
      normal: "../.tmp/pen-runs/assets/pbr/wood-wood051/Wood051_normal_gl_1K.jpg",
      roughness: "../.tmp/pen-runs/assets/pbr/wood-wood051/Wood051_roughness_1K.jpg"
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
  var woodMap = tex((PBR && PBR.wood && PBR.wood.color) || "../.tmp/pen-runs/assets/wood051-color.jpg", 2, 2);
  var tableMat = new THREE.MeshStandardMaterial({ map: woodMap, color: PBR ? 0xa8845c : 0x96754d, roughness: 0.82 });
  if (PBR && PBR.wood && PBR.wood.normal) {
    tableMat.normalMap = dataTex(PBR.wood.normal);
    tableMat.normalScale = new THREE.Vector2(0.35, 0.35);
  }
  if (PBR && PBR.wood && PBR.wood.roughness) {
    tableMat.roughnessMap = dataTex(PBR.wood.roughness);
  }
  [woodMap, tableMat.normalMap, tableMat.roughnessMap].forEach(function (t) {
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
          canvas2 = window.Parchment.layout(blocks, 1280).canvas;
        } else {
          canvas2 = window.Parchment
            ? window.Parchment.base(1280, 1760, { seed: 7 })
            : document.createElement("canvas");
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
        return;
      } catch (e) { if (attempt) return; }
    }
  }
  buildSheet();

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
    topDowel.visible = open > 0.02;
    /* The roll spins as it lays paper: length / radius radians total. */
    roll.rotation.x = open * (TH / 0.34);
    plane.scale.y = Math.max(open, 0.001);
    /* A 0.001-scale plane still renders as a bright 1px sliver under the
       roll — hide it entirely until the unroll begins (critic P2). */
    plane.visible = open > 0.01;
    var pos = planeGeo.attributes.position;
    for (var i = 0; i < pos.count; i++) {
      var x = base[i * 3];
      var y = base[i * 3 + 1];
      var d = y + TH * open; /* distance ahead of the moving edge */
      /* Peel curl: tight and low, hugging the roll — not a traveling wave. */
      var z = 0.38 * Math.exp(-(d * d) / 0.12) * open;
      /* Gentle static drape so the sheet never reads as a flat decal. */
      z += 0.022 * Math.sin(y * 2.3 + x * 0.8) * open;
      z += 0.014 * Math.sin(y * 4.9 - x * 1.4 + 1.7) * open;
      /* Faint lift along the long edges, like real paper relaxes. */
      var e = x / (TW / 2);
      z += 0.028 * e * e * open;
      pos.setZ(i, base[i * 3 + 2] + z);
    }
    pos.needsUpdate = true;
    planeGeo.computeVertexNormals();
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
     term, injected by patching the r160 lights chunk at compile time. The
     chunk text is imported from the SAME pinned package (no hardcoded
     copy to drift), and the patch is skipped cleanly if it ever fails. */
  waxMat.customProgramCacheKey = function () { return "wax-plain"; };
  import(
    "https://cdn.jsdelivr.net/npm/three@0.160.0/src/renderers/shaders/ShaderChunk/lights_fragment_begin.glsl.js"
  ).then(function (m) {
    var patched = String(m.default).replace(/RE_Direct\(/g, "RE_Direct_Wax(");
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
    /* Bump the key when the patch lands: a compile that happened before
       this moment cached an UNPATCHED program under the old key — reusing
       it would silently drop the SSS for the session (critic P2). */
    waxMat.needsUpdate = true;
  }).catch(function () { /* plain physical wax is still a big upgrade */ });
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
  makeCandle(-5.4, -2.2, 2.3);
  makeCandle(5.4, -2.2, 1.95);
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

  /* ---------- Desk dressing: inkwell + quill, seal stamp, loose sheets -- */
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
  blob(-3.7, 1.9, 1.15, 1.15);
  blob(-3.25, 2.35, 1.5, 0.8);
  blob(3.55, 2.6, 1.1, 1.1);
  blob(-3.75, -0.1, 2.2, 3.2);

  var glass = new THREE.MeshStandardMaterial({ color: 0x17131a, roughness: 0.25, metalness: 0.15 });
  var inkwell = new THREE.Group();
  var well = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.34, 18), glass);
  well.position.y = 0.17;
  well.castShadow = true;
  inkwell.add(well);
  var neck = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.12, 18), glass);
  neck.position.y = 0.4;
  inkwell.add(neck);
  var ink = new THREE.Mesh(
    new THREE.CircleGeometry(0.11, 16),
    new THREE.MeshStandardMaterial({ color: 0x0c0a12, roughness: 0.3 })
  );
  ink.rotation.x = -Math.PI / 2;
  ink.position.y = 0.44;
  inkwell.add(ink);
  inkwell.position.set(-3.7, 0, 1.9);
  scene.add(inkwell);

  var featherMat = new THREE.MeshStandardMaterial({ color: 0xcfc0a0, roughness: 0.85 });
  var quill = new THREE.Group();
  var shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.035, 1.5, 8), featherMat);
  shaft.position.y = 0.75;
  quill.add(shaft);
  var vane = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.85, 8), featherMat);
  vane.scale.z = 0.22;
  vane.position.y = 1.55;
  quill.add(vane);
  quill.rotation.z = 0.65;
  quill.rotation.y = 0.5;
  quill.position.set(-3.25, 0.1, 2.35);
  shaft.castShadow = true;
  scene.add(quill);

  var brass = new THREE.MeshStandardMaterial({ color: 0xb08d57, roughness: 0.35, metalness: 0.8 });
  var stamp = new THREE.Group();
  var disc = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.07, 20), brass);
  disc.position.y = 0.045;
  disc.castShadow = true;
  stamp.add(disc);
  var stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.5, 10), woodDark);
  stem.position.y = 0.32;
  stamp.add(stem);
  var knobTop = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), woodDark);
  knobTop.position.y = 0.6;
  stamp.add(knobTop);
  /* Lying on its side near the sheet edge, the way a stamp rests on a desk. */
  stamp.rotation.z = 1.25;
  stamp.rotation.y = -0.4;
  stamp.position.set(3.55, 0.28, 2.6);
  scene.add(stamp);

  var looseSheets = new THREE.Group();
  function buildLooseSheets() {
    for (var s = 0; s < 3; s++) {
      (function (idx) {
        var sc = window.Parchment
          ? new THREE.CanvasTexture(window.Parchment.base(256, 352, { seed: 20 + idx }))
          : null;
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
      })(s);
    }
    scene.add(looseSheets);
  }
  /* After the grain image is in, so the sheets are not flat pale cards. */
  if (window.Parchment) {
    window.Parchment.loadGrain().then(buildLooseSheets).catch(buildLooseSheets);
  } else buildLooseSheets();

  /* ---------- Loop: renders only while the 3D layer is visible ---------- */
  var live = false;
  var clock = new THREE.Clock();
  var emaDt = 16, slowMs = 0, stage = 0;
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
    }
    if (!live) return;
    var t = clock.getElapsedTime();
    /* Watchdog (ADR-0010): below ~42fps sustained -> degrade, one way.
       Order: the spotlight shadow map first (biggest fill-rate cost),
       then bloom, then pixel ratio. */
    emaDt = emaDt * 0.95 + dt * 1000 * 0.05;
    if (emaDt > 23.5) {
      slowMs += dt * 1000;
      if (slowMs > 2500 && stage === 0) {
        stage = 1; slowMs = 0;
        flameLight.castShadow = false;
        renderer.shadowMap.enabled = false;
        /* r160 keeps a per-material program cache: force recompile or the
           disable is a silent no-op (critic pass 2). Multi-material meshes
           (the roll) need per-member updates (critic round 4). */
        scene.traverse(function (o) {
          if (!o.material) return;
          if (Array.isArray(o.material)) o.material.forEach(function (m) { m.needsUpdate = true; });
          else o.material.needsUpdate = true;
        });
      } else if (slowMs > 2500 && stage === 1) {
        stage = 2; slowMs = 0;
        if (bloomPass) bloomPass.enabled = false;
      } else if (slowMs > 2500 && stage === 2) {
        stage = 3; slowMs = 0;
        renderer.setPixelRatio(1.25);
      }
    } else {
      slowMs = Math.max(0, slowMs - dt * 500);
    }
    /* Out-of-phase flicker; the shader, the lights and the halos share
       one clock and one depth — brightness that desyncs from its source
       is what kills the "lit by the candles" read (research Finding 3). */
    var f1 = 1 + 0.1 * Math.sin(t * 13) + 0.07 * Math.sin(t * 31 + 1);
    var f2 = 1 + 0.1 * Math.sin(t * 11 + 2.4) + 0.07 * Math.sin(t * 27 + 4);
    flameUniforms[0].uTime.value = t;
    flameUniforms[1].uTime.value = t;
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
    haloL.material.opacity = Math.min(0.8, 0.5 * f1);
    haloR.material.opacity = Math.min(0.8, 0.5 * f2);
    camChase(dt);
    if (composer && stage <= 1) composer.render();
    else renderer.render(scene, camera);
  }
  layRoll();
  tick();
  function show() { live = true; holder.classList.add("live"); setOpacity(1); }
  function hide() { live = false; holder.classList.remove("live"); }
  function setOpacity(v) { opGoal = v; }

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
    var fade = p < 0.68 ? 1 : 1 - (p - 0.68) / 0.32;
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
    }
  }

  /* Zone driving is a plain scroll listener on GEOMETRY, deliberately not
     ScrollTrigger: ST.refresh() in this stack (compositor-driven CSS snap
     + ST 3.13) measures every trigger shifted by the current scroll
     (verified: zone start drifted to -1779), which left the bands dead.
     create() measures correctly, but a listener costs nothing and cannot
     drift. Progress math mirrors the old trigger ranges exactly. */
  function zoneScroll() {
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
  var T = window.Tapestry || null;
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
    de.style.scrollBehavior = "auto";
    /* If the zones were torn down mid-intro (context lost, squeeze past
       768), the captured zone height is a lie — land relative to 0. */
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
    zoneExit();
    document.body.style.overflow = "";
    /* From here the camera chases its scroll-driven goal (damped) — the
       intro kept authored timing; the scrubbed valley gets the glide. */
    camDirect = false;
    window.dispatchEvent(new CustomEvent("tapestry:handoff"));
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
  /* Click-to-skip must catch clicks on the hidden DOM underneath: the
     holder takes pointer events only while the intro is running. */
  open = 0;
  layRoll();
  /* The roll rests just above the desk during the hold — the drop is a
     short heavy settle, not a long fall (critic: a 3-unit hover read as
     a floating prop). */
  rollGroup.position.y += 1.1;

  function startIntro() {
    if (introStarted || introDone) return;
    introStarted = true;
    window.__INTRO_STATE = "intro-running";
    holder.style.pointerEvents = "auto";
    introTl = window.gsap.timeline({ onComplete: handoff });
    introTl.to({}, { duration: 1.9 }); /* wide hold: desk, candles, rolled scroll */
    /* The single dolly. */
    var dolly = { t: 0 };
    introTl.to(dolly, {
      t: 1, duration: 3.6, ease: "power2.inOut",
      onUpdate: function () { setCam(dolly.t); }
    });
    /* The settle lands during the move: short heavy drop, thud, damped
       rebound. No bounce.out anywhere (ADR-0007/0009). */
    introTl.to(rollGroup.position, {
      y: 0.4, duration: 0.38, ease: "power3.in",
      onStart: function () { if (T) T.unroll(2.4); },
      onComplete: function () {
        if (T) T.thud();
        window.gsap.to(rollGroup.position, {
          y: 0.33, duration: 0.14, ease: "power1.out", yoyo: true, repeat: 1
        });
        window.gsap.to(rollGroup.rotation, {
          z: 0.016, duration: 0.18, ease: "power1.out", yoyo: true, repeat: 3
        });
      }
    }, "<0.3");
    /* The unroll rides the same move. */
    introTl.to({ v: 0 }, {
      v: 1, duration: 2.6, ease: "power1.inOut",
      onUpdate: function () { open = this.targets()[0].v; layRoll(); }
    }, "<0.45");
    introTl.to({}, { duration: 0.35 });
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
    var polls = 0;
    (function poll() {
      if (sheet.tex || polls++ > 24) warmAndGo();
      else setTimeout(poll, 166);
    })();
  })();
  function warmAndGo() {
    try { renderer.compile(scene, camera); } catch (e) {}
    /* Six real frames when frames flow; BOUNDED when they don't — an
       occluded/background tab suspends rAF, and the loader must never
       hang on a frame the compositor refuses to produce. */
    var frames = 0, done = false;
    function finish() {
      if (done) return;
      done = true;
      var waits = 0;
      (function awaitComposer() {
        if (composerReady || waits++ > 15) {
          window.__TAPESTRY_3D_READY = true;
          try { window.dispatchEvent(new CustomEvent("tapestry:3d-ready")); } catch (e) {}
          /* The loader fade gets its beat, then the wide hold starts. */
          setTimeout(startIntro, 700);
          return;
        }
        setTimeout(awaitComposer, 166);
      })();
    }
    var giveUp = setTimeout(finish, 1600);
    (function step() {
      if (done) return;
      if (composer && composerReady && stage <= 1) composer.render();
      else renderer.render(scene, camera);
      if (++frames < 6) { requestAnimationFrame(step); return; }
      clearTimeout(giveUp);
      finish();
    })();
  }
  holder.addEventListener("click", function () {
    if (!introDone && introStarted && introTl) introTl.progress(1);
  });

  /* ---------- Resize ---------- */
  var tornDown = false;
  /* One-way latch: widening back past 768 does NOT rebuild the scene —
     accepted degrade (a reload brings it back). */
  window.addEventListener("resize", function () {
    fitPUSH();
    if (window.innerWidth <= 768 && !tornDown) {
      /* The scene is desktop-only; a squeeze past the breakpoint takes
         the whole layer with it instead of leaving WebGL running. */
      tornDown = true;
      zoneIdle();
      teardown();
      return;
    }
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    if (composer) composer.setSize(window.innerWidth, window.innerHeight);
    topZoneH = zoneTopEl ? zoneTopEl.offsetHeight : window.innerHeight * 1.4;
  });

  /* Flag only after a full boot: app.js's failsafe keys off it to drop
     dead zones and re-measure triggers when the scene never came up. */
  window.__TAPESTRY_3D = true;
  }
})();
