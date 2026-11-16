import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const ts = createRequire(import.meta.url)('typescript');
const source = (await readFile(new URL('../src/context-menu-trigger.ts', import.meta.url), 'utf8')).replace(/^export /gm, '');
const code = ts.transpileModule(source, {}).outputText;

function fixture() {
  let nextTimer = 0;
  const timers = new Map();
  const bind = new Function('setTimeout', 'clearTimeout', `${code}\nreturn bindContextMenuTrigger;`)(
    callback => { timers.set(++nextTimer, callback); return nextTimer; },
    id => timers.delete(id),
  );
  const trigger = () => ({
    isConnected: true, handlers: new Map(),
    setAttribute() {},
    addEventListener(type, handler) { this.handlers.set(type, handler); },
    emit(type, event) { this.handlers.get(type)?.(event); },
  });
  const expire = () => {
    const due = [...timers.values()];
    timers.clear();
    due.forEach(callback => callback());
  };
  return { bind, trigger, expire, timers };
}

const pointer = (props = {}) => ({
  pointerType: 'touch', isPrimary: true, pointerId: 1, clientX: 24, clientY: 80, detail: 1,
  preventDefault() { this.defaultPrevented = true; }, stopImmediatePropagation() { this.stopped = true; }, ...props,
});

test('a held card opens its own context actions once and consumes the release click', () => {
  const { bind, trigger, expire } = fixture();
  const card = trigger(), wall = trigger(), opened = [];
  bind(card, (x, y) => opened.push(['card', x, y]), { touch: true });
  bind(wall, () => opened.push(['wall']), { touch: true });
  const touch = pointer();
  card.emit('pointerdown', touch);
  wall.emit('pointerdown', touch);
  assert.equal(touch.defaultPrevented, undefined);
  expire();
  card.emit('contextmenu', pointer());
  card.emit('pointerup', pointer());
  const releaseClick = pointer();
  card.emit('click', releaseClick);
  assert.equal(releaseClick.stopped && releaseClick.defaultPrevented, true);
  assert.deepEqual(opened, [['card', 24, 80]]);

  card.emit('pointerdown', pointer());
  card.emit('pointerup', pointer());
  const tap = pointer();
  card.emit('click', tap);
  assert.equal(tap.defaultPrevented, undefined);
});

test('pans, canceled pointers and a second finger cancel the pending context action', () => {
  const { bind, trigger, expire, timers } = fixture();
  const card = trigger(), nextCard = trigger();
  bind(card, () => assert.fail('a canceled gesture cannot open a menu'), { touch: true });
  bind(nextCard, () => assert.fail('a secondary finger cannot open a menu'), { touch: true });
  card.emit('pointerdown', pointer());
  card.emit('pointermove', pointer({ clientX: 56 }));
  assert.equal(timers.size, 0);
  card.emit('pointerdown', pointer());
  card.emit('pointercancel', pointer());
  assert.equal(timers.size, 0);
  card.emit('pointerdown', pointer());
  nextCard.emit('pointerdown', pointer({ isPrimary: false, pointerId: 2 }));
  assert.equal(timers.size, 0);
  expire();
});
