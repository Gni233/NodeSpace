import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const ts = createRequire(import.meta.url)('typescript');
const source = await readFile(new URL('../src/pixi-nodes.ts', import.meta.url), 'utf8');
const file = ts.createSourceFile('pixi-nodes.ts', source, ts.ScriptTarget.ES2022, true);
const luminance = color => [16, 8, 0].reduce((sum, shift, index) => {
  const srgb = ((color >> shift) & 255) / 255;
  const linear = srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  return sum + [0.2126, 0.7152, 0.0722][index] * linear;
}, 0);
const contrast = (first, second) => {
  const brightness = [luminance(first), luminance(second)].sort((a, b) => a - b);
  return (brightness[1] + 0.05) / (brightness[0] + 0.05);
};
function actual(name, context) {
  const declaration = file.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  const output = ts.transpileModule(declaration.getText(file).replace('export ', ''), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return new Function('context', `with(context) { ${output}; return ${name}; }`)(context);
}

test('reduced motion settles fixed state immediately and cancels its previous frame', () => {
  const cancelled = [];
  const animate = actual('animateFixedAnim', {
    window: { matchMedia: () => ({ matches: true }) },
    cancelAnimationFrame: id => cancelled.push(id),
    requestAnimationFrame: () => assert.fail('Reduced motion must not schedule a frame'),
  });
  const sprite = { container: {}, _fixedAnim: 0.2, _fixedAnimTarget: 0, _fixedAnimRaf: 7 };
  animate(sprite, 1);
  assert.equal(sprite._fixedAnim, 1);
  assert.equal(sprite._fixedAnimRaf, null);
  assert.deepEqual(cancelled, [7]);
});

test('sprite cleanup cancels every tracked motion and is safe to repeat', () => {
  const cancelled = [];
  const cancel = actual('cancelSpriteAnimations', { cancelAnimationFrame: id => cancelled.push(id) });
  const sprite = { _fixedAnimRaf: 1, _growRaf: 2, _dyingRaf: 3 };
  cancel(sprite);
  cancel(sprite);
  assert.deepEqual(cancelled, [1, 2, 3]);
  assert.deepEqual(sprite, { _fixedAnimRaf: null, _growRaf: null, _dyingRaf: null });
});

function renderFixture() {
  const vector = () => ({ x: 1, y: 1, set(x, y = x) { this.x = x; this.y = y; } });
  const frames = new Map();
  let nextFrame = 0, now = 0;
  class FakeText {
    constructor(options) { Object.assign(this, options); this.anchor = vector(); this.position = vector(); this.scale = vector(); this.width = 90; }
    destroy() { this.destroyed = true; }
  }
  class FakeGraphics {
    constructor() { this.calls = []; this.position = vector(); }
    destroy() { this.destroyed = true; }
    clear() { this.calls.length = 0; return this; }
  }
  for (const method of ['circle', 'fill', 'stroke', 'rect', 'roundRect', 'moveTo', 'lineTo', 'closePath']) {
    FakeGraphics.prototype[method] = function (...args) { this.calls.push([method, ...args]); return this; };
  }
  const graphics = new FakeGraphics();
  const context = {
    window: { matchMedia: () => ({ matches: false }) },
    requestAnimationFrame: callback => { frames.set(++nextFrame, callback); return nextFrame; },
    cancelAnimationFrame: id => frames.delete(id), performance: { now: () => now },
    Text: FakeText, TEXT_RESOLUTION: 2, WORLD_TEXT_SAMPLING: {}, readFontFamily: () => 'test-font',
    Graphics: FakeGraphics, mixColor: actual('mixColor', {}),
    CanvasTextMetrics: { measureText: text => ({ width: Array.from(text).length * 10 }) },
    fitCompactNodeTitle: actual('fitCompactNodeTitle', {}),
  };
  context.updateSemanticViewportDetails = actual('updateSemanticViewportDetails', {
    updateSemanticBodyViewport: actual('updateSemanticBodyViewport', {
      semanticBodyScale: () => 1, semanticReferenceBodyScale: () => 1,
      semanticBodyDetailAlpha: () => 1, semanticReferenceBodyDetailAlpha: () => 1,
      fitCardExcerpt: actual('fitCardExcerpt', {}),
    }),
    updateSpacePortalViewport: () => false,
    semanticZoomProfile: () => ({ titleAlpha: 1, nodeTitleScale: 1.4, mediaAlpha: 1 }),
  });
  context.cancelSpriteAnimations = actual('cancelSpriteAnimations', context);
  context.applyHierarchyNodeTransform = actual('applyHierarchyNodeTransform', context);
  const paint = actual('applyNodeVisual', context);
  const children = [];
  const sprite = { circle: graphics, radius: 7, _fixedAnim: 0, _fixedAnimTarget: 0,
    container: { scale: vector(), alpha: 1, addChild(child) { children.push(child); }, removeChild(child) { const i = children.indexOf(child); if (i >= 0) children.splice(i, 1); } },
    label: new FakeText({ text: 'A long title that needs wrapping', style: {} }) };
  const render = (state, textColor = 0x39372f) => paint(sprite, 0xa8563e, textColor, 13, { inFocus: true, fixed: false, ...state });
  return { sprite, render, frames, tick(time) { now = time; const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback()); } };
}

test('one sprite clears representation-specific counts and text styles across compact, card and legacy', () => {
  const { sprite, render } = renderFixture();
  render({ collapsed: true, hasChildren: true });
  const count = sprite._collapseDots;
  assert.ok(count);
  sprite.label.text = 'A long title that needs wrapping';
  render({ selected: true, semanticCard: { form: 'node', width: 120, height: 58, nodeRadius: 7 } });
  assert.equal(count.destroyed, true);
  assert.equal(sprite._collapseDots, null);
  assert.ok(sprite.label.text.includes('\n'));
  assert.equal(sprite.label.style.wordWrap, false);
  sprite.label.text = 'Original full card title';
  render({ semanticCard: { form: 'card', width: 180, height: 90, excerpt: '' } });
  assert.equal(sprite.label.text, 'Original full card title');
  assert.equal(sprite.label.scale.x, 1);
  assert.equal(sprite.label.anchor.x, 0);
  assert.equal(sprite.label.style.wordWrap, true);
  sprite.label.text = 'Original\nlegacy title';
  render({});
  assert.equal(sprite.label.text, 'Original\nlegacy title');
  assert.equal(sprite.label.style.lineHeight, 0);
  assert.equal(sprite.label.style.wordWrap, false);
  assert.equal(sprite.label.style.fontWeight, '400');
  assert.equal(sprite.label.anchor.x, 0.5);
  assert.equal(sprite._semanticTitleViewport, undefined);
});

test('undo during a deletion animation restores the reused sprite and cancels its pending shrink', () => {
  const { sprite, render, frames, tick } = renderFixture();
  render({ dying: true });
  tick(100);
  assert.equal(sprite.container.scale.x, 0.5);
  assert.equal(frames.size, 1);
  render({ dying: false });
  assert.equal(frames.size, 0);
  assert.equal(sprite.container.scale.x, 1);
  assert.equal(sprite.container.alpha, 1);
  assert.equal(sprite._dyingAnim, false);
  render({ dying: true });
  assert.equal(frames.size, 1, 'A subsequent real deletion starts normally');
});

test('hierarchy motion restores a fully visible body and title for every node representation', () => {
  for (const form of [undefined, 'node', 'card']) {
    const { sprite, render } = renderFixture();
    const semanticCard = form ? { form, width: 180, height: 90, nodeRadius: 7, excerpt: '' } : undefined;
    const state = { semanticCard };
    render({ ...state, expanding: 0 });
    assert.equal(sprite.container.scale.x, 0.01);
    assert.equal(sprite.container.alpha, 0);
    render({ ...state, expanding: 0.5 });
    assert.equal(sprite.container.scale.x, 0.875);
    assert.equal(sprite.container.alpha, 0.5);
    render(state);
    assert.equal(sprite.container.scale.x, 1);
    assert.equal(sprite.container.alpha, 1);
    if (form) assert.equal(sprite.label.visible, true);

    render({ ...state, collapsing: 0.75 });
    assert.equal(sprite.container.scale.x, 0.01);
    assert.equal(sprite.container.alpha, 0);
    sprite.container.scale.set(1.12);
    render(state);
    assert.equal(sprite.container.scale.x, 1.12, 'keep a drag scale that took over during the animation');
  }
});

test('media badges use theme ink and share the header without covering the excerpt', () => {
  const { sprite, render } = renderFixture();
  const semanticCard = { form: 'card', kind: 'task', width: 180, height: 100, excerpt: 'Preview a recording' };
  for (const [surfaceColor, labelColor, accentColor] of [[0xfbf8f0, 0x251e11, 0xa8563e], [0x252119, 0xede6d6, 0xde8f66]]) {
    for (const mediaExpanded of [false, true]) {
      render({ semanticCard, mediaType: 'audio', mediaExpanded, surfaceColor, accentColor }, labelColor);
      const badge = sprite._mediaIcon;
      const [[, plateLeft, , plateWidth], [, plate], [, border], , , [, glyph]] = badge.calls;
      assert.equal(plate.alpha, 1);
      assert.ok(contrast(plate.color, glyph.color) >= 4.5);
      if (mediaExpanded) assert.equal(border.color, accentColor);
      assert.equal(badge.position.y, sprite.label.position.y + sprite.label.style.lineHeight / 2);
      const badgeLeft = badge.position.x + plateLeft;
      assert.ok(badgeLeft > sprite.label.position.x + sprite.label.style.wordWrapWidth);
      assert.ok(badgeLeft + plateWidth < semanticCard.width / 2);
      assert.ok(badge.position.y - plateLeft < sprite._semanticBody.position.y);
      assert.ok(sprite._semanticBody.position.x + sprite._semanticBody.style.wordWrapWidth <= semanticCard.width / 2 - 25);
      assert.equal(sprite._semanticMediaViewport.persistent, mediaExpanded);
    }
  }

  const badge = sprite._mediaIcon;
  render({});
  assert.equal(badge.destroyed, true);
  assert.equal(sprite._mediaIcon, null);
});

test('reading cards keep a calm paper surface and readable excerpt in light and dark', () => {
  const { sprite, render } = renderFixture();
  const mixColor = actual('mixColor', {});
  const semanticCard = { form: 'card', kind: 'note', width: 210, height: 114, titleLines: 2, excerpt: 'A short excerpt with room below the title.' };
  for (const [surfaceColor, labelColor, accentColor] of [[0xfbf8f0, 0x251e11, 0xa8563e], [0x252119, 0xede6d6, 0xde8f66]]) {
    render({ semanticCard, surfaceColor, accentColor }, labelColor);
    const [, [, surface], [, outline], [mark, , , radius], [, ink]] = sprite.circle.calls;
    assert.equal(surface.color, surfaceColor);
    assert.equal(surface.alpha, 1);
    assert.equal(outline.color, labelColor);
    assert.ok(outline.alpha < 0.25);
    assert.equal(mark, 'circle');
    assert.ok(radius < 3);
    assert.equal(ink.color, 0xa8563e, 'preserve the node identity color');
    assert.equal(sprite._semanticBody.position.x, sprite.label.position.x);
    assert.ok(sprite._semanticBody.position.y > sprite.label.position.y + 2 * sprite.label.style.lineHeight);
    assert.ok(contrast(surfaceColor, mixColor(surfaceColor, labelColor, sprite._semanticBody.alpha)) >= 4.5);
    render({ semanticCard: { ...semanticCard, excerpt: '', titleLines: 1 }, surfaceColor, accentColor }, labelColor);
    assert.equal(sprite.label.position.y + sprite.label.style.lineHeight / 2, 0);
    assert.equal(sprite.circle.calls.some(([op]) => op === 'lineTo'), false);
    assert.equal(sprite._semanticBody.visible, false);
  }
});
