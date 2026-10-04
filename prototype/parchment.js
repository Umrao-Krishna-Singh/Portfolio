/* Shared parchment generator (ADR-0008): ONE procedural paper + aging recipe
   feeds both the DOM column background and the 3D sheet texture, so the
   crossfade lands between near-identical surfaces. layout() bakes the page's
   real structure — hero portrait + CTAs, two-column quest rows, pull
   footers — onto a base copy for the 3D sheet only; the DOM column keeps
   real HTML on top of the same base. Seeded RNG = stable look. */
(function () {
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

  var GRAIN_SRC = "../.tmp/pen-runs/assets/paper002-color.jpg";
  var grainImg = null;
  var grainReady = null;
  function loadGrain() {
    if (grainReady) return grainReady;
    grainReady = new Promise(function (res) {
      var im = new Image();
      im.onload = function () { grainImg = im; res(true); };
      im.onerror = function () { res(false); };
      im.src = GRAIN_SRC;
    });
    return grainReady;
  }

  /* Base paper: warm parchment field, photo grain, foxing, creases,
     deckled dark edges, optional scorch marks at given y positions. */
  function base(w, h, opts) {
    opts = opts || {};
    var rnd = mulberry32(opts.seed || 7);
    var c = document.createElement("canvas");
    c.width = w; c.height = h;
    var g = c.getContext("2d");

    var grad = g.createLinearGradient(0, 0, w * 0.3, h);
    grad.addColorStop(0, "#F2E6C4");
    grad.addColorStop(0.5, "#EFE1BA");
    grad.addColorStop(1, "#E9D8AC");
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);

    if (grainImg) {
      g.globalAlpha = 0.34;
      var gw = grainImg.width, gh = grainImg.height;
      for (var y = 0; y < h; y += gh) {
        for (var x = 0; x < w; x += gw) g.drawImage(grainImg, x, y);
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

    /* Scorch marks: small charred blooms (divider anchors passed in). */
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

    /* Candlelight grade: warm center, darker aged falloff at the far
       edges — the same falloff the 3D desk gets from its lights, so DOM
       column and 3D sheet crossfade as one surface. */
    var vg = g.createRadialGradient(
      w * 0.5, h * 0.42, Math.min(w, h) * 0.3,
      w * 0.5, h * 0.5, Math.max(w, h) * 0.72);
    vg.addColorStop(0, "rgba(255,206,132,0.05)");
    vg.addColorStop(0.55, "rgba(130,78,26,0.07)");
    vg.addColorStop(1, "rgba(56,30,8,0.24)");
    g.fillStyle = vg;
    g.fillRect(0, 0, w, h);

    return c;
  }

  /* ---------- Content layout (3D sheet only) ---------- */
  var F = {
    display: '"Cinzel Decorative", serif',
    hand: '"Fondamento", cursive',
    body: '"EB Garamond", serif'
  };
  var INK = "#2A1A0E";
  var LIGHT = "#F5ECD7";

  function styleFor(b) {
    /* Sizes are expressed at a 768 reference width and scale with the
       bake, so any bake width keeps the same proportions. */
    switch (b.t) {
      case "eyebrow": return { family: "body", px: 15, lh: 1.3, gap: 0.9, color: "rgba(42,26,14,0.88)", tracking: 2.5, caps: true };
      case "display": return { family: "display", px: 46, lh: 1.18, gap: 0.5, weight: "700" };
      case "hand": return { family: "hand", px: 24, lh: 1.3, gap: 0.9 };
      case "body": return { family: "body", px: 19, lh: 1.5, gap: 0.8 };
      case "small": return { family: "body", px: 15, lh: 1.45, gap: 0.8, color: "rgba(42,26,14,0.92)" };
      case "divider": return { family: "body", px: 16, gap: 0.6 };
      case "chips": return { family: "body", px: 13.5, gap: 0.9 };
      case "sketch": return { family: "body", px: 18, gap: 1 };
      case "footer": return { family: "body", px: 12.5, lh: 1.2, gap: 0.4, color: "rgba(42,26,14,0.75)", tracking: 3, caps: true };
      default: return { family: "body", px: 18, lh: 1.5, gap: 0.8 };
    }
  }

  function setFont(g, spec, u) {
    if (!g) return 0;
    var px = spec.px * u;
    g.font = (spec.weight || "") + " " + px + "px " + (F[spec.family] || F.body);
    if ("letterSpacing" in g) g.letterSpacing = ((spec.tracking || 0) * u) + "px";
    return px;
  }

  function prepText(g, b, spec, u) {
    var s = b.text || "";
    if (spec.caps) s = s.toUpperCase();
    setFont(g, spec, u);
    return s;
  }

  function wrap(g, text, maxW) {
    var words = String(text).split(/\s+/);
    var lines = [], cur = "";
    words.forEach(function (wd) {
      var test = cur ? cur + " " + wd : wd;
      if (g.measureText(test).width > maxW && cur) { lines.push(cur); cur = wd; }
      else cur = test;
    });
    if (cur) lines.push(cur);
    return lines;
  }

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function drawSketch(g, b, x, y, w, h) {
    g.save();
    g.strokeStyle = "rgba(42,26,14,0.9)";
    g.lineWidth = 2;
    g.strokeRect(x, y, w, h);
    if (b.img && b.img.complete && b.img.naturalWidth) {
      g.filter = "grayscale(1) contrast(1.06)";
      var ir = b.img.naturalWidth / b.img.naturalHeight;
      var dr = w / h;
      var sw, sh, sx, sy;
      if (ir > dr) { sh = b.img.naturalHeight; sw = sh * dr; sx = (b.img.naturalWidth - sw) / 2; sy = 0; }
      else { sw = b.img.naturalWidth; sh = sw / dr; sx = 0; sy = (b.img.naturalHeight - sh) / 2; }
      g.drawImage(b.img, sx, sy, sw, sh, x, y, w, h);
      g.filter = "none";
    } else {
      g.fillStyle = "rgba(42,26,14,0.06)";
      g.fillRect(x, y, w, h);
    }
    g.restore();
  }

  /* One render pass over the blocks. g === null measures only (returns
     final y); pass the real context to draw. marksOut collects divider y
     positions so layout() can scorch the sheet like the DOM column. */
  function renderBlocks(g, blocks, w, u, pad, maxW, marksOut) {
    var y = pad * 0.9;
    blocks.forEach(function (b) {
      var spec = styleFor(b);
      var px = spec.px * u;
      var lh = px * (spec.lh || 1.35);
      if (g) g.textBaseline = "top";

      if (b.t === "divider") {
        if (marksOut) marksOut.push(y + px * 0.7);
        if (g) {
          var dy = y + px * 0.7;
          g.strokeStyle = "rgba(42,26,14,0.75)";
          g.lineWidth = Math.max(1, w * 0.0022);
          g.beginPath();
          g.moveTo(pad, dy); g.lineTo(w * 0.42, dy);
          g.moveTo(w * 0.58, dy); g.lineTo(w - pad, dy);
          g.stroke();
          g.save();
          g.translate(w / 2, dy); g.rotate(Math.PI / 4);
          g.fillStyle = INK;
          g.fillRect(-w * 0.008, -w * 0.008, w * 0.016, w * 0.016);
          g.restore();
        }
        y += px * 2.2;
        return;
      }

      if (b.t === "cap") {
        /* Sigil cap: blank lead-in parchment with the scribe's mark —
           ring, inner ring, Cinzel monogram, flanking flourishes. Mirrors
           the DOM .sheet-cap so the 2D/3D seam stays invisible. */
        var capH = b.h || 0;
        if (g && capH > 0) {
          var cy = y + capH / 2;
          var R = Math.min(capH * 0.3, w * 0.085);
          g.save();
          g.strokeStyle = "rgba(42,26,14,0.85)";
          g.lineWidth = Math.max(1.5, w * 0.0026);
          g.beginPath(); g.arc(w / 2, cy, R, 0, Math.PI * 2); g.stroke();
          g.lineWidth = Math.max(1, w * 0.0014);
          g.beginPath(); g.arc(w / 2, cy, R * 0.84, 0, Math.PI * 2); g.stroke();
          g.fillStyle = "rgba(42,26,14,0.92)";
          g.font = "700 " + Math.round(R * (b.label && b.label.length > 1 ? 0.62 : 1.02)) + 'px "Cinzel Decorative", serif';
          g.textAlign = "center"; g.textBaseline = "middle";
          g.fillText(b.label || "U", w / 2, cy + R * 0.07);
          /* Flourishes: hairlines out from the ring, diamonds at the ends. */
          var fy = cy, gap = R * 0.4, flen = w * 0.09;
          g.lineWidth = Math.max(1, w * 0.0016);
          [1, -1].forEach(function (s) {
            var x1 = w / 2 + s * (R + gap), x2 = x1 + s * flen;
            g.beginPath(); g.moveTo(x1, fy); g.lineTo(x2, fy); g.stroke();
            g.save();
            g.translate(x2 + s * w * 0.012, fy); g.rotate(Math.PI / 4);
            g.fillRect(-w * 0.006, -w * 0.006, w * 0.012, w * 0.012);
            g.restore();
          });
          g.restore();
        }
        y += capH;
        return;
      }

      if (b.t === "footer") {
        var ft = prepText(g, b, spec, u);
        if (g) {
          g.fillStyle = spec.color;
          g.fillText(ft, w / 2 - g.measureText(ft).width / 2, y);
        }
        y += lh + px * spec.gap;
        return;
      }

      if (b.t === "chips") {
        var cx = pad, cy = y, rowH = 0;
        var chipSpec = styleFor(b);
        var cpx = chipSpec.px * u;
        setFont(g, chipSpec, u);
        (b.items || []).forEach(function (chip) {
          var cw = (g ? g.measureText(chip).width : cpx * chip.length * 0.62) + cpx * 1.1;
          if (cx + cw > pad + maxW) { cx = pad; cy += cpx * 2.2; }
          if (g) {
            g.strokeStyle = "rgba(42,26,14,0.8)";
            g.lineWidth = Math.max(1, w * 0.0018);
            roundRect(g, cx, cy, cw, cpx * 1.9, cpx * 0.95);
            g.stroke();
            g.fillStyle = INK;
            g.fillText(chip, cx + cpx * 0.55, cy + cpx * 0.42);
          }
          cx += cw + cpx * 0.4;
          rowH = cpx * 1.9;
        });
        y = cy + rowH + px * spec.gap;
        return;
      }

      if (b.t === "ctas") {
        var boxH = 30 * u, boxW = maxW * 0.24, gap = 14 * u;
        if (g) {
          var bx = pad;
          (b.items || []).forEach(function (label, i) {
            g.fillStyle = i === 0 ? INK : "rgba(42,26,14,0.06)";
            roundRect(g, bx, y, boxW, boxH, 4 * u);
            g.fill();
            if (i !== 0) { g.strokeStyle = INK; g.lineWidth = 1.5 * u; g.stroke(); }
            setFont(g, { family: "body", px: 13 }, u);
            g.fillStyle = i === 0 ? LIGHT : INK;
            var tw2 = g.measureText(label).width;
            g.fillText(label, bx + boxW / 2 - tw2 / 2, y + boxH / 2 - 13 * u * 0.62);
            bx += boxW + gap;
          });
        }
        y += boxH + px * 0.9;
        return;
      }

      if (b.t === "heroRow") {
        var colW = maxW * 0.52;
        var tx = pad + maxW * 0.48;
        var imgW = maxW * 0.42;
        var imgH = imgW * 1.25;
        /* Text column: measure with a null-context trick — run wrap on the
           measure canvas via a saved font. */
        var ty = y;
        (b.texts || []).forEach(function (tb) {
          var ts = styleFor(tb);
          var tpx = ts.px * u;
          var s = prepText(g, tb, ts, u);
          var lines = wrap(g || measureCtx(s, ts, u), s, colW);
          if (g) {
            setFont(g, ts, u);
            g.fillStyle = ts.color || INK;
            lines.forEach(function (ln) {
              g.fillText(ln, tx, ty);
              ty += tpx * (ts.lh || 1.35);
            });
          } else {
            ty += lines.length * tpx * (ts.lh || 1.35);
          }
          ty += tpx * (ts.gap || 0.7);
        });
        var ctaH = b.ctas && b.ctas.length ? 30 * u + 17 * u : 0;
        var rowH2 = Math.max(imgH, ty - y + ctaH);
        if (g) {
          drawSketch(g, b, pad, y, imgW, imgH);
          /* CTA gates under the text column. */
          if (b.ctas && b.ctas.length) {
            var cy2 = ty + 4 * u;
            var bx2 = tx;
            b.ctas.forEach(function (label, i) {
              g.fillStyle = i === 0 ? INK : "rgba(42,26,14,0.06)";
              roundRect(g, bx2, cy2, colW * 0.46, 30 * u, 4 * u);
              g.fill();
              if (i !== 0) { g.strokeStyle = INK; g.lineWidth = 1.5 * u; g.stroke(); }
              setFont(g, { family: "body", px: 13 }, u);
              g.fillStyle = i === 0 ? LIGHT : INK;
              var tw3 = g.measureText(label).width;
              g.fillText(label, bx2 + colW * 0.23 - tw3 / 2, cy2 + 30 * u / 2 - 13 * u * 0.62);
              bx2 += colW * 0.46 + 12 * u;
            });
          }
        }
        y += rowH2 + 16 * u;
        return;
      }

      if (b.t === "questRow") {
        /* Copy left, sketch right — mirrors the DOM quest grid. */
        var lw = maxW * 0.46;
        var skW = maxW * 0.48;
        var skH = skW * 1.15;
        var ly = y;
        (b.left || []).forEach(function (tb) {
          var ts = styleFor(tb);
          var tpx = ts.px * u;
          var s = prepText(g, tb, ts, u);
          if (tb.t === "chips") {
            /* Chips wrap inside the narrow left column. */
            var cx3 = pad, cy3 = ly, rowH3 = 0;
            var cpx3 = ts.px * u;
            setFont(g, ts, u);
            (tb.items || []).forEach(function (chip) {
              var cw3 = (g ? g.measureText(chip).width : cpx3 * chip.length * 0.62) + cpx3 * 1.1;
              if (cx3 + cw3 > pad + lw) { cx3 = pad; cy3 += cpx3 * 2.2; }
              if (g) {
                g.strokeStyle = "rgba(42,26,14,0.8)";
                g.lineWidth = Math.max(1, w * 0.0018);
                roundRect(g, cx3, cy3, cw3, cpx3 * 1.9, cpx3 * 0.95);
                g.stroke();
                g.fillStyle = INK;
                g.fillText(chip, cx3 + cpx3 * 0.55, cy3 + cpx3 * 0.42);
              }
              cx3 += cw3 + cpx3 * 0.4;
              rowH3 = cpx3 * 1.9;
            });
            ly = cy3 + rowH3 + tpx * (ts.gap || 0.9);
            return;
          }
          var lines3 = wrap(g || measureCtx(s, ts, u), s, lw);
          if (g) {
            setFont(g, ts, u);
            g.fillStyle = ts.color || INK;
            lines3.forEach(function (ln) {
              g.fillText(ln, pad, ly);
              ly += tpx * (ts.lh || 1.35);
            });
          } else {
            ly += lines3.length * tpx * (ts.lh || 1.35);
          }
          ly += tpx * (ts.gap || 0.7);
        });
        var rowH4 = Math.max(ly - y, skH);
        if (g) drawSketch(g, b, pad + maxW - skW, y, skW, skH);
        y += rowH4 + 14 * u;
        return;
      }

      /* Plain text blocks (eyebrow/display/hand/body/small/sketch). */
      if (b.t === "sketch") {
        var sh2 = Math.min(maxW * 1.15, w * 0.9);
        if (g) drawSketch(g, b, pad, y, maxW, sh2);
        y += sh2 + px * 1.2;
        return;
      }
      var s2 = prepText(g, b, spec, u);
      var lines2 = wrap(g || measureCtx(s2, spec, u), s2, maxW);
      if (g) {
        setFont(g, spec, u);
        g.fillStyle = spec.color || INK;
        lines2.forEach(function (ln) {
          g.fillText(ln, pad, y);
          y += lh;
        });
      } else {
        y += lines2.length * lh;
      }
      y += px * (b.gap || 0.7);
    });
    return y + pad * 0.9;
  }

  /* Shared measure context for wrap() when the draw context is absent. */
  var _mctx = null;
  function measureCtx(text, spec, u) {
    if (!_mctx) _mctx = document.createElement("canvas").getContext("2d");
    setFont(_mctx, spec, u);
    return _mctx;
  }

  /* blocks: mirrors the DOM; see app.js buildContentBlocks.
     Returns {canvas, height} — a base copy with the page baked in,
     scorched where the dividers sit (same recipe as the DOM column). */
  function layout(blocks, w, opts) {
    opts = opts || {};
    var u = w / 768;
    var pad = w * 0.11;
    var maxW = w - pad * 2;
    var marks = [];
    var h = Math.ceil(renderBlocks(null, blocks, w, u, pad, maxW, marks)) + 4;
    var c = base(w, h, { seed: opts.seed || 7, marks: marks });
    var g = c.getContext("2d");
    renderBlocks(g, blocks, w, u, pad, maxW, null);
    return { canvas: c, width: w, height: h };
  }

  /* Preload sketch images so layout() can draw them. */
  function preload(urls) {
    return Promise.all(urls.map(function (u2) {
      return new Promise(function (res) {
        var im = new Image();
        im.onload = im.onerror = function () { res(im); };
        im.src = u2;
      });
    }));
  }

  window.Parchment = {
    base: base,
    layout: layout,
    preload: preload,
    loadGrain: loadGrain,
    /* document.fonts.ready only covers faces the DOM already requested —
       the bake draws Cinzel Decorative at weights the page never uses,
       so load them explicitly or the sheet renders a fallback serif. */
    fonts: function () {
      var loads = [];
      if (document.fonts && document.fonts.load) {
        loads = [
          document.fonts.load('700 20px "Cinzel Decorative"'),
          document.fonts.load('400 20px "Fondamento"'),
          document.fonts.load('400 20px "EB Garamond"')
        ];
      }
      return Promise.all(loads).catch(function () {}).then(function () {
        return (document.fonts && document.fonts.ready) ? document.fonts.ready : null;
      });
    }
  };
})();
