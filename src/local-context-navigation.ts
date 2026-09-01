import type { LocalContextState } from './local-context';

export interface LocalContextNavigator {
  readonly element: HTMLElement;
  update(state: LocalContextState | null, labelFor: (id: string) => string): void;
  dispose(): void;
}

export interface LocalContextNavigatorCallbacks {
  back(): void;
  close(): void;
  jump(pathIndex: number): void;
}

export function createLocalContextNavigator(
  root: HTMLElement,
  callbacks: LocalContextNavigatorCallbacks,
): LocalContextNavigator {
  const element = document.createElement('nav');
  element.className = 'fg-local-context-nav';
  element.setAttribute('aria-label', '局部空间导航');
  element.hidden = true;
  root.appendChild(element);

  let disposed = false;
  let lastSignature = '';
  const update = (state: LocalContextState | null, labelFor: (id: string) => string) => {
    if (disposed) return;
    if (!state) {
      if (!lastSignature && element.hidden) return;
      lastSignature = '';
      element.hidden = true;
      element.replaceChildren();
      return;
    }
    const labels = state.path.map(id => labelFor(id) || '未命名节点');
    const signature = JSON.stringify([
      state.path,
      labels,
      state.members.length,
      state.omittedCount,
      state.explicitCount,
      state.semanticCount,
      state.crossSpaceLabels,
    ]);
    if (signature === lastSignature && !element.hidden) return;
    lastSignature = signature;
    element.replaceChildren();

    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'fg-local-context-action';
    back.textContent = '‹';
    back.title = state.path.length > 1 ? '退回上一层观察' : '收束局部空间';
    back.setAttribute('aria-label', back.title);
    back.addEventListener('click', callbacks.back);
    element.appendChild(back);

    const mark = document.createElement('span');
    mark.className = 'fg-local-context-mark';
    mark.textContent = state.crossSpaceLabels.length ? '跨空间' : '局部';
    mark.title = state.crossSpaceLabels.length
      ? `临时借入：${state.crossSpaceLabels.join('、')}；不会复制或修改原内容`
      : '只影响当前视图，不会修改节点、线或原文';
    element.appendChild(mark);

    const trail = document.createElement('span');
    trail.className = 'fg-local-context-trail';
    state.path.forEach((id, index) => {
      if (index > 0) {
        const separator = document.createElement('span');
        separator.className = 'fg-local-context-separator';
        separator.textContent = '›';
        separator.setAttribute('aria-hidden', 'true');
        trail.appendChild(separator);
      }
      const label = labels[index];
      if (index === state.path.length - 1) {
        const current = document.createElement('span');
        current.className = 'fg-local-context-current';
        current.textContent = label;
        current.title = label;
        current.setAttribute('aria-current', 'location');
        trail.appendChild(current);
      } else {
        const crumb = document.createElement('button');
        crumb.type = 'button';
        crumb.className = 'fg-local-context-crumb';
        crumb.textContent = label;
        crumb.title = `回到 ${label}`;
        crumb.addEventListener('click', () => callbacks.jump(index));
        trail.appendChild(crumb);
      }
    });
    element.appendChild(trail);

    const summary = document.createElement('span');
    summary.className = 'fg-local-context-summary';
    const shownRelations = Math.max(0, state.members.length - 1);
    summary.textContent = `${shownRelations} 个上下文${state.crossSpaceLabels.length ? ` · 跨 ${state.crossSpaceLabels.length} 个空间` : ''}${state.omittedCount ? ` · 另 ${state.omittedCount} 个已收束` : ''}`;
    summary.title = `${state.explicitCount} 个显式关系 · ${state.semanticCount} 个内容呼应；双击周围卡片可继续展开`;
    element.appendChild(summary);

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'fg-local-context-action is-close';
    close.textContent = '×';
    close.title = '收束局部空间';
    close.setAttribute('aria-label', close.title);
    close.addEventListener('click', callbacks.close);
    element.appendChild(close);
    element.hidden = false;
  };

  return {
    element,
    update,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      element.remove();
    },
  };
}
