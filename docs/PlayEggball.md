# EggPro for PlayEggball (beta)

Standalone Tampermonkey userscript for `https://playeggball.com/play` and `https://playeggball.com/game`. It does not replace the TagPro-specific `Scripts/EggPro.user.js`.

## Install

1. Install Tampermonkey in Chrome or another supported browser.
2. Create a userscript and paste in `Scripts/EggPro.playeggball.user.js`.
3. Save it, then reload a PlayEggball game page.
4. Use the EggPro panel 12 px from the right edge and 50 px below the top. Drag its header to move it, and use **Collapse** to reduce it to the header.

## Features

- **Pixel-perfect egg:** Replaces Eggball's live `ebEggSprite()` output with the embedded 23 × 23 image. It also intercepts changes to cached egg textures, including color variants, before the next render, and reapplies the normalized size and original center after each swap. PIXI uses nearest-neighbor sampling, and existing held and loose egg sprites are updated too.
- **Camera zoom:** Uses the game's `eggball.view.camera.wholeFieldZoom()` calculation and camera overview state. The zoom factor defaults to 1.05 and accepts values from 0.5 to 3. Values below 1 show more than the whole-field framing; values above 1 zoom in closer. It follows the game's existing camera-follow preference.
- **Fullscreen:** The button requests browser fullscreen. PlayEggball resizes its PIXI renderer on window resize, so the game uses the added viewport directly.
- **Auto-click:** Enable it and hold the selected key or the left mouse button over the game. The key selector defaults to **None**, which means mouse-only and does not trigger on Shift. Repeats transform the current renderer pointer into the game's world coordinates and call PlayEggball's `ebThrowAt()` API. If that API or transform is unavailable, the script falls back to pointer events. Mouse repeats start after the selected interval; key-gated repeats start immediately. The default interval is 125 ms.

The controls are opt-in except the egg replacement and zoom, which start enabled. Upgrading from beta.7 keeps other saved options and changes the zoom default to 1.05. The panel is 230 px wide with wrapping labels; its collapsed state keeps that width. Typing in the panel stops keyboard events before they reach game handlers, so Backspace edits the zoom value. The overlay position remains saved in this site's local storage. Destroyed egg sprites are removed from replacement tracking, and mouse-hold repeats begin after the configured interval so the native press is not duplicated.

## Verification

The automated tests use a mocked PlayEggball renderer and exercise the camera, sprite, overlay, and input interfaces. A Chrome smoke check in the tutorial game confirmed that a cold-start Space hold emitted three socket `click` actions through `ebThrowAt()` using the renderer pointer transformed to world coordinates. The browser measured the previous 130 px panel at that time; the current 230 px width is covered by the stylesheet test. The isolated private Classic 6v6 launch had one player and no egg carrier, so a successful shot with the egg and behavior in a ranked 6v6 game remain unverified. The pointer-event fallback can still be ignored by future game code.

Run the tests with:

```sh
bun test tests/EggPro.playeggball.test.cjs
```
