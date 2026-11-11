// ==UserScript==
// @name         EggPro for PlayEggball
// @namespace    https://github.com/frankieg33/Eggball-Enhancements
// @version      2.0.0-beta.3
// @description  Pixel-perfect egg, full-field camera zoom, fullscreen, and hold-to-auto-click.
// @author       frankieg33
// @match        https://playeggball.com/play*
// @match        https://playeggball.com/game*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(() => {
    'use strict';

    const STORAGE_KEY = 'eggpro.playeggball.settings.v1';
    const DEFAULTS = { pixelPerfect: true, zoomOut: true, zoomFactor: 0.75, autoClick: false, clickIntervalMs: 125 };
    const PERFECT_EGG_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABcAAAAXCAYAAADgKtSgAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAGaSURBVEhLtZWhTgNBEIZHnCVBIHgQZEVFFUFAgkAiiuANEDgEAoM7jSAhOdkHKAmiSRGV4PsAPMIw/+zs3S7M5W4hveTrZmdn/t2bnZsSM/ciz5FwJ6yErQAjRsxhn3hxEd9INBWWAiZDYKOpq5NNiCrhXtDAwwPimyvit2fi7au4fIZx9UJ8ex3Wo6/FVZneD+FGUOeLY+KvdRDsA+uXZ9kGiG830B8T1xPv7xE3j53AGBZ19hZ1Ji4PcqyLpcIRbBA1hJNUXC8PqfACx5KkaGO6Wm76WkM5HgLxSXqQDa1XrQovoBTomPgDxFGnWm6ecynQMXHohi8v1vF/gY6JQzdMPMe/EjUhvtOTa87fG9+5FLQGE9eca7WgV3jOpUDHxLVaJpjsoM5nYsUYUoMvzAsay/y8Ff4QKrGqeNtb0CO8wCGWT60w6HqLbaBdEa9VugGEk3TkXdHEs36OFA3dAdaTVAC/nycb1II64zQF/0SI8/+JMiPRqbAR0uA+cHma4186njEiDy4a9Ypq0i/ZRsxhnwnZaTuYvgG0oJH7d9/FWQAAAABJRU5ErkJggg==';
    const settings = loadSettings();
    const changedSprites = new Map();

    let panel = null;
    let status = null;
    let fullscreenButton = null;
    let canvas = null;
    let gameZoom = null;
    let eggSpriteOriginal = null;
    let eggSpriteWrapper = null;
    let perfectEggTexture = null;
    let pointer = null;
    let shiftHeld = false;
    let mouseHeld = false;
    let clickTimer = null;
    let syncTimer = null;
    let zoomStatus = 'waiting for Eggball camera';

    function loadSettings() {
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
            return {
                pixelPerfect: typeof saved.pixelPerfect === 'boolean' ? saved.pixelPerfect : DEFAULTS.pixelPerfect,
                zoomOut: typeof saved.zoomOut === 'boolean' ? saved.zoomOut : DEFAULTS.zoomOut,
                zoomFactor: Number.isFinite(saved.zoomFactor) && saved.zoomFactor >= 0.5 && saved.zoomFactor <= 1
                    ? saved.zoomFactor : DEFAULTS.zoomFactor,
                autoClick: typeof saved.autoClick === 'boolean' ? saved.autoClick : DEFAULTS.autoClick,
                clickIntervalMs: Number.isInteger(saved.clickIntervalMs) && saved.clickIntervalMs >= 80 && saved.clickIntervalMs <= 1000
                    ? saved.clickIntervalMs : DEFAULTS.clickIntervalMs,
            };
        } catch { return { ...DEFAULTS }; }
    }

    function saveSettings() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { /* storage unavailable */ }
    }

    function getGame() {
        const game = window.eggball;
        const view = game && game.view;
        return game && game.camera && view && view.camera && typeof view.camera.wholeFieldZoom === 'function'
            ? game : null;
    }

    function getPerfectEggTexture() {
        const pixi = window.PIXI;
        if (!pixi || !pixi.Texture || typeof pixi.Texture.from !== 'function') return null;
        if (!perfectEggTexture) {
            try { perfectEggTexture = pixi.Texture.from(PERFECT_EGG_URL); } catch { return null; }
        }
        const base = perfectEggTexture.baseTexture;
        const nearest = pixi.SCALE_MODES && pixi.SCALE_MODES.NEAREST;
        if (base && nearest !== undefined && base.scaleMode !== nearest) {
            base.scaleMode = nearest;
            if (typeof base.update === 'function') base.update();
        }
        return perfectEggTexture;
    }

    function rememberAndReplaceEggSprite(sprite, texture) {
        if (!sprite || !sprite.texture || sprite.destroyed) return false;
        const previous = changedSprites.get(sprite);
        if (previous && sprite.texture === texture) return true;
        if (previous) changedSprites.delete(sprite);
        const width = sprite.width;
        const height = sprite.height;
        const scaleX = sprite.scale.x;
        const scaleY = sprite.scale.y;
        const pivotX = sprite.pivot.x;
        const pivotY = sprite.pivot.y;
        const centerX = width / 2 - pivotX * scaleX;
        const centerY = height / 2 - pivotY * scaleY;
        changedSprites.set(sprite, { texture: sprite.texture, scaleX, scaleY, pivotX, pivotY });
        sprite.texture = texture;
        sprite.width = 23;
        sprite.height = 23;
        sprite.pivot.set(11.5 - centerX, 11.5 - centerY);
        return true;
    }

    function restoreEggSprites() {
        for (const [sprite, original] of changedSprites) {
            if (sprite.destroyed || sprite.texture !== perfectEggTexture) continue;
            sprite.texture = original.texture;
            sprite.scale.set(original.scaleX, original.scaleY);
            sprite.pivot.set(original.pivotX, original.pivotY);
        }
        changedSprites.clear();
    }

    function installEggSpriteHook() {
        if (!settings.pixelPerfect) {
            if (eggSpriteWrapper && window.ebEggSprite === eggSpriteWrapper) window.ebEggSprite = eggSpriteOriginal;
            eggSpriteOriginal = null;
            eggSpriteWrapper = null;
            restoreEggSprites();
            return;
        }
        const current = window.ebEggSprite;
        if (typeof current !== 'function' || current === eggSpriteWrapper) return;
        eggSpriteOriginal = current;
        eggSpriteWrapper = function (mx, my) {
            const sprite = eggSpriteOriginal.call(this, mx, my);
            const texture = getPerfectEggTexture();
            if (texture) rememberAndReplaceEggSprite(sprite, texture);
            return sprite;
        };
        window.ebEggSprite = eggSpriteWrapper;
    }

    function isEggTextureName(name) {
        return typeof name === 'string' && /(?:^|\/)egg-(?:field|pumpkin)(?:-cream)?\.png(?:[?#]|$)/i.test(name);
    }

    function syncExistingEggSprites(game) {
        const pixi = window.PIXI;
        const cache = pixi && pixi.utils && pixi.utils.TextureCache;
        if (!cache) return;
        const eggTextures = new Set(Object.entries(cache).filter(([name]) => isEggTextureName(name)).map(([, texture]) => texture));
        const replacement = getPerfectEggTexture();
        if (!replacement || !eggTextures.size) return;
        const replace = sprite => {
            if (sprite && eggTextures.has(sprite.texture)) rememberAndReplaceEggSprite(sprite, replacement);
        };
        for (const player of Object.values(game.players || {})) replace(player.look && player.look.egg);
        for (const body of Object.values(game.bodies || {})) {
            if (body && body.type === 'egg') replace(body.look);
        }
    }

    function restoreGameZoom() {
        if (!gameZoom) return;
        const { game, camera, zoomLevel, overview, pinned } = gameZoom;
        if (game.camera === camera) {
            camera.overview = overview;
            camera.pinned = pinned;
            game.zoomLevel = zoomLevel;
        }
        gameZoom = null;
    }

    function syncZoom() {
        const game = getGame();
        if (!settings.zoomOut || !game) {
            restoreGameZoom();
            zoomStatus = settings.zoomOut ? 'waiting for Eggball camera' : 'off';
            return;
        }
        const camera = game.camera;
        if (!gameZoom || gameZoom.game !== game || gameZoom.camera !== camera) {
            restoreGameZoom();
            gameZoom = {
                game, camera, zoomLevel: game.zoomLevel,
                overview: camera.overview, pinned: camera.pinned,
            };
        }
        const wholeFieldZoom = Number(game.view.camera.wholeFieldZoom());
        if (!Number.isFinite(wholeFieldZoom) || wholeFieldZoom <= 0) {
            zoomStatus = 'whole-field zoom unavailable';
            return;
        }
        camera.overview = true;
        camera.pinned = true;
        game.zoomLevel = Math.max(1, wholeFieldZoom / settings.zoomFactor);
        zoomStatus = 'full field (' + Math.round(100 / settings.zoomFactor) + '%)';
    }

    function findGameCanvas() {
        const game = getGame();
        return game && game.view.canvas instanceof HTMLCanvasElement ? game.view.canvas : null;
    }

    function canAutoClick() {
        if (!settings.autoClick || !(shiftHeld || mouseHeld) || !canvas || !canvas.isConnected || !pointer) return false;
        if (document.visibilityState === 'hidden') return false;
        const active = document.activeElement;
        if (active && (active.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName))) return false;
        const rect = canvas.getBoundingClientRect();
        if (pointer.x < rect.left || pointer.x >= rect.right || pointer.y < rect.top || pointer.y >= rect.bottom) return false;
        return document.elementFromPoint(pointer.x, pointer.y) === canvas;
    }

    function stopClicking() {
        if (clickTimer !== null) clearInterval(clickTimer);
        clickTimer = null;
    }

    function dispatchClick() {
        if (!canAutoClick()) { stopClicking(); return; }
        const init = {
            bubbles: true, cancelable: true, composed: true,
            clientX: pointer.x, clientY: pointer.y,
            button: 0, buttons: 1, pointerId: 1, pointerType: 'mouse', isPrimary: true,
        };
        canvas.dispatchEvent(new PointerEvent('pointerdown', init));
        canvas.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 }));
    }

    function syncClicking() {
        if (!canAutoClick()) { stopClicking(); return; }
        if (clickTimer === null) {
            dispatchClick();
            if (canAutoClick()) clickTimer = setInterval(dispatchClick, settings.clickIntervalMs);
        }
    }

    function updateStatus() {
        if (!status) return;
        if (!getGame()) {
            status.textContent = 'Waiting for PlayEggball game';
            return;
        }
        const count = changedSprites.size;
        status.textContent = 'View: ' + zoomStatus + ' | Egg: ' +
            (!settings.pixelPerfect ? 'off' : count ? 'replaced (' + count + ')' : 'waiting for egg sprite');
    }

    function setSetting(key, value) {
        settings[key] = value;
        saveSettings();
        if (key === 'autoClick' && !value) stopClicking();
        if (key === 'pixelPerfect') installEggSpriteHook();
        if (key === 'zoomOut' && !value) restoreGameZoom();
        syncZoom();
        syncClicking();
        updateStatus();
    }

    function checkbox(label, key) {
        const row = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = settings[key];
        input.addEventListener('change', () => setSetting(key, input.checked));
        row.append(input, document.createTextNode(' ' + label));
        return row;
    }

    function mountPanel() {
        if (panel || !document.body || !document.head) return;
        const style = document.createElement('style');
        style.textContent = `
          #eggpro-panel[hidden]{display:none!important}
          #eggpro-panel{position:fixed;top:12px;right:12px;z-index:2147483647;display:flex;
            flex-direction:column;gap:7px;min-width:230px;padding:12px;border:1px solid #777;
            border-radius:9px;background:rgba(18,20,29,.94);color:#fff;font:12px/1.35 system-ui,sans-serif;
            box-shadow:0 6px 24px #0007}
          #eggpro-panel label{display:block;cursor:pointer}
          #eggpro-panel input[type=number]{width:65px}
          #eggpro-panel button,#eggpro-panel input{font:inherit}
          #eggpro-panel button{cursor:pointer}
          #eggpro-panel small{color:#c8c8d0}
        `;
        document.head.append(style);
        panel = document.createElement('aside');
        panel.id = 'eggpro-panel';
        const title = document.createElement('strong');
        title.textContent = 'EggPro 2.0';

        const zoomLabel = document.createElement('label');
        zoomLabel.append(document.createTextNode('Whole-field zoom factor '));
        const zoomInput = document.createElement('input');
        zoomInput.type = 'number'; zoomInput.min = '0.5'; zoomInput.max = '1'; zoomInput.step = '0.05';
        zoomInput.value = String(settings.zoomFactor);
        zoomInput.addEventListener('change', () => {
            const value = Number(zoomInput.value);
            if (Number.isFinite(value) && value >= 0.5 && value <= 1) {
                settings.zoomFactor = value;
                saveSettings(); syncZoom(); updateStatus();
            } else zoomInput.value = String(settings.zoomFactor);
        });
        zoomLabel.append(zoomInput);

        const intervalLabel = document.createElement('label');
        intervalLabel.append(document.createTextNode('Auto-click interval (ms) '));
        const intervalInput = document.createElement('input');
        intervalInput.type = 'number'; intervalInput.min = '80'; intervalInput.max = '1000'; intervalInput.step = '5';
        intervalInput.value = String(settings.clickIntervalMs);
        intervalInput.addEventListener('change', () => {
            const value = Number(intervalInput.value);
            if (Number.isInteger(value) && value >= 80 && value <= 1000) {
                settings.clickIntervalMs = value;
                saveSettings(); stopClicking(); syncClicking();
            } else intervalInput.value = String(settings.clickIntervalMs);
        });
        intervalLabel.append(intervalInput);

        fullscreenButton = document.createElement('button');
        fullscreenButton.type = 'button';
        fullscreenButton.addEventListener('click', async () => {
            try {
                if (document.fullscreenElement) await document.exitFullscreen();
                else await document.documentElement.requestFullscreen();
            } catch (error) {
                status.textContent = 'Fullscreen unavailable: ' + error.message;
            }
        });
        fullscreenButton.textContent = 'Enter fullscreen';
        status = document.createElement('small');
        panel.append(title,
            checkbox('23px pixel-perfect egg', 'pixelPerfect'),
            checkbox('Zoom out to the full field', 'zoomOut'),
            zoomLabel, fullscreenButton,
            checkbox('Auto-click while holding Shift or left mouse', 'autoClick'),
            intervalLabel,
            status);
        panel.addEventListener('pointerdown', event => event.stopPropagation());
        panel.addEventListener('mousedown', event => event.stopPropagation());
        document.body.append(panel);

        document.addEventListener('pointermove', event => {
            pointer = { x: event.clientX, y: event.clientY };
            if (shiftHeld || mouseHeld) syncClicking();
        }, { passive: true, capture: true });
        document.addEventListener('keydown', event => {
            if (event.key === 'Shift' && !event.repeat && !isTyping()) { shiftHeld = true; syncClicking(); }
            if (event.altKey && event.shiftKey && event.code === 'KeyE') { event.preventDefault(); panel.hidden = !panel.hidden; }
        }, true);
        document.addEventListener('keyup', event => { if (event.key === 'Shift') { shiftHeld = false; syncClicking(); } }, true);
        document.addEventListener('mousedown', event => {
            if (event.isTrusted && event.button === 0 && event.target === canvas) {
                pointer = { x: event.clientX, y: event.clientY };
                mouseHeld = true; syncClicking();
            }
        }, true);
        document.addEventListener('mouseup', event => {
            if (event.isTrusted && event.button === 0) { mouseHeld = false; syncClicking(); }
        }, true);
        window.addEventListener('blur', () => { shiftHeld = false; mouseHeld = false; stopClicking(); });
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') { shiftHeld = false; mouseHeld = false; stopClicking(); }
        });
        document.addEventListener('fullscreenchange', () => {
            if (fullscreenButton) fullscreenButton.textContent = document.fullscreenElement ? 'Exit fullscreen' : 'Enter fullscreen';
            setTimeout(syncZoom, 100);
        });
        window.addEventListener('resize', () => setTimeout(syncZoom, 100));
        window.addEventListener('pagehide', () => {
            stopClicking(); restoreGameZoom();
            clearInterval(syncTimer);
            if (eggSpriteWrapper && window.ebEggSprite === eggSpriteWrapper) window.ebEggSprite = eggSpriteOriginal;
            restoreEggSprites();
        }, { once: true });

        syncTimer = setInterval(() => {
            canvas = findGameCanvas();
            installEggSpriteHook();
            const game = getGame();
            if (settings.pixelPerfect && game) syncExistingEggSprites(game);
            syncZoom(); updateStatus();
        }, 250);
        canvas = findGameCanvas();
        installEggSpriteHook();
        syncZoom(); updateStatus();
    }

    function isTyping() {
        const active = document.activeElement;
        return !!active && (active.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName));
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountPanel, { once: true });
    else mountPanel();
})();
