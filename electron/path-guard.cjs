const path = require('path');

function isPathInside(baseDir, targetPath) {
  const base = path.resolve(baseDir);
  const target = path.resolve(targetPath);
  const relative = path.relative(base, target);
  return relative === '' || (
    relative !== '..' &&
    !relative.startsWith('..' + path.sep) &&
    !path.isAbsolute(relative)
  );
}

function isPathAllowed(allowedDirs, targetPath) {
  return [...allowedDirs].some(dir => isPathInside(dir, targetPath));
}

module.exports = { isPathInside, isPathAllowed };
