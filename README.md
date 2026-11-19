# ApvGuessr

A Chrome extension that shows the location of the current GeoGuessr round: coordinates, address and a small map of the country with the exact spot marked.

It doesn't inject anything into the GeoGuessr page. The location appears in a separate small window, and you trigger it with a keyboard shortcut, so the game window keeps its size and focus.

## Installation

The repository contains only the TypeScript sources. The JavaScript Chrome loads (`dist/`) is built locally, so a plain clone or ZIP download **won't load** until you build it. Chrome then reports *"Hintergrundskript konnte nicht geladen werden"* / *"Could not load background script"*.

Requirements: [Node.js](https://nodejs.org/) 22.18 or newer, and Google Chrome.

1. Get the code:
   ```sh
   git clone https://github.com/Slash561/guesser-tool-1.git
   cd guesser-tool-1
   ```
   (or download the ZIP from GitHub, unpack it and `cd` into the folder)
2. Build it:
   ```sh
   npm install
   npm run build
   ```
   This creates the `dist/` folder.
3. Open `chrome://extensions`, turn on **Developer mode** (top right), click **Load unpacked** and select the project folder (the one containing `manifest.json`).
4. Open `chrome://extensions/shortcuts` and check that **ApvGuessr → "Show the location of the current round"** has a shortcut. Chrome assigns the default shortcut only on a fresh install, and leaves it out if another extension already uses it.

After changing the code, run `npm run build` again and click the reload icon on the extension in `chrome://extensions`.

## Keyboard shortcut

| Platform        | Default shortcut                       |
| --------------- | -------------------------------------- |
| macOS           | <kbd>Option</kbd> + <kbd>Shift</kbd> + <kbd>L</kbd>   |
| Windows / Linux | <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Y</kbd>   |

You can change it at `chrome://extensions/shortcuts`. The shortcut is the only way to show the location: there is no toolbar button and no "show" button.

## Usage

1. Start a GeoGuessr round.
2. Press the shortcut. The ApvGuessr window opens (on first use, at the top right of the browser window) and shows the location. It opens **without taking the focus**, so you can keep playing.
3. Move the window wherever you like, e.g. to a second monitor. It reopens at the same position and size.
4. On every new round the location is hidden again. The window says *"New location detected"* until you press the shortcut again.

Clicking inside the ApvGuessr window (e.g. **Hide**) moves the focus there, and the game window gets a normal `blur` event, as with any other window.


## Disclaimer

This tool reveals the answer of a round. Using it in competitive or ranked games is cheating and very likely violates GeoGuessr's terms of service.
