# EggPro for PlayEggball (beta)

Standalone Tampermonkey userscript for https://playeggball.com/play?mode=ranked and https://playeggball.com/game.
This does **not** replace the TagPro-specific `Scripts/EggPro.user.js`.

## Install

1. Install Tampermonkey in your browser.
2. Create a new userscript and replace the editor contents with `EggPro.playeggball.user.js`.
3. Save the script and reload the PlayEggball game page.
4. Configure the EggPro panel in the top-right corner. Press Alt+Shift+E to hide or show it.

## Features (beta.2)

- **Exact egg image:** Embeds the supplied 23 × 23 yellow ball with black outline. Replaces identifiable DOM egg images, matching Canvas2D image draws, or yellow full-circle Canvas2D paths. Exposed PIXI v5-v7 egg textures are also supported when the game exposes the app/texture cache.
- **Zoom out:** Uses a detected game camera's `setZoom()` method (default 75%). A fallback resizes the drawing buffer for accessible 2D canvases, although it only reveals more of the field when the game derives its camera dimensions from that buffer. If neither applies, the panel reports a limitation instead of pretending it worked. Changing a canvas buffer may reset its context.
- **Responsive canvas:** Removed the fixed black background overlay that previously obscured the game. The button `Browser fullscreen` calls the Fullscreen API, which does not itself zoom out.
- **Auto click:** Unchanged. Enable in the panel and hold Shift or the left mouse button; configure 80–1000 ms.

## Status / limitations

The live PlayEggball renderer and camera could not be inspected from the available tools. The ball-replacement heuristics may not match its assets, and browser zoom may differ from true full-map visibility. Confirm which zoom mode the panel reports. If it says `camera not exposed` or `no 2D camera`, a game-specific renderer adapter is still required. The 2D canvas fallback is experimental. The game can also ignore synthetic clicks.

## Local tests

```bash
node --check Scripts/EggPro.playeggball.user.js
node --test tests/EggPro.playeggball.test.cjs
```

The tests exercise Canvas2D smoothing isolation, draw errors, cleanup, and press-to-click behavior with a mocked canvas. They do not test a live game.