const fs = require('fs');
const path = require('path');

const MEDIA_EXTENSIONS = new Map([
  ['.png', 'image'], ['.jpg', 'image'], ['.jpeg', 'image'], ['.gif', 'image'],
  ['.webp', 'image'], ['.svg', 'image'], ['.bmp', 'image'],
  ['.mp3', 'audio'], ['.wav', 'audio'], ['.ogg', 'audio'], ['.flac', 'audio'],
  ['.aac', 'audio'], ['.m4a', 'audio'],
  ['.mp4', 'video'], ['.webm', 'video'], ['.mov', 'video'], ['.avi', 'video'],
  ['.mkv', 'video'], ['.pdf', 'pdf'],
]);

const SKIPPED_DIRECTORIES = new Set(['.obsidian', '.git', '.trash', '.nodespace', 'node_modules']);

function normalizeRelativePath(value) {
  return String(value || '').split(path.sep).join('/').replace(/^\/+/, '');
}

function countMarkdownHeadings(markdown) {
  let fenced = false;
  let count = 0;
  for (const line of String(markdown || '').split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (!fenced && /^\s{0,3}#{1,6}\s+\S/.test(line)) count++;
  }
  return count;
}

function markdownTitle(relativePath, markdown) {
  const frontmatter = String(markdown || '').match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  const frontmatterTitle = frontmatter?.[1]?.match(/^(?:title|name):\s*["']?([^\r\n"']+)/im);
  if (frontmatterTitle?.[1]?.trim()) return frontmatterTitle[1].trim();
  const heading = String(markdown || '').match(/^\s{0,3}#\s+(.+)$/m);
  if (heading?.[1]?.trim()) return heading[1].trim();
  return path.basename(relativePath, path.extname(relativePath));
}

function scanVault(rootPath) {
  const root = path.resolve(rootPath);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw new Error('Vault directory not found');
  }

  const notes = [];
  const attachments = [];
  const graphs = [];
  const graphDirectory = fs.existsSync(path.join(root, 'Graph233'))
    && fs.statSync(path.join(root, 'Graph233')).isDirectory()
    ? path.join(root, 'Graph233')
    : root;

  const walk = directory => {
    let entries = [];
    try { entries = fs.readdirSync(directory, { withFileTypes: true }); }
    catch { return; }
    entries.sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const absolutePath = path.join(directory, entry.name);
      const relativePath = normalizeRelativePath(path.relative(root, absolutePath));
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && !SKIPPED_DIRECTORIES.has(entry.name)) walk(absolutePath);
        continue;
      }
      if (!entry.isFile()) continue;
      const extension = path.extname(entry.name).toLowerCase();
      let stat;
      try { stat = fs.statSync(absolutePath); } catch { continue; }
      const common = { path: relativePath, name: entry.name, size: stat.size, mtime: stat.mtimeMs };
      if (extension === '.md') {
        let markdown = '';
        try { markdown = fs.readFileSync(absolutePath, 'utf8'); } catch {}
        notes.push({
          ...common,
          kind: 'markdown',
          title: markdownTitle(relativePath, markdown),
          headingCount: countMarkdownHeadings(markdown),
          charCount: markdown.length,
          hasFrontmatter: /^---\s*\r?\n/.test(markdown),
        });
      } else if (extension === '.json' && (absolutePath === graphDirectory || absolutePath.startsWith(graphDirectory + path.sep))) {
        graphs.push({ ...common, kind: 'graph' });
      } else if (MEDIA_EXTENSIONS.has(extension)) {
        attachments.push({ ...common, kind: MEDIA_EXTENSIONS.get(extension) });
      }
    }
  };

  walk(root);
  return {
    rootPath: root,
    name: path.basename(root),
    isObsidianVault: fs.existsSync(path.join(root, '.obsidian')),
    graphRootPath: graphDirectory,
    graphRootRelative: normalizeRelativePath(path.relative(root, graphDirectory)),
    notes,
    attachments,
    graphs,
    stats: {
      notes: notes.length,
      attachments: attachments.length,
      graphs: graphs.length,
      headings: notes.reduce((sum, note) => sum + note.headingCount, 0),
    },
  };
}

module.exports = {
  MEDIA_EXTENSIONS,
  countMarkdownHeadings,
  normalizeRelativePath,
  scanVault,
};
