const fs = require('node:fs/promises');
const path = require('node:path');
const { MEDIA_EXTENSIONS, normalizeRelativePath } = require('./vault-service.cjs');

const keyFor = value => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
const within = (root, file) => root === file || file.startsWith(root.endsWith(path.sep) ? root : root + path.sep);
const relevant = name => {
  const extension = path.extname(name).toLowerCase();
  return extension === '.json' || extension === '.md' || MEDIA_EXTENSIONS.has(extension);
};

/** Metadata-only fallback for missed watcher events. No file contents are read
 * or written. Each asynchronous scan is shared by overlapping timer ticks. */
function createFilePoller({ getRoots, onChange, isWriting = () => false, io = fs, concurrency = 8 }) {
  const metadata = new Map(), primed = new Set();
  const batchSize = Math.max(1, Math.min(32, Number(concurrency) || 8));
  let running = null, stopped = false;

  const remember = (file, stat) => {
    if (stopped) return;
    metadata.set(keyFor(file), { file: path.resolve(file), mtimeMs: stat.mtimeMs, size: stat.size });
  };

  const scan = async () => {
    const roots = [...new Map([...getRoots()].filter(Boolean).map(value => [keyFor(value), path.resolve(value)])).entries()]
      .sort(([left], [right]) => left.length - right.length)
      .filter(([root], index, all) => !all.slice(0, index).some(([parent]) => within(parent, root)));
    const stats = { files: 0, directories: 0, changes: 0 };
    for (const [rootKey, root] of roots) {
      if (stopped) break;
      const baseline = new Map([...metadata].filter(([key]) => within(rootKey, key)));
      const seen = new Set(), failed = new Set();
      const pending = [root];
      let openedRoot = false;
      const notify = (file, kind) => {
        if (stopped) return;
        stats.changes++;
        onChange(normalizeRelativePath(path.relative(root, file)), root, kind);
      };
      while (pending.length && !stopped) {
        const directory = pending.pop(), directoryKey = keyFor(directory);
        let entries;
        try {
          // A directory may have become a link since its parent was listed.
          if (directory !== root && (await io.lstat(directory)).isSymbolicLink()) { failed.add(directoryKey); continue; }
          entries = await io.readdir(directory, { withFileTypes: true });
        } catch { failed.add(directoryKey); continue; }
        if (stopped) break;
        if (directory === root) openedRoot = true;
        stats.directories++;
        const files = [];
        for (const entry of entries) {
          if (entry.isSymbolicLink()) continue;
          const file = path.join(directory, entry.name);
          if (entry.isDirectory()) {
            if (!entry.name.startsWith('.') && entry.name !== 'node_modules') pending.push(file);
          } else if (entry.isFile() && relevant(entry.name)) files.push(file);
        }
        for (let offset = 0; offset < files.length && !stopped; offset += batchSize) {
          await Promise.all(files.slice(offset, offset + batchSize).map(async file => {
            const key = keyFor(file), before = metadata.get(key);
            let stat;
            try { stat = await io.lstat(file); }
            catch (error) { if (error.code !== 'ENOENT') failed.add(key); return; }
            if (stopped || stat.isSymbolicLink() || !stat.isFile()) return;
            seen.add(key); stats.files++;
            // An app save may finish while the older stat request is in flight.
            if (metadata.get(key) !== before) return;
            const changed = !before || before.mtimeMs !== stat.mtimeMs || before.size !== stat.size;
            if (!changed || primed.has(rootKey) && isWriting()) return;
            remember(file, stat);
            if (primed.has(rootKey)) notify(file, before ? 'modified' : 'created');
          }));
        }
      }
      if (!stopped && openedRoot) {
        if (!isWriting()) for (const [key, before] of baseline) {
          if (seen.has(key) || metadata.get(key) !== before || [...failed].some(directory => within(directory, key))) continue;
          metadata.delete(key);
          if (primed.has(rootKey)) notify(before.file, 'deleted');
        }
        primed.add(rootKey);
      }
    }
    if (!stopped) {
      for (const key of metadata.keys()) if (!roots.some(([root]) => within(root, key))) metadata.delete(key);
      for (const root of primed) if (!roots.some(([key]) => key === root)) primed.delete(root);
    }
    return stats;
  };

  return {
    poll() {
      if (stopped) return Promise.resolve(null);
      if (!running) running = scan().finally(() => { running = null; });
      return running;
    },
    remember,
    stop() { stopped = true; metadata.clear(); primed.clear(); },
  };
}

module.exports = { createFilePoller };
