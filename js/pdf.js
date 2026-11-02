/*
 * pdf.js — impaginazione e creazione del PDF (copertina, legenda, schema).
 *
 * calcolaPagine() è una funzione pura (testabile in Node);
 * creaPdf() riceve il costruttore jsPDF e il risultato della conversione.
 */
(function (root) {
  'use strict';

  var Symbols = (typeof module !== 'undefined' && module.exports)
    ? require('./symbols.js')
    : root.SPXSymbols;
  var Color = (typeof module !== 'undefined' && module.exports)
    ? require('./color.js')
    : root.SPXColor;

  // ── Parametri modificabili ──────────────────────────────────────────
  // Stima approssimativa: una matassa DMC (8 m, 6 capi) ricama circa
  // 1800 punti croce su Aida 14 usando 2 capi. Cambia questo valore se
  // la tua esperienza è diversa.
  var PUNTI_PER_MATASSA = 1800;

  var FOGLI = {
    A4: { nome: 'A4', w: 210, h: 297, jspdf: 'a4' },
    A3: { nome: 'A3', w: 297, h: 420, jspdf: 'a3' },
    Letter: { nome: 'Letter', w: 215.9, h: 279.4, jspdf: 'letter' }
  };
  var MARGINE = 10;        // margine del foglio, mm
  var INTESTAZIONE = 7;    // spazio per l'intestazione della pagina, mm
  var FASCIA = 5;          // fascia per numeri e frecce attorno alla griglia, mm
  var SOVRAPPOSIZIONE = 3; // righe/colonne ripetute dalla pagina precedente

  /** Divide `totale` punti in segmenti che stanno in `disponibili` caselle. */
  function dividi(totale, disponibili, sovrapp) {
    if (totale <= disponibili) return [{ inizio: 0, fine: totale }];
    var utile = disponibili - sovrapp;
    var n = Math.ceil(totale / utile);
    var passo = Math.ceil(totale / n);
    var segmenti = [];
    for (var i = 0; i * passo < totale; i++) {
      segmenti.push({ inizio: i * passo, fine: Math.min(totale, (i + 1) * passo) });
    }
    return segmenti;
  }

  /**
   * Calcola come lo schema si divide sulle pagine.
   * opz: { formato: 'A4'|'A3'|'Letter', orientamento: 'verticale'|'orizzontale', lato: mm }
   */
  function calcolaPagine(W, H, opz) {
    var foglio = FOGLI[opz.formato] || FOGLI.A4;
    var orizz = opz.orientamento === 'orizzontale';
    var pagW = orizz ? foglio.h : foglio.w;
    var pagH = orizz ? foglio.w : foglio.h;
    var lato = Number(opz.lato) || 3;
    var areaW = pagW - 2 * MARGINE - 2 * FASCIA;
    var areaH = pagH - 2 * MARGINE - INTESTAZIONE - 2 * FASCIA;
    // tolleranza per errori di virgola mobile (es. 180 / 3 = 59,9999)
    var colonne = Math.floor(areaW / lato + 1e-9);
    var righe = Math.floor(areaH / lato + 1e-9);
    var segX = dividi(W, colonne, SOVRAPPOSIZIONE);
    var segY = dividi(H, righe, SOVRAPPOSIZIONE);
    var pagine = [];
    segY.forEach(function (sy, iy) {
      segX.forEach(function (sx, ix) {
        pagine.push({
          numero: pagine.length + 1,
          ix: ix, iy: iy,
          col0: sx.inizio, col1: sx.fine,
          riga0: sy.inizio, riga1: sy.fine,
          // prima colonna/riga mostrata, comprese quelle ripetute in grigio
          colMostrata0: ix > 0 ? Math.max(0, sx.inizio - SOVRAPPOSIZIONE) : sx.inizio,
          rigaMostrata0: iy > 0 ? Math.max(0, sy.inizio - SOVRAPPOSIZIONE) : sy.inizio
        });
      });
    });
    return {
      formato: foglio,
      orizzontale: orizz,
      pagW: pagW, pagH: pagH, lato: lato,
      colonnePerPagina: colonne, righePerPagina: righe,
      pagineX: segX.length, pagineY: segY.length,
      pagine: pagine
    };
  }

  function matasse(punti) {
    return Math.max(1, Math.ceil(punti / PUNTI_PER_MATASSA));
  }

  function numero(n) {
    // separatore delle migliaia all'italiana, senza dipendere da Intl
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  function decimale(n) {
    return n.toFixed(1).replace('.', ',');
  }

  /** Colore del simbolo leggibile sopra un dato colore di fondo. */
  function coloreSimbolo(c) {
    return Color.luminanza(c.r, c.g, c.b) > 0.22 ? [0, 0, 0] : [255, 255, 255];
  }

  /** Mescola un colore verso il bianco (per le caselle ripetute in grigio). */
  function sbiadisci(r, g, b, quanto) {
    return [
      Math.round(r + (255 - r) * quanto),
      Math.round(g + (255 - g) * quanto),
      Math.round(b + (255 - b) * quanto)
    ];
  }

  // ── Copertina ───────────────────────────────────────────────────────
  function copertina(doc, ris, lay, opz) {
    var W = ris.larghezza, H = ris.altezza;
    var pw = lay.pagW;
    var x0 = MARGINE + 5, larg = pw - 2 * (MARGINE + 5);
    var y = MARGINE + 12;

    doc.setTextColor(40, 40, 40);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(24);
    doc.text('Pixel e Croce', x0, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    doc.setTextColor(110, 110, 110);
    doc.text('Schema per punto croce' + (opz.titolo ? ' - ' + opz.titolo : ''), x0, y + 7);
    y += 14;

    // anteprima a colori del ricamo finito
    var maxH = (lay.pagH - y - MARGINE) * 0.5;
    var scala = Math.min(larg / W, maxH / H);
    var iw = W * scala, ih = H * scala;
    var ix = x0 + (larg - iw) / 2;
    if (opz.immagine) {
      doc.addImage(opz.immagine, /^data:image\/png/.test(opz.immagine) ? 'PNG' : 'JPEG', ix, y, iw, ih, undefined, 'NONE');
    }
    doc.setDrawColor(120, 120, 120);
    doc.setLineWidth(0.2);
    doc.rect(ix, y, iw, ih, 'S');
    y += ih + 10;

    // dati del ricamo
    var totale = W * H;
    var righe = [
      ['Dimensioni', W + ' × ' + H + ' punti'],
      ['Misura del ricamo', decimale(W / opz.aida * 2.54) + ' × ' + decimale(H / opz.aida * 2.54) + ' cm su tela Aida ' + opz.aida],
      ['Colori', String(ris.colori.length) + ' fili DMC'],
      ['Punti totali', numero(totale)],
      ['Stampa', lay.formato.nome + ' ' + (lay.orizzontale ? 'orizzontale' : 'verticale') +
        ', caselle da ' + decimale(lay.lato) + ' mm, ' + (opz.modo === 'bn' ? 'bianco e nero' : 'a colori')],
      ['Pagine dello schema', String(lay.pagine.length)]
    ];
    var yInfo = y;
    doc.setFontSize(10.5);
    righe.forEach(function (r) {
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(60, 60, 60);
      doc.text(r[0], x0, y);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(30, 30, 30);
      doc.text(r[1], x0 + 45, y);
      y += 6;
    });
    y += 4;

    // mappa delle pagine: sotto i dati se c'è spazio, altrimenti (foglio
    // orizzontale) a destra dei dati
    var fondo = lay.pagH - MARGINE - 14;
    var mx, my, maxW, maxHm;
    if (fondo - y > 25) {
      mx = x0; my = y; maxW = larg * 0.6; maxHm = fondo - y - 6;
    } else {
      mx = x0 + 125; my = yInfo - 4; maxW = larg - 125; maxHm = fondo - my - 6;
    }
    if (maxW > 20 && maxHm > 15) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor(60, 60, 60);
      doc.text('Mappa delle pagine', mx, my);
      my += 4;
      var ms = Math.min(maxW / W, maxHm / H);
      var mw = W * ms, mh = H * ms;
      doc.setFillColor(248, 246, 242);
      doc.setDrawColor(90, 90, 90);
      doc.setLineWidth(0.3);
      doc.rect(mx, my, mw, mh, 'FD');
      doc.setLineWidth(0.2);
      lay.pagine.forEach(function (p) {
        var px = mx + p.col0 * ms, py = my + p.riga0 * ms;
        var pw2 = (p.col1 - p.col0) * ms, ph2 = (p.riga1 - p.riga0) * ms;
        doc.setDrawColor(90, 90, 90);
        doc.rect(px, py, pw2, ph2, 'S');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(Math.max(6, Math.min(14, Math.min(pw2, ph2) * 1.2)));
        doc.setTextColor(80, 80, 80);
        doc.text(String(p.numero), px + pw2 / 2, py + ph2 / 2, { align: 'center', baseline: 'middle' });
      });
    }

    // nota in fondo alla pagina
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(doc.splitTextToSize(
      'I colori stampati o a schermo non corrispondono mai esattamente ai fili veri: i valori dei colori DMC sono ' +
      'approssimazioni. Conviene confrontare le matasse dal vivo. Le frecce ai lati dello schema indicano il centro del disegno.',
      larg), x0, lay.pagH - MARGINE - 6);
  }

  // ── Legenda ─────────────────────────────────────────────────────────
  function legenda(doc, ris, lay, opz) {
    var x0 = MARGINE + 5, larg = lay.pagW - 2 * (MARGINE + 5);
    var colonne = [
      { titolo: 'Simbolo', x: x0, w: 18 },
      { titolo: 'Codice DMC', x: x0 + 18, w: 26 },
      { titolo: 'Nome colore', x: x0 + 44, w: larg - 44 - 50 },
      { titolo: 'Punti', x: x0 + larg - 50, w: 22, destra: true },
      { titolo: 'Matasse (stima)', x: x0 + larg - 28, w: 28, destra: true }
    ];
    var altRiga = 7;
    var y;

    function intestazione(cont) {
      y = MARGINE + 10;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.setTextColor(40, 40, 40);
      doc.text('Legenda' + (cont ? ' (continua)' : ''), x0, y);
      y += 8;
      doc.setFontSize(9);
      doc.setTextColor(90, 90, 90);
      colonne.forEach(function (c) {
        doc.text(c.titolo, c.destra ? c.x + c.w : c.x, y, { align: c.destra ? 'right' : 'left' });
      });
      y += 2;
      doc.setDrawColor(60, 60, 60);
      doc.setLineWidth(0.3);
      doc.line(x0, y, x0 + larg, y);
      y += 1;
    }

    intestazione(false);
    var totMatasse = 0;
    ris.colori.forEach(function (c, i) {
      if (y + altRiga > lay.pagH - MARGINE - 12) {
        doc.addPage();
        intestazione(true);
      }
      var lato = 5;
      var sx = x0 + 2, sy = y + (altRiga - lato) / 2;
      if (opz.modo === 'bn') {
        doc.setDrawColor(150, 150, 150);
        doc.setLineWidth(0.15);
        doc.rect(sx, sy, lato, lato, 'S');
        Symbols.disegnaPdf(doc, i, sx, sy, lato, [0, 0, 0]);
      } else {
        doc.setFillColor(c.r, c.g, c.b);
        doc.setDrawColor(150, 150, 150);
        doc.setLineWidth(0.15);
        doc.rect(sx, sy, lato, lato, 'FD');
        Symbols.disegnaPdf(doc, i, sx, sy, lato, coloreSimbolo(c));
      }
      // campione di colore accanto al simbolo (utile anche in bianco e nero a schermo)
      if (opz.modo !== 'bn') {
        doc.setFillColor(c.r, c.g, c.b);
        doc.rect(sx + lato + 2, sy + 1, 6, lato - 2, 'F');
      }
      var m = matasse(c.punti);
      totMatasse += m;
      var ty = y + altRiga / 2;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(20, 20, 20);
      doc.text(String(c.code), colonne[1].x, ty, { baseline: 'middle' });
      doc.setFont('helvetica', 'normal');
      doc.text(doc.splitTextToSize(c.name, colonne[2].w - 2)[0], colonne[2].x, ty, { baseline: 'middle' });
      doc.text(numero(c.punti), colonne[3].x + colonne[3].w, ty, { align: 'right', baseline: 'middle' });
      doc.text(String(m), colonne[4].x + colonne[4].w, ty, { align: 'right', baseline: 'middle' });
      y += altRiga;
      doc.setDrawColor(215, 215, 215);
      doc.setLineWidth(0.1);
      doc.line(x0, y, x0 + larg, y);
    });

    // totale
    if (y + 20 > lay.pagH - MARGINE) { doc.addPage(); y = MARGINE + 10; }
    y += 6;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Totale: ' + ris.colori.length + ' colori', x0, y);
    doc.text(numero(ris.larghezza * ris.altezza), colonne[3].x + colonne[3].w, y, { align: 'right' });
    doc.text(String(totMatasse), colonne[4].x + colonne[4].w, y, { align: 'right' });
    y += 7;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(110, 110, 110);
    doc.text(doc.splitTextToSize(
      'Stima delle matasse: circa ' + numero(PUNTI_PER_MATASSA) + ' punti per matassa (2 capi su Aida 14). ' +
      'Il consumo reale dipende da tela, numero di capi e mano di chi ricama: meglio comprarne una in più.',
      larg), x0, y);
  }

  // ── Pagina di schema ────────────────────────────────────────────────
  function paginaSchema(doc, ris, lay, opz, p) {
    var W = ris.larghezza, H = ris.altezza, griglia = ris.griglia;
    var lato = lay.lato;
    var c0 = p.colMostrata0, c1 = p.col1, r0 = p.rigaMostrata0, r1 = p.riga1;
    var nc = c1 - c0, nr = r1 - r0;
    var areaW = lay.pagW - 2 * MARGINE - 2 * FASCIA;
    var gx = MARGINE + FASCIA + (areaW - nc * lato) / 2;
    var gy = MARGINE + INTESTAZIONE + FASCIA;
    var bn = opz.modo === 'bn';

    // intestazione
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(40, 40, 40);
    doc.text('Pagina ' + p.numero + ' di ' + lay.pagine.length + ' — colonne ' + (p.col0 + 1) + '–' + p.col1 +
      ', righe ' + (p.riga0 + 1) + '–' + p.riga1, MARGINE, MARGINE + 4);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(130, 130, 130);
    doc.text('Pixel e Croce', lay.pagW - MARGINE, MARGINE + 4, { align: 'right' });

    // caselle e simboli
    var coloriSimbolo = ris.colori.map(coloreSimbolo);
    for (var r = r0; r < r1; r++) {
      for (var c = c0; c < c1; c++) {
        var idx = griglia[r * W + c];
        var col = ris.colori[idx];
        var grigio = c < p.col0 || r < p.riga0;
        var x = gx + (c - c0) * lato, y = gy + (r - r0) * lato;
        var cs;
        if (bn) {
          cs = grigio ? [175, 175, 175] : [0, 0, 0];
        } else {
          var f = grigio ? sbiadisci(col.r, col.g, col.b, 0.7) : [col.r, col.g, col.b];
          doc.setFillColor(f[0], f[1], f[2]);
          doc.rect(x, y, lato, lato, 'F');
          cs = grigio ? [150, 150, 150] : coloriSimbolo[idx];
        }
        Symbols.disegnaPdf(doc, idx, x + lato * 0.08, y + lato * 0.08, lato * 0.84, cs);
      }
    }

    // linee sottili tra ogni punto
    doc.setDrawColor(150, 150, 150);
    doc.setLineWidth(0.08);
    var i;
    for (i = 0; i <= nc; i++) doc.line(gx + i * lato, gy, gx + i * lato, gy + nr * lato);
    for (i = 0; i <= nr; i++) doc.line(gx, gy + i * lato, gx + nc * lato, gy + i * lato);

    // linee spesse ogni 10 punti e sui bordi del disegno
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.35);
    for (var ca = c0; ca <= c1; ca++) {
      if (ca % 10 === 0 || ca === W) doc.line(gx + (ca - c0) * lato, gy, gx + (ca - c0) * lato, gy + nr * lato);
    }
    for (var ra = r0; ra <= r1; ra++) {
      if (ra % 10 === 0 || ra === H) doc.line(gx, gy + (ra - r0) * lato, gx + nc * lato, gy + (ra - r0) * lato);
    }
    // bordo esterno della pagina di griglia
    doc.setLineWidth(0.35);
    doc.rect(gx, gy, nc * lato, nr * lato, 'S');

    // confine tratteggiato tra parte ripetuta e parte nuova
    if (doc.setLineDashPattern) {
      doc.setDrawColor(90, 90, 90);
      doc.setLineWidth(0.25);
      doc.setLineDashPattern([0.8, 0.6], 0);
      if (p.col0 > c0) doc.line(gx + (p.col0 - c0) * lato, gy - 1, gx + (p.col0 - c0) * lato, gy + nr * lato + 1);
      if (p.riga0 > r0) doc.line(gx - 1, gy + (p.riga0 - r0) * lato, gx + nc * lato + 1, gy + (p.riga0 - r0) * lato);
      doc.setLineDashPattern([], 0);
    }

    // numeri di riga e colonna ogni 10 punti, su tutti i lati
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(60, 60, 60);
    var dist = 3.3;
    for (ca = c0; ca <= c1; ca++) {
      if (ca > 0 && ca % 10 === 0) {
        var xn = gx + (ca - c0) * lato;
        doc.text(String(ca), xn, gy - dist, { align: 'center', baseline: 'middle' });
        doc.text(String(ca), xn, gy + nr * lato + dist, { align: 'center', baseline: 'middle' });
      }
    }
    for (ra = r0; ra <= r1; ra++) {
      if (ra > 0 && ra % 10 === 0) {
        var yn = gy + (ra - r0) * lato;
        doc.text(String(ra), gx - dist, yn, { align: 'center', baseline: 'middle' });
        doc.text(String(ra), gx + nc * lato + dist, yn, { align: 'center', baseline: 'middle' });
      }
    }

    // frecce al centro di ogni lato del disegno
    doc.setFillColor(200, 40, 60);
    var a = 1.6; // dimensione freccia, mm
    var centroC = W / 2, centroR = H / 2;
    if (centroC >= c0 && centroC <= c1) {
      var xc = gx + (centroC - c0) * lato;
      doc.triangle(xc - a / 2, gy - a, xc + a / 2, gy - a, xc, gy, 'F');
      doc.triangle(xc - a / 2, gy + nr * lato + a, xc + a / 2, gy + nr * lato + a, xc, gy + nr * lato, 'F');
    }
    if (centroR >= r0 && centroR <= r1) {
      var yc = gy + (centroR - r0) * lato;
      doc.triangle(gx - a, yc - a / 2, gx - a, yc + a / 2, gx, yc, 'F');
      doc.triangle(gx + nc * lato + a, yc - a / 2, gx + nc * lato + a, yc + a / 2, gx + nc * lato, yc, 'F');
    }

    // piè di pagina
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(140, 140, 140);
    var nota = (p.col0 > c0 || p.riga0 > r0)
      ? 'In grigio chiaro: righe e colonne ripetute dalla pagina vicina, per non perdere il segno.'
      : 'Ogni casella è un punto croce. Linea spessa ogni 10 punti.';
    doc.text(nota, MARGINE, lay.pagH - MARGINE + 4);
  }

  /**
   * Crea il PDF completo.
   * JsPDF: costruttore jsPDF
   * ris:   risultato di SPXQuantize.converti
   * opz:   { formato, orientamento, lato, modo: 'colori'|'bn', aida, immagine (dataURL JPEG o PNG), titolo }
   */
  function creaPdf(JsPDF, ris, opz) {
    var lay = calcolaPagine(ris.larghezza, ris.altezza, opz);
    var doc = new JsPDF({
      unit: 'mm',
      format: lay.formato.jspdf,
      orientation: lay.orizzontale ? 'landscape' : 'portrait',
      compress: true
    });
    doc.setProperties({ title: 'Schema punto croce - Pixel e Croce', creator: 'Pixel e Croce' });
    copertina(doc, ris, lay, opz);
    doc.addPage();
    legenda(doc, ris, lay, opz);
    lay.pagine.forEach(function (p) {
      doc.addPage();
      paginaSchema(doc, ris, lay, opz, p);
    });
    return doc;
  }

  var api = {
    PUNTI_PER_MATASSA: PUNTI_PER_MATASSA,
    FOGLI: FOGLI,
    SOVRAPPOSIZIONE: SOVRAPPOSIZIONE,
    calcolaPagine: calcolaPagine,
    matasse: matasse,
    creaPdf: creaPdf
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SPXPdf = api;
})(typeof self !== 'undefined' ? self : this);
