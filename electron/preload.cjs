const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // 文件系统
  readFile: (path) => ipcRenderer.invoke('fs-read-file', path),
  writeFile: (path, content) => ipcRenderer.invoke('fs-write-file', path, content),
  readDir: (path) => ipcRenderer.invoke('fs-read-dir', path),
  mkdir: (path) => ipcRenderer.invoke('fs-mkdir', path),
  delete: (path) => ipcRenderer.invoke('fs-delete', path),
  rename: (oldPath, newPath) => ipcRenderer.invoke('fs-rename', oldPath, newPath),
  copy: (src, dst) => ipcRenderer.invoke('fs-copy', src, dst),
  exists: (path) => ipcRenderer.invoke('fs-exists', path),
  stat: (path) => ipcRenderer.invoke('fs-stat', path),

  // 对话框
  openFolder: () => ipcRenderer.invoke('dialog-open-folder'),
  openFile: () => ipcRenderer.invoke('dialog-open-file'),
  saveFile: (name) => ipcRenderer.invoke('dialog-save-file', name),

  // 菜单事件
  onMenuOpenFolder: (fn) => ipcRenderer.on('menu-open-folder', fn),

  // 主题适配
  setTitlebarColor: (bgColor) => ipcRenderer.invoke('set-titlebar-color', bgColor),

  // 窗口控制
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close'),
  confirmClose: () => ipcRenderer.send('window-close-ready'),
  cancelClose: () => ipcRenderer.send('window-close-cancel'),
  onBeforeClose: (fn) => {
    ipcRenderer.on('app-before-close', () => fn());
  },
  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  onMaximizeChange: (fn) => {
    ipcRenderer.on('window-maximize-change', (_, maximized) => fn(maximized));
  },

  // 应用配置
  configRead: () => ipcRenderer.invoke('config-read'),
  configWrite: (updates) => ipcRenderer.invoke('config-write', updates),

  // 外部链接
  openExternal: (url) => ipcRenderer.send('open-external', url),

  // 外部文件变更通知（MCP Server 等外部工具修改了图文件）
  onExternalFileChange: (fn) => {
    ipcRenderer.on('file-external-change', (_, graphName) => fn(graphName));
  },

  // 通知主进程：app 自身即将读写文件（用于文件监听自免触发）
  beginWrite: () => ipcRenderer.invoke('fs-begin-write'),
  endWrite: () => ipcRenderer.invoke('fs-end-write'),

  // 注册用户选择的存储目录到主进程的安全白名单
  addAllowedDir: (dirPath) => ipcRenderer.invoke('fs-add-allowed-dir', dirPath),
});
