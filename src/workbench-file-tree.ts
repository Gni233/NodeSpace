import './workbench-file-tree.css';
import { bindContextMenuTrigger } from './context-menu-trigger';
import type { WorkbenchSpace, WorkbenchSpaceMenu } from './workbench-home';

interface Folder {
  name: string;
  key: string;
  folders: Map<string, Folder>;
  spaces: WorkbenchSpace[];
}

const folder = (name: string, key: string): Folder => ({ name, key, folders: new Map(), spaces: [] });
const sortName = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }).compare;

function groupSpaces(spaces: readonly WorkbenchSpace[], directChildren: boolean) {
  const root = folder('', '');
  const examples = folder('示例', '\0examples');
  const ids = new Set<string>();
  for (const space of spaces) {
    if (!space.id || ids.has(space.id)) continue;
    ids.add(space.id);
    if (space.example) {
      examples.spaces.push(space);
      continue;
    }
    const parts = directChildren || space.kind ? [] : space.id.split(/[\\/]/).filter(Boolean);
    parts.pop();
    let parent = root;
    for (const part of parts) {
      let child = parent.folders.get(part);
      if (!child) {
        child = folder(part, `${parent.key}/${part}`);
        parent.folders.set(part, child);
      }
      parent = child;
    }
    parent.spaces.push(space);
  }
  return { root, examples, size: ids.size };
}

export function createWorkbenchFileTree(onOpen: (space: WorkbenchSpace) => void, showSpaceMenu: WorkbenchSpaceMenu, onDismiss?: () => void) {
  const element = document.createElement('details');
  element.className = 'ns-file-tree';
  const summary = document.createElement('summary');
  summary.textContent = '文件树';
  const panel = document.createElement('nav');
  panel.className = 'ns-file-tree-panel';
  panel.setAttribute('aria-label', '空间文件');
  element.append(summary, panel);

  let lastKey: string | undefined;
  let current: string | undefined;
  const folderDetails = new Map<string, HTMLDetailsElement>();
  const controlKeys = new Map<HTMLElement, string>();

  element.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !element.open) return;
    event.preventDefault();
    event.stopPropagation();
    element.open = false;
    if (onDismiss) onDismiss();
    else summary.focus();
  });

  return {
    element,
    update(spaces: readonly WorkbenchSpace[], currentId?: string, directChildren = false): void {
      const key = JSON.stringify([currentId, directChildren, spaces.map(({ id, title, detail, example, kind }) => [id, title, detail, example, kind])]);
      if (lastKey === key) return;
      const revealCurrent = lastKey === undefined || current !== currentId;
      lastKey = key;
      current = currentId;
      const active = document.activeElement;
      const focusedKey = active instanceof HTMLElement ? controlKeys.get(active) : undefined;
      const openPaths = new Set([...folderDetails].filter(([, details]) => details.open).map(([path]) => path));
      folderDetails.clear();
      controlKeys.clear();
      const grouped = groupSpaces(spaces, directChildren);
      const contents = document.createElement('ul');

      const addFolder = (parent: HTMLUListElement, branch: Folder, ancestors: HTMLDetailsElement[]): void => {
        const item = document.createElement('li');
        const details = document.createElement('details');
        const toggle = document.createElement('summary');
        const children = document.createElement('ul');
        toggle.textContent = branch.name;
        toggle.title = branch.name;
        details.open = openPaths.has(branch.key);
        folderDetails.set(branch.key, details);
        controlKeys.set(toggle, `folder:${branch.key}`);
        addChildren(children, branch, [...ancestors, details]);
        details.append(toggle, children);
        item.append(details);
        parent.append(item);
      };

      const addChildren = (parent: HTMLUListElement, branch: Folder, ancestors: HTMLDetailsElement[]): void => {
        for (const child of [...branch.folders.values()].sort((a, b) => sortName(a.name, b.name))) {
          addFolder(parent, child, ancestors);
        }
        for (const space of [...branch.spaces].sort((a, b) => sortName(a.title, b.title) || sortName(a.id, b.id))) {
          const item = document.createElement('li');
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = space.title;
          button.title = space.kind ? space.title : space.id;
          if (space.id === currentId) {
            button.setAttribute('aria-current', 'page');
            if (revealCurrent) for (const ancestor of ancestors) ancestor.open = true;
          }
          const activate = () => onOpen(space);
          button.addEventListener('click', activate);
          bindContextMenuTrigger(button, (x, y) => showSpaceMenu(x, y, button, space, activate), { touch: true });
          controlKeys.set(button, `space:${space.id}`);
          item.append(button);
          parent.append(item);
        }
      };

      addChildren(contents, grouped.root, []);
      if (grouped.examples.spaces.length) addFolder(contents, grouped.examples, []);
      const empty = document.createElement('p');
      empty.textContent = '暂无空间';
      panel.replaceChildren(grouped.size ? contents : empty);
      if (focusedKey !== undefined && element.open) {
        const replacement = [...controlKeys].find(([, id]) => id === focusedKey)?.[0];
        (replacement ?? (summary.hidden ? panel : summary)).focus();
      }
    },
  };
}
