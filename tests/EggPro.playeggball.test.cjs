'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const script = fs.readFileSync(path.join(__dirname, '..', 'Scripts', 'EggPro.playeggball.user.js'), 'utf8');

function bootstrap(savedSettings = {}) {
    class CanvasContext {
        constructor() { this.imageSmoothingEnabled = true; this.seen = null; }
        drawImage(image, ...args) {
            this.seen = { image, args, smoothing: this.imageSmoothingEnabled };
            if (image.fail) throw new Error('draw failure');
            return 'drawn';
        }
    }
    const handlers = {};
    vm.runInNewContext(script, {
        CanvasRenderingContext2D: CanvasContext,
        document: { readyState: 'loading', addEventListener() {} },
        window: { addEventListener(type, handler) { handlers[type] = handler; } },
        localStorage: { getItem() { return JSON.stringify(savedSettings); } },
    });
    return { CanvasContext, handlers };
}

test('recognizable egg is drawn without smoothing, then state restored', () => {
    const { CanvasContext } = bootstrap();
    const context = new CanvasContext();
    assert.equal(context.drawImage({ src: 'https://cdn.example/assets/egg.png' }, 3, 4), 'drawn');
    assert.equal(context.seen.smoothing, false);
    assert.equal(context.imageSmoothingEnabled, true);
});

test('other graphics retain native smoothing', () => {
    const { CanvasContext } = bootstrap();
    const context = new CanvasContext();
    context.drawImage({ src: 'https://cdn.example/assets/grass.png' });
    assert.equal(context.seen.smoothing, true);
    assert.equal(context.imageSmoothingEnabled, true);
});

test('disabling pixel-perfect leaves ball images unchanged', () => {
    const { CanvasContext } = bootstrap({ pixelPerfect: false });
    const context = new CanvasContext();
    context.drawImage({ src: '/assets/ball.webp' });
    assert.equal(context.seen.smoothing, true);
});

test('draw errors restore the original rendering state', () => {
    const { CanvasContext } = bootstrap();
    const context = new CanvasContext();
    assert.throws(() => context.drawImage({ src: '/assets/football.png', fail: true }), /draw failure/);
    assert.equal(context.imageSmoothingEnabled, true);
});

test('pagehide restores only our own drawImage patch', () => {
    const { CanvasContext, handlers } = bootstrap();
    const patched = CanvasContext.prototype.drawImage;
    CanvasContext.prototype.drawImage = function externalPatch() {};
    handlers.pagehide();
    assert.notEqual(CanvasContext.prototype.drawImage, patched);
    assert.equal(CanvasContext.prototype.drawImage.name, 'externalPatch');
});

test('hold-Shift auto click dispatches while active and stops on release', () => {
    const handlers = new Map();
    const intervals = new Map();
    let nextIntervalId = 1;
    const canvasEvents = [];
    const css = () => ({ add() {}, remove() {}, toggle() {} });
    const createElement = tagName => ({
        tagName: tagName.toUpperCase(),
        classList: css(),
        children: [],
        append(...children) { this.children.push(...children); },
        addEventListener(type, cb) { this[`on${type}`] = cb; },
        getAttribute() { return null; },
        contains() { return false; },
    });
    const canvas = createElement('canvas');
    canvas.parentElement = createElement('div');
    canvas.isConnected = true;
    canvas.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 600, bottom: 400, width: 600, height: 400 });
    canvas.dispatchEvent = e => { canvasEvents.push(e.type); return true; };
    const document = {
        readyState: 'loading', visibilityState: 'visible',
        documentElement: createElement('html'),
        body: createElement('body'),
        head: createElement('head'),
        activeElement: null,
        addEventListener(type, cb) { handlers.set('document:' + type, cb); },
        createElement,
        createTextNode(text) { return { text }; },
        querySelectorAll(selector) { return selector === 'canvas' ? [canvas] : []; },
        elementFromPoint() { return canvas; },
    };
    const window = { addEventListener(type, cb) { handlers.set('window:' + type, cb); }, PIXI: null };
    class MockEvent { constructor(type, options) { Object.assign(this, options); this.type = type; } }
    class MockMutationObserver { observe() {} }
    vm.runInNewContext(script, {
        document, window, localStorage: { getItem() { return '{"autoClick":true}'; }, setItem() {} },
        CanvasRenderingContext2D: class { drawImage() {} },
        MutationObserver: MockMutationObserver,
        MouseEvent: MockEvent,
        setInterval(callback) { const id = nextIntervalId++; intervals.set(id, callback); return id; },
        clearInterval(id) { intervals.delete(id); },
        setTimeout() { return 1; },
        clearTimeout() {},
    });
    handlers.get('document:DOMContentLoaded')();
    handlers.get('document:pointermove')({ clientX: 250, clientY: 140 });
    handlers.get('document:keydown')({ key: 'Shift', repeat: false });
    assert.deepEqual(canvasEvents, ['mousedown', 'mouseup', 'click']);
    assert.equal(intervals.size, 2); // click timer plus PIXI inspection timer
    handlers.get('document:keyup')({ key: 'Shift' });
    assert.equal(intervals.size, 1); // only PIXI inspection remains
    const previous = canvasEvents.length;
    for (const f of intervals.values()) f();
    assert.equal(canvasEvents.length, previous);
    assert.equal(document.documentElement.classList !== null, true);
});
test('metadata includes the /game route', () => {
    assert.match(script, /@match\\s+https:\/\/playeggball\\.com\/game\\*/);
});

test('no fixed black viewport overlay remains', () => {
    assert.doesNotMatch(script, /eggpro-full-viewport/);
    assert.doesNotMatch(script, /background:\s*#101015/);
});

test('supplied egg is embedded and has camera-aware zoom', () => {
    assert.match(script, /PERFECT_EGG_URL = "data:image\/png;base64,/);
    assert.match(script, /function syncZoom\(\)/);
    assert.match(script, /camera\.setZoom\(desired\)/);
});
