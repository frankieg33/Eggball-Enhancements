# EggPro for PlayEggball (beta)

Standalone Tampermonkey userscript for `https://playeggball.com/play` and `https://playeggball.com/game`. It does not replace the TagPro-specific `Scripts/EggPro.user.js`.

## Install

1. Install Tampermonkey in Chrome or another supported browser.
2. Create a userscript and paste in `Scripts/EggPro.playeggball.user.js`.
3. Save it, then reload a PlayEggball game page.
4. Use the EggPro panel in the top-right corner. Press Alt+Shift+E to hide or show it.

## Features

- **Pixel-perfect egg:** Replaces Eggball's live `ebEggSprite()` output with the embedded 23 × 23 image. PIXI uses nearest-neighbor sampling, and existing held and loose egg sprites are updated too.
- **Full-field zoom:** Uses the game's `eggball.view.camera.wholeFieldZoom()` calculation and camera overview state. The zoom factor defaults to 0.75, showing more than the full-field framing. It follows the game's existing camera-follow preference.
- **Fullscreen:** The button requests browser fullscreen. PlayEggball resizes its PIXI renderer on window resize, so the game uses the added viewport directly.
- **Auto-click:** Enable it in the panel and hold Shift or the left mouse button over the game. It sends the pointer events used by PlayEggball's PIXI renderer. The default interval is 125 ms.

The controls are opt-in except the egg replacement and zoom, which start enabled. Settings are stored in this site's local storage.

## Verification

The tests use a mocked PlayEggball renderer and exercise the game's camera and sprite APIs. The beta.3 candidate was also checked in Chrome against a live practice game: egg texture replacement, full-field camera state, browser fullscreen, and generated pointer-down/up events were observed. A private 6v6 match was not reached because the fresh profile was still gated by the tutorial. Synthetic pointer events can be ignored by future game code.

Run the tests with:

```sh
bun test tests/EggPro.playeggball.test.cjs
```
