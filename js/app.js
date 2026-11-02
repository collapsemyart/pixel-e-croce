/*
 * app.js — gestione dell'interfaccia e dei passaggi.
 *
 * Collega i moduli: SPXFabric (stoffa), SPXQuantize (conversione, nel worker),
 * SPXSymbols (simboli), SPXPdf (PDF), Cropper.js (ritaglio), jsPDF (PDF).
 */
(function () {
  'use strict';

  // ── Parametri ───────────────────────────────────────────────────────
  var LATO_MAX_FOTO = 3000;     // la foto viene ridotta a questo lato massimo (memoria dei telefoni)
  var PIXEL_MAX_RITAGLIO = 4e6; // pixel massimi inviati alla conversione
  var PIXEL_MAX_CANVAS = 12e6;  // limite di sicurezza per il canvas di anteprima (Safari iPhone)
  var ATTESA_MS = 250;          // attesa prima di ricalcolare dopo una modifica

  function $(id) { return document.getElementById(id); }

  var el = {
    zonaCarica: $('zona-carica'), file: $('file-foto'), msgFoto: $('msg-foto'),
    cmL: $('cm-larghezza'), cmA: $('cm-altezza'), cmM: $('cm-margine'),
    ptL: $('pt-larghezza'), ptA: $('pt-altezza'), aida: $('aida'),
    campiCm: $('campi-cm'), campiPunti: $('campi-punti'),
    riepilogoStoffa: $('riepilogo-stoffa'), msgStoffa: $('msg-stoffa'),
    ritaglio: $('ritaglio'), ritaglioVuoto: $('ritaglio-vuoto'), imgRitaglio: $('img-ritaglio'),
    maxColori: $('max-colori'), valColori: $('val-colori'), pulizia: $('pulizia'),
    anteprima: $('anteprima'), anteprimaVuota: $('anteprima-vuota'), statistiche: $('statistiche'),
    zoom: $('zoom'), zoomAdatta: $('zoom-adatta'), mostraSimboli: $('mostra-simboli'),
    telaAnteprima: $('tela-anteprima'), canvas: $('canvas-anteprima'), inCorso: $('in-corso'), legenda: $('legenda'),
    formato: $('formato'), lato: $('lato'), valLato: $('val-lato'), riepilogoFoglio: $('riepilogo-foglio'),
    scarica: $('scarica'), msgPdf: $('msg-pdf')
  };

  var stato = {
    palette: null,       // fili DMC
    sorgente: null,      // canvas con la foto (orientata e ridotta)
    cropper: null,
    ricamo: null,        // { larghezza, altezza, cmLarghezza, cmAltezza, errore }
    risultato: null,     // ultima conversione
    idLavoro: 0,
    zoomManuale: false,
    urlPdf: null
  };

  // ── Utilità ─────────────────────────────────────────────────────────
  function numero(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  function decimale(n, cifre) { return n.toFixed(cifre === undefined ? 1 : cifre).replace('.', ','); }
  function radio(nome) { return document.querySelector('input[name="' + nome + '"]:checked').value; }
  function attesa(fn, ms) {
    var t = null;
    return function () { clearTimeout(t); t = setTimeout(fn, ms); };
  }
  // ricalcolo ritardato: più modifiche ravvicinate → una sola conversione
  var aggiornaDopo = attesa(function () { aggiorna(); }, ATTESA_MS);

  function messaggio(nodo, testo, errore) {
    nodo.textContent = testo || '';
    nodo.classList.toggle('errore', !!errore);
  }

  // ── Palette DMC ─────────────────────────────────────────────────────
  // Su un sito pubblicato si legge data/dmc.json; aprendo il file dal disco
  // (file://) il browser blocca fetch(), quindi si ripiega su data/dmc.js.
  function caricaPalette() {
    return fetch('data/dmc.json')
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .catch(function () {
        return new Promise(function (ok, ko) {
          var s = document.createElement('script');
          s.src = 'data/dmc.js';
          s.onload = function () { window.SPX_DMC ? ok(window.SPX_DMC) : ko(new Error('palette vuota')); };
          s.onerror = function () { ko(new Error('palette non trovata')); };
          document.head.appendChild(s);
        });
      })
      .then(function (p) { stato.palette = p; });
  }

  // ── Worker (con ripiego sul thread principale) ──────────────────────
  var worker = null;
  try {
    worker = new Worker('js/worker.js');
    worker.onmessage = function (e) { finito(e.data); };
    worker.onerror = function (e) {
      // es. pagina aperta da file:// in alcuni browser: si lavora senza worker
      if (e && e.preventDefault) e.preventDefault();
      worker = null;
      if (stato.ultimaRichiesta) eseguiSenzaWorker(stato.ultimaRichiesta);
    };
  } catch (err) {
    worker = null;
  }

  function eseguiSenzaWorker(richiesta) {
    setTimeout(function () {
      if (richiesta.id !== stato.idLavoro) return;
      try {
        finito({ id: richiesta.id, risultato: SPXQuantize.converti(richiesta) });
      } catch (err) {
        finito({ id: richiesta.id, errore: String(err && err.message || err) });
      }
    }, 30);
  }

  // ── 1. Foto ─────────────────────────────────────────────────────────
  el.file.addEventListener('change', function () {
    if (el.file.files && el.file.files[0]) apriFoto(el.file.files[0]);
  });
  ['dragenter', 'dragover'].forEach(function (t) {
    el.zonaCarica.addEventListener(t, function (e) { e.preventDefault(); el.zonaCarica.classList.add('sopra'); });
  });
  ['dragleave', 'drop'].forEach(function (t) {
    el.zonaCarica.addEventListener(t, function (e) { e.preventDefault(); el.zonaCarica.classList.remove('sopra'); });
  });
  el.zonaCarica.addEventListener('drop', function (e) {
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) apriFoto(f);
  });

  function apriFoto(file) {
    messaggio(el.msgFoto, 'Apro la foto…');
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      // il browser applica già l'orientamento EXIF: si ridisegna su un canvas
      // per avere una foto "dritta" e di dimensioni gestibili
      var w = img.naturalWidth, h = img.naturalHeight;
      var s = Math.min(1, LATO_MAX_FOTO / Math.max(w, h));
      var c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(w * s));
      c.height = Math.max(1, Math.round(h * s));
      var ctx = c.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      stato.sorgente = c;
      mostraMiniatura(c, file.name);
      messaggio(el.msgFoto, 'Foto caricata: ' + w + ' × ' + h + ' pixel.');
      avviaRitaglio(c);
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      var heic = /\.hei[cf]$/i.test(file.name) || /hei[cf]/i.test(file.type);
      messaggio(el.msgFoto, heic
        ? 'Questo browser non riesce a leggere le foto HEIC. Prova con Safari, oppure converti la foto in JPG.'
        : 'Non riesco ad aprire questo file. Prova con una foto JPG o PNG.', true);
    };
    img.src = url;
  }

  function mostraMiniatura(c, nome) {
    var t = document.createElement('canvas');
    var s = 112 / Math.max(c.width, c.height);
    t.width = Math.round(c.width * s); t.height = Math.round(c.height * s);
    t.getContext('2d').drawImage(c, 0, 0, t.width, t.height);
    t.className = 'miniatura';
    el.zonaCarica.classList.add('caricata');
    var vecchia = el.zonaCarica.querySelector('.miniatura');
    if (vecchia) vecchia.remove();
    var icona = el.zonaCarica.querySelector('svg');
    if (icona) icona.style.display = 'none';
    el.zonaCarica.insertBefore(t, el.zonaCarica.firstChild.nextSibling);
    el.zonaCarica.querySelector('.carica__testo').innerHTML =
      '<strong>Cambia foto</strong> <span class="nome-file"></span>';
    el.zonaCarica.querySelector('.nome-file').textContent = nome || '';
  }

  // ── 3. Ritaglio ─────────────────────────────────────────────────────
  function rapporto() {
    var r = stato.ricamo;
    return r && r.larghezza > 0 && r.altezza > 0 ? r.larghezza / r.altezza : 1;
  }

  function avviaRitaglio(c) {
    if (stato.cropper) { stato.cropper.destroy(); stato.cropper = null; }
    el.ritaglioVuoto.hidden = true;
    el.ritaglio.hidden = false;
    c.toBlob(function (blob) {
      if (el.imgRitaglio.dataset.url) URL.revokeObjectURL(el.imgRitaglio.dataset.url);
      var url = URL.createObjectURL(blob);
      el.imgRitaglio.dataset.url = url;
      el.imgRitaglio.onload = function () {
        el.imgRitaglio.onload = null;
        stato.cropper = new Cropper(el.imgRitaglio, {
          viewMode: 1,
          aspectRatio: rapporto(),
          autoCropArea: 1,
          dragMode: 'none',
          movable: false, zoomable: false, rotatable: false, scalable: false,
          guides: true, center: true, background: false,
          checkOrientation: false,
          toggleDragModeOnDblclick: false,
          ready: function () { aggiorna(); },
          crop: aggiornaDopo
        });
      };
      el.imgRitaglio.src = url;
    }, 'image/jpeg', 0.92);
  }

  /** Area ritagliata nelle coordinate della foto sorgente. */
  function areaRitaglio() {
    var c = stato.sorgente;
    if (stato.cropper) {
      var d = stato.cropper.getData(true);
      if (d.width > 0 && d.height > 0) {
        var x = Math.max(0, d.x), y = Math.max(0, d.y);
        return { x: x, y: y, w: Math.min(d.width, c.width - x), h: Math.min(d.height, c.height - y) };
      }
    }
    // senza ritaglio: area centrale con le proporzioni della stoffa
    var r = rapporto();
    var w = c.width, h = c.height;
    if (w / h > r) w = Math.round(h * r); else h = Math.round(w / r);
    return { x: Math.round((c.width - w) / 2), y: Math.round((c.height - h) / 2), w: w, h: h };
  }

  // ── 2. Stoffa ───────────────────────────────────────────────────────
  function leggiStoffa() {
    var modo = radio('modo-stoffa');
    el.campiCm.hidden = modo !== 'cm';
    el.campiPunti.hidden = modo !== 'punti';
    var aida = Number(el.aida.value);
    var r = SPXFabric.calcolaRicamo(modo === 'cm'
      ? { modo: 'cm', larghezza: el.cmL.value, altezza: el.cmA.value, aida: aida, margine: el.cmM.value }
      : { modo: 'punti', larghezza: el.ptL.value, altezza: el.ptA.value, aida: aida });
    stato.ricamo = r;
    stato.aida = aida;
    if (r.larghezza > 0 && r.altezza > 0) {
      el.riepilogoStoffa.innerHTML = 'Ricamo: <strong>' + r.larghezza + ' × ' + r.altezza + ' punti</strong> — ' +
        decimale(r.cmLarghezza) + ' × ' + decimale(r.cmAltezza) + ' cm su tela Aida ' + aida;
    } else {
      el.riepilogoStoffa.textContent = 'Ricamo: —';
    }
    messaggio(el.msgStoffa, r.errore || '', !!r.errore);
    [el.cmL, el.cmA, el.cmM, el.ptL, el.ptA].forEach(function (i) { i.setAttribute('aria-invalid', r.errore ? 'true' : 'false'); });
    return r;
  }

  function stoffaCambiata() {
    var prima = rapporto();
    leggiStoffa();
    if (stato.cropper && Math.abs(rapporto() - prima) > 1e-9 && !stato.ricamo.errore) {
      stato.cropper.setAspectRatio(rapporto()); // fa partire anche l'evento "crop"
    }
    aggiornaFoglio();
    aggiornaDopo();
  }

  document.querySelectorAll('input[name="modo-stoffa"]').forEach(function (r) {
    r.addEventListener('change', function () {
      // passando da cm a punti si parte dalla misura appena calcolata
      if (radio('modo-stoffa') === 'punti' && stato.ricamo && stato.ricamo.larghezza > 0 && !stato.ricamo.errore) {
        el.ptL.value = stato.ricamo.larghezza;
        el.ptA.value = stato.ricamo.altezza;
      }
      stoffaCambiata();
    });
  });
  [el.cmL, el.cmA, el.cmM, el.ptL, el.ptA, el.aida].forEach(function (i) {
    i.addEventListener('input', stoffaCambiata);
    i.addEventListener('change', stoffaCambiata);
  });

  // ── 4. Colori ───────────────────────────────────────────────────────
  el.maxColori.addEventListener('input', function () {
    el.valColori.textContent = el.maxColori.value;
    aggiornaDopo();
  });
  el.pulizia.addEventListener('change', aggiornaDopo);

  // ── Conversione ─────────────────────────────────────────────────────

  function aggiorna() {
    if (!stato.sorgente || !stato.palette) return;
    var r = stato.ricamo || leggiStoffa();
    if (r.errore) return;
    var a = areaRitaglio();
    if (!(a.w > 0 && a.h > 0)) return;

    // porta l'area ritagliata su un canvas di dimensioni ragionevoli
    var s = Math.min(1, Math.sqrt(PIXEL_MAX_RITAGLIO / (a.w * a.h)));
    var cw = Math.max(1, Math.round(a.w * s)), ch = Math.max(1, Math.round(a.h * s));
    var c = document.createElement('canvas');
    c.width = cw; c.height = ch;
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, cw, ch);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(stato.sorgente, a.x, a.y, a.w, a.h, 0, 0, cw, ch);
    var dati = ctx.getImageData(0, 0, cw, ch);

    var richiesta = {
      id: ++stato.idLavoro,
      pixels: dati.data, srcW: cw, srcH: ch,
      larghezza: r.larghezza, altezza: r.altezza,
      maxColori: Number(el.maxColori.value),
      pulizia: el.pulizia.checked,
      palette: stato.palette
    };
    stato.ultimaRichiesta = richiesta;
    el.inCorso.hidden = false;
    el.anteprimaVuota.hidden = true;
    el.anteprima.hidden = false;
    if (worker) {
      // niente trasferimento del buffer: serve ancora per il ripiego senza worker
      worker.postMessage(richiesta);
    } else {
      eseguiSenzaWorker(richiesta);
    }
  }

  function finito(msg) {
    if (msg.id !== stato.idLavoro) return; // risultato superato da una modifica più recente
    el.inCorso.hidden = true;
    stato.ultimaRichiesta = null;
    if (msg.errore) {
      messaggio(el.msgPdf, 'Errore durante la conversione: ' + msg.errore, true);
      return;
    }
    stato.risultato = msg.risultato;
    disegnaAnteprima();
    disegnaLegenda();
    aggiornaFoglio();
    el.scarica.disabled = false;
    messaggio(el.msgPdf, '');
  }

  // ── 5. Anteprima ────────────────────────────────────────────────────
  function zoomAdatto() {
    var r = stato.risultato;
    var larg = el.telaAnteprima.clientWidth - 2 || 300;
    var altMax = Math.max(240, window.innerHeight * 0.65);
    // a scatti di 0,25 così l'anteprima riempie la larghezza disponibile
    return Math.max(0.5, Math.min(30, Math.floor(Math.min(larg / r.larghezza, altMax / r.altezza) * 4) / 4));
  }

  function disegnaAnteprima() {
    var r = stato.risultato;
    if (!r) return;
    if (!stato.zoomManuale) el.zoom.value = zoomAdatto();
    var zoom = Number(el.zoom.value);
    var W = r.larghezza, H = r.altezza;

    // risoluzione interna del canvas: limitata per non superare i limiti dei telefoni
    var dpr = window.devicePixelRatio || 1;
    var z = Math.max(1, Math.round(Math.min(zoom * dpr, Math.sqrt(PIXEL_MAX_CANVAS / (W * H)))));
    var cv = el.canvas;
    cv.width = W * z; cv.height = H * z;
    cv.style.width = (W * zoom) + 'px';
    cv.style.height = (H * zoom) + 'px';
    var ctx = cv.getContext('2d');

    // un pixel per punto, poi ingrandito senza sfocature
    var piccolo = document.createElement('canvas');
    piccolo.width = W; piccolo.height = H;
    var pctx = piccolo.getContext('2d');
    var img = pctx.createImageData(W, H);
    for (var i = 0; i < W * H; i++) {
      var col = r.colori[r.griglia[i]];
      img.data[i * 4] = col.r; img.data[i * 4 + 1] = col.g; img.data[i * 4 + 2] = col.b; img.data[i * 4 + 3] = 255;
    }
    pctx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(piccolo, 0, 0, W * z, H * z);
    stato.immagineCopertina = null;

    // griglia quando i punti sono abbastanza grandi
    if (zoom >= 5) {
      ctx.lineWidth = 1;
      for (var x = 0; x <= W; x++) {
        ctx.strokeStyle = x % 10 === 0 ? 'rgba(0,0,0,.55)' : 'rgba(0,0,0,.14)';
        ctx.beginPath(); ctx.moveTo(x * z + 0.5, 0); ctx.lineTo(x * z + 0.5, H * z); ctx.stroke();
      }
      for (var y = 0; y <= H; y++) {
        ctx.strokeStyle = y % 10 === 0 ? 'rgba(0,0,0,.55)' : 'rgba(0,0,0,.14)';
        ctx.beginPath(); ctx.moveTo(0, y * z + 0.5); ctx.lineTo(W * z, y * z + 0.5); ctx.stroke();
      }
    }
    // simboli, se richiesti e leggibili
    if (el.mostraSimboli.checked && zoom >= 10) {
      var neri = r.colori.map(function (c) { return SPXColor.luminanza(c.r, c.g, c.b) > 0.22 ? '#000' : '#fff'; });
      for (var yy = 0; yy < H; yy++) {
        for (var xx = 0; xx < W; xx++) {
          var idx = r.griglia[yy * W + xx];
          SPXSymbols.disegnaCanvas(ctx, idx, xx * z + z * 0.1, yy * z + z * 0.1, z * 0.8, neri[idx]);
        }
      }
    }
    el.mostraSimboli.parentNode.title = zoom < 10 ? 'Aumenta l\'ingrandimento per vedere i simboli' : '';

    var tot = W * H;
    el.statistiche.innerHTML =
      '<span><strong>' + W + ' × ' + H + '</strong> punti</span>' +
      '<span><strong>' + r.colori.length + '</strong> ' + (r.colori.length === 1 ? 'colore' : 'colori') + ' DMC</span>' +
      '<span><strong>' + numero(tot) + '</strong> punti totali</span>' +
      '<span><strong>' + decimale(SPXFabric.puntiInCm(W, stato.aida)) + ' × ' + decimale(SPXFabric.puntiInCm(H, stato.aida)) + '</strong> cm</span>';
  }

  function disegnaLegenda() {
    var r = stato.risultato;
    el.legenda.innerHTML = '';
    var frammento = document.createDocumentFragment();
    r.colori.forEach(function (c, i) {
      var li = document.createElement('li');
      var cv = document.createElement('canvas');
      var dpr = window.devicePixelRatio || 1;
      cv.width = cv.height = Math.round(26 * dpr);
      var ctx = cv.getContext('2d');
      ctx.fillStyle = 'rgb(' + c.r + ',' + c.g + ',' + c.b + ')';
      ctx.fillRect(0, 0, cv.width, cv.height);
      SPXSymbols.disegnaCanvas(ctx, i, cv.width * 0.15, cv.height * 0.15, cv.width * 0.7,
        SPXColor.luminanza(c.r, c.g, c.b) > 0.22 ? '#000' : '#fff');
      cv.setAttribute('aria-hidden', 'true');
      var testo = document.createElement('span');
      testo.innerHTML = '<span class="codice"></span> <span class="nome"></span>';
      testo.querySelector('.codice').textContent = 'DMC ' + c.code;
      testo.querySelector('.nome').textContent = c.name;
      var punti = document.createElement('span');
      punti.className = 'punti';
      punti.textContent = numero(c.punti);
      li.appendChild(cv); li.appendChild(testo); li.appendChild(punti);
      frammento.appendChild(li);
    });
    el.legenda.appendChild(frammento);
  }

  el.zoom.addEventListener('input', function () { stato.zoomManuale = true; disegnaAnteprima(); });
  el.zoomAdatta.addEventListener('click', function () { stato.zoomManuale = false; disegnaAnteprima(); });
  el.mostraSimboli.addEventListener('change', function () {
    // i simboli servono grandi: se l'ingrandimento è basso lo si alza
    if (el.mostraSimboli.checked && Number(el.zoom.value) < 12) { el.zoom.value = 12; stato.zoomManuale = true; }
    disegnaAnteprima();
  });
  window.addEventListener('resize', attesa(function () { if (!stato.zoomManuale) disegnaAnteprima(); }, 200));

  // ── 6. Foglio ───────────────────────────────────────────────────────
  function opzioniFoglio() {
    return {
      formato: el.formato.value,
      orientamento: radio('orientamento'),
      lato: Number(el.lato.value),
      modo: radio('stampa')
    };
  }

  function aggiornaFoglio() {
    el.valLato.textContent = decimale(Number(el.lato.value)) + ' mm';
    var r = stato.ricamo;
    if (!r || r.errore || !(r.larghezza > 0)) { el.riepilogoFoglio.textContent = ''; return; }
    var lay = SPXPdf.calcolaPagine(r.larghezza, r.altezza, opzioniFoglio());
    el.riepilogoFoglio.innerHTML = 'Lo schema occuperà <strong>' + lay.pagine.length +
      (lay.pagine.length === 1 ? ' pagina' : ' pagine') + '</strong>' +
      (lay.pagine.length > 1 ? ' (' + lay.pagineX + ' × ' + lay.pagineY + ')' : '') +
      ', più copertina e legenda. Fino a ' + lay.colonnePerPagina + ' × ' + lay.righePerPagina + ' punti per pagina.';
  }

  el.formato.addEventListener('change', aggiornaFoglio);
  el.lato.addEventListener('input', aggiornaFoglio);
  document.querySelectorAll('input[name="orientamento"], input[name="stampa"]').forEach(function (i) {
    i.addEventListener('change', aggiornaFoglio);
  });

  // ── 7. PDF ──────────────────────────────────────────────────────────
  function immagineCopertina() {
    var r = stato.risultato;
    var s = Math.max(1, Math.floor(1200 / Math.max(r.larghezza, r.altezza)));
    var c = document.createElement('canvas');
    c.width = r.larghezza * s; c.height = r.altezza * s;
    var ctx = c.getContext('2d');
    for (var y = 0; y < r.altezza; y++) {
      for (var x = 0; x < r.larghezza; x++) {
        var col = r.colori[r.griglia[y * r.larghezza + x]];
        ctx.fillStyle = 'rgb(' + col.r + ',' + col.g + ',' + col.b + ')';
        ctx.fillRect(x * s, y * s, s, s);
      }
    }
    // JPEG: niente canale alfa, PDF molto più leggero
    return c.toDataURL('image/jpeg', 0.92);
  }

  el.scarica.addEventListener('click', function () {
    if (!stato.risultato) return;
    el.scarica.disabled = true;
    messaggio(el.msgPdf, 'Creo il PDF… con schemi grandi può volerci qualche secondo.');
    setTimeout(function () {
      try {
        var r = stato.risultato;
        var opz = opzioniFoglio();
        opz.aida = stato.aida;
        opz.immagine = immagineCopertina();
        var doc = SPXPdf.creaPdf(window.jspdf.jsPDF, r, opz);
        var blob = doc.output('blob');
        if (stato.urlPdf) URL.revokeObjectURL(stato.urlPdf);
        stato.urlPdf = URL.createObjectURL(blob);
        var nome = 'pixel-e-croce-' + r.larghezza + 'x' + r.altezza + '.pdf';
        var a = document.createElement('a');
        a.href = stato.urlPdf;
        a.download = nome;
        document.body.appendChild(a);
        a.click();
        a.remove();
        el.msgPdf.innerHTML = 'PDF pronto (' + doc.getNumberOfPages() + ' pagine). Se il download non è partito, ' +
          '<a href="' + stato.urlPdf + '" download="' + nome + '" target="_blank" rel="noopener">aprilo da qui</a>.';
        el.msgPdf.classList.remove('errore');
      } catch (err) {
        messaggio(el.msgPdf, 'Non sono riuscito a creare il PDF: ' + (err && err.message || err), true);
      }
      el.scarica.disabled = false;
    }, 50);
  });

  // ── Avvio ───────────────────────────────────────────────────────────
  leggiStoffa();
  aggiornaFoglio();
  caricaPalette().then(aggiorna).catch(function () {
    messaggio(el.msgFoto, 'Non riesco a caricare la palette dei fili DMC (data/dmc.json).', true);
  });
})();
