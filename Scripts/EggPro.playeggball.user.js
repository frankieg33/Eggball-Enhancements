// ==UserScript==
// @name         EggPro for PlayEggball
// @namespace    https://github.com/frankieg33/Eggball-Enhancements
// @version      2.0
// @description  Pixel-perfect egg, full-field camera zoom, fullscreen, and hold-to-auto-click.
// @author       frankieg33
// @match        https://playeggball.com/game*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(() => {
    'use strict';

    const STORAGE_KEY = 'eggpro.playeggball.settings.v6';
    const LEGACY_STORAGE_KEYS = ['eggpro.playeggball.settings.v5', 'eggpro.playeggball.settings.v4', 'eggpro.playeggball.settings.v3', 'eggpro.playeggball.settings.v2', 'eggpro.playeggball.settings.v1'];
    const DEFAULTS = {
        pixelPerfect: true, zoomOut: true, zoomFactor: 1.3, autoClick: false,
        autoClickKey: 'none', clickIntervalMs: 125, overlayPosition: { right: 12, top: 50 },
        panelCollapsed: false,
    };
    const PERFECT_EGG_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABcAAAAXCAYAAADgKtSgAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAGaSURBVEhLtZWhTgNBEIZHnCVBIHgQZEVFFUFAgkAiiuANEDgEAoM7jSAhOdkHKAmiSRGV4PsAPMIw/+zs3S7M5W4hveTrZmdn/t2bnZsSM/ciz5FwJ6yErQAjRsxhn3hxEd9INBWWAiZDYKOpq5NNiCrhXtDAwwPimyvit2fi7au4fIZx9UJ8ex3Wo6/FVZneD+FGUOeLY+KvdRDsA+uXZ9kGiG830B8T1xPv7xE3j53AGBZ19hZ1Ji4PcqyLpcIRbBA1hJNUXC8PqfACx5KkaGO6Wm76WkM5HgLxSXqQDa1XrQovoBTomPgDxFGnWm6ecynQMXHohi8v1vF/gY6JQzdMPMe/EjUhvtOTa87fG9+5FLQGE9eca7WgV3jOpUDHxLVaJpjsoM5nYsUYUoMvzAsay/y8Ff4QKrGqeNtb0CO8wCGWT60w6HqLbaBdEa9VugGEk3TkXdHEs36OFA3dAdaTVAC/nycb1II64zQF/0SI8/+JMiPRqbAR0uA+cHma4186njEiDy4a9Ypq0i/ZRsxhnwnZaTuYvgG0oJH7d9/FWQAAAABJRU5ErkJggg==';
    const settings = loadSettings();
    const changedSprites = new Map();
    let eggTextures = new Set();
    let textureHookPrototype = null;
    let originalTextureDescriptor = null;
    let textureSetterWrapper = null;
    let creatingEggSprite = 0;

    let panel = null;
    let status = null;
    let fullscreenButton = null;
    let canvas = null;
    let gameZoom = null;
    let eggSpriteOriginal = null;
    let eggSpriteWrapper = null;
    let perfectEggTexture = null;
    let pointer = null;
    let gateKeyHeld = false;
    let mouseHeld = false;
    let clickTimer = null;
    let syncTimer = null;
    let dragState = null;
    let zoomStatus = 'waiting for Eggball camera';

    for (const type of ['keydown', 'keyup']) {
        window.addEventListener(type, event => {
            if (panel && panel.contains(event.target)) {
                if (type === 'keyup' && isAutoClickKey(event)) {
                    gateKeyHeld = false;
                    syncClicking();
                }
                event.stopImmediatePropagation();
            }
        }, true);
    }

    function loadSettings() {
        try {
            const current = localStorage.getItem(STORAGE_KEY);
            const legacy = current === null
                ? LEGACY_STORAGE_KEYS.map(key => localStorage.getItem(key)).find(value => value !== null) : null;
            const saved = JSON.parse(current || legacy || '{}');
            const loaded = {
                pixelPerfect: typeof saved.pixelPerfect === 'boolean' ? saved.pixelPerfect : DEFAULTS.pixelPerfect,
                zoomOut: typeof saved.zoomOut === 'boolean' ? saved.zoomOut : DEFAULTS.zoomOut,
                zoomFactor: Number.isFinite(saved.zoomFactor) && saved.zoomFactor >= 0.5 && saved.zoomFactor <= 3
                    ? saved.zoomFactor : DEFAULTS.zoomFactor,
                autoClick: typeof saved.autoClick === 'boolean' ? saved.autoClick : DEFAULTS.autoClick,
                autoClickKey: ['none', 'Shift', 'Space', 'Control', 'Alt'].includes(saved.autoClickKey)
                    ? saved.autoClickKey : DEFAULTS.autoClickKey,
                clickIntervalMs: Number.isInteger(saved.clickIntervalMs) && saved.clickIntervalMs >= 80 && saved.clickIntervalMs <= 1000
                    ? saved.clickIntervalMs : DEFAULTS.clickIntervalMs,
                overlayPosition: saved.overlayPosition && saved.overlayPosition.left === 12 && saved.overlayPosition.top === 50
                    ? { ...DEFAULTS.overlayPosition }
                    : saved.overlayPosition && Number.isFinite(saved.overlayPosition.top) &&
                    (Number.isFinite(saved.overlayPosition.left) || Number.isFinite(saved.overlayPosition.right))
                    ? saved.overlayPosition.left !== undefined
                        ? { left: Math.max(0, saved.overlayPosition.left), top: Math.max(0, saved.overlayPosition.top) }
                        : { right: Math.max(0, saved.overlayPosition.right), top: Math.max(0, saved.overlayPosition.top) }
                    : { ...DEFAULTS.overlayPosition },
                panelCollapsed: typeof saved.panelCollapsed === 'boolean' ? saved.panelCollapsed : DEFAULTS.panelCollapsed,
            };
            if (!current && legacy) localStorage.setItem(STORAGE_KEY, JSON.stringify(loaded));
            return loaded;
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
        if (!base || !base.valid || perfectEggTexture.width !== 23 || perfectEggTexture.height !== 23) return null;
        const nearest = pixi.SCALE_MODES && pixi.SCALE_MODES.NEAREST;
        if (base && nearest !== undefined && base.scaleMode !== nearest) {
            base.scaleMode = nearest;
            if (typeof base.update === 'function') base.update();
        }
        return perfectEggTexture;
    }

    function replaceEggSpriteWhenReady(sprite) {
        const texture = getPerfectEggTexture();
        if (texture) return rememberAndReplaceEggSprite(sprite, texture);
        const base = perfectEggTexture && perfectEggTexture.baseTexture;
        if (!base || base.valid || typeof base.once !== 'function') return false;
        base.once('loaded', () => {
            if (!settings.pixelPerfect || sprite.destroyed) return;
            const loadedTexture = getPerfectEggTexture();
            if (loadedTexture) rememberAndReplaceEggSprite(sprite, loadedTexture);
        });
        return false;
    }

    function rememberAndReplaceEggSprite(sprite, texture) {
        if (!sprite || !sprite.texture || sprite.destroyed) return false;
        let previous = changedSprites.get(sprite);
        if (!previous) {
            const scaleX = sprite.scale.x;
            const scaleY = sprite.scale.y;
            const pivotX = sprite.pivot.x;
            const pivotY = sprite.pivot.y;
            previous = {
                texture: sprite.texture, scaleX, scaleY, pivotX, pivotY,
                centerX: sprite.width / 2 - pivotX * scaleX,
                centerY: sprite.height / 2 - pivotY * scaleY,
            };
            changedSprites.set(sprite, previous);
        }
        sprite.texture = texture;
        applyPerfectEggGeometry(sprite, previous);
        return true;
    }

    function applyPerfectEggGeometry(sprite, original) {
        sprite.width = 23;
        sprite.height = 23;
        sprite.pivot.set(11.5 - original.centerX, 11.5 - original.centerY);
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

    function syncEggTextureHook() {
        const pixi = window.PIXI;
        const cache = pixi && pixi.utils && pixi.utils.TextureCache;
        eggTextures = new Set(cache ? Object.entries(cache)
            .filter(([name]) => isEggTextureName(name)).map(([, texture]) => texture) : []);
        const prototype = pixi && pixi.Sprite && pixi.Sprite.prototype;
        if (!settings.pixelPerfect || !prototype || !eggTextures.size) {
            if (textureHookPrototype && Object.getOwnPropertyDescriptor(textureHookPrototype, 'texture')?.set === textureSetterWrapper) {
                Object.defineProperty(textureHookPrototype, 'texture', originalTextureDescriptor);
            }
            textureHookPrototype = null;
            originalTextureDescriptor = null;
            textureSetterWrapper = null;
            return;
        }
        if (prototype === textureHookPrototype && Object.getOwnPropertyDescriptor(prototype, 'texture')?.set === textureSetterWrapper) return;
        if (textureHookPrototype && Object.getOwnPropertyDescriptor(textureHookPrototype, 'texture')?.set === textureSetterWrapper) {
            Object.defineProperty(textureHookPrototype, 'texture', originalTextureDescriptor);
        }
        const descriptor = Object.getOwnPropertyDescriptor(prototype, 'texture');
        if (!descriptor || typeof descriptor.set !== 'function') return;
        textureHookPrototype = prototype;
        originalTextureDescriptor = descriptor;
        textureSetterWrapper = function (value) {
            const replacement = settings.pixelPerfect && !creatingEggSprite && eggTextures.has(value) ? getPerfectEggTexture() : null;
            if (!replacement || value === replacement) return descriptor.set.call(this, value);
            const previous = changedSprites.get(this);
            if (previous) {
                previous.texture = value;
                descriptor.set.call(this, replacement);
                applyPerfectEggGeometry(this, previous);
                return;
            }
            const width = this.width;
            const height = this.height;
            const scaleX = this.scale.x;
            const scaleY = this.scale.y;
            const pivotX = this.pivot.x;
            const pivotY = this.pivot.y;
            const original = {
                texture: value, scaleX, scaleY, pivotX, pivotY,
                centerX: width / 2 - pivotX * scaleX,
                centerY: height / 2 - pivotY * scaleY,
            };
            changedSprites.set(this, original);
            descriptor.set.call(this, replacement);
            applyPerfectEggGeometry(this, original);
        };
        Object.defineProperty(prototype, 'texture', { ...descriptor, set: textureSetterWrapper });
    }

    function installEggSpriteHook() {
        syncEggTextureHook();
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
            let sprite;
            creatingEggSprite++;
            try { sprite = eggSpriteOriginal.call(this, mx, my); }
            finally { creatingEggSprite--; }
            replaceEggSpriteWhenReady(sprite);
            return sprite;
        };
        window.ebEggSprite = eggSpriteWrapper;
    }

    function isEggTextureName(name) {
        return typeof name === 'string' && /(?:^|\/)egg-(?:field|pumpkin)(?:-cream)?\.png(?:[?#]|$)/i.test(name);
    }

    function syncExistingEggSprites(game) {
        for (const [sprite] of changedSprites) {
            if (sprite.destroyed) changedSprites.delete(sprite);
        }
        if (!eggTextures.size) return;
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
        game.zoomLevel = wholeFieldZoom / settings.zoomFactor;
        zoomStatus = 'full field (' + Math.round(100 / settings.zoomFactor) + '%)';
    }

    function findGameCanvas() {
        const game = getGame();
        return game && game.view.canvas instanceof HTMLCanvasElement ? game.view.canvas : null;
    }

    function canAutoClick() {
        if (!settings.autoClick || !(gateKeyHeld || mouseHeld) || !canvas || !canvas.isConnected || !pointer) return false;
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
        const game = window.eggball;
        const field = game && game.view && game.view.field;
        const globalPointer = game && game.view && game.view.painter &&
            game.view.painter.events && game.view.painter.events.pointer && game.view.painter.events.pointer.global;
        if (field && globalPointer && typeof field.toLocal === 'function' && typeof window.ebThrowAt === 'function') {
            try {
                const target = field.toLocal(globalPointer);
                if (Number.isFinite(target.x) && Number.isFinite(target.y)) {
                    window.ebThrowAt({ x: target.x, y: target.y });
                    return;
                }
            } catch { /* fall back to synthetic pointer events */ }
        }
        const init = {
            bubbles: true, cancelable: true, composed: true,
            clientX: pointer.x, clientY: pointer.y,
            button: 0, buttons: 1, pointerId: 1, pointerType: 'mouse', isPrimary: true,
        };
        canvas.dispatchEvent(new PointerEvent('pointerdown', init));
        canvas.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 }));
    }

    function syncClicking(deferInitial = false) {
        if (!canAutoClick()) { stopClicking(); return; }
        if (clickTimer === null) {
            if (!deferInitial) dispatchClick();
            if (canAutoClick()) clickTimer = setInterval(dispatchClick, settings.clickIntervalMs);
        }
    }

    function syncGameState() {
        canvas = findGameCanvas();
        installEggSpriteHook();
        const game = getGame();
        if (settings.pixelPerfect && game) syncExistingEggSprites(game);
        syncZoom();
        updateStatus();
    }

    function resumeGameSync() {
        if (syncTimer !== null) clearInterval(syncTimer);
        syncTimer = setInterval(syncGameState, 250);
        syncGameState();
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

    function applyOverlayPosition(positionOrLeft, top) {
        if (!panel) return;
        const maxLeft = Math.max(0, window.innerWidth - panel.offsetWidth);
        const maxTop = Math.max(0, window.innerHeight - panel.offsetHeight);
        const rightAnchored = typeof positionOrLeft === 'object' && Number.isFinite(positionOrLeft.right);
        const left = rightAnchored ? maxLeft - positionOrLeft.right
            : typeof positionOrLeft === 'object' ? positionOrLeft.left : positionOrLeft;
        const clampedLeft = Math.max(0, Math.min(left, maxLeft));
        const requestedTop = typeof positionOrLeft === 'object' ? positionOrLeft.top : top;
        const clampedTop = Math.max(0, Math.min(requestedTop, maxTop));
        settings.overlayPosition = rightAnchored
            ? { right: maxLeft - clampedLeft, top: clampedTop }
            : { left: clampedLeft, top: clampedTop };
        panel.style.left = clampedLeft + 'px';
        panel.style.top = settings.overlayPosition.top + 'px';
    }

    function saveOverlayPosition() {
        if (!panel) return;
        const rect = panel.getBoundingClientRect();
        applyOverlayPosition(rect.left, rect.top);
        saveSettings();
    }

    function setSetting(key, value) {
        settings[key] = value;
        saveSettings();
        if (key === 'autoClick' && !value) stopClicking();
        if (key === 'pixelPerfect') {
            installEggSpriteHook();
            const game = getGame();
            if (value && game) syncExistingEggSprites(game);
        }
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
          #eggpro-panel[hidden],#eggpro-controls[hidden]{display:none!important}
          #eggpro-panel{position:fixed;top:50px;left:12px;right:auto;z-index:2147483647;display:flex;
            box-sizing:border-box;width:230px;max-width:calc(100vw - 24px);flex-direction:column;gap:7px;
            padding:10px;border:1px solid #777;
            border-radius:9px;background:rgba(18,20,29,.94);color:#fff;font:12px/1.35 system-ui,sans-serif;
            box-shadow:0 6px 24px #0007}
          #eggpro-panel header{display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:6px;cursor:move;touch-action:none}
          #eggpro-controls{display:flex;flex-direction:column;gap:7px}
          #eggpro-panel label{display:block;overflow-wrap:anywhere;cursor:pointer}
          #eggpro-panel input[type=number]{width:65px}
          #eggpro-panel select{max-width:100%}
          #eggpro-panel button,#eggpro-panel input{font:inherit}
          #eggpro-panel button{max-width:100%;white-space:normal;cursor:pointer}
          #eggpro-panel small{color:#c8c8d0}
        `;
        document.head.append(style);
        panel = document.createElement('aside');
        panel.id = 'eggpro-panel';
        const zoomLabel = document.createElement('label');
        zoomLabel.append(document.createTextNode('Field zoom factor '));
        const zoomInput = document.createElement('input');
        zoomInput.type = 'number'; zoomInput.min = '0.5'; zoomInput.max = '3'; zoomInput.step = '0.01';
        zoomInput.value = String(settings.zoomFactor);
        zoomInput.addEventListener('change', () => {
            const value = Number(zoomInput.value);
            if (Number.isFinite(value) && value >= 0.5 && value <= 3) {
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

        const keyLabel = document.createElement('label');
        keyLabel.append(document.createTextNode('Auto-click key (None = mouse only) '));
        const keySelect = document.createElement('select');
        for (const [value, label] of [['none', 'None'], ['Shift', 'Shift'], ['Space', 'Space'], ['Control', 'Control'], ['Alt', 'Alt']]) {
            const option = document.createElement('option');
            option.value = value; option.textContent = label; keySelect.append(option);
        }
        keySelect.value = settings.autoClickKey;
        keySelect.addEventListener('change', () => {
            gateKeyHeld = false;
            keySelect.blur?.();
            setSetting('autoClickKey', keySelect.value);
        });
        keyLabel.append(keySelect);

        const header = document.createElement('header');
        const title = document.createElement('strong');
        title.textContent = 'EggPro 2.0';
        const collapseButton = document.createElement('button');
        collapseButton.type = 'button';
        const controls = document.createElement('div');
        controls.id = 'eggpro-controls';
        controls.hidden = settings.panelCollapsed;
        collapseButton.textContent = settings.panelCollapsed ? 'Expand' : 'Collapse';
        collapseButton.addEventListener('click', () => {
            settings.panelCollapsed = !controls.hidden;
            controls.hidden = settings.panelCollapsed;
            collapseButton.textContent = settings.panelCollapsed ? 'Expand' : 'Collapse';
            saveSettings();
            applyOverlayPosition(settings.overlayPosition, settings.overlayPosition.top);
        });
        header.append(title, collapseButton);

        status = document.createElement('small');
        controls.append(
            checkbox('23px pixel-perfect egg', 'pixelPerfect'),
            checkbox('Enable Eggball camera zoom', 'zoomOut'),
            zoomLabel, fullscreenButton, keyLabel,
            checkbox('Auto-click while holding configured key or left mouse', 'autoClick'),
            intervalLabel,
            status);
        panel.append(header, controls);
        document.body.append(panel);
        applyOverlayPosition(settings.overlayPosition, settings.overlayPosition.top);
        panel.addEventListener('pointerdown', event => event.stopPropagation());
        panel.addEventListener('mousedown', event => event.stopPropagation());
        header.addEventListener('pointerdown', event => {
            if (event.button !== 0 || event.target === collapseButton) return;
            const rect = panel.getBoundingClientRect();
            dragState = { pointerId: event.pointerId, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top };
            if (header.setPointerCapture && event.pointerId !== undefined) header.setPointerCapture(event.pointerId);
            event.preventDefault();
        });
        document.addEventListener('pointermove', event => {
            if (dragState && (event.pointerId === undefined || event.pointerId === dragState.pointerId)) {
                applyOverlayPosition(event.clientX - dragState.offsetX, event.clientY - dragState.offsetY);
            }
            pointer = { x: event.clientX, y: event.clientY };
            const releasedMouse = mouseHeld && (!event.pointerType || event.pointerType === 'mouse') &&
                typeof event.buttons === 'number' && (event.buttons & 1) === 0;
            if (releasedMouse) mouseHeld = false;
            if (gateKeyHeld || mouseHeld || releasedMouse) syncClicking();
        }, { passive: true, capture: true });
        const finishDrag = event => {
            if (!dragState || (event.pointerId !== undefined && event.pointerId !== dragState.pointerId)) return;
            dragState = null;
            saveOverlayPosition();
        };
        document.addEventListener('pointerup', finishDrag, true);
        document.addEventListener('pointercancel', event => {
            finishDrag(event);
            if (mouseHeld && (!event.pointerType || event.pointerType === 'mouse')) {
                mouseHeld = false;
                syncClicking();
            }
        }, true);
        document.addEventListener('keydown', event => {
            if (isAutoClickKey(event) && !event.repeat && !isTyping()) {
                gateKeyHeld = true; syncClicking();
            }
        }, true);
        document.addEventListener('keyup', event => {
            if (isAutoClickKey(event)) { gateKeyHeld = false; syncClicking(); }
        }, true);
        document.addEventListener('mousedown', event => {
            if (event.isTrusted && event.button === 0 && event.target === canvas) {
                pointer = { x: event.clientX, y: event.clientY };
                mouseHeld = true; syncClicking(!gateKeyHeld);
            }
        }, true);
        document.addEventListener('mouseup', event => {
            if (event.isTrusted && event.button === 0) { mouseHeld = false; syncClicking(); }
        }, true);
        window.addEventListener('blur', () => { gateKeyHeld = false; mouseHeld = false; stopClicking(); });
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') { gateKeyHeld = false; mouseHeld = false; stopClicking(); }
        });
        document.addEventListener('fullscreenchange', () => {
            if (fullscreenButton) fullscreenButton.textContent = document.fullscreenElement ? 'Exit fullscreen' : 'Enter fullscreen';
            setTimeout(syncZoom, 100);
        });
        window.addEventListener('resize', () => {
            applyOverlayPosition(settings.overlayPosition, settings.overlayPosition.top);
            setTimeout(syncZoom, 100);
        });
        window.addEventListener('pageshow', event => {
            if (event.persisted) resumeGameSync();
        });
        window.addEventListener('pagehide', () => {
            stopClicking(); restoreGameZoom();
            clearInterval(syncTimer);
            syncTimer = null;
            if (eggSpriteWrapper && window.ebEggSprite === eggSpriteWrapper) window.ebEggSprite = eggSpriteOriginal;
            if (textureHookPrototype && Object.getOwnPropertyDescriptor(textureHookPrototype, 'texture')?.set === textureSetterWrapper) {
                Object.defineProperty(textureHookPrototype, 'texture', originalTextureDescriptor);
            }
            textureHookPrototype = null;
            originalTextureDescriptor = null;
            textureSetterWrapper = null;
            restoreEggSprites();
        });

        resumeGameSync();
    }

    function isTyping() {
        const active = document.activeElement;
        return !!active && (active.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName));
    }

    function isAutoClickKey(event) {
        if (settings.autoClickKey === 'Space') return event.code === 'Space';
        return settings.autoClickKey !== 'none' && event.key === settings.autoClickKey;
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountPanel, { once: true });
    else mountPanel();
})();
