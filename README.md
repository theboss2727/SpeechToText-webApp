# Ingage Translator WebApp

Studio interattivo per la trascrizione e l'apprendimento delle lingue tramite audio: estrai l'audio da link YouTube o file locali, trascrivi in tempo reale con evidenziazione delle discrepanze, calcolo WPM/accuratezza ed esportazione in formato `.srt`.

## Requisiti di sistema

1. **Node.js** (versione 18 o superiore consigliata)
2. **FFmpeg & FFprobe**: necessari per l'estrazione, la conversione audio in MP3 e il calcolo dei picchi della forma d'onda (waveform).
   - **Windows**: installabile via `winget install Gyan.FFmpeg` oppure `choco install ffmpeg`, assicurandosi che sia nel `PATH`.
   - **macOS**: `brew install ffmpeg`
   - **Linux (Ubuntu/Debian)**: `sudo apt update && sudo apt install ffmpeg`

## Configurazione

1. Clona il repository e installa le dipendenze:
   ```bash
   npm install
   ```

2. Configura le variabili d'ambiente creando un file `.env.local` (oppure `.env`) partendo da `.env.example`:
   ```bash
   cp .env.example .env.local
   ```
   Inserisci la tua chiave API di Google Gemini:
   ```env
   GEMINI_API_KEY="tua_chiave_gemini_api"
   ```
   *(La chiave API può essere ottenuta gratuitamente su [Google AI Studio](https://aistudio.google.com/)).*

## Avvio in sviluppo

Avvia il server con ricaricamento a caldo (Vite + Express):
```bash
npm run dev
```
L'applicazione sarà accessibile all'indirizzo [http://localhost:3000](http://localhost:3000).

## Build di produzione

```bash
npm run build
npm start
```
