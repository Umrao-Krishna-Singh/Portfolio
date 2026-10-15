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
        + '<footer class="pull-footer"><span class="ember-reveal folio">' + num + " of " + last + "</span></footer></section>"
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

  /* ---------- Procedural SFX + kindled music ----------
     Interaction SFX (deep two-layer thud, low-passed unroll sweep,
     granular crackle, seal fracture) stay 100% procedural, zero files
     (ADR-0001). The KINDLED MUSIC is RandomMind's The Bard's Tale v3 Opus
     (CC0, owner pick 2026-10-06): fetched + decoded at the kindle gesture —
     zero bytes before the gesture (ADR-0002) — looping end-to-start; the
     2.2s lead-in silence is an accepted part of each cycle (owner decision,
     issue #18). The ADR-0014 generative harp is REMOVED (owner 2026-10-14:
     the old generated music sometimes surfaced via the fetch-failure
     fallback and must be gone completely) — if the track fetch/decode
     fails, the page stays silent rather than falling back. Kindle-gated
     (ADR-0002). */
  function Engine() {
    this.ctx = null;
    this.master = null;
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
    /* Cached per rounded duration: the unroll sweep asks for 2.4s of
       samples on the drop-start frame — allocating ~0.5MB and 115k
       Math.random calls there is a visible one-frame stall (user: "the
       intro still hangs"). */
    var c = this.ctx;
    var ms = Math.round(dur * 1000);
    this._noise = this._noise || {};
    if (this._noise[ms]) return this._noise[ms];
    var len = Math.floor(c.sampleRate * dur);
    var buf = c.createBuffer(1, len, c.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this._noise[ms] = buf;
    return buf;
  };
  /* ---- Nova eruption score (owner round 6): riser -> pre-hit dip -> BOOM.
     All procedural (license-clean): detuned FM shimmer riser, sub-drop +
     crack transient + lowpass-swept body at the break, rumble tail through
     the generated-IR room. Research: nova-eruption-implementation.md #4. */
  Engine.prototype.novaRiser = function (dur) {
    if (!this.ctx) return;
    var c = this.ctx, t = c.currentTime, end = t + dur;
    var out = this._novaBus();
    /* two detuned triangles sweeping up, FM shimmer deepening toward the
       break, then the pre-hit dip (the ear's gap-detector pre-loads the
       boom) */
    [0, 4].forEach(function (det) {
      var o = c.createOscillator(), g = c.createGain();
      o.type = "triangle";
      o.frequency.setValueAtTime(180 + det, t);
      o.frequency.exponentialRampToValueAtTime(830 + det * 2, end);
      var m = c.createOscillator(), mg = c.createGain();
      m.type = "sine";
      m.frequency.setValueAtTime(560, t);
      m.frequency.exponentialRampToValueAtTime(2500, end);
      mg.gain.setValueAtTime(40, t);
      mg.gain.exponentialRampToValueAtTime(420, end);
      m.connect(mg); mg.connect(o.frequency);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.14, end - 0.07);
      g.gain.exponentialRampToValueAtTime(0.0001, end);
      o.connect(g); g.connect(out);
      o.start(t); m.start(t);
      o.stop(end + 0.02); m.stop(end + 0.02);
    });
    /* noise breath: bandpass sweep under the tone */
    var n = c.createBufferSource();
    n.buffer = this.noiseBuffer(dur + 0.1); n.loop = true;
    var bp = c.createBiquadFilter();
    bp.type = "bandpass"; bp.Q.value = 1.1;
    bp.frequency.setValueAtTime(320, t);
    bp.frequency.exponentialRampToValueAtTime(5200, end - 0.05);
    var ng = c.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(0.11, end - 0.07);
    ng.gain.exponentialRampToValueAtTime(0.0001, end);
    n.connect(bp); bp.connect(ng); ng.connect(out);
    n.start(t); n.stop(end + 0.02);
  };
  Engine.prototype.novaBoom = function () {
    if (!this.ctx) return;
    var c = this.ctx, t = c.currentTime;
    var out = this._novaBus();
    /* sub drop: the body of the blast */
    var sub = c.createOscillator(), sg = c.createGain();
    sub.type = "sine";
    sub.frequency.setValueAtTime(118, t);
    sub.frequency.exponentialRampToValueAtTime(27, t + 0.5);
    sg.gain.setValueAtTime(0.95, t);
    sg.gain.exponentialRampToValueAtTime(0.001, t + 1.35);
    sub.connect(sg); sg.connect(out);
    var subSend = c.createGain();
    subSend.gain.value = 0.35;
    sg.connect(subSend); subSend.connect(this.reverbSend());
    sub.start(t); sub.stop(t + 1.4);
    /* transient crack */
    var cr = c.createBufferSource();
    cr.buffer = this.noiseBuffer(0.05);
    var cf = c.createBiquadFilter();
    cf.type = "bandpass"; cf.frequency.value = 4200; cf.Q.value = 4;
    var cg = c.createGain();
    cg.gain.setValueAtTime(0.5, t);
    cg.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    cr.connect(cf); cf.connect(cg); cg.connect(out);
    cr.start(t);
    /* body: lowpass-swept noise */
    var bo = c.createBufferSource();
    bo.buffer = this.noiseBuffer(1.0);
    var bf = c.createBiquadFilter();
    bf.type = "lowpass";
    bf.frequency.setValueAtTime(900, t);
    bf.frequency.exponentialRampToValueAtTime(120, t + 0.9);
    var bg = c.createGain();
    bg.gain.setValueAtTime(0.42, t + 0.01);
    bg.gain.exponentialRampToValueAtTime(0.001, t + 0.95);
    bo.connect(bf); bf.connect(bg); bg.connect(out);
    bo.start(t);
    /* rumble tail through the room */
    var ru = c.createOscillator(), rg = c.createGain();
    ru.type = "sine"; ru.frequency.value = 41;
    rg.gain.setValueAtTime(0.0001, t + 0.25);
    rg.gain.exponentialRampToValueAtTime(0.12, t + 0.45);
    rg.gain.exponentialRampToValueAtTime(0.0001, t + 2.3);
    ru.connect(rg); rg.connect(this.reverbSend());
    ru.start(t + 0.25); ru.stop(t + 2.4);
    /* sidechain-style duck of the music bed: WebAudio's compressor has no
       external sidechain, so the track gain is automated directly */
    if (this._trackGainNode) {
      var tg = this._trackGainNode.gain;
      tg.cancelScheduledValues(t);
      tg.setValueAtTime(Math.max(0.05, tg.value), t);
      tg.linearRampToValueAtTime(0.12, t + 0.05);
      tg.linearRampToValueAtTime(0.68, t + 1.35);
    }
  };
  /* SFX bus: the compressor catches the boom's peak without flattening it. */
  Engine.prototype._novaBus = function () {
    if (this._novaBusNode) return this._novaBusNode;
    var c = this.ctx;
    var cp = c.createDynamicsCompressor();
    cp.threshold.value = -12; cp.knee.value = 20; cp.ratio.value = 4;
    cp.attack.value = 0.003; cp.release.value = 0.25;
    cp.connect(this.master);
    this._novaBusNode = cp;
    return cp;
  };
  Engine.prototype.kindleMusic = function (fadeDuration) {
    /* Dispatcher: the Bard's Tale track is the kindled music; the
       generative harp is the fallback. Re-kindling mid-fetch must not
       double-fetch (guard) and must not start after an unkindle (the
       decode continuation re-checks _musicOn). fadeDuration > 0 gives the
       post-seal entrance its smooth 1.6s ramp (Issue #18); the manual
       kindle toggle starts instantly. */
    this._musicOn = true;
    if (this._trackSrc) return;
    if (this._trackBuf) { this.startTrack(fadeDuration); return; }
    /* No generative fallback (owner 2026-10-14): a failed fetch/decode
       means silence, never the old harp. */
    var that = this;
    this._trackLoading = true;
    fetch("../.tmp/pen-runs/assets/The_Bards_Tale_v3.opus")
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.arrayBuffer(); })
      .then(function (ab) { return that.ctx.decodeAudioData(ab); })
      .then(function (buf) {
        that._trackLoading = false;
        if (!that._musicOn) return;
        that._trackBuf = buf;
        that.startTrack(fadeDuration);
      })
      .catch(function () {
        that._trackLoading = false;
        that._trackFailed = true; /* silent: SFX keep working, no fallback music */
      });
  };
  Engine.prototype.startTrack = function (fadeDuration) {
    if (this._trackSrc || !this._trackBuf) return;
    var c = this.ctx;
    var src = c.createBufferSource();
    src.buffer = this._trackBuf;
    src.loop = true; /* whole buffer wraps: end → start, lead-in included */
    var g = c.createGain();
    var t = c.currentTime;
    /* Restaged -20% gain: 0.85 * 0.80 = 0.68 (Issue #18) */
    var targetGain = 0.68;
    if (fadeDuration && fadeDuration > 0) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(targetGain, t + fadeDuration);
    } else {
      g.gain.value = targetGain;
    }
    src.connect(g);
    g.connect(this.master);
    src.start();
    this._trackSrc = src;
    this._trackGainNode = g;
  };
  Engine.prototype.silenceMusic = function () {
    this._musicOn = false;
    /* Mute semantics (owner, #20: the kindle toggle must never restart
       the tune): the Bard's Tale source keeps playing UNDER the
       master-gain fade — re-kindling fades back in MID-TUNE instead of
       paying the accepted 2.2s lead-in again. startTrack's _trackSrc
       guard still means a re-kindle can never stack a second source.
       The generative harp (phrase timer checks _musicOn) and the
       fire-hiss bed keep their stop/restart behavior — a generative
       restart doesn't read as "from the top". */
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
  /* Parchment friction, rebuilt longer and lower with a wobble.
     `boost` scales the voice (owner #20: the ember ignition sweep rides
     at 1.4x so it doesn't drown under the kindled music); the intro
     unroll keeps the default voice. */
  Engine.prototype.unroll = function (dur, boost) {
    if (!this.ctx) return;
    dur = dur || 2.2;
    boost = boost || 1;
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
    g.gain.linearRampToValueAtTime(0.22 * boost, t + 0.25);
    g.gain.linearRampToValueAtTime(0.12 * boost, t + dur * 0.7);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    var wobble = c.createOscillator();
    wobble.frequency.value = 7;
    var wg = c.createGain();
    wg.gain.value = 0.045 * boost;
    wobble.connect(wg);
    wg.connect(g.gain);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t);
    wobble.start(t);
    wobble.stop(t + dur);
  };
  /* Crackle bed: discrete grains + a faint hiss, like char consuming paper.
     boost: the section-crossing paper sound rides at 1.25x (owner
     2026-10-07 — THIS is the scroll-through-sections sound to lift, not
     the intro unroll). */
  Engine.prototype.crackle = function (boost) {
    if (!this.ctx) return;
    boost = boost || 1;
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
      g.gain.setValueAtTime((0.05 + Math.random() * 0.11) * boost, at);
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
    hg.gain.setValueAtTime(0.03 * boost, t);
    hg.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    hiss.connect(hf);
    hf.connect(hg);
    hg.connect(this.master);
    hiss.start(t);
  };
  /* Procedural Arcane Wax Seal Fracture Synthesis (ADR-0001, ADR-0013, Issue #18).
     Zero external audio files: 4-layer physical brittle shear snap + plate resonance + pop + ribbon whoosh. */
  Engine.prototype.sealCrack = function (boost) {
    if (!this.ctx) return;
    boost = boost || 1.0;
    var c = this.ctx;
    var t = c.currentTime;

    // 1. Layer 1: High-Frequency Transient Fracture Snap (3.8ms)
    var snapSrc = c.createBufferSource();
    snapSrc.buffer = this.noiseBuffer(0.05);
    var snapFilter = c.createBiquadFilter();
    snapFilter.type = "bandpass";
    snapFilter.frequency.setValueAtTime(4200, t);
    snapFilter.Q.setValueAtTime(4.0, t);
    var snapGain = c.createGain();
    snapGain.gain.setValueAtTime(0.55 * boost, t);
    snapGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.0042);
    snapSrc.connect(snapFilter);
    snapFilter.connect(snapGain);
    snapGain.connect(this.master);
    snapSrc.start(t);
    snapSrc.stop(t + 0.005);

    // 2. Layer 2: Mid-Frequency Brittle Wax Body Resonance (42ms)
    var resSrc = c.createBufferSource();
    resSrc.buffer = this.noiseBuffer(0.08);
    var resFilt1 = c.createBiquadFilter();
    resFilt1.type = "bandpass";
    resFilt1.frequency.setValueAtTime(980, t);
    resFilt1.Q.setValueAtTime(7.5, t);
    var resFilt2 = c.createBiquadFilter();
    resFilt2.type = "bandpass";
    resFilt2.frequency.setValueAtTime(1340, t);
    resFilt2.Q.setValueAtTime(8.2, t);
    var resGain = c.createGain();
    resGain.gain.setValueAtTime(0.38 * boost, t + 0.0008);
    resGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
    resSrc.connect(resFilt1);
    resSrc.connect(resFilt2);
    resFilt1.connect(resGain);
    resFilt2.connect(resGain);
    resGain.connect(this.master);
    resSrc.start(t);
    resSrc.stop(t + 0.048);

    // 3. Layer 3: Low-Frequency Tension Release Pop (32ms)
    var popOsc = c.createOscillator();
    popOsc.type = "triangle";
    popOsc.frequency.setValueAtTime(185, t);
    popOsc.frequency.exponentialRampToValueAtTime(42, t + 0.032);
    var popGain = c.createGain();
    popGain.gain.setValueAtTime(0.28 * boost, t);
    popGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.034);
    popOsc.connect(popGain);
    popGain.connect(this.master);
    popOsc.start(t);
    popOsc.stop(t + 0.036);

    // 4. Layer 4: Ribbon Tension Release Whoosh (85ms)
    var whooshSrc = c.createBufferSource();
    whooshSrc.buffer = this.noiseBuffer(0.12);
    var whooshFilter = c.createBiquadFilter();
    whooshFilter.type = "bandpass";
    whooshFilter.Q.setValueAtTime(2.2, t);
    whooshFilter.frequency.setValueAtTime(1600, t + 0.006);
    whooshFilter.frequency.exponentialRampToValueAtTime(520, t + 0.092);
    var whooshGain = c.createGain();
    whooshGain.gain.setValueAtTime(0.0001, t);
    whooshGain.gain.linearRampToValueAtTime(0.16 * boost, t + 0.016);
    whooshGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.095);
    whooshSrc.connect(whooshFilter);
    whooshFilter.connect(whooshGain);
    whooshGain.connect(this.master);
    whooshSrc.start(t + 0.005);
    whooshSrc.stop(t + 0.10);
  };

  var engine = new Engine();
  var kindleOn = false;
  var lastSweep = 0, lastCrackle = 0;

  function soundOn() {
    return kindleOn && engine.ctx && engine.ctx.state === "running";
  }
  /* Ignition sweep: the low paper-rush rides the TEXT reveal (user round
     6: the whoosh reads as flame, so it belongs to the charred ignite).
     Owner #20: hold 75ms longer (0.55 -> 0.625) so the sweep covers the
     charred cool instead of dying early. Volume: 1.4x (round 1, kept)
     then a further 1.25x compounded from the new level (owner 2026-10-07)
     = 1.75x total, so it survives the kindled music. */
  function sweepMaybe() {
    var now = Date.now();
    if (soundOn() && now - lastSweep > 900) {
      lastSweep = now;
      engine.unroll(0.625, 1.75);
    }
  }
  /* Crackle bed: dry paper pops ride the SCROLL MOVEMENT — they fire at
     the pull crossing, not at the ignition (user round 6 swap). Owner
     2026-10-07: this is the "paper scroll" sound to boost (+25%). */
  function crackleMaybe() {
    var now = Date.now();
    if (soundOn() && now - lastCrackle > 500) {
      lastCrackle = now;
      engine.crackle(1.25);
    }
  }

  /* ---------- Kindle (1b): harp music, persisted, muted-first ---------- */
  function initKindle() {
    var btn = document.getElementById("kindle");
    kindleOn = window.localStorage.getItem("tapestry-muted") !== "1"
      && window.localStorage.getItem("tapestry-kindled") === "1";
    /* Kindle is initially hidden until the seal is broken (Issue #18) */
    btn.hidden = true;
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
  var sparkSprite = (function () {
    var c = document.createElement("canvas");
    c.width = c.height = 32;
    var g = c.getContext("2d");
    var rg = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    rg.addColorStop(0, "rgba(255, 230, 160, 1)");
    rg.addColorStop(0.2, "rgba(255, 180, 50, 0.95)");
    rg.addColorStop(0.55, "rgba(255, 120, 30, 0.4)");
    rg.addColorStop(1, "rgba(255, 100, 20, 0)");
    g.fillStyle = rg;
    g.beginPath();
    g.arc(16, 16, 16, 0, Math.PI * 2);
    g.fill();
    return c;
  })();
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
      if (a <= 0) return;
      var sz = (p.r * a + 0.4) * 4.8;
      ectx.globalAlpha = a * 0.9;
      ectx.drawImage(sparkSprite, p.x - sz * 0.5, p.y - sz * 0.5, sz, sz);
    });
    ectx.globalAlpha = 1;
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
        /* Folios ("I of IV") ignite tighter than body text so the little
           counter reads as part of the page lighting, not a second show. */
        var d = el.classList.contains("folio")
          ? Math.round(idx * 8 + Math.random() * 20)
          : Math.round(idx * 14 + Math.random() * 36);
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
    }
    el.classList.remove("ignited", "cooled");
    el.classList.add("revealed");
    var n = el.querySelectorAll(".ch").length || 1;
    sparkAt(el, Math.min(22, 8 + Math.round(n / 6)));
    sweepMaybe();
    /* Next frame: remove rearm and flip to ignite so the per-char transitions run. */
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        el.classList.remove("rearm");
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
      var stale = el.querySelectorAll(".char-line, .burn-frame");
      for (var i = 0; i < stale.length; i++) stale[i].remove();
    }
    el.classList.add("revealed");
    if (reduced || !window.gsap) {
      el.classList.add("framed");
      return;
    }
    requestAnimationFrame(function () {
      el.classList.remove("rearm");
    });
    sparkAt(el, 18);
    sweepMaybe();
    var line = document.createElement("span");
    line.className = "char-line";
    line.setAttribute("aria-hidden", "true");
    var frame = document.createElement("span");
    frame.className = "burn-frame";
    frame.setAttribute("aria-hidden", "true");
    el.appendChild(line);
    el.appendChild(frame);
    var h = el.offsetHeight || 400;
    window.gsap.fromTo(line, { y: -25 }, {
      y: h + 10, duration: 1.05, ease: "power1.inOut",
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
    el.classList.add("rearm");
    el.classList.remove("on");
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        el.classList.remove("rearm");
        el.classList.add("on");
      });
    });
  }

  /* ---------- Reveal scheduler: gate + zone defer + cooldown ----------
     Gate: nothing plays until the intro handoff (or its failsafe) — hero
     reveals must be SEEN, never pre-fired under the 3D layer.
     Zone defer: reveals don't play while a desk zone owns the screen;
     they flush the moment the 2D column is visible again.
     Settle (user round 5): nothing plays while the scroll is MOVING, and
     nothing resets to hidden while it is on screen — mid-scroll the
     triggers only QUEUE; when motion stops (80ms quiet) a 60ms beat
     passes, then the panel lights up and the text ignites. The ignition
     sweep rides the reveal; the paper crackle rides the pull crossing
     (user round 6: the two sounds sat on each other's actions).
     Cooldown: rapid boundary jitter can't machine-gun replays. */
  var revealsOpen = !window.gsap; /* no-gsap page shows everything anyway */
  var pendingGate = [];
  var pendingZone = [];
  var pendingSettle = [];
  var lastPlay = new WeakMap();
  var SETTLE_MS = 80;
  var REVEAL_BEAT = 60;
  var settled = true;
  var settleTimer = 0;
  var beatTimer = 0;
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
  /* The 3D layer is mid-fade (zone exit / handoff): igniting now would run
     the animation inside the ghost band, where the sheet's baked text still
     overlays the column — the "partial display" on the 3D→2D crossing
     (owner #20). The beat waits for the layer to finish clearing. */
  function layerClear() {
    var gl = document.getElementById("gl");
    return !gl || parseFloat(window.getComputedStyle(gl).opacity) < 0.05;
  }
  function inView(el) {
    var r = el.getBoundingClientRect();
    return r.top < window.innerHeight && r.bottom > 0;
  }
  /* Substantially on screen — the flush threshold. A merely-grazed
     element (sliver at the edge) must not START a replay: its vanish-
     and-replay is the exact sloppiness this gate exists to kill. */
  function strongView(el) {
    var r = el.getBoundingClientRect();
    var vh = window.innerHeight;
    return r.top < vh * 0.92 && r.bottom > vh * 0.08;
  }
  /* Scroll motion: any scroll event marks us moving; 140ms of quiet
     marks us settled. CAPTURE phase on purpose — ScrollTrigger's own
     scroll handler (CDN script, registered earlier) fires in the bubble
     phase, and its onEnter/onEnterBack call requestReveal synchronously;
     without the capture-phase stamp the gate reads a stale `settled`
     and plays mid-scroll (verified via stack trace, round 5). A resumed
     scroll cancels the pending beat — the 125ms wait always starts from
     the LAST motion, never overlaps it. */
  window.addEventListener("scroll", function () {
    settled = false;
    clearTimeout(settleTimer);
    clearTimeout(beatTimer);
    beatTimer = 0;
    settleTimer = setTimeout(function () {
      settled = true;
      flushSettle();
    }, SETTLE_MS);
  }, { passive: true, capture: true });
  function settlePush(el, fn) {
    for (var i = 0; i < pendingSettle.length; i++) {
      if (pendingSettle[i].el === el) return;
    }
    pendingSettle.push({ el: el, fn: fn });
  }
  function requestReveal(el, fn) {
    if (!revealsOpen) { if (pendingGate.indexOf(el) < 0) pendingGate.push(el); return; }
    if (inDeskZone()) { if (pendingZone.indexOf(el) < 0) pendingZone.push(el); return; }
    /* A pending beat counts as motion: the batch it belongs to must not
       be overtaken by a stray later trigger. */
    if (!settled || beatTimer) { settlePush(el, fn); return; }
    /* Direct plays need the same bar as the batched beat: a late ST
       callback (stale cache during snap glides) can fire onEnter for an
       element the glide has already scrolled past — playing it there
       burned it off-screen and the page arrived static (owner recording
       23-12-52). Not strongly in view -> back to the queue. */
    if (!strongView(el)) { settlePush(el, fn); return; }
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
    for (var i = 0; i < pendingSettle.length; i++) {
      if (pendingSettle[i].el === el) { pendingSettle.splice(i, 1); break; }
    }
    /* Already-lit skip (user round 6 #4): ST re-fires onEnter when a desk
       zone hands the page back, but the hero never reset — it stayed in
       view (under the opaque 3D layer) the whole dwell. Replaying there
       is the "contents appear, then the animation plays" flash. Real
       replays still work: a panel that fully exits is reset by panelIO,
       which clears .revealed/.on before the element is seen again. */
    if (el.classList.contains("revealed") || el.classList.contains("on")) return;
    if (seenRecently(el)) return;
    fn(el);
  }
  /* Reset a replayable element to hidden. ONLY called while it is fully
     off-screen (resetIfHidden) — resetting on-screen content is the
     "contents disappear then animate" sloppiness (user round 5 #6). */
  function resetReveal(el) {
    if (el.classList.contains("ink-reveal")) {
      if (!el.classList.contains("revealed")) return;
      el.classList.add("rearm");
      el.classList.remove("revealed", "framed");
      var stale = el.querySelectorAll(".char-line, .burn-frame");
      for (var i = 0; i < stale.length; i++) stale[i].remove();
    } else if (el.classList.contains("draw-reveal")) {
      el.classList.add("rearm");
      el.classList.remove("on");
    } else {
      if (!el.classList.contains("revealed")) return;
      if (el.dataset.split) {
        el.classList.add("rearm");
        el.classList.remove("revealed", "ignited", "cooled");
      } else {
        el.classList.remove("revealed");
      }
    }
  }
  function resetIfHidden(el) {
    /* Desk dwell (user round 6 #4): while a 3D zone owns the screen the
       column is hidden under the opaque layer, and the panels parked
       there (hero above, contact below) read as "exited" to the IOs —
       resetting them replayed their ignition on the way back down (the
       "contents appear, then the animation plays" flash, recording
       13-34-01 @ ~28-35s and ~50-53s). Skip: they stay lit through the
       dwell, and playNow's already-lit guard keeps the ST re-fires from
       replaying them. Normal navigation resets are untouched — exits
       between panels happen outside the zones. */
    if (inDeskZone()) return;
    if (!inView(el)) resetReveal(el);
  }
  function pickFn(el) {
    return el.classList.contains("ink-reveal") ? inkOn
      : el.classList.contains("draw-reveal") ? drawOn : emberOn;
  }
  /* The settle flush: 125ms after motion stops, the batch plays with a
     small stagger, and every panel the batch touches lights up first. */
  function flushSettle() {
    if (!settled || !revealsOpen) return;
    if (!pendingSettle.length || beatTimer) return;
    beatTimer = setTimeout(function () {
      beatTimer = 0;
      if (!settled || !revealsOpen || !pendingSettle.length) return;
      /* A desk zone owns the screen: the batch must not spend itself
         behind the opaque 3D layer (owner #20: the first and last pages
         sit against the zone bands, and a rest inside a band fired their
         queued ignition unseen — or half-lit at the fade edge, read as
         "partial display of the animation" on the 3D→2D crossing). Hold
         the queue; the zone-exit scroll re-runs settle → flush and the
         batch plays over the visible column, riding the crossfade the
         same way the intro handoff does. */
      if (inDeskZone()) return;
      /* Mid-crossfade (the exit fade is still running): the sheet's baked
         text is still on screen, so the ignition would play inside the
         ghost band. Retry on a short poll — the fade self-resolves in
         ~400ms — and play on the fully visible column. */
      if (!layerClear()) {
        beatTimer = setTimeout(function () {
          beatTimer = 0;
          if (settled) flushSettle();
        }, 130);
        return;
      }
      var batch = pendingSettle.filter(function (item) { return strongView(item.el); });
      pendingSettle = pendingSettle.filter(function (item) {
        return batch.indexOf(item) < 0;
      });
      batch.forEach(function (item, i) {
        var panel = item.el.closest(".pull, #hero");
        if (panel) panel.classList.add("lit");
        setTimeout(function () {
          /* The stagger spans real time: the scroll can land in a desk
             zone (or move the element out of view) between scheduling
             and firing — the owner's "partial display" on the first and
             last pages had the lead elements ignite visibly while the
             tail spent itself behind the incoming 3D layer. Re-validate
             at FIRE time: a zone owning the screen re-queues the element
             for the zone-exit flush (it then plays over the visible
             column); an element no longer strongly in view goes back to
             the settle queue for the next evaluation. */
          if (inDeskZone()) {
            if (pendingZone.indexOf(item.el) < 0) pendingZone.push(item.el);
            return;
          }
          if (!layerClear() || !strongView(item.el)) { settlePush(item.el, item.fn); return; }
          playNow(item.el, item.fn);
        }, i * 50);
      });
    }, REVEAL_BEAT);
  }
  function openReveals() {
    if (revealsOpen) return;
    revealsOpen = true;
    /* The handoff batch plays IMMEDIATELY, not through the settle beat:
       the handoff is a programmatic moment (scene.js holds the sheet up
       for 260ms so this ignition runs UNDER it — crossfade, not swap).
       During the intro the hero's requests queued in pendingZone (y=0 is
       inside the top zone), so the zone queue drains here too — leaving
       it to the post-handoff scroll event would make the crossfade beat
       depend on event timing. */
    var handoff = pendingGate.concat(pendingZone.splice(0, pendingZone.length));
    /* Ink the block as ONE gesture, top-to-bottom: the raw queue order is
       IO/ST callback order, which scattered the ignition across a second
       with blank gaps between already-inked lines (owner recording: the
       hook — late in the queue — sat blank ~0.6s after the rest was ink). */
    handoff.sort(function (a, b) {
      return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });
    handoff.forEach(function (el, i) {
      if (inDeskZone()) {
        if (pendingZone.indexOf(el) < 0) pendingZone.push(el);
        return;
      }
      var panel = el.closest(".pull, #hero");
      if (panel) panel.classList.add("lit");
      setTimeout(function () {
        /* Same fire-time rule as the settle batch: never fire a
           staggered step into a desk zone that has since claimed the
           screen (the handoff holds the scroll, so this is a safety
           net, not a known path). */
        if (inDeskZone()) {
          if (pendingZone.indexOf(el) < 0) pendingZone.push(el);
          return;
        }
        playNow(el, pickFn(el));
      }, 40 + i * 45);
    });
    pendingGate.length = 0;
  }
  function flushZonePending() {
    if (inDeskZone() || !revealsOpen) return;
    pendingZone.forEach(function (el) { settlePush(el, pickFn(el)); });
    pendingZone.length = 0;
    flushSettle();
  }
  window.addEventListener("tapestry:handoff", openReveals);
  window.addEventListener("scroll", function () {
    if (pendingZone.length) flushZonePending();
  }, { passive: true });
  /* Zone crossing (owner #20): leaving a desk zone is the one moment the
     parked panels (hero above the top band, about/contact below the
     bottom one) can be reset INVISIBLY — the column is still hidden under
     the fading 3D layer (it only surfaces below 0.15 opacity). Reset +
     queue them here and the settle beat's layerClear retry plays the
     batch as the page surfaces: the first glide down after a desk dwell
     lands on a BURNING page, not a prefilled one. This replaces the old
     stay-lit-through-dwell rule (round 6 #4), whose anti-flash rationale
     died with the fade-band change — a static page popping in at the
     surfacing is now the visible defect (owner recording 23-12-52). */
  window.addEventListener("tapestry:zone-leave", function () {
    ["#hero", "#about-contact"].forEach(function (sel) {
      var panel = document.querySelector(sel);
      if (!panel) return;
      panel.querySelectorAll(".ember-reveal, .ink-reveal, .draw-reveal").forEach(function (el) {
        resetReveal(el);
        settlePush(el, pickFn(el));
      });
    });
  });

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
        col.dataset.bgH = String(h);
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
  /* The column bake is a ~300-700ms SYNCHRONOUS paint (768×up-to-4096
     grain). At boot it hides behind the loader; it used to ride the
     window load event instead, which on a slow font/CDN tick lands
     MID-INTRO and freezes the whole 3D animation — the user's "major
     hang mid animation once the scroll starts rolling down" (recording
     13-34-01 @ 11.92-12.67s: the sheet froze at ~60% unrolled; live
     probe: 319ms rAF gap exactly at drop-land). Boot it here; the load
     listener below only re-bakes on a real layout change. */
  textureColumn();

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
        document.documentElement.classList.add("no-3d");
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
  window.addEventListener("load", function () {
    /* Re-bake only if the column's aspect changed since the boot bake
       (late images shifting layout). A re-bake is the same 300-700ms
       synchronous paint — mid-intro it freezes the unroll, so if the
       intro is still in flight it defers to handoff + 1.6s (the ignite
       churn has settled by then). */
    var col = document.querySelector(".column");
    if (!col) return;
    var hadH = parseInt(col.dataset.bgH || "0", 10);
    if (hadH) {
      var wantH = Math.min(4096, Math.max(1024,
        Math.round(col.scrollHeight * 768 / Math.max(1, col.clientWidth))));
      if (Math.abs(wantH - hadH) <= hadH * 0.02) return;
    }
    if (window.__INTRO_STATE && window.__INTRO_STATE !== "handoff-done") {
      window.addEventListener("tapestry:handoff", function () {
        setTimeout(textureColumn, 1600);
      }, { once: true });
    } else {
      textureColumn();
    }
  });

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
     scheduler's cooldown absorbs boundary jitter. Exits pre-reset while
     off-screen (resetIfHidden guards the sliver-visible case). */
  var inkIO = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) requestReveal(e.target, inkOn);
      else resetIfHidden(e.target);
    });
  }, { threshold: 0.25 });
  document.querySelectorAll(".ink-reveal").forEach(function (el) { inkIO.observe(el); });
  /* Sigil caps (sheet lead-in / tail) draw on the same policy. */
  var drawIO = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) requestReveal(e.target, drawOn);
      else resetIfHidden(e.target);
    });
  }, { threshold: 0.3 });
  document.querySelectorAll(".draw-reveal").forEach(function (el) { drawIO.observe(el); });
  /* Panel-level reset: when a whole pull leaves the viewport, reset EVERY
     reveal inside it. The per-element exits miss partially-visible ones
     (their trigger line is still crossed), which left some elements lit
     while their neighbors replayed on revisit — the "some elements appear
     before animations start" inconsistency (user recording, round 5c).
     A fully-off-screen panel guarantees every reset is invisible. */
  var panelIO = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) return;
      e.target.querySelectorAll(".ember-reveal, .ink-reveal, .draw-reveal")
        .forEach(resetIfHidden);
    });
  }, { threshold: 0 });
  document.querySelectorAll(".pull").forEach(function (p) { panelIO.observe(p); });

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
           re-fires only after a real exit. Exits pre-reset the element to
           hidden while it is off-screen, so a revisit never shows old
           content vanishing before the replay (user round 5 #6). */
        gsap.utils.toArray(".ember-reveal").forEach(function (el) {
          var t = ScrollTrigger.create({
            trigger: el, start: "top 88%", end: "bottom 15%",
            onEnter: function () { requestReveal(el, emberOn); },
            onEnterBack: function () { requestReveal(el, emberOn); },
            onLeave: function () { resetIfHidden(el); },
            onLeaveBack: function () { resetIfHidden(el); }
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
        var drift = gsap.fromTo(".hero-figure img",
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
        /* Page crackle as the scroll physically moves to the next pull
           (user round 6: the dry pops ARE the scroll-movement sound). */
        gsap.utils.toArray(".pull").forEach(function (p, idx) {
          if (idx === 0) return;
          var t = ScrollTrigger.create({
            trigger: p, start: "top 60%",
            onEnter: crackleMaybe, onEnterBack: crackleMaybe
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
     via rebuild: refresh() corrupts ranges in this stack (see above).
     The rebuild is a kill+recreate of every trigger with DOM measuring —
     a ~250-750ms synchronous task. Fonts resolve whenever the CDN
     delivers, which on a slow tick lands MID-INTRO and freezes the whole
     3D animation (recording 13-34-01: the sheet froze at ~60% unrolled;
     live probe: a 301ms longtask at drop-start+243ms). Nothing scrolls
     during the intro, so the rebuild defers to the handoff — the landing
     evaluates on the next ST tick with correct ranges. */
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () {
      if (!window.__INTRO_STATE || window.__INTRO_STATE === "handoff-done") {
        rebuildReveals();
      } else {
        window.addEventListener("tapestry:handoff", function () {
          rebuildReveals();
        }, { once: true });
      }
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
     mid-intro would play the hero behind the 3D layer again.
     The verdict key is __TAPESTRY_3D, set synchronously at the END of the
     scene's boot() right AFTER it locks the scroll: while it is undefined
     the scene module is still fetching and overflow("") means NOTHING yet
     (opening there pre-fired the hero in IO order — the original partial
     display, recording 21-13-56). Once it is true, overflow unlocking can
     only mean the handoff landed (or teardown) — open then. A dead scene
     is covered by __TAPESTRY_NO_3D and the hard deadline below. */
  var gatePoll = setInterval(function () {
    if (revealsOpen || window.__TAPESTRY_NO_3D ||
        (window.__TAPESTRY_3D && document.body.style.overflow !== "hidden")) {
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
    document.documentElement.classList.add("no-3d");
    document.querySelectorAll(".desk-zone").forEach(function (z) { z.remove(); });
    fixHeroSnap();
    rebuildReveals();
    openReveals();
  };
  setTimeout(hardDeadline, 25000);

  /* ---------- On-screen FPS meter (owner request 2026-10-07) ----------
     WHAT IT COUNTS: requestAnimationFrame callbacks — the browser's
     PRESENTED frames, i.e. exactly the pace the stutter is felt in. Not
     smoothed, not averaged: a plain count over each 500ms window divided
     by that window's real elapsed time, so a dip to 30 shows as 30.
     SECOND LINE: the 3D scene's own counters (window.__T3D, written by
     scene.js) — render calls per second, the average cost of one rendered
     frame in milliseconds, and the bloom state read back directly. When
     the scene deliberately stops rendering (post-handoff, outside the
     desk zones) it says "3D idle" — the fps number there is the DOM page,
     not the scene. If the tab is occluded, rAF stops entirely; after 2.5s
     without a frame the meter says so instead of freezing on a stale
     number. Pointer-transparent (can never eat a click), no dependencies,
     one DOM text write per 500ms. */
  var fpsEl = document.createElement("div");
  fpsEl.id = "fps-meter";
  fpsEl.setAttribute("aria-hidden", "true");
  document.body.appendChild(fpsEl);
  var fpsFrames = 0, fpsLast = null, fpsLastRenderCount = null;
  (function fpsLoop(now) {
    requestAnimationFrame(fpsLoop);
    if (fpsLast === null) { fpsLast = now; return; }
    fpsFrames++;
    var dt = now - fpsLast;
    if (dt >= 500) {
      var lines = [Math.round(fpsFrames * 1000 / dt) + " fps"];
      var D = window.__T3D;
      if (D) {
        var rps = fpsLastRenderCount === null ? null
          : Math.round((D.renderCount - fpsLastRenderCount) * 1000 / dt);
        fpsLastRenderCount = D.renderCount;
        if (rps === null) lines.push("3D \u2026");
        else if (rps > 0) {
          lines.push("3D " + rps + "/s \u00B7 "
            + (D.renderCount ? (D.renderMsTotal / D.renderCount).toFixed(1) : "0") + "ms/frame"
            + " \u00B7 bloom " + (D.bloomOn() ? "on" : "OFF"));
        } else {
          lines.push("3D idle");
        }
      }
      fpsEl.textContent = lines.join("  \u00B7  ");
      fpsFrames = 0;
      fpsLast = now;
    }
  })(0);
  setInterval(function () {
    if (performance.now() - fpsLast > 2500) {
      fpsEl.textContent = "frames paused \u00B7 tab hidden";
    }
  }, 1000);

  /* Raven form: thud on seal press; real send is #8 (blocked by #7). */
  document.getElementById("raven-form").addEventListener("submit", function (ev) {
    ev.preventDefault();
    engine.unlock();
    if (soundOn()) engine.thud();
    document.getElementById("form-note").hidden = false;
  });

  /* Bridge for the 3D scene module (scene.js): sound on gestures only.
     musicState is a read-only diagnostic (owner + probes verify the mute
     semantics: the track must stay ALIVE through an unkindle). */
  window.Tapestry = {
    soundOn: soundOn,
    unlock: function () { engine.unlock(); },
    musicState: function () {
      return { trackAlive: !!engine._trackSrc, bufCached: !!engine._trackBuf };
    },
    thud: function () { if (soundOn()) engine.thud(); },
    unroll: function (dur, boost) { if (soundOn()) engine.unroll(dur, boost); },
    smolder: function () { crackleMaybe(); },
    crackle: function () { crackleMaybe(); },
    /* Unlock-only runs synchronously inside the seal gesture (WebKit
       requires resume() in the immediate gesture tick); the crack SFX is
       scheduled later, on the visual fracture frame. */
    unlockAudio: function () {
      engine.unlock();
    },
    sealCrack: function (boost) {
      engine.unlock();
      engine.sealCrack(boost);
    },
    novaRiser: function (dur) {
      engine.unlock();
      engine.novaRiser(dur);
    },
    novaBoom: function () {
      engine.unlock();
      engine.novaBoom();
    },
    kindleAfterSeal: function () {
      kindleOn = true;
      /* The Bard's Tale surfaces 1.6s after the fracture, fading from the
         crack's acoustic tail — never stepping on the snap (procedural
         seal-crack research §3.3). The crack SFX itself now fires on the
         fracture frame after the camera pull-back (scene.js). */
      engine.kindleMusic(1.6);
      engine.setMaster(true);
      window.localStorage.setItem("tapestry-kindled", "1");
      window.localStorage.setItem("tapestry-muted", "0");
      var btn = document.getElementById("kindle");
      if (btn) {
        btn.hidden = false;
        btn.classList.add("on");
        btn.setAttribute("aria-pressed", "true");
      }
    }
  };
})();
