// ==UserScript==
// @name         EggPro for PlayEggball
// @namespace    https://github.com/frankieg33/Eggball-Enhancements
// @version      2.0.0-beta.2
// @description  Exact 23px egg graphic, camera zoom-out, fullscreen controls, and hold-to-auto-click.
// @author       frankieg33
// @match        https://playeggball.com/play*
// @match        https://playeggball.com/game*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(() => {
    'use strict';

    // This is a separate integration, not a drop-in replacement for TagPro's API.
    // Renderer-independent matching where possible. True zoom depends on a usable
    // game camera API or a 2D canvas that bases its view on backing dimensions.
    const STORAGE_KEY = 'eggpro.playeggball.settings.v1';
    const DEFAULTS = {
        pixelPerfect: true,
        fullViewport: true,
        zoomOut: true,
        zoomFactor: 0.75,
        canvasZoomFallback: true,
        autoClick: false,
        clickIntervalMs: 125,
        inputMode: 'mouse', // 'mouse' or 'pointer', depending on game input handling
    };
    const settings = loadSettings();
    const cachedSources = new WeakMap();
    const modifiedPixiTextures = new Map();
    const ballPattern = /(?:^|[\/_.\-\s])(egg|ball|football)(?:[\/_.\-\s]|$)/i;
    const eggPattern = /(?:^|[\/_.\-\s])(egg|football)(?:[\/_.\-\s]|$)/i;
    const PERFECT_EGG_URL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABcAAAAXCAYAAADgKtSgAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAGaSURBVEhLtZWhTgNBEIZHnCVBIHgQZEVFFUFAgkAiiuANEDgEAoM7jSAhOdkHKAmiSRGV4PsAPMIw/+zs3S7M5W4hveTrZmdn/t2bnZsSM/ciz5FwJ6yErQAjRsxhn3hxEd9INBWWAiZDYKOpq5NNiCrhXtDAwwPimyvit2fi7au4fIZx9UJ8ex3Wo6/FVZneD+FGUOeLY+KvdRDsA+uXZ9kGiG830B8T1xPv7xE3j53AGBZ19hZ1Ji4PcqyLpcIRbBA1hJNUXC8PqfACx5KkaGO6Wm76WkM5HgLxSXqQDa1XrQovoBTomPgDxFGnWm6ecynQMXHohi8v1vF/gY6JQzdMPMe/EjUhvtOTa87fG9+5FLQGE9eca7WgV3jOpUDHxLVaJpjsoM5nYsUYUoMvzAsay/y8Ff4QKrGqeNtb0CO8wCGWT60w6HqLbaBdEa9VugGEk3TkXdHEs36OFA3dAdaTVAC/nycb1II64zQF/0SI8/+JMiPRqbAR0uA+cHma4186njEiDy4a9Ypq0i/ZRsxhnwnZaTuYvgG0oJH7d9/FWQAAAABJRU5ErkJggg==";
    const domEggSources = new WeakMap();
    const pixiSpriteSources = new Map();
    const vectorCircles = new WeakMap();
    const originalCameraZooms = new WeakMap();
    let perfectEggImage = null;
    let zoomTarget = null;
    let zoomStatus = 'camera not found';
    let zoomedCanvas = null;
    let originalCanvasDimensions = null;
    let originalCanvasCss = null;
    let eggReplacements = 0;

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
                zoomOut: typeof valid.zoomOut === 'boolean' ? valid.zoomOut : DEFAULTS.zoomOut,
                zoomFactor: typeof valid.zoomFactor === 'number' && valid.zoomFactor >= 0.5 && valid.zoomFactor <= 1 ? valid.zoomFactor : DEFAULTS.zoomFactor,
                canvasZoomFallback: typeof valid.canvasZoomFallback === 'boolean' ? valid.canvasZoomFallback : DEFAULTS.canvasZoomFallback,
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

    function isEggAsset(value) {
        return typeof value === 'string' && eggPattern.test(value.split('?')[0].split('#')[0]);
    }

    function getPerfectEgg() {
        if (!perfectEggImage && typeof Image === 'function') {
            perfectEggImage = new Image();
            perfectEggImage.src = PERFECT_EGG_URL;
        }
        return perfectEggImage && perfectEggImage.complete && perfectEggImage.naturalWidth === 23
            ? perfectEggImage : null;
    }

    function isSmallEggImage(source) {
        if (!source) return false;
        const uri = source.currentSrc || source.src || '';
        const width = source.naturalWidth || source.videoWidth || source.width || 0;
        const height = source.naturalHeight || source.videoHeight || source.height || 0;
        return isEggAsset(uri) && width > 0 && width <= 64 && height > 0 && height <= 64;
    }

    // Only full-image drawing can be substituted. Crops out of atlases must
    // retain the original source to avoid drawing a wrong atlas region.
    function getEggDrawArgs(source, args) {
        if (args.length === 2) {
            return [args[0], args[1], source.naturalWidth || source.width, source.naturalHeight || source.height];
        }
        if (args.length === 4) return args;
        if (args.length === 8 &&
            args[0] === 0 && args[1] === 0 &&
            args[2] === (source.naturalWidth || source.width) &&
            args[3] === (source.naturalHeight || source.height)) {
            return args.slice(4);
        }
        return null;
    }

    function isEggFill(value) {
        if (typeof value !== 'string') return false;
        const color = value.replace(/\s+/g, '').toLowerCase();
        return ['#ffd800', '#ffda00', '#ffdb00', '#ffdc00', '#ffcc00', '#ffff00',
            'rgb(255,216,0)', 'rgb(255,220,0)', 'rgb(255,255,0)'].includes(color);
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

    // Replace matching image-based egg assets with the supplied exact 23x23
    // graphic. Keep other images, including sprite-atlas crops, untouched.
    if (typeof CanvasRenderingContext2D !== 'undefined') {
        const prototype = CanvasRenderingContext2D.prototype;
        const originalDrawImage = prototype.drawImage;
        const originalBeginPath = prototype.beginPath;
        const originalArc = prototype.arc;
        const originalFill = prototype.fill;
        if (typeof originalDrawImage === 'function') {
            const patchedDrawImage = function (source, ...args) {
                if (!settings.pixelPerfect || !isBallImage(source)) {
                    return originalDrawImage.call(this, source, ...args);
                }
                const egg = isSmallEggImage(source) ? getPerfectEgg() : null;
                const replacementArgs = egg && getEggDrawArgs(source, args);
                const previous = this.imageSmoothingEnabled;
                this.imageSmoothingEnabled = false;
                try {
                    if (replacementArgs) {
                        eggReplacements++;
                        return originalDrawImage.call(this, egg, ...replacementArgs);
                    }
                    return originalDrawImage.call(this, source, ...args);
                } finally {
                    this.imageSmoothingEnabled = previous;
                }
            };
            prototype.drawImage = patchedDrawImage;

            // Some 2D games render the egg as a yellow filled circle rather
            // than a sprite. Replace a single yellow full-circle path, while
            // preserving unrelated geometry and the original state machine.
            let patchedBeginPath = null;
            let patchedArc = null;
            let patchedFill = null;
            if (typeof originalBeginPath === 'function' &&
                typeof originalArc === 'function' && typeof originalFill === 'function') {
                patchedBeginPath = function (...args) {
                    vectorCircles.delete(this);
                    return originalBeginPath.apply(this, args);
                };
                patchedArc = function (x, y, radius, start, end, ...args) {
                    if (radius >= 8 && radius <= 17 && Math.abs(end - start) >= Math.PI * 2 - 0.01) {
                        vectorCircles.set(this, { x, y, radius });
                    } else vectorCircles.delete(this);
                    return originalArc.call(this, x, y, radius, start, end, ...args);
                };
                patchedFill = function (...args) {
                    const circle = vectorCircles.get(this);
                    vectorCircles.delete(this);
                    const egg = settings.pixelPerfect && circle && isEggFill(this.fillStyle) && getPerfectEgg();
                    if (!egg) return originalFill.apply(this, args);
                    const { x, y, radius } = circle;
                    this.save();
                    try {
                        this.imageSmoothingEnabled = false;
                        eggReplacements++;
                        return originalDrawImage.call(this, egg, x - radius, y - radius, radius * 2, radius * 2);
                    } finally {
                        this.restore();
                    }
                };
                prototype.beginPath = patchedBeginPath;
                prototype.arc = patchedArc;
                prototype.fill = patchedFill;
            }
            window.addEventListener('pagehide', () => {
                if (prototype.drawImage === patchedDrawImage) prototype.drawImage = originalDrawImage;
                if (patchedBeginPath && prototype.beginPath === patchedBeginPath) prototype.beginPath = originalBeginPath;
                if (patchedArc && prototype.arc === patchedArc) prototype.arc = originalArc;
                if (patchedFill && prototype.fill === patchedFill) prototype.fill = originalFill;
            }, { once: true });
        }
    }

    // PIXI v5-v7: replace known egg textures in exposed stage trees. Restore
    // each sprite's original texture when the option is disabled.
    function syncPixiTextures() {
        const pixi = window.PIXI;
        const cache = pixi && pixi.utils && pixi.utils.TextureCache;
        const nearest = pixi && pixi.SCALE_MODES && pixi.SCALE_MODES.NEAREST;
        const matchingTextures = new Set();
        if (settings.pixelPerfect && cache && nearest !== undefined) {
            for (const [name, texture] of Object.entries(cache)) {
                if (!isBallAsset(name)) continue;
                const base = texture && texture.baseTexture;
                if (!base || !('scaleMode' in base)) continue;
                matchedBallAsset = true;
                if (isEggAsset(name)) matchingTextures.add(texture);
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
        if (!settings.pixelPerfect) {
            for (const [sprite, original] of pixiSpriteSources) {
                if (!sprite.destroyed) {
                    sprite.texture = original.texture;
                    sprite.width = original.width;
                    sprite.height = original.height;
                }
            }
            pixiSpriteSources.clear();
            return;
        }
        if (!pixi || !pixi.Texture || typeof pixi.Texture.from !== 'function' || !matchingTextures.size) return;
        let texture;
        try { texture = pixi.Texture.from(PERFECT_EGG_URL); } catch { return; }
        const rootCandidates = [window.app, window.game, window.eggball, window.renderer, window.__PIXI_APP__];
        const roots = rootCandidates.flatMap(obj => obj ? [obj.stage, obj.renderer && obj.renderer.stage] : []).filter(Boolean);
        const work = [...new Set(roots)];
        let inspected = 0;
        while (work.length && inspected++ < 3000) {
            const node = work.pop();
            if (!node || typeof node !== 'object') continue;
            if (node.texture && matchingTextures.has(node.texture) && !pixiSpriteSources.has(node)) {
                pixiSpriteSources.set(node, { texture: node.texture, width: node.width, height: node.height });
                node.texture = texture;
                const original = pixiSpriteSources.get(node);
                node.width = original.width;
                node.height = original.height;
                eggReplacements++;
            }
            if (Array.isArray(node.children)) work.push(...node.children);
        }
    }

    function syncDomBallImages() {
        for (const image of document.querySelectorAll('img')) {
            const src = image.getAttribute('src') || '';
            const saved = domEggSources.get(image);
            if (saved && src !== PERFECT_EGG_URL) domEggSources.delete(image);
            const original = domEggSources.get(image) || src;
            const identity = [original, image.alt, image.id, image.className]
                .filter(value => typeof value === 'string').join(' ');
            if (isBallAsset(identity)) matchedBallAsset = true;
            const isEgg = isEggAsset(original) && image.naturalWidth > 0 &&
                image.naturalWidth <= 64 && image.naturalHeight > 0 && image.naturalHeight <= 64;
            if (settings.pixelPerfect && isEgg && src !== PERFECT_EGG_URL) {
                domEggSources.set(image, original);
                image.src = PERFECT_EGG_URL;
                eggReplacements++;
            } else if (!settings.pixelPerfect && saved && src === PERFECT_EGG_URL) {
                image.src = saved;
                domEggSources.delete(image);
            }
            image.classList.toggle('eggpro-perfect-ball', settings.pixelPerfect && isBallAsset(identity));
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

    function resetCanvasZoom() {
        if (zoomedCanvas && zoomedCanvas.isConnected && originalCanvasDimensions) {
            zoomedCanvas.width = originalCanvasDimensions.width;
            zoomedCanvas.height = originalCanvasDimensions.height;
            if (originalCanvasCss) {
                zoomedCanvas.style.width = originalCanvasCss.width;
                zoomedCanvas.style.height = originalCanvasCss.height;
            }
        }
        zoomedCanvas = null;
        originalCanvasDimensions = null;
        originalCanvasCss = null;
    }

    function releaseCameraZoom() {
        if (zoomTarget && originalCameraZooms.has(zoomTarget)) {
            const base = originalCameraZooms.get(zoomTarget);
            try { zoomTarget.setZoom(base); } catch { /* camera removed */ }
        }
        zoomTarget = null;
    }

    function locateCamera() {
        const roots = [window.game, window.eggball, window.eggballGame, window.app,
            window.phaserGame, window.__GAME__, window.__game, window.client].filter(Boolean);
        const checked = new Set();
        const queue = roots.map(obj => ({ obj, depth: 0 }));
        while (queue.length && checked.size < 100) {
            const { obj, depth } = queue.shift();
            if (!obj || typeof obj !== 'object' || checked.has(obj)) continue;
            checked.add(obj);
            if (typeof obj.setZoom === 'function' && typeof obj.zoom === 'number' &&
                Number.isFinite(obj.zoom) && obj.zoom > 0 && obj.zoom <= 10) return obj;
            if (depth >= 3) continue;
            for (const child of ['camera', 'mainCamera', 'worldCamera', 'viewport',
                'scene', 'cameras', 'main', 'game', 'engine']) {
                try { if (obj[child]) queue.push({ obj: obj[child], depth: depth + 1 }); } catch {}
            }
            if (obj.scene && Array.isArray(obj.scene.scenes)) {
                for (const scene of obj.scene.scenes.slice(0, 12)) queue.push({ obj: scene, depth: depth + 1 });
            }
        }
        return null;
    }

    // Native camera zoom is preferred because it changes visible world area,
    // not just the canvas' CSS scale. The fallback changes a 2D canvas'
    // drawing buffer, which works only if the game sizes its camera from it.
    function syncZoom() {
        if (!settings.zoomOut || !canvas) {
            releaseCameraZoom();
            resetCanvasZoom();
            zoomStatus = settings.zoomOut ? 'waiting for game' : 'off';
            return;
        }
        const camera = locateCamera();
        if (camera) {
            if (zoomTarget !== camera) {
                releaseCameraZoom();
                zoomTarget = camera;
                originalCameraZooms.set(camera, camera.zoom);
            }
            resetCanvasZoom();
            const desired = originalCameraZooms.get(camera) * settings.zoomFactor;
            if (Math.abs(camera.zoom - desired) > 0.001) {
                try { camera.setZoom(desired); }
                catch { zoomStatus = 'camera zoom failed'; return; }
            }
            zoomStatus = 'game camera ' + Math.round(settings.zoomFactor * 100) + '%';
            return;
        }
        releaseCameraZoom();
        if (!settings.canvasZoomFallback || !canvas.getContext) {
            resetCanvasZoom();
            zoomStatus = 'camera not exposed';
            return;
        }
        let context = null;
        try { context = canvas.getContext('2d'); } catch {}
        if (!context || !canvas.width || !canvas.height) {
            resetCanvasZoom();
            zoomStatus = 'no 2D camera';
            return;
        }
        if (zoomedCanvas !== canvas) {
            resetCanvasZoom();
            zoomedCanvas = canvas;
            originalCanvasDimensions = { width: canvas.width, height: canvas.height };
            originalCanvasCss = { width: canvas.style.width, height: canvas.style.height };
            const rect = canvas.getBoundingClientRect();
            if (rect.width && rect.height) {
                canvas.style.width = rect.width + 'px';
                canvas.style.height = rect.height + 'px';
            }
        }
        const factor = 1 / settings.zoomFactor;
        const targetWidth = Math.min(8192, Math.round(originalCanvasDimensions.width * factor));
        const targetHeight = Math.min(8192, Math.round(originalCanvasDimensions.height * factor));
        if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
            // Do not fight an engine that explicitly resets the buffer size.
            // One attempt per canvas; if it changes back, disable fallback.
            if (originalCanvasDimensions.applied) {
                resetCanvasZoom();
                zoomStatus = 'game controls canvas size';
                return;
            }
            canvas.width = targetWidth;
            canvas.height = targetHeight;
            originalCanvasDimensions.applied = true;
        }
        zoomStatus = '2D canvas viewport ×' + factor.toFixed(2) + ' (experimental)';
    }

    function syncViewport() {
        if (!canvas || !canvas.isConnected) return;
        // Do not take over the canvas parent: the old fixed black wrapper
        // covered the game but never altered the camera's field of view.
        canvas.classList.toggle('eggpro-responsive-canvas', settings.fullViewport);
        syncZoom();
    }


    function refresh() {
        refreshTimer = null;
        const nextCanvas = findGameCanvas();
        if (canvas !== nextCanvas) {
            stopClicking();
            canvas = nextCanvas;
            mouseHeld = false;
            if (!canvas) { resetCanvasZoom(); releaseCameraZoom(); }
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
        if (['pixelPerfect', 'fullViewport', 'zoomOut', 'zoomFactor', 'canvasZoomFallback'].includes(key)) {
            if (key === 'zoomFactor') { resetCanvasZoom(); releaseCameraZoom(); }
            scheduleRefresh();
        }
        if (key === 'autoClick' && value) syncClicking();
        updateStatus();
    }

    function updateStatus() {
        if (statusElement) {
            statusElement.textContent = !canvas ? 'Waiting for game canvas'
                : 'View: ' + zoomStatus + ' | Egg: ' +
                (eggReplacements ? 'replaced' : (matchedBallAsset ? 'asset found (not replaced)' : 'renderer not identified'));
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
        const zoomLabel = document.createElement('label');
        zoomLabel.textContent = 'Zoom (smaller = more field) ';
        const zoomInput = document.createElement('input');
        zoomInput.type = 'number'; zoomInput.min = '0.5'; zoomInput.max = '1'; zoomInput.step = '0.05';
        zoomInput.value = String(settings.zoomFactor);
        zoomInput.addEventListener('change', () => {
            const value = Number(zoomInput.value);
            if (Number.isFinite(value) && value >= 0.5 && value <= 1) {
                setSetting('zoomFactor', value);
            } else zoomInput.value = String(settings.zoomFactor);
        });
        zoomLabel.append(zoomInput);
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
            makeCheckbox('23px pixel-perfect egg', 'pixelPerfect'),
            makeCheckbox('Responsive field (no black overlay)', 'fullViewport'),
            makeCheckbox('Zoom out (more field)', 'zoomOut'),
            zoomLabel,
            makeCheckbox('Try 2D canvas fallback', 'canvasZoomFallback'),
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
          canvas.eggpro-responsive-canvas { max-width: 100vw !important;
            max-height: 100dvh !important; }
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
        setInterval(() => { syncPixiTextures(); if (canvas) { syncZoom(); updateStatus(); } }, 650);
        window.addEventListener('pagehide', () => { releaseCameraZoom(); resetCanvasZoom(); }, { once: true });
        refresh();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else init();
})();