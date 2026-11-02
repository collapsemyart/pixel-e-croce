/*
 * Test semplici, eseguibili con Node:   node tests/test.js
 * Nessuna dipendenza esterna.
 */
'use strict';

var path = require('path');
var fs = require('fs');
var Fabric = require('../js/fabric.js');
var Color = require('../js/color.js');
var Quantize = require('../js/quantize.js');
var Pdf = require('../js/pdf.js');
var Symbols = require('../js/symbols.js');

var superati = 0, falliti = 0;
function verifica(nome, condizione, dettaglio) {
  if (condizione) { superati++; console.log('  ok   ' + nome); }
  else { falliti++; console.log('  ERR  ' + nome + (dettaglio ? '  → ' + dettaglio : '')); }
}
function vicino(a, b, tol) { return Math.abs(a - b) <= tol; }

// ── fabric.js ───────────────────────────────────────────────────────────
console.log('fabric.js');
verifica('30 cm, Aida 14, margine 3 → 132 punti', Fabric.cmInPunti(30, 14, 3) === 132, Fabric.cmInPunti(30, 14, 3));
verifica('20 cm, Aida 14, margine 3 → 77 punti', Fabric.cmInPunti(20, 14, 3) === 77, Fabric.cmInPunti(20, 14, 3));
var es = Fabric.calcolaRicamo({ modo: 'cm', larghezza: 30, altezza: 20, aida: 14, margine: 3 });
verifica('stoffa 30 × 20 cm → 132 × 77 punti', es.larghezza === 132 && es.altezza === 77 && !es.errore, JSON.stringify(es));
verifica('132 punti su Aida 14 ≈ 23,9 cm', vicino(Fabric.puntiInCm(132, 14), 23.948, 0.01));
verifica('arrotondamento per difetto (Aida 11, 10 cm, margine 0 → 43)', Fabric.cmInPunti(10, 11, 0) === 43);
verifica('valore esatto non perde un punto (2,54 cm, Aida 14 → 14)', Fabric.cmInPunti(2.54, 14, 0) === 14);
verifica('stoffa più piccola del margine → 0 punti', Fabric.cmInPunti(5, 14, 3) === 0);
verifica('stoffa troppo piccola → errore', !!Fabric.calcolaRicamo({ modo: 'cm', larghezza: 5, altezza: 5, aida: 14, margine: 3 }).errore);
var punti = Fabric.calcolaRicamo({ modo: 'punti', larghezza: 120, altezza: 80, aida: 14 });
verifica('modo punti 120 × 80 resta 120 × 80', punti.larghezza === 120 && punti.altezza === 80 && !punti.errore);
verifica('oltre 500 punti → errore', !!Fabric.calcolaRicamo({ modo: 'punti', larghezza: 501, altezza: 80, aida: 14 }).errore);

// ── color.js ────────────────────────────────────────────────────────────
console.log('color.js');
function labVicino(lab, atteso, tol) {
  return vicino(lab[0], atteso[0], tol) && vicino(lab[1], atteso[1], tol) && vicino(lab[2], atteso[2], tol);
}
verifica('bianco → Lab (100, 0, 0)', labVicino(Color.rgbToLab(255, 255, 255), [100, 0, 0], 0.01), Color.rgbToLab(255, 255, 255));
verifica('nero → Lab (0, 0, 0)', labVicino(Color.rgbToLab(0, 0, 0), [0, 0, 0], 0.01));
verifica('rosso → Lab (53,24; 80,09; 67,20)', labVicino(Color.rgbToLab(255, 0, 0), [53.24, 80.09, 67.20], 0.05), Color.rgbToLab(255, 0, 0));
verifica('verde → Lab (87,73; −86,18; 83,18)', labVicino(Color.rgbToLab(0, 255, 0), [87.73, -86.18, 83.18], 0.05), Color.rgbToLab(0, 255, 0));
verifica('blu → Lab (32,30; 79,19; −107,86)', labVicino(Color.rgbToLab(0, 0, 255), [32.30, 79.19, -107.86], 0.05), Color.rgbToLab(0, 0, 255));
verifica('rgbToLabFloat coincide con rgbToLab sugli interi',
  labVicino(Color.rgbToLabFloat(120, 45, 200), Color.rgbToLab(120, 45, 200), 1e-9));

// Coppie di riferimento da Sharma, Wu, Dalal (2005), "The CIEDE2000 Color-Difference Formula"
var coppie = [
  [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
  [[50, 3.1571, -77.2803], [50, 0, -82.7485], 2.8615],
  [[50, 2.8361, -74.0200], [50, 0, -82.7485], 3.4412],
  [[50, 0, 0], [50, -1, 2], 2.3669],
  [[50, 2.5, 0], [73, 25, -18], 27.1492],
  [[50, 2.5, 0], [61, -5, 29], 22.8977],
  [[50, 2.5, 0], [56, -27, -3], 31.9030],
  [[50, 2.5, 0], [58, 24, 15], 19.4535],
  [[50, 2.5, 0], [50, 3.1736, 0.5854], 1.0000],
  [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
  [[63.0109, -31.0961, -5.8663], [62.8187, -29.7946, -4.0864], 1.2630]
];
coppie.forEach(function (c, i) {
  var d = Color.ciede2000(c[0][0], c[0][1], c[0][2], c[1][0], c[1][1], c[1][2]);
  var dInv = Color.ciede2000(c[1][0], c[1][1], c[1][2], c[0][0], c[0][1], c[0][2]);
  verifica('CIEDE2000 coppia ' + (i + 1) + ' = ' + c[2], vicino(d, c[2], 1e-4) && vicino(dInv, c[2], 1e-4), d.toFixed(4));
});
verifica('CIEDE2000 di un colore con sé stesso = 0', Color.ciede2000(40, 10, -20, 40, 10, -20) === 0);

// ── palette DMC ─────────────────────────────────────────────────────────
console.log('data/dmc.json');
var palette = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/dmc.json'), 'utf8'));
verifica('palette con almeno 400 fili', palette.length >= 400, palette.length);
verifica('ogni filo ha codice, nome e RGB validi', palette.every(function (p) {
  return p.code && p.name && [p.r, p.g, p.b].every(function (v) { return Number.isInteger(v) && v >= 0 && v <= 255; });
}));
var codici = {};
verifica('codici unici', palette.every(function (p) { if (codici[p.code]) return false; codici[p.code] = 1; return true; }));
var dmcJs = fs.readFileSync(path.join(__dirname, '../data/dmc.js'), 'utf8');
var finto = {};
new Function('window', dmcJs)(finto);
verifica('data/dmc.js è allineato a data/dmc.json', JSON.stringify(finto.SPX_DMC) === JSON.stringify(palette),
  'rigenera con: node tools/genera-dmc-js.js');

// ── quantize.js ─────────────────────────────────────────────────────────
console.log('quantize.js');
// immagine di prova: sfumature e forme, 300 × 200 pixel
function immagineProva(w, h) {
  var px = new Uint8ClampedArray(w * h * 4);
  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      var o = (y * w + x) * 4;
      var dx = x - w * 0.6, dy = y - h * 0.45;
      var dentro = dx * dx + dy * dy < (h * 0.3) * (h * 0.3);
      px[o] = dentro ? 220 : Math.round(255 * x / w);
      px[o + 1] = dentro ? 40 : Math.round(200 * y / h);
      px[o + 2] = dentro ? 60 : 120;
      px[o + 3] = 255;
    }
  }
  return px;
}
var img = immagineProva(300, 200);
var media = Quantize.ricampiona(new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]), 2, 1, 1, 1);
verifica('ricampionamento fa la media dell\'area (nero+bianco → 127,5)', vicino(media[0], 127.5, 1e-6), media[0]);
var trasp = Quantize.ricampiona(new Uint8ClampedArray([0, 0, 0, 0]), 1, 1, 1, 1);
verifica('pixel trasparente diventa bianco', trasp[0] === 255);

[2, 5, 20, 50].forEach(function (k) {
  var t0 = Date.now();
  var ris = Quantize.converti({ pixels: img, srcW: 300, srcH: 200, larghezza: 132, altezza: 77, maxColori: k, pulizia: true, palette: palette });
  var somma = ris.colori.reduce(function (s, c) { return s + c.punti; }, 0);
  verifica('max ' + k + ' colori → ne usa ' + ris.colori.length + ' (' + (Date.now() - t0) + ' ms)', ris.colori.length <= k && ris.colori.length >= 1);
  verifica('max ' + k + ': somma punti in legenda = 132 × 77', somma === 132 * 77, somma);
  verifica('max ' + k + ': indici della griglia validi', ris.griglia.every(function (v) { return v < ris.colori.length; }));
});
var a = Quantize.converti({ pixels: img, srcW: 300, srcH: 200, larghezza: 60, altezza: 40, maxColori: 12, pulizia: true, palette: palette });
var b = Quantize.converti({ pixels: img, srcW: 300, srcH: 200, larghezza: 60, altezza: 40, maxColori: 12, pulizia: true, palette: palette });
verifica('stessa foto → stesso schema (seme fisso)', JSON.stringify(a.colori) === JSON.stringify(b.colori) &&
  a.griglia.every(function (v, i) { return v === b.griglia[i]; }));
var unica = new Uint8ClampedArray(100 * 4).fill(255);
var r1 = Quantize.converti({ pixels: unica, srcW: 10, srcH: 10, larghezza: 10, altezza: 10, maxColori: 20, pulizia: true, palette: palette });
verifica('foto di un solo colore → 1 solo filo anche con max 20', r1.colori.length === 1, r1.colori.length);
// pulizia: un punto isolato prende il colore dei vicini
var g = new Int32Array([0, 0, 0, 0, 1, 0, 0, 0, 0]);
var pul = Quantize.pulisciIsolati(g, 3, 3);
verifica('pulizia: punto isolato al centro prende il colore intorno', pul[4] === 0);
var g2 = new Int32Array([1, 1, 0, 0, 0, 0, 0, 0, 0]);
verifica('pulizia: punti con un vicino uguale restano', Quantize.pulisciIsolati(g2, 3, 3)[0] === 1);
// bordo di una lettera: 0 = nero (lettera), 1 = verde (fondo, più frequente), 2 = verde scuro isolato
var g3 = new Int32Array([0, 1, 1, 0, 2, 1, 0, 1, 1]);
var dist3 = function (a, b) { var v = { '0-2': 5, '2-0': 5, '1-2': 30, '2-1': 30, '0-1': 40, '1-0': 40 }; return v[a + '-' + b]; };
verifica('pulizia: il punto isolato prende il vicino più simile, non il più frequente',
  Quantize.pulisciIsolati(g3, 3, 3, dist3)[4] === 0);
var lettera = Quantize.converti({
  pixels: (function () {
    // fondo verde con una barra nera verticale larga 1,4 punti
    var w = 70, h = 50, px = new Uint8ClampedArray(w * h * 4);
    for (var i = 0; i < w * h; i++) {
      var x = i % w, nero = x >= 30 && x < 37;
      px[i * 4] = nero ? 10 : 110; px[i * 4 + 1] = nero ? 10 : 180; px[i * 4 + 2] = nero ? 10 : 70; px[i * 4 + 3] = 255;
    }
    return px;
  })(), srcW: 70, srcH: 50, larghezza: 14, altezza: 10, maxColori: 6, pulizia: true, palette: palette
});
var colonnaScura = [];
for (var cx = 0; cx < 14; cx++) {
  var col = lettera.colori[lettera.griglia[5 * 14 + cx]];
  colonnaScura.push(col.r + col.g + col.b < 200);
}
verifica('pulizia: un tratto sottile scuro (es. una lettera) non viene cancellato', colonnaScura.indexOf(true) >= 0);

// ── qualita.js ──────────────────────────────────────────────────────────
console.log('qualita.js');
var Qualita = require('../js/qualita.js');
var mq = Quantize.converti({ pixels: img, srcW: 300, srcH: 200, larghezza: 60, altezza: 40, maxColori: 20, pulizia: true, palette: palette }).qualita;
verifica('la conversione restituisce le misure di qualità', mq && mq.dettaglioPerso >= 0 && mq.dettaglioPerso <= 1 && mq.deltaE >= 0,
  JSON.stringify(mq));
var buona = Qualita.valuta({ dettaglioPerso: 0.05, deltaE: 3, contrasto: 60, luminosita: 55 }, { pixelPerPunto: 5, coloriUsati: 15, maxColori: 20 });
verifica('foto adatta → Ottima', buona.livello === 'Ottima' && buona.punteggio >= 85, buona.punteggio);
var cattiva = Qualita.valuta({ dettaglioPerso: 0.45, deltaE: 11, contrasto: 20, luminosita: 15 }, { pixelPerPunto: 0.6, coloriUsati: 20, maxColori: 20 });
verifica('foto piccola, scura, piena di dettagli → Scarsa con consigli', cattiva.livello === 'Scarsa' && cattiva.consigli.length >= 4,
  cattiva.punteggio + ' ' + cattiva.consigli.length);
var piuPunti = Quantize.converti({ pixels: img, srcW: 300, srcH: 200, larghezza: 150, altezza: 100, maxColori: 20, pulizia: true, palette: palette }).qualita;
verifica('più punti → meno dettagli persi', piuPunti.dettaglioPerso <= mq.dettaglioPerso,
  piuPunti.dettaglioPerso.toFixed(3) + ' vs ' + mq.dettaglioPerso.toFixed(3));

// ── pdf.js: impaginazione ───────────────────────────────────────────────
console.log('pdf.js');
var lay = Pdf.calcolaPagine(60, 86, { formato: 'A4', orientamento: 'verticale', lato: 3 });
verifica('A4 verticale, caselle 3 mm → 60 × 86 punti per pagina', lay.colonnePerPagina === 60 && lay.righePerPagina === 86,
  lay.colonnePerPagina + ' × ' + lay.righePerPagina);
verifica('60 × 86 sta in una pagina', lay.pagine.length === 1);

function controllaCopertura(W, H, opz) {
  var l = Pdf.calcolaPagine(W, H, opz);
  var visto = new Uint8Array(W * H);
  var entro = true;
  l.pagine.forEach(function (p) {
    if ((p.col1 - p.colMostrata0) > l.colonnePerPagina || (p.riga1 - p.rigaMostrata0) > l.righePerPagina) entro = false;
    for (var r = p.riga0; r < p.riga1; r++) for (var c = p.col0; c < p.col1; c++) visto[r * W + c]++;
  });
  return { l: l, ok: visto.every(function (v) { return v === 1; }), entro: entro };
}
[
  [200, 150, { formato: 'A4', orientamento: 'verticale', lato: 3 }],
  [200, 150, { formato: 'A3', orientamento: 'orizzontale', lato: 2.5 }],
  [500, 500, { formato: 'Letter', orientamento: 'verticale', lato: 5 }],
  [61, 87, { formato: 'A4', orientamento: 'verticale', lato: 3 }]
].forEach(function (t) {
  var c = controllaCopertura(t[0], t[1], t[2]);
  verifica(t[0] + ' × ' + t[1] + ' su ' + t[2].formato + ' ' + t[2].orientamento + ' ' + t[2].lato + ' mm → ' + c.l.pagine.length +
    ' pagine, nessun punto mancante o doppio', c.ok && c.l.pagine.length > 1);
  verifica('  … e ogni pagina (sovrapposizione compresa) sta nel foglio', c.entro);
});
verifica('almeno 50 simboli disponibili', Symbols.quanti >= 50, Symbols.quanti);

// ── PDF completo con jsPDF (se disponibile in lib/) ─────────────────────
console.log('PDF completo');
var JsPDF = null;
try { JsPDF = require('../lib/jspdf.umd.min.js').jsPDF; } catch (e) { console.log('  (jsPDF non caricabile in Node: ' + e.message + ')'); }
if (JsPDF) {
  var ris = Quantize.converti({ pixels: img, srcW: 300, srcH: 200, larghezza: 200, altezza: 150, maxColori: 50, pulizia: true, palette: palette });
  ['colori', 'bn'].forEach(function (modo) {
    var t0 = Date.now();
    var doc = Pdf.creaPdf(JsPDF, ris, { formato: 'A4', orientamento: 'verticale', lato: 3, modo: modo, aida: 14, immagine: null });
    var buf = Buffer.from(doc.output('arraybuffer'));
    var lay2 = Pdf.calcolaPagine(200, 150, { formato: 'A4', orientamento: 'verticale', lato: 3 });
    verifica('PDF ' + modo + ': ' + doc.getNumberOfPages() + ' pagine, ' + Math.round(buf.length / 1024) + ' kB (' + (Date.now() - t0) + ' ms)',
      buf.slice(0, 5).toString() === '%PDF-' && doc.getNumberOfPages() >= 2 + lay2.pagine.length);
    if (process.env.SPX_SALVA_PDF) fs.writeFileSync(path.join(process.env.SPX_SALVA_PDF, 'prova-' + modo + '.pdf'), buf);
  });
}

console.log('\n' + superati + ' superati, ' + falliti + ' falliti');
process.exit(falliti ? 1 : 0);
