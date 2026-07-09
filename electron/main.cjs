const { app, BrowserWindow, dialog, ipcMain, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// ---- File watching: 检测外部工具（MCP Server 等）修改的文件 ----
const fileWatchers = new Map(); // dir → FSWatcher
let selfWriting = false; // 防止 app 自身写入触发重载
const pendingExternalChanges = new Map(); // fileName -> timeout

function onFileWatcherEvent(filename) {
  if (!filename || !filename.endsWith('.json')) return;
  if (selfWriting) return;
  const graphName = filename.replace(/\.json$/, '');
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
  if (fileWatchers.has(dirPath)) return;
  try {
    const w = fs.watch(dirPath, { recursive: true }, (_eventType, filename) => {
      onFileWatcherEvent(filename);
    });
    w.on('error', () => {
      fileWatchers.delete(dirPath);
      // 5 秒后重试
      setTimeout(() => watchDir(dirPath), 5000);
    });
    fileWatchers.set(dirPath, w);
  } catch {
    setTimeout(() => watchDir(dirPath), 5000);
  }
}

function startFileWatcher() {
  for (const dir of allowedDirs) {
    if (fs.existsSync(dir)) watchDir(dir);
  }
}

// ---- Polling fallback：fs.watch 在 Windows 上可能丢事件，用轮询兜底 ----
const knownMTimes = new Map(); // filePath -> mtimeMs（已知的 mtime，避免把 app 自己的写入当作外部变更）

function pollingFallback() {
  for (const dir of allowedDirs) {
    if (!fs.existsSync(dir)) continue;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (!e.isFile() || !e.name.endsWith('.json')) continue;
      const fp = path.join(dir, e.name);
      try {
        const stat = fs.statSync(fp);
        const known = knownMTimes.get(fp);
        // mtime 变了，且不是我们已知的（app 自己写的），才当作外部变更
        if (known !== undefined && stat.mtimeMs !== known && !selfWriting) {
          knownMTimes.set(fp, stat.mtimeMs);
          onFileWatcherEvent(e.name);
        } else if (known === undefined) {
          knownMTimes.set(fp, stat.mtimeMs);
        }
      } catch { /* 文件可能在读取瞬间被删除，忽略 */ }
    }
  }
}

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

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: 'NodeSpace',
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
}

// Allowed base directory for file system operations
const BASE_DIR = path.resolve(app.getPath('documents'), 'NodeSpace');
// 用户通过对话框选择的额外目录也在允许列表中
const allowedDirs = new Set([BASE_DIR]);
// Ensure the directory exists
if (!fs.existsSync(BASE_DIR)) fs.mkdirSync(BASE_DIR, { recursive: true });

function isAllowed(filePath) {
  const resolved = path.resolve(filePath);
  for (const dir of allowedDirs) {
    if (resolved.startsWith(dir)) return true;
  }
  return false;
}

// IPC：文件系统操作（完全脱离浏览器沙箱）
ipcMain.handle('fs-read-file', async (_, filePath) => {
  try {
    if (!isAllowed(filePath)) return { error: 'Access denied' };
    return fs.readFileSync(filePath, 'utf-8');
  }
  catch (e) { return { error: e.message }; }
});

ipcMain.handle('fs-write-file', async (_, filePath, content) => {
  try {
    if (!isAllowed(filePath)) return { error: 'Access denied' };
    selfWriting = true;
    fs.writeFileSync(filePath, content, 'utf-8');
    // 记录写入后的 mtime，防止 pollingFallback 误判为自己的修改
    try { knownMTimes.set(filePath, fs.statSync(filePath).mtimeMs); } catch {}
    // 延迟清除标记，防止后续 fs.watch 事件误判
    setTimeout(() => { selfWriting = false; }, 300);
    return { ok: true };
  }
  catch (e) { return { error: e.message }; }
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

ipcMain.handle('fs-delete', async (_, targetPath) => {
  try {
    if (!isAllowed(targetPath)) return { error: 'Access denied' };
    fs.rmSync(targetPath, { recursive: true }); return { ok: true };
  }
  catch (e) { return { error: e.message }; }
});

ipcMain.handle('fs-rename', async (_, oldPath, newPath) => {
  try {
    if (!isAllowed(oldPath) || !isAllowed(newPath)) return { error: 'Access denied' };
    fs.renameSync(oldPath, newPath); return { ok: true };
  }
  catch (e) { return { error: e.message }; }
});

ipcMain.handle('fs-copy', async (_, src, dst) => {
  try {
    if (!isAllowed(src) || !isAllowed(dst)) return { error: 'Access denied' };
    fs.copyFileSync(src, dst); return { ok: true };
  }
  catch (e) { return { error: e.message }; }
});

ipcMain.handle('fs-exists', async (_, p) => fs.existsSync(p));
ipcMain.handle('fs-stat', async (_, p) => {
  try { const s = fs.statSync(p); return { size: s.size, mtime: s.mtimeMs, isDir: s.isDirectory() }; }
  catch (e) { return { error: e.message }; }
});

ipcMain.handle('dialog-open-folder', async () => {
  const r = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
  if (r.canceled) return null;
  const resolved = path.resolve(r.filePaths[0]);
  allowedDirs.add(resolved);
  // 确保父目录也在列表中（重命名/复制操作可能涉及）
  allowedDirs.add(path.dirname(resolved));
  return r.filePaths[0];
});

ipcMain.handle('dialog-open-file', async () => {
  const r = await dialog.showOpenDialog(mainWindow, { properties: ['openFile'] });
  if (r.canceled) return null;
  return r.filePaths[0];
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
ipcMain.on('open-external', (_, url) => shell.openExternal(url));
ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('window-close', () => mainWindow?.close());
ipcMain.handle('window-is-maximized', () => mainWindow?.isMaximized() ?? false);

// 应用配置持久化（写入 userData 目录，不依赖 localStorage）
function getConfigPath() {
  return path.join(app.getPath('userData'), 'config.json');
}
ipcMain.handle('config-read', () => {
  try { return JSON.parse(fs.readFileSync(getConfigPath(), 'utf-8')); }
  catch { return {}; }
});
ipcMain.handle('config-write', (_, updates) => {
  try {
    const cp = getConfigPath();
    const current = (() => { try { return JSON.parse(fs.readFileSync(cp, 'utf-8')); } catch { return {}; } })();
    Object.assign(current, updates);
    fs.writeFileSync(cp, JSON.stringify(current, null, 2), 'utf-8');
    return { ok: true };
  } catch (e) { return { error: e.message }; }
});

app.whenReady().then(() => {
  createWindow();
  startFileWatcher();
  setInterval(pollingFallback, 5000);
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
