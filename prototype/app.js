/* Ticket #6 full integration: GSAP motion + procedural sound (ADR-0001, ADR-0002 1b).
   GSAP 3.13.0 pinned CDN (MIT). No GSAP -> static readable page (html.no-gsap). */
(function () {
  "use strict";

  /* The site is opinionated: it always opens fresh — intro, top scroll,
     unlit reveals. A back/forward restore resurrects half-dead GSAP/ST
     state, so treat a bfcache hit as a reload (assets stay cached; only
     behaviour re-runs). Registered before anything else can observe. */
  window.addEventListener("pageshow", function (e) {
    if (e.persisted) { try { location.reload(); } catch (err) {} }
  });

  /* Hero snap offset: its section starts below desk+column padding, so
     align its snap point back to page top (responsive via live measure).
     Uses offsetTop (ignores the intro bounce transform; rect would lie). */
  function docTop(el) {
    var t = 0;
    while (el) { t += el.offsetTop; el = el.offsetParent; }
    return t;
  }
  function fixHeroSnap() {
    var h = document.getElementById("hero");
    if (!h) return;
    /* With the sigil cap above it, the hero snaps CENTERED (its top ~
       (50svh - heroH/2) down the viewport) — the same pose the intro
       handoff lands on, so the snap point and the landing never fight. */
    h.style.scrollMarginTop =
      Math.max(0, window.innerHeight / 2 - h.offsetHeight / 2) + "px";
  }
  window.addEventListener("load", fixHeroSnap);
  window.addEventListener("resize", fixHeroSnap);
  fixHeroSnap();
  /* Always open at the top: browsers restore the last scroll offset on
     reload and mandatory snap then pins it (often the bottom).
     Note: ScrollTrigger saves/restores history.scrollRestoration around
     every refresh, clobbering "manual" — re-pin it on refresh. */
  var restoredDeep = window.scrollY > window.innerHeight;
  try {
    if ("scrollRestoration" in window.history) window.history.scrollRestoration = "manual";
    snapTop();
  } catch (e) {}
  window.addEventListener("load", function () {
    try { snapTop(); } catch (e) {}
    /* Late corrections: layout/snap settle after load (fonts, ST refresh).
       Reloaded-deep -> force top; hero-zone drift -> tidy to 0.
       Cancelled by the first real user scroll (no yank-back mid-scroll). */
    var corrections = [1200, 2500].map(function (ms) {
      return setTimeout(function () {
        try {
          /* Never fight the 3D intro (it holds the scroll locked). */
          if (document.body.style.overflow === "hidden") return;
          if ("scrollRestoration" in window.history) window.history.scrollRestoration = "manual";
          if (restoredDeep || window.scrollY < window.innerHeight) snapTop();
        } catch (e) {}
      }, ms);
    });
    ["wheel", "touchmove", "keydown"].forEach(function (ev) {
      window.addEventListener(ev, function cancel() {
        corrections.forEach(clearTimeout);
      }, { once: true, passive: true });
    });
  });
  /* Instant reset: CSS smooth-scroll would glide the programmatic
     scroll and let mandatory snap grab a mid-point instead.
     ScrollTrigger.update() keeps ST's cached scroll in sync with the
     jump — a refresh landing in this window would otherwise measure
     every trigger offset by the jump (verified failure). */
  function snapTop() {
    var de = document.documentElement;
    var prev = de.style.scrollBehavior;
    de.style.scrollBehavior = "auto";
    window.scrollTo(0, 0);
    de.style.scrollBehavior = prev;
    if (window.ScrollTrigger) { try { window.ScrollTrigger.update(); } catch (e) {} }
  }

  var ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"];

  /* Quest pulls render from this array: add an entry, get a pull.
     (content.json externalization lands with #10; same shape.) */
  var QUESTS = [
    {
      eyebrow: "Quest I \u00B7 placeholder",
      title: "Placeholder Quest Title",
      text: "Placeholder quest line one. Placeholder quest line two.",
      role: "Placeholder role",
      runes: ["Three.js", "GSAP", "Web Audio"],
      tale: "Placeholder tale line one. Placeholder tale line two.",
      img: "../.tmp/pen-runs/assets/quest-castle.jpg",
      alt: "Placeholder quest sketch, black and white"
    },
    {
      eyebrow: "Quest II \u00B7 placeholder",
      title: "Placeholder Quest Title",
      text: "Placeholder quest line one. Placeholder quest line two.",
      role: "Placeholder role",
      runes: ["Three.js", "GSAP", "Web Audio"],
      tale: "Placeholder tale line one. Placeholder tale line two.",
      img: "../.tmp/pen-runs/assets/quest-breviary.jpg",
      alt: "Placeholder quest sketch, black and white"
    }
  ];

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Pulls render + Progress numerals computed from count ---------- */
  function renderQuests() {
    var total = QUESTS.length + 2;
    var last = ROMAN[total - 1];
    var html = "";
    QUESTS.forEach(function (q, i) {
      var n = i + 1;
      var num = ROMAN[n];
      var runes = q.runes.map(function (r) { return "<li>" + r + "</li>"; }).join("");
      html += '<section class="pull" id="quest-' + n + '" data-pull="' + num + '">'
        + '<div class="quest-grid"><article class="quest-card">'
        + '<p class="eyebrow ember-reveal">' + q.eyebrow + "</p>"
        + '<h2 class="quest-title ember-reveal">' + q.title + "</h2>"
        + '<p class="quest-text ember-reveal">' + q.text + "</p>"
        + '<p class="meta ember-reveal">Role: ' + q.role + "</p>"
        + '<p class="links ember-reveal"><a href="#quest-' + n + '">Live</a> &middot; <a href="#quest-' + n + '">Code</a></p>'
        + '<ul class="runes ember-reveal">' + runes + "</ul>"
        + '<p class="tale ember-reveal"><span class="tale-label">Tale so far:</span> ' + q.tale + "</p>"
        + "</article>"
        + '<figure class="sketch ink-reveal"><img src="' + q.img + '" alt="' + q.alt + '"></figure>'
        + "</div>"
        + '<footer class="pull-footer"><span>' + num + " of " + last + "</span></footer></section>"
        + '<div class="divider" aria-hidden="true"><span class="diamond"></span></div>';
    });
    document.getElementById("quests").innerHTML = html;
    setFooter("hero", ROMAN[0] + " of " + last);
    setFooter("about-contact", last + " of " + last);
  }
  function setFooter(id, text) {
    var f = document.querySelector("#" + id + " .pull-footer span");
    if (f) f.textContent = text;
  }

  /* ---------- Procedural sound + music: zero files ----------
     ADR-0013 rev 2 (user: the drone read as "a random low frequency
     hum"): the kindle button now lights a generative mystic harp —
     Karplus-Strong plucked strings, slow D-dorian phrases, generated-
     impulse reverb — over a quiet fire hiss. Interaction SFX (deep
     two-layer thud, low-passed unroll sweep, granular crackle) are
     unchanged. Still 100% procedural, gesture-gated, kindle-gated
     (ADR-0001/0002). */
  function Engine() {
    this.ctx = null;
    this.master = null;
    this.drone = null;
    this.ambience = null;
    this.reverb = null;
  }
  Engine.prototype.unlock = function () {
    if (!this.ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
    return true;
  };
  Engine.prototype.setMaster = function (on) {
    if (!this.ctx) return;
    var t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.linearRampToValueAtTime(on ? 1 : 0, t + 0.4);
  };
  /* Generated impulse response: 1.8s stereo noise, fast exponential tail.
     Cheap room for everything sent through it. */
  Engine.prototype.reverbSend = function () {
    if (this.reverb) return this.reverb;
    var c = this.ctx;
    var len = Math.floor(c.sampleRate * 1.8);
    var buf = c.createBuffer(2, len, c.sampleRate);
    for (var ch = 0; ch < 2; ch++) {
      var d = buf.getChannelData(ch);
      for (var i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
      }
    }
    var cv = c.createConvolver();
    cv.buffer = buf;
    var wet = c.createGain();
    wet.gain.value = 0.32;
    cv.connect(wet);
    wet.connect(this.master);
    this.reverb = cv;
    return cv;
  };
  Engine.prototype.noiseBuffer = function (dur) {
    var c = this.ctx;
    var len = Math.floor(c.sampleRate * dur);
    var buf = c.createBuffer(1, len, c.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  };
  /* ---------- Music: mystic harp, zero files (ADR-0013 rev 2) ----------
     The user's verdict on the drone: "just a random low frequency hum" —
     the 55-110 Hz oscillator stack is gone entirely. In its place a
     generative harp: Karplus-Strong plucked strings synthesized offline
     into cached buffers (one compile per note, then it's playback), a
     slow phrase generator wandering D dorian, everything through the
     shared generated-impulse reverb. A faint fire-hiss bed stays behind
     it (filtered noise, no tonal content). Still 100% procedural,
     gesture-gated, kindle-gated (ADR-0001/0002). */
  Engine.prototype.pluckBuffer = function (freq) {
    var key = String(Math.round(freq));
    if (this._plucks && this._plucks[key]) return this._plucks[key];
    this._plucks = this._plucks || {};
    var c = this.ctx;
    var sr = c.sampleRate;
    var N = Math.max(2, Math.round(sr / freq));
    var len = Math.floor(sr * 2.2);
    var buf = c.createBuffer(1, len, sr);
    var d = buf.getChannelData(0);
    /* Excitation: smoothed noise burst (the pluck), softened so the
       string sings warm instead of buzz-like. */
    var i;
    for (i = 0; i < N + 1 && i < len; i++) d[i] = Math.random() * 2 - 1;
    for (i = 1; i < N + 1 && i < len; i++) d[i] = (d[i] + d[i - 1]) * 0.5;
    /* Karplus-Strong loop: delayed averaging decays into a plucked
       string; rho near 1 gives the long harp sustain. */
    for (i = N + 1; i < len; i++) {
      d[i] = 0.5 * 0.9965 * (d[i - N] + d[i - N - 1]);
    }
    /* Fade the tail so a looping phrase never clicks at buffer end. */
    var fade = Math.floor(sr * 0.25);
    for (i = 0; i < fade; i++) d[len - 1 - i] *= i / fade;
    this._plucks[key] = buf;
    return buf;
  };
  Engine.prototype.pluck = function (freq, at, vel, bright) {
    if (!this.ctx || !this.harpBus) return;
    var c = this.ctx;
    var g = c.createGain();
    g.gain.value = vel;
    g.connect(this.harpBus);
    var mk = function (rate, v) {
      var src = c.createBufferSource();
      src.buffer = this.pluckBuffer(freq);
      src.playbackRate.value = rate;
      var vg = c.createGain();
      vg.gain.value = v;
      src.connect(vg);
      vg.connect(g);
      src.start(at);
      src.stop(at + 2.3);
    }.bind(this);
    mk(1, 1);
    /* Detuned second voice: the shimmer of a real strung instrument. */
    mk(1.0022, 0.45);
    if (bright) {
      /* Brightness accent on phrase heads: open the top a beat. */
      var f = c.createBiquadFilter();
      f.type = "highshelf";
      f.frequency.value = 2200;
      f.gain.setValueAtTime(3.5, at);
      f.gain.linearRampToValueAtTime(0, at + 0.5);
      g.disconnect();
      g.connect(f);
      f.connect(this.harpBus);
    }
  };
  Engine.prototype.kindleMusic = function () {
    if (this._harpTimer) { this._musicOn = true; return; }
    var c = this.ctx;
    /* Harp bus: gentle lowpass keeps the plucks woody, reverb sends out. */
    var f = c.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 3400;
    f.Q.value = 0.4;
    var g = c.createGain();
    g.gain.value = 0.5;
    f.connect(g);
    g.connect(this.master);
    var send = c.createGain();
    send.gain.value = 0.45;
    g.connect(send);
    send.connect(this.reverbSend());
    this.harpBus = f; /* plucks feed the filter input */
    /* Candle-fire bed: soft looping hiss, breathing (kept — noise, not
       the hum the user rejected). Built once; silenceMusic stops it, so
       off→on cycles never stack a second chain (critic P2). */
    if (!this._amb) {
      var amb = c.createBufferSource();
      amb.buffer = this.noiseBuffer(2.4);
      amb.loop = true;
      var ambF = c.createBiquadFilter();
      ambF.type = "lowpass";
      ambF.frequency.value = 480;
      var ambG = c.createGain();
      ambG.gain.value = 0.009;
      var ambLfo = c.createOscillator();
      ambLfo.frequency.value = 0.13;
      var ambLfoG = c.createGain();
      ambLfoG.gain.value = 0.005;
      ambLfo.connect(ambLfoG);
      ambLfoG.connect(ambG.gain);
      amb.connect(ambF);
      ambF.connect(ambG);
      ambG.connect(this.master);
      amb.start();
      ambLfo.start();
      this._amb = { src: amb, lfo: ambLfo };
    }
    /* Phrase generator: a slow random walk over D dorian. Phrases arc,
       cadence toward the root, breathe between — nothing loops audibly. */
    var SCALE = [146.83, 174.61, 196.0, 220.0, 261.63, 293.66, 349.23, 392.0, 440.0, 587.33];
    var that = this;
    this._musicOn = true;
    var next = c.currentTime + 0.4;
    var idx = 4, dir = 1;
    var notesLeft = 7 + Math.floor(Math.random() * 6);
    var notesTotal = notesLeft;
    (function step() {
      if (!that._musicOn) { that._harpTimer = null; return; }
      while (next < that.ctx.currentTime + 1.3) {
        var vel = 0.2 + Math.random() * 0.26;
        var head = notesLeft === notesTotal;
        var cadence = notesLeft === 1;
        that.pluck(SCALE[idx], next, vel, head);
        /* Occasional dyad below — the harp's two-hand spread. */
        if (Math.random() < 0.16 && idx >= 2) {
          that.pluck(SCALE[idx - 2], next + 0.016, vel * 0.5, false);
        }
        /* Low root under the phrase's last note. */
        if (cadence && Math.random() < 0.55) {
          that.pluck(SCALE[0] / 2, next, 0.22, false);
        }
        notesLeft--;
        if (notesLeft <= 0) {
          notesTotal = 7 + Math.floor(Math.random() * 6);
          notesLeft = notesTotal;
          idx = Math.random() < 0.4 ? 0 : 2 + Math.floor(Math.random() * 4);
          next += 1.1 + Math.random() * 1.3; /* breathe between phrases */
        } else {
          var leap = Math.random() < 0.78 ? 1 : 2;
          idx += (Math.random() < 0.82 ? dir : -dir) * leap;
          if (idx >= SCALE.length) { idx = SCALE.length - 2; dir = -1; }
          if (idx < 0) { idx = 1; dir = 1; }
          next += 0.3 + Math.random() * 0.26;
        }
      }
      that._harpTimer = setTimeout(step, 280);
    })();
  };
  Engine.prototype.silenceMusic = function () {
    this._musicOn = false;
    /* Stop the hiss chain too — master gain alone would leave it running
       and every re-kindle would stack another (critic P2). */
    if (this._amb) {
      try { this._amb.src.stop(); this._amb.lfo.stop(); } catch (e) {}
      this._amb = null;
    }
  };
  /* Seal/raven thud, rebuilt deeper: sub drop + knock body + felt tap. */
  Engine.prototype.thud = function () {
    if (!this.ctx) return;
    var c = this.ctx, t = c.currentTime;
    var sub = c.createOscillator(), sg = c.createGain();
    sub.type = "sine";
    sub.frequency.setValueAtTime(74, t);
    sub.frequency.exponentialRampToValueAtTime(26, t + 0.4);
    sg.gain.setValueAtTime(0.85, t);
    sg.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    sub.connect(sg);
    sg.connect(this.master);
    var sendG = c.createGain();
    sendG.gain.value = 0.3;
    sg.connect(sendG);
    sendG.connect(this.reverbSend());
    sub.start(t);
    sub.stop(t + 0.6);
    var knock = c.createOscillator(), kg = c.createGain();
    knock.type = "triangle";
    knock.frequency.setValueAtTime(190, t);
    knock.frequency.exponentialRampToValueAtTime(55, t + 0.09);
    kg.gain.setValueAtTime(0.4, t);
    kg.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    knock.connect(kg);
    kg.connect(this.master);
    knock.start(t);
    knock.stop(t + 0.2);
    var tap = c.createBufferSource();
    tap.buffer = this.noiseBuffer(0.06);
    var tf = c.createBiquadFilter();
    tf.type = "lowpass";
    tf.frequency.value = 420;
    var tg = c.createGain();
    tg.gain.setValueAtTime(0.25, t);
    tg.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    tap.connect(tf);
    tf.connect(tg);
    tg.connect(this.master);
    tap.start(t);
  };
  /* Parchment friction, rebuilt longer and lower with a wobble. */
  Engine.prototype.unroll = function (dur) {
    if (!this.ctx) return;
    dur = dur || 2.2;
    var c = this.ctx, t = c.currentTime;
    var src = c.createBufferSource();
    src.buffer = this.noiseBuffer(dur);
    var f = c.createBiquadFilter();
    f.type = "lowpass";
    f.Q.value = 0.8;
    f.frequency.setValueAtTime(1400, t);
    f.frequency.exponentialRampToValueAtTime(260, t + dur);
    var g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.22, t + 0.25);
    g.gain.linearRampToValueAtTime(0.12, t + dur * 0.7);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    var wobble = c.createOscillator();
    wobble.frequency.value = 7;
    var wg = c.createGain();
    wg.gain.value = 0.045;
    wobble.connect(wg);
    wg.connect(g.gain);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t);
    wobble.start(t);
    wobble.stop(t + dur);
  };
  /* Crackle bed: discrete grains + a faint hiss, like char consuming paper. */
  Engine.prototype.crackle = function () {
    if (!this.ctx) return;
    var c = this.ctx, t = c.currentTime;
    var grains = 5 + Math.floor(Math.random() * 3);
    for (var i = 0; i < grains; i++) {
      var at = t + Math.random() * 0.45;
      var src = c.createBufferSource();
      src.buffer = this.noiseBuffer(0.02 + Math.random() * 0.03);
      var f = c.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = 1600 + Math.random() * 2400;
      f.Q.value = 2.5;
      var g = c.createGain();
      g.gain.setValueAtTime(0.05 + Math.random() * 0.11, at);
      g.gain.exponentialRampToValueAtTime(0.001, at + 0.05);
      src.connect(f);
      f.connect(g);
      g.connect(this.master);
      src.start(at);
    }
    var hiss = c.createBufferSource();
    hiss.buffer = this.noiseBuffer(0.3);
    var hf = c.createBiquadFilter();
    hf.type = "highpass";
    hf.frequency.value = 3000;
    var hg = c.createGain();
    hg.gain.setValueAtTime(0.03, t);
    hg.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    hiss.connect(hf);
    hf.connect(hg);
    hg.connect(this.master);
    hiss.start(t);
  };

  var engine = new Engine();
  var kindleOn = false;
  var lastPullSound = 0, lastCrackle = 0;

  function soundOn() {
    return kindleOn && engine.ctx && engine.ctx.state === "running";
  }
  function pullSound() {
    var now = Date.now();
    if (soundOn() && now - lastPullSound > 900) {
      lastPullSound = now;
      engine.unroll(0.6);
    }
  }
  /* Crackle bed under charred reveals (throttled across elements). */
  function crackleMaybe() {
    var now = Date.now();
    if (soundOn() && now - lastCrackle > 500) {
      lastCrackle = now;
      engine.crackle();
    }
  }

  /* ---------- Kindle (1b): harp music, persisted, muted-first ---------- */
  function initKindle() {
    var btn = document.getElementById("kindle");
    kindleOn = window.localStorage.getItem("tapestry-muted") !== "1"
      && window.localStorage.getItem("tapestry-kindled") === "1";
    btn.hidden = false;
    paint();
    /* The pulse is an invitation, not a status: stop it after the first
       interaction (or half a minute of attention). */
    var settle = function () { btn.classList.add("settled"); };
    btn.addEventListener("click", settle, { once: true });
    setTimeout(settle, 30000);
    btn.addEventListener("click", function () {
      engine.unlock();
      kindleOn = !kindleOn;
      if (kindleOn) engine.kindleMusic();
      else engine.silenceMusic();
      engine.setMaster(kindleOn);
      window.localStorage.setItem("tapestry-kindled", kindleOn ? "1" : "0");
      window.localStorage.setItem("tapestry-muted", kindleOn ? "0" : "1");
      paint();
    });
    function paint() {
      /* Icon swap is CSS-class only: the `hidden` IDL does not reflect
         on SVG elements, so property toggling silently fails there. */
      btn.classList.toggle("on", kindleOn);
      btn.setAttribute("aria-pressed", kindleOn ? "true" : "false");
    }
  }

  /* ---------- Ember particles (step 3): rising sparks on reveals ---------- */
  var emberCanvas = document.getElementById("embers");
  var ectx = emberCanvas ? emberCanvas.getContext("2d") : null;
  var sparks = [];
  function sizeEmbers() {
    if (!emberCanvas) return;
    emberCanvas.width = Math.floor(window.innerWidth * Math.min(window.devicePixelRatio || 1, 2));
    emberCanvas.height = Math.floor(window.innerHeight * Math.min(window.devicePixelRatio || 1, 2));
  }
  sizeEmbers();
  window.addEventListener("resize", sizeEmbers);
  function burst(x, y, n) {
    if (!ectx || reduced) return;
    var s = Math.min(window.devicePixelRatio || 1, 2);
    for (var i = 0; i < (n || 14); i++) {
      sparks.push({
        x: (x + (Math.random() - 0.5) * 60) * s,
        y: (y + (Math.random() - 0.5) * 20) * s,
        vx: (Math.random() - 0.5) * 0.6 * s,
        vy: (-0.6 - Math.random() * 1.2) * s,
        r: (1 + Math.random() * 2.2) * s,
        life: 1
      });
    }
    if (sparks.length > 220) sparks.splice(0, sparks.length - 220);
  }
  var hadSparks = false;
  (function emberLoop() {
    requestAnimationFrame(emberLoop);
    if (!ectx) return;
    if (!sparks.length) {
      if (hadSparks && ectx.clearRect) {
        ectx.clearRect(0, 0, emberCanvas.width, emberCanvas.height);
        hadSparks = false;
      }
      return;
    }
    hadSparks = true;
    ectx.clearRect(0, 0, emberCanvas.width, emberCanvas.height);
    sparks = sparks.filter(function (p) { return p.life > 0; });
    sparks.forEach(function (p) {
      p.x += p.vx; p.y += p.vy; p.vy -= 0.008; p.life -= 0.016;
      var a = Math.max(p.life, 0);
      ectx.beginPath();
      ectx.fillStyle = "rgba(255," + Math.floor(154 + 60 * a) + ",42," + (0.85 * a).toFixed(2) + ")";
      ectx.shadowColor = "rgba(255,154,42,0.9)";
      ectx.shadowBlur = 8;
      ectx.arc(p.x, p.y, p.r * a + 0.4, 0, 6.283);
      ectx.fill();
    });
    ectx.shadowBlur = 0;
  })();
  function sparkAt(el, n) {
    try {
      var r = el.getBoundingClientRect();
      burst(r.left + r.width * (0.3 + Math.random() * 0.4), r.top + r.height * 0.55, n);
    } catch (e) {}
  }

  /* ---------- Ember reveal (ADR-0011): per-character charred ignition.
     Each glyph lands white-hot (fast), holds, then cools to ink over the
     400ms token, staggered L->R so a burn passes through the line. The
     old gradient fire-front bar is gone.
     Reveal policy (ADR-0011 addendum): every reveal REPLAYS each time its
     element re-enters the viewport (hysteresis via requestReveal), never
     fires behind the 3D layer (zone defer), and the hero batch waits for
     the intro handoff (gate) so nothing plays unseen. ---------- */
  function splitChars(el) {
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    var texts = [];
    while (walker.nextNode()) texts.push(walker.currentNode);
    var idx = 0;
    texts.forEach(function (node) {
      var frag = document.createDocumentFragment();
      var s = node.nodeValue;
      /* Chars ride in inline-block spans, so words must be wrapped in
         nowrap groups or the browser breaks lines mid-word. */
      var word = null;
      function flushWord() {
        word = null;
      }
      for (var i = 0; i < s.length; i++) {
        var chr = s[i];
        if (chr === " " || chr === "\n" || chr === "\t") {
          flushWord();
          frag.appendChild(document.createTextNode(chr === "\n" ? " " : chr));
          continue;
        }
        if (!word) {
          word = document.createElement("span");
          word.className = "ch-word";
          word.setAttribute("aria-hidden", "true");
          frag.appendChild(word);
        }
        var sp = document.createElement("span");
        sp.className = "ch";
        sp.textContent = chr;
        var d = Math.round(idx * 14 + Math.random() * 36);
        /* Appear fast; color/shadow cool starts later, runs 400ms. */
        sp.style.transitionDelay =
          d + "ms," + d + "ms," + d + "ms," + (d + 230) + "ms," + (d + 230) + "ms";
        word.appendChild(sp);
        idx++;
      }
      flushWord();
      node.parentNode.replaceChild(frag, node);
    });
    el.setAttribute("aria-label", (el.textContent || "").replace(/\s+/g, " ").trim());
    return idx;
  }
  function emberOn(el) {
    if (reduced || !window.gsap || (el.textContent || "").trim().length > 240) {
      el.classList.add("revealed", "cooled");
      return;
    }
    /* Split once; replays only flip the state classes back and forth. */
    if (!el.dataset.split) {
      splitChars(el);
      el.dataset.split = "1";
    } else {
      /* Snap the chars back to their unlit state with transitions off,
         else re-adding .ignited the same frame just reverses mid-flight. */
      el.classList.add("rearm");
      el.classList.remove("ignited", "cooled");
      void el.offsetWidth;
      el.classList.remove("rearm");
    }
    el.classList.add("revealed");
    var n = el.querySelectorAll(".ch").length || 1;
    sparkAt(el, Math.min(22, 8 + Math.round(n / 6)));
    crackleMaybe();
    /* Next frame: flip to ignite so the per-char transitions run. */
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        el.classList.add("ignited");
      });
    });
    var total = 230 + n * 14 + 60 + 420;
    setTimeout(function () { el.classList.add("cooled"); }, total);
  }

  /* ---------- Ink reveal (ADR-0011): a burning filament sweeps
     top->bottom, the sketch draws in behind it, the frame cools. ---------- */
  function inkOn(el) {
    if (el.classList.contains("revealed")) {
      /* Replay: snap-reset, drop leftover effects, run again. */
      el.classList.add("rearm");
      el.classList.remove("revealed", "framed");
      void el.offsetWidth;
      el.classList.remove("rearm");
      var stale = el.querySelectorAll(".char-line, .burn-frame");
      for (var i = 0; i < stale.length; i++) stale[i].remove();
    }
    el.classList.add("revealed");
    if (reduced || !window.gsap) {
      el.classList.add("framed");
      return;
    }
    sparkAt(el, 18);
    crackleMaybe();
    var line = document.createElement("span");
    line.className = "char-line";
    line.setAttribute("aria-hidden", "true");
    var frame = document.createElement("span");
    frame.className = "burn-frame";
    frame.setAttribute("aria-hidden", "true");
    el.appendChild(line);
    el.appendChild(frame);
    window.gsap.fromTo(line, { top: "-8%" }, {
      top: "102%", duration: 1.05, ease: "power1.inOut",
      onComplete: function () {
        /* A fast replay replaced this line: the new play owns the element
           now — don't strip its frame mid-flight (critic P2). */
        if (!line.isConnected) return;
        line.remove();
        el.classList.add("framed");
        sparkAt(el, 10);
        setTimeout(function () { frame.remove(); el.classList.remove("framed"); }, 650);
      }
    });
  }

  /* Draw-on reveal (sigil caps): stroke dashes fill in, replayable. */
  function drawOn(el) {
    if (el.classList.contains("on")) {
      el.classList.add("rearm");
      el.classList.remove("on");
      void el.offsetWidth;
      el.classList.remove("rearm");
    }
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { el.classList.add("on"); });
    });
  }

  /* ---------- Reveal scheduler: gate + zone defer + cooldown ----------
     Gate: nothing plays until the intro handoff (or its failsafe) — hero
     reveals must be SEEN, never pre-fired under the 3D layer.
     Zone defer: reveals don't play while a desk zone owns the screen;
     they flush the moment the 2D column is visible again.
     Cooldown: rapid boundary jitter can't machine-gun replays. */
  var revealsOpen = !window.gsap; /* no-gsap page shows everything anyway */
  var pendingGate = [];
  var pendingZone = [];
  var lastPlay = new WeakMap();
  function seenRecently(el) {
    var now = performance.now();
    if (now - (lastPlay.get(el) || 0) < 900) return true;
    lastPlay.set(el, now);
    return false;
  }
  function inDeskZone() {
    var zt = document.getElementById("zone-top");
    var zb = document.getElementById("zone-bottom");
    if (!zt || !zb) return false;
    var y = window.scrollY;
    /* Same geometry the 3D module uses for zone membership. */
    if (y < zt.offsetHeight - 2) return true;
    if (y + window.innerHeight * 0.85 >= zb.offsetTop) return true;
    return false;
  }
  function requestReveal(el, fn) {
    if (!revealsOpen) { if (pendingGate.indexOf(el) < 0) pendingGate.push(el); return; }
    if (inDeskZone()) { if (pendingZone.indexOf(el) < 0) pendingZone.push(el); return; }
    playNow(el, fn);
  }
  /* Single play path: dequeues the element everywhere, then honors the
     cooldown — the batched flushes must not bypass it, or the lead sigil
     machine-guns at the zone boundary (critic P1). */
  function playNow(el, fn) {
    var gi = pendingGate.indexOf(el);
    if (gi >= 0) pendingGate.splice(gi, 1);
    var zi = pendingZone.indexOf(el);
    if (zi >= 0) pendingZone.splice(zi, 1);
    if (seenRecently(el)) return;
    fn(el);
  }
  function inView(el) {
    var r = el.getBoundingClientRect();
    return r.top < window.innerHeight && r.bottom > 0;
  }
  function openReveals() {
    if (revealsOpen) return;
    revealsOpen = true;
    /* Stagger the landing batch so the ignition sweeps, not pops. */
    var batch = pendingGate.filter(inView);
    batch.forEach(function (el, i) {
      var fn = el.classList.contains("ink-reveal") ? inkOn
        : el.classList.contains("draw-reveal") ? drawOn : emberOn;
      setTimeout(function () { playNow(el, fn); }, 120 + i * 110);
    });
    pendingGate.length = 0;
  }
  function flushZonePending() {
    if (inDeskZone() || !revealsOpen) return;
    var batch = pendingZone.filter(inView);
    batch.forEach(function (el, i) {
      var fn = el.classList.contains("ink-reveal") ? inkOn
        : el.classList.contains("draw-reveal") ? drawOn : emberOn;
      setTimeout(function () { playNow(el, fn); }, 60 + i * 110);
    });
    pendingZone.length = 0;
  }
  window.addEventListener("tapestry:handoff", openReveals);
  window.addEventListener("scroll", function () {
    if (pendingZone.length) flushZonePending();
  }, { passive: true });

  /* ---------- Shared parchment (ADR-0008): one generator feeds the DOM
     column background AND the 3D sheet texture (scene.js consumes
     TAPESTRY_READY / TAPESTRY_CONTENT). ---------- */
  function buildContentBlocks() {
    /* innerText: keeps the <br> as a break so "one.\nPlaceholder" keeps
       its space when flattened. */
    function txt(sel) {
      var el = document.querySelector(sel);
      if (!el) return "";
      return (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
    }
    var heroImg = new Image();
    heroImg.src = "../.tmp/pen-runs/assets/hero-chalk.jpg";
    /* Gate labels read from the DOM — the sheet never paraphrases. */
    var ctas = [];
    document.querySelectorAll("#hero .cta-row .cta").forEach(function (a) {
      ctas.push(a.textContent.replace(/\s+/g, " ").trim());
    });
    var blocks = [];
    /* Sigil cap: blank parchment + crest before the hero, so the letter's
       first page opens mid-desk (user: content must not start at the top
       edge). Same height formula drives the DOM .sheet-cap so the seam
       stays aligned; the tail mirrors it after the colophon. */
    var capH = Math.round(window.innerHeight * 0.36);
    blocks.push({ t: "cap", h: capH });
    /* Hero mirrors the DOM row: portrait left, stack + gates right. */
    blocks.push({
      t: "heroRow",
      img: heroImg,
      texts: [
        { t: "eyebrow", text: txt("#hero .eyebrow") },
        { t: "display", text: txt("#hero .name") },
        { t: "hand", text: txt("#hero .hand-title") },
        { t: "body", text: txt("#hero .hook") }
      ],
      ctas: ctas.length ? ctas : ["View quests", "Send raven"]
    });
    blocks.push({ t: "footer", text: "I of IV" });
    blocks.push({ t: "divider" });
    var sketches = [];
    var total = QUESTS.length + 2;
    QUESTS.forEach(function (q, i) {
      var sk = { t: "sketch", src: q.img, img: null };
      sketches.push(sk);
      blocks.push({ t: "eyebrow", text: q.eyebrow });
      blocks.push({ t: "display", text: q.title });
      blocks.push({ t: "body", text: q.text });
      blocks.push({
        t: "questRow",
        left: [
          { t: "small", text: "Role: " + q.role + " \u00B7 Live \u00B7 Code" },
          { t: "chips", items: q.runes },
          { t: "body", text: "Tale so far: " + q.tale }
        ],
        img: q.img, src: q.img
      });
      blocks.push({ t: "footer", text: ROMAN[i + 1] + " of " + ROMAN[total - 1] });
      blocks.push({ t: "divider" });
    });
    blocks.push({ t: "eyebrow", text: txt("#about .eyebrow") });
    blocks.push({ t: "display", text: txt("#about .quest-title") });
    document.querySelectorAll("#about p:not(.eyebrow)").forEach(function (p) {
      blocks.push({ t: "body", text: p.textContent.replace(/\s+/g, " ").trim() });
    });
    var ways = [];
    document.querySelectorAll("#about .ways li").forEach(function (li) {
      ways.push(li.textContent.replace(/\s+/g, " ").trim());
    });
    if (ways.length) blocks.push({ t: "small", text: ways.join("  \u00B7  ") });
    blocks.push({ t: "eyebrow", text: txt("#contact .eyebrow") });
    blocks.push({ t: "display", text: txt("#contact .quest-title") });
    blocks.push({ t: "footer", text: ROMAN[total - 1] + " of " + ROMAN[total - 1] });
    blocks.push({ t: "divider" });
    blocks.push({ t: "small", text: txt(".colophon p") });
    blocks.push({ t: "cap", h: Math.round(capH * 0.8), label: "fin" });
    /* questRow sketches ride inside the row blocks — tag them for preload. */
    blocks.forEach(function (b) {
      if (b.t === "questRow") sketches.push(b);
    });
    return { blocks: blocks, sketches: sketches };
  }
  window.TAPESTRY_READY = (function () {
    if (!window.Parchment) return Promise.resolve();
    var built = buildContentBlocks();
    return window.Parchment.preload(built.sketches.map(function (s) { return s.src; }))
      .then(function (imgs) {
        imgs.forEach(function (im, i) { built.sketches[i].img = im; });
        window.TAPESTRY_CONTENT = { blocks: built.blocks };
      })
      .catch(function () {});
  })();
  function textureColumn() {
    var col = document.querySelector(".column");
    if (!col || !window.Parchment) return;
    window.Parchment.loadGrain()
      .then(function () { return window.Parchment.fonts(); })
      .then(function () {
        var w = 768;
        var h = Math.min(4096, Math.max(1024,
          Math.round(col.scrollHeight * w / Math.max(1, col.clientWidth))));
        /* Scorches where the dividers sit, like the 3D sheet. */
        var marks = [];
        document.querySelectorAll(".divider").forEach(function (d) {
          var t = 0, el = d;
          while (el && el !== col) { t += el.offsetTop; el = el.offsetParent; }
          marks.push(((t - col.offsetTop) / Math.max(1, col.scrollHeight)) * h);
        });
        var c = window.Parchment.base(w, h, { seed: 7, marks: marks });
        c.toBlob(function (blob) {
          if (!blob) return;
          /* Revoke the previous bake so successive layouts don't leak. */
          if (col.dataset.bgUrl) {
            try { URL.revokeObjectURL(col.dataset.bgUrl); } catch (e) {}
          }
          var url = URL.createObjectURL(blob);
          col.dataset.bgUrl = url;
          col.style.backgroundImage = 'url("' + url + '")';
          col.style.backgroundSize = "100% 100%";
          col.classList.add("textured");
        }, "image/jpeg", 0.92);
      })
      .catch(function () {});
  }

  /* ---------- Boot ---------- */
  renderQuests();

  /* ---------- Loader: gated, bounded (ADR-0002 revision) ----------
     The 3D scene reports "3d-ready" only after the sheet bake, a full
     shader precompile and several real render frames — the loader then
     dissolves and the intro dolly starts smooth instead of paying the
     GPU's first-frame compile bill on screen (user). Bounded: a no-3D
     page (mobile / reduced / boot crash) or a dead module falls back to
     a timed drop so the page can never hang on the loader. */
  var loaderGone = false;
  function dropLoader() {
    if (loaderGone) return;
    loaderGone = true;
    document.getElementById("loader").classList.add("gone");
    /* The column settle rides the dissolve instead of a fixed timer, so
       it is never spent behind the loader. */
    if (window.gsap && !reduced) {
      gsap.from(".column", { y: -22, duration: 1.05, ease: "power3.out", delay: 0.15 });
    }
    try { window.dispatchEvent(new Event("tapestry:loader-gone")); } catch (e) {}
  }
  function openWhenReadable() {
    if (loaderGone || revealsOpen) openReveals();
    else window.addEventListener("tapestry:loader-gone", openReveals, { once: true });
  }
  if (window.__TAPESTRY_3D_READY || window.__TAPESTRY_NO_3D) dropLoader();
  else {
    window.addEventListener("tapestry:3d-ready", dropLoader);
    window.addEventListener("tapestry:no-3d", dropLoader);
    /* Module graph failed outright (CDN dead): drop immediately. */
    var sceneTag = document.querySelector('script[src*="scene.js"]');
    if (sceneTag) sceneTag.addEventListener("error", dropLoader);
    /* Bounded, and the ONLY "scene absent" verdict: a slow CDN must not
       lose the desk bands to a premature failsafe (verified failure: zones
       removed at 3.5s while the module was still fetching three.js —
       the page then lived without the 3D bands entirely). The reveal gate
       opens ONLY in the absent case — a live-but-slow scene (intro still
       running) keeps its gate for the handoff, or the hero pre-ignites
       behind the opaque layer (critic P1). */
    setTimeout(function () {
      if (!window.__TAPESTRY_3D) {
        document.querySelectorAll(".desk-zone").forEach(function (z) { z.remove(); });
        fixHeroSnap();
        rebuildReveals();
        dropLoader();
        openWhenReadable();
      } else {
        dropLoader();
      }
    }, 15000);
  }
  window.addEventListener("load", function () { textureColumn(); });

  initKindle();
  /* First gesture unlocks the context (silent until kindle kindles).
     A kindle restored from localStorage lights the harp on this first
     gesture — and MUST unmute the master: unlock() creates the context
     at gain 0, and without this the restored kindle is silently dead
     (critic P1). */
  window.addEventListener("pointerdown", function unlock() {
    engine.unlock();
    if (kindleOn) {
      engine.kindleMusic();
      engine.setMaster(true);
    }
    window.removeEventListener("pointerdown", unlock);
  });

  /* Ink reveal sketches: replay on every (re)entry — no unobserve, the
     scheduler's cooldown absorbs boundary jitter. */
  var inkIO = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) requestReveal(e.target, inkOn);
    });
  }, { threshold: 0.25 });
  document.querySelectorAll(".ink-reveal").forEach(function (el) { inkIO.observe(el); });
  /* Sigil caps (sheet lead-in / tail) draw on the same policy. */
  var drawIO = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) requestReveal(e.target, drawOn);
    });
  }, { threshold: 0.3 });
  document.querySelectorAll(".draw-reveal").forEach(function (el) { drawIO.observe(el); });

  /* Rebuild hook for the failsafes below — assigned inside the gsap
     block; a no-op wherever GSAP/ST is absent. */
  var rebuildReveals = function () {};
  if (window.gsap && !reduced) {
    if (window.ScrollTrigger) {
      gsap.registerPlugin(ScrollTrigger);
      /* NEVER refresh (verified in this stack): ST.refresh() measures
         every trigger shifted by the current scroll — compositor-driven
         CSS snap updates the offset between ST's rect read and its
         cached scroll — silently corrupting all ranges. Creation
         measures correctly at ANY scroll, so the policy is kill +
         re-create (rebuildTriggers) and auto-refresh is disabled. */
      ScrollTrigger.config({ autoRefreshEvents: "none" });
      ScrollTrigger.addEventListener("refresh", function () {
        try { window.history.scrollRestoration = "manual"; } catch (e) {}
      });
    }
    /* The opening column settle moved into dropLoader — it rides the
       loader dissolve instead of a fixed timer (bounce.out is banned,
       ADR-0007/0009). */
    if (window.ScrollTrigger) {
      var stKills = [];
      function buildRevealTriggers() {
        /* Ember text reveals: replay on every entry from either direction
           (ADR-0011 addendum); end line marks "fully seen" so onEnterBack
           re-fires only after a real exit. */
        gsap.utils.toArray(".ember-reveal").forEach(function (el) {
          var t = ScrollTrigger.create({
            trigger: el, start: "top 88%", end: "bottom 15%",
            onEnter: function () { requestReveal(el, emberOn); },
            onEnterBack: function () { requestReveal(el, emberOn); }
          });
          stKills.push(function () { t.kill(); });
        });
        /* Scroll cue bows out past the hero. */
        var cueTween = gsap.to(".scroll-cue", {
          opacity: 0,
          scrollTrigger: { trigger: "#hero", start: "55% top", end: "bottom top", scrub: true }
        });
        stKills.push(function () {
          if (cueTween.scrollTrigger) cueTween.scrollTrigger.kill();
          cueTween.kill();
        });
        /* Camera feel (2D): the hero sketch drifts inside its frame on
           scroll — the frame never moves, so nothing overlaps. */
        var drift = gsap.fromTo(".hero-panel img",
          { scale: 1.1, yPercent: -3 },
          {
            scale: 1.1, yPercent: 3, ease: "none",
            scrollTrigger: { trigger: "#hero", start: "top top", end: "bottom top", scrub: true }
          });
        stKills.push(function () {
          if (drift.scrollTrigger) drift.scrollTrigger.kill();
          drift.kill();
        });
        /* Sketch settle: replays like every other reveal. */
        gsap.utils.toArray("#quests .sketch img").forEach(function (img) {
          var t = ScrollTrigger.create({
            trigger: img, start: "top 85%", end: "bottom 15%",
            onEnter: function () {
              gsap.fromTo(img, { scale: 1.06 }, { scale: 1, duration: 0.9, ease: "power2.out", overwrite: true });
            },
            onEnterBack: function () {
              gsap.fromTo(img, { scale: 1.06 }, { scale: 1, duration: 0.9, ease: "power2.out", overwrite: true });
            }
          });
          stKills.push(function () { t.kill(); });
        });
        /* Pull-change friction, quest pulls onward. */
        gsap.utils.toArray(".pull").forEach(function (p, idx) {
          if (idx === 0) return;
          var t = ScrollTrigger.create({
            trigger: p, start: "top 60%",
            onEnter: pullSound, onEnterBack: pullSound
          });
          stKills.push(function () { t.kill(); });
        });
      }
      function rebuildTriggers() {
        stKills.forEach(function (k) { try { k(); } catch (e) {} });
        stKills = [];
        buildRevealTriggers();
      }
      buildRevealTriggers();
      rebuildReveals = rebuildTriggers;
      /* Resize re-measures via rebuild (refresh is banned). Debounced:
         a live resize drag would rebuild mid-drag at unsnapped offsets. */
      var rebuildTimer = null;
      window.addEventListener("resize", function () {
        clearTimeout(rebuildTimer);
        rebuildTimer = setTimeout(rebuildTriggers, 250);
      });
    } else {
      /* GSAP core without ScrollTrigger: reveal text plainly. */
      revealsOpen = true;
      document.querySelectorAll(".ember-reveal").forEach(function (el) {
        emberOn(el);
      });
    }
  } else if (!window.gsap) {
    /* Static fallback: fully readable page, no hidden states. */
    document.documentElement.classList.add("no-gsap");
  }
  /* Re-measure triggers once webfonts land (layout shifts otherwise) —
     via rebuild: refresh() corrupts ranges in this stack (see above). */
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () {
      rebuildReveals();
    });
  }
  /* Failsafe: reveal-all ONLY when the page cannot scroll (non-scrolling
     embed). A timed blanket reveal would pre-ignite every scroll
     animation before the user arrives — that bug hid all motion. */
  setTimeout(function () {
    if (document.documentElement.scrollHeight > window.innerHeight + 40) return;
    revealsOpen = true;
    pendingGate.length = 0; pendingZone.length = 0;
    document.querySelectorAll(".ink-reveal:not(.revealed)").forEach(function (el) {
      el.classList.add("revealed");
    });
    document.querySelectorAll(".ember-reveal:not(.revealed)").forEach(function (el) {
      el.classList.add("revealed", "cooled");
    });
    document.querySelectorAll(".draw-reveal:not(.on)").forEach(function (el) {
      el.classList.add("on");
    });
  }, 2500);

  /* If the 3D module never boots (CDN dead), the loader's bounded
     fallback above owns the verdict: it removes the zones, rebuilds the
     triggers and opens the reveals when it drops the loader. No timed
     zone-removal before that point — a slow CDN must keep its bands
     (verified failure: zones deleted at 3.5s while three.js was still
     fetching, leaving a 3D-less page that still played the intro). */

  /* Ultimate failsafe: a hung intro must never leave the page unreadable.
     Polls rather than trusts a timeout — on a slow-loading device the
     intro handoff can land after any fixed deadline, and opening the gate
     mid-intro would play the hero behind the 3D layer again. */
  var gatePoll = setInterval(function () {
    if (revealsOpen || document.body.style.overflow !== "hidden") {
      openReveals();
      clearInterval(gatePoll);
    }
  }, 800);
  /* Hard deadline: if even the poll's condition never arrives (a stalled
     asset class of failure), force the standalone readable page — BUT a
     scene that is alive with a frozen timeline (occluded tab: rAF suspended)
     gets bounded reschedules instead of losing its bands (critic P2: the
     deadline was dead code; re-derived after the gate fix). */
  var deadlineTries = 0;
  var hardDeadline = function () {
    clearInterval(gatePoll);
    if (revealsOpen) return;
    if (window.__INTRO_STATE === "intro-running" && deadlineTries++ < 2) {
      setTimeout(hardDeadline, 15000);
      return;
    }
    document.body.style.overflow = "";
    document.documentElement.classList.remove("no-snap");
    document.querySelectorAll(".desk-zone").forEach(function (z) { z.remove(); });
    fixHeroSnap();
    rebuildReveals();
    openReveals();
  };
  setTimeout(hardDeadline, 25000);

  /* Raven form: thud on seal press; real send is #8 (blocked by #7). */
  document.getElementById("raven-form").addEventListener("submit", function (ev) {
    ev.preventDefault();
    engine.unlock();
    if (soundOn()) engine.thud();
    document.getElementById("form-note").hidden = false;
  });

  /* Bridge for the 3D scene module (scene.js): sound on gestures only. */
  window.Tapestry = {
    soundOn: soundOn,
    unlock: function () { engine.unlock(); },
    thud: function () { if (soundOn()) engine.thud(); },
    unroll: function (dur) { if (soundOn()) engine.unroll(dur); },
    smolder: function () { crackleMaybe(); },
    crackle: function () { crackleMaybe(); }
  };
})();
