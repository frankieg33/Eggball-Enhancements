'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const defaultScriptPath = path.join(__dirname, '..', 'Scripts', 'EggPro.playeggball.user.js');
const script = fs.readFileSync(process.env.EGGPRO_SCRIPT_PATH || defaultScriptPath, 'utf8');

function makeHarness(savedSettings = {}, legacySettings = null, textureReady = true) {
    const documentEvents = new Map();
    const windowEvents = new Map();
    const intervals = new Map();
    let nextTimerId = 1;
    const canvasEvents = [];

    class Element {
        constructor(tagName) {
            this.tagName = tagName.toUpperCase();
            this.children = [];
            this.listeners = new Map();
            this.style = {};
            this.classList = { add() {}, remove() {}, toggle() {} };
            this.hidden = false;
            this.offsetWidth = 240;
            this.offsetHeight = 200;
            this.checked = false;
            this.value = '';
            this.textContent = '';
            this.isConnected = true;
        }
        append(...children) {
            this.children.push(...children);
            for (const child of children) child.parentElement = this;
            this.textContent += children.map(child => child.textContent || '').join('');
        }
        appendChild(child) { this.append(child); }
        addEventListener(type, handler) { this.listeners.set(type, handler); }
        fire(type, event = {}) { return this.listeners.get(type)?.(event); }
        getBoundingClientRect() {
            const left = Number.parseFloat(this.style.left) || 0;
            const top = Number.parseFloat(this.style.top) || 0;
            return { left, top, width: this.offsetWidth, height: this.offsetHeight,
                right: left + this.offsetWidth, bottom: top + this.offsetHeight };
        }
        setPointerCapture() {}
        contains(other) { return other === this; }
    }

    class Canvas extends Element {
        constructor() {
            super('canvas');
            this.width = 1200;
            this.height = 900;
            this.getBoundingClientRect = () => ({ left: 0, top: 0, right: 1200, bottom: 900 });
            this.dispatchEvent = event => { canvasEvents.push(event); return true; };
            this.getContext = () => null;
        }
    }

    const oldEggTexture = { width: 62, height: 78, baseTexture: { scaleMode: 0 } };
    const coloredEggTexture = { width: 62, height: 78, baseTexture: { scaleMode: 0 } };
    let onTextureLoaded = null;
    const perfectBaseTexture = {
        width: textureReady ? 23 : 0,
        height: textureReady ? 23 : 0,
        valid: textureReady,
        scaleMode: 0,
        update() {},
        once(event, callback) { if (event === 'loaded') onTextureLoaded = callback; },
    };
    const perfectTexture = { width: textureReady ? 23 : 0, height: textureReady ? 23 : 0, baseTexture: perfectBaseTexture };
    class Sprite {
        constructor(texture) {
            this._texture = null;
            this.scale = { x: 1, y: 1, set(x, y = x) { this.x = x; this.y = y; } };
            this.pivot = { x: 0, y: 0, set(x, y) { this.x = x; this.y = y; } };
            this.width = 0;
            this.height = 0;
            this.texture = texture;
            this.width = texture.width;
            this.height = texture.height;
            this.destroyed = false;
        }
        get texture() { return this._texture; }
        set texture(value) { this._texture = value; }
        set width(value) { this._width = value; if (this.texture?.width) this.scale.x = value / this.texture.width; }
        get width() { return this._width; }
        set height(value) { this._height = value; if (this.texture?.height) this.scale.y = value / this.texture.height; }
        get height() { return this._height; }
    }

    const makeEggSprite = (mx, my) => {
        const sprite = new Sprite(oldEggTexture);
        sprite.scale.set(0.5);
        sprite.width = 31;
        sprite.height = 39;
        sprite.pivot.set(31 - mx * 2, 39 - my * 2);
        return sprite;
    };
    const eggHolderSprite = makeEggSprite(20, 20);
    const looseEggSprite = makeEggSprite(20, 20);
    const camera = { follow: true, overview: false, pinned: false };
    const canvas = new Canvas();
    const game = {
        camera,
        zoomLevel: 1,
        players: { 1: { look: { egg: eggHolderSprite } } },
        bodies: { egg: { type: 'egg', look: looseEggSprite } },
        view: {
            canvas,
            camera: { wholeFieldZoom: () => 2, update() {} },
        },
    };
    const PIXI = {
        Sprite,
        Texture: { from: () => perfectTexture },
        SCALE_MODES: { NEAREST: 1 },
        utils: { TextureCache: {
            '/eggball/art/egg-field.png': oldEggTexture,
            '/eggball/art/egg-pumpkin.png': coloredEggTexture,
        } },
    };
    const window = {
        eggball: game,
        PIXI,
        ebEggSprite: makeEggSprite,
        addEventListener(type, handler) { windowEvents.set(type, handler); },
        innerWidth: 1200,
        innerHeight: 900,
    };
    const document = {
        readyState: 'loading',
        visibilityState: 'visible',
        activeElement: null,
        fullscreenElement: null,
        documentEvents,
        body: new Element('body'),
        head: new Element('head'),
        documentElement: new Element('html'),
        addEventListener(type, handler) { documentEvents.set(type, handler); },
        createElement: tag => new Element(tag),
        createTextNode: text => ({ textContent: text }),
        querySelectorAll: selector => selector === 'canvas' ? [canvas] : [],
        elementFromPoint: () => canvas,
    };
    document.documentElement.requestFullscreen = async () => { document.fullscreenElement = document.documentElement; };
    document.exitFullscreen = async () => { document.fullscreenElement = null; };

    class MockMutationObserver { observe() {} }
    class MockEvent {
        constructor(type, init = {}) { this.type = type; Object.assign(this, init); }
    }

    vm.runInNewContext(script, {
        window, document, localStorage: {
            getItem(key) {
                if (key === 'eggpro.playeggball.settings.v4') return savedSettings === null ? null : JSON.stringify(savedSettings);
                if (key === 'eggpro.playeggball.settings.v3') return legacySettings === null ? null : JSON.stringify(legacySettings);
                return null;
            },
            setItem(key, value) { if (key === 'eggpro.playeggball.settings.v4') savedSettings = JSON.parse(value); },
        },
        HTMLCanvasElement: Canvas,
        PointerEvent: MockEvent,
        MouseEvent: MockEvent,
        MutationObserver: MockMutationObserver,
        setInterval(callback) { const id = nextTimerId++; intervals.set(id, callback); return id; },
        clearInterval(id) { intervals.delete(id); },
        setTimeout() { return nextTimerId++; },
        clearTimeout() {},
    });
    documentEvents.get('DOMContentLoaded')();

    const panel = document.body.children.find(element => element.id === 'eggpro-panel');
    const controls = panel.children.find(element => element.id === 'eggpro-controls');
    const control = text => controls.children.find(element => element.tagName === 'LABEL' && element.textContent.includes(text))
        .children.find(child => child.tagName === 'INPUT' || child.tagName === 'SELECT');
    return {
        document, window, game, camera, canvas, panel, controls, status: controls.children.at(-1), control,
        intervals, canvasEvents, eggHolderSprite, looseEggSprite, perfectTexture, oldEggTexture, coloredEggTexture,
        getStoredSettings: () => savedSettings,
        markTextureReady() {
            perfectTexture.width = 23;
            perfectTexture.height = 23;
            perfectBaseTexture.width = 23;
            perfectBaseTexture.height = 23;
            perfectBaseTexture.valid = true;
            onTextureLoaded?.();
        },
    };
}

test('uses PlayEggball whole-field zoom and restores the prior camera state', () => {
    const h = makeHarness();
    assert.equal(h.camera.overview, true);
    assert.equal(h.camera.pinned, true);
    assert.equal(h.camera.follow, true);
    assert.equal(h.game.zoomLevel, 2 / 2);

    const zoomToggle = h.control('Enable Eggball camera zoom');
    zoomToggle.checked = false;
    zoomToggle.fire('change');
    assert.equal(h.camera.overview, false);
    assert.equal(h.camera.pinned, false);
    assert.equal(h.game.zoomLevel, 1);
});

test('replaces the live Eggball sprite API and existing held and loose eggs', () => {
    const h = makeHarness();
    assert.equal(h.eggHolderSprite.texture, h.perfectTexture);
    assert.equal(h.looseEggSprite.texture, h.perfectTexture);
    const created = h.window.ebEggSprite(20, 20);
    assert.equal(created.texture, h.perfectTexture);
    assert.equal(created.width, 23);
    assert.equal(created.height, 23);
    assert.equal(created.width / 2 - created.pivot.x * created.scale.x, 20);
    assert.equal(created.height / 2 - created.pivot.y * created.scale.y, 20);
    assert.equal(h.perfectTexture.baseTexture.scaleMode, 1);

    for (const update of h.intervals.values()) update();
    assert.equal(h.eggHolderSprite.texture, h.perfectTexture);
    assert.equal(h.looseEggSprite.texture, h.perfectTexture);
    assert.match(h.status.textContent, /Egg: replaced/);
});

test('waits for the replacement image to load before resizing a new egg sprite', () => {
    const h = makeHarness({}, null, false);
    const created = h.window.ebEggSprite(20, 20);
    assert.equal(created.texture, h.oldEggTexture);
    assert.equal(created.width / 2 - created.pivot.x * created.scale.x, 20);
    assert.equal(created.height / 2 - created.pivot.y * created.scale.y, 20);

    h.markTextureReady();
    assert.equal(created.texture, h.perfectTexture);
    assert.equal(created.width, 23);
    assert.equal(created.height, 23);
    assert.equal(created.width / 2 - created.pivot.x * created.scale.x, 20);
    assert.equal(created.height / 2 - created.pivot.y * created.scale.y, 20);
});

test('replaces a color-variant egg texture immediately, before the periodic sprite scan', () => {
    const h = makeHarness();
    const pivot = { x: h.eggHolderSprite.pivot.x, y: h.eggHolderSprite.pivot.y };
    h.eggHolderSprite.texture = h.coloredEggTexture;
    assert.equal(h.eggHolderSprite.texture, h.perfectTexture);
    assert.equal(h.eggHolderSprite.width, 23);
    assert.equal(h.eggHolderSprite.height, 23);
    assert.deepEqual({ x: h.eggHolderSprite.pivot.x, y: h.eggHolderSprite.pivot.y }, pivot);

    const pixelPerfect = h.control('23px pixel-perfect egg');
    pixelPerfect.checked = false;
    pixelPerfect.fire('change');
    assert.equal(h.eggHolderSprite.texture, h.coloredEggTexture);
});

test('defaults zoom to 2, accepts values through 3, and uses None as the default auto-click key', () => {
    const defaults = makeHarness();
    assert.equal(defaults.control('Field zoom factor').value, '2');

    const h = makeHarness({ zoomFactor: 0.75 });
    const zoom = h.control('Field zoom factor');
    assert.equal(zoom.max, '3');
    zoom.value = '1.25';
    h.game.view.camera.wholeFieldZoom = () => 1.04;
    zoom.fire('change');
    assert.equal(h.game.zoomLevel, 1.04 / 1.25);
    assert.ok(h.game.zoomLevel < 1);
    zoom.value = '2';
    zoom.fire('change');
    assert.equal(h.game.zoomLevel, 1.04 / 2);
    zoom.value = '3';
    zoom.fire('change');
    assert.equal(h.game.zoomLevel, 1.04 / 3);

    const autoKey = h.control('Auto-click key');
    assert.equal(autoKey.value, 'none');
    const autoToggle = h.control('Auto-click while holding configured key');
    autoToggle.checked = true;
    autoToggle.fire('change');
    h.document.documentEvents.get('pointermove')({ clientX: 120, clientY: 90 });
    h.document.documentEvents.get('keydown')({ key: 'Shift', code: 'ShiftLeft', repeat: false });
    assert.equal(h.canvasEvents.length, 0);
});

test('upgrades saved settings to the new zoom default and preserves other options', () => {
    const h = makeHarness(null, {
        pixelPerfect: false, zoomFactor: 0.75, autoClick: true, clickIntervalMs: 250,
        overlayPosition: { left: 12, top: 50 },
    });
    assert.equal(h.game.zoomLevel, 2 / 2);
    assert.equal(h.control('Auto-click key').value, 'none');
    assert.equal(h.control('23px pixel-perfect egg').checked, false);
    assert.equal(h.control('Auto-click while holding configured key').checked, true);
    assert.deepEqual(h.getStoredSettings().overlayPosition, { right: 12, top: 50 });
});

test('preserves a user-dragged overlay position when migrating settings', () => {
    const h = makeHarness(null, { overlayPosition: { left: 92, top: 130 } });
    assert.equal(h.panel.style.left, '92px');
    assert.equal(h.panel.style.top, '130px');
    assert.deepEqual(h.getStoredSettings().overlayPosition, { left: 92, top: 130 });
});

test('auto-click dispatches pointer events for its selected key and stops on release', () => {
    const h = makeHarness();
    const autoKey = h.control('Auto-click key');
    autoKey.value = 'Space';
    autoKey.fire('change');
    const autoToggle = h.control('Auto-click while holding configured key');
    autoToggle.checked = true;
    autoToggle.fire('change');
    h.document.documentEvents.get('pointermove')({ clientX: 120, clientY: 90 });
    h.document.documentEvents.get('keydown')({ key: ' ', code: 'Space', repeat: false });
    assert.deepEqual(h.canvasEvents.map(event => event.type), ['pointerdown', 'pointerup']);
    assert.equal(h.canvasEvents[0].pointerType, 'mouse');
    assert.equal(h.canvasEvents[0].buttons, 1);
    assert.equal(h.canvasEvents[1].buttons, 0);

    h.document.documentEvents.get('keyup')({ key: ' ', code: 'Space' });
    const previousCount = h.canvasEvents.length;
    for (const tick of h.intervals.values()) tick();
    assert.equal(h.canvasEvents.length, previousCount);
});

test('None keeps mouse hold as the auto-click trigger', () => {
    const h = makeHarness();
    const autoToggle = h.control('Auto-click while holding configured key');
    autoToggle.checked = true;
    autoToggle.fire('change');
    h.document.documentEvents.get('mousedown')({
        isTrusted: true, button: 0, target: h.canvas, clientX: 120, clientY: 90,
    });
    assert.deepEqual(h.canvasEvents.map(event => event.type), ['pointerdown', 'pointerup']);
    h.document.documentEvents.get('mouseup')({ isTrusted: true, button: 0 });
    const previousCount = h.canvasEvents.length;
    for (const tick of h.intervals.values()) tick();
    assert.equal(h.canvasEvents.length, previousCount);
});

test('auto-click stops when the pointer leaves the game canvas or the page is hidden', () => {
    const h = makeHarness({ autoClick: true, autoClickKey: 'Space' });
    h.document.documentEvents.get('pointermove')({ clientX: 120, clientY: 90 });
    h.document.documentEvents.get('keydown')({ key: ' ', code: 'Space', repeat: false });
    assert.equal(h.canvasEvents.length, 2);

    h.document.elementFromPoint = () => h.panel;
    h.document.documentEvents.get('pointermove')({ clientX: 120, clientY: 90 });
    assert.equal(h.canvasEvents.length, 2);

    h.document.visibilityState = 'hidden';
    for (const tick of h.intervals.values()) tick();
    assert.equal(h.canvasEvents.length, 2);
});

test('fullscreen control requests fullscreen from the browser document', async () => {
    const h = makeHarness();
    const button = h.controls.children.find(element => element.tagName === 'BUTTON');
    await button.fire('click');
    assert.equal(h.document.fullscreenElement, h.document.documentElement);
});

test('collapses and expands the overlay controls', () => {
    const h = makeHarness();
    assert.match(h.document.head.children[0].textContent, /#eggpro-controls\[hidden\]\{display:none!important\}/);
    const toggle = h.panel.children[0].children[1];
    toggle.fire('click');
    assert.equal(h.controls.hidden, true);
    assert.equal(toggle.textContent, 'Expand');
    toggle.fire('click');
    assert.equal(h.controls.hidden, false);
    assert.equal(toggle.textContent, 'Collapse');
});

test('drags the overlay and saves its position, clamped to the viewport', () => {
    const h = makeHarness();
    const header = h.panel.children[0];
    assert.equal(h.panel.style.left, '948px');
    assert.equal(h.panel.style.top, '50px');
    const initial = h.panel.getBoundingClientRect();
    header.fire('pointerdown', {
        button: 0, pointerId: 7, clientX: initial.left + 8, clientY: initial.top + 10, target: header, preventDefault() {},
    });
    h.document.documentEvents.get('pointermove')({ pointerId: 7, clientX: 100, clientY: 140 });
    assert.equal(h.panel.style.left, '92px');
    assert.equal(h.panel.style.top, '130px');
    h.document.documentEvents.get('pointerup')({ pointerId: 7 });
    assert.deepEqual(h.getStoredSettings().overlayPosition, { left: 92, top: 130 });

    header.fire('pointerdown', {
        button: 0, pointerId: 8, clientX: 100, clientY: 140, target: header, preventDefault() {},
    });
    h.document.documentEvents.get('pointermove')({ pointerId: 8, clientX: 5000, clientY: 5000 });
    assert.equal(h.panel.style.left, '960px');
    assert.equal(h.panel.style.top, '700px');
    h.document.documentEvents.get('pointerup')({ pointerId: 8 });
    assert.deepEqual(h.getStoredSettings().overlayPosition, { left: 960, top: 700 });
});

test('userscript matches ranked play and game routes', () => {
    assert.match(script, /@match\s+https:\/\/playeggball\.com\/play\*/);
    assert.match(script, /@match\s+https:\/\/playeggball\.com\/game\*/);
});
