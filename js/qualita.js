/*
 * qualita.js — stima di quanto lo schema somiglierà alla foto,
 * con consigli pratici per migliorare il risultato.
 *
 * Riceve le misure calcolate da SPXQuantize.misuraQualita più alcuni dati
 * del ritaglio. È una stima: serve a orientare, non è una garanzia.
 */
(function (root) {
  'use strict';

  // ── Soglie (modificabili) ───────────────────────────────────────────
  var DETTAGLIO_OK = 0.10;      // sotto: quasi nessun dettaglio perso
  var DETTAGLIO_MOLTO = 0.40;   // sopra: penalità massima
  var DELTA_E_OK = 4;           // differenza colore quasi invisibile
  var DELTA_E_MOLTO = 10;       // differenza colore molto evidente
  var CONTRASTO_BASSO = 30;     // L* tra 5° e 95° percentile
  var SCURA = 25, CHIARA = 88;  // L* media

  var LIVELLI = [
    { min: 85, nome: 'Ottima', classe: 'ottima' },
    { min: 70, nome: 'Buona', classe: 'buona' },
    { min: 50, nome: 'Discreta', classe: 'discreta' },
    { min: 0, nome: 'Scarsa', classe: 'scarsa' }
  ];

  function tra(v, a, b) { return Math.max(0, Math.min(1, (v - a) / (b - a))); }

  /**
   * misure: { dettaglioPerso, deltaE, contrasto, luminosita }
   * dati:   { pixelPerPunto, coloriUsati, maxColori }
   * Restituisce { punteggio (0–100), livello, classe, consigli: [testo], voci: [{nome, valore}] }
   */
  function valuta(misure, dati) {
    var consigli = [];
    var penalita = 0;

    // dettagli più piccoli di un punto
    var pDett = tra(misure.dettaglioPerso, DETTAGLIO_OK, DETTAGLIO_MOLTO) * 45;
    penalita += pDett;
    if (misure.dettaglioPerso >= 0.2) {
      consigli.push('Molti dettagli sono più piccoli di un punto (scritte, peli, texture) e andranno persi: ' +
        'aumenta i punti (stoffa più grande o tela Aida più fitta) oppure ritaglia più stretto sul soggetto.');
    } else if (misure.dettaglioPerso >= 0.14) {
      consigli.push('Alcuni dettagli fini si perderanno. Se ci sono scritte, ogni lettera dovrebbe essere alta almeno 8–10 punti.');
    }

    // fedeltà dei colori
    var pCol = tra(misure.deltaE, DELTA_E_OK, DELTA_E_MOLTO) * 30;
    penalita += pCol;
    if (misure.deltaE >= 6) {
      consigli.push(dati.coloriUsati >= dati.maxColori
        ? 'I colori sono approssimati: prova ad aumentare il numero massimo di colori.'
        : 'Alcune tonalità della foto non hanno un filo DMC molto simile: il risultato avrà colori un po\' diversi.');
    }

    // contrasto e luce
    if (misure.contrasto < CONTRASTO_BASSO) {
      penalita += 12;
      consigli.push('La foto è poco contrastata: soggetto e sfondo si confondono. Meglio una foto con più luce e uno sfondo diverso dal soggetto.');
    }
    if (misure.luminosita < SCURA) {
      penalita += 8;
      consigli.push('La foto è molto scura: i colori scuri si confondono tra loro. Prova una foto scattata con più luce.');
    } else if (misure.luminosita > CHIARA) {
      penalita += 8;
      consigli.push('La foto è molto chiara: le parti bianche diventano tutte uguali. Prova una foto meno esposta.');
    }

    // risoluzione della foto rispetto ai punti
    var ppp = dati.pixelPerPunto;
    if (ppp < 1) {
      penalita += 20;
      consigli.push('La foto ha meno pixel dei punti del ricamo e risulterà sfocata: usa la foto originale ' +
        '(non uno screenshot o una foto ricevuta in chat) oppure riduci i punti.');
    } else if (ppp < 2) {
      penalita += 6;
    }

    var punteggio = Math.max(0, Math.min(100, Math.round(100 - penalita)));
    var livello = LIVELLI.filter(function (l) { return punteggio >= l.min; })[0];
    if (!consigli.length) {
      consigli.push(punteggio >= 85
        ? 'Ottima base: la foto ha dettagli, colori e contrasto adatti a questo ricamo.'
        : 'Risultato nella media: puoi provare ad aumentare i punti o i colori per avvicinarti alla foto.');
    }

    return {
      punteggio: punteggio,
      livello: livello.nome,
      classe: livello.classe,
      consigli: consigli,
      voci: [
        { nome: 'Dettagli conservati', valore: Math.round((1 - misure.dettaglioPerso) * 100) + '%' },
        { nome: 'Fedeltà colori', valore: misure.deltaE < 4 ? 'alta' : misure.deltaE < 6 ? 'buona' : misure.deltaE < 8 ? 'media' : 'bassa' },
        { nome: 'Contrasto', valore: misure.contrasto < CONTRASTO_BASSO ? 'basso' : misure.contrasto < 50 ? 'medio' : 'buono' },
        { nome: 'Risoluzione foto', valore: ppp < 1 ? 'insufficiente' : ppp < 2 ? 'appena sufficiente' : 'buona' }
      ]
    };
  }

  var api = { valuta: valuta, LIVELLI: LIVELLI };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SPXQualita = api;
})(typeof self !== 'undefined' ? self : this);
