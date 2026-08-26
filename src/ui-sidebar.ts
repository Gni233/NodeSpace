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
  onSelectVaultFolder?: (path: string) => void;
  onSelectVaultResource?: (path: string) => void;
  onReferenceVaultFolder?: (path: string) => void;
  onReferenceVaultResource?: (path: string) => void;
  onOpenVaultResourceInObsidian?: (path: string) => void;
}

export interface FileTreeItem {
  name: string;
  kind: 'file' | 'directory';
  children: FileTreeItem[];
}

import { safePrompt } from './dialog';
import { confirmAction } from './toast';
import {SIDEBAR_WIDTH, SIDEBAR_COLLAPSED_WIDTH, SIDEBAR_MIN_WIDTH, getResponsiveSidebarWidth, Z_CONTEXT_MENU, V } from "./layout-constants";
import type { VaultIndex, VaultResource } from './vault';

// Shared CSS variable references used throughout the sidebar

export function createSidebar(
  parent: HTMLElement,
  callbacks: SidebarCallbacks
) {
  const { onSelectFile, onNewFile, onDeleteFile, onRenameFile, onOpenFolder, onCopyFile, onNewFolder, onMoveFile } = callbacks;

  const sidebar = document.createElement('div');
  sidebar.className = 'fg-sidebar';
  // Outer styling (glass background) is set by caller via className; internal layout only
  sidebar.style.cssText = `width:${SIDEBAR_WIDTH}px;min-width:${SIDEBAR_MIN_WIDTH}px;display:flex;flex-direction:column;font-size:${V('--fg-font-md', '0.85em')};height:100%;overflow:hidden;`;

  const header = document.createElement('div');
  header.className = 'fg-sidebar-header';
  header.style.cssText = `display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid ${V('--fg-border-light', 'rgba(255,255,255,0.08)')};`;
  const identity = document.createElement('div');
  identity.className = 'fg-sidebar-identity';
  const mark = document.createElement('span');
  mark.className = 'fg-sidebar-mark';
  mark.textContent = 'N';
  identity.appendChild(mark);
  const titleGroup = document.createElement('span');
  titleGroup.className = 'fg-sidebar-title-group';
  const title = document.createElement('span');
  title.className = 'fg-sidebar-title';
  title.textContent = 'NodeSpace';
  title.style.cssText = `font-weight:700;font-size:${V('--fg-font-lg', '0.92em')};color:${V('--fg-text', '#e0e0e0')};letter-spacing:0.02em;`;
  const subtitle = document.createElement('span');
  subtitle.className = 'fg-sidebar-subtitle';
  subtitle.textContent = '思绪空间';
  titleGroup.appendChild(title);
  titleGroup.appendChild(subtitle);
  identity.appendChild(titleGroup);
  header.appendChild(identity);
  const collapseBtn = document.createElement('button');
  collapseBtn.className = 'fg-sidebar-collapse';
  collapseBtn.textContent = '☰';
  collapseBtn.title = '折叠侧边栏';
  collapseBtn.setAttribute('aria-label', '折叠侧边栏');
  collapseBtn.style.cssText = `background:none;border:none;color:${V('--fg-text-muted', '#aaa')};cursor:pointer;font-size:${V('--fg-font-lg', '0.92em')};padding:0;transition:color var(--fg-transition-fast,0.15s ease);`;
  header.appendChild(collapseBtn);
  sidebar.appendChild(header);

  const content = document.createElement('div');
  content.className = 'fg-sidebar-content';
  content.style.cssText = 'display:flex;flex:1;flex-direction:column;min-height:0;';
  sidebar.appendChild(content);

  const newRow = document.createElement('div');
  newRow.className = 'fg-sidebar-new-row fg-sidebar-content-section';
  newRow.style.cssText = `padding:4px 10px;border-bottom:1px solid ${V('--fg-border-light', 'rgba(255,255,255,0.08)')};`;
  const newFileBtn = document.createElement('button');
  newFileBtn.className = 'fg-sidebar-new';
  newFileBtn.textContent = '＋ 新建空间';
  newFileBtn.title = '在当前目录下创建新图';
  newFileBtn.style.cssText = `background:none;border:none;color:${V('--fg-text-muted', '#aaa')};cursor:pointer;padding:3px 0;width:100%;text-align:left;transition:color var(--fg-transition-fast,0.15s ease);`;
  newFileBtn.onclick = async () => {
    const name = await safePrompt('新空间名称');
    if (name) onNewFile(name.endsWith('.json') ? name : name + '.json');
  };
  newRow.appendChild(newFileBtn);
  content.appendChild(newRow);

  const vaultSection = document.createElement('section');
  vaultSection.className = 'fg-vault-explorer fg-sidebar-content-section';
  vaultSection.hidden = true;
  content.appendChild(vaultSection);

  const graphHeader = document.createElement('div');
  graphHeader.className = 'fg-sidebar-section-heading fg-sidebar-content-section';
  graphHeader.innerHTML = '<span>空间</span><span class="fg-sidebar-section-count"></span>';
  content.appendChild(graphHeader);

  const fileTree = document.createElement('div');
  fileTree.className = 'fg-file-tree fg-sidebar-content-section';
  fileTree.style.cssText = 'flex:1;overflow-y:auto;padding:4px 0;';
  content.appendChild(fileTree);

  let collapsed = true;
  let currentFile: string | null = null;
  let treeData: FileTreeItem[] = [];
  const openDirs = new Set<string>();
  let vaultData: VaultIndex | null = null;
  let currentVaultPath: string | null = null;
  const openVaultDirs = new Set<string>();
  const openVaultRoots = new Set<string>(['notes']);

  // 右键菜单工厂
  let activeClosePtr: EventListener | null = null;
  const showMenuAt = (screenX: number, screenY: number, items: { text: string; action: () => void }[]) => {
    const menu = document.createElement('div');
    menu.className = 'fg-context-menu fg-sidebar-context-menu';
    // position:fixed + 直接计算位置，避免溢出屏幕右/下边缘
    const estW = 140, estH = items.length * 28;
    const left = screenX + estW > window.innerWidth - 8 ? window.innerWidth - estW - 8 : screenX;
    const top = screenY + estH > window.innerHeight - 8 ? window.innerHeight - estH - 8 : screenY;
    menu.style.cssText = `position:fixed;left:${left}px;top:${top}px;z-index:${Z_CONTEXT_MENU};background:${V('--fg-surface', '#3a3a3a')};border:1px solid ${V('--fg-border', '#555')};border-radius:${V('--fg-radius-sm', '6px')};padding:4px 0;min-width:100px;font-size:${V('--fg-font-md', '0.85em')};box-shadow:${V('--fg-shadow-md', '0 4px 16px rgba(0,0,0,0.4)')};color:${V('--fg-text', '#ccc')};`;
    items.forEach(it => {
      const mi = document.createElement('div');
      mi.className = 'fg-context-menu-item';
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

  interface VaultTreeNode {
    name: string;
    path: string;
    children: VaultTreeNode[];
    resource?: VaultResource;
  }

  const buildVaultTree = (resources: VaultResource[]): VaultTreeNode[] => {
    const root: VaultTreeNode = { name: '', path: '', children: [] };
    for (const resource of resources) {
      const parts = resource.path.split('/').filter(Boolean);
      let parent = root;
      for (let index = 0; index < parts.length; index++) {
        const childPath = parts.slice(0, index + 1).join('/');
        let child = parent.children.find(item => item.name === parts[index]);
        if (!child) {
          child = { name: parts[index], path: childPath, children: [] };
          parent.children.push(child);
        }
        if (index === parts.length - 1) child.resource = resource;
        parent = child;
      }
    }
    const sort = (nodes: VaultTreeNode[]) => {
      nodes.sort((left, right) => {
        const leftDir = left.children.length > 0 && !left.resource;
        const rightDir = right.children.length > 0 && !right.resource;
        return leftDir === rightDir ? left.name.localeCompare(right.name, 'zh-CN') : leftDir ? -1 : 1;
      });
      nodes.forEach(node => sort(node.children));
    };
    sort(root.children);
    return root.children;
  };

  const renderVaultResourceTree = (nodes: VaultTreeNode[], container: HTMLElement, depth: number, rootKey: string) => {
    for (const node of nodes) {
      if (!node.resource && node.children.length > 0) {
        const directoryKey = `${rootKey}:${node.path}`;
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'fg-vault-directory';
        row.style.setProperty('--vault-depth', String(depth));
        const isOpen = openVaultDirs.has(directoryKey);
        row.innerHTML = `<span class="fg-vault-chevron">${isOpen ? '▾' : '▸'}</span><span class="fg-vault-row-label"></span>`;
        (row.querySelector('.fg-vault-row-label') as HTMLElement).textContent = node.name;
        row.onclick = () => {
          if (isOpen) openVaultDirs.delete(directoryKey); else openVaultDirs.add(directoryKey);
          renderVaultExplorer();
        };
        row.ondblclick = event => {
          event.preventDefault();
          event.stopPropagation();
          callbacks.onSelectVaultFolder?.(node.path);
        };
        row.oncontextmenu = event => showMenu(event, [
          { text: '进入文件夹空间', action: () => callbacks.onSelectVaultFolder?.(node.path) },
          { text: '作为引用放入图', action: () => callbacks.onReferenceVaultFolder?.(node.path) },
        ]);
        row.title = `${node.path}\n单击展开 · 双击进入空间`;
        container.appendChild(row);
        if (isOpen) renderVaultResourceTree(node.children, container, depth + 1, rootKey);
        continue;
      }
      if (!node.resource) continue;
      const resource = node.resource;
      const row = document.createElement('button');
      row.type = 'button';
      row.className = `fg-vault-resource${currentVaultPath === resource.path ? ' is-active' : ''}`;
      row.style.setProperty('--vault-depth', String(depth));
      const icon = resource.kind === 'markdown' ? '¶' : resource.kind === 'audio' ? '♪'
        : resource.kind === 'video' ? '▶' : resource.kind === 'pdf' ? '▤' : '▧';
      const label = resource.title || resource.name.replace(/\.[^.]+$/, '');
      const detail = resource.kind === 'markdown' && resource.headingCount
        ? `${resource.headingCount} 节`
        : resource.kind === 'markdown' ? '' : resource.kind.toUpperCase();
      row.innerHTML = '<span class="fg-vault-resource-icon"></span><span class="fg-vault-row-label"></span><span class="fg-vault-resource-detail"></span>';
      (row.querySelector('.fg-vault-resource-icon') as HTMLElement).textContent = icon;
      (row.querySelector('.fg-vault-row-label') as HTMLElement).textContent = label;
      (row.querySelector('.fg-vault-resource-detail') as HTMLElement).textContent = detail;
      row.title = `${resource.path}\n单击：在 NodeSpace 中查看${resource.kind === 'markdown' ? '\n双击：在 Obsidian 中打开' : ''}`;
      row.onclick = () => {
        currentVaultPath = resource.path;
        renderVaultExplorer();
        callbacks.onSelectVaultResource?.(resource.path);
      };
      if (resource.kind === 'markdown') {
        row.ondblclick = event => {
          event.preventDefault();
          callbacks.onOpenVaultResourceInObsidian?.(resource.path);
        };
        row.oncontextmenu = event => showMenu(event, [
          { text: '在 NodeSpace 中查看', action: () => callbacks.onSelectVaultResource?.(resource.path) },
          { text: '作为引用放入图', action: () => callbacks.onReferenceVaultResource?.(resource.path) },
          { text: '在 Obsidian 中打开', action: () => callbacks.onOpenVaultResourceInObsidian?.(resource.path) },
        ]);
      } else {
        row.oncontextmenu = event => showMenu(event, [
          { text: '在 NodeSpace 中查看', action: () => callbacks.onSelectVaultResource?.(resource.path) },
          { text: '作为引用放入图', action: () => callbacks.onReferenceVaultResource?.(resource.path) },
        ]);
      }
      container.appendChild(row);
    }
  };

  function renderVaultExplorer() {
    vaultSection.innerHTML = '';
    if (!vaultData || (vaultData.notes.length === 0 && vaultData.attachments.length === 0)) {
      vaultSection.hidden = true;
      return;
    }
    vaultSection.hidden = false;
    const heading = document.createElement('button');
    heading.type = 'button';
    heading.className = 'fg-sidebar-section-heading fg-vault-heading';
    const sourceLabel = vaultData.isObsidianVault ? 'Obsidian 资料库' : '资料库';
    heading.innerHTML = '<span class="fg-vault-heading-label"></span><span class="fg-sidebar-section-count"></span>';
    (heading.querySelector('.fg-vault-heading-label') as HTMLElement).textContent = sourceLabel;
    (heading.querySelector('.fg-sidebar-section-count') as HTMLElement).textContent = vaultData.name;
    heading.title = `${vaultData.rootPath}\n进入资料库总览`;
    heading.onclick = () => callbacks.onSelectVaultFolder?.('');
    vaultSection.appendChild(heading);

    const roots = [
      { key: 'notes', label: '笔记', count: vaultData.notes.length, resources: vaultData.notes },
      { key: 'media', label: '媒体与 PDF', count: vaultData.attachments.length, resources: vaultData.attachments },
    ].filter(root => root.count > 0);
    for (const root of roots) {
      const rootButton = document.createElement('button');
      rootButton.type = 'button';
      rootButton.className = 'fg-vault-root';
      const isOpen = openVaultRoots.has(root.key);
      rootButton.innerHTML = `<span>${isOpen ? '▾' : '▸'}</span><span class="fg-vault-row-label"></span><span class="fg-sidebar-section-count">${root.count}</span>`;
      (rootButton.querySelector('.fg-vault-row-label') as HTMLElement).textContent = root.label;
      rootButton.onclick = () => {
        if (isOpen) openVaultRoots.delete(root.key); else openVaultRoots.add(root.key);
        renderVaultExplorer();
      };
      vaultSection.appendChild(rootButton);
      if (isOpen) renderVaultResourceTree(buildVaultTree(root.resources), vaultSection, 0, root.key);
    }
  }

  // --- 触屏长按菜单（移动端无右键）---
  let sidebarLongPressTimer: ReturnType<typeof setTimeout> | null = null;
  const clearSidebarLongPress = () => { if (sidebarLongPressTimer) { clearTimeout(sidebarLongPressTimer); sidebarLongPressTimer = null; } };

  function addLongPress(el: HTMLElement, buildItems: () => { text: string; action: () => void }[], stopBubble = false) {
    let sx = 0, sy = 0;
    let elTarget: EventTarget | null = null;
    el.addEventListener('touchstart', (e: TouchEvent) => {
      if (stopBubble) e.stopPropagation();
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
        dirItem.className = 'fg-tree-directory';
        dirItem.style.cssText = `-webkit-app-region:no-drag;display:flex;align-items:center;gap:4px;padding:2px 10px 2px ${10 + indent}px;`;

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
        ], true);

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
        fileItem.className = 'fg-tree-file' + (isActive ? ' is-active' : '');
        fileItem.style.cssText = `-webkit-app-region:no-drag;display:flex;align-items:center;gap:6px;padding:3px 10px 3px ${10 + 12 + indent - 3}px;cursor:pointer;transition:background var(--fg-transition-fast,0.15s ease);${isActive ? `background:${V('--fg-sidebar-item-active', '#3a3a3a')};color:${V('--fg-text', '#fff')};border-left:3px solid ${V('--fg-accent', '#5B8FF9')};` : ''}`;
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
        }, true);

        container.appendChild(fileItem);
      }
    });
  };

  const updateFileTree = (items: FileTreeItem[], activeFile?: string | null) => {
    treeData = items;
    const count = (values: FileTreeItem[]): number => values.reduce((sum, value) => sum + (value.kind === 'file' ? 1 : count(value.children)), 0);
    const countElement = graphHeader.querySelector('.fg-sidebar-section-count') as HTMLElement | null;
    if (countElement) countElement.textContent = String(count(treeData));
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

  const applyCollapsed = () => {
    sidebar.classList.toggle('is-collapsed', collapsed);
    sidebar.style.width = `${collapsed ? SIDEBAR_COLLAPSED_WIDTH : getResponsiveSidebarWidth()}px`;
    sidebar.style.minWidth = `${collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_MIN_WIDTH}px`;
    collapseBtn.setAttribute('aria-expanded', String(!collapsed));
    const stateLabel = collapsed ? '展开侧边栏' : '折叠侧边栏';
    collapseBtn.textContent = collapsed ? 'N' : '‹';
    collapseBtn.title = stateLabel;
    collapseBtn.setAttribute('aria-label', stateLabel);
    window.dispatchEvent(new CustomEvent('sidebar-toggle', { detail: { collapsed } }));
  };

  collapseBtn.onclick = () => {
    collapsed = !collapsed;
    applyCollapsed();
  };

  // --- 设置按钮 ---
  const settingsSection = document.createElement('div');
  settingsSection.className = 'fg-sidebar-settings fg-sidebar-content-section';
  settingsSection.style.cssText = `border-top:1px solid ${V('--fg-border-light', 'rgba(255,255,255,0.08)')};margin-top:auto;`;
  const presetHeader = document.createElement('button');
  presetHeader.type = 'button';
  presetHeader.className = 'fg-sidebar-settings-trigger';
  presetHeader.style.cssText = 'display:flex;align-items:center;justify-content:space-between;width:100%;padding:8px 10px;cursor:pointer;background:transparent;border:0;text-align:left;';
  presetHeader.innerHTML = '<span class="fg-sidebar-settings-icon" aria-hidden="true">⌘</span><span class="fg-sidebar-settings-label">应用与默认值</span>';
  presetHeader.onclick = (event) => {
    event.stopPropagation();
    callbacks.onApplyPreset?.('');
  };
  settingsSection.appendChild(presetHeader);

  content.appendChild(settingsSection);
  parent.appendChild(sidebar);
  // 默认折叠
  applyCollapsed();
  return { sidebar, updateFileTree, getCurrentFile: () => currentFile,
    updateVaultIndex: (index: VaultIndex | null) => { vaultData = index; renderVaultExplorer(); },
    syncActiveVault: (path: string | null) => { currentVaultPath = path; renderVaultExplorer(); },
    syncActiveFile: (name: string) => {
      if (name.startsWith('vault-space:')) {
        currentFile = null;
        currentVaultPath = null;
        renderVaultExplorer();
        if (treeData.length > 0) updateFileTree(treeData, null);
        return;
      }
      if (name.startsWith('vault:')) {
        currentFile = null;
        currentVaultPath = name.slice('vault:'.length).replace(/\\/g, '/');
        renderVaultExplorer();
        if (treeData.length > 0) updateFileTree(treeData, null);
        return;
      }
      currentVaultPath = null;
      renderVaultExplorer();
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
