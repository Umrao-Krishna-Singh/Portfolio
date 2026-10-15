/* Worker for procedural parchment baking (ADR-0008, Issue #17)
   Executes the 300-700ms procedural canvas painting (mulberry32 RNG,
   foxing blotches, creases, deckled rims, aged edge bands, scorch marks,
   candlelight grade) on an OffscreenCanvas in a background thread.
   Returns an ImageBitmap via zero-copy transferable. */
"use strict";

function mulberry32(seed) {
  var a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

var GRAIN_URL = "/assets/textures/paper002-color.jpg";
var grainBitmap = null;
var grainLoading = null;

function loadWorkerGrain() {
  if (grainBitmap) return Promise.resolve(grainBitmap);
  if (grainLoading) return grainLoading;
  grainLoading = fetch(GRAIN_URL)
    .then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.blob();
    })
    .then(function (blob) {
      return createImageBitmap(blob);
    })
    .then(function (bmp) {
      grainBitmap = bmp;
      grainLoading = null;
      return bmp;
    })
    .catch(function () {
      grainLoading = null;
      return null;
    });
  return grainLoading;
}

function renderBase(g, w, h, opts, grain) {
  opts = opts || {};
  var rnd = mulberry32(opts.seed || 7);

  var grad = g.createLinearGradient(0, 0, w * 0.3, h);
  grad.addColorStop(0, "#F2E6C4");
  grad.addColorStop(0.5, "#EFE1BA");
  grad.addColorStop(1, "#E9D8AC");
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);

  if (grain) {
    g.globalAlpha = 0.34;
    var gw = grain.width, gh = grain.height;
    for (var y = 0; y < h; y += gh) {
      for (var x = 0; x < w; x += gw) g.drawImage(grain, x, y);
    }
    g.globalAlpha = 1;
  }

  /* Foxing: faint age blotches, denser near the edges. */
  var blots = Math.round((w * h) / 90000);
  for (var i = 0; i < blots; i++) {
    var edge = rnd();
    var bx = edge < 0.5 ? rnd() * w * 0.22 : w - rnd() * w * 0.22;
    var by = rnd() * h;
    var r = (8 + rnd() * 34) * (w / 1024);
    var rg = g.createRadialGradient(bx, by, 0, bx, by, r);
    var a = 0.025 + rnd() * 0.045;
    rg.addColorStop(0, "rgba(122,84,38," + a.toFixed(3) + ")");
    rg.addColorStop(1, "rgba(122,84,38,0)");
    g.fillStyle = rg;
    g.beginPath(); g.arc(bx, by, r, 0, 6.283); g.fill();
  }

  /* Creases: long faint folds, a light stroke over a dark one. */
  for (var k = 0; k < Math.max(3, Math.round(h / 900)); k++) {
    var cy = rnd() * h;
    var tilt = (rnd() - 0.5) * 0.06;
    g.save();
    g.translate(0, cy);
    g.rotate(tilt);
    g.fillStyle = "rgba(60,40,18,0.05)";
    g.fillRect(-w * 0.1, 0, w * 1.2, 1.4);
    g.fillStyle = "rgba(255,248,225,0.16)";
    g.fillRect(-w * 0.1, 2, w * 1.2, 1.2);
    g.restore();
  }

  /* Deckled edges: irregular darkened rim, like a cut sheet. */
  var rim = Math.max(6, w * 0.012);
  var edgeGrad;
  edgeGrad = g.createLinearGradient(0, 0, rim, 0);
  edgeGrad.addColorStop(0, "rgba(74,50,22,0.5)");
  edgeGrad.addColorStop(1, "rgba(74,50,22,0)");
  g.fillStyle = edgeGrad; g.fillRect(0, 0, rim, h);
  edgeGrad = g.createLinearGradient(w, 0, w - rim, 0);
  edgeGrad.addColorStop(0, "rgba(74,50,22,0.5)");
  edgeGrad.addColorStop(1, "rgba(74,50,22,0)");
  g.fillStyle = edgeGrad; g.fillRect(w - rim, 0, rim, h);
  edgeGrad = g.createLinearGradient(0, 0, 0, rim);
  edgeGrad.addColorStop(0, "rgba(74,50,22,0.45)");
  edgeGrad.addColorStop(1, "rgba(74,50,22,0)");
  g.fillStyle = edgeGrad; g.fillRect(0, 0, w, rim);
  edgeGrad = g.createLinearGradient(0, h, 0, h - rim);
  edgeGrad.addColorStop(0, "rgba(74,50,22,0.45)");
  edgeGrad.addColorStop(1, "rgba(74,50,22,0)");
  g.fillStyle = edgeGrad; g.fillRect(0, h - rim, w, rim);
  /* Deckle nicks along the rim. */
  g.strokeStyle = "rgba(58,38,16,0.28)";
  g.lineWidth = 1.2;
  for (var d = 0; d < w / 26; d++) {
    var dx = rnd() * w;
    g.beginPath(); g.moveTo(dx, 0);
    g.lineTo(dx + (rnd() - 0.5) * 8, rim * (0.5 + rnd()));
    g.stroke();
  }

  /* Aged edges: banded browning hugging the rim, corner blooms, wear flecks. */
  var age = opts.age === undefined ? 1 : opts.age;
  if (age > 0) {
    var band = Math.max(14, w * 0.065);
    var bandGrad = function (x0, y0, x1, y1, a2) {
      var bg = g.createLinearGradient(x0, y0, x1, y1);
      bg.addColorStop(0, "rgba(92,58,20," + (a2 * age).toFixed(3) + ")");
      bg.addColorStop(0.55, "rgba(92,58,20," + (a2 * age * 0.45).toFixed(3) + ")");
      bg.addColorStop(1, "rgba(92,58,20,0)");
      return bg;
    };
    var bw = band * 1.9;
    g.fillStyle = bandGrad(0, 0, bw, 0, 0.3); g.fillRect(0, 0, bw, h);
    g.fillStyle = bandGrad(w, 0, w - bw, 0, 0.3); g.fillRect(w - bw, 0, bw, h);
    g.fillStyle = bandGrad(0, 0, 0, bw * 0.9, 0.26); g.fillRect(0, 0, w, bw * 0.9);
    g.fillStyle = bandGrad(0, h, 0, h - bw * 0.9, 0.26); g.fillRect(0, h - bw * 0.9, w, bw * 0.9);
    /* Corner blooms. */
    var cr = Math.max(48, w * 0.19);
    [[0, 0], [w, 0], [0, h], [w, h]].forEach(function (cn) {
      var cg = g.createRadialGradient(cn[0], cn[1], 0, cn[0], cn[1], cr);
      cg.addColorStop(0, "rgba(80,48,16," + (0.44 * age).toFixed(3) + ")");
      cg.addColorStop(0.5, "rgba(80,48,16," + (0.18 * age).toFixed(3) + ")");
      cg.addColorStop(1, "rgba(80,48,16,0)");
      g.fillStyle = cg;
      g.beginPath(); g.arc(cn[0], cn[1], cr, 0, 6.283); g.fill();
    });
    /* Wear flecks. */
    var per = 2 * (w + h);
    var flecks = Math.round(per * 0.8 * age);
    for (var f2 = 0; f2 < flecks; f2++) {
      var pp = rnd() * per, fx, fy, jitter = rnd() * band;
      if (pp < w) { fx = pp; fy = jitter; }
      else if (pp < w + h) { fx = w - jitter; fy = pp - w; }
      else if (pp < 2 * w + h) { fx = pp - w - h; fy = h - jitter; }
      else { fx = jitter; fy = pp - 2 * w - h; }
      var da = 0.06 + rnd() * 0.14 * (1 - jitter / band);
      g.fillStyle = rnd() < 0.62
        ? "rgba(64,40,16," + da.toFixed(3) + ")"
        : "rgba(240,224,188," + (da * 0.9).toFixed(3) + ")";
      g.fillRect(fx, fy, 0.8 + rnd() * 1.8, 0.8 + rnd() * 1.3);
    }
  }

  /* Scorch marks. */
  (opts.marks || []).forEach(function (my) {
    var mx = w * (0.12 + rnd() * 0.76);
    var mr = (14 + rnd() * 16) * (w / 1024);
    var layers = [
      ["rgba(40,24,10,0.5)", 0.35], ["rgba(90,50,16,0.35)", 0.65],
      ["rgba(150,90,30,0.18)", 1]
    ];
    layers.forEach(function (L) {
      var sg = g.createRadialGradient(mx, my, 0, mx, my, mr);
      sg.addColorStop(0, L[0]);
      sg.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = sg;
      g.beginPath(); g.arc(mx, my, mr * L[1] + mr * 0.4, 0, 6.283); g.fill();
    });
  });

  /* Candlelight grade. */
  var vg = g.createRadialGradient(
    w * 0.5, h * 0.42, Math.min(w, h) * 0.3,
    w * 0.5, h * 0.5, Math.max(w, h) * 0.72);
  vg.addColorStop(0, "rgba(255,206,132,0.05)");
  vg.addColorStop(0.55, "rgba(130,78,26,0.07)");
  vg.addColorStop(1, "rgba(56,30,8,0.24)");
  g.fillStyle = vg;
  g.fillRect(0, 0, w, h);
}

self.onmessage = async function (e) {
  var data = e.data;
  var id = data.id;
  var target = data.target;
  var w = data.width;
  var h = data.height;
  var opts = data.opts || {};

  try {
    if (!grainBitmap) {
      await loadWorkerGrain();
    }
    var canvas = new OffscreenCanvas(w, h);
    var ctx = canvas.getContext("2d");
    renderBase(ctx, w, h, opts, grainBitmap);
    var bitmap = canvas.transferToImageBitmap();
    self.postMessage({ id: id, target: target, width: w, height: h, bitmap: bitmap }, [bitmap]);
  } catch (err) {
    self.postMessage({ id: id, target: target, error: String(err) });
  }
};
