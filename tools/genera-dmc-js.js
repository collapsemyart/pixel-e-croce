/*
 * Rigenera data/dmc.js a partire da data/dmc.json.
 *
 * Perché esiste: aprendo index.html direttamente dal disco (file://) i browser
 * bloccano la lettura di file JSON con fetch(). data/dmc.js contiene la stessa
 * palette come script, così il sito funziona anche senza server.
 *
 * Uso:  node tools/genera-dmc-js.js
 */
'use strict';
var fs = require('fs');
var path = require('path');

var json = path.join(__dirname, '../data/dmc.json');
var js = path.join(__dirname, '../data/dmc.js');
var palette = JSON.parse(fs.readFileSync(json, 'utf8'));
var righe = palette.map(function (p) { return '  ' + JSON.stringify(p); });
fs.writeFileSync(js,
  '/* Palette DMC — generato da data/dmc.json con: node tools/genera-dmc-js.js (non modificare a mano) */\n' +
  'window.SPX_DMC = [\n' + righe.join(',\n') + '\n];\n');
console.log('Scritti ' + palette.length + ' fili in ' + path.relative(process.cwd(), js));
