import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const ts = createRequire(import.meta.url)('typescript');
const source = await readFile(new URL('../src/workbench-cover.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
}).outputText;
const { buildWorkbenchCover } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));

const graph = (nodes, edges = [], settings) => ({ nodes, edges, groups: [], settings });
const within = value => Number.isFinite(value) && value >= 0 && value <= 1;
const span = values => Math.max(...values) - Math.min(...values);

test('captions overlay the full artwork and the gallery staggers card heights by column', async () => {
  const [styles, gallery] = await Promise.all([
    readFile(new URL('../src/workbench-gallery.css', import.meta.url), 'utf8'),
    readFile(new URL('../src/workbench-gallery.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(styles, /\.ns-gallery \.ns-home-cover \{[^}]*position: absolute;\s*inset: 0;/);
  const caption = styles.match(/\.ns-gallery \.ns-home-plaque \{([^}]*)\}/)?.[1];
  assert.match(caption, /position: absolute;/);
  assert.doesNotMatch(caption, /background/);
  assert.match(gallery, /largerRow = index % rows/);
  assert.match(gallery, /row === largerRow \? 'minmax\(0, 1\.45fr\)' : 'minmax\(0, 1fr\)'/);
});

test('keeps heading levels and real links in the simplified layout', () => {
  const nodes = [
    Object.freeze({ id: 'a', x: 100, y: 20, headingLevel: 1 }),
    Object.freeze({ id: 'b', x: 300, y: 20, headingLevel: 3 }),
    Object.freeze({ id: 'c', x: 300, y: 120, headingLevel: 8 }),
  ];
  const edges = [{ source: nodes[0], target: 'b' }, { source: 'b', target: 'c' }, { source: 'b', target: 'a' }];
  const input = Object.freeze(graph(Object.freeze(nodes), Object.freeze(edges)));
  const cover = buildWorkbenchCover(input);
  assert.deepEqual(cover.points.map(point => point.level), [1, 3, 6]);
  assert.deepEqual([cover.nodeCount, cover.edgeCount], [3, 3]);
  assert.equal(cover.links.length, 2);
  const [a, b, c] = cover.points;
  assert.deepEqual([a.id, b.id, c.id], ['a', 'b', 'c']);
  assert.deepEqual([a.x, a.y], [.5, .5]);
  assert.ok([b, c].every(point => within(point.x) && within(point.y)));
  assert.deepEqual(cover.links[0], { source: a.id, target: b.id, x1: a.x, y1: a.y, x2: b.x, y2: b.y });
  assert.deepEqual(buildWorkbenchCover(input), cover);
});

test('the cover stays fixed when opening or laying out the canvas changes node positions', () => {
  const nodes = [
    { id: 'origin', x: 0, y: 0 }, { id: 'next', x: 20, y: 0 }, { id: 'last', x: 120, y: 0 },
  ];
  const edges = [{ source: 'origin', target: 'next' }, { source: 'next', target: 'last' }];
  const loaded = nodes.map(node => ({ ...node, x: 0, y: 0 }));
  const memory = { semanticLayoutMemory: {
    version: 1, source: 'lexical', nodes: {
      origin: { x: 50, y: 60 }, next: { x: 50, y: 300 }, last: { x: 75, y: 600 },
    },
  } };
  const arranged = loaded.map(node => ({ ...node, ...memory.semanticLayoutMemory.nodes[node.id] }));
  const cover = buildWorkbenchCover(graph(nodes, edges));
  assert.deepEqual(buildWorkbenchCover(graph(loaded, edges, memory)), cover);
  assert.deepEqual(buildWorkbenchCover(graph(arranged, edges, memory)), cover);
});

test('repairs malformed and collapsed thumbnail geometry without creating phantom connections', () => {
  assert.deepEqual(buildWorkbenchCover(graph(null, null)), { points: [], links: [], nodeCount: 0, edgeCount: 0 });
  const input = graph([null, 'broken', { id: 1, x: 0, y: 0 }, { id: 2, x: 0, y: 0 }, { id: 3, x: NaN, y: Infinity }], [
    undefined, { source: 1, target: { id: 2 } }, { source: '__proto__', target: 3 }, { source: 3, target: 3 },
  ]);
  const cover = buildWorkbenchCover(input);
  assert.equal(cover.points.length, 3);
  assert.equal(cover.links.length, 1);
  assert.equal(new Set(cover.points.map(({ x, y }) => `${x}/${y}`)).size, 3);
  assert.ok(cover.points.every(({ x, y }) => within(x) && within(y)));
  assert.deepEqual(buildWorkbenchCover(input), cover);
});

test('large sparse graphs retain a well-spaced sample and real topology within output budgets', () => {
  const size = 25000;
  const nodes = Array.from({ length: size }, (_, index) => ({ id: index, x: index % 100, y: Math.floor(index / 100) }));
  const edges = Array.from({ length: size - 1 }, (_, index) => ({ source: index, target: index + 1 }));
  const cover = buildWorkbenchCover(graph(nodes, edges));
  assert.equal(cover.nodeCount, size);
  assert.equal(cover.edgeCount, size - 1);
  assert.equal(cover.points.length, 54);
  assert.ok(cover.links.length >= 9 && cover.links.length <= 80);
  assert.ok(span(cover.points.map(point => point.y)) > .75);
  const drawn = new Set(cover.points.map(({ x, y }) => `${x}/${y}`));
  assert.ok(cover.links.every(({ x1, y1, x2, y2 }) => drawn.has(`${x1}/${y1}`) && drawn.has(`${x2}/${y2}`)));
});

test('cover nodes follow the expansion clock and keep their edge endpoints attached', async t => {
  const moduleSource = await readFile(new URL('../src/workbench-morph.ts', import.meta.url), 'utf8');
  const js = ts.transpileModule(moduleSource, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const { animateWorkbenchCoverNodes, WORKBENCH_MORPH_DURATION } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
  const cover = buildWorkbenchCover(graph(
    [{ id: 'a', x: 0, y: 20 }, { id: 'b', x: 100, y: 20 }, { id: 'hidden', x: 0, y: 100 }],
    [{ source: 'a', target: 'b' }, { source: 'a', target: 'hidden' }],
  ));
  const circles = cover.points.map(point => ({
    cx: { baseVal: { value: point.x * 100 } },
    cy: { baseVal: { value: point.y * 100 } },
    r: { baseVal: { value: 2 } },
  }));
  const preview = {
    style: {},
    getScreenCTM: () => ({ a: 2, b: 0.5, c: -0.5, d: 2, e: 20, f: 10 }),
    querySelectorAll: () => circles,
    querySelector: () => ({}),
  };
  const surface = { style: {}, querySelector: () => preview };
  const layer = {
    isConnected: true, getBoundingClientRect: () => ({ left: 3, top: 4 }),
    append(map) { this.map = map; },
  };
  const frames = [];
  const savedGlobals = new Map();
  const mocks = {
    document: { createElementNS: (_ns, tag) => ({
      tag, attributes: {}, children: [], classList: { add() {} },
      setAttribute(key, value) { this.attributes[key] = value; },
      append(element) { this.children.push(element); },
    }) },
    getComputedStyle: () => ({ fill: '#553015', stroke: '#553015', strokeWidth: '.48px', opacity: '.43' }),
    requestAnimationFrame: callback => frames.push(callback),
  };
  for (const [key, value] of Object.entries(mocks)) {
    savedGlobals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  t.after(() => {
    for (const [key, descriptor] of savedGlobals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });

  const end = new Map([
    ['a', { x: 530, y: 290, radius: 11 }],
    ['b', { x: 610, y: 360, radius: 13 }],
  ]);
  const expansion = { currentTime: 0 };
  const motion = animateWorkbenchCoverNodes(layer, surface, cover, id => end.get(id) ?? null, expansion);
  assert.ok(motion);
  assert.equal(preview.style.visibility, 'hidden');
  assert.equal(surface.style.visibility, undefined);
  const [ab, hiddenEdge, a, b, hidden] = layer.map.children.map(element => element.attributes);
  const { x, y } = cover.points[0];
  assert.equal(Number(a.cx), x * 200 - y * 50 + 17);
  assert.equal(Number(a.cy), x * 50 + y * 200 + 6);
  const start = Number(a.cx);
  frames.shift()(performance.now() + 1000);
  assert.equal(Number(a.cx), start);
  expansion.currentTime = WORKBENCH_MORPH_DURATION / 2;
  frames.shift()();
  assert.ok(Number(a.cx) > start && Number(a.cx) < end.get('a').x);
  assert.equal(ab.x1, a.cx);
  assert.equal(ab.x2, b.cx);
  assert.ok(Number(hiddenEdge.opacity) < Number(ab.opacity));
  end.set('b', { x: 626, y: 382, radius: 13 });
  expansion.currentTime = WORKBENCH_MORPH_DURATION;
  frames.shift()();
  await motion;
  assert.deepEqual([Number(a.cx), Number(a.cy), Number(a.r)], [527, 286, 11]);
  assert.deepEqual([Number(b.cx), Number(b.cy), Number(b.r)], [623, 378, 13]);
  assert.equal(ab.y2, b.cy);
  assert.equal(Number(hidden.opacity), 0);
});
