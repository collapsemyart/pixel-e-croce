/*
 * worker.js — esegue la conversione foto → schema in background,
 * così la pagina resta reattiva.
 *
 * Messaggio in ingresso: { id, pixels, srcW, srcH, larghezza, altezza, maxColori, pulizia, palette }
 * Messaggio in uscita:   { id, risultato } oppure { id, errore }
 */
/* global importScripts, SPXQuantize */
importScripts('color.js', 'quantize.js');

self.onmessage = function (e) {
  var dati = e.data;
  try {
    var risultato = SPXQuantize.converti(dati);
    self.postMessage({ id: dati.id, risultato: risultato }, [risultato.griglia.buffer]);
  } catch (err) {
    self.postMessage({ id: dati.id, errore: String(err && err.message || err) });
  }
};
