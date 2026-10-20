# Word Tile · Alps

Browser-based word puzzle editor with level generation, manual and simulated play, level analysis, collection views, and Excel export.

## Run locally

```powershell
npm start
```

Open `http://127.0.0.1:4173/` while the local server is running.

The public app release includes application code and the Alps interface resources. Newly extracted Zen level files, the combined package word bank, and the separate English frequency table are not included. The app uses the repository's previously published Word Tiles level and reviewed vocabulary resources; simulated word familiarity uses their frequency tiers as a coarse proxy.

## Checks

```powershell
npm test
```
