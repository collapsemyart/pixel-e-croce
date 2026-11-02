/*
 * color.js — conversione RGB → CIE Lab (illuminante D65) e distanza CIEDE2000.
 * Funziona nel browser (window.SPXColor), nel worker e in Node (module.exports).
 */
(function (root) {
  'use strict';

  // Bianco di riferimento D65 (osservatore 2°)
  var XN = 0.95047, YN = 1.0, ZN = 1.08883;

  // Tabella sRGB (0–255) → lineare, calcolata una volta sola
  var LINEARE = new Float64Array(256);
  for (var i = 0; i < 256; i++) {
    var c = i / 255;
    LINEARE[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }

  function f(t) {
    return t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116;
  }

  /** Converte un colore sRGB (0–255) in Lab. Restituisce [L, a, b]. */
  function rgbToLab(r, g, b) {
    var rl = LINEARE[r | 0], gl = LINEARE[g | 0], bl = LINEARE[b | 0];
    var x = (rl * 0.4124564 + gl * 0.3575761 + bl * 0.1804375) / XN;
    var y = (rl * 0.2126729 + gl * 0.7151522 + bl * 0.0721750) / YN;
    var z = (rl * 0.0193339 + gl * 0.1191920 + bl * 0.9503041) / ZN;
    var fx = f(x), fy = f(y), fz = f(z);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  }

  /**
   * Versione per valori RGB non interi (es. medie di pixel), con
   * interpolazione esatta della curva sRGB.
   */
  function rgbToLabFloat(r, g, b) {
    function lin(v) {
      var c = v / 255;
      return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    }
    var rl = lin(r), gl = lin(g), bl = lin(b);
    var x = (rl * 0.4124564 + gl * 0.3575761 + bl * 0.1804375) / XN;
    var y = (rl * 0.2126729 + gl * 0.7151522 + bl * 0.0721750) / YN;
    var z = (rl * 0.0193339 + gl * 0.1191920 + bl * 0.9503041) / ZN;
    var fx = f(x), fy = f(y), fz = f(z);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  }

  var RAD = Math.PI / 180;
  var POW25_7 = Math.pow(25, 7);

  /**
   * Differenza di colore CIEDE2000 tra due colori Lab
   * (Sharma, Wu, Dalal 2005; kL = kC = kH = 1).
   */
  function ciede2000(L1, a1, b1, L2, a2, b2) {
    var C1 = Math.sqrt(a1 * a1 + b1 * b1);
    var C2 = Math.sqrt(a2 * a2 + b2 * b2);
    var Cm = (C1 + C2) / 2;
    var Cm7 = Math.pow(Cm, 7);
    var G = 0.5 * (1 - Math.sqrt(Cm7 / (Cm7 + POW25_7)));
    var a1p = (1 + G) * a1;
    var a2p = (1 + G) * a2;
    var C1p = Math.sqrt(a1p * a1p + b1 * b1);
    var C2p = Math.sqrt(a2p * a2p + b2 * b2);

    var h1p = (b1 === 0 && a1p === 0) ? 0 : Math.atan2(b1, a1p) / RAD;
    if (h1p < 0) h1p += 360;
    var h2p = (b2 === 0 && a2p === 0) ? 0 : Math.atan2(b2, a2p) / RAD;
    if (h2p < 0) h2p += 360;

    var dLp = L2 - L1;
    var dCp = C2p - C1p;
    var dhp;
    if (C1p * C2p === 0) dhp = 0;
    else {
      dhp = h2p - h1p;
      if (dhp > 180) dhp -= 360;
      else if (dhp < -180) dhp += 360;
    }
    var dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * RAD);

    var Lpm = (L1 + L2) / 2;
    var Cpm = (C1p + C2p) / 2;
    var hpm;
    if (C1p * C2p === 0) hpm = h1p + h2p;
    else if (Math.abs(h1p - h2p) <= 180) hpm = (h1p + h2p) / 2;
    else if (h1p + h2p < 360) hpm = (h1p + h2p + 360) / 2;
    else hpm = (h1p + h2p - 360) / 2;

    var T = 1
      - 0.17 * Math.cos((hpm - 30) * RAD)
      + 0.24 * Math.cos((2 * hpm) * RAD)
      + 0.32 * Math.cos((3 * hpm + 6) * RAD)
      - 0.20 * Math.cos((4 * hpm - 63) * RAD);
    var dTheta = 30 * Math.exp(-Math.pow((hpm - 275) / 25, 2));
    var Cpm7 = Math.pow(Cpm, 7);
    var Rc = 2 * Math.sqrt(Cpm7 / (Cpm7 + POW25_7));
    var Lpm50 = (Lpm - 50) * (Lpm - 50);
    var Sl = 1 + (0.015 * Lpm50) / Math.sqrt(20 + Lpm50);
    var Sc = 1 + 0.045 * Cpm;
    var Sh = 1 + 0.015 * Cpm * T;
    var Rt = -Math.sin(2 * dTheta * RAD) * Rc;

    var tL = dLp / Sl, tC = dCp / Sc, tH = dHp / Sh;
    return Math.sqrt(tL * tL + tC * tC + tH * tH + Rt * tC * tH);
  }

  /** Distanza euclidea al quadrato in Lab (CIE76), usata dal k-means. */
  function dist2Lab(L1, a1, b1, L2, a2, b2) {
    var dl = L1 - L2, da = a1 - a2, db = b1 - b2;
    return dl * dl + da * da + db * db;
  }

  /** Luminanza relativa (0–1) per scegliere simboli neri o bianchi. */
  function luminanza(r, g, b) {
    return 0.2126 * LINEARE[r | 0] + 0.7152 * LINEARE[g | 0] + 0.0722 * LINEARE[b | 0];
  }

  var api = {
    rgbToLab: rgbToLab,
    rgbToLabFloat: rgbToLabFloat,
    ciede2000: ciede2000,
    dist2Lab: dist2Lab,
    luminanza: luminanza
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SPXColor = api;
})(typeof self !== 'undefined' ? self : this);
