import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ts = createRequire(import.meta.url)('typescript');

test('opened media uses one stable reader while hover stays a lightweight preview', async () => {
  const [media, main] = await Promise.all([
    readFile(path.join(root, 'src', 'media-nodes.ts'), 'utf8'),
    readFile(path.join(root, 'src', 'main.ts'), 'utf8'),
  ]);
  assert.match(media, /export type MediaPresentation = 'reader' \| 'preview'/);
  assert.match(media, /overlay\.presentation === 'reader'/);
  assert.match(media, /event\.key !== 'Escape'/);
  assert.match(media, /fg-media-reader-header/);
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
  assert.doesNotMatch(pixi, /state\.mediaType && !state\.mediaExpanded/);
});

async function mediaFixture() {
  const source = (await readFile(path.join(root, 'src', 'media-nodes.ts'), 'utf8'))
    .replace(/^import .*;\r?\n/gm, '')
    .replace(/^export /gm, '');
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  class Element extends EventTarget {
    attributes = new Map();
    children = [];
    style = { setProperty() {} };
    constructor(tag) { super(); this.tag = tag; }
    append(...children) {
      for (const child of children) { child.parent = this; this.children.push(child); }
    }
    appendChild(child) { this.append(child); }
    replaceChildren(...children) { this.children = []; this.append(...children); }
    remove() { this.parent.children = this.parent.children.filter(child => child !== this); }
    focus() {}
    contains(child) { return this.children.includes(child); }
    closest(selector) { return this.tag === selector ? this : this.parent?.closest(selector); }
    setAttribute(key, value) { this.attributes.set(key, value); }
    removeAttribute(key) { this.attributes.delete(key); }
  }
  class Image extends Element {}
  class Video extends Element {}
  const tags = [];
  let selection = null;
  const document = {
    createElement: tag => { tags.push(tag); return new Element(tag); },
    documentElement: { classList: { toggle() {} } },
    getSelection: () => selection,
  };
  const resolvedAsset = { value: 'blob://attachment', release() {} };
  const showMedia = new Function('document', 'window', 'Element', 'HTMLImageElement', 'HTMLVideoElement',
    'isStoredAttachment', 'resolveBrowserAttachment', 'renderMathInMarkdown', 'bindMediaTextInput', `${code}\nreturn showMedia;`)(
    document, new EventTarget(), Element, Image, Video, url => url.startsWith('nodespace-attachment:'), async () => resolvedAsset,
    (markdown, render) => render(markdown), () => {},
  );
  return { Element, tags, resolvedAsset, showMedia, setSelection: value => { selection = value; } };
}

test('direct and stored audio share the same reader frame and playable controls', async () => {
  const { Element, resolvedAsset, showMedia } = await mediaFixture();
  const direct = new Element('container');
  showMedia(direct, 'direct', '声音', 'audio', 'https://example.test/sound.mp3', '#713e2c', () => ({ x: 0, y: 0 }));
  const [reader] = direct.children;
  const [, body] = reader.children;
  const [artwork, audio] = body.children;
  assert.equal(reader.attributes.get('aria-label'), '音频 · 声音');
  assert.equal(artwork.className, 'fg-media-audio-art');
  assert.equal(audio.tag, 'audio');
  assert.equal(audio.controls, true);

  const stored = new Element('container');
  showMedia(stored, 'stored', '声音', 'audio', 'nodespace-attachment:sound', '#713e2c', () => ({ x: 0, y: 0 }),
    undefined, undefined, false, undefined, 'preview');
  const [preview] = stored.children;
  const [header, storedBody] = preview.children;
  assert.equal(header.className, 'fg-media-preview-handle');
  assert.equal(storedBody.children[0].className, 'fg-media-status');
  await Promise.resolve();
  const [storedArtwork, storedAudio] = storedBody.children;
  assert.equal(storedArtwork.innerHTML, artwork.innerHTML);
  assert.equal(storedAudio.controls, true);
  assert.equal(storedAudio.src, resolvedAsset.value);
  storedAudio.dispatchEvent(new Event('error'));
  assert.equal(storedBody.children[0].textContent, '无法加载音频。');
});

test('source Markdown editing bypasses the local editor while keeping the Obsidian action', async () => {
  const { Element, tags, showMedia, setSelection } = await mediaFixture();
  const container = new Element('container');
  const position = () => ({ x: 0, y: 0 });
  const actions = [];
  const obsidian = { label: '在 Obsidian 中打开', onSelect: () => actions.push('obsidian') };
  const sourceEdit = { label: '修改内容', onSelect: () => actions.push('source') };
  const localEditor = { begin: () => { actions.push('local'); return '# 本地文档'; }, update: () => true, end() {} };

  showMedia(container, 'vault', '外部原文', 'md', '###### 小节', '#713e2c', position,
    undefined, undefined, true, undefined, 'reader', obsidian, localEditor, sourceEdit);
  const [reader] = container.children;
  const [header, body] = reader.children;
  const [identity, headerActions] = header.children;
  assert.equal(identity.children[1].children[0].textContent, '文档');
  assert.deepEqual(headerActions.children.slice(0, 2).map(button => button.textContent), ['修改内容', '在 Obsidian 中打开']);
  assert.equal(tags.includes('textarea'), false);
  assert.match(body.children[0].innerHTML, /<h6>小节<\/h6>/);
  headerActions.children[0].dispatchEvent(new Event('click'));
  headerActions.children[1].dispatchEvent(new Event('click'));
  assert.deepEqual(actions, ['source', 'obsidian']);

  const markdown = body.children[0];
  assert.match(markdown.className, /fg-media-markdown-editable/);
  const click = (target, properties = {}) => {
    const event = new Event('click', { cancelable: true });
    for (const [key, value] of Object.entries({ button: 0, target, ...properties })) {
      Object.defineProperty(event, key, { value });
    }
    return markdown.dispatchEvent(event);
  };
  const link = new Element('a');
  const linkedText = new Element('strong');
  link.append(linkedText);
  assert.equal(click(linkedText), true, 'links retain their default action');
  setSelection({ isCollapsed: false });
  click(markdown);
  setSelection({ isCollapsed: true });
  click(markdown, { button: 2 });
  click(markdown, { ctrlKey: true });
  assert.deepEqual(actions, ['source', 'obsidian']);
  click(markdown);
  assert.deepEqual(actions, ['source', 'obsidian', 'source']);

  showMedia(container, 'read-only', '不可编辑', 'md', '# 原文', '#713e2c', position,
    undefined, undefined, true, undefined, 'reader', obsidian, localEditor);
  const [readOnlyIdentity, readOnlyActions] = container.children[0].children[0].children;
  assert.equal(readOnlyIdentity.children[1].children[0].textContent, '文档 · 只读');
  assert.equal(readOnlyActions.children[0].textContent, '在 Obsidian 中打开');
  assert.equal(container.children[0].children[1].children[0].className, 'fg-media-markdown');
  assert.equal(tags.includes('textarea'), false);

  showMedia(container, 'local', '本地内容', 'md', '# 本地文档', '#713e2c', position,
    undefined, undefined, false, undefined, 'reader', undefined, localEditor);
  const [localHeader, localBody] = container.children[0].children;
  const edit = localHeader.children[1].children[0];
  assert.equal(edit.textContent, '编辑');
  edit.onclick();
  assert.equal(localBody.children[0].tag, 'textarea');
  assert.deepEqual(actions, ['source', 'obsidian', 'source', 'local']);
});
