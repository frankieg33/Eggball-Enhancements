// ==UserScript==
// @name         EggPro for PlayEggball
// @namespace    https://github.com/frankieg33/Eggball-Enhancements
// @version      2.0.0-beta.1
// @description  Full-viewport play, pixel-sharp ball assets, and hold-to-auto-click.
// @author       frankieg33
// @match        https://playeggball.com/play*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(() => {
    'use strict';

    // This is a separate integration, not a drop-in replacement for TagPro's API.
    // The live PlayEggball renderer has not been identified. Pixel sharpening only
    // applies to recognisable DOM, Canvas2D, and exposed PIXI texture assets.
    const STORAGE_KEY = 'eggpro.playeggball.settings.v1';
    const DEFAULTS = {
        pixelPerfect: true,
        fullViewport: true,
        autoClick: false,
        clickIntervalMs: 125,
        inputMode: 'mouse', // 'mouse' or 'pointer', depending on game input handling
    };
    const settings = loadSettings();
    const cachedSources = new WeakMap();
    const modifiedPixiTextures = new Map();
    const ballPattern = /(?:^|[\/_.\-\s])(egg|ball|football)(?:[\/_.\-\s]|$)/i;

    let canvas = null;
    let stage = null;
    let panel = null;
    let statusElement = null;
    let fullscreenButton = null;
    let shiftHeld = false;
    let mouseHeld = false;
    let pointer = null;
    let clickTimer = null;
    let refreshTimer = null;
    let matchedBallAsset = false;

    function loadSettings() {
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
            const valid = saved && typeof saved === 'object' ? saved : {};
            return {
                ...DEFAULTS,
                pixelPerfect: typeof valid.pixelPerfect === 'boolean' ? valid.pixelPerfect : DEFAULTS.pixelPerfect,
                fullViewport: typeof valid.fullViewport === 'boolean' ? valid.fullViewport : DEFAULTS.fullViewport,
                autoClick: typeof valid.autoClick === 'boolean' ? valid.autoClick : DEFAULTS.autoClick,
                clickIntervalMs: Number.isInteger(valid.clickIntervalMs) && valid.clickIntervalMs >= 80 && valid.clickIntervalMs <= 1000
                    ? valid.clickIntervalMs : DEFAULTS.clickIntervalMs,
                inputMode: valid.inputMode === 'pointer' ? 'pointer' : 'mouse',
            };
        } catch {
            return { ...DEFAULTS };
        }
    }

    function saveSettings() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { /* storage unavailable */ }
    }

    function isBallAsset(value) {
        return typeof value === 'string' && ballPattern.test(value.split('?')[0].split('#')[0]);
    }

    function isBallImage(source) {
        if (!source || (typeof source !== 'object' && typeof source !== 'function')) return false;
        const src = typeof source.currentSrc === 'string' && source.currentSrc
            ? source.currentSrc : typeof source.src === 'string' ? source.src : '';
        const old = cachedSources.get(source);
        if (old && old.src === src) return old.matches;
        const matches = isBallAsset(src);
        cachedSources.set(source, { src, matches });
        if (matches) matchedBallAsset = true;
        return matches;
    }

    // Draw only identifiable egg/ball images without smoothing. No global pixelation
    // of the entire playing field, and no assumptions about sprite coordinates.
    if (typeof CanvasRenderingContext2D !== 'undefined') {
        const prototype = CanvasRenderingContext2D.prototype;
        const original = prototype.drawImage;
        if (typeof original === 'function') {
            const patchedDrawImage = function (source, ...args) {
                if (!settings.pixelPerfect || !isBallImage(source)) {
                    return original.call(this, source, ...args);
                }
                const previous = this.imageSmoothingEnabled;
                this.imageSmoothingEnabled = false;
                try {
                    return original.call(this, source, ...args);
                } finally {
                    this.imageSmoothingEnabled = previous;
                }
            };
            prototype.drawImage = patchedDrawImage;
            window.addEventListener('pagehide', () => {
                if (prototype.drawImage === patchedDrawImage) prototype.drawImage = original;
            }, { once: true });
        }
    }

    // PIXI v5-v7 best effort: change scale mode only for matching cached textures.
    function syncPixiTextures() {
        const pixi = window.PIXI;
        const cache = pixi && pixi.utils && pixi.utils.TextureCache;
        const nearest = pixi && pixi.SCALE_MODES && pixi.SCALE_MODES.NEAREST;
        if (settings.pixelPerfect && cache && nearest !== undefined) {
            for (const [name, texture] of Object.entries(cache)) {
                if (!isBallAsset(name)) continue;
                const base = texture && texture.baseTexture;
                if (!base || !('scaleMode' in base)) continue;
                matchedBallAsset = true;
                if (!modifiedPixiTextures.has(base)) modifiedPixiTextures.set(base, base.scaleMode);
                if (base.scaleMode !== nearest) {
                    base.scaleMode = nearest;
                    if (typeof base.update === 'function') base.update();
                }
            }
        } else if (!settings.pixelPerfect) {
            for (const [base, oldMode] of modifiedPixiTextures) {
                base.scaleMode = oldMode;
                if (typeof base.update === 'function') base.update();
            }
            modifiedPixiTextures.clear();
        }
    }

    function syncDomBallImages() {
        for (const image of document.querySelectorAll('img')) {
            const id = [image.currentSrc, image.getAttribute('src'), image.alt, image.id, image.className]
                .filter(value => typeof value === 'string').join(' ');
            if (isBallAsset(id)) matchedBallAsset = true;
            image.classList.toggle('eggpro-perfect-ball', settings.pixelPerfect && isBallAsset(id));
        }
    }

    function findGameCanvas() {
        let best = null;
        let maxArea = 0;
        for (const candidate of document.querySelectorAll('canvas')) {
            if (panel && panel.contains(candidate)) continue;
            const r = candidate.getBoundingClientRect();
            const area = r.width * r.height;
            if (r.width >= 320 && r.height >= 200 && area > maxArea) {
                best = candidate;
                maxArea = area;
            }
        }
        return best;
    }

    function stopClicking() {
        if (clickTimer !== null) clearInterval(clickTimer);
        clickTimer = null;
    }

    function isTyping() {
        const active = document.activeElement;
        return !!active && (active.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName));
    }

    function canAutoClick() {
        if (!settings.autoClick || !(shiftHeld || mouseHeld) || !canvas || !canvas.isConnected || !pointer) return false;
        if (document.visibilityState === 'hidden' || isTyping()) return false;
        const r = canvas.getBoundingClientRect();
        if (pointer.x < r.left || pointer.x >= r.right || pointer.y < r.top || pointer.y >= r.bottom) return false;
        const hit = document.elementFromPoint(pointer.x, pointer.y);
        return hit === canvas || (hit && canvas.contains(hit));
    }

    function dispatchClick() {
        if (!canAutoClick()) { stopClicking(); return; }
        const options = {
            bubbles: true, cancelable: true, composed: true,
            clientX: pointer.x, clientY: pointer.y,
            button: 0, buttons: 1, detail: 1,
        };
        if (settings.inputMode === 'pointer' && typeof PointerEvent === 'function') {
            canvas.dispatchEvent(new PointerEvent('pointerdown', { ...options, pointerId: 1, pointerType: 'mouse', isPrimary: true }));
            canvas.dispatchEvent(new PointerEvent('pointerup', { ...options, buttons: 0, pointerId: 1, pointerType: 'mouse', isPrimary: true }));
        } else {
            canvas.dispatchEvent(new MouseEvent('mousedown', options));
            canvas.dispatchEvent(new MouseEvent('mouseup', { ...options, buttons: 0 }));
        }
        canvas.dispatchEvent(new MouseEvent('click', { ...options, buttons: 0 }));
    }

    function syncClicking() {
        if (!canAutoClick()) { stopClicking(); return; }
        if (clickTimer !== null) return;
        dispatchClick();
        if (canAutoClick()) clickTimer = setInterval(dispatchClick, settings.clickIntervalMs);
    }

    function syncViewport() {
        if (!canvas || !canvas.isConnected) return;
        const parent = canvas.parentElement;
        const nextStage = parent && parent !== document.body && parent !== document.documentElement ? parent : canvas;
        if (stage !== nextStage) {
            if (stage) stage.classList.remove('eggpro-full-viewport');
            stage = nextStage;
        }
        stage.classList.toggle('eggpro-full-viewport', settings.fullViewport);
        document.documentElement.classList.toggle('eggpro-view-active', settings.fullViewport);
    }

    function refresh() {
        refreshTimer = null;
        const nextCanvas = findGameCanvas();
        if (canvas !== nextCanvas) {
            stopClicking();
            canvas = nextCanvas;
            mouseHeld = false;
            if (!canvas && stage) {
                stage.classList.remove('eggpro-full-viewport');
                stage = null;
                document.documentElement.classList.remove('eggpro-view-active');
            }
        }
        if (canvas) syncViewport();
        syncDomBallImages();
        syncPixiTextures();
        updateStatus();
    }

    function scheduleRefresh() {
        if (refreshTimer === null) refreshTimer = setTimeout(refresh, 100);
    }

    function setSetting(key, value) {
        settings[key] = value;
        saveSettings();
        if (key === 'autoClick' && !value) stopClicking();
        if (key === 'pixelPerfect' || key === 'fullViewport') scheduleRefresh();
        if (key === 'autoClick' && value) syncClicking();
        updateStatus();
    }

    function updateStatus() {
        if (statusElement) {
            statusElement.textContent = !canvas ? 'Waiting for game canvas'
                : !matchedBallAsset && settings.pixelPerfect ? 'Canvas found. Ball renderer not identified'
                : 'Canvas ready' + (matchedBallAsset ? ' · ball asset found' : '');
        }
        if (fullscreenButton) fullscreenButton.textContent = document.fullscreenElement ? 'Exit fullscreen' : 'Browser fullscreen';
    }

    function makeCheckbox(label, key) {
        const line = document.createElement('label');
        const box = document.createElement('input');
        box.type = 'checkbox';
        box.checked = !!settings[key];
        box.addEventListener('change', () => setSetting(key, box.checked));
        line.append(box, document.createTextNode(' ' + label));
        return line;
    }

    function mountPanel() {
        if (panel) return;
        panel = document.createElement('div');
        panel.id = 'eggpro-panel';
        const title = document.createElement('strong');
        title.textContent = 'EggPro 2.0';
        const autoLabel = makeCheckbox('Auto click (hold Shift or left mouse)', 'autoClick');
        const rateLabel = document.createElement('label');
        rateLabel.textContent = 'Click interval (ms) ';
        const rate = document.createElement('input');
        rate.type = 'number'; rate.min = '80'; rate.max = '1000'; rate.step = '5'; rate.value = String(settings.clickIntervalMs);
        rate.addEventListener('change', () => {
            const value = Number(rate.value);
            if (Number.isInteger(value) && value >= 80 && value <= 1000) {
                stopClicking(); setSetting('clickIntervalMs', value); syncClicking();
            } else rate.value = String(settings.clickIntervalMs);
        });
        rateLabel.append(rate);
        const modeLabel = document.createElement('label');
        modeLabel.textContent = 'Input events ';
        const mode = document.createElement('select');
        for (const name of ['mouse', 'pointer']) {
            const option = document.createElement('option');
            option.value = name; option.textContent = name; mode.append(option);
        }
        mode.value = settings.inputMode;
        mode.addEventListener('change', () => setSetting('inputMode', mode.value));
        modeLabel.append(mode);
        fullscreenButton = document.createElement('button');
        fullscreenButton.type = 'button';
        fullscreenButton.addEventListener('click', async () => {
            try {
                if (document.fullscreenElement) await document.exitFullscreen();
                else await document.documentElement.requestFullscreen();
                updateStatus();
            } catch (error) {
                if (statusElement) statusElement.textContent = 'Fullscreen unavailable: ' + error.message;
            }
        });
        statusElement = document.createElement('small');
        panel.append(title,
            makeCheckbox('Pixel-sharp ball assets', 'pixelPerfect'),
            makeCheckbox('Full-viewport field', 'fullViewport'),
            fullscreenButton, autoLabel, rateLabel, modeLabel, statusElement);
        panel.addEventListener('pointerdown', e => e.stopPropagation());
        panel.addEventListener('mousedown', e => e.stopPropagation());
        document.body.append(panel);
        // Hide/show the configuration panel without affecting live game input.
        document.addEventListener('keydown', e => {
            if (e.altKey && e.shiftKey && e.code === 'KeyE') {
                e.preventDefault();
                panel.hidden = !panel.hidden;
            }
        }, true);
        updateStatus();
    }

    function init() {
        if (!document.body) return;
        const style = document.createElement('style');
        style.textContent = `
          .eggpro-perfect-ball { image-rendering: pixelated !important; }
          html.eggpro-view-active, html.eggpro-view-active body { overflow: hidden !important; }
          .eggpro-full-viewport { position: fixed !important; inset: 0 !important;
            width: 100vw !important; height: 100vh !important; height: 100dvh !important;
            max-width: none !important; max-height: none !important;
            margin: 0 !important; padding: 0 !important;
            background: #101015 !important; z-index: 2147483600 !important; }
          canvas.eggpro-full-viewport { object-fit: contain !important; }
          .eggpro-full-viewport canvas { display: block !important; width: 100% !important;
            height: 100% !important; max-width: none !important; max-height: none !important;
            object-fit: contain !important; }
          #eggpro-panel[hidden] { display: none !important; }
          #eggpro-panel { position: fixed; top: 12px; right: 12px; z-index: 2147483647;
            display: flex; flex-direction: column; gap: 7px; min-width: 230px;
            padding: 12px; border: 1px solid #777; border-radius: 9px;
            background: rgba(18, 20, 29, .94); color: #fff;
            font: 12px/1.35 system-ui, sans-serif; box-shadow: 0 6px 24px #0007; }
          #eggpro-panel label { display: block; cursor: pointer; }
          #eggpro-panel input[type=number] { width: 65px; }
          #eggpro-panel button, #eggpro-panel input, #eggpro-panel select { font: inherit; }
          #eggpro-panel button { cursor: pointer; }
          #eggpro-panel small { color: #c8c8d0; }
        `;
        document.head.append(style);
        mountPanel();
        document.addEventListener('pointermove', e => {
            pointer = { x: e.clientX, y: e.clientY };
            if (shiftHeld || mouseHeld) syncClicking();
        }, { passive: true, capture: true });
        document.addEventListener('mousemove', e => {
            pointer = { x: e.clientX, y: e.clientY };
        }, { passive: true, capture: true });
        document.addEventListener('keydown', e => {
            if (e.key === 'Shift' && !e.repeat && !isTyping()) { shiftHeld = true; syncClicking(); }
        }, true);
        document.addEventListener('keyup', e => {
            if (e.key === 'Shift') { shiftHeld = false; syncClicking(); }
        }, true);
        document.addEventListener('mousedown', e => {
            if (e.isTrusted && e.button === 0 && e.target === canvas) {
                pointer = { x: e.clientX, y: e.clientY };
                mouseHeld = true; syncClicking();
            }
        }, true);
        document.addEventListener('mouseup', e => {
            if (e.button === 0 && e.isTrusted) { mouseHeld = false; syncClicking(); }
        }, true);
        window.addEventListener('blur', () => { shiftHeld = false; mouseHeld = false; stopClicking(); });
        document.addEventListener('pointerleave', e => {
            if (e.target === canvas) { mouseHeld = false; stopClicking(); }
        }, true);
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') { shiftHeld = false; mouseHeld = false; stopClicking(); }
        });
        document.addEventListener('fullscreenchange', updateStatus);
        new MutationObserver(scheduleRefresh).observe(document.body, {
            childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'alt'],
        });
        // PIXI caches may appear after initial DOM rendering.
        setInterval(syncPixiTextures, 2000);
        refresh();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else init();
})();