import { resolve, relative, isAbsolute, sep } from 'node:path';

export function resolveInside(baseDir, ...segments) {
  const base = resolve(baseDir);
  const target = resolve(base, ...segments);
  const rel = relative(base, target);
  if (rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) {
    throw new Error('Access denied: path escapes the NodeSpace data directory');
  }
  return target;
}
