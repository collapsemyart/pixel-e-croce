/*
 * fabric.js — conversione tra centimetri, tela Aida e punti.
 * Funziona nel browser (window.SPXFabric), nel worker e in Node (module.exports).
 */
(function (root) {
  'use strict';

  var CM_PER_POLLICE = 2.54;
  var TELE_AIDA = [11, 14, 16, 18];
  var MAX_PUNTI_LATO = 500; // limite consigliato dalla specifica
  var MARGINE_PREDEFINITO_CM = 3;

  /**
   * Punti utili su un lato della stoffa.
   * punti = (cm − 2 × margine) ÷ 2,54 × Aida, arrotondato per difetto.
   */
  function cmInPunti(cm, aida, margineCm) {
    var utile = cm - 2 * margineCm;
    if (!(utile > 0) || !(aida > 0)) return 0;
    // piccola tolleranza per evitare errori di arrotondamento (es. 131,9999999)
    return Math.floor((utile / CM_PER_POLLICE) * aida + 1e-9);
  }

  /** Lunghezza in cm di un certo numero di punti su una tela Aida. */
  function puntiInCm(punti, aida) {
    if (!(aida > 0)) return 0;
    return (punti / aida) * CM_PER_POLLICE;
  }

  /**
   * Calcola la dimensione del ricamo a partire dai parametri della stoffa.
   * opz: { modo: 'punti'|'cm', larghezza, altezza, aida, margine }
   * Restituisce { larghezza, altezza, cmLarghezza, cmAltezza, errore }
   */
  function calcolaRicamo(opz) {
    var aida = Number(opz.aida);
    var w, h;
    if (opz.modo === 'cm') {
      var margine = Number(opz.margine);
      if (!(margine >= 0)) margine = 0;
      w = cmInPunti(Number(opz.larghezza), aida, margine);
      h = cmInPunti(Number(opz.altezza), aida, margine);
    } else {
      w = Math.floor(Number(opz.larghezza));
      h = Math.floor(Number(opz.altezza));
    }
    var errore = null;
    if (!(w >= 1) || !(h >= 1)) {
      errore = opz.modo === 'cm'
        ? 'La stoffa è troppo piccola per il margine scelto.'
        : 'Inserisci larghezza e altezza in punti (almeno 1).';
      w = Math.max(0, w || 0);
      h = Math.max(0, h || 0);
    } else if (w > MAX_PUNTI_LATO || h > MAX_PUNTI_LATO) {
      errore = 'Massimo ' + MAX_PUNTI_LATO + ' punti per lato: riduci la stoffa o scegli una tela Aida più rada.';
    }
    return {
      larghezza: w,
      altezza: h,
      cmLarghezza: puntiInCm(w, aida),
      cmAltezza: puntiInCm(h, aida),
      errore: errore
    };
  }

  var api = {
    CM_PER_POLLICE: CM_PER_POLLICE,
    TELE_AIDA: TELE_AIDA,
    MAX_PUNTI_LATO: MAX_PUNTI_LATO,
    MARGINE_PREDEFINITO_CM: MARGINE_PREDEFINITO_CM,
    cmInPunti: cmInPunti,
    puntiInCm: puntiInCm,
    calcolaRicamo: calcolaRicamo
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SPXFabric = api;
})(typeof self !== 'undefined' ? self : this);
