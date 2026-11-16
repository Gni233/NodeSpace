interface GroupSearchEntry { id: string; label: string; color?: string; }
export interface GroupSearchTarget {
  groups: readonly GroupSearchEntry[];
  isCurrent: () => boolean;
  canCreate: () => boolean;
  open: (group: GroupSearchEntry) => void;
  create: (label: string) => void;
}

/** Capture the target per query; a pending result cannot follow later pane changes. */
export function setupGroupSearch(input: HTMLInputElement, list: HTMLElement, getTarget: () => GroupSearchTarget) {
  const doc = input.ownerDocument;
  let choices: HTMLButtonElement[] = [], active = -1, composing = false, generation = 0;
  list.id ||= 'nodespace-group-search-results';
  list.setAttribute('role', 'listbox'); list.setAttribute('aria-label', '集合搜索结果');
  input.setAttribute('role', 'combobox'); input.setAttribute('aria-label', '搜索集合');
  input.setAttribute('aria-controls', list.id); input.setAttribute('aria-autocomplete', 'list');
  input.autocomplete = 'off';
  const close = () => {
    list.style.display = 'none'; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant');
  };
  const highlight = (index: number) => {
    active = index;
    choices.forEach((choice, i) => { choice.classList.toggle('is-active', i === active); choice.setAttribute('aria-selected', String(i === active)); });
    if (choices[active]) { input.setAttribute('aria-activedescendant', choices[active].id); choices[active].scrollIntoView({ block: 'nearest' }); }
    else input.removeAttribute('aria-activedescendant');
  };
  const render = () => {
    if (composing) return;
    const query = input.value.trim(), target = getTarget();
    choices = []; active = -1; generation++; list.replaceChildren();
    if (!query) { close(); return; }
    const append = (label: string, action: () => void, color?: string, create = false) => {
      const button = doc.createElement('button'); button.type = 'button'; button.tabIndex = -1;
      button.className = `fg-group-dropdown-item${create ? ' fg-group-dropdown-create' : ''}`;
      button.id = `${list.id}-${generation}-${choices.length}`;
      button.setAttribute('role', 'option'); button.setAttribute('aria-selected', 'false');
      if (color) {
        const dot = doc.createElement('span'); dot.className = 'fg-group-dropdown-dot';
        dot.style.background = color; dot.setAttribute('aria-hidden', 'true'); button.appendChild(dot);
      }
      button.appendChild(doc.createTextNode(label));
      const index = choices.length;
      button.addEventListener('pointerdown', event => event.preventDefault());
      button.addEventListener('pointerenter', () => highlight(index));
      button.addEventListener('click', () => {
        close();
        if (target.isCurrent()) action();
      });
      choices.push(button); list.appendChild(button);
    };
    const matches = target.groups.filter(group => group.label.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
    for (const group of matches) append(group.label, () => {
      if (target.groups.includes(group)) target.open(group);
    }, group.color);
    if (target.canCreate() && !target.groups.some(group => group.label === query)) {
      append(`+ 创建集合“${query}”`, () => { if (target.canCreate() && !target.groups.some(group => group.label === query)) target.create(query); }, undefined, true);
    }
    if (!choices.length) {
      const empty = doc.createElement('p'); empty.className = 'fg-group-dropdown-empty'; empty.textContent = '没有匹配的集合'; list.appendChild(empty);
    }
    list.style.display = 'block'; input.setAttribute('aria-expanded', 'true'); input.removeAttribute('aria-activedescendant');
  };
  const keydown = (event: KeyboardEvent) => {
    if (composing || event.isComposing || event.keyCode === 229) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (list.style.display === 'none') render();
      if (!choices.length) return;
      event.preventDefault();
      highlight(active < 0 ? event.key === 'ArrowDown' ? 0 : choices.length - 1
        : (active + (event.key === 'ArrowDown' ? 1 : -1) + choices.length) % choices.length);
    } else if (event.key === 'Enter' && list.style.display !== 'none' && choices.length) {
      event.preventDefault(); choices[active < 0 ? 0 : active].click();
    } else if (event.key === 'Escape' && list.style.display !== 'none') {
      event.preventDefault(); event.stopPropagation(); close();
    }
  };
  const startComposition = () => { composing = true; close(); };
  const endComposition = () => { composing = false; render(); };
  input.addEventListener('input', render); input.addEventListener('focus', render); input.addEventListener('blur', close);
  input.addEventListener('keydown', keydown);
  input.addEventListener('compositionstart', startComposition); input.addEventListener('compositionend', endComposition);
  close();
  return () => {
    close();
    input.removeEventListener('input', render); input.removeEventListener('focus', render); input.removeEventListener('blur', close);
    input.removeEventListener('keydown', keydown);
    input.removeEventListener('compositionstart', startComposition); input.removeEventListener('compositionend', endComposition);
  };
}
