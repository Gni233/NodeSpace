const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { isPathInside } = require('./path-guard.cjs');
const { resolveGraphDirectory } = require('./graph-folder.cjs');

function authorizedGraphRoot(allowedDirs, mountPath, config) {
  if (typeof mountPath !== 'string' || !path.isAbsolute(mountPath)) return undefined;
  return [...allowedDirs].find(allowed => {
    const configured = typeof config.folderPath === 'string' && path.relative(allowed, config.folderPath) === '';
    const graphFolder = resolveGraphDirectory(allowed, configured ? config.graphFolderRelative : undefined);
    return path.relative(graphFolder.graphRootPath, mountPath) === '';
  });
}

function entryExists(file) {
  try { fs.lstatSync(file); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

function resolveDestination(allowedDirs, mountPath, fileName) {
  if (typeof mountPath !== 'string' || !path.isAbsolute(mountPath) || typeof fileName !== 'string' || fileName.length > 4096
    || !fileName.endsWith('.json') || /[\\:\x00-\x1f\x7f]/.test(fileName)) throw new Error('Invalid graph path');
  const parts = fileName.split('/');
  if (parts.some(part => !part || part === '.' || part === '..')) throw new Error('Invalid graph path');

  const permitted = [...allowedDirs].filter(root => isPathInside(root, mountPath));
  if (!permitted.length) throw new Error('Access denied');
  const realMount = fs.realpathSync(mountPath);
  if (!permitted.some(root => {
    try {
      const expected = path.resolve(fs.realpathSync(root), path.relative(root, mountPath));
      return path.relative(expected, realMount) === '';
    }
    catch { return false; }
  })) throw new Error('Access denied');

  const leaf = parts.pop();
  const expectedParent = path.join(realMount, ...parts);
  const parent = fs.realpathSync(expectedParent);
  if (path.relative(expectedParent, parent) !== '') throw new Error('Access denied');
  return path.join(parent, leaf);
}

/** Publish only after the complete document is written and closed; link is a no-replace operation. */
function createGraphFile(allowedDirs, mountPath, fileName, content) {
  if (typeof content !== 'string') throw new Error('Invalid graph content');
  const target = resolveDestination(allowedDirs, mountPath, fileName);
  if (entryExists(target)) return 'exists';

  const temporary = path.join(path.dirname(target), `.nodespace-create-${randomUUID()}.tmp`);
  const fd = fs.openSync(temporary, 'wx');
  try {
    try {
      fs.writeFileSync(fd, content, 'utf8');
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    try {
      fs.linkSync(temporary, target);
      return 'created';
    } catch (error) {
      if (error.code === 'EEXIST') return 'exists';
      if (['ENOSYS', 'ENOTSUP', 'EOPNOTSUPP', 'EXDEV'].includes(error.code)) {
        throw new Error('This file system does not support exclusive graph creation');
      }
      throw error;
    }
  } finally {
    try { fs.unlinkSync(temporary); }
    catch (error) { if (error.code !== 'ENOENT') console.warn('[nodespace] Could not remove temporary graph:', error.message); }
  }
}

module.exports = { authorizedGraphRoot, createGraphFile };
