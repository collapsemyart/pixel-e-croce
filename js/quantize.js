/*
 * quantize.js — dalla foto alla griglia di punti con colori DMC.
 *
 * Passaggi (vedi specifica, "Algoritmo di conversione"):
 *  1. ridimensionamento con media dell'area di ogni punto
 *  2. conversione in Lab
 *  3. k-means in Lab (k-means++ con seme fisso)
 *  4. abbinamento di ogni centro al filo DMC più vicino (CIEDE2000)
 *  5. riassegnazione di ogni punto al filo più vicino tra quelli scelti
 *  6. pulizia dei punti isolati (opzionale)
 *
 * Funziona nel browser (window.SPXQuantize), nel worker e in Node.
 */
(function (root) {
  'use strict';

  var Color = (typeof module !== 'undefined' && module.exports)
    ? require('./color.js')
    : root.SPXColor;

  var SEME = 20261102;      // seme fisso: stessa foto → stesso schema
  var MAX_ITERAZIONI = 40;  // iterazioni massime del k-means
  var PASSATE_PULIZIA = 3;  // passate massime della pulizia dei punti isolati

  /** Generatore pseudo-casuale deterministico (mulberry32). */
  function generatore(seme) {
    var s = seme >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * Pesi di sovrapposizione tra i pixel sorgente e le celle di destinazione
   * lungo un asse. Per ogni cella: primo pixel e pesi dei pixel coperti.
   */
  function pesiAsse(src, dst) {
    var scala = src / dst;
    var celle = [];
    for (var i = 0; i < dst; i++) {
      var a = i * scala, b = (i + 1) * scala;
      var p0 = Math.floor(a), p1 = Math.min(src, Math.ceil(b - 1e-9));
      var pesi = [];
      var tot = 0;
      for (var p = p0; p < p1; p++) {
        var w = Math.min(b, p + 1) - Math.max(a, p);
        if (w < 0) w = 0;
        pesi.push(w);
        tot += w;
      }
      for (var k = 0; k < pesi.length; k++) pesi[k] /= tot;
      celle.push({ inizio: p0, pesi: pesi });
    }
    return celle;
  }

  /**
   * Passaggio 1 — riduce l'immagine RGBA a larghezza × altezza punti.
   * Ogni punto è la media (pesata per area) dei pixel che copre.
   * I pixel trasparenti vengono composti su bianco.
   * Restituisce un Float32Array RGB (3 valori per punto).
   */
  function ricampiona(pixels, srcW, srcH, W, H) {
    var px = pesiAsse(srcW, W);
    var py = pesiAsse(srcH, H);
    // passaggio orizzontale: W × srcH
    var tmp = new Float32Array(W * srcH * 3);
    for (var y = 0; y < srcH; y++) {
      var riga = y * srcW * 4;
      for (var x = 0; x < W; x++) {
        var cella = px[x];
        var r = 0, g = 0, b = 0;
        for (var k = 0; k < cella.pesi.length; k++) {
          var o = riga + (cella.inizio + k) * 4;
          var al = pixels[o + 3] / 255;
          var w = cella.pesi[k];
          r += w * (pixels[o] * al + 255 * (1 - al));
          g += w * (pixels[o + 1] * al + 255 * (1 - al));
          b += w * (pixels[o + 2] * al + 255 * (1 - al));
        }
        var t = (y * W + x) * 3;
        tmp[t] = r; tmp[t + 1] = g; tmp[t + 2] = b;
      }
    }
    // passaggio verticale: W × H
    var out = new Float32Array(W * H * 3);
    for (var yy = 0; yy < H; yy++) {
      var c = py[yy];
      for (var xx = 0; xx < W; xx++) {
        var rr = 0, gg = 0, bb = 0;
        for (var j = 0; j < c.pesi.length; j++) {
          var s = ((c.inizio + j) * W + xx) * 3;
          var ww = c.pesi[j];
          rr += ww * tmp[s]; gg += ww * tmp[s + 1]; bb += ww * tmp[s + 2];
        }
        var d = (yy * W + xx) * 3;
        out[d] = rr; out[d + 1] = gg; out[d + 2] = bb;
      }
    }
    return out;
  }

  /**
   * Passaggio 2 — converte i punti in Lab e li raggruppa per colore
   * (RGB arrotondato all'intero), così il k-means lavora su colori distinti
   * con un peso pari al numero di punti.
   */
  function raggruppaColori(rgb, n) {
    var mappa = new Map();
    var indice = new Int32Array(n);
    var lab = [];      // Lab dei colori distinti (piatto: L,a,b,...)
    var rgbU = [];     // RGB interi dei colori distinti
    var peso = [];
    for (var i = 0; i < n; i++) {
      var r = Math.round(rgb[i * 3]), g = Math.round(rgb[i * 3 + 1]), b = Math.round(rgb[i * 3 + 2]);
      var chiave = (r << 16) | (g << 8) | b;
      var u = mappa.get(chiave);
      if (u === undefined) {
        u = peso.length;
        mappa.set(chiave, u);
        var l = Color.rgbToLab(r, g, b);
        lab.push(l[0], l[1], l[2]);
        rgbU.push(r, g, b);
        peso.push(0);
      }
      peso[u]++;
      indice[i] = u;
    }
    return {
      indice: indice,
      lab: Float64Array.from(lab),
      rgb: rgbU,
      peso: Float64Array.from(peso),
      quanti: peso.length
    };
  }

  /**
   * Passaggio 3 — k-means pesato in Lab con inizializzazione k-means++.
   * Restituisce i centri (Float64Array piatto) e quanti sono.
   */
  function kmeans(lab, peso, quanti, k, seme) {
    var rnd = generatore(seme);
    k = Math.max(1, Math.min(k, quanti));
    var centri = new Float64Array(k * 3);
    var d2 = new Float64Array(quanti);

    // primo centro: scelto con probabilità proporzionale al peso
    var totPeso = 0;
    for (var i = 0; i < quanti; i++) totPeso += peso[i];
    var scelto = scegli(peso, totPeso, rnd, quanti);
    centri[0] = lab[scelto * 3]; centri[1] = lab[scelto * 3 + 1]; centri[2] = lab[scelto * 3 + 2];
    for (i = 0; i < quanti; i++) d2[i] = Color.dist2Lab(lab[i * 3], lab[i * 3 + 1], lab[i * 3 + 2], centri[0], centri[1], centri[2]);

    // centri successivi: probabilità proporzionale a peso × distanza²
    var prob = new Float64Array(quanti);
    for (var c = 1; c < k; c++) {
      var tot = 0;
      for (i = 0; i < quanti; i++) { prob[i] = peso[i] * d2[i]; tot += prob[i]; }
      if (tot <= 0) { k = c; centri = centri.slice(0, k * 3); break; } // colori finiti
      scelto = scegli(prob, tot, rnd, quanti);
      centri[c * 3] = lab[scelto * 3]; centri[c * 3 + 1] = lab[scelto * 3 + 1]; centri[c * 3 + 2] = lab[scelto * 3 + 2];
      for (i = 0; i < quanti; i++) {
        var nd = Color.dist2Lab(lab[i * 3], lab[i * 3 + 1], lab[i * 3 + 2], centri[c * 3], centri[c * 3 + 1], centri[c * 3 + 2]);
        if (nd < d2[i]) d2[i] = nd;
      }
    }

    // iterazioni di Lloyd
    var assegna = new Int32Array(quanti).fill(-1);
    var somme = new Float64Array(k * 4);
    for (var it = 0; it < MAX_ITERAZIONI; it++) {
      var cambiati = 0;
      for (i = 0; i < quanti; i++) {
        var L = lab[i * 3], A = lab[i * 3 + 1], B = lab[i * 3 + 2];
        var migliore = 0, dMin = Infinity;
        for (c = 0; c < k; c++) {
          var dd = Color.dist2Lab(L, A, B, centri[c * 3], centri[c * 3 + 1], centri[c * 3 + 2]);
          if (dd < dMin) { dMin = dd; migliore = c; }
        }
        if (assegna[i] !== migliore) { assegna[i] = migliore; cambiati++; }
      }
      if (cambiati === 0) break;
      somme.fill(0);
      for (i = 0; i < quanti; i++) {
        var a = assegna[i], w = peso[i];
        somme[a * 4] += w * lab[i * 3];
        somme[a * 4 + 1] += w * lab[i * 3 + 1];
        somme[a * 4 + 2] += w * lab[i * 3 + 2];
        somme[a * 4 + 3] += w;
      }
      for (c = 0; c < k; c++) {
        var sw = somme[c * 4 + 3];
        if (sw > 0) {
          centri[c * 3] = somme[c * 4] / sw;
          centri[c * 3 + 1] = somme[c * 4 + 1] / sw;
          centri[c * 3 + 2] = somme[c * 4 + 2] / sw;
        }
      }
    }
    return { centri: centri, k: k };
  }

  function scegli(pesi, tot, rnd, n) {
    var soglia = rnd() * tot;
    var acc = 0;
    for (var i = 0; i < n; i++) {
      acc += pesi[i];
      if (acc >= soglia && pesi[i] > 0) return i;
    }
    for (i = n - 1; i >= 0; i--) if (pesi[i] > 0) return i;
    return 0;
  }

  /** Lab della palette DMC, calcolato una volta per palette. */
  var cachePalette = { palette: null, lab: null };
  function labPalette(palette) {
    if (cachePalette.palette !== palette) {
      var lab = new Float64Array(palette.length * 3);
      for (var i = 0; i < palette.length; i++) {
        var l = Color.rgbToLab(palette[i].r, palette[i].g, palette[i].b);
        lab[i * 3] = l[0]; lab[i * 3 + 1] = l[1]; lab[i * 3 + 2] = l[2];
      }
      cachePalette = { palette: palette, lab: lab };
    }
    return cachePalette.lab;
  }

  /** Indice del filo più vicino (CIEDE2000) tra quelli elencati in `candidati`. */
  function piuVicino(L, A, B, labDmc, candidati) {
    var migliore = candidati[0], dMin = Infinity;
    for (var j = 0; j < candidati.length; j++) {
      var p = candidati[j];
      var d = Color.ciede2000(L, A, B, labDmc[p * 3], labDmc[p * 3 + 1], labDmc[p * 3 + 2]);
      if (d < dMin) { dMin = d; migliore = p; }
    }
    return migliore;
  }

  /**
   * Passaggio 6 — un punto senza vicini dello stesso colore (8 vicini) prende
   * il colore di uno dei vicini.
   * Se `distanza(a, b)` è fornita, sceglie il vicino di colore più simile
   * (a parità, il più frequente): così il bordo sfumato di una lettera scura
   * diventa scuro e la lettera resta leggibile, mentre il rumore sparisce.
   * Senza `distanza`, sceglie il colore più frequente intorno.
   * Lavora su una copia: le decisioni si basano sulla griglia originale.
   */
  function pulisciIsolati(griglia, W, H, distanza) {
    var out = griglia.slice();
    var conta = new Map();
    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W; x++) {
        var c = griglia[y * W + x];
        var uguali = 0, vicini = 0;
        conta.clear();
        for (var dy = -1; dy <= 1 && !uguali; dy++) {
          var ny = y + dy;
          if (ny < 0 || ny >= H) continue;
          for (var dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            var nx = x + dx;
            if (nx < 0 || nx >= W) continue;
            var v = griglia[ny * W + nx];
            vicini++;
            if (v === c) { uguali++; break; }
            conta.set(v, (conta.get(v) || 0) + 1);
          }
        }
        if (uguali || vicini === 0) continue;
        var meglio = -1, maxN = -1, minD = Infinity;
        conta.forEach(function (n, col) {
          var d = distanza ? distanza(c, col) : 0;
          if (d < minD - 1e-9 ||
              (Math.abs(d - minD) <= 1e-9 && (n > maxN || (n === maxN && col < meglio)))) {
            minD = d; maxN = n; meglio = col;
          }
        });
        out[y * W + x] = meglio;
      }
    }
    return out;
  }

  /**
   * Passaggi 3–5 su una serie di colori RGB: k-means, abbinamento DMC,
   * riassegnazione. Restituisce per ogni colore l'indice del filo nella palette.
   */
  function assegnaFili(rgb, n, maxColori, palette, labDmc) {
    var gruppi = raggruppaColori(rgb, n);
    var km = kmeans(gruppi.lab, gruppi.peso, gruppi.quanti, maxColori, SEME);

    // passaggio 4: abbinamento centri → DMC (i doppioni si uniscono)
    var tutti = [];
    for (var p = 0; p < palette.length; p++) tutti.push(p);
    var scelti = [];
    var giaScelto = {};
    for (var c = 0; c < km.k; c++) {
      var d = piuVicino(km.centri[c * 3], km.centri[c * 3 + 1], km.centri[c * 3 + 2], labDmc, tutti);
      if (!giaScelto[d]) { giaScelto[d] = true; scelti.push(d); }
    }

    // passaggio 5: ogni colore distinto → filo più vicino tra quelli scelti
    //   Per velocità i colori vengono raggruppati a 6 bit per canale (passi di 4
    //   su 255): la differenza è al massimo di 2 livelli RGB, invisibile, e il
    //   calcolo CIEDE2000 si fa una volta sola per gruppo.
    var filoDiColore = new Int32Array(gruppi.quanti);
    var memo = new Int32Array(1 << 18).fill(-1);
    for (var u = 0; u < gruppi.quanti; u++) {
      var r6 = gruppi.rgb[u * 3] >> 2, g6 = gruppi.rgb[u * 3 + 1] >> 2, b6 = gruppi.rgb[u * 3 + 2] >> 2;
      var chiave = (r6 << 12) | (g6 << 6) | b6;
      if (memo[chiave] < 0) {
        var lc = Color.rgbToLab(Math.min(255, r6 * 4 + 2), Math.min(255, g6 * 4 + 2), Math.min(255, b6 * 4 + 2));
        memo[chiave] = piuVicino(lc[0], lc[1], lc[2], labDmc, scelti);
      }
      filoDiColore[u] = memo[chiave];
    }
    var fili = new Int32Array(n);
    for (var i = 0; i < n; i++) fili[i] = filoDiColore[gruppi.indice[i]];
    return fili;
  }

  /**
   * Conversione completa.
   * opz: { pixels (RGBA), srcW, srcH, larghezza, altezza, maxColori, pulizia, palette }
   * Restituisce { larghezza, altezza, griglia (Uint16Array di indici in `colori`),
   *               colori: [{code, name, r, g, b, punti}] ordinati per punti decrescenti }
   */
  function converti(opz) {
    var W = opz.larghezza, H = opz.altezza, n = W * H;
    var palette = opz.palette;
    var labDmc = labPalette(palette);
    var griglia, i;

    var rgb = ricampiona(opz.pixels, opz.srcW, opz.srcH, W, H);
    griglia = assegnaFili(rgb, n, opz.maxColori, palette, labDmc);

    // passaggio 6
    //   Più passate (al massimo PASSATE_PULIZIA): due punti isolati vicini
    //   possono scambiarsi il colore e restare isolati dopo la prima.
    if (opz.pulizia) {
      var distanza = function (a, b) {
        return Color.ciede2000(labDmc[a * 3], labDmc[a * 3 + 1], labDmc[a * 3 + 2],
          labDmc[b * 3], labDmc[b * 3 + 1], labDmc[b * 3 + 2]);
      };
      for (var passata = 0; passata < PASSATE_PULIZIA; passata++) {
        var pulita = pulisciIsolati(griglia, W, H, distanza);
        var cambiati = false;
        for (i = 0; i < n && !cambiati; i++) if (pulita[i] !== griglia[i]) cambiati = true;
        griglia = pulita;
        if (!cambiati) break;
      }
    }

    // conteggio e ordinamento per numero di punti
    var conteggio = {};
    for (i = 0; i < n; i++) conteggio[griglia[i]] = (conteggio[griglia[i]] || 0) + 1;
    var usati = Object.keys(conteggio).map(Number);
    usati.sort(function (a, b) {
      return conteggio[b] - conteggio[a] || String(palette[a].code).localeCompare(String(palette[b].code));
    });
    var nuovoIndice = {};
    var colori = usati.map(function (pi, idx) {
      nuovoIndice[pi] = idx;
      var f = palette[pi];
      return { code: f.code, name: f.name, r: f.r, g: f.g, b: f.b, punti: conteggio[pi] };
    });
    var finale = new Uint16Array(n);
    for (i = 0; i < n; i++) finale[i] = nuovoIndice[griglia[i]];

    return { larghezza: W, altezza: H, griglia: finale, colori: colori };
  }

  var api = {
    SEME: SEME,
    generatore: generatore,
    ricampiona: ricampiona,
    raggruppaColori: raggruppaColori,
    kmeans: kmeans,
    pulisciIsolati: pulisciIsolati,
    converti: converti
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SPXQuantize = api;
})(typeof self !== 'undefined' ? self : this);
