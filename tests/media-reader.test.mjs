import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('opened media uses one stable reader while hover stays a lightweight preview', async () => {
  const [media, main] = await Promise.all([
    readFile(path.join(root, 'src', 'media-nodes.ts'), 'utf8'),
    readFile(path.join(root, 'src', 'main.ts'), 'utf8'),
  ]);
  assert.match(media, /export type MediaPresentation = 'reader' \| 'preview'/);
  assert.match(media, /overlay\.presentation === 'reader'/);
  assert.match(media, /event\.key !== 'Escape'/);
  assert.match(media, /fg-media-reader-header/);
  assert.match(media, /sourceAction\.onSelect\(\)/);
  assert.match(main, /'reader', node\.sourceRef\?\.path/);
  assert.match(main, /undefined, 'preview'\)/);
  assert.match(main, /dataset\.mediaPresentation === 'preview'/);
});

test('media reader has responsive content layouts and node badges keep an active state', async () => {
  const [css, pixi] = await Promise.all([
    readFile(path.join(root, 'src', 'workspace-ui.css'), 'utf8'),
    readFile(path.join(root, 'src', 'pixi-nodes.ts'), 'utf8'),
  ]);
  assert.match(css, /\.fg-media-reader\s*\{/);
  assert.match(css, /\.fg-media-reader \.fg-media-body-pdf iframe/);
  assert.match(css, /\.fg-media-reader \.fg-media-body-audio/);
  assert.match(css, /@media \(max-width: 720px\)/);
  assert.match(pixi, /const active = !!state\.mediaExpanded/);
  assert.match(pixi, /drawMediaBadge\(width \/ 2 - 17/);
  assert.doesNotMatch(pixi, /state\.mediaType && !state\.mediaExpanded/);
});
