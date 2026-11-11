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
- **Auto-click:** Enable it and hold the selected key or the left mouse button over the game. The key selector defaults to **None**, which means mouse-only and does not trigger on Shift. A mouse press supplies the first native input; synthetic repeats start after the selected interval. Key-gated auto-click sends its first synthetic input immediately. The default interval is 125 ms.

The controls are opt-in except the egg replacement and zoom, which start enabled. Upgrading from beta.6 keeps the other saved options and places the overlay correctly at the top-right default; user-dragged positions remain saved in this site's local storage. Destroyed egg sprites are removed from replacement tracking, and mouse-hold repeats begin after the configured interval so the native press is not duplicated.

## Verification

The automated tests use a mocked PlayEggball renderer and exercise the camera, sprite, overlay, and input interfaces. They do not establish how the ranked client responds. This verification has no repeatable Chrome capture or ranked 6v6 result, so live egg rendering, rendered zoom response, and shooting cadence remain unverified. Synthetic pointer events can be ignored by future game code.

Run the tests with:

```sh
bun test tests/EggPro.playeggball.test.cjs
```
