const fs = require('fs');
const path = require('path');

const DEFAULT_GRAPH_FOLDER_RELATIVE = 'NodeSpace';
const LEGACY_GRAPH_FOLDER_RELATIVE = 'Graph233';

function normalizeGraphFolderRelative(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/\\/g, '/').replace(/^\.\/+/, '').replace(/\/+$/, '');
  if (!trimmed) return null;
  if (path.win32.isAbsolute(trimmed) || path.posix.isAbsolute(trimmed) || /^[a-zA-Z]:/.test(trimmed)) {
    throw new Error('图文件夹必须位于当前资料库内');
  }
  const segments = trimmed.split('/').filter(Boolean);
  if (segments.length === 0 || segments.some(segment => segment === '.' || segment === '..')) {
    throw new Error('图文件夹不能包含 . 或 .. 路径段');
  }
  return segments.join('/');
}

function isDirectory(directory) {
  try { return fs.statSync(directory).isDirectory(); }
  catch { return false; }
}

function resolveGraphDirectory(rootPath, configuredRelative) {
  const root = path.resolve(rootPath);
  const isObsidianVault = isDirectory(path.join(root, '.obsidian'));
  if (!isObsidianVault) {
    return { rootPath: root, graphRootPath: root, graphRootRelative: '', isObsidianVault, source: 'root' };
  }

  let source = 'configured';
  let relative = normalizeGraphFolderRelative(configuredRelative);
  if (!relative) {
    const legacyDirectory = path.join(root, LEGACY_GRAPH_FOLDER_RELATIVE);
    if (isDirectory(legacyDirectory)) {
      relative = LEGACY_GRAPH_FOLDER_RELATIVE;
      source = 'legacy';
    } else {
      relative = DEFAULT_GRAPH_FOLDER_RELATIVE;
      source = 'default';
    }
  }

  const graphRootPath = path.resolve(root, ...relative.split('/'));
  const rootPrefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (!graphRootPath.startsWith(rootPrefix)) throw new Error('图文件夹必须位于当前资料库内');
  return { rootPath: root, graphRootPath, graphRootRelative: relative, isObsidianVault, source };
}

module.exports = {
  DEFAULT_GRAPH_FOLDER_RELATIVE,
  LEGACY_GRAPH_FOLDER_RELATIVE,
  normalizeGraphFolderRelative,
  resolveGraphDirectory,
};
