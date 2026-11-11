# EggPro for PlayEggball (beta)

Standalone Tampermonkey userscript for https://playeggball.com/play?mode=ranked.
This does **not** replace the TagPro-specific `Scripts/EggPro.user.js`.

## Install

1. Install Tampermonkey in your browser.
2. Create a new userscript and replace the editor contents with `EggPro.playeggball.user.js`.
3. Save the script and reload the PlayEggball game page.
4. Configure the EggPro panel in the top-right corner. Press Alt+Shift+E to hide or show it.

## Features

- **Pixel-sharp ball assets (enabled):** CSS for identifiable ball/egg DOM images, a narrowly scoped Canvas2D drawImage hook, and a PIXI v5-v7 texture cache adjustment if PIXI is exposed. This is not a complete port of TagPro's held-egg sprite overlay.
- **Full-viewport field (enabled):** expands the largest visible game canvas' wrapper to fill the viewport while preserving the canvas' aspect ratio. The `Browser fullscreen` button also calls the browser Fullscreen API (requires a user gesture). It cannot guarantee that a game camera reveals the *entire map*.
- **Auto click (disabled initially):** enable it in EggPro's panel, then hold Shift or hold the left mouse button over the game canvas. Default interval 125 ms; configurable 80–1000 ms. Switch input mode from `mouse` to `pointer` if the game uses pointer events.

Auto-click stops on key/mouse release, loss of focus, or tab visibility change. No direct socket messages or game memory changes are made. The game may reject synthetic browser events.

## Status / limitations

The live site's HTML and JavaScript bundles were not accessible from this development environment. Its renderer, ball model, input handler, and camera API are unverified. Consequently, the three behaviors are not yet confirmed against a live ranked match. In particular, if the game uses an internal WebGL renderer and does not expose PIXI textures, ball sharpening will do nothing until a game-specific renderer adapter is added. The panel reports whether a recognizable ball asset has been encountered.

## Local tests

```bash
node --check EggPro.playeggball.user.js
node --test EggPro.playeggball.test.cjs
```

The tests exercise Canvas2D smoothing isolation, draw errors, cleanup, and press-to-click behavior with a mocked canvas. They do not test a live game.