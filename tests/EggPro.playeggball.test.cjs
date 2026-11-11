'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const defaultScriptPath = path.join(__dirname, '..', 'Scripts', 'EggPro.playeggball.user.js');
const script = fs.readFileSync(process.env.EGGPRO_SCRIPT_PATH || defaultScriptPath, 'utf8');

function makeHarness(savedSettings = {}) {
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
            this.checked = false;
            this.value = '';
            this.textContent = '';
            this.isConnected = true;
        }
        append(...children) {
            this.children.push(...children);
            this.textContent += children.map(child => child.textContent || '').join('');
        }
        appendChild(child) { this.append(child); }
        addEventListener(type, handler) { this.listeners.set(type, handler); }
        fire(type, event = {}) { return this.listeners.get(type)?.(event); }
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
    const perfectTexture = { width: 23, height: 23, baseTexture: { scaleMode: 0, update() {} } };
    class Sprite {
        constructor(texture) {
            this.texture = texture;
            this.scale = { x: 1, y: 1, set(x, y = x) { this.x = x; this.y = y; } };
            this.pivot = { x: 0, y: 0, set(x, y) { this.x = x; this.y = y; } };
            this.width = texture.width;
            this.height = texture.height;
            this.destroyed = false;
        }
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
        utils: { TextureCache: { '/eggball/art/egg-field.png': oldEggTexture } },
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
            getItem() { return JSON.stringify(savedSettings); },
            setItem() {},
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
    const control = text => panel.children.find(element => element.tagName === 'LABEL' && element.textContent.includes(text)).children[0];
    return { document, window, game, camera, canvas, panel, status: panel.children.at(-1), control, intervals, canvasEvents, eggHolderSprite, looseEggSprite, perfectTexture, oldEggTexture };
}

test('uses PlayEggball whole-field zoom and restores the prior camera state', () => {
    const h = makeHarness();
    assert.equal(h.camera.overview, true);
    assert.equal(h.camera.pinned, true);
    assert.equal(h.camera.follow, true);
    assert.equal(h.game.zoomLevel, 2 / 0.75);

    const zoomToggle = h.control('Zoom out to the full field');
    zoomToggle.checked = false;
    zoomToggle.fire('change');
    assert.equal(h.camera.overview, false);
    assert.equal(h.camera.pinned, false);
    assert.equal(h.game.zoomLevel, 1);
});

test('replaces the live Eggball sprite API and existing held and loose eggs', () => {
    const h = makeHarness();
    const created = h.window.ebEggSprite(20, 20);
    assert.equal(created.texture, h.perfectTexture);
    assert.equal(created.width, 23);
    assert.equal(created.height, 23);
    assert.equal(h.perfectTexture.baseTexture.scaleMode, 1);

    for (const update of h.intervals.values()) update();
    assert.equal(h.eggHolderSprite.texture, h.perfectTexture);
    assert.equal(h.looseEggSprite.texture, h.perfectTexture);
    assert.match(h.status.textContent, /Egg: replaced/);
});

test('auto-click dispatches pointer events while Shift is held and stops on release', () => {
    const h = makeHarness();
    const autoToggle = h.control('Auto-click while holding Shift');
    autoToggle.checked = true;
    autoToggle.fire('change');
    h.document.documentEvents.get('pointermove')({ clientX: 120, clientY: 90 });
    h.document.documentEvents.get('keydown')({ key: 'Shift', repeat: false, altKey: false, shiftKey: true, code: 'ShiftLeft', preventDefault() {} });
    assert.deepEqual(h.canvasEvents.map(event => event.type), ['pointerdown', 'pointerup']);
    assert.equal(h.canvasEvents[0].pointerType, 'mouse');
    assert.equal(h.canvasEvents[0].buttons, 1);
    assert.equal(h.canvasEvents[1].buttons, 0);

    h.document.documentEvents.get('keyup')({ key: 'Shift' });
    const previousCount = h.canvasEvents.length;
    for (const tick of h.intervals.values()) tick();
    assert.equal(h.canvasEvents.length, previousCount);
});

test('auto-click stops when the pointer leaves the game canvas or the page is hidden', () => {
    const h = makeHarness({ autoClick: true });
    h.document.documentEvents.get('pointermove')({ clientX: 120, clientY: 90 });
    h.document.documentEvents.get('keydown')({ key: 'Shift', repeat: false, altKey: false, shiftKey: true, code: 'ShiftLeft', preventDefault() {} });
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
    const button = h.panel.children.find(element => element.tagName === 'BUTTON');
    await button.fire('click');
    assert.equal(h.document.fullscreenElement, h.document.documentElement);
});

test('userscript matches ranked play and game routes', () => {
    assert.match(script, /@match\s+https:\/\/playeggball\.com\/play\*/);
    assert.match(script, /@match\s+https:\/\/playeggball\.com\/game\*/);
});
