# EggPro for PlayEggball (beta)

Standalone Tampermonkey userscript for `https://playeggball.com/play` and `https://playeggball.com/game`. It does not replace the TagPro-specific `Scripts/EggPro.user.js`.

## Install

1. Install Tampermonkey in Chrome or another supported browser.
2. Create a userscript and paste in `Scripts/EggPro.playeggball.user.js`.
3. Save it, then reload a PlayEggball game page.
4. Use the EggPro panel 12 px from the right edge and 50 px below the top. Drag its header to move it, and use **Collapse** to reduce it to the header.

## Features

- **Pixel-perfect egg:** Replaces Eggball's live `ebEggSprite()` output with the embedded 23 × 23 image. It also intercepts changes to cached egg textures, including color variants, before the next render. PIXI uses nearest-neighbor sampling, and existing held and loose egg sprites are updated too.
- **Camera zoom:** Uses the game's `eggball.view.camera.wholeFieldZoom()` calculation and camera overview state. The zoom factor defaults to 2 and accepts values from 0.5 to 3. Values below 1 show more than the whole-field framing; values above 1 zoom in closer. It follows the game's existing camera-follow preference.
- **Fullscreen:** The button requests browser fullscreen. PlayEggball resizes its PIXI renderer on window resize, so the game uses the added viewport directly.
- **Auto-click:** Enable it and hold the selected key or the left mouse button over the game. The key selector defaults to **None**, which means mouse-only and does not trigger on Shift. It sends the pointer events used by PlayEggball's PIXI renderer. The default interval is 125 ms.

The controls are opt-in except the egg replacement and zoom, which start enabled. Upgrading from beta.5 keeps the other saved options and moves the zoom default to 2. A previously saved default top-left position moves to the new top-right default; user-dragged positions remain saved in this site's local storage.

## Verification

The tests use a mocked PlayEggball renderer and exercise the game's camera and sprite APIs. A Chrome smoke check against a live practice game verified the Eggball camera, egg texture replacement, fullscreen, and generated pointer-down/up events. A private 6v6 match was not reached because the fresh profile was gated by the tutorial. Synthetic pointer events can be ignored by future game code.

Run the tests with:

```sh
bun test tests/EggPro.playeggball.test.cjs
```
