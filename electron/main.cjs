const { app, BrowserWindow, dialog, ipcMain, Menu, screen, shell } = require('electron');
const { randomUUID } = require('node:crypto');
const path = require('path');
const fs = require('fs');
const { isPathAllowed, isPathInside } = require('./path-guard.cjs');
const { MEDIA_EXTENSIONS, normalizeRelativePath, scanVault } = require('./vault-service.cjs');
const { createFilePoller } = require('./file-poller.cjs');
const { authorizedGraphRoot, createGraphFile } = require('./graph-create.cjs');

// ---- File watching: 检测外部工具（MCP Server 等）修改的文件 ----
const fileWatchers = new Map(); // dir → FSWatcher
const watchRetries = new Map();
let shuttingDown = false;
let selfWriting = false; // 防止 app 自身写入触发重载
const pendingExternalChanges = new Map(); // fileName -> timeout

function onFileWatcherEvent(filename) {
  if (shuttingDown || !filename) return;
  if (selfWriting) return;
  const normalized = normalizeRelativePath(filename);
  const extension = path.extname(normalized).toLowerCase();
  const isGraph = extension === '.json';
  const isVaultResource = extension === '.md' || MEDIA_EXTENSIONS.has(extension);
  if (!isGraph && !isVaultResource) return;
  if (isVaultResource && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('vault-file-change', normalized);
  }
  if (!isGraph) return;
  const graphName = normalized.replace(/\.json$/i, '');
  // 防抖：500ms 内的重复事件合并
  const existing = pendingExternalChanges.get(graphName);
  if (existing) clearTimeout(existing);
  pendingExternalChanges.set(graphName, setTimeout(() => {
    pendingExternalChanges.delete(graphName);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('file-external-change', graphName);
    }
  }, 500));
}

function watchDir(dirPath) {
  if (shuttingDown || fileWatchers.has(dirPath)) return;
  const retry = () => {
    if (shuttingDown || watchRetries.has(dirPath)) return;
    const timer = setTimeout(() => { watchRetries.delete(dirPath); watchDir(dirPath); }, 5000);
    timer.unref?.();
    watchRetries.set(dirPath, timer);
  };
  try {
    const w = fs.watch(dirPath, { recursive: true }, (_eventType, filename) => {
      onFileWatcherEvent(filename);
    });
    w.on('error', () => {
      fileWatchers.delete(dirPath);
      w.close();
      retry();
    });
    fileWatchers.set(dirPath, w);
  } catch {
    retry();
  }
}

function startFileWatcher() {
  for (const dir of allowedDirs) {
    if (fs.existsSync(dir)) watchDir(dir);
  }
}

// ---- Polling fallback：fs.watch 在 Windows 上可能丢事件，用轮询兜底 ----
const filePoller = createFilePoller({
  getRoots: () => allowedDirs,
  isWriting: () => selfWriting,
  onChange: filename => onFileWatcherEvent(filename),
});
let pollingTimer = null;

// 标记 app 自身正在写入（在 fs-write-file handler 中使用）
ipcMain.handle('fs-begin-write', () => { selfWriting = true; });
ipcMain.handle('fs-end-write', () => { selfWriting = false; });

// 注册允许的目录（渲染进程从 config 中恢复时调用）
ipcMain.handle('fs-add-allowed-dir', async (_, dirPath) => {
  if (dirPath && fs.existsSync(dirPath)) {
    const resolved = path.resolve(dirPath);
    allowedDirs.add(resolved);
    watchDir(resolved); // 启动文件监听
    return { ok: true };
  }
  return { error: 'Directory not found' };
});

// Vite 开发服务器 URL
const DEV_URL = 'http://localhost:5174';
let mainWindow = null;
let windowDrag = null;
let allowWindowClose = false;
let closeRequestPending = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: 'NodeSpace',
    icon: process.platform === 'win32' ? path.join(__dirname, '..', app.isPackaged ? 'dist' : 'public', 'icon.ico') : undefined,
    backgroundColor: '#1e1e22',
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // 开发模式加载 Vite dev server，生产模式加载打包文件
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL(DEV_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  // 无边框窗口 + 主题适配（菜单由 renderer 自行管理）
  Menu.setApplicationMenu(null);

  mainWindow.on('maximize', () => mainWindow?.webContents.send('window-maximize-change', true));
  mainWindow.on('unmaximize', () => mainWindow?.webContents.send('window-maximize-change', false));
  mainWindow.on('close', (event) => {
    if (allowWindowClose) return;
    event.preventDefault();
    if (closeRequestPending) return;
    closeRequestPending = true;
    mainWindow?.webContents.send('app-before-close');
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
    windowDrag = null;
    allowWindowClose = false;
    closeRequestPending = false;
  });
}

// Allowed base directory for file system operations
const BASE_DIR = path.resolve(app.getPath('documents'), 'NodeSpace');
// 用户通过对话框选择的额外目录也在允许列表中
const allowedDirs = new Set([BASE_DIR]);
// Ensure the directory exists
if (!fs.existsSync(BASE_DIR)) fs.mkdirSync(BASE_DIR, { recursive: true });

function isAllowed(filePath) {
  return isPathAllowed(allowedDirs, filePath);
}

// A file chosen for import grants read access to that exact file, never its folder.
const selectedReadableFiles = new Set();
function readableFileKey(filePath) {
  const resolved = fs.realpathSync(filePath);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

// IPC：文件系统操作（完全脱离浏览器沙箱）
ipcMain.handle('fs-read-file', async (_, filePath) => {
  try {
    if (!isAllowed(filePath) && !selectedReadableFiles.has(readableFileKey(filePath))) return { error: 'Access denied' };
    return await fs.promises.readFile(filePath, 'utf-8');
  }
  catch (e) { return { error: e.message }; }
});

ipcMain.handle('fs-write-file', async (_, filePath, content, expectedContent) => {
  let stagedPath;
  let replacing = false;
  try {
    if (!isAllowed(filePath)) return { error: 'Access denied' };
    if (expectedContent !== undefined && typeof expectedContent !== 'string') return { error: 'Invalid expected file contents' };
    const tempPath = `${filePath}.tmp-${process.pid}-${randomUUID()}`;
    const fd = fs.openSync(tempPath, 'wx');
    stagedPath = tempPath;
    try { fs.writeFileSync(fd, content, 'utf-8'); }
    finally { fs.closeSync(fd); }

    if (expectedContent !== undefined) {
      const diskContent = fs.readFileSync(filePath, 'utf-8');
      if (diskContent !== expectedContent) return { conflict: true, content: diskContent };
    }

    replacing = true;
    selfWriting = true;
    fs.renameSync(tempPath, filePath);
    stagedPath = undefined;
    // 记录写入后的 mtime，防止 pollingFallback 误判为自己的修改
    try { filePoller.remember(filePath, fs.statSync(filePath)); } catch {}
    // 延迟清除标记，防止后续 fs.watch 事件误判
    setTimeout(() => { selfWriting = false; }, 300);
    return { ok: true };
  }
  catch (e) {
    if (replacing) selfWriting = false;
    return { error: e.message };
  } finally {
    if (stagedPath) {
      try { fs.unlinkSync(stagedPath); } catch {}
    }
  }
});

ipcMain.handle('fs-create-graph', (_, mountPath, fileName, content) => {
  try {
    const root = authorizedGraphRoot(allowedDirs, mountPath, readAppConfig());
    if (!root) return { error: 'Access denied outside the graph directory' };
    const outcome = createGraphFile([root], mountPath, fileName, content);
    if (outcome === 'created') {
      const filePath = path.join(mountPath, fileName);
      try { filePoller.remember(filePath, fs.statSync(filePath)); } catch {}
    }
    return { outcome };
  } catch (error) {
    return { error: error.message };
  }
});

ipcMain.handle('fs-read-dir', async (_, dirPath) => {
  try {
    if (!isAllowed(dirPath)) return { error: 'Access denied' };
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    return entries.map(e => ({ name: e.name, kind: e.isDirectory() ? 'directory' : 'file' }));
  } catch (e) { return { error: e.message }; }
});

ipcMain.handle('fs-mkdir', async (_, dirPath) => {
  try {
    if (!isAllowed(dirPath)) return { error: 'Access denied' };
    fs.mkdirSync(dirPath, { recursive: true }); return { ok: true };
  }
  catch (e) { return { error: e.message }; }
});

ipcMain.handle('fs-delete', async (_, targetPath, options) => {
  try {
    if (!isAllowed(targetPath)) return { error: 'Access denied' };
    if (options?.recursive === false) fs.unlinkSync(targetPath);
    else fs.rmSync(targetPath, { recursive: true });
    return { ok: true };
  }
  catch (error) {
    return error.code === 'ENOENT' ? { ok: true } : { error: error.message };
  }
});

function renameFileWithoutReplacement(oldPath, newPath) {
  const source = fs.lstatSync(oldPath, { bigint: true });
  if (path.resolve(oldPath) === path.resolve(newPath)) return;
  if (!source.isFile()) throw new Error('Only regular files can be renamed');

  // Publishing with a hard link fails atomically if the new name already exists.
  fs.linkSync(oldPath, newPath);
  const bothNamesMatchSource = () => [oldPath, newPath].every(filePath => {
    const stat = fs.lstatSync(filePath, { bigint: true });
    return stat.dev === source.dev && stat.ino === source.ino;
  });
  try {
    if (!bothNamesMatchSource()) throw new Error('File changed during rename');
    fs.unlinkSync(oldPath);
  } catch (error) {
    // Roll back only if the original is still present and the target is our link.
    try { if (bothNamesMatchSource()) fs.unlinkSync(newPath); }
    catch (cleanupError) {
      if (cleanupError.code !== 'ENOENT') console.warn('[nodespace] Could not undo failed file rename:', cleanupError.message);
    }
    throw error;
  }
}

ipcMain.handle('fs-rename', async (_, oldPath, newPath) => {
  try {
    if (!isAllowed(oldPath) || !isAllowed(newPath)) return { error: 'Access denied' };
    renameFileWithoutReplacement(oldPath, newPath);
    return { ok: true };
  }
  catch (error) {
    return { error: error.code === 'EEXIST' ? 'Destination already exists' : error.message };
  }
});

ipcMain.handle('fs-copy', async (_, src, dst) => {
  try {
    if (!isAllowed(src) || !isAllowed(dst)) return { error: 'Access denied' };
    fs.copyFileSync(src, dst); return { ok: true };
  }
  catch (e) { return { error: e.message }; }
});

ipcMain.handle('fs-exists', async (_, p) => isAllowed(p) && fs.existsSync(p));
ipcMain.handle('fs-stat', async (_, p) => {
  if (typeof p !== 'string' || !path.isAbsolute(p)) return { error: 'Access denied' };
  const candidateRoots = [...allowedDirs].filter(root => isPathInside(root, p));
  if (!candidateRoots.length) return { error: 'Access denied' };
  try {
    const [file, ...roots] = await Promise.all([
      fs.promises.realpath(p),
      ...candidateRoots.map(root => fs.promises.realpath(root).catch(() => null)),
    ]);
    if (!roots.some(root => root && isPathInside(root, file))) return { error: 'Access denied' };
    const stat = await fs.promises.lstat(file);
    if (!stat.isFile() && !stat.isDirectory()) return { error: 'Unsupported file type' };
    return { size: stat.size, mtime: stat.mtimeMs, ctime: stat.ctimeMs, isDir: stat.isDirectory() };
  }
  catch (error) {
    return error.code === 'ENOENT' || error.code === 'ENOTDIR' ? null : { error: 'Unable to inspect file' };
  }
});

ipcMain.handle('vault-scan', async (_, rootPath, graphFolderRelative) => {
  try {
    if (!isAllowed(rootPath)) return { error: 'Access denied' };
    return scanVault(rootPath, graphFolderRelative);
  } catch (e) { return { error: e.message }; }
});

ipcMain.handle('vault-open-in-obsidian', async (_, rootPath, relativePath, heading) => {
  try {
    const root = path.resolve(rootPath);
    const target = path.resolve(root, relativePath);
    if (!isAllowed(root) || !isPathAllowed(new Set([root]), target) || !fs.existsSync(target)) {
      return { error: 'Access denied' };
    }
    const location = heading ? `${target}#${heading}` : target;
    const uri = `obsidian://open?path=${encodeURIComponent(location)}`;
    try {
      await shell.openExternal(uri);
      return { ok: true };
    } catch {
      const error = await shell.openPath(target);
      return error ? { error } : { ok: true, fallback: true };
    }
  } catch (e) { return { error: e.message }; }
});

ipcMain.handle('dialog-open-folder', async () => {
  const r = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
  if (r.canceled) return null;
  const resolved = path.resolve(r.filePaths[0]);
  allowedDirs.add(resolved);
  return r.filePaths[0];
});

ipcMain.handle('dialog-open-file', async () => {
  const r = await dialog.showOpenDialog(mainWindow, { properties: ['openFile'] });
  if (r.canceled || !r.filePaths?.[0]) return null;
  const filePath = r.filePaths[0];
  if (!fs.statSync(filePath).isFile()) return null;
  selectedReadableFiles.add(readableFileKey(filePath));
  return filePath;
});

ipcMain.handle('dialog-save-file', async (_, defaultName) => {
  const r = await dialog.showSaveDialog(mainWindow, { defaultPath: defaultName });
  return r.canceled ? null : r.filePath;
});

// 主题适配：渲染进程通知主进程更新窗口颜色
ipcMain.handle('set-titlebar-color', async (_, bgColor) => {
  if (mainWindow) {
    mainWindow.setBackgroundColor(bgColor);
  }
});

// 窗口控制
ipcMain.on('open-external', (_, url) => {
  try {
    const protocol = new URL(url).protocol;
    if (protocol === 'http:' || protocol === 'https:' || protocol === 'mailto:') shell.openExternal(url);
  } catch {}
});
ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('window-close', () => mainWindow?.close());
ipcMain.on('window-drag', ({ sender }, phase) => {
  const target = mainWindow;
  if (!target || sender !== target.webContents) return;
  if (phase === 'end') {
    windowDrag = null;
    return;
  }
  if (target.isFullScreen()) return;
  if (phase === 'start') {
    const cursor = screen.getCursorScreenPoint();
    const bounds = target.getBounds();
    const fraction = Math.max(0, Math.min(1, (cursor.x - bounds.x) / bounds.width));
    windowDrag = { target, offsetX: cursor.x - bounds.x, offsetY: cursor.y - bounds.y, fraction };
  } else if (phase === 'move' && windowDrag?.target === target) {
    if (target.isMaximized()) {
      windowDrag.offsetX = Math.round(target.getNormalBounds().width * windowDrag.fraction);
      target.unmaximize();
    }
    const cursor = screen.getCursorScreenPoint();
    target.setPosition(cursor.x - windowDrag.offsetX, cursor.y - windowDrag.offsetY);
  }
});
ipcMain.on('window-close-ready', () => {
  if (!mainWindow) return;
  allowWindowClose = true;
  closeRequestPending = false;
  mainWindow.close();
});
ipcMain.on('window-close-cancel', () => {
  closeRequestPending = false;
});
ipcMain.handle('window-is-maximized', () => mainWindow?.isMaximized() ?? false);

// 应用配置持久化（写入 userData 目录，不依赖 localStorage）
function getConfigPath() {
  return path.join(app.getPath('userData'), 'config.json');
}
function readAppConfig() {
  try { return JSON.parse(fs.readFileSync(getConfigPath(), 'utf-8')) || {}; }
  catch { return {}; }
}
ipcMain.handle('config-read', readAppConfig);
ipcMain.handle('config-write', (_, updates) => {
  try {
    const cp = getConfigPath();
    const current = readAppConfig();
    Object.assign(current, updates);
    fs.writeFileSync(cp, JSON.stringify(current, null, 2), 'utf-8');
    return { ok: true };
  } catch (e) { return { error: e.message }; }
});

function restoreConfiguredFolderAccess() {
  try {
    const config = JSON.parse(fs.readFileSync(getConfigPath(), 'utf-8'));
    if (typeof config.folderPath !== 'string' || !config.folderPath) return;
    const resolved = path.resolve(config.folderPath);
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) return;
    allowedDirs.add(resolved);
  } catch {}
}

app.whenReady().then(() => {
  restoreConfiguredFolderAccess();
  createWindow();
  startFileWatcher();
  const poll = () => {
    if (mainWindow && !mainWindow.isDestroyed()) filePoller.poll().catch(error => console.warn('[nodespace] File polling:', error.message));
  };
  poll(); // Establish the baseline immediately while the first window loads.
  pollingTimer = setInterval(poll, 5000);
  pollingTimer.unref?.();
});
app.on('will-quit', () => {
  shuttingDown = true;
  if (pollingTimer) clearInterval(pollingTimer);
  filePoller.stop();
  for (const watcher of fileWatchers.values()) watcher.close();
  fileWatchers.clear();
  for (const timer of watchRetries.values()) clearTimeout(timer);
  watchRetries.clear();
  for (const timer of pendingExternalChanges.values()) clearTimeout(timer);
  pendingExternalChanges.clear();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
