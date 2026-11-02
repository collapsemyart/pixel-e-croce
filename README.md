# Pixel e Croce

Sito web gratuito che trasforma una fotografia in uno **schema per punto croce** con i codici dei fili **DMC**, scaricabile come PDF da stampare.

- Tutto avviene nel browser: la foto **non viene mai inviata** a nessun server.
- Nessun server, nessun database, nessuna API a pagamento.
- Funziona da computer e da telefono.

## Come si usa

1. **Carica la foto** (JPG, PNG; HEIC dove il browser lo supporta, cioè Safari), anche trascinandola.
2. **Indica la stoffa**: in centimetri (con tela Aida e margine) oppure direttamente in punti.
3. **Ritaglia la foto**: il riquadro ha le stesse proporzioni della stoffa.
4. **Scegli quanti colori** al massimo usare (2–50).
5. **Guarda l'anteprima** a punti, con colori DMC e conteggio dei punti.
6. **Scegli il foglio**: A4, A3 o Letter, verticale o orizzontale, lato casella 2,5–5 mm, a colori o in bianco e nero.
7. **Scarica il PDF**: copertina con anteprima e mappa delle pagine, legenda con simboli, codici DMC, punti e matasse stimate, schema diviso su più pagine.

## Provarlo sul proprio computer

Basta aprire `index.html` con un doppio clic. Aperto dal disco il browser non permette il lavoro in background, quindi con schemi grandi la pagina può bloccarsi per qualche secondo mentre calcola; online (GitHub Pages) il calcolo avviene in un Web Worker.

Per provarlo come sarà online, da questa cartella:

```bash
python3 -m http.server 8000
```

e apri <http://localhost:8000>.

## Test

```bash
node tests/test.js
```

Controlla le conversioni cm/Aida → punti (es. 30 × 20 cm, Aida 14, margine 3 cm → 132 × 77), RGB → Lab, CIEDE2000 (coppie di riferimento di Sharma et al., 2005), la riduzione colori (massimo rispettato, somma dei punti = larghezza × altezza, risultato ripetibile), la divisione in pagine (nessun punto mancante o doppio) e la creazione di un PDF completo.

## Pubblicazione su GitHub Pages

1. Crea su GitHub un repository **pubblico** (es. `pixel-e-croce`).
2. Carica tutti i file di questa cartella nel ramo `main`, con `index.html` nella cartella principale.
3. In **Settings → Pages** scegli "Deploy from a branch", ramo `main`, cartella `/ (root)`.
4. Dopo qualche minuto il sito è su `https://<nome-utente>.github.io/pixel-e-croce/`.
5. Ogni nuovo caricamento su `main` aggiorna il sito.

Tutti i percorsi nel codice sono relativi, quindi il sito funziona anche dentro la sottocartella del repository.

## Struttura

```
index.html          pagina unica con tutti i passaggi
css/style.css       stile
js/app.js           interfaccia e passaggi
js/fabric.js        conversione cm/Aida ↔ punti
js/color.js         RGB → Lab (D65), CIEDE2000
js/quantize.js      ricampionamento, k-means in Lab, abbinamento DMC, pulizia punti isolati, misure di qualità
js/qualita.js       stima della somiglianza alla foto e consigli
js/worker.js        esegue la conversione in background
js/symbols.js       56 simboli per lo schema (disegnati come forme, uguali a schermo e nel PDF)
js/pdf.js           impaginazione e creazione del PDF
data/dmc.json       palette DMC: codice, nome, r, g, b
data/dmc.js         stessa palette come script, per l'apertura da disco (file://)
lib/                jsPDF 2.5.2, Cropper.js 1.6.2 (copie locali, nessun CDN)
tests/test.js       test eseguibili con Node
tools/genera-dmc-js.js   rigenera data/dmc.js da data/dmc.json
icone/              icone per la schermata Home e il browser
manifest.webmanifest     nome e icone quando il sito viene salvato sul telefono
```

Se modifichi `data/dmc.json`, rigenera la copia con `node tools/genera-dmc-js.js` (il test segnala se non sono allineate).

### Parametri modificabili nel codice

- `PUNTI_PER_MATASSA` in `js/pdf.js` (predefinito 1800): stima dei punti ricamabili con una matassa.
- `MAX_PUNTI_LATO` in `js/fabric.js` (predefinito 500): limite di punti per lato.
- `PASSATE_PULIZIA` in `js/quantize.js` (predefinito 3): passate della pulizia dei punti isolati.
- `SEME` in `js/quantize.js`: seme fisso del k-means, così la stessa foto dà sempre lo stesso schema.

## Limiti noti

- I colori a schermo e stampati non corrispondono mai esattamente ai fili veri: i valori RGB dei DMC sono approssimazioni. Conviene verificare le matasse dal vivo.
- Schemi molto grandi possono essere lenti su telefoni datati; per questo il limite è 500 punti per lato.
- La stima delle matasse dipende da tela, numero di capi e mano di chi ricama.
- Le foto HEIC si aprono solo nei browser che le supportano (Safari).
- Le scritte piccole restano leggibili solo se ogni lettera è alta almeno 8–10 punti: altrimenti conviene ritagliare più stretto, usare una stoffa più grande o una tela più fitta.

## Crediti

Pixel e Croce è nato da una chiacchierata con **Selly**, un punto alla volta.

- Palette DMC: pacchetto R [dmc](https://github.com/sharlagelfand/dmc) di Sharla Gelfand (licenza MIT), che a sua volta ripulisce i dati di [CrossStitchCreator](https://github.com/adrianj/CrossStitchCreator) di Adrian J. Nomi delle abbreviazioni espansi e correzioni RGB riprese da quel pacchetto. DMC è un marchio di DMC; questo progetto non è affiliato.
- [jsPDF](https://github.com/parallax/jsPDF) — licenza MIT.
- [Cropper.js](https://github.com/fengyuanchen/cropperjs) — licenza MIT.
- Formula CIEDE2000: G. Sharma, W. Wu, E. N. Dalal, "The CIEDE2000 Color-Difference Formula", 2005.

## Scelte diverse dalla specifica

- **Pulizia dei punti isolati**: la specifica dice che un punto isolato prende il colore *più frequente* intorno. Così però i bordi delle scritte e dei contorni sottili venivano cancellati. Ora prende il colore vicino *più simile* (CIEDE2000), con fino a 3 passate: il rumore sparisce lo stesso e le scritte restano leggibili.
- **Icona**: `icone/` + `manifest.webmanifest`, usati quando il sito viene aggiunto alla schermata Home.

## Licenza

MIT — vedi [LICENSE](LICENSE).
