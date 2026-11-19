# ApvGuesser - GeoGuessr Chrome Extension
![APV_GUESSR_HEADER](https://github.com/realapire/geoguessr-cheat/assets/111300928/67d869d9-8747-49f0-84aa-27496acf9697)

- **Tested in All Main Game Modes**<br>
- **Features: Location Popup**<br>

## How To Use

1. **Installation**
   - Clone or download the repository to your local machine.
   - Build the extension (TypeScript → `dist/`):
     ```bash
     npm install
     npm run build
     ```
   - Open Google Chrome and navigate to `chrome://extensions/`.
   - Enable the "Developer mode" toggle switch in the top right corner.
   - Click on the "Load unpacked" button and select the directory where you saved the extension files.

2. **Usage**
   - After installing the extension, navigate to a GeoGuessr game session.
   - Click the eye icon in the in-game controls to display a popup with the location information
     and a small map of the country with the exact location marked.

## Development

- `npm run build` – type check (`tsc`) and bundle into `dist/` (esbuild)
- `npm run watch` – rebuild on every change
- `npm run typecheck` – type check only

Country borders: [Natural Earth](https://www.naturalearthdata.com/) (public domain), via the
[`world-atlas`](https://github.com/topojson/world-atlas) package. They are converted at build time by
`scripts/prepare-countries.ts`.

<hr>

User-Interface Without ApvGuessr:<br>
![image](https://github.com/realapire/geoguessr-cheat/assets/111300928/365ef2d8-5b58-437b-9727-9f126da66c66)
![image](https://github.com/realapire/geoguessr-cheat/assets/111300928/7ebde62d-dd3b-4160-b28e-529c017a02a9)

User-Interface With ApvGuessr:

![image](https://github.com/realapire/geoguessr-cheat/assets/111300928/87441a6f-0fdb-4032-9600-73cb5f16bdd9)
![image](https://github.com/realapire/geoguessr-cheat/assets/111300928/21542d7f-06f7-4d17-b6ee-7f0021a91038)

