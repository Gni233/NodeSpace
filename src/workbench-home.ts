import './workbench-home.css';
import { createWorkbenchGallery, type WorkbenchCoverAnchor, type WorkbenchGalleryEntry } from './workbench-gallery';
import { createWorkbenchFileTree } from './workbench-file-tree';
import { bindContextMenuTrigger } from './context-menu-trigger';
import { closeContextMenu, showContextWheel, type ContextMenuItem } from './ui-contextmenu';

export interface WorkbenchSpace {
  id: string;
  title: string;
  detail?: string;
  example?: boolean;
  kind?: 'library' | 'folder' | 'resource';
}

export interface WorkbenchHomeModel {
  current?: WorkbenchSpace | null;
  spaces?: readonly WorkbenchSpace[];
  location?: { id: string; title: string; parentTitle: string } | null;
  recoveryAvailable?: boolean;
  showAtStartup?: boolean;
}

export type WorkbenchSpaceMenu = (x: number, y: number, trigger: HTMLElement, space: WorkbenchGalleryEntry, open: () => void) => void;
type WheelCommand = { icon: string; item: ContextMenuItem };

export interface WorkbenchHomeActions {
  onContinue(anchor?: WorkbenchCoverAnchor): void;
  onOpen(space: WorkbenchSpace, anchor?: WorkbenchCoverAnchor): void;
  onVisibleSpaces(spaces: readonly WorkbenchSpace[]): void;
  onNewSpace(): void;
  onOpenLibrary(): void;
  onBack?(): void;
  onRenameSpace(space: WorkbenchSpace): void;
  onDuplicateSpace(space: WorkbenchSpace): void;
  onDeleteSpace(space: WorkbenchSpace): void;
  onRestore?(): void;
  onRecord?(): void;
  onShowAtStartupChange?(value: boolean): void;
  onDismiss(): void;
}

export function createWorkbenchHome(actions: WorkbenchHomeActions, windowControls?: HTMLElement) {
  const controlsHost = windowControls?.parentElement;
  const element = document.createElement('dialog');
  element.className = 'ns-home';
  element.setAttribute('aria-label', 'NodeSpace 主界面');
  const menuLayer = document.createElement('div');
  menuLayer.className = 'ns-home-menu-layer';
  let model: WorkbenchHomeModel = {};
  let returnFocus: HTMLElement | null = null;
  let departure: Animation | null = null;
  const openSpace = (space: WorkbenchGalleryEntry, anchor?: WorkbenchCoverAnchor) => {
    if (space.back) actions.onBack?.();
    else if (space.kind !== 'library' && space.kind !== 'folder' && space.id === model.current?.id) actions.onContinue(anchor);
    else actions.onOpen(space, anchor);
  };

  function showWheel(x: number, y: number, trigger: HTMLElement, label: string, commands: WheelCommand[], remaining: ContextMenuItem[] = []) {
    const bounds = menuLayer.getBoundingClientRect();
    const fallback = [...commands.map(({ item }) => item), ...remaining];
    showContextWheel(menuLayer, x - bounds.left, y - bounds.top, commands, remaining, fallback, {
      label, returnFocus: trigger, clearSelection: false,
    });
  }

  const showSpaceMenu: WorkbenchSpaceMenu = (x, y, trigger, space, open) => {
    const commands: WheelCommand[] = [space.back
      ? { icon: 'back', item: { label: space.title, action: open } }
      : { icon: 'open', item: { label: '打开', action: open } }];
    if (!space.example && !space.kind && !space.back) commands.push(
      { icon: 'edit', item: { label: '重命名', action: () => actions.onRenameSpace(space) } },
      { icon: 'duplicate', item: { label: '创建副本', action: () => actions.onDuplicateSpace(space) } },
      { icon: 'delete', item: { label: '删除', action: () => actions.onDeleteSpace(space), destructive: true } },
    );
    showWheel(x, y, trigger, `空间操作 · ${space.title}`, commands);
  };

  const gallery = createWorkbenchGallery(openSpace, actions.onVisibleSpaces, showSpaceMenu);
  const fileTree = createWorkbenchFileTree(openSpace, showSpaceMenu, () => {
    hideFileTree();
    gallery.element.focus({ preventScroll: true });
  });
  const tree = fileTree.element;
  tree.classList.add('ns-home-context-tree');
  tree.querySelector('summary')!.hidden = true;
  const treePanel = tree.querySelector('nav')!;
  treePanel.tabIndex = -1;
  tree.hidden = true;
  gallery.element.classList.add('ns-home-content');
  element.append(gallery.element, tree, menuLayer);

  function hideFileTree() {
    tree.open = false;
    tree.hidden = true;
  }

  function updateFileTree() {
    fileTree.update(model.spaces ?? [], model.current?.id, Boolean(model.location));
  }

  const showFileTree = () => {
    updateFileTree();
    tree.hidden = false;
    tree.open = true;
    treePanel.focus({ preventScroll: true });
  };

  bindContextMenuTrigger(gallery.element, (x, y) => {
    if (model.location) {
      const commands = [
        { icon: 'back', item: { label: `返回${model.location.parentTitle}`, action: () => actions.onBack?.() } },
        { icon: 'context', item: { label: '文件树', action: showFileTree } },
      ];
      showWheel(x, y, gallery.element, '资料库操作', commands);
      return;
    }
    const commands = [
      { icon: 'child', item: { label: '新建空间', action: actions.onNewSpace } },
      { icon: 'context', item: { label: '文件树', action: showFileTree } },
      { icon: 'open', item: { label: '打开资料库', action: actions.onOpenLibrary } },
      { icon: 'back', item: { id: 'return-canvas', label: model.current ? '返回当前空间' : '返回画布', action: actions.onDismiss } },
    ];
    if (actions.onRecord) commands.unshift({ icon: 'edit', item: { label: '记录一个想法', action: actions.onRecord } });
    const remaining: ContextMenuItem[] = [];
    if (actions.onRestore && model.recoveryAvailable) remaining.push({ label: '从备份恢复', action: actions.onRestore });
    if (actions.onShowAtStartupChange) {
      const shown = model.showAtStartup ?? true;
      remaining.push({
        id: 'startup-screen',
        label: shown ? '启动时进入画布' : '启动时显示主界面',
        action: () => {
          model = { ...model, showAtStartup: !shown };
          actions.onShowAtStartupChange?.(!shown);
        },
      });
    }
    showWheel(x, y, gallery.element, '主界面操作', commands, remaining);
  }, { touch: true });
  gallery.element.addEventListener('wheel', closeContextMenu, { passive: true });
  element.addEventListener('pointerdown', event => {
    const target = event.target;
    if (tree.open && target instanceof Element && !tree.contains(target) && !target.closest('[data-menu]')) hideFileTree();
  });
  element.addEventListener('cancel', event => {
    event.preventDefault();
    if (element.querySelector('[data-menu]')) {
      closeContextMenu();
      gallery.element.focus({ preventScroll: true });
    } else if (tree.open) {
      hideFileTree();
      gallery.element.focus({ preventScroll: true });
    } else if (model.location) actions.onBack?.();
    else actions.onDismiss();
  });

  function update(nextModel: WorkbenchHomeModel): void {
    const previousLocation = model.location?.id;
    model = nextModel;
    const spaces = model.spaces ?? [];
    const { location } = model;
    const cards: readonly WorkbenchGalleryEntry[] = location
      ? [{ id: '\0workbench-back', title: `返回${location.parentTitle}`, detail: spaces.length ? undefined : '此文件夹为空', back: true }, ...spaces]
      : spaces;
    gallery.element.setAttribute('aria-label', location ? `浏览${location.title}` : '浏览空间');
    if (gallery.update(cards, model.current?.id, location?.id) && element.open) gallery.refreshCovers();
    if (previousLocation !== location?.id && element.open) {
      closeContextMenu();
      hideFileTree();
      if (!gallery.focusCard(previousLocation)) gallery.element.focus({ preventScroll: true });
    } else if (tree.open) updateFileTree();
  }

  function setVisible(visible: boolean, restorePreviousFocus = true, animateDeparture = false): void {
    if (visible === element.open) return;
    closeContextMenu();
    if (visible) {
      departure?.cancel();
      departure = null;
      element.classList.remove('is-departing');
      element.inert = false;
      returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      if (windowControls) element.prepend(windowControls);
      element.showModal();
      gallery.element.focus({ preventScroll: true });
      gallery.refreshCovers();
    } else {
      hideFileTree();
      if (windowControls && controlsHost) controlsHost.append(windowControls);
      if (animateDeparture) {
        element.classList.add('is-departing');
        element.inert = true;
      }
      element.close();
      if (restorePreviousFocus && returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
      returnFocus = null;
      if (animateDeparture) {
        const animation = element.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: 'ease-out' });
        departure = animation;
        animation.onfinish = () => {
          if (departure !== animation) return;
          departure = null;
          element.classList.remove('is-departing');
          element.inert = false;
        };
      }
    }
  }

  update({});
  return { element, update, setVisible, setCover: gallery.setCover, refreshCovers: gallery.refreshCovers };
}
