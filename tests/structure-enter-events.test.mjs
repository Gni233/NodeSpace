import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parse(source, fileName) {
  return ts.createSourceFile(fileName, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
}

function visit(node, predicate) {
  if (predicate(node)) return node;
  return ts.forEachChild(node, child => visit(child, predicate));
}

function propertyName(node) {
  return node.name && ts.isIdentifier(node.name) ? node.name.text : null;
}

function hasCall(node, target, handler) {
  return !!visit(node, candidate => {
    if (!ts.isCallExpression(candidate) || !ts.isPropertyAccessExpression(candidate.expression)) return false;
    const receiver = candidate.expression.expression;
    const method = candidate.expression.name.text;
    const [eventName, callback] = candidate.arguments;
    return ts.isIdentifier(receiver)
      && receiver.text === target
      && method === 'addEventListener'
      && ts.isStringLiteral(eventName)
      && eventName.text === 'dblclick'
      && ts.isIdentifier(callback)
      && callback.text === handler;
  });
}

function hasRemoval(node, target, handler) {
  return !!visit(node, candidate => {
    if (!ts.isCallExpression(candidate) || !ts.isPropertyAccessExpression(candidate.expression)) return false;
    const receiver = candidate.expression.expression;
    const method = candidate.expression.name.text;
    const [eventName, callback] = candidate.arguments;
    return ts.isIdentifier(receiver)
      && receiver.text === target
      && method === 'removeEventListener'
      && ts.isStringLiteral(eventName)
      && eventName.text === 'dblclick'
      && ts.isIdentifier(callback)
      && callback.text === handler;
  });
}

test('canvas double-click forwards the topmost visible node and disposer unregisters it', async () => {
  const source = await readFile(path.join(root, 'src', 'ui-events.ts'), 'utf8');
  const file = parse(source, 'ui-events.ts');
  const eventsContext = visit(file, node => ts.isInterfaceDeclaration(node) && node.name.text === 'EventsContext');
  assert.ok(eventsContext);

  const callback = eventsContext.members.find(member => propertyName(member) === 'onNodeDoubleClick');
  assert.ok(callback);
  assert.equal(callback.questionToken?.kind, ts.SyntaxKind.QuestionToken);

  const setup = visit(file, node => ts.isFunctionDeclaration(node) && node.name?.text === 'setupCanvasEvents');
  assert.ok(setup?.body);
  const doubleClick = visit(setup.body, node => ts.isVariableDeclaration(node)
    && ts.isIdentifier(node.name)
    && node.name.text === 'onDoubleClick');
  assert.ok(doubleClick && ts.isArrowFunction(doubleClick.initializer));

  const body = doubleClick.initializer.body;
  assert.ok(hasCall(setup.body, 'canvas', 'onDoubleClick'));
  assert.ok(hasRemoval(setup.body, 'canvas', 'onDoubleClick'));
  assert.equal(body.getText(file).includes('[...visibleNodes()].reverse()'), true);
  assert.equal(body.getText(file).includes('ctx.onNodeDoubleClick?.(node.id)'), true);
  assert.equal(body.getText(file).includes('e.preventDefault()'), true);
  assert.equal(body.getText(file).includes('e.stopPropagation()'), true);
});

test('pane event context forwards double-click entry through an optional external handler', async () => {
  const source = await readFile(path.join(root, 'src', 'pane-manager.ts'), 'utf8');
  const file = parse(source, 'pane-manager.ts');
  const externals = visit(file, node => ts.isInterfaceDeclaration(node) && node.name.text === 'PaneExternals');
  assert.ok(externals);

  const enterStructure = externals.members.find(member => propertyName(member) === 'enterStructure');
  assert.ok(enterStructure);
  assert.equal(enterStructure.questionToken?.kind, ts.SyntaxKind.QuestionToken);

  const factory = visit(file, node => ts.isFunctionDeclaration(node) && node.name?.text === 'createEventsContextForPane');
  assert.ok(factory?.body);
  const callbackProperty = visit(factory.body, node => ts.isPropertyAssignment(node)
    && propertyName(node) === 'onNodeDoubleClick');
  assert.ok(callbackProperty);
  assert.equal(callbackProperty.initializer.getText(file), '(id: string) => ext.enterStructure?.(pi, id)');
});
