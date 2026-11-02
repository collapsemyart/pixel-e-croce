/*
 * symbols.js — simboli dello schema.
 *
 * Ogni simbolo è descritto da forme semplici in un quadrato unitario
 * (0,0 in alto a sinistra, 1,1 in basso a destra), così lo stesso simbolo
 * si disegna uguale sul canvas dell'anteprima e nel PDF (jsPDF), senza
 * dipendere da font con caratteri speciali.
 *
 * L'ordine conta: i colori più usati prendono i primi simboli, i più semplici.
 */
(function (root) {
  'use strict';

  function cerchio(r, pieno) { return { t: 'cerchio', x: 0.5, y: 0.5, r: r, pieno: pieno }; }
  function poli(p, pieno) { return { t: 'poli', p: p, pieno: pieno }; }
  function linea(x1, y1, x2, y2) { return { t: 'linea', p: [x1, y1, x2, y2] }; }
  function testo(s) { return { t: 'testo', s: s }; }

  var QUADRATO = [0.22, 0.22, 0.78, 0.22, 0.78, 0.78, 0.22, 0.78];
  var TRI_SU = [0.5, 0.17, 0.84, 0.8, 0.16, 0.8];
  var TRI_GIU = [0.16, 0.2, 0.84, 0.2, 0.5, 0.83];
  var TRI_SX = [0.18, 0.5, 0.8, 0.16, 0.8, 0.84];
  var TRI_DX = [0.2, 0.16, 0.82, 0.5, 0.2, 0.84];
  var ROMBO = [0.5, 0.14, 0.86, 0.5, 0.5, 0.86, 0.14, 0.5];

  function stella() {
    var p = [];
    for (var i = 0; i < 10; i++) {
      var r = i % 2 === 0 ? 0.38 : 0.16;
      var a = -Math.PI / 2 + i * Math.PI / 5;
      p.push(0.5 + r * Math.cos(a), 0.54 + r * Math.sin(a));
    }
    return p;
  }

  var SIMBOLI = [
    { nome: 'cerchio pieno', forme: [cerchio(0.3, true)] },
    { nome: 'quadrato pieno', forme: [poli(QUADRATO, true)] },
    { nome: 'triangolo pieno', forme: [poli(TRI_SU, true)] },
    { nome: 'croce', forme: [linea(0.2, 0.2, 0.8, 0.8), linea(0.8, 0.2, 0.2, 0.8)] },
    { nome: 'più', forme: [linea(0.5, 0.16, 0.5, 0.84), linea(0.16, 0.5, 0.84, 0.5)] },
    { nome: 'cerchio vuoto', forme: [cerchio(0.3, false)] },
    { nome: 'quadrato vuoto', forme: [poli(QUADRATO, false)] },
    { nome: 'triangolo vuoto', forme: [poli(TRI_SU, false)] },
    { nome: 'rombo pieno', forme: [poli(ROMBO, true)] },
    { nome: 'rombo vuoto', forme: [poli(ROMBO, false)] },
    { nome: 'triangolo giù pieno', forme: [poli(TRI_GIU, true)] },
    { nome: 'triangolo giù vuoto', forme: [poli(TRI_GIU, false)] },
    { nome: 'barra orizzontale', forme: [poli([0.14, 0.4, 0.86, 0.4, 0.86, 0.6, 0.14, 0.6], true)] },
    { nome: 'barra verticale', forme: [poli([0.4, 0.14, 0.6, 0.14, 0.6, 0.86, 0.4, 0.86], true)] },
    { nome: 'barra obliqua', forme: [linea(0.2, 0.82, 0.8, 0.18)] },
    { nome: 'barra obliqua inversa', forme: [linea(0.2, 0.18, 0.8, 0.82)] },
    { nome: 'asterisco', forme: [linea(0.5, 0.14, 0.5, 0.86), linea(0.14, 0.5, 0.86, 0.5), linea(0.24, 0.24, 0.76, 0.76), linea(0.76, 0.24, 0.24, 0.76)] },
    { nome: 'cerchio con punto', forme: [cerchio(0.32, false), cerchio(0.1, true)] },
    { nome: 'quadrato con punto', forme: [poli(QUADRATO, false), cerchio(0.1, true)] },
    { nome: 'quadrato metà sinistra', forme: [poli(QUADRATO, false), poli([0.22, 0.22, 0.5, 0.22, 0.5, 0.78, 0.22, 0.78], true)] },
    { nome: 'quadrato metà alta', forme: [poli(QUADRATO, false), poli([0.22, 0.22, 0.78, 0.22, 0.78, 0.5, 0.22, 0.5], true)] },
    { nome: 'triangolo sinistra', forme: [poli(TRI_SX, true)] },
    { nome: 'triangolo destra', forme: [poli(TRI_DX, true)] },
    { nome: 'punto', forme: [cerchio(0.13, true)] },
    { nome: 'uguale', forme: [linea(0.18, 0.37, 0.82, 0.37), linea(0.18, 0.63, 0.82, 0.63)] },
    { nome: 'doppia verticale', forme: [linea(0.37, 0.18, 0.37, 0.82), linea(0.63, 0.18, 0.63, 0.82)] },
    { nome: 'clessidra', forme: [poli([0.2, 0.18, 0.8, 0.18, 0.2, 0.82, 0.8, 0.82], true)] },
    { nome: 'stella', forme: [poli(stella(), true)] }
  ];
  // Lettere e cifre ben distinguibili (niente O/0, I/1, Q, W, X che si confondono)
  'ABCDEFGHKLMNPRSTUVYZ23456789'.split('').forEach(function (ch) {
    SIMBOLI.push({ nome: ch, forme: [testo(ch)] });
  });

  var SPESSORE = 0.1; // spessore delle linee, in frazione del lato casella

  /** Disegna un simbolo su un contesto canvas 2D, nella casella (x, y, lato). */
  function disegnaCanvas(ctx, indice, x, y, lato, colore) {
    var s = SIMBOLI[indice % SIMBOLI.length];
    ctx.save();
    ctx.fillStyle = colore;
    ctx.strokeStyle = colore;
    ctx.lineWidth = Math.max(1, lato * SPESSORE);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    s.forme.forEach(function (f) {
      if (f.t === 'cerchio') {
        ctx.beginPath();
        ctx.arc(x + f.x * lato, y + f.y * lato, f.r * lato, 0, Math.PI * 2);
        if (f.pieno) ctx.fill(); else ctx.stroke();
      } else if (f.t === 'poli') {
        ctx.beginPath();
        ctx.moveTo(x + f.p[0] * lato, y + f.p[1] * lato);
        for (var i = 2; i < f.p.length; i += 2) ctx.lineTo(x + f.p[i] * lato, y + f.p[i + 1] * lato);
        ctx.closePath();
        if (f.pieno) ctx.fill(); else ctx.stroke();
      } else if (f.t === 'linea') {
        ctx.beginPath();
        ctx.moveTo(x + f.p[0] * lato, y + f.p[1] * lato);
        ctx.lineTo(x + f.p[2] * lato, y + f.p[3] * lato);
        ctx.stroke();
      } else if (f.t === 'testo') {
        ctx.font = 'bold ' + Math.round(lato * 0.78) + 'px Helvetica, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(f.s, x + lato / 2, y + lato * 0.54);
      }
    });
    ctx.restore();
  }

  /**
   * Disegna un simbolo in un documento jsPDF (unità: mm), nella casella (x, y, lato).
   * colore: [r, g, b]
   */
  function disegnaPdf(doc, indice, x, y, lato, colore) {
    var s = SIMBOLI[indice % SIMBOLI.length];
    doc.setDrawColor(colore[0], colore[1], colore[2]);
    doc.setFillColor(colore[0], colore[1], colore[2]);
    doc.setTextColor(colore[0], colore[1], colore[2]);
    doc.setLineWidth(lato * SPESSORE);
    if (doc.setLineCap) doc.setLineCap('round');
    if (doc.setLineJoin) doc.setLineJoin('round');
    s.forme.forEach(function (f) {
      if (f.t === 'cerchio') {
        doc.circle(x + f.x * lato, y + f.y * lato, f.r * lato, f.pieno ? 'F' : 'S');
      } else if (f.t === 'poli') {
        var segmenti = [];
        for (var i = 2; i < f.p.length; i += 2) {
          segmenti.push([(f.p[i] - f.p[i - 2]) * lato, (f.p[i + 1] - f.p[i - 1]) * lato]);
        }
        doc.lines(segmenti, x + f.p[0] * lato, y + f.p[1] * lato, [1, 1], f.pieno ? 'F' : 'S', true);
      } else if (f.t === 'linea') {
        doc.line(x + f.p[0] * lato, y + f.p[1] * lato, x + f.p[2] * lato, y + f.p[3] * lato);
      } else if (f.t === 'testo') {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(lato * 0.8 / 0.3528); // mm → punti tipografici
        doc.text(f.s, x + lato / 2, y + lato * 0.54, { align: 'center', baseline: 'middle' });
      }
    });
    if (doc.setLineCap) doc.setLineCap('butt');
    if (doc.setLineJoin) doc.setLineJoin('miter');
  }

  var api = {
    SIMBOLI: SIMBOLI,
    quanti: SIMBOLI.length,
    disegnaCanvas: disegnaCanvas,
    disegnaPdf: disegnaPdf
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SPXSymbols = api;
})(typeof self !== 'undefined' ? self : this);
