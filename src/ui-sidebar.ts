export interface SidebarCallbacks {
  onSelectFile: (path: string) => void;
  onNewFile: (path: string) => void;
  onDeleteFile: (path: string) => void;
  onRenameFile: (oldPath: string, newName: string) => void;
  onOpenFolder: () => void;
  onCopyFile?: (path: string) => void;
  onNewFolder?: (path: string) => void;
  onMoveFile?: (srcPath: string, dstDir: string) => void;
  onApplyPreset?: (presetName: string) => void;
  onResetPresets?: () => void;
}

export interface FileTreeItem {
  name: string;
  kind: 'file' | 'directory';
  children: FileTreeItem[];
}

import { safePrompt } from './dialog';
import { confirmAction } from './toast';
import {SIDEBAR_WIDTH, SIDEBAR_COLLAPSED_WIDTH, SIDEBAR_MIN_WIDTH, getResponsiveSidebarWidth, Z_CONTEXT_MENU, V } from "./layout-constants";

// Shared CSS variable references used throughout the sidebar

export function createSidebar(
  parent: HTMLElement,
  callbacks: SidebarCallbacks
) {
  const { onSelectFile, onNewFile, onDeleteFile, onRenameFile, onOpenFolder, onCopyFile, onNewFolder, onMoveFile } = callbacks;

  const sidebar = document.createElement('div');
  // Outer styling (glass background) is set by caller via className; internal layout only
  sidebar.style.cssText = `width:${SIDEBAR_WIDTH}px;min-width:${SIDEBAR_MIN_WIDTH}px;display:flex;flex-direction:column;font-size:${V('--fg-font-md', '0.85em')};height:100%;overflow:hidden;`;

  const header = document.createElement('div');
  header.style.cssText = `display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid ${V('--fg-border-light', 'rgba(255,255,255,0.08)')};`;
  const title = document.createElement('span');
  title.textContent = 'NodeSpace';
  title.style.cssText = `font-weight:700;font-size:${V('--fg-font-lg', '0.92em')};color:${V('--fg-text', '#e0e0e0')};letter-spacing:0.02em;`;
  header.appendChild(title);
  const collapseBtn = document.createElement('button');
  collapseBtn.textContent = '\u2715';
  collapseBtn.title = '折叠侧边栏';
  collapseBtn.style.cssText = `background:none;border:none;color:${V('--fg-text-muted', '#aaa')};cursor:pointer;font-size:${V('--fg-font-lg', '0.92em')};padding:0 4px;transition:color var(--fg-transition-fast,0.15s ease);`;
  header.appendChild(collapseBtn);
  sidebar.appendChild(header);

  const newRow = document.createElement('div');
  newRow.style.cssText = `padding:4px 10px;border-bottom:1px solid ${V('--fg-border-light', 'rgba(255,255,255,0.08)')};`;
  const newFileBtn = document.createElement('button');
  newFileBtn.textContent = '+ 新建';
  newFileBtn.title = '在当前目录下创建新图';
  newFileBtn.style.cssText = `background:none;border:none;color:${V('--fg-text-muted', '#aaa')};cursor:pointer;padding:3px 0;width:100%;text-align:left;transition:color var(--fg-transition-fast,0.15s ease);`;
  newFileBtn.onclick = async () => {
    const name = await safePrompt('输入图名：');
    if (name) onNewFile(name.endsWith('.json') ? name : name + '.json');
  };
  newRow.appendChild(newFileBtn);
  sidebar.appendChild(newRow);

  const fileTree = document.createElement('div');
  fileTree.style.cssText = 'flex:1;overflow-y:auto;padding:4px 0;';
  sidebar.appendChild(fileTree);

  let collapsed = false;
  let currentFile: string | null = null;
  let treeData: FileTreeItem[] = [];
  const openDirs = new Set<string>();

  // 右键菜单工厂
  let activeClosePtr: EventListener | null = null;
  const showMenuAt = (screenX: number, screenY: number, items: { text: string; action: () => void }[]) => {
    const menu = document.createElement('div');
    // position:fixed + 直接计算位置，避免溢出屏幕右/下边缘
    const estW = 140, estH = items.length * 28;
    const left = screenX + estW > window.innerWidth - 8 ? window.innerWidth - estW - 8 : screenX;
    const top = screenY + estH > window.innerHeight - 8 ? window.innerHeight - estH - 8 : screenY;
    menu.style.cssText = `position:fixed;left:${left}px;top:${top}px;z-index:${Z_CONTEXT_MENU};background:${V('--fg-surface', '#3a3a3a')};border:1px solid ${V('--fg-border', '#555')};border-radius:${V('--fg-radius-sm', '6px')};padding:4px 0;min-width:100px;font-size:${V('--fg-font-md', '0.85em')};box-shadow:${V('--fg-shadow-md', '0 4px 16px rgba(0,0,0,0.4)')};color:${V('--fg-text', '#ccc')};`;
    items.forEach(it => {
      const mi = document.createElement('div');
      mi.textContent = it.text;
      mi.style.cssText = `padding:4px 10px;cursor:pointer;transition:background var(--fg-transition-fast,0.15s ease);`;
      mi.onmouseenter = () => mi.style.background = V('--fg-button-hover', '#555');
      mi.onmouseleave = () => mi.style.background = '';
      mi.onclick = () => { it.action(); menu.remove(); cleanup(); };
      menu.appendChild(mi);
    });
    document.body.appendChild(menu);
    if (activeClosePtr) document.removeEventListener('pointerdown', activeClosePtr);
    const close = (ev: Event) => { if (!menu.contains(ev.target as Node)) { menu.remove(); cleanup(); } };
    const cleanup = () => { if (activeClosePtr) document.removeEventListener('pointerdown', activeClosePtr); };
    activeClosePtr = close as EventListener;
    setTimeout(() => { if (activeClosePtr) document.addEventListener('pointerdown', activeClosePtr); }, 200);
  };

  const showMenu = (e: MouseEvent, items: { text: string; action: () => void }[]) => {
    e.preventDefault();
    showMenuAt(e.clientX, e.clientY, items);
  };

  // --- 触屏长按菜单（移动端无右键）---
  let sidebarLongPressTimer: ReturnType<typeof setTimeout> | null = null;
  const clearSidebarLongPress = () => { if (sidebarLongPressTimer) { clearTimeout(sidebarLongPressTimer); sidebarLongPressTimer = null; } };

  function addLongPress(el: HTMLElement, buildItems: () => { text: string; action: () => void }[]) {
    let sx = 0, sy = 0;
    let elTarget: EventTarget | null = null;
    el.addEventListener('touchstart', (e: TouchEvent) => {
      clearSidebarLongPress();
      elTarget = e.target;
      sx = e.touches[0]?.clientX ?? 0; sy = e.touches[0]?.clientY ?? 0;
      sidebarLongPressTimer = setTimeout(() => {
        // 只在触摸的是自身（非子元素冒泡）时弹出菜单
        if (elTarget && el.contains(elTarget as Node)) showMenuAt(sx, sy, buildItems());
      }, 500);
    }, { passive: true });
    el.addEventListener('touchmove', (e: TouchEvent) => {
      const x = e.touches[0]?.clientX ?? 0, y = e.touches[0]?.clientY ?? 0;
      if (Math.hypot(x - sx, y - sy) > 10) clearSidebarLongPress();
    }, { passive: true });
    el.addEventListener('touchend', () => { clearSidebarLongPress(); });
    el.addEventListener('touchcancel', () => { clearSidebarLongPress(); });
  }

  // 拖拽文件到文件夹
  let lastDropTarget: HTMLElement | null = null;

  const renderTree = (items: FileTreeItem[], container: HTMLElement, depth: number, parentPath: string) => {
    items.forEach(item => {
      const fullPath = parentPath ? `${parentPath}/${item.name}` : item.name;
      const indent = depth * 14;

      if (item.kind === 'directory') {
        const dirItem = document.createElement('div');
        dirItem.style.cssText = `display:flex;align-items:center;gap:4px;padding:2px 10px 2px ${10 + indent}px;`;

        const toggle = document.createElement('span');
        const isOpen = openDirs.has(fullPath);
        toggle.textContent = isOpen ? '\u25BE' : '\u25B8';
        toggle.style.cssText = `width:12px;font-size:${V('--fg-font-xs', '0.72em')};cursor:pointer;flex-shrink:0;`;
        toggle.onclick = () => {
          if (openDirs.has(fullPath)) openDirs.delete(fullPath);
          else openDirs.add(fullPath);
          toggle.textContent = openDirs.has(fullPath) ? '\u25BE' : '\u25B8';
          renderChildren();
        };
        dirItem.appendChild(toggle);

        const nameSpan = document.createElement('span');
        nameSpan.textContent = item.name;
        nameSpan.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
        dirItem.appendChild(nameSpan);

        // 右键菜单（文件夹）
        dirItem.oncontextmenu = (e) => {
          showMenu(e, [
            { text: '新建图', action: async () => {
              const name = await safePrompt('图文件名：');
              if (name) onNewFile(fullPath + '/' + (name.endsWith('.json') ? name : name + '.json'));
            }},
            { text: '新建文件夹', action: async () => {
              const name = await safePrompt('文件夹名：');
              if (name) onNewFolder?.(fullPath + '/' + name);
            }},
            { text: '删除文件夹', action: async () => {
              if (await confirmAction(`确定删除文件夹 "${item.name}" 及其内容？`)) onDeleteFile(fullPath);
            }},
          ]);
        };
        // 触屏长按菜单
        addLongPress(dirItem, () => [
          { text: '新建图', action: async () => {
            const name = await safePrompt('图文件名：');
            if (name) onNewFile(fullPath + '/' + (name.endsWith('.json') ? name : name + '.json'));
          }},
          { text: '新建文件夹', action: async () => {
            const name = await safePrompt('文件夹名：');
            if (name) onNewFolder?.(fullPath + '/' + name);
          }},
          { text: '删除文件夹', action: async () => {
            if (await confirmAction(`确定删除文件夹 "${item.name}" 及其内容？`)) onDeleteFile(fullPath);
          }},
        ]);

        // 拖放目标
        dirItem.addEventListener('dragover', (ev) => { ev.preventDefault(); dirItem.style.background = V('--fg-button-hover', '#444'); });
        dirItem.addEventListener('dragleave', () => { dirItem.style.background = ''; });
        dirItem.addEventListener('drop', (ev) => {
          ev.preventDefault(); dirItem.style.background = '';
          const src = (ev.dataTransfer?.getData('text/plain') || '');
          if (src && src !== fullPath) onMoveFile?.(src, fullPath);
        });

        container.appendChild(dirItem);

        const childrenContainer = document.createElement('div');
        childrenContainer.style.cssText = `margin-left:${7 + indent}px;border-left:1px solid ${V('--fg-border-light', 'rgba(255,255,255,0.08)')};`;
        childrenContainer.style.display = 'none';
        container.appendChild(childrenContainer);

        function renderChildren() {
          childrenContainer.innerHTML = '';
          if (openDirs.has(fullPath)) {
            childrenContainer.style.display = '';
            renderTree(item.children, childrenContainer, depth + 1, fullPath);
          } else {
            childrenContainer.style.display = 'none';
          }
        }
        renderChildren();
      } else {
        const fileItem = document.createElement('div');
        fileItem.draggable = true;
        const isActive = fullPath === currentFile;
        fileItem.style.cssText = `display:flex;align-items:center;gap:6px;padding:3px 10px 3px ${10 + 12 + indent - 3}px;cursor:pointer;transition:background var(--fg-transition-fast,0.15s ease);${isActive ? `background:${V('--fg-sidebar-item-active', '#3a3a3a')};color:${V('--fg-text', '#fff')};border-left:3px solid ${V('--fg-accent', '#5B8FF9')};` : ''}`;
        fileItem.onmouseenter = () => { if (!isActive) fileItem.style.background = V('--fg-sidebar-item-hover', '#333'); };
        fileItem.onmouseleave = () => { if (!isActive) fileItem.style.background = ''; };

        fileItem.addEventListener('dragstart', (ev) => {
          ev.dataTransfer?.setData('text/plain', fullPath);
        });

        const dot = document.createElement('span');
        dot.textContent = '\u00B7';
        dot.style.cssText = 'font-size:1.2em;line-height:0;flex-shrink:0;opacity:0.5;';
        fileItem.appendChild(dot);

        const label = document.createElement('span');
        label.textContent = item.name.replace('.json', '');
        label.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
        fileItem.appendChild(label);

        fileItem.onclick = () => {
          currentFile = fullPath;
          updateFileTree(treeData, fullPath);
          onSelectFile(fullPath);
        };

        fileItem.oncontextmenu = (e) => {
          showMenu(e, [
            { text: '重命名', action: async () => {
              const newName = await safePrompt('新文件名：', item.name);
              if (newName && newName !== item.name) onRenameFile(fullPath, newName);
            }},
            { text: '创建副本', action: () => { onCopyFile?.(fullPath); } },
            { text: '删除', action: async () => {
              if (await confirmAction(`确定删除 ${item.name}？`)) onDeleteFile(fullPath);
            }},
          ]);
        };
        // 触屏长按菜单
        addLongPress(fileItem, () => {
          const items: { text: string; action: () => void }[] = [
            { text: '重命名', action: async () => {
              const newName = await safePrompt('新文件名：', item.name);
              if (newName && newName !== item.name) onRenameFile(fullPath, newName);
            }},
            { text: '创建副本', action: () => { onCopyFile?.(fullPath); } },
            { text: '删除', action: async () => {
              if (await confirmAction(`确定删除 ${item.name}？`)) onDeleteFile(fullPath);
            }},
          ];
          // 移动到文件夹选项（收集所有目录）
          if (onMoveFile) {
            const dirs: { name: string; path: string }[] = [];
            const walkDirs = (items2: typeof treeData, prefix: string) => {
              for (const it of items2) {
                if (it.kind === 'directory') {
                  const p = prefix ? `${prefix}/${it.name}` : it.name;
                  dirs.push({ name: it.name, path: p });
                  walkDirs(it.children, p);
                }
              }
            };
            walkDirs(treeData, '');
            for (const d of dirs) {
              items.push({ text: `移动到 ${d.name}`, action: () => onMoveFile(fullPath, d.path) });
            }
          }
          return items;
        });

        container.appendChild(fileItem);
      }
    });
  };

  const updateFileTree = (items: FileTreeItem[], activeFile?: string | null) => {
    treeData = items;
    if (activeFile !== undefined) currentFile = activeFile;
    fileTree.innerHTML = '';
    if (treeData.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = '（无文件）';
      empty.style.cssText = `padding:20px;color:${V('--fg-text-dim', '#666')};text-align:center;`;
      fileTree.appendChild(empty);
    } else {
      renderTree(treeData, fileTree, 0, '');
    }
  };

  // 空白区右键：新建文件夹或图
  fileTree.oncontextmenu = (e) => {
    if ((e.target as HTMLElement) !== fileTree) return;
    showMenu(e, [
      { text: '新建图', action: async () => {
        const name = await safePrompt('输入图文件名：');
        if (name) onNewFile(name.endsWith('.json') ? name : name + '.json');
      }},
      { text: '新建文件夹', action: async () => {
        const name = await safePrompt('文件夹名：');
        if (name) onNewFolder?.(name);
      }},
    ]);
  };
  // 触屏长按（空白区域，仅 fileTree 本身）
  addLongPress(fileTree, () => [
    { text: '新建图', action: async () => {
      const name = await safePrompt('输入图文件名：');
      if (name) onNewFile(name.endsWith('.json') ? name : name + '.json');
    }},
    { text: '新建文件夹', action: async () => {
      const name = await safePrompt('文件夹名：');
      if (name) onNewFolder?.(name);
    }},
  ]);

  collapseBtn.onclick = () => {
    collapsed = !collapsed;
    sidebar.style.transition = 'width 0.25s ease, min-width 0.25s ease';
    if (collapsed) {
      title.style.display = 'none'; newRow.style.display = 'none';
      settingsSection.style.display = 'none';
      requestAnimationFrame(() => {
        sidebar.style.width = `${SIDEBAR_COLLAPSED_WIDTH}px`; sidebar.style.minWidth = `${SIDEBAR_COLLAPSED_WIDTH}px`;
      });
      collapseBtn.textContent = '\u25B8';
    } else {
      sidebar.style.width = `${getResponsiveSidebarWidth()}px`; sidebar.style.minWidth = `${SIDEBAR_MIN_WIDTH}px`;
      collapseBtn.textContent = '\u2715';
      setTimeout(() => {
        title.style.display = ''; newRow.style.display = '';
        settingsSection.style.display = '';
      }, 260);
    }
    window.dispatchEvent(new CustomEvent('sidebar-toggle', { detail: { collapsed } }));
  };

  // --- 设置按钮 ---
  const settingsSection = document.createElement('div');
  settingsSection.style.cssText = `border-top:1px solid ${V('--fg-border-light', 'rgba(255,255,255,0.08)')};margin-top:auto;`;
  const presetHeader = document.createElement('div');
  presetHeader.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:8px 10px;cursor:pointer;';
  presetHeader.innerHTML = `<span style="font-weight:bold;color:${V('--fg-text-muted', '#999')};font-size:${V('--fg-font-sm', '0.8em')};">应用设置</span>`;
  presetHeader.onclick = () => callbacks.onApplyPreset?.('');
  settingsSection.appendChild(presetHeader);

  sidebar.appendChild(settingsSection);
  parent.appendChild(sidebar);
  return { sidebar, updateFileTree, getCurrentFile: () => currentFile,
    syncActiveFile: (name: string) => {
      currentFile = name;
      // 展开嵌套路径的所有父目录
      const parts = name.split('/');
      for (let i = 0; i < parts.length - 1; i++) {
        openDirs.add(parts.slice(0, i + 1).join('/'));
      }
      if (treeData.length > 0) updateFileTree(treeData, name);
    },
  };
}
