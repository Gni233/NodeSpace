import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function readSource(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}

test('sidebar collapse keeps one stable rail control and synchronizes all content sections', async () => {
  const source = await readSource('src/ui-sidebar.ts');
  const main = await readSource('src/main.ts');
  const applyCollapsed = source.match(/const applyCollapsed = \(\) => \{([\s\S]*?)\n  \};/);

  assert.ok(applyCollapsed, 'sidebar should centralize its collapsed state updates');
  assert.equal(
    (source.match(/const collapseBtn = document\.createElement\('button'\)/g) ?? []).length,
    1,
    'the rail must reuse one collapse button',
  );
  assert.match(source, /collapseBtn\.textContent = '☰';/);
  assert.match(source, /collapseBtn\.setAttribute\('aria-expanded', String\(!collapsed\)\)/);
  assert.match(source, /const stateLabel = collapsed \? '展开侧边栏' : '折叠侧边栏';/);

  for (const sectionClass of [
    'fg-sidebar-new-row fg-sidebar-content-section',
    'fg-file-tree fg-sidebar-content-section',
    'fg-sidebar-settings fg-sidebar-content-section',
  ]) {
    assert.ok(source.includes(sectionClass), `${sectionClass} should share the collapse contract`);
  }
  assert.match(source, /content\.className = 'fg-sidebar-content';/);
  assert.match(source, /content\.appendChild\(newRow\);/);
  assert.match(source, /content\.appendChild\(fileTree\);/);
  assert.match(source, /content\.appendChild\(settingsSection\);/);

  assert.match(applyCollapsed[1], /sidebar\.classList\.toggle\('is-collapsed', collapsed\);/);
  assert.doesNotMatch(applyCollapsed[1], /style\.display/);
  assert.doesNotMatch(applyCollapsed[1], /setTimeout/);
  assert.doesNotMatch(source.match(/collapseBtn\.onclick = \(\) => \{([\s\S]*?)\n  \};/)?.[1] ?? '', /setTimeout/);
  assert.match(main, /sidebar\.sidebar\.classList\.add\('fg-glass'\);/);
  assert.doesNotMatch(main, /sidebar\.sidebar\.className = 'fg-glass fg-sidebar'/,
    'the application shell must not erase the sidebar collapsed class after construction');
});

test('sidebar CSS hides every content section as one non-interactive group', async () => {
  const html = await readSource('index.html');
  const workspaceCss = await readSource('src/workspace-ui.css');

  assert.match(html, /\.fg-sidebar-collapse \{[\s\S]*?width:28px;[\s\S]*?height:28px;[\s\S]*?flex:0 0 28px;/);
  assert.match(html, /\.fg-sidebar\.is-collapsed \.fg-sidebar-header \{[\s\S]*?justify-content:center;[\s\S]*?padding:0 4px !important;/);
  assert.match(html, /\.fg-sidebar\.is-collapsed \.fg-sidebar-title \{[\s\S]*?width:0;[\s\S]*?opacity:0;[\s\S]*?visibility:hidden;/);
  assert.match(html, /\.fg-sidebar\.is-collapsed \.fg-sidebar-content,[\s\S]*?\.fg-sidebar\.is-collapsed \.fg-sidebar-content-section \{[\s\S]*?opacity:0;[\s\S]*?visibility:hidden;[\s\S]*?pointer-events:none;/);
  assert.match(workspaceCss, /\.fg-inspector\.is-collapsed \{[\s\S]*?width: 44px !important;[\s\S]*?min-width: 44px !important;/);
  assert.match(workspaceCss, /\.fg-inspector-media-row \{[\s\S]*?grid-template-columns: auto 78px 30px minmax\(76px, 1fr\);/);
});
